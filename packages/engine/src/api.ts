// Shared contract between the server and the web client.
import type { AbilityScores, CharacterSheet, ClassId, CombatCommand, EncounterState, LogEntry, Skill, Ability, Point } from "./types.js";
import type { CampaignState, BuildingDef } from "./campaign/types.js";
import type { CharacterCreationInput, LevelUpChoices } from "./rules/character.js";
import type { DmMode } from "./campaign/adventure.js";

export interface UserInfo { id: string; name: string; isAdmin: boolean }

export interface OptionView { id: string; label: string; check?: string; available: boolean; reason?: string }

export interface PartyMemberView {
  characterId: string;
  name: string;
  classId: ClassId;
  species: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  controller: "human" | "ai-player";
  userId: string;
  userName?: string;
  dead: boolean;
  conditions: string[];
}

export interface AdventureView {
  id: string;
  title: string;
  scenarioId: string;
  status: "exploring" | "combat" | "complete" | "failed" | "retreated";
  dmMode: DmMode;
  hostUserId: string;
  dmUserId?: string;
  autonomous?: boolean;
  /** pending road event before the scenario begins */
  event?: { id: string; title: string; text: string; options: OptionView[] };
  node: { id: string; title: string; narration: string; options: OptionView[]; npcs: { name: string; role: string }[] } | null;
  /** DM-only info (human DM sees this) */
  dmInfo?: { dmNotes?: string; hiddenOptions: OptionView[]; nodes: { id: string; title: string }[]; npcs: { name: string; role: string; personality: string; secrets?: string[] }[] };
  party: PartyMemberView[];
  encounter?: EncounterState;
  log: LogEntry[];
  thinking: boolean;
  openSeats: number;
  summary?: { xp: number; gold: number; outcome: string };
}

export interface AdventureSummary {
  id: string;
  title: string;
  status: AdventureView["status"];
  dmMode: DmMode;
  party: { name: string; classId: ClassId; level: number; controller: "human" | "ai-player" }[];
  hostName: string;
  openSeats: number;
  autonomous?: boolean;
  updatedAt: number;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  hook: string;
  summary: string;
  location: string;
  recommendedLevel: [number, number];
  available: boolean;
  reason?: string;
  completed: boolean;
  mapPosition: [number, number];
  arc: string;
}

export interface ShopItem { itemId: string; name: string; price: number; kind: string; description: string; requires?: string }

export interface CampaignView {
  campaign: CampaignState;
  scenarios: ScenarioSummary[];
  buildings: { def: BuildingDef; level: number; canUpgrade: boolean; nextCost?: BuildingDef["levels"][number]["cost"] }[];
  shop: ShopItem[];
  services: string[];
  adventures: AdventureSummary[];
  world: { name: string; tavern: string; overview: string; keeper: { name: string; description: string } };
  aiAvailable: boolean;
}

export type AdventureAction =
  | { kind: "choose"; optionId: string }
  | { kind: "event"; optionId: string }
  | { kind: "say"; text: string }
  | { kind: "combat"; command: CombatCommand }
  | { kind: "autoTurn" }
  | { kind: "takeOver"; characterId: string }
  | { kind: "release"; characterId: string }
  | { kind: "retreat" }
  // human DM tools
  | { kind: "dmNarrate"; text: string }
  | { kind: "dmGoto"; nodeId: string }
  | { kind: "dmCheck"; skill?: Skill; ability?: Ability; dc: number; who: "best" | "group" | string; reason: string }
  | { kind: "dmAward"; gold?: number; itemId?: string; xp?: number; characterId?: string }
  | { kind: "dmChooseFor"; optionId: string; characterId?: string }
  | { kind: "dmSpawn"; monsterId: string; at: Point }
  | { kind: "dmEnd"; outcome: "success" | "failure" | "retreat" };

export interface NewAdventureRequest {
  scenarioId: string;
  characterIds: string[];       // the requester's own characters (human-controlled)
  companionIds: string[];       // AI companions to bring along
  dmMode: DmMode;               // "ai" (Claude DM), "scripted" (no API key), "human" (requester DMs)
  openSeats: number;            // seats friends may join
  autonomous?: boolean;         // AI-only party plays on its own
}

export type ServerMessage =
  | { type: "adventure"; view: AdventureView }
  | { type: "campaign" }
  | { type: "error"; message: string };

export type CreateCharacterRequest = Omit<CharacterCreationInput, "ownerId" | "trustedRoll"> & { rollToken?: string; personalQuestId?: string; asCompanion?: boolean };
export type LevelUpRequest = LevelUpChoices;
export interface RollResponse { scores: number[]; rollToken: string }
export type { CharacterSheet, AbilityScores, Point };
