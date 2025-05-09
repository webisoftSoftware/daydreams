import {
  action,
  type ActionCall,
  type Agent,
  context,
  createDreams,
  extension,
  render,
  validateEnv,
  LogLevel,
} from "@daydreamsai/core";
import { cliExtension } from "@daydreamsai/cli";
import { anthropic } from "@ai-sdk/anthropic";
import { string, z } from "zod";
import { StarknetChain } from "@daydreamsai/defai";

/**
 * NOTE: To resolve the '@daydreamsai/defai' module error:
 * 1. First make sure you have the package installed by running:
 *    pnpm add @daydreamsai/defai
 *
 * 2. If developing within the monorepo, you may need to add it to your workspace:
 *    In package.json, add:
 *    "dependencies": {
 *      "@daydreamsai/defai": "workspace:*"
 *    }
 */

// Validate environment variables
const env = validateEnv(
  z.object({
    ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
    STARKNET_RPC_URL: z.string().min(1, "STARKNET_RPC_URL is required"),
    STARKNET_ADDRESS: z.string().min(1, "STARKNET_ADDRESS is required"),
    STARKNET_PRIVATE_KEY: z.string().min(1, "STARKNET_PRIVATE_KEY is required"),
  })
);

// Initialize Starknet chain connection
const starknet = new StarknetChain({
  rpcUrl: env.STARKNET_RPC_URL,
  address: env.STARKNET_ADDRESS,
  privateKey: env.STARKNET_PRIVATE_KEY,
});

// Game contract addresses
const GAME_CONTRACT_ADDRESS =
  "0x018108b32cea514a78ef1b0e4a0753e855cdf620bc0565202c02456f618c4dc4"; // Loot Survivor contract address

// Define an interface for the Loot Survivor state
interface LootSurvivorState {
  // Game state
  adventurerId: string;
  adventurerHealth: string;
  adventurerMaxHealth: string;
  level: string;
  xp: string;
  gold: string;
  statUpgrades: string;

  // Battle state
  inBattle: string;
  lastAction: string;
  lastDamageDealt: string;
  lastDamageTaken: string;
  lastCritical: string;
  battleActionCount: string;

  // Stats
  strength: string;
  dexterity: string;
  vitality: string;
  intelligence: string;
  wisdom: string;
  charisma: string;
  luck: string;

  // Equipment
  weapon: string;
  chest: string;
  head: string;
  waist: string;
  foot: string;
  hand: string;
  neck: string;
  ring: string;

  // Equipment XP (greatness levels)
  weaponXP: string;
  chestXP: string;
  headXP: string;
  waistXP: string;
  footXP: string;
  handXP: string;
  neckXP: string;
  ringXP: string;

  // Beast info
  currentBeast: string;
  beastHealth: string;
  beastMaxHealth: string;
  beastLevel: string;
  beastTier: string;
  beastType: string;
  beastSpecial1: string;
  beastSpecial2: string;
  beastSpecial3: string;

  // Bag/Inventory
  bagItems: string[];

  // Market
  marketItems: Array<{ id: string; name: string; price: string }>;
}

// Helper to convert hex values to decimal
function hexToDec(hex: string): string {
  // Remove '0x' prefix if present
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  return parseInt(cleanHex, 16).toString();
}

// Function to get prefix1 name from ID
function getPrefix1(prefixId: string): string {
  const prefixNames: { [key: string]: string } = {
    "1": "Agony",
    "2": "Apocalypse",
    "3": "Armageddon",
    "4": "Beast",
    "5": "Behemoth",
    "6": "Blight",
    "7": "Blood",
    "8": "Bramble",
    "9": "Brimstone",
    "10": "Brood",
    "11": "Carrion",
    "12": "Cataclysm",
    "13": "Chimeric",
    "14": "Corpse",
    "15": "Corruption",
    "16": "Damnation",
    "17": "Death",
    "18": "Demon",
    "19": "Dire",
    "20": "Dragon",
    "21": "Dread",
    "22": "Doom",
    "23": "Dusk",
    "24": "Eagle",
    "25": "Empyrean",
    "26": "Fate",
    "27": "Foe",
    "28": "Gale",
    "29": "Ghoul",
    "30": "Gloom",
    "31": "Glyph",
    "32": "Golem",
    "33": "Grim",
    "34": "Hate",
    "35": "Havoc",
    "36": "Honour",
    "37": "Horror",
    "38": "Hypnotic",
    "39": "Kraken",
    "40": "Loath",
    "41": "Maelstrom",
    "42": "Mind",
    "43": "Miracle",
    "44": "Morbid",
    "45": "Oblivion",
    "46": "Onslaught",
    "47": "Pain",
    "48": "Pandemonium",
    "49": "Phoenix",
    "50": "Plague",
    "51": "Rage",
    "52": "Rapture",
    "53": "Rune",
    "54": "Skull",
    "55": "Sol",
    "56": "Soul",
    "57": "Sorrow",
    "58": "Spirit",
    "59": "Storm",
    "60": "Tempest",
    "61": "Torment",
    "62": "Vengeance",
    "63": "Victory",
    "64": "Viper",
    "65": "Vortex",
    "66": "Woe",
    "67": "Wrath",
    "68": "Lights",
    "69": "Shimmering",
  };
  return prefixNames[prefixId] || "";
}

// Function to get prefix2 name from ID
function getPrefix2(suffixId: string): string {
  const suffixNames: { [key: string]: string } = {
    "1": "Bane",
    "2": "Root",
    "3": "Bite",
    "4": "Song",
    "5": "Roar",
    "6": "Grasp",
    "7": "Instrument",
    "8": "Glow",
    "9": "Bender",
    "10": "Shadow",
    "11": "Whisper",
    "12": "Shout",
    "13": "Growl",
    "14": "Tear",
    "15": "Peak",
    "16": "Form",
    "17": "Sun",
    "18": "Moon",
  };
  return suffixNames[suffixId] || "";
}

// Function to get suffix name from ID
function getItemSuffix(suffixId: string): string {
  const itemSuffixes: { [key: string]: string } = {
    "1": "of Power",
    "2": "of Giant",
    "3": "of Titans",
    "4": "of Skill",
    "5": "of Perfection",
    "6": "of Brilliance",
    "7": "of Enlightenment",
    "8": "of Protection",
    "9": "of Anger",
    "10": "of Rage",
    "11": "of Fury",
    "12": "of Vitriol",
    "13": "of the Fox",
    "14": "of Detection",
    "15": "of Reflection",
    "16": "of the Twins",
  };
  return itemSuffixes[suffixId] || "";
}

// Function to get item tier from ID
function getItemTier(itemId: number): string {
  // Tier mapping according to loot.cairo and constants.cairo
  // The itemId directly corresponds to the item tiers defined in the contract

  // Item types by tier
  const tierRanges: { [key: string]: number[] } = {
    T1: [
      // Jewelry
      1, 2, 3, 6, 7, 8,
      // Weapons and armor - Per itemId in constants.cairo
      9, 13, 17, 22, 27, 32, 37, 42, 47, 52, 57, 62, 67, 72, 77, 82, 87, 92, 97,
    ],
    T2: [
      // Jewelry
      4,
      // Weapons and armor
      10, 14, 18, 23, 28, 33, 38, 43, 48, 53, 58, 63, 68, 73, 78, 83, 88, 93,
      98,
    ],
    T3: [
      // Jewelry
      5,
      // Weapons and armor
      11, 15, 19, 24, 29, 34, 39, 44, 49, 54, 59, 64, 69, 74, 79, 84, 89, 94,
      99,
    ],
    T4: [
      // Higher tier items
      20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
    ],
    T5: [
      // Lowest tier items
      12, 16, 21, 26, 31, 36, 41, 46, 51, 56, 61, 66, 71, 76, 81, 86, 91, 96,
      101,
    ],
  };

  // Check each tier
  for (const [tier, ids] of Object.entries(tierRanges)) {
    if (ids.includes(itemId)) {
      return tier;
    }
  }

  // Default if not found
  console.log(`[WARNING] Could not determine tier for item ID: ${itemId}`);
  return "Unknown";
}

// Function to get price based on tier and charisma
function getItemPrice(tier: string, charisma: number = 0): number {
  // Formula: 4 * (6 - tier_number) - charisma
  // With a minimum price of 1 gold
  const TIER_PRICE = 4; // Base multiplier
  const MIN_PRICE = 1; // Minimum item price

  let tierNumber = 0;
  switch (tier) {
    case "T1":
      tierNumber = 1;
      break;
    case "T2":
      tierNumber = 2;
      break;
    case "T3":
      tierNumber = 3;
      break;
    case "T4":
      tierNumber = 4;
      break;
    case "T5":
      tierNumber = 5;
      break;
    default:
      tierNumber = 0;
      break;
  }

  // Calculate price using the formula and apply minimum price
  const price = Math.max(TIER_PRICE * (6 - tierNumber) - charisma, MIN_PRICE);
  return price;
}

// Function to get potion price based on level and charisma
function getPotionPrice(level: number, charisma: number = 0): number {
  // Formula: level - (2 * charisma)
  // With a minimum price of 1 gold
  const MIN_PRICE = 1;
  const CHARISMA_DISCOUNT = 2;

  const price = Math.max(level - CHARISMA_DISCOUNT * charisma, MIN_PRICE);
  return price;
}

/**
 * Game constants for item greatness levels
 */
const SUFFIX_UNLOCK_GREATNESS = 15;
const PREFIXES_UNLOCK_GREATNESS = 19;

/**
 * Calculates item greatness level from XP value
 * Uses the same formula as adventurer level: sqrt(xp)
 * @param xp - The item's XP value
 */
function calculateGreatness(xp: number): number {
  return Math.floor(Math.sqrt(xp));
}

/**
 * Determines if an item has enough greatness to get a suffix
 * @param greatness - The item's greatness level
 */
function canHaveSuffix(greatness: number): boolean {
  return greatness >= SUFFIX_UNLOCK_GREATNESS;
}

/**
 * Determines if an item has enough greatness to get prefixes
 * @param greatness - The item's greatness level
 */
function canHavePrefixes(greatness: number): boolean {
  return greatness >= PREFIXES_UNLOCK_GREATNESS;
}

// Function to get item type from ID
function getItemType(itemId: number): string {
  // Based on ItemUtils in utils.cairo
  // Necklace: items 1-3 (Pendant, Necklace, Amulet)
  if (itemId >= 1 && itemId <= 3) {
    return "Necklace";
  }
  // Ring: items 4-8 (Silver Ring, Bronze Ring, Platinum Ring, Titanium Ring, Gold Ring)
  else if (itemId >= 4 && itemId <= 8) {
    return "Ring";
  }
  // Magic/Cloth: items 9-41
  // Ghost Wand through Gloves
  else if (itemId >= 9 && itemId <= 41) {
    return "Magic/Cloth";
  }
  // Blade/Hide: items 42-71
  // Katana through Leather Gloves
  else if (itemId >= 42 && itemId <= 71) {
    return "Blade/Hide";
  }
  // Bludgeon/Metal: items 72-101
  // Warhammer through Heavy Gloves
  else if (itemId >= 72 && itemId <= 101) {
    return "Bludgeon/Metal";
  }
  return "Unknown";
}

