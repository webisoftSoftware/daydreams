import { z } from "zod";
import type {
  Agent,
  AnyContext,
  Config,
  Debugger,
  Subscription,
  ContextState,
  Episode,
  Registry,
  InputRef,
} from "./types";
import { Logger } from "./logger";
import { createContainer } from "./container";
import { createServiceManager } from "./serviceProvider";
import { TaskRunner } from "./task";
import {
  getContextId,
  createContextState,
  getContextWorkingMemory,
  saveContextWorkingMemory,
  saveContextState,
  saveContextsIndex,
  loadContextState,
  getContexts,
} from "./context";
import { createMemoryStore } from "./memory";
import { createMemory } from "./memory";
import { createVectorStore } from "./memory/base";
import { runGenerate } from "./tasks";
import { exportEpisodesAsTrainingData } from "./memory/utils";
import { LogLevel } from "./types";
import { randomUUIDv7 } from "./utils";
import { createContextStreamHandler, handleStream } from "./streaming";
import { mainStep, promptTemplate } from "./prompts/main";

type RunState = ReturnType<typeof createContextStreamHandler>;

export function createDreams<TContext extends AnyContext = AnyContext>(
  config: Config<TContext>
): Agent<TContext> {
  let booted = false;

  const inputSubscriptions = new Map<string, Subscription>();

  const contextIds = new Set<string>();
  const contexts = new Map<string, ContextState>();
  const contextsRunning = new Map<string, RunState>();

  // todo register everything into registry, remove from agent
  const registry: Registry = {
    contexts: new Map(),
    actions: new Map(),
    outputs: new Map(),
    inputs: new Map(),
    extensions: new Map(),
    models: new Map(),
    prompts: new Map(),
  };

  registry.prompts.set("step", promptTemplate);

  const {
    inputs = {},
    outputs = {},
    events = {},
    actions = [],
    experts = {},
    services = [],
    extensions = [],
    model,
    reasoningModel,
    exportTrainingData,
    trainingDataPath,
  } = config;

  if (config.contexts) {
    for (const ctx of config.contexts) {
      registry.contexts.set(ctx.type, ctx);
    }
  }

  const container = config.container ?? createContainer();

  const taskRunner = config.taskRunner ?? new TaskRunner(3);

  const logger = new Logger({
    level: config.logger ?? LogLevel.INFO,
    enableTimestamp: true,
    enableColors: true,
  });

  container.instance("logger", logger);

  logger.debug("dreams", "Creating agent", {
    hasModel: !!model,
    hasReasoningModel: !!reasoningModel,
    inputsCount: Object.keys(inputs).length,
    outputsCount: Object.keys(outputs).length,
    actionsCount: actions.length,
    servicesCount: services.length,
    extensionsCount: extensions.length,
  });

  const debug: Debugger = (...args) => {
    if (!config.debugger) return;
    try {
      config.debugger(...args);
    } catch {
      console.log("debugger failed");
    }
  };

  const serviceManager = createServiceManager(container);

  for (const service of services) {
    serviceManager.register(service);
  }

  for (const extension of extensions) {
    if (extension.inputs) Object.assign(inputs, extension.inputs);
    if (extension.outputs) Object.assign(outputs, extension.outputs);
    if (extension.events) Object.assign(events, extension.events);
    if (extension.actions) actions.push(...extension.actions);
    if (extension.services) {
      for (const service of extension.services) {
        serviceManager.register(service);
      }
    }

    if (extension.contexts) {
      for (const context of Object.values(extension.contexts)) {
        registry.contexts.set(context.type, context);
      }
    }
  }

  const agent: Agent<TContext> = {
    inputs,
    outputs,
    events,
    actions,
    experts,
    memory:
      config.memory ?? createMemory(createMemoryStore(), createVectorStore()),
    container,
    model,
    reasoningModel,
    taskRunner,
    debugger: debug,
    context: config.context ?? undefined,
    exportTrainingData,
    trainingDataPath,
    registry,
    emit: (event: string, data: any) => {
      logger.debug("agent:event", event, data);
    },

    async getContexts() {
      return getContexts(contextIds, contexts);
    },

    async getContextById<TContext extends AnyContext>(
      id: string
    ): Promise<ContextState<TContext> | null> {
      if (contexts.has(id)) return contexts.get(id)! as ContextState<TContext>;

      const [type] = id.split(":");

      const context = registry.contexts.get(type) as TContext | undefined;

      if (context && contextIds.has(id)) {
        const stateSnapshot = await loadContextState(agent, context, id);

        if (stateSnapshot) {
          const state = await createContextState({
            agent,
            context,
            args: stateSnapshot.args,
            settings: stateSnapshot.settings,
            contexts: stateSnapshot.contexts,
          });

          await this.saveContext(state);

          return state;
        }
      }

      return null;
    },

    async getContext(params) {
      if (!registry.contexts.has(params.context.type))
        registry.contexts.set(params.context.type, params.context);

      const ctxSchema =
        "parse" in params.context.schema
          ? params.context.schema
          : z.object(params.context.schema);

      const args = ctxSchema.parse(params.args);
      const id = getContextId(params.context, args);

      if (!contexts.has(id) && contextIds.has(id)) {
        const stateSnapshot = await loadContextState(agent, params.context, id);

        if (stateSnapshot) {
          await this.saveContext(
            await createContextState({
              agent,
              context: params.context,
              args: params.args,
              settings: stateSnapshot.settings,
              contexts: stateSnapshot.contexts,
            })
          );
        }
      }

      if (!contexts.has(id)) {
        await this.saveContext(
          await createContextState({
            agent,
            context: params.context,
            args: params.args,
          })
        );
      }

      return contexts.get(id)! as ContextState<typeof params.context>;
    },

    async saveContext(ctxState, workingMemory) {
      contextIds.add(ctxState.id);
      contexts.set(ctxState.id, ctxState);

      await saveContextState(agent, ctxState);

      if (workingMemory) {
        await saveContextWorkingMemory(agent, ctxState.id, workingMemory);
      }

      await saveContextsIndex(agent, contextIds);

      return true;
    },

    getContextId(params) {
      logger.trace("agent:getContextId", "Getting context id", params);
      return getContextId(params.context, params.args);
    },

    async getWorkingMemory(contextId) {
      logger.trace("agent:getWorkingMemory", "Getting working memory", {
        contextId,
      });
      return getContextWorkingMemory(agent, contextId);
    },

    async start(args) {
      logger.info("agent:start", "Starting agent", { args, booted });
      if (booted) return agent;

      booted = true;

      logger.debug("agent:start", "Booting services");
      await serviceManager.bootAll();

      logger.debug("agent:start", "Installing extensions", {
        count: extensions.length,
      });

      for (const extension of extensions) {
        if (extension.install) await extension.install(agent);
      }

      logger.debug("agent:start", "Setting up inputs", {
        count: Object.keys(agent.inputs).length,
      });

      for (const [type, input] of Object.entries(agent.inputs)) {
        if (input.install) {
          logger.trace("agent:start", "Installing input", { type });
          await Promise.resolve(input.install(agent));
        }

        if (input.subscribe) {
          logger.trace("agent:start", "Subscribing to input", { type });
          let subscription = input.subscribe((context, args, data) => {
            logger.debug("agent", "input", { context, args, data });
            agent
              .send({
                context,
                input: { type, data },
                args,
              })
              .catch((err) => {
                logger.error("agent:input", "error", err);
              });
          }, agent);

          if (typeof subscription === "object") {
            subscription = await Promise.resolve(subscription);
          }

          if (subscription) inputSubscriptions.set(type, subscription);
        }
      }

      logger.debug("agent:start", "Setting up outputs", {
        count: Object.keys(outputs).length,
      });

      for (const [type, output] of Object.entries(outputs)) {
        if (output.install) {
          logger.trace("agent:start", "Installing output", { type });
          await Promise.resolve(output.install(agent));
        }
      }

      logger.debug("agent:start", "Setting up actions", {
        count: actions.length,
      });

      for (const action of actions) {
        if (action.install) {
          logger.trace("agent:start", "Installing action", {
            name: action.name,
          });
          await Promise.resolve(action.install(agent));
        }
      }

      logger.debug("agent:start", "Loading saved contexts");
      const savedContexts = await agent.memory.store.get<string[]>("contexts");

      if (savedContexts) {
        logger.trace("agent:start", "Restoring saved contexts", {
          count: savedContexts.length,
        });

        for (const id of savedContexts) {
          contextIds.add(id);
        }
      }

      if (agent.context) {
        logger.debug("agent:start", "Setting up agent context", {
          type: agent.context.type,
        });

        const agentState = await agent.getContext({
          context: agent.context,
          args: args!,
        });

        contexts.set("agent:context", agentState);
      }

      logger.info("agent:start", "Agent started successfully");
      return agent;
    },

    async stop() {
      logger.info("agent:stop", "Stopping agent");
    },

    async run(params) {
      const { context, args, outputs, handlers, abortSignal } = params;
      if (!booted) {
        logger.error("agent:run", "Agent not booted");
        throw new Error("Not booted");
      }

      logger.info("agent:run", "Running context", {
        contextType: context.type,
        hasArgs: !!args,
        hasCustomOutputs: !!outputs,
        hasHandlers: !!handlers,
      });

      const ctxId = agent.getContextId({ context, args });

      // try to move this to state
      // we need this here now because its needed to create the handler
      // and we will use that state from contextsRunning so we need to wait before checking and creating
      const ctxState = await agent.getContext({ context, args });
      const workingMemory = await getContextWorkingMemory(agent, ctxId);
      const agentCtxState = agent.context
        ? await agent.getContext({
            context: agent.context,
            args: contexts.get("agent:context")!.args,
          })
        : undefined;

      // todo: allow to control what happens when new input is sent while the ctx is running
      // context.onInput?
      // we should allow to abort the current run, or just push it to current run
      if (contextsRunning.has(ctxId)) {
        logger.debug("agent:run", "Context already running", {
          id: ctxId,
        });

        const { push } = contextsRunning.get(ctxId)!;
        params.chain?.forEach((el) => push(el, true));

        // we need to create a defer promise
        return [];
      }

      logger.debug("agent:run", "Added context to running set", {
        id: ctxId,
      });

      const { state, handler, push, tags, stepConfig } =
        createContextStreamHandler({
          agent,
          agentCtxState,
          ctxState,
          handlers,
          logger,
          taskRunner,
          workingMemory,
          abortSignal,
          stepConfig: mainStep,
        });

      contextsRunning.set(ctxId, { state, handler, push, tags, stepConfig });

      let maxSteps = 0;

      function getMaxSteps() {
        return ctxState.settings.maxSteps ?? 5;
      }

      let stepRef = await state.start({
        actions: params.actions,
        outputs: params.outputs,
        contexts: params.contexts,
      });

      if (params.chain) {
        await Promise.all(params.chain.map((log) => push(log, true)));
      }

      if (state.calls.length > 0) {
        await Promise.allSettled(state.calls);
        state.calls.length = 0;
      }

      const model =
        params.model ?? context.model ?? config.reasoningModel ?? config.model;

      while ((maxSteps = getMaxSteps()) >= state.step) {
        logger.info("agent:run", `Starting step ${state.step}/${maxSteps}`, {
          contextId: ctxState.id,
        });

        try {
          if (state.step > 1) {
            stepRef = await state.startNewStep();
          }

          const promptData = stepConfig.formatter({
            contexts: state.contexts,
            actions: state.actions,
            outputs: state.outputs,
            workingMemory,
            chainOfThoughtSize: 0,
            maxWorkingMemorySize: ctxState.settings.maxWorkingMemorySize,
          });

          const prompt = stepConfig.render(promptData);

          stepRef.data.prompt = prompt;

          let streamError: any = null;

          const unprocessed = [
            ...workingMemory.inputs.filter((i) => i.processed === false),
            ...state.chain.filter((i) => i.processed === false),
          ];

          const { stream, getTextResponse } = await taskRunner.enqueueTask(
            runGenerate,
            {
              model,
              prompt,
              workingMemory,
              logger,
              abortSignal,
              onError: (error) => {
                streamError = error;
                state.errors.push(error);
              },
            },
            {
              debug: agent.debugger,
              abortSignal,
            }
          );

          logger.debug("agent:run", "Processing stream", { step: state.step });

          await handleStream(stream, state.index, tags, handler, {});

          const response = await getTextResponse();
          stepRef.data.response = response;

          if (streamError) {
            throw streamError;
          }

          unprocessed.forEach((i) => {
            i.processed = true;
          });

          await saveContextWorkingMemory(agent, ctxState.id, workingMemory);

          logger.debug("agent:run", "Waiting for action calls to complete", {
            pendingCalls: state.calls.length,
          });

          await Promise.allSettled(state.calls);

          state.calls.length = 0;

          stepRef.processed = true;

          await saveContextWorkingMemory(agent, ctxState.id, workingMemory);

          await Promise.all(
            state.contexts.map((state) =>
              state.context.onStep?.(
                {
                  ...state,
                  workingMemory,
                },
                agent
              )
            )
          );

          await Promise.all(
            state.contexts.map((state) => agent.saveContext(state))
          );

          if (abortSignal?.aborted) break;

          if (!state.shouldContinue()) break;

          state.step++;
        } catch (error) {
          console.error(error);

          await Promise.allSettled(
            state.contexts.map((state) => agent.saveContext(state))
          );

          if (context.onError) {
            try {
              await context.onError(
                error,
                {
                  ...ctxState,
                  workingMemory,
                },
                agent
              );
            } catch (error) {
              break;
            }
          } else {
            break;
          }
        }
      }

      logger.debug(
        "agent:run",
        "Marking all working memory chain as processed"
      );

      workingMemory.inputs.forEach((i) => {
        i.processed = true;
      });

      state.chain.forEach((i) => {
        i.processed = true;
      });

      await Promise.all(
        state.contexts.map((state) =>
          state.context.onRun?.(
            {
              ...state,
              workingMemory,
            },
            agent
          )
        )
      );

      await Promise.all(
        state.contexts.map((state) => agent.saveContext(state))
      );

      logger.debug("agent:run", "Removing context from running set", {
        id: ctxState.id,
      });

      contextsRunning.delete(ctxState.id);

      logger.info("agent:run", "Run completed", {
        contextId: ctxState.id,
        chainLength: state.chain.length,
      });

      return state.chain;
    },

    async send(params) {
      const inputRef: InputRef = {
        id: randomUUIDv7(),
        ref: "input",
        type: params.input.type,
        content: params.input.data,
        data: undefined,
        timestamp: Date.now(),
        processed: false,
      };

      return await agent.run({
        ...params,
        chain: params.chain ? [...params.chain, inputRef] : [inputRef],
      });
    },

    async evaluator(ctx) {
      const { id, memory } = ctx;
      logger.debug("agent:evaluator", "memory", memory);
    },

    /**
     * Exports all episodes as training data
     * @param filePath Optional path to save the training data
     */
    async exportAllTrainingData(filePath?: string) {
      logger.info(
        "agent:exportTrainingData",
        "Exporting episodes as training data"
      );

      // Get all contexts
      const contexts = await agent.getContexts();

      // Collect all episodes from all contexts
      const allEpisodes: Episode[] = [];

      for (const { id } of contexts) {
        const episodes = await agent.memory.vector.query(id, "");
        if (episodes.length > 0) {
          allEpisodes.push(...episodes);
        }
      }

      logger.info(
        "agent:exportTrainingData",
        `Found ${allEpisodes.length} episodes to export`
      );

      // Export episodes as training data
      if (allEpisodes.length > 0) {
        await exportEpisodesAsTrainingData(
          allEpisodes,
          filePath || config.trainingDataPath || "./training-data.jsonl"
        );
        logger.info(
          "agent:exportTrainingData",
          "Episodes exported successfully"
        );
      } else {
        logger.warn("agent:exportTrainingData", "No episodes found to export");
      }
    },
  };

  container.instance("agent", agent);

  return agent;
}
