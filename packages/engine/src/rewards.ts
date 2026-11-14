// Embers: a player-level reward currency (separate from in-game gold) and the Curio Shop catalog.
// Everything here is cosmetic or a small, bounded story perk so the D&D economy stays intact.

export type RewardKind = "dice" | "backdrop" | "story";

export interface DiceFacePalette { fill: string; stroke: string; inner: string; num: string }
export interface DiceSkin { d20: DiceFacePalette; damage: DiceFacePalette; heal: DiceFacePalette; glow?: string; sparkle?: boolean }
export interface Backdrop { page: string; felt: string; accent: string }

export interface RewardItem {
  id: string;
  kind: RewardKind;
  name: string;
  price: number;
  description: string;
  dice?: DiceSkin;
  backdrop?: Backdrop;
  /** story items: consumables stack up to `max`; others are one-time use */
  consumable?: boolean;
  max?: number;
  needsCharacter?: boolean;
  needsText?: boolean;
}

const p = (fill: string, stroke: string, inner: string, num: string): DiceFacePalette => ({ fill, stroke, inner, num });

export const REWARDS: RewardItem[] = [
  // ---------------------------------------------------------------- dice
  { id: "dice:ivory", kind: "dice", name: "Tavern Ivory", price: 0, description: "Bone-white dice worn smooth by a thousand tavern tables. Everyone starts with these.",
    dice: { d20: p("#efe3c4", "#8a6a2e", "#f8efd6", "#2a1a0c"), damage: p("#b8402a", "#5c1a10", "#c9533a", "#fff7e6"), heal: p("#3c9a5f", "#134d2a", "#4fb070", "#fff7e6") } },
  { id: "dice:obsidian", kind: "dice", name: "Obsidian & Gold", price: 60, description: "Volcanic glass inlaid with gold leaf. Heavy in the hand, loud on the table.",
    dice: { d20: p("#1b1714", "#c9a24a", "#2a231d", "#f1cf6b"), damage: p("#2a1414", "#c9a24a", "#3a1c1c", "#f1cf6b"), heal: p("#14231a", "#c9a24a", "#1d3324", "#f1cf6b"), glow: "#f1cf6b" } },
  { id: "dice:jade", kind: "dice", name: "Verdant Jade", price: 60, description: "Carved by Ashwood druids from river jade. Smells faintly of rain.",
    dice: { d20: p("#5fae86", "#1f5a3c", "#7cc39e", "#0e2b1c"), damage: p("#2f7a55", "#0f3a26", "#3f8e66", "#e9fff2"), heal: p("#9ad7b4", "#2f7a55", "#b6e6ca", "#0e2b1c") } },
  { id: "dice:ember", kind: "dice", name: "Ember Glass", price: 80, description: "Blown glass with a live coal sealed inside. Warm to the touch.",
    dice: { d20: p("#ff9a3c", "#8a3a08", "#ffc070", "#3a1400"), damage: p("#e0501c", "#6a1c04", "#f06a32", "#fff2e0"), heal: p("#ffd27a", "#8a5a08", "#ffe3a6", "#3a2400"), glow: "#ff7a1f" } },
  { id: "dice:frost", kind: "dice", name: "Frostbite", price: 80, description: "Rime-ice dice from the Frostbound Pass. They never quite melt.",
    dice: { d20: p("#cfe9ff", "#4a86b8", "#e6f4ff", "#123048"), damage: p("#5aa0d8", "#1a4a70", "#78b6e6", "#f2faff"), heal: p("#a8e6ef", "#3a8a96", "#c6f1f6", "#103a40"), glow: "#9fd8ff" } },
  { id: "dice:bloodstone", kind: "dice", name: "Bloodstone", price: 100, description: "Deep green stone shot through with red veins. Mercenaries swear by them.",
    dice: { d20: p("#24402f", "#a0262a", "#2e5039", "#ffd6cc"), damage: p("#7a1418", "#2a0608", "#921c20", "#ffe2dc"), heal: p("#2e5039", "#a0262a", "#3a6448", "#ffd6cc"), glow: "#d43a3a" } },
  { id: "dice:starlit", kind: "dice", name: "Starlit Void", price: 150, description: "A sliver of the night sky, cut into twenty faces. Something moves inside.",
    dice: { d20: p("#1c1438", "#b9a2ff", "#2a1e52", "#ffe9a8"), damage: p("#3a1450", "#d9a2ff", "#4a1e64", "#ffe9a8"), heal: p("#142a48", "#a2d9ff", "#1e3a60", "#ffe9a8"), glow: "#b9a2ff", sparkle: true } },
  { id: "dice:dragonbone", kind: "dice", name: "Dragonbone", price: 200, description: "Carved from the knucklebone of a red dragon. The runes glow when you roll high.",
    dice: { d20: p("#e8dcc0", "#7a1c10", "#f2e8d0", "#7a1c10"), damage: p("#c43a1a", "#3a0a04", "#d85230", "#fff0d8"), heal: p("#e8dcc0", "#2f6a3a", "#f2e8d0", "#2f6a3a"), glow: "#ff5a2a", sparkle: true } },

  // ---------------------------------------------------------------- backdrops
  { id: "backdrop:oak", kind: "backdrop", name: "Tavern Oak", price: 0, description: "Smoke-dark timber and ember light. Home.",
    backdrop: { page: "radial-gradient(ellipse at 50% -10%, #3a2516 0%, #1a120c 55%, #0f0a07 100%)", felt: "#1f5a3a", accent: "#ff8a33" } },
  { id: "backdrop:ashwood", kind: "backdrop", name: "Moonlit Ashwood", price: 80, description: "Silver moonlight through black branches.",
    backdrop: { page: "radial-gradient(ellipse at 70% -10%, #2e3d4a 0%, #121a1f 50%, #090d10 100%)", felt: "#23402f", accent: "#a8c8e0" } },
  { id: "backdrop:chapel", kind: "backdrop", name: "Drowned Chapel", price: 100, description: "Green water light rippling over old stone.",
    backdrop: { page: "radial-gradient(ellipse at 30% 0%, #1d3a3a 0%, #0f1f22 55%, #070f11 100%)", felt: "#1a4848", accent: "#6fd6c4" } },
  { id: "backdrop:frostbound", kind: "backdrop", name: "Frostbound Pass", price: 120, description: "Blue dusk over the mountain snows.",
    backdrop: { page: "linear-gradient(180deg, #2b3b55 0%, #16203a 45%, #0b1020 100%)", felt: "#2a4766", accent: "#bfe3ff" } },
  { id: "backdrop:crypt", kind: "backdrop", name: "Royal Crypt", price: 150, description: "Purple shadow and tarnished gold beneath the old keep.",
    backdrop: { page: "radial-gradient(ellipse at 50% 0%, #34203f 0%, #170e1d 55%, #0a060d 100%)", felt: "#3a2448", accent: "#d9b45a" } },
  { id: "backdrop:hearth", kind: "backdrop", name: "Hearthfire Gold", price: 200, description: "For heroes who've earned the best seat by the fire.",
    backdrop: { page: "radial-gradient(ellipse at 50% 110%, #6a3a12 0%, #2a1608 50%, #120904 100%)", felt: "#5a2a14", accent: "#ffcf4d" } },

  // ---------------------------------------------------------------- story perks
  { id: "story:map", kind: "story", name: "Pathfinder's Map", price: 30, consumable: true, max: 3,
    description: "Skip the road event on your next adventure. Tick it in the Start Adventure dialog." },
  { id: "story:inspiration", kind: "story", name: "Inspiration Draught", price: 40, consumable: true, max: 3, needsCharacter: true,
    description: "Give one of your heroes Heroic Inspiration: their next failed check is rerolled." },
  { id: "story:epithet", kind: "story", name: "Hero's Epithet", price: 50, needsCharacter: true, needsText: true,
    description: "Give a hero a title the whole tavern will use — “Torvald the Unbroken”." },
  { id: "story:phoenix", kind: "story", name: "Phoenix Feather", price: 150, needsCharacter: true,
    description: "Burn it over a fallen hero and they rise — 1 HP and 2 levels of exhaustion, like a temple raising. Once per hero, ever. Not on Hard or Brutal difficulty, or in Hardcore." },
  { id: "story:ballad", kind: "story", name: "Bard's Ballad", price: 75, needsCharacter: true,
    description: "Commission a ballad of your hero's deeds. It's sung in the tavern and written into the campaign chronicle." },
];