/**
 * Gets a formatted item name with special properties based on its greatness level
 * @param itemId - The base item ID
 * @param xp - The item's XP value
 * @param special1 - The item's suffix ID (e.g., "of Power")
 * @param special2 - The item's prefix1 ID (e.g., "Agony")
 * @param special3 - The item's prefix2 ID (e.g., "Bane")
 */
function getFullItemName(
  itemId: number,
  xp: number,
  special1?: string,
  special2?: string,
  special3?: string
): string {
  // Get the base item name
  const baseName = ITEM_NAMES[itemId - 1] || `Unknown (${itemId})`;

  // Get the item type
  const itemType = getItemType(itemId);

  // Calculate greatness level from XP
  const greatness = calculateGreatness(xp);

  // Start with the base name
  let fullName = baseName;

  // Add suffix if greatness is high enough
  if (canHaveSuffix(greatness) && special1 && parseInt(special1) > 0) {
    fullName += " " + getItemSuffix(special1);
  }

  // Add prefixes if greatness is high enough
  if (canHavePrefixes(greatness)) {
    // Add prefix1 (e.g., "Agony")
    if (special2 && parseInt(special2) > 0) {
      fullName = getPrefix1(special2) + " " + fullName;
    }

    // Add prefix2 (e.g., "Bane")
    if (special3 && parseInt(special3) > 0) {
      fullName += " " + getPrefix2(special3);
    }
  }

  // Add item type to the name
  fullName += ` [${itemType}]`;

  return fullName;
}

// Function to parse adventurer data from Starknet response
function parseAdventurerData(adventurerResult: any): {
  health: string;
  xp: string;
  gold: string;
  beast_health: string;
  stat_upgrades_available: string;
  stats: {
    strength: string;
    dexterity: string;
    vitality: string;
    intelligence: string;
    wisdom: string;
    charisma: string;
    luck: string;
  };
  equipment: {
    weapon: { id: string; xp: string };
    chest: { id: string; xp: string };
    head: { id: string; xp: string };
    waist: { id: string; xp: string };
    foot: { id: string; xp: string };
    hand: { id: string; xp: string };
    neck: { id: string; xp: string };
    ring: { id: string; xp: string };
  };
  battle_action_count: string;
} {
  if (!adventurerResult || !Array.isArray(adventurerResult)) {
    console.error(`[ERROR] Invalid adventurer data format:`, adventurerResult);
    return {
      health: "0",
      xp: "0",
      gold: "0",
      beast_health: "0",
      stat_upgrades_available: "0",
      stats: {
        strength: "0",
        dexterity: "0",
        vitality: "0",
        intelligence: "0",
        wisdom: "0",
        charisma: "0",
        luck: "0",
      },
      equipment: {
        weapon: { id: "0", xp: "0" },
        chest: { id: "0", xp: "0" },
        head: { id: "0", xp: "0" },
        waist: { id: "0", xp: "0" },
        foot: { id: "0", xp: "0" },
        hand: { id: "0", xp: "0" },
        neck: { id: "0", xp: "0" },
        ring: { id: "0", xp: "0" },
      },
      battle_action_count: "0",
    };
  }

  try {
    // Debug log the raw data to better understand it
    console.log(`[DEBUG] Parsing adventurer data with ${adventurerResult.length} fields:`, adventurerResult);

    // Based on the Adventurer struct in the contract
    const health = hexToDec(adventurerResult[0]);
    const xp = hexToDec(adventurerResult[1]);
    const gold = hexToDec(adventurerResult[2]);
    const beast_health = hexToDec(adventurerResult[3]);
    const stat_upgrades_available = hexToDec(adventurerResult[4]);

    // Stats struct (fields 5-11)
    const stats = {
      strength: hexToDec(adventurerResult[5]),
      dexterity: hexToDec(adventurerResult[6]),
      vitality: hexToDec(adventurerResult[7]),
      intelligence: hexToDec(adventurerResult[8]),
      wisdom: hexToDec(adventurerResult[9]),
      charisma: hexToDec(adventurerResult[10]),
      luck: hexToDec(adventurerResult[11]),
    };

    // Equipment struct - each item has an ID and XP
    // The structure follows the Equipment struct in the contract
    const equipment = {
      weapon: {
        id: hexToDec(adventurerResult[12]),
        xp: hexToDec(adventurerResult[13]),
      },
      chest: {
        id: hexToDec(adventurerResult[14]),
        xp: hexToDec(adventurerResult[15]),
      },
      head: {
        id: hexToDec(adventurerResult[16]),
        xp: hexToDec(adventurerResult[17]),
      },
      waist: {
        id: hexToDec(adventurerResult[18]),
        xp: hexToDec(adventurerResult[19]),
      },
      foot: {
        id: hexToDec(adventurerResult[20]),
        xp: hexToDec(adventurerResult[21]),
      },
      hand: {
        id: hexToDec(adventurerResult[22]),
        xp: hexToDec(adventurerResult[23]),
      },
      neck: {
        id: hexToDec(adventurerResult[24]),
        xp: hexToDec(adventurerResult[25]),
      },
      ring: {
        id: hexToDec(adventurerResult[26]),
        xp: hexToDec(adventurerResult[27]),
      },
    };

    // Battle action count
    const battle_action_count = adventurerResult.length > 28 ? hexToDec(adventurerResult[28]) : "0";

    // Debug log the parsed data
    console.log(`[DEBUG] Parsed adventurer data:`, {
      health,
      xp,
      gold,
      beast_health,
      stat_upgrades_available,
      stats,
      equipment,
      battle_action_count
    });

    return {
      health,
      xp,
      gold,
      beast_health,
      stat_upgrades_available,
      stats,
      equipment,
      battle_action_count,
    };
  } catch (error) {
    console.error(`[ERROR] Failed to parse adventurer data: ${error}`);
    console.error(`[ERROR] Raw data:`, adventurerResult);
    return {
      health: "0",
      xp: "0",
      gold: "0",
      beast_health: "0",
      stat_upgrades_available: "0",
      stats: {
        strength: "0",
        dexterity: "0",
        vitality: "0",
        intelligence: "0",
        wisdom: "0",
        charisma: "0",
        luck: "0",
      },
      equipment: {
        weapon: { id: "0", xp: "0" },
        chest: { id: "0", xp: "0" },
        head: { id: "0", xp: "0" },
        waist: { id: "0", xp: "0" },
        foot: { id: "0", xp: "0" },
        hand: { id: "0", xp: "0" },
        neck: { id: "0", xp: "0" },
        ring: { id: "0", xp: "0" },
      },
      battle_action_count: "0",
    };
  }
}

// Function to parse beast data from Starknet response
function parseBeastData(beastResult: any): {
  id: string;
  starting_health: string;
  combat_spec: {
    tier: string;
    item_type: string;
    level: string;
    specials: {
      special1: string;
      special2: string;
      special3: string;
    };
  };
} {
  if (!beastResult || !Array.isArray(beastResult)) {
    return {
      id: "0",
      starting_health: "0",
      combat_spec: {
        tier: "0",
        item_type: "0",
        level: "0",
        specials: {
          special1: "0",
          special2: "0",
          special3: "0",
        },
      },
    };
  }

  try {
    // Beast struct has:
    // 1. id (u8)
    // 2. starting_health (u16)
    // 3. combat_spec (CombatSpec)
    //    - tier (Tier)
    //    - item_type (Type)
    //    - level (u16)
    //    - specials (SpecialPowers)
    //      - special1, special2, special3 (u8)

    const id = hexToDec(beastResult[0]);
    const starting_health = hexToDec(beastResult[1]);

    // CombatSpec structure
    const tier = hexToDec(beastResult[2]);
    const item_type = hexToDec(beastResult[3]);
    const level = hexToDec(beastResult[4]);

    // Specials sub-structure
    const special1 = hexToDec(beastResult[5]);
    const special2 = hexToDec(beastResult[6]);
    const special3 = hexToDec(beastResult[7]);

    return {
      id,
      starting_health,
      combat_spec: {
        tier,
        item_type,
        level,
        specials: {
          special1,
          special2,
          special3,
        },
      },
    };
  } catch (error) {
    console.error(`[ERROR] Failed to parse beast data: ${error}`);
    return {
      id: "0",
      starting_health: "0",
      combat_spec: {
        tier: "0",
        item_type: "0",
        level: "0",
        specials: {
          special1: "0",
          special2: "0",
          special3: "0",
        },
      },
    };
  }
}

// Function to map beast type to readable string
function getBeastType(typeId: string): string {
  const types: { [key: string]: string } = {
    "0": "None",
    "1": "Magic/Cloth",
    "2": "Blade/Hide",
    "3": "Bludgeon/Metal",
    "4": "Necklace",
    "5": "Ring",
  };
  return types[typeId] || `Type ${typeId}`;
}

// Function to map beast tier to readable string
function getBeastTier(tierId: string): string {
  const tiers: { [key: string]: string } = {
    "0": "None",
    "1": "T1",
    "2": "T2",
    "3": "T3",
    "4": "T4",
    "5": "T5",
  };
  return tiers[tierId] || `Tier ${tierId}`;
}

// Function to map beast ID to proper name
function getBeastName(beastId: string): string {
  const beastNames: { [key: string]: string } = {
    "0": "None",
    "1": "Warlock",
    "2": "Typhon",
    "3": "Jiangshi",
    "4": "Anansi",
    "5": "Basilisk",
    "6": "Gorgon",
    "7": "Kitsune",
    "8": "Lich",
    "9": "Chimera",
    "10": "Wendigo",
    "11": "Rakshasa",
    "12": "Werewolf",
    "13": "Banshee",
    "14": "Draugr",
    "15": "Vampire",
    "16": "Goblin",
    "17": "Ghoul",
    "18": "Wraith",
    "19": "Sprite",
    "20": "Kappa",
    "21": "Fairy",
    "22": "Leprechaun",
    "23": "Kelpie",
    "24": "Pixie",
    "25": "Gnome",
    "26": "Griffin",
    "27": "Manticore",
    "28": "Phoenix",
    "29": "Dragon",
    "30": "Minotaur",
    "31": "Qilin",
    "32": "Ammit",
    "33": "Nue",
    "34": "Skinwalker",
    "35": "Chupacabra",
    "36": "Weretiger",
    "37": "Wyvern",
    "38": "Roc",
    "39": "Harpy",
    "40": "Pegasus",
    "41": "Hippogriff",
    "42": "Fenrir",
    "43": "Jaguar",
    "44": "Satori",
    "45": "Dire Wolf",
    "46": "Bear",
    "47": "Wolf",
    "48": "Mantis",
    "49": "Spider",
    "50": "Rat",
    "51": "Kraken",
    "52": "Colossus",
    "53": "Balrog",
    "54": "Leviathan",
    "55": "Tarrasque",
    "56": "Titan",
    "57": "Nephilim",
    "58": "Behemoth",
    "59": "Hydra",
    "60": "Juggernaut",
    "61": "Oni",
    "62": "Jotunn",
    "63": "Ettin",
    "64": "Cyclops",
    "65": "Giant",
    "66": "Nemean Lion",
    "67": "Berserker",
    "68": "Yeti",
    "69": "Golem",
    "70": "Ent",
    "71": "Troll",
    "72": "Bigfoot",
    "73": "Ogre",
    "74": "Orc",
    "75": "Skeleton",
  };
  return beastNames[beastId] || `Beast #${beastId}`;
}

