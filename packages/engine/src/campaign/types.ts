// Content formats for authored campaign material: scenarios (scene graphs), road/town events,
// personal quests and town buildings. The AI DM narrates and improvises *within* these graphs;
// it may never invent rewards, encounters or exits that aren't declared here.
import type { Ability, ClassId, DamageType, Skill } from "../types.js";

export type Effect =
  | { kind: "gold"; amount: number }
  | { kind: "item"; itemId: string; qty?: number }
  | { kind: "removeItem"; itemId: string; qty?: number }
  | { kind: "xp"; amount: number }
  | { kind: "flag"; flag: string }                       // campaign-wide flag
  | { kind: "unflag"; flag: string }
  | { kind: "damage"; dice: string; type: DamageType; who: "all" | "chooser" | "random" }
  | { kind: "heal"; dice: string; who: "all" | "chooser" }
  | { kind: "material"; id: "timber" | "iron" | "herbs" | "relic"; qty: number }
  | { kind: "prosperity"; amount: number }
  | { kind: "rest"; type: "short" | "long" }
  | { kind: "condition"; condition: "poisoned" | "exhaustion"; who: "all" | "chooser" }
  | { kind: "unlockScenario"; scenarioId: string }
  | { kind: "questCounter"; counter: string; amount: number }   // advances personal quests
  | { kind: "reputation"; amount: number };

export interface Outcome {
  text: string;
  goto?: string;           // next node id
  effects?: Effect[];
}

export interface OptionRequirement {
  flag?: string;           // campaign or scenario flag must be set
  notFlag?: string;
  item?: string;           // someone in the party carries this item
  classId?: ClassId;       // someone in the party has this class
  proficient?: Skill;      // someone is proficient in this skill
  gold?: number;           // party can pay this
}

export interface SceneCheck {
  skill?: Skill;
  ability?: Ability;
  save?: boolean;
  dc: number;
  /** who rolls: the acting character, the best-suited character, or the whole party (group check) */
  who?: "actor" | "best" | "group";
}

export interface SceneOption {
  id: string;
  label: string;
  requires?: OptionRequirement;
  check?: SceneCheck;
  success: Outcome;
  failure?: Outcome;
  /** hidden from the option list but available to the AI DM when a player's free-text action matches */
  hidden?: boolean;
  once?: boolean;
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  personality: string;
  voice?: string;
  secrets?: string[];
  attitude?: "hostile" | "indifferent" | "friendly";
}

export interface EncounterDef {
  id: string;
  name: string;
  /** ASCII map: '#' wall, '.' floor, ':' difficult, '~' water, 'O' pit, '+' door, '%' cover */
  map: string[];
  monsters: { monsterId: string; at: [number, number]; name?: string }[];
  partyStart: [number, number][];
  objective?: string;
  surprise?: "party" | "enemy";
  onVictory: Outcome;
  onDefeat?: Outcome;
  /** scale extra monsters per party member beyond 4 / remove below 3 */
  scaling?: { perExtraHero?: string; perMissingHero?: string };
  loot?: Effect[];
}

export interface SceneNode {
  id: string;
  title: string;
  /** authored narration; the AI DM expands on this but must preserve its facts */
  text: string;
  /** private notes for the DM (secrets, NPC motives, what's really going on) */
  dmNotes?: string;
  npcs?: NpcDef[];
  options: SceneOption[];
  encounter?: EncounterDef;
  onEnter?: Effect[];
  /** the AI DM may award small improvised rewards up to these caps for clever play */
  improv?: { maxGold?: number; allowedItems?: string[]; maxDc?: number };
  end?: "success" | "failure" | "retreat";
}

export interface Scenario {
  id: string;
  name: string;
  /** one-line job posting on the tavern board */
  hook: string;
  summary: string;
  location: string;
  recommendedLevel: [number, number];
  requires?: { flags?: string[]; scenarios?: string[] };
  start: string;
  nodes: Record<string, SceneNode>;
  /** granted on reaching an end: "success" node */
  rewards: { xp: number; gold: number; effects?: Effect[]; unlocks?: string[] };
  /** a short arc label for the campaign map */
  arc: string;
  mapPosition: [number, number];
}

export interface EventCard {
  id: string;
  deck: "road" | "town";
  season?: "summer" | "winter";
  title: string;
  text: string;
  options: SceneOption[];
}

export interface PersonalQuest {
  id: string;
  name: string;
  description: string;
  /** counters required to complete, e.g. { killUndead: 12 } */
  goals: Record<string, number>;
  unlock: { kind: "class"; classId: ClassId } | { kind: "building"; buildingId: string } | { kind: "scenario"; scenarioId: string } | { kind: "prestige"; perk: string };
  unlockText: string;
}

export interface BuildingLevel {
  cost: { gold: number; timber?: number; iron?: number; herbs?: number; relic?: number };
  description: string;
  unlocks: string[];   // service/shop keys
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  levels: BuildingLevel[]; // index 0 = level 1
  startingLevel: number;   // 0 = unbuilt
}

export interface CampaignState {
  id: string;
  name: string;
  createdAt: number;
  week: number;
  season: "summer" | "winter";
  prosperity: number;
  reputation: number;
  treasury: number;
  materials: Record<"timber" | "iron" | "herbs" | "relic", number>;
  buildings: Record<string, number>;
  unlockedScenarios: string[];
  completedScenarios: string[];
  failedScenarios: string[];
  flags: string[];
  unlockedClasses: ClassId[];
  roadDeck: string[];
  townDeck: string[];
  retired: { characterId: string; name: string; classId: ClassId; questId?: string; week: number; prestige?: boolean }[];
  chronicle: { week: number; text: string }[];
  settings: CampaignSettings;
}

export interface CampaignSettings {
  hardcore: boolean;              // permadeath: no resurrection
  flanking: boolean;              // optional rule: advantage when flanking
  aiDm: boolean;                  // use the AI DM for narration (requires API key)
  aiCompanionBanter: boolean;
  autoReactions: boolean;
  maxPartySize: number;
  allowAutonomousParties: boolean; // AI-only parties may run quests on their own
}