export const REWARD_BY_ID: Record<string, RewardItem> = Object.fromEntries(REWARDS.map((r) => [r.id, r]));
export const DEFAULT_DICE = "dice:ivory";
export const DEFAULT_BACKDROP = "backdrop:oak";
export const MONSTER_DICE: DiceSkin = {
  d20: p("#4a4a52", "#16161a", "#5a5a64", "#e8e8f0"), damage: p("#5a2a2a", "#1a0a0a", "#6a3434", "#ffe0e0"), heal: p("#2a4a3a", "#0a1a12", "#345a46", "#e0ffe8"),
};

/** How many Embers a finished adventure is worth to each human player. */
export const EMBER_RULES = {
  welcome: 25,
  complete: 12,          // scenario success (× difficulty multiplier)
  attempt: 4,            // failed or retreated: you still played
  perKill: 1,            // monsters your heroes finished off (max 8 per adventure)
  dailyFirst: 5,         // first finished adventure of the day
  questComplete: 25,
  levelUp: 5,
  retire: 50,
  difficulty: { story: 0.5, normal: 1, hard: 1.5, brutal: 2 } as Record<string, number>,
};

export interface EmberLedgerEntry { t: number; amount: number; reason: string }

export interface RewardsView {
  embers: number;
  lifetime: number;
  owned: string[];
  equipped: { dice: string; backdrop: string };
  consumables: Record<string, number>;
  ledger: EmberLedgerEntry[];
}