async function getAdventurerState(
  contractAddress: string,
  adventurerId: string
): Promise<LootSurvivorState | null> {
  try {
    console.log(
      `[STARKNET] Calling get_adventurer function for ID: ${adventurerId}`
    );

    const adventurerResult = await starknet.read({
      contractAddress,
      entrypoint: "get_adventurer",
      calldata: [adventurerId],
    });

    console.log(
      `[STARKNET] Raw adventurer result:`,
      JSON.stringify(adventurerResult)
    );

    if (!adventurerResult || adventurerResult.message) {
      console.error(
        `[ERROR] Failed to get adventurer: ${adventurerResult?.message || "Unknown error"}`
      );
      return null;
    }

    // Parse adventurer data
    const adventurerData = parseAdventurerData(
      adventurerResult.result || adventurerResult
    );

    console.log(`[DEBUG] Adventurer data after parsing:`, adventurerData);

    // Calculate level
    const xpNumber = parseInt(adventurerData.xp);
    const level = Math.floor(Math.sqrt(xpNumber));

    // Check if in battle
    const inBattle = parseInt(adventurerData.beast_health) > 0;

    // Map item IDs to names
    const getItemName = (
      item: { id: string; xp: string },
      special1?: string,
      special2?: string,
      special3?: string
    ): string => {
      const itemId = parseInt(item.id);
      if (itemId <= 0) {
        return "None";
      }

      // Get XP value
      const xp = item.xp ? parseInt(item.xp) : 0;

      // Use our helper function to get the full name with special properties
      return getFullItemName(itemId, xp, special1, special2, special3);
    };

    // Calculate max health based on game constants
    const baseHealth = 100; // STARTING_HEALTH from constants
    const vitalityBonus = parseInt(adventurerData.stats.vitality) * 15; // HEALTH_INCREASE_PER_VITALITY is 15
    const maxHealth = Math.min(baseHealth + vitalityBonus, 1023); // MAX_ADVENTURER_HEALTH is 1023

    // Create state object
    const state: LootSurvivorState = {
      adventurerId,
      adventurerHealth: adventurerData.health,
      adventurerMaxHealth: maxHealth.toString(), // Correctly calculated max health
      level: level.toString(),
      xp: adventurerData.xp,
      gold: adventurerData.gold,
      statUpgrades: adventurerData.stat_upgrades_available,

      // Stats
      strength: adventurerData.stats.strength,
      dexterity: adventurerData.stats.dexterity,
      vitality: adventurerData.stats.vitality,
      intelligence: adventurerData.stats.intelligence,
      wisdom: adventurerData.stats.wisdom,
      charisma: adventurerData.stats.charisma,
      luck: adventurerData.stats.luck,

      // Equipment
      weapon: getItemName(
        adventurerData.equipment.weapon,
        adventurerData.equipment.weapon.xp &&
          parseInt(adventurerData.equipment.weapon.xp) >= 15
          ? "1"
          : undefined,
        adventurerData.equipment.weapon.xp &&
          parseInt(adventurerData.equipment.weapon.xp) >= 19
          ? "1"
          : undefined,
        adventurerData.equipment.weapon.xp &&
          parseInt(adventurerData.equipment.weapon.xp) >= 19
          ? "1"
          : undefined
      ),
      chest: getItemName(
        adventurerData.equipment.chest,
        adventurerData.equipment.chest.xp &&
          parseInt(adventurerData.equipment.chest.xp) >= 15
          ? "1"
          : undefined,
        adventurerData.equipment.chest.xp &&
          parseInt(adventurerData.equipment.chest.xp) >= 19
          ? "1"
          : undefined,
        adventurerData.equipment.chest.xp &&
          parseInt(adventurerData.equipment.chest.xp) >= 19
          ? "1"
          : undefined
      ),
      head: getItemName(
        adventurerData.equipment.head,
        adventurerData.equipment.head.xp &&
          parseInt(adventurerData.equipment.head.xp) >= 15
          ? "1"
          : undefined,
        adventurerData.equipment.head.xp &&
          parseInt(adventurerData.equipment.head.xp) >= 19
          ? "1"
          : undefined,
        adventurerData.equipment.head.xp &&
          parseInt(adventurerData.equipment.head.xp) >= 19
          ? "1"
          : undefined
      ),
      waist: getItemName(
        adventurerData.equipment.waist,
        adventurerData.equipment.waist.xp &&
          parseInt(adventurerData.equipment.waist.xp) >= 15
          ? "1"
          : undefined,
        adventurerData.equipment.waist.xp &&
          parseInt(adventurerData.equipment.waist.xp) >= 19
          ? "1"
          : undefined,
        adventurerData.equipment.waist.xp &&
          parseInt(adventurerData.equipment.waist.xp) >= 19
          ? "1"
          : undefined
      ),
      foot: getItemName(
        adventurerData.equipment.foot,
        adventurerData.equipment.foot.xp &&
          parseInt(adventurerData.equipment.foot.xp) >= 15
          ? "1"
          : undefined,
        adventurerData.equipment.foot.xp &&
          parseInt(adventurerData.equipment.foot.xp) >= 19
          ? "1"
          : undefined,
        adventurerData.equipment.foot.xp &&
          parseInt(adventurerData.equipment.foot.xp) >= 19
          ? "1"
          : undefined
      ),
      hand: getItemName(
        adventurerData.equipment.hand,
        adventurerData.equipment.hand.xp &&
          parseInt(adventurerData.equipment.hand.xp) >= 15
          ? "1"
          : undefined,
        adventurerData.equipment.hand.xp &&
          parseInt(adventurerData.equipment.hand.xp) >= 19
          ? "1"
          : undefined,
        adventurerData.equipment.hand.xp &&
          parseInt(adventurerData.equipment.hand.xp) >= 19
          ? "1"
          : undefined
      ),
      neck: getItemName(
        adventurerData.equipment.neck,
        adventurerData.equipment.neck.xp &&
          parseInt(adventurerData.equipment.neck.xp) >= 15
          ? "1"
          : undefined,
        adventurerData.equipment.neck.xp &&
          parseInt(adventurerData.equipment.neck.xp) >= 19
          ? "1"
          : undefined,
        adventurerData.equipment.neck.xp &&
          parseInt(adventurerData.equipment.neck.xp) >= 19
          ? "1"
          : undefined
      ),
      ring: getItemName(
        adventurerData.equipment.ring,
        adventurerData.equipment.ring.xp &&
          parseInt(adventurerData.equipment.ring.xp) >= 15
          ? "1"
          : undefined,
        adventurerData.equipment.ring.xp &&
          parseInt(adventurerData.equipment.ring.xp) >= 19
          ? "1"
          : undefined,
        adventurerData.equipment.ring.xp &&
          parseInt(adventurerData.equipment.ring.xp) >= 19
          ? "1"
          : undefined
      ),

      // Equipment XP (greatness levels)
      weaponXP: adventurerData.equipment.weapon.xp,
      chestXP: adventurerData.equipment.chest.xp,
      headXP: adventurerData.equipment.head.xp,
      waistXP: adventurerData.equipment.waist.xp,
      footXP: adventurerData.equipment.foot.xp,
      handXP: adventurerData.equipment.hand.xp,
      neckXP: adventurerData.equipment.neck.xp,
      ringXP: adventurerData.equipment.ring.xp,

      // Beast info
      currentBeast: "None",
      beastHealth: adventurerData.beast_health,
      beastMaxHealth: "0",
      beastLevel: "0",
      beastTier: "0",
      beastType: "0",
      beastSpecial1: "None",
      beastSpecial2: "None",
      beastSpecial3: "None",

      // Battle state
      inBattle: inBattle ? "true" : "false",
      lastAction: "None",
      lastDamageDealt: "0",
      lastDamageTaken: "0",
      lastCritical: "false",
      battleActionCount: adventurerData.battle_action_count,

      // Bag/Inventory
      bagItems: [],

      // Market - Initialize as empty array
      marketItems: [],
    };

    console.log(`[DEBUG] Created initial state:`, {
      adventurerId: state.adventurerId,
      health: state.adventurerHealth,
      maxHealth: state.adventurerMaxHealth,
      level: state.level,
      xp: state.xp,
      gold: state.gold,
      inBattle: state.inBattle,
      stats: {
        strength: state.strength,
        dexterity: state.dexterity,
        vitality: state.vitality,
        intelligence: state.intelligence,
        wisdom: state.wisdom,
        charisma: state.charisma,
        luck: state.luck,
      },
      upgrades: state.statUpgrades,
    });

    // If in battle, get beast details
    if (inBattle) {
      try {
        console.log(`[STARKNET] Calling get_attacking_beast function`);
        const beastResult = await starknet.read({
          contractAddress: GAME_CONTRACT_ADDRESS,
          entrypoint: "get_attacking_beast",
          calldata: [adventurerId],
        });

        console.log(
          `[STARKNET] Raw beast result:`,
          JSON.stringify(beastResult)
        );

        if (beastResult && !beastResult.message) {
          const beastData = parseBeastData(beastResult.result || beastResult);

          state.currentBeast = getBeastName(beastData.id);
          state.beastMaxHealth = beastData.starting_health;
          state.beastLevel = beastData.combat_spec.level;
          state.beastTier = getBeastTier(beastData.combat_spec.tier);
          state.beastType = getBeastType(beastData.combat_spec.item_type);

          // Get formatted special properties for display
          const special1 = beastData.combat_spec.specials.special1;
          const special2 = beastData.combat_spec.specials.special2;
          const special3 = beastData.combat_spec.specials.special3;

          // Format special1 (item suffix like "of Power")
          state.beastSpecial1 =
            parseInt(special1) > 0 ? getItemSuffix(special1) : "None";

          // Format special2 (prefix1 like "Agony")
          state.beastSpecial2 =
            parseInt(special2) > 0 ? getPrefix1(special2) : "None";

          // Format special3 (prefix2 like "Bane")
          state.beastSpecial3 =
            parseInt(special3) > 0 ? getPrefix2(special3) : "None";
        }
      } catch (beastError) {
        console.log(
          `[STARKNET] Could not retrieve beast details: ${beastError}`
        );
      }
    }

    // Try to get bag items
    try {
      console.log(`[STARKNET] Calling get_bag function`);
      const bagResult = await starknet.read({
        contractAddress,
        entrypoint: "get_bag",
        calldata: [adventurerId],
      });

      console.log(`[STARKNET] Raw bag result:`, JSON.stringify(bagResult));

      if (bagResult && !bagResult.message && (bagResult.result || bagResult)) {
        const rawBag = bagResult.result || bagResult;
        state.bagItems = [];

        // The bag in the contract is a struct with 15 items
        // Each item has id and xp fields
        for (let i = 0; i < 15; i++) {
          // In the array response, items are consecutive
          // item1.id, item1.xp, item2.id, item2.xp, ...
          const itemIdIndex = i * 2; // ID at even indices
          const itemXpIndex = i * 2 + 1; // XP at odd indices

          if (itemIdIndex < rawBag.length && rawBag[itemIdIndex] !== "0x0") {
            const itemId = hexToDec(rawBag[itemIdIndex]);
            if (itemId !== "0") {
              const itemName = getItemName({ id: itemId.toString(), xp: "0" });
              state.bagItems.push(itemName);
            }
          }
        }
      }
    } catch (bagError) {
      console.log(`[STARKNET] Could not retrieve bag items: ${bagError}`);
      // Initialize empty bag array if we couldn't fetch it
      state.bagItems = [];
    }

    // Always try to get market items, especially if there are stat upgrades available
    try {
      console.log(`[STARKNET] Calling get_market function`);
      const marketResult = await starknet.read({
        contractAddress: GAME_CONTRACT_ADDRESS,
        entrypoint: "get_market",
        calldata: [adventurerId],
      });

      console.log(
        `[STARKNET] Raw market result:`,
        JSON.stringify(marketResult)
      );

      if (
        marketResult &&
        !marketResult.message &&
        (marketResult.result || marketResult)
      ) {
        const rawMarket = marketResult.result || marketResult;
        state.marketItems = [];

        // Log the raw market for further debugging
        console.log(
          `[MARKET] Raw market data (${rawMarket.length} items):`,
          rawMarket
        );

        // Process each market item ID
        // The data appears to be a flattened array of item IDs
        for (let i = 0; i < rawMarket.length; i++) {
          const itemId = hexToDec(rawMarket[i]);
          if (itemId !== "0") {
            const itemName = getItemName({ id: itemId.toString(), xp: "0" });
            const tier = getItemTier(parseInt(itemId));
            // Apply charisma discount to price
            const price = getItemPrice(
              tier,
              parseInt(adventurerData.stats.charisma)
            );

            state.marketItems.push({
              id: itemId.toString(),
              name: itemName,
              price: price.toString(),
            });

            // Debug log
            console.log(
              `[MARKET] Added item: ${itemName} (ID: ${itemId}, Tier: ${tier}, Price: ${price} gold, with CHA discount)`
            );
          }
        }

        // Log total market items
        console.log(
          `[MARKET] Total items available: ${state.marketItems.length}`
        );
      } else {
        // Initialize as empty array if market fetch failed
        state.marketItems = [];
        console.log(
          `[MARKET] Could not retrieve market items or market is not available yet.`
        );
      }
    } catch (marketError) {
      console.log(`[STARKNET] Could not retrieve market items: ${marketError}`);
      // Initialize as empty array if we couldn't fetch it
      state.marketItems = [];
    }

    // Log the final complete state for debugging
    console.log(`[DEBUG] Final complete state created for adventurer ${adventurerId}`);
    // Print the complete state to the console
    printGameState(state);

    return state;
  } catch (error) {
    console.error(`[ERROR] Failed to get adventurer state: ${error}`);
    return null;
  }
}

// Function to print the current game state to console
function printGameState(state: LootSurvivorState) {
  console.log("\n=== GAME STATE ===");
  console.log(
    `Adventurer: ID ${state.adventurerId} | Health: ${state.adventurerHealth}/${state.adventurerMaxHealth}`
  );
  console.log(`Level: ${state.level} | XP: ${state.xp} | Gold: ${state.gold}`);
  console.log(`Battle Actions: ${state.battleActionCount}`);

  console.log("\n=== STATS ===");
  console.log(
    `STR: ${state.strength} | DEX: ${state.dexterity} | VIT: ${state.vitality}`
  );
  console.log(
    `INT: ${state.intelligence} | WIS: ${state.wisdom} | CHA: ${state.charisma} | LCK: ${state.luck}`
  );
  console.log(`Available Upgrades: ${state.statUpgrades}`);

  console.log("\n=== EQUIPMENT ===");
  console.log(
    `Weapon: ${state.weapon}${state.weaponXP ? ` (Greatness: ${calculateGreatness(parseInt(state.weaponXP))}, XP: ${state.weaponXP})` : ""}`
  );
  console.log(
    `Chest: ${state.chest}${state.chestXP ? ` (Greatness: ${calculateGreatness(parseInt(state.chestXP))}, XP: ${state.chestXP})` : ""}`
  );
  console.log(
    `Head: ${state.head}${state.headXP ? ` (Greatness: ${calculateGreatness(parseInt(state.headXP))}, XP: ${state.headXP})` : ""}`
  );
  console.log(
    `Waist: ${state.waist}${state.waistXP ? ` (Greatness: ${calculateGreatness(parseInt(state.waistXP))}, XP: ${state.waistXP})` : ""}`
  );
  console.log(
    `Foot: ${state.foot}${state.footXP ? ` (Greatness: ${calculateGreatness(parseInt(state.footXP))}, XP: ${state.footXP})` : ""}`
  );
  console.log(
    `Hand: ${state.hand}${state.handXP ? ` (Greatness: ${calculateGreatness(parseInt(state.handXP))}, XP: ${state.handXP})` : ""}`
  );
  console.log(
    `Neck: ${state.neck}${state.neckXP ? ` (Greatness: ${calculateGreatness(parseInt(state.neckXP))}, XP: ${state.neckXP})` : ""}`
  );
  console.log(
    `Ring: ${state.ring}${state.ringXP ? ` (Greatness: ${calculateGreatness(parseInt(state.ringXP))}, XP: ${state.ringXP})` : ""}`
  );

  if (state.inBattle === "true") {
    console.log("\n=== BATTLE ===");
    console.log(`Beast: ${state.currentBeast} (Level ${state.beastLevel})`);
    console.log(`Beast Health: ${state.beastHealth}/${state.beastMaxHealth}`);
    console.log(`Beast Tier: ${state.beastTier} | Type: ${state.beastType}`);
    console.log(
      `Specials: ${state.beastSpecial1}, ${state.beastSpecial2}, ${state.beastSpecial3}`
    );
  }

  console.log("\n=== INVENTORY ===");
  console.log(
    `Bag Items: ${state.bagItems.length > 0 ? state.bagItems.join(", ") : "None"}`
  );

  console.log("\n=== MARKET ===");
  // Show potion price first
  const potionPrice = getPotionPrice(
    parseInt(state.level),
    parseInt(state.charisma)
  );
  console.log(`Potion: ${potionPrice} gold (Restores 10 HP)`);

  // Show items grouped by tier
  if (state.marketItems.length > 0) {
    console.log("Available Items:");
    // Group items by tier for better organization
    const itemsByTier: {
      [key: string]: Array<{ name: string; price: string }>;
    } = {};

    state.marketItems.forEach((item) => {
      const tier = getItemTier(parseInt(item.id));
      if (!itemsByTier[tier]) {
        itemsByTier[tier] = [];
      }
      itemsByTier[tier].push({ name: item.name, price: item.price });
    });

    // Display by tier (lowest price first)
    const tierOrder = ["T5", "T4", "T3", "T2", "T1"];

    tierOrder.forEach((tier) => {
      if (itemsByTier[tier] && itemsByTier[tier].length > 0) {
        console.log(`  [${tier}]`);
        itemsByTier[tier].forEach((item) => {
          console.log(`  - ${item.name} (${item.price} gold)`);
        });
      }
    });
  } else {
    console.log("Available Items: None");
  }

  console.log("\n=== LAST ACTION ===");
  console.log(
    `${state.lastAction} | Damage Dealt: ${state.lastDamageDealt} | Damage Taken: ${state.lastDamageTaken}`
  );
  console.log(`Critical Hit: ${state.lastCritical}`);
  console.log("===================\n");
}

// Function to generate a formatted state summary for the agent
function generateStateSummary(state: LootSurvivorState): string {
  return `
Current Adventurer State:
- ID: ${state.adventurerId}
- Health: ${state.adventurerHealth}/${state.adventurerMaxHealth}
- Level: ${state.level} (XP: ${state.xp})
- Gold: ${state.gold}
- In Battle: ${state.inBattle === "true" ? "Yes" : "No"}
${state.inBattle === "true" ? `- Fighting: ${state.currentBeast} (Level ${state.beastLevel})
- Beast Health: ${state.beastHealth}/${state.beastMaxHealth}
- Beast Type: ${state.beastType}` : ''}

Stats:
- Strength: ${state.strength}
- Dexterity: ${state.dexterity}
- Vitality: ${state.vitality}
- Intelligence: ${state.intelligence}
- Wisdom: ${state.wisdom}
- Charisma: ${state.charisma}
- Luck: ${state.luck}
- Available Stat Upgrades: ${state.statUpgrades}

Equipment:
- Weapon: ${state.weapon}
- Chest: ${state.chest}
- Head: ${state.head}
- Waist: ${state.waist}
- Foot: ${state.foot}
- Hand: ${state.hand}
- Neck: ${state.neck}
- Ring: ${state.ring}

Inventory:
- Bag Items: ${Array.isArray(state.bagItems) && state.bagItems.length > 0 ? state.bagItems.join(", ") : "None"}

Market:
- Available Items: ${Array.isArray(state.marketItems) && state.marketItems.length > 0
      ? state.marketItems.map(item => `${item.name} (${item.price} gold)`).join(", ")
      : "None"}

Last Action: ${state.lastAction}
`;
}

// Fix the initializeLootSurvivorMemory function to properly initialize marketItems
export function initializeLootSurvivorMemory(ctx: any): LootSurvivorState {
  if (!ctx.agentMemory) {
    ctx.agentMemory = {
      adventurerId: "0",
      adventurerHealth: "0",
      adventurerMaxHealth: "100", // Update to default base health
      level: "1",
      xp: "0",
      gold: "0",
      statUpgrades: "0",

      strength: "0",
      dexterity: "0",
      vitality: "0",
      intelligence: "0",
      wisdom: "0",
      charisma: "0",
      luck: "0",

      weapon: "None",
      chest: "None",
      head: "None",
      waist: "None",
      foot: "None",
      hand: "None",
      neck: "None",
      ring: "None",

      // Initialize equipment XP fields
      weaponXP: "0",
      chestXP: "0",
      headXP: "0",
      waistXP: "0",
      footXP: "0",
      handXP: "0",
      neckXP: "0",
      ringXP: "0",

      currentBeast: "None",
      beastHealth: "0",
      beastMaxHealth: "0",
      beastLevel: "0",
      beastTier: "0",
      beastType: "0",
      beastSpecial1: "None",
      beastSpecial2: "None",
      beastSpecial3: "None",

      inBattle: "false",
      lastAction: "None",
      lastDamageDealt: "0",
      lastDamageTaken: "0",
      lastCritical: "false",
      battleActionCount: "0",

      bagItems: [],
      marketItems: [], // Ensure this is always initialized as an empty array
    };
  } else {
    // Ensure critical fields are always initialized
    ctx.agentMemory.bagItems = ctx.agentMemory.bagItems || [];
    ctx.agentMemory.marketItems = ctx.agentMemory.marketItems || [];
  }
  return ctx.agentMemory as LootSurvivorState;
}

// Create a centralized game state manager
const gameStateManager = {
  // Current state cache
  currentState: null as LootSurvivorState | null,

  // Last fetch timestamp to avoid excessive refetching
  lastFetchTime: 0,

  // Minimum time between state refreshes (in milliseconds)
  minRefreshInterval: 1000,

  // Initialize state for a given adventurer ID
  async initialize(adventurerId: string): Promise<LootSurvivorState | null> {
    console.log(`[STATE_MANAGER] Initializing state for adventurer: ${adventurerId}`);
    this.currentState = await this._fetchLatestState(adventurerId);
    return this.currentState;
  },

  // Get current state, refreshing if necessary
  async getState(adventurerId: string, forceRefresh = false): Promise<LootSurvivorState | null> {
    const now = Date.now();

    // Check if we need to fetch a fresh state
    if (
      forceRefresh ||
      !this.currentState ||
      this.currentState.adventurerId !== adventurerId ||
      now - this.lastFetchTime > this.minRefreshInterval
    ) {
      console.log(`[STATE_MANAGER] Fetching fresh state for adventurer: ${adventurerId}`);
      this.currentState = await this._fetchLatestState(adventurerId);
      this.lastFetchTime = now;
    }

    return this.currentState;
  },

  // Update state after an action
  async updateAfterAction(
    adventurerId: string,
    actionName: string,
    txHash?: string
  ): Promise<LootSurvivorState | null> {
    // No need to manually wait for transaction confirmation
    // starknet.write() already includes waitForTransaction

    // Always fetch fresh state after an action
    console.log(`[STATE_MANAGER] Updating state after ${actionName}`);
    this.currentState = await this._fetchLatestState(adventurerId);
    this.lastFetchTime = Date.now();

    if (this.currentState) {
      // Update last action if not already set
      if (actionName && this.currentState.lastAction === "None") {
        console.log(`[STATE_MANAGER] Setting last action to: ${actionName}`);
        this.currentState.lastAction = actionName;
      }

      // Print the state for debugging too
      console.log(`[STATE_MANAGER] Updated state details:`, {
        adventurerId: this.currentState.adventurerId,
        health: this.currentState.adventurerHealth,
        maxHealth: this.currentState.adventurerMaxHealth,
        level: this.currentState.level,
        xp: this.currentState.xp,
        gold: this.currentState.gold,
        inBattle: this.currentState.inBattle,
        lastAction: this.currentState.lastAction
      });
    }

    return this.currentState;
  },

  // Apply state to agent memory context
  applyToMemory(ctx: any): LootSurvivorState {
    // Initialize memory first
    const memoryState = initializeLootSurvivorMemory(ctx);

    // Then apply current state if available
    if (this.currentState) {
      // Create a deep copy of important objects to avoid reference issues
      const stateCopy = { ...this.currentState };

      // Copy arrays to avoid reference issues
      if (Array.isArray(this.currentState.bagItems)) {
        stateCopy.bagItems = [...this.currentState.bagItems];
      }

      if (Array.isArray(this.currentState.marketItems)) {
        stateCopy.marketItems = this.currentState.marketItems.map(item => ({ ...item }));
      }

      // Apply the copied state to memory
      Object.assign(memoryState, stateCopy);

      console.log(`[STATE_MANAGER] Applied state to agent memory for adventurer: ${this.currentState.adventurerId}`);
      console.log(`[STATE_MANAGER] Memory state now has:`, {
        adventurerId: memoryState.adventurerId,
        health: memoryState.adventurerHealth,
        maxHealth: memoryState.adventurerMaxHealth,
        level: memoryState.level,
        gold: memoryState.gold,
        inBattle: memoryState.inBattle,
        stats: {
          strength: memoryState.strength,
          dexterity: memoryState.dexterity,
          vitality: memoryState.vitality,
          intelligence: memoryState.intelligence,
          wisdom: memoryState.wisdom,
          charisma: memoryState.charisma,
          luck: memoryState.luck,
        },
        bagItems: Array.isArray(memoryState.bagItems) ? memoryState.bagItems.length : 0,
        marketItems: Array.isArray(memoryState.marketItems) ? memoryState.marketItems.length : 0,
      });
    } else {
      console.warn(`[STATE_MANAGER] No current state to apply to memory`);
    }

    return memoryState;
  },

  // Private method to fetch the latest state
  async _fetchLatestState(adventurerId: string): Promise<LootSurvivorState | null> {
    const state = await getAdventurerState(GAME_CONTRACT_ADDRESS, adventurerId);
    if (!state) {
      console.error(`[STATE_MANAGER] Failed to fetch state for adventurer: ${adventurerId}`);
    }
    return state;
  }
};

// Define item names array based on the ItemString module in constants.cairo
// Items are 1-indexed in the contract, so we'll match that here
const ITEM_NAMES = [
  "Pendant",
  "Necklace",
  "Amulet",
  "Silver Ring",
  "Bronze Ring",
  "Platinum Ring",
  "Titanium Ring",
  "Gold Ring",
  "Ghost Wand",
  "Grave Wand",
  "Bone Wand",
  "Wand",
  "Grimoire",
  "Chronicle",
  "Tome",
  "Book",
  "Divine Robe",
  "Silk Robe",
  "Linen Robe",
  "Robe",
  "Shirt",
  "Crown",
  "Divine Hood",
  "Silk Hood",
  "Linen Hood",
  "Hood",
  "Brightsilk Sash",
  "Silk Sash",
  "Wool Sash",
  "Linen Sash",
  "Sash",
  "Divine Slippers",
  "Silk Slippers",
  "Wool Shoes",
  "Linen Shoes",
  "Shoes",
  "Divine Gloves",
  "Silk Gloves",
  "Wool Gloves",
  "Linen Gloves",
  "Gloves",
  "Katana",
  "Falchion",
  "Scimitar",
  "Long Sword",
  "Short Sword",
  "Demon Husk",
  "Dragonskin Armor",
  "Studded Leather Armor",
  "Hard Leather Armor",
  "Leather Armor",
  "Demon Crown",
  "Dragon's Crown",
  "War Cap",
  "Leather Cap",
  "Cap",
  "Demonhide Belt",
  "Dragonskin Belt",
  "Studded Leather Belt",
  "Hard Leather Belt",
  "Leather Belt",
  "Demonhide Boots",
  "Dragonskin Boots",
  "Studded Leather Boots",
  "Hard Leather Boots",
  "Leather Boots",
  "Demon's Hands",
  "Dragonskin Gloves",
  "Studded Leather Gloves",
  "Hard Leather Gloves",
  "Leather Gloves",
  "Warhammer",
  "Quarterstaff",
  "Maul",
  "Mace",
  "Club",
  "Holy Chestplate",
  "Ornate Chestplate",
  "Plate Mail",
  "Chain Mail",
  "Ring Mail",
  "Ancient Helm",
  "Ornate Helm",
  "Great Helm",
  "Full Helm",
  "Helm",
  "Ornate Belt",
  "War Belt",
  "Plated Belt",
  "Mesh Belt",
  "Heavy Belt",
  "Holy Greaves",
  "Ornate Greaves",
  "Greaves",
  "Chain Boots",
  "Heavy Boots",
  "Holy Gauntlets",
  "Ornate Gauntlets",
  "Gauntlets",
  "Chain Gloves",
  "Heavy Gloves",
];

// Template for the agent's context
export const template = `
You are an expert AI agent playing Loot Survivor, a roguelike dungeon crawler game on Starknet blockchain. Your goal is to progress as far as possible, defeat beasts, collect loot, and upgrade your character to become stronger.

CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:
1. If stat_upgrades_available > 0, you MUST use upgradeAdventurer to allocate ALL stat points BEFORE doing anything else.
2. When stat upgrades are available, the market is also available - you can buy items and potions.
3. You CANNOT explore if stat_upgrades_available > 0 - the game mechanics prevent this.
4. If in battle (inBattle = true), you MUST resolve it (attack or flee) before doing any other action.

Game Overview:
- Roguelike dungeon crawler with permadeath (once you die, you need to start over)
- Turn-based combat system with elemental effectiveness mechanics
- Character progression through XP, level-ups, and equipment upgrades
- Resource management (health, gold, items)
- Battle increasingly difficult beasts
- Collect gold and items
- Level up your character
- Manage health and resources
- Make strategic combat decisions
- Track XP for level-up timing

IMPORTANT RULES:
- If stat_upgrades_available is non-zero, you MUST allocate those stat points before exploring
- You can only upgrade stats if you have available stat points (1 point = 1 stat upgrade)
- When stat points are available, the market is also available for purchases
- If in battle, you MUST resolve the battle (attack or flee) before doing anything else
- When confused or stuck, check: Are you in battle? Do you have available stat points?

Combat Mechanics:
- Weapon types: Blade, Bludgeon, and Magic
- Armor materials: Cloth, Hide, and Metal
- Weapon effectiveness:
  - Blade: Weak vs Metal, Fair vs Hide, Strong vs Cloth
  - Bludgeon: Fair vs Metal, Strong vs Hide, Weak vs Cloth
  - Magic: Strong vs Metal, Weak vs Hide, Fair vs Cloth
- Stats affect combat: Strength boosts damage, Vitality increases health, etc.
- Combat calculations:
  - Base damage = Item Greatness * (6 - Tier)
  - Beast damage = Beast Level * (6 - Beast Tier)
  - Final damage = Weapon power - Armor defense
- Critical hits chance = luck / 100
- Critical damage bonus = random(20-100%)

Beast Types:
- Magical Beasts: Weak to Blade weapons, Strong against Metal armor
- Hunter Beasts: Weak to Bludgeon weapons, Strong against Cloth armor
- Brute Beasts: Weak to Magic weapons, Strong against Hide armor
- Beast Tiers affect power: Tier 1 (highest) to Tier 5 (lowest)

Resource Management:
- HP management is critical for survival
- XP gained through successful actions
- Gold for purchasing items and potions
- Potion cost = adventurer_level - (2 * charisma)
- Each potion adds 10HP

Stats System:
- Strength: +10% attack damage
- Vitality: +15HP max and current health
- Dexterity: Better flee chances
- Intelligence: Better obstacle avoidance
- Wisdom: Better ambush evasion
- Charisma: Item/potion discount
- Luck: Critical hit chance (only from items)

Current Game State:
<adventurer_stats>
Adventurer ID: {{adventurerId}}
Health: {{adventurerHealth}}/{{adventurerMaxHealth}}
Level: {{level}}
XP: {{xp}}
Gold: {{gold}}
Battle Actions: {{battleActionCount}}
</adventurer_stats>

<adventurer_attributes>
Strength: {{strength}}
Dexterity: {{dexterity}}
Vitality: {{vitality}}
Intelligence: {{intelligence}}
Wisdom: {{wisdom}}
Charisma: {{charisma}}
Luck: {{luck}}
Available Stat Upgrades: {{statUpgrades}}
</adventurer_attributes>

<equipment>
Weapon: {{weapon}}
Chest: {{chest}}
Head: {{head}}
Waist: {{waist}}
Foot: {{foot}}
Hand: {{hand}}
Neck: {{neck}}
Ring: {{ring}}
</equipment>

<battle_status>
In Battle: {{inBattle}}
Beast: {{currentBeast}}
Beast Health: {{beastHealth}}/{{beastMaxHealth}}
Beast Level: {{beastLevel}}
Beast Tier: {{beastTier}}
Beast Type: {{beastType}}
Beast Specials: {{beastSpecial1}}, {{beastSpecial2}}, {{beastSpecial3}}
Last Action: {{lastAction}}
Last Damage Dealt: {{lastDamageDealt}}
Last Damage Taken: {{lastDamageTaken}}
Critical Hit: {{lastCritical}}
</battle_status>

<inventory>
Bag Items: {{bagItems}}
</inventory>

<market>
Available Items: {{marketItems}}
</market>

Available Actions:
1. Combat Actions:
   - attack(adventurer_id, to_the_death): 
     * Single attack when to_the_death = false
     * Fight until victory/death when to_the_death = true
   - flee(adventurer_id, to_the_death):
     * Single escape attempt when to_the_death = false
     * Keep trying until escape/death when to_the_death = true

2. Exploration Actions:
   - explore(adventurer_id, till_beast):
     * Single exploration when till_beast = false
     * Keep exploring until beast when till_beast = true

3. Inventory Management:
   - equipItems(adventurer_id, items): Equip items from bag
   - upgradeAdventurer(adventurer_id, potions, stats, items):
     * Buy and use potions
     * Upgrade character stats
     * Purchase and optionally equip items

4. Character Management:
   - newGame(starting_weapon, name, character_class): Start new adventure
   - getAdventurerState(adventurer_id): Refresh game state

Strategic Guidelines:
1. ALWAYS check for available stat upgrades first - you MUST allocate them before exploring
2. Prioritize survival - manage your health and know when to flee
3. Choose equipment upgrades that complement your playstyle
4. Be aware of weapon effectiveness against different armor types
5. Upgrade stats strategically - Vitality for health, Strength for damage, etc.
6. Save gold for important purchases rather than buying every item
7. Assess beast difficulty before engaging in combat
8. Use your strongest equipment and keep your bag organized
9. Calculate flee probability: Dexterity / Level
10. Combat assessment: Compare your weapon type vs beast armor type
11. Calculate potion costs vs benefits: Consider potion cost = level - (2 * charisma)
12. Consider strategic fleeing for long-term survival

DECISION MAKING PRIORITY ORDER:
1. If stat_upgrades_available > 0: MUST use upgradeAdventurer to allocate points
2. If in battle (inBattle = true): MUST attack or flee
3. If health is low: Consider buying potions
4. If market has good items: Consider buying equipment
5. Otherwise: Explore to find beasts and loot

Your task is to analyze the current game state and make strategic decisions. Follow these steps:

1. First, check if you have available stat upgrades that MUST be allocated
2. Check if you're in battle that needs immediate resolution
3. Analyze your current stats, health, equipment, and resources
4. Evaluate the current situation (exploring, in battle, shopping)
5. Consider the best action based on the game state
6. Explain your reasoning and decision clearly

Inside your thinking block, use <strategy_planning> tags to show your thought process:

1. Assess your current status and strengths/weaknesses
2. List possible actions and their potential outcomes
3. Weigh risks vs. rewards
4. Choose the optimal action

If you die during gameplay, start a new game immediately and continue playing. If you encounter any errors, ask the user to re-authenticate.

Output Format:
Decision: [Your chosen action]
Explanation: [A clear explanation of your decision and how it fits your strategy]
Next Steps: [Brief outline of your plan for the next few turns]

Remember to constantly adapt your strategy as the game state changes. Your goal is long-term survival and progression.
`;

// Context for the agent
export const goalContexts = context({
  type: "goal",
  schema: z.object({
    id: string(),
    initialGoal: z.string().default("Survive and progress in Loot Survivor"),
    initialTasks: z
      .array(z.string())
      .default([
        "Make strategic decisions",
        "Manage resources",
        "Defeat beasts",
        "Upgrade your adventurer",
        "Collect loot",
        "Explore the world",
        "Shop for items",
        "Sell items",
        "Buy items",
      ]),
  }),

  key() {
    return "1";
  },

  create(_state): LootSurvivorState {
    return {
      adventurerId: "0",
      adventurerHealth: "0",
      adventurerMaxHealth: "100", // Set to base health value
      level: "1",
      xp: "0",
      gold: "0",
      statUpgrades: "0",

      strength: "0",
      dexterity: "0",
      vitality: "0",
      intelligence: "0",
      wisdom: "0",
      charisma: "0",
      luck: "0",

      weapon: "None",
      chest: "None",
      head: "None",
      waist: "None",
      foot: "None",
      hand: "None",
      neck: "None",
      ring: "None",

      // Added equipment XP fields
      weaponXP: "0",
      chestXP: "0",
      headXP: "0",
      waistXP: "0",
      footXP: "0",
      handXP: "0",
      neckXP: "0",
      ringXP: "0",

      currentBeast: "None",
      beastHealth: "0",
      beastMaxHealth: "0",
      beastLevel: "0",
      beastTier: "0",
      beastType: "0",
      beastSpecial1: "None",
      beastSpecial2: "None",
      beastSpecial3: "None",

      inBattle: "false",
      lastAction: "None",
      lastDamageDealt: "0",
      lastDamageTaken: "0",
      lastCritical: "false",
      battleActionCount: "0",

      bagItems: [],
      marketItems: [], // Empty array of {id, name, price}
    };
  },

  render({ memory }) {
    // Add debug logging to see what's in memory before rendering
    console.log(`[RENDER] Starting render with memory:`, {
      adventurerId: memory.adventurerId ?? "0",
      health: memory.adventurerHealth ?? "0",
      maxHealth: memory.adventurerMaxHealth ?? "0",
      level: memory.level ?? "1",
      xp: memory.xp ?? "0",
      gold: memory.gold ?? "0",
      statUpgrades: memory.statUpgrades ?? "0",
      inBattle: memory.inBattle ?? "false",
    });

    // Calculate potion price for the UI
    const potionPrice =
      memory.level && memory.charisma
        ? getPotionPrice(parseInt(memory.level), parseInt(memory.charisma))
        : 1;

    // Debug log to see what's in memory.marketItems
    console.log(`[RENDER] Market items before formatting:`, memory.marketItems);

    // Ensure memory.marketItems is always an array
    const marketItems = Array.isArray(memory.marketItems) ? memory.marketItems : [];

    // Format market items to include potion at the top
    const formattedMarketItems =
      marketItems.length > 0
        ? `Potion: ${potionPrice} gold (Restores 10 HP), ` +
        marketItems
          .map(
            (item: { name: string; price: string }) =>
              `${item.name} (${item.price} gold)`
          )
          .join(", ")
        : `Potion: ${potionPrice} gold (Restores 10 HP)`;

    console.log(`[RENDER] Formatted market items for agent:`, formattedMarketItems);

    // Format bag items for display
    const bagItemsString = Array.isArray(memory.bagItems) && memory.bagItems.length > 0
      ? memory.bagItems.join(", ")
      : "None";

    console.log(`[RENDER] Bag items for agent:`, bagItemsString);

    // Create template parameters
    const templateParams = {
      adventurerId: memory.adventurerId ?? "0",
      adventurerHealth: memory.adventurerHealth ?? "0",
      adventurerMaxHealth: memory.adventurerMaxHealth ?? "0",
      level: memory.level ?? "1",
      xp: memory.xp ?? "0",
      gold: memory.gold ?? "0",
      battleActionCount: memory.battleActionCount ?? "0",

      strength: memory.strength ?? "0",
      dexterity: memory.dexterity ?? "0",
      vitality: memory.vitality ?? "0",
      intelligence: memory.intelligence ?? "0",
      wisdom: memory.wisdom ?? "0",
      charisma: memory.charisma ?? "0",
      luck: memory.luck ?? "0",
      statUpgrades: memory.statUpgrades ?? "0",

      weapon: memory.weapon
        ? `${memory.weapon}${memory.weaponXP ? ` (Greatness: ${calculateGreatness(parseInt(memory.weaponXP))})` : ""}`
        : "None",
      chest: memory.chest
        ? `${memory.chest}${memory.chestXP ? ` (Greatness: ${calculateGreatness(parseInt(memory.chestXP))})` : ""}`
        : "None",
      head: memory.head
        ? `${memory.head}${memory.headXP ? ` (Greatness: ${calculateGreatness(parseInt(memory.headXP))})` : ""}`
        : "None",
      waist: memory.waist
        ? `${memory.waist}${memory.waistXP ? ` (Greatness: ${calculateGreatness(parseInt(memory.waistXP))})` : ""}`
        : "None",
      foot: memory.foot
        ? `${memory.foot}${memory.footXP ? ` (Greatness: ${calculateGreatness(parseInt(memory.footXP))})` : ""}`
        : "None",
      hand: memory.hand
        ? `${memory.hand}${memory.handXP ? ` (Greatness: ${calculateGreatness(parseInt(memory.handXP))})` : ""}`
        : "None",
      neck: memory.neck
        ? `${memory.neck}${memory.neckXP ? ` (Greatness: ${calculateGreatness(parseInt(memory.neckXP))})` : ""}`
        : "None",
      ring: memory.ring
        ? `${memory.ring}${memory.ringXP ? ` (Greatness: ${calculateGreatness(parseInt(memory.ringXP))})` : ""}`
        : "None",

      currentBeast: memory.currentBeast ?? "None",
      beastHealth: memory.beastHealth ?? "0",
      beastMaxHealth: memory.beastMaxHealth ?? "0",
      beastLevel: memory.beastLevel ?? "0",
      beastTier: memory.beastTier ?? "0",
      beastType: memory.beastType ?? "0",
      beastSpecial1: memory.beastSpecial1 ?? "None",
      beastSpecial2: memory.beastSpecial2 ?? "None",
      beastSpecial3: memory.beastSpecial3 ?? "None",

      inBattle: memory.inBattle ?? "false",
      lastAction: memory.lastAction ?? "None",
      lastDamageDealt: memory.lastDamageDealt ?? "0",
      lastDamageTaken: memory.lastDamageTaken ?? "0",
      lastCritical: memory.lastCritical ?? "false",

      bagItems: bagItemsString,
      marketItems: formattedMarketItems,
    };

    // Log the final template parameters for debugging
    console.log(`[RENDER] Rendering template with parameters:`, {
      adventurerId: templateParams.adventurerId,
      health: `${templateParams.adventurerHealth}/${templateParams.adventurerMaxHealth}`,
      level: templateParams.level,
      gold: templateParams.gold,
      inBattle: templateParams.inBattle,
      statUpgrades: templateParams.statUpgrades,
      lastAction: templateParams.lastAction
    });

    return render(template, templateParams as any);
  },
});

// Create the Loot Survivor agent with UI integration
export const lootSurvivor = extension({
  name: "lootSurvivor",
  contexts: {
    goal: goalContexts,
  },
  actions: [
    /**
     * Action to start a new game
     */
    action({
      name: "newGame",
      description: "Start a new game in Loot Survivor",
      schema: z
        .object({
          startingWeapon: z
            .enum(["Wand", "Book", "Club", "ShortSword"])
            .describe(
              "The weapon to start with (Blade, Bludgeon, or Magic type. Wand and Book are magic types.)"
            ),
          name: z.string().describe("The name of your adventurer"),
        })
        .describe("Start a new game with a chosen weapon, and name"),
      async handler(data, ctx: any, _agent: Agent) {
        try {
          console.log(
            `[ACTION] Starting New Game - Weapon: ${data.startingWeapon}, Name: ${data.name}`
          );

          const { startingWeapon, name } = data;

          // Map starting weapon to weapon ID
          const weaponIdMap: Record<string, number> = {
            Club: 76,
            Book: 16,
            Wand: 12,
            ShortSword: 46,
          };

          const weaponId = weaponIdMap[startingWeapon] || 1;

          console.log(`[STARKNET] Calling new_game function on contract`);

          // Updated to match ABI parameters
          const result = await starknet.write({
            contractAddress: GAME_CONTRACT_ADDRESS,
            entrypoint: "new_game",
            calldata: [
              env.STARKNET_ADDRESS, // client_reward_address (using our configured address)
              weaponId, // weapon
              Buffer.from(name).toString("hex"), // name
              0, // golden_token_id (default 0)
              0, // delay_reveal (false)
              0, // custom_renderer (0x0 address)
              0, // launch_tournament_winner_token_id (0)
              env.STARKNET_ADDRESS, // mint_to (using our configured address)
            ],
          });

          console.log(
            `[STARKNET] Transaction hash: ${result.transaction_hash}`
          );

          // Create a new adventurer ID from the transaction hash or result
          const adventurerId = result.transaction_hash || "unknown";

          // Initialize adventurer state through state manager
          console.log(`[NEWGAME] Waiting for transaction and initializing game state`);
          const state = await gameStateManager.updateAfterAction(
            adventurerId,
            "New Game Created",
            result.transaction_hash
          );

          if (!state) {
            return {
              success: false,
              error: "Failed to retrieve adventurer state after creation",
              message: "Failed to start a new game",
            };
          }

          // Apply the state to agent memory
          gameStateManager.applyToMemory(ctx);

          console.log(
            `[ACTION] New Game Created - Adventurer ID: ${state.adventurerId}`
          );

          // Set initial weapon and action in state directly, since blockchain might not reflect it immediately
          if (state) {
            state.weapon = ITEM_NAMES[weaponId - 1] || startingWeapon;
            state.lastAction = "New Game Created";
          }

          return {
            success: true,
            message: `Successfully started a new game with ${startingWeapon} and name ${name}. Your adventurer ID is ${adventurerId}.`,
            adventurerId: adventurerId // Return the ID so the agent can reference it
          };
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("[ERROR] Failed to start new game:", errorMessage);

          return {
            success: false,
            error: errorMessage,
            message: "Failed to start a new game",
          };
        }
      },
    }),

    /**
     * Action to explore the world
     */
    action({
      name: "explore",
      description: "Explore the world to find beasts, obstacles, or treasures",
      schema: z
        .object({
          adventurerId: z.string().describe("The ID of your adventurer"),
          tillBeast: z
            .boolean()
            .default(false)
            .describe(
              "Whether to explore until finding a beast (true) or just once (false)"
            ),
        })
        .describe(
          "Explore the world to discover beasts, obstacles, or treasures"
        ),
      async handler(data, ctx: any, _agent: Agent) {
        try {
          // Get current state through the state manager
          const currentState = await gameStateManager.getState(data.adventurerId);

          // Check if there are any stat upgrades available - if so, reject the action
          if (currentState && parseInt(currentState.statUpgrades) > 0) {
            console.log("[ACTION] Rejecting explore - stat upgrades available:", currentState.statUpgrades);
            return {
              success: false,
              error: "Cannot explore when stat upgrades are available",
              message: "You must allocate all available stat points before exploring. Use upgradeAdventurer action first.",
            };
          }

          console.log(
            `[ACTION] Exploring - Adventurer ID: ${data.adventurerId}, Till Beast: ${data.tillBeast}`
          );

          const { adventurerId, tillBeast } = data;

          // Store initial state to compare later
          const initialState = currentState ? { ...currentState } : null;

          // Use Starknet to call explore function
          console.log(`[STARKNET] Calling explore function on contract`);
          const exploreResult = await starknet.write({
            contractAddress: GAME_CONTRACT_ADDRESS,
            entrypoint: "explore",
            calldata: [
              adventurerId,
              tillBeast ? 1 : 0, // Convert boolean to 0/1
            ],
          });

          console.log(
            `[STARKNET] Transaction hash: ${exploreResult.transaction_hash}`
          );

          // Update state through the state manager
          const updatedState = await gameStateManager.updateAfterAction(
            adventurerId,
            "Exploring",
            exploreResult.transaction_hash
          );

          if (!updatedState) {
            return {
              success: false,
              error: "Failed to retrieve updated adventurer state",
              message: "Failed to explore: could not get updated adventurer state",
            };
          }

          // Determine what happened during exploration by comparing before/after states
          let actionDescription = "Explored area";

          // Check for beast encounter
          if (updatedState.inBattle === "true") {
            actionDescription = "Discovered Beast";
            console.log(
              `[ENCOUNTER] Found Beast: ${updatedState.currentBeast || "Unknown"} (Level ${updatedState.beastLevel || "Unknown"})`
            );
          }
          // Check for health decrease (obstacle)
          else if (
            initialState &&
            parseInt(updatedState.adventurerHealth) < parseInt(initialState.adventurerHealth || "0")
          ) {
            const damageTaken =
              parseInt(initialState.adventurerHealth || "0") -
              parseInt(updatedState.adventurerHealth);
            actionDescription = `Encountered Obstacle (-${damageTaken} HP)`;
            updatedState.lastDamageTaken = damageTaken.toString();
            console.log(`[ENCOUNTER] Obstacle: Took ${damageTaken} damage`);
          }
          // Check for gold increase (discovery)
          else if (
            initialState &&
            parseInt(updatedState.gold) > parseInt(initialState.gold || "0")
          ) {
            const goldFound =
              parseInt(updatedState.gold) - parseInt(initialState.gold || "0");
            actionDescription = `Found ${goldFound} Gold`;
            console.log(`[DISCOVERY] Found ${goldFound} Gold`);
          }
          // Check if health increased (health discovery)
          else if (
            initialState &&
            parseInt(updatedState.adventurerHealth) > parseInt(initialState.adventurerHealth || "0")
          ) {
            const healthFound =
              parseInt(updatedState.adventurerHealth) -
              parseInt(initialState.adventurerHealth || "0");
            actionDescription = `Found ${healthFound} Health`;
            console.log(`[DISCOVERY] Found ${healthFound} Health`);
          }
          // Check if bag items count changed (item discovery)
          else if (
            initialState &&
            Array.isArray(initialState.bagItems) &&
            Array.isArray(updatedState.bagItems) &&
            updatedState.bagItems.length > initialState.bagItems.length
          ) {
            // Find the new item by comparing arrays
            const newItems = updatedState.bagItems.filter(
              (item: string) => !initialState.bagItems.includes(item)
            );
            if (newItems.length > 0) {
              actionDescription = `Found Item: ${newItems[0]}`;
              console.log(`[DISCOVERY] Found Item: ${newItems[0]}`);
            } else {
              actionDescription = "Found an Item";
              console.log(`[DISCOVERY] Found an item`);
            }
          }
          // Nothing interesting happened
          else {
            actionDescription = "Explored area, found nothing";
            console.log(`[EXPLORATION] Found nothing of interest`);
          }

          // Update last action in state
          updatedState.lastAction = actionDescription;

          // Check if level up occurred
          if (
            initialState &&
            parseInt(updatedState.statUpgrades) > parseInt(initialState.statUpgrades || "0")
          ) {
            console.log(`[LEVEL UP] Gained stat points! Available: ${updatedState.statUpgrades}`);
          }

          // Apply updated state to agent memory
          gameStateManager.applyToMemory(ctx);

          // Update the return statement in the explore handler
          console.log(`[ACTION] Exploration Complete - ${actionDescription}`);

          const stateSummary = generateStateSummary(updatedState);
          console.log(`[EXPLORE] Sending state summary to agent`);

          return {
            success: true,
            message: `${actionDescription}\n\n${stateSummary}`,
          };
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("[ERROR] Failed to explore:", errorMessage);

          return {
            success: false,
            error: errorMessage,
            message: "Failed to explore",
          };
        }
      },
    }),

    /**
     * Action to attack a beast
     */
    action({
      name: "attackBeast",
      description: "Attack the beast you're currently facing",
      schema: z
        .object({
          adventurerId: z.string().describe("The ID of your adventurer"),
          toTheDeath: z
            .boolean()
            .default(false)
            .describe(
              "Whether to fight to the death (true) or just attack once (false)"
            ),
        })
        .describe("Attack the beast you encountered"),
      async handler(data, ctx, _agent: Agent) {
        try {
          console.log(
            `[ACTION] Attacking Beast - Adventurer ID: ${data.adventurerId}, To Death: ${data.toTheDeath}`
          );

          const { adventurerId, toTheDeath } = data;

          // Get current state through the state manager
          const currentState = await gameStateManager.getState(adventurerId);

          // Make sure we're in battle
          if (!currentState || currentState.inBattle !== "true") {
            return {
              success: false,
              error: "Not in battle",
              message: "Cannot attack: you are not in battle with a beast",
            };
          }

          // Store initial state to compare later for damage calculation
          const initialState = { ...currentState };
          console.log(`[ATTACK] Initial beast health: ${initialState.beastHealth}, adventurer health: ${initialState.adventurerHealth}`);

          // Record the name of the beast we're fighting for better messaging
          const beastName = initialState.currentBeast || "Beast";

          console.log(`[STARKNET] Calling attack function on contract`);
          const attackResult = await starknet.write({
            contractAddress: GAME_CONTRACT_ADDRESS,
            entrypoint: "attack",
            calldata: [
              adventurerId,
              toTheDeath ? 1 : 0, // Convert boolean to 0/1
            ],
          });

          console.log(
            `[STARKNET] Transaction hash: ${attackResult.transaction_hash}`
          );

          // Update state through the state manager but use a descriptive action name for better logs
          const updatedState = await gameStateManager.updateAfterAction(
            adventurerId,
            `Attacking ${beastName}`,
            attackResult.transaction_hash
          );

          if (!updatedState) {
            return {
              success: false,
              error: "Failed to retrieve updated adventurer state",
              message: "Failed to attack: could not get updated adventurer state",
            };
          }

          // Calculate damage dealt to beast - ensure we handle undefined values
          const initialBeastHealth = parseInt(initialState.beastHealth || "0");
          const updatedBeastHealth = parseInt(updatedState.beastHealth || "0");
          const damageDealt = Math.max(0, initialBeastHealth - updatedBeastHealth);

          // Calculate damage taken by adventurer
          const initialAdvHealth = parseInt(initialState.adventurerHealth || "0");
          const updatedAdvHealth = parseInt(updatedState.adventurerHealth || "0");
          const damageTaken = Math.max(0, initialAdvHealth - updatedAdvHealth);

          // Store damage values in state for reference
          updatedState.lastDamageDealt = damageDealt.toString();
          updatedState.lastDamageTaken = damageTaken.toString();

          // We don't know if it was critical without event logs, so default is false
          updatedState.lastCritical = "false";

          // Log detailed attack results for debugging
          console.log(`[ATTACK] Damage calculation:`, {
            initialBeastHealth,
            updatedBeastHealth,
            damageDealt,
            initialAdvHealth,
            updatedAdvHealth,
            damageTaken
          });

          // Check if beast was defeated
          const beastDefeated = updatedBeastHealth <= 0;

          // Check if adventurer died
          const adventurerDied = updatedAdvHealth <= 0;

          // Check for XP and gold gains
          const initialXP = parseInt(initialState.xp || "0");
          const updatedXP = parseInt(updatedState.xp || "0");
          const xpGained = Math.max(0, updatedXP - initialXP);

          const initialGold = parseInt(initialState.gold || "0");
          const updatedGold = parseInt(updatedState.gold || "0");
          const goldGained = Math.max(0, updatedGold - initialGold);

          // Create detailed action description with specific numbers for the agent
          let actionDescription = "";

          if (adventurerDied) {
            actionDescription = `Died while attacking ${beastName}`;
            console.log(`[DEATH] Your adventurer has been slain!`);
          } else if (beastDefeated) {
            actionDescription = `Defeated ${beastName}`;
            if (xpGained > 0 || goldGained > 0) {
              actionDescription += ` (Gained`;
              if (xpGained > 0) actionDescription += ` ${xpGained} XP`;
              if (xpGained > 0 && goldGained > 0) actionDescription += `,`;
              if (goldGained > 0) actionDescription += ` ${goldGained} Gold`;
              actionDescription += `)`;
            }
            console.log(`[VICTORY] ${beastName} slain!`);
          } else {
            // Most important case - clearly describe attack results
            actionDescription = `Attacked ${beastName}: Dealt ${damageDealt} damage`;
            if (damageTaken > 0) {
              actionDescription += `, took ${damageTaken} damage`;
            }
            actionDescription += ` (Beast health: ${updatedBeastHealth}/${initialState.beastMaxHealth})`;

            console.log(
              `[BATTLE] Attacked ${beastName}, dealt ${damageDealt} damage, took ${damageTaken} damage`
            );
          }

          // Update the last action in state
          updatedState.lastAction = actionDescription;
          console.log(`[ATTACK] Set lastAction to: "${actionDescription}"`);

          // Check for level up
          const initialLevel = parseInt(initialState.level || "1");
          const updatedLevel = parseInt(updatedState.level || "1");
          if (updatedLevel > initialLevel) {
            console.log(
              `[LEVEL UP] Advanced to level ${updatedLevel}! Available stat points: ${updatedState.statUpgrades}`
            );
          }

          // Apply updated state to agent memory
          gameStateManager.applyToMemory(ctx);

          console.log(`[ACTION] Attack Complete - ${actionDescription}`);

          // Return a clear, detailed message about the attack outcome
          const stateSummary = generateStateSummary(updatedState);
          console.log(`[ATTACK] Sending state summary to agent`);
          return {
            success: true,
            message: `${actionDescription}\n\n${stateSummary}`,
            // Include additional details that might be useful to the agent
            details: {
              beastName,
              damageDealt,
              damageTaken,
              beastHealth: updatedBeastHealth,
              beastMaxHealth: initialState.beastMaxHealth,
              beastDefeated,
              xpGained,
              goldGained,
              levelUp: updatedLevel > initialLevel
            }
          };
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("[ERROR] Failed to attack beast:", errorMessage);

          return {
            success: false,
            error: errorMessage,
            message: "Failed to attack beast",
          };
        }
      },
    }),

    /**
     * Action to get the current state of the adventurer
     */
    action({
      name: "getAdventurerState",
      description: "Get the current state of your adventurer",
      schema: z
        .object({
          adventurerId: z.string().describe("The ID of your adventurer"),
        })
        .describe("Get the current state of your adventurer"),
      async handler(data, ctx, _agent: Agent) {
        try {
          console.log(
            `[ACTION] Getting Adventurer State - ID: ${data.adventurerId}`
          );

          const { adventurerId } = data;

          // Force refresh state through state manager
          const updatedState = await gameStateManager.getState(adventurerId, true);

          if (!updatedState) {
            return {
              success: false,
              error: "Failed to retrieve adventurer state",
              message: "Failed to get adventurer state",
            };
          }

          // Apply the updated state to agent memory
          const memoryState = gameStateManager.applyToMemory(ctx);

          console.log(`[ACTION] State Retrieved Successfully`);

          // Create a detailed state summary to return directly to the agent
          const stateSummary = generateStateSummary(updatedState);

          console.log(`[ACTION] Sending state summary to agent`);

          return {
            success: true,
            message: `State retrieved successfully. ${stateSummary}`,
          };
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error(
            "[ERROR] Failed to get adventurer state:",
            errorMessage
          );

          return {
            success: false,
            error: errorMessage,
            message: "Failed to get adventurer state",
          };
        }
      },
    }),

    /**
     * Action to flee from a beast
     */
    action({
      name: "fleeBeast",
      description: "Try to flee from the beast you're currently facing",
      schema: z
        .object({
          adventurerId: z.string().describe("The ID of your adventurer"),
          toTheDeath: z
            .boolean()
            .default(false)
            .describe("Always false as this is a flee attempt"),
        })
        .describe("Try to flee from the beast you encountered"),
      async handler(data, ctx: any, _agent: Agent) {
        try {
          console.log(
            `[ACTION] Attempting to Flee - Adventurer ID: ${data.adventurerId}`
          );

          const { adventurerId, toTheDeath } = data;

          // Get current state through the state manager
          const currentState = await gameStateManager.getState(adventurerId);

          // Make sure we're in battle
          if (!currentState || currentState.inBattle !== "true") {
            return {
              success: false,
              error: "Not in battle",
              message: "Cannot flee: you are not in battle with a beast",
            };
          }

          // Store initial state to compare later
          const initialState = { ...currentState };

          // Record the name of the beast we're fleeing from
          const beastName = initialState.currentBeast || "Beast";
          console.log(`[FLEE] Attempting to flee from ${beastName}`);

          // Use Starknet to call flee function
          console.log(`[STARKNET] Calling flee function on contract`);
          const fleeResult = await starknet.write({
            contractAddress: GAME_CONTRACT_ADDRESS,
            entrypoint: "flee",
            calldata: [
              adventurerId,
              toTheDeath ? 1 : 0, // Typically should be 0 for flee
            ],
          });

          console.log(
            `[STARKNET] Transaction hash: ${fleeResult.transaction_hash}`
          );

          // Update state through the state manager
          const updatedState = await gameStateManager.updateAfterAction(
            adventurerId,
            `Fleeing from ${beastName}`,
            fleeResult.transaction_hash
          );

          if (!updatedState) {
            return {
              success: false,
              error: "Failed to retrieve updated adventurer state",
              message: "Failed to flee: could not get updated adventurer state",
            };
          }

          // Determine what happened during flee attempt by comparing before/after states

          // Calculate damage taken during flee attempt
          const initialHealth = parseInt(initialState.adventurerHealth || "0");
          const updatedHealth = parseInt(updatedState.adventurerHealth || "0");
          const damageTaken = Math.max(0, initialHealth - updatedHealth);

          // Update state with damage information
          updatedState.lastDamageTaken = damageTaken.toString();
          updatedState.lastDamageDealt = "0"; // We don't deal damage during flee attempts

          // Check if flee was successful - we're no longer in battle
          const fleeSuccessful = updatedState.inBattle === "false";

          // Check if adventurer died
          const adventurerDied = updatedHealth <= 0;

          // Create detailed action description
          let actionDescription = "";

          if (adventurerDied) {
            actionDescription = `Died while fleeing from ${beastName}`;
            console.log(`[DEATH] Your adventurer died while attempting to flee!`);
          } else if (fleeSuccessful) {
            actionDescription = `Successfully fled from ${beastName}`;
            if (damageTaken > 0) {
              actionDescription += ` (took ${damageTaken} damage)`;
            }
            console.log(`[FLEE] Successfully escaped from ${beastName}!`);
          } else {
            actionDescription = `Failed to flee from ${beastName}`;
            if (damageTaken > 0) {
              actionDescription += ` (took ${damageTaken} damage)`;
            }
            console.log(
              `[FLEE] Failed to escape from ${beastName}!${damageTaken > 0 ? ` Took ${damageTaken} damage!` : ''}`
            );
          }

          // Update the last action in state
          updatedState.lastAction = actionDescription;
          console.log(`[FLEE] Set lastAction to: "${actionDescription}"`);

          // Apply state to agent memory
          gameStateManager.applyToMemory(ctx);

          console.log(`[ACTION] Flee Attempt Complete - ${actionDescription}`);

          const stateSummary = generateStateSummary(updatedState);
          console.log(`[FLEE] Sending state summary to agent`);

          return {
            success: true,
            message: `${actionDescription}\n\n${stateSummary}`,
            details: {
              beastName,
              fleeSuccessful,
              damageTaken,
              adventurerDied,
              // Include the current health so the agent knows its situation
              currentHealth: updatedHealth,
              maxHealth: parseInt(updatedState.adventurerMaxHealth || "100")
            }
          };
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          console.error("[ERROR] Failed to flee from beast:", errorMessage);

          return {
            success: false,
            error: errorMessage,
            message: "Failed to flee from beast",
          };
        }
      },
    }),
  ],
});

// Add a utility function to wait for transaction confirmation
async function waitForTransaction(txHash: string, waitTime: number = 5000): Promise<void> {
  console.log(`[STARKNET] Waiting for transaction ${txHash} to be confirmed...`);

  try {
    // First add a small delay to allow transaction to propagate
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Then poll until the transaction is confirmed
    let status = "RECEIVED";
    let attempts = 0;
    const maxAttempts = 30; // Prevent infinite loops
    const pollInterval = 2000; // 2 seconds between checks

    while (!["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"].includes(status) && attempts < maxAttempts) {
      try {
        // Use the direct account.waitForTransaction method with polling
        const receipt = await starknet.write({
          contractAddress: GAME_CONTRACT_ADDRESS,
          entrypoint: "check_transaction_status", // Using a read-only entrypoint to get access to provider
          calldata: [txHash],
        });

        // Extract status from receipt if available
        if (receipt && typeof receipt === 'object' && 'execution_status' in receipt) {
          const executionStatus = receipt.execution_status;
          if (executionStatus === "SUCCEEDED") {
            status = "ACCEPTED_ON_L2";
          } else if (executionStatus === "REVERTED") {
            console.error(`[STARKNET] Transaction ${txHash} failed with status: REVERTED`);
            throw new Error(`Transaction failed: REVERTED`);
          }
        }

        if (!["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"].includes(status)) {
          console.log(`[STARKNET] Transaction ${txHash} not confirmed yet. Waiting...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      } catch (error) {
        console.warn(`[STARKNET] Error checking transaction status: ${error}`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.warn(`[STARKNET] Transaction confirmation timed out after ${attempts} attempts. Proceeding anyway.`);
    } else {
      console.log(`[STARKNET] Transaction ${txHash} confirmed with status: ${status}`);
    }
  } catch (error) {
    console.error(`[STARKNET] Error waiting for transaction: ${error}`);
    // Fall back to simple delay in case of errors with receipt fetching
    console.log(`[STARKNET] Falling back to delay of ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  console.log(`[STARKNET] Resuming after transaction confirmation`);
}

// Add back the createDreams initialization at the end of the file
// Add this at the very end of the file

// Initialize the agent
createDreams({
  logger: LogLevel.INFO,
  model: anthropic("claude-3-7-sonnet-latest"),
  extensions: [cliExtension, lootSurvivor],
  context: goalContexts,
  actions: [],
}).start({
  id: "loot-survivor-game",
  initialGoal:
    "Progress as far as possible in Loot Survivor, defeat beasts, collect loot, and upgrade your character.",
  initialTasks: [
    "Check adventurer state",
    "Start a new game if needed",
    "Explore and battle beasts strategically",
    "Manage equipment and upgrades",
    "Make decisions based on health and beast strength",
  ],
});

console.log(
  "Loot Survivor agent is now running! The agent will play the game through CLI."
);