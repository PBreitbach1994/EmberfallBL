// Core types for the rules engine. Everything here is plain JSON-serialisable data
// so that game state can be persisted, sent over the wire, and replayed.

export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
export const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
export type AbilityScores = Record<Ability, number>;

export type Skill =
  | "acrobatics" | "animalHandling" | "arcana" | "athletics" | "deception"
  | "history" | "insight" | "intimidation" | "investigation" | "medicine"
  | "nature" | "perception" | "performance" | "persuasion" | "religion"
  | "sleightOfHand" | "stealth" | "survival";

export type DamageType =
  | "acid" | "bludgeoning" | "cold" | "fire" | "force" | "lightning" | "necrotic"
  | "piercing" | "poison" | "psychic" | "radiant" | "slashing" | "thunder";

export type Condition =
  | "blinded" | "charmed" | "deafened" | "frightened" | "grappled" | "incapacitated"
  | "invisible" | "paralyzed" | "petrified" | "poisoned" | "prone" | "restrained"
  | "stunned" | "unconscious" | "exhaustion";

export type Size = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";

export type ClassId =
  | "fighter" | "rogue" | "cleric" | "wizard" | "barbarian" | "ranger"
  | "paladin" | "monk" | "bard" | "druid" | "sorcerer" | "warlock";
export type SpeciesId =
  | "human" | "elf" | "dwarf" | "halfling" | "dragonborn" | "gnome" | "goliath" | "orc" | "tiefling";
export type BackgroundId = "acolyte" | "criminal" | "sage" | "soldier";
export type FeatId = "alert" | "magicInitiateCleric" | "magicInitiateWizard" | "savageAttacker" | "skilled" | "tough";

export type WeaponMastery = "cleave" | "graze" | "nick" | "push" | "sap" | "slow" | "topple" | "vex";

export type WeaponProperty =
  | "ammunition" | "finesse" | "heavy" | "light" | "loading" | "reach" | "thrown" | "twoHanded" | "versatile";

export interface WeaponDef {
  id: string;
  name: string;
  category: "simple" | "martial";
  kind: "melee" | "ranged";
  damage: string;              // dice expression e.g. "1d8"
  versatileDamage?: string;
  damageType: DamageType;
  properties: WeaponProperty[];
  range?: [number, number];    // normal/long in feet for ranged or thrown
  mastery: WeaponMastery;
  cost: number;                // gp
  weight: number;
}

export interface ArmorDef {
  id: string;
  name: string;
  category: "light" | "medium" | "heavy" | "shield";
  baseAc: number;
  dexCap?: number;             // undefined = uncapped, 0 = no dex
  strReq?: number;
  stealthDisadvantage?: boolean;
  cost: number;
  weight: number;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: "weapon" | "armor" | "consumable" | "gear" | "treasure" | "material" | "quest";
  description: string;
  cost: number;
  weight?: number;
  /** consumable effect */
  use?: { heal?: string; effect?: string };
}

export interface InventoryItem { itemId: string; qty: number; equipped?: boolean }

// ---------------------------------------------------------------------------
// Spells

export type SpellTargeting =
  | { kind: "self" }
  | { kind: "creature"; range: number; count?: number; ally?: boolean }  // range in ft (5 = touch)
  | { kind: "area"; shape: "cone" | "cube" | "sphere" | "line"; size: number; range: number };

export interface SpellDef {
  id: string;
  name: string;
  level: number;                 // 0 = cantrip
  school: string;
  castingTime: "action" | "bonus" | "reaction";
  classes: ClassId[];
  targeting: SpellTargeting;
  concentration?: boolean;
  ritual?: boolean;
  /** how the spell resolves */
  attack?: "melee" | "ranged";
  save?: { ability: Ability; half?: boolean };
  damage?: { dice: string; type: DamageType; addMod?: boolean; perSlot?: string; cantripScale?: boolean };
  heal?: { dice: string; addMod?: boolean; perSlot?: string };
  /** structured rider effects understood by the engine */
  effect?: SpellEffect;
  description: string;
}

export type SpellEffect =
  | { kind: "bless" }
  | { kind: "acBonus"; amount: number }               // shield of faith
  | { kind: "shield" }                                 // reaction +5 AC
  | { kind: "condition"; condition: Condition; endsOnSave?: boolean }
  | { kind: "push"; feet: number }
  | { kind: "magicMissile"; darts: number }
  | { kind: "guidance" }
  | { kind: "mageArmor" }
  | { kind: "noReactions" }                            // shocking grasp
  | { kind: "slow"; feet: number }                     // ray of frost
  | { kind: "advantageNext" }                          // guiding bolt
  | { kind: "spiritualWeapon" }
  | { kind: "aid"; amount: number }
  | { kind: "sleep" }
  | { kind: "mistyStep"; feet: number }
  | { kind: "scorchingRay"; rays: number }
  | { kind: "huntersMark" }
  | { kind: "eldritchBlast" }
  | { kind: "hex" }
  | { kind: "smite"; dice: string; perSlot: string; type: DamageType; rider?: "burning" | "thunderous" }
  | { kind: "mockery" }
  | { kind: "noHeal" }
  | { kind: "faerieFire" }
  | { kind: "entangle" }
  | { kind: "moonbeam" }
  | { kind: "pattern" }
  | { kind: "armorOfAgathys"; amount: number }
  | { kind: "hellishRebuke" }
  | { kind: "chromaticOrb" }
  | { kind: "dissonantWhispers" }
  | { kind: "shillelagh" };

// ---------------------------------------------------------------------------
// Characters (persistent player characters)

export interface PersonalQuestProgress { questId: string; counters: Record<string, number>; complete: boolean }

export interface CharacterSheet {
  id: string;
  ownerId: string;             // user id, or "ai" for autonomous companions
  name: string;
  species: SpeciesId;
  classId: ClassId;
  subclass?: string;
  level: number;
  xp: number;
  background: BackgroundId;
  baseAbilities: AbilityScores;      // before background bonuses
  abilityBonuses: Partial<AbilityScores>;
  abilities: AbilityScores;          // final
  maxHp: number;
  hp: number;
  tempHp: number;
  hitDice: number;                   // remaining hit dice
  skillProficiencies: Skill[];
  expertise: Skill[];
  saveProficiencies: Ability[];
  feats: FeatId[];
  fightingStyle?: "defense" | "dueling" | "archery" | "greatWeapon" | "protection";
  weaponMasteries: string[];         // weapon ids
  spellsKnown: string[];             // spell ids (prepared for clerics/wizards)
  cantrips: string[];
  spellSlots: number[];              // index 1..9 = max slots
  spellSlotsUsed: number[];
  resources: Record<string, number>; // used counts: e.g. secondWind, actionSurge, rage, channelDivinity
  inventory: InventoryItem[];
  gold: number;
  personality?: { traits: string; ideal: string; bond: string; flaw: string; voice?: string };
  backstory?: string;
  portrait?: string;
  personalQuest?: PersonalQuestProgress;
  heroicInspiration: boolean;
  deathCount: number;
  dead: boolean;
  retired: boolean;
  prestige: number;
  hardcore: boolean;
  stats: { kills: Record<string, number>; scenariosCompleted: string[]; goldEarned: number; criticals: number; knockouts: number };
  conditions: Condition[];
  exhaustion: number;
  createdAt: number;
  /** campaign week the character died (Raise Dead window) */
  diedWeek?: number;
  /** id of the adventure the character is currently on */
  activeAdventureId?: string;
  /** AI personality prompt for companions */
  aiPersona?: string;
  /** title bought in the Curio Shop, e.g. "the Unbroken" */
  epithet?: string;
}

// ---------------------------------------------------------------------------
// Monsters

export interface MonsterAction {
  id: string;
  name: string;
  kind: "melee" | "ranged" | "save" | "multiattack" | "heal" | "special";
  toHit?: number;
  reach?: number;              // ft
  range?: [number, number];
  damage?: { dice: string; bonus: number; type: DamageType }[];
  save?: { ability: Ability; dc: number; half?: boolean };
  area?: { shape: "cone" | "sphere" | "line" | "cube"; size: number };
  multiattack?: string[];      // ids of actions
  rider?: { condition?: Condition; dcSave?: { ability: Ability; dc: number }; push?: number; note?: string };
  recharge?: number;           // recharges on d6 >= n
  usesPerDay?: number;
  description?: string;
  bonusAction?: boolean;
}

export type MonsterBehavior =
  | "brute"        // charge nearest, focus whoever hit it last
  | "skirmisher"   // hit and run, prefers flanking, uses disengage/hide bonus
  | "archer"       // keep distance, shoot weakest
  | "leader"       // stays back, buffs, commands
  | "pack"         // gang up on one target (pack tactics)
  | "mindless"     // nearest target, never retreats
  | "cowardly";    // flees when bloodied

export interface MonsterDef {
  id: string;
  name: string;
  size: Size;
  type: string;
  alignment: string;
  ac: number;
  hp: string;                  // dice expression, e.g. "2d6"
  avgHp: number;
  speed: number;
  climb?: number;
  fly?: number;
  swim?: number;
  abilities: AbilityScores;
  saves?: Partial<Record<Ability, number>>;
  skills?: Partial<Record<Skill, number>>;
  resistances?: DamageType[];
  immunities?: DamageType[];
  vulnerabilities?: DamageType[];
  conditionImmunities?: Condition[];
  senses?: string;
  passivePerception: number;
  languages?: string;
  cr: number;
  xp: number;
  traits?: { name: string; description: string; key?: string }[];
  actions: MonsterAction[];
  behavior: MonsterBehavior;
  initiativeBonus?: number;
}

// ---------------------------------------------------------------------------
// Encounter / combat state

export interface Point { x: number; y: number }

export type Tile = "floor" | "wall" | "difficult" | "water" | "pit" | "door" | "cover";

export interface GridMap {
  width: number;
  height: number;
  tiles: Tile[][];             // [y][x]
  labels?: { at: Point; text: string }[];
}

export type Controller =
  | { kind: "human"; userId: string }
  | { kind: "ai-player"; persona?: string }
  | { kind: "monster" };

export interface ActiveEffect {
  id: string;
  name: string;
  source: string;              // combatant id
  kind:
    | "bless" | "acBonus" | "shieldSpell" | "dodge" | "disengage" | "advantageNextAttackAgainst"
    | "vexed" | "sapped" | "slowed" | "rage" | "noReactions" | "helped" | "huntersMark" | "aid"
    | "hidden" | "spiritualWeapon" | "mageArmor" | "guidance" | "heroic"
    | "asleep" | "spiritGuardians" | "heldBySpell" | "frightenedBy" | "recklessAttack" | "toppleProne"
    | "inspired" | "hexed" | "innateSorcery" | "faerieFire" | "moonbeam" | "armorOfAgathys" | "sacredWeapon"
    | "noHeal" | "mockery" | "pattern" | "stunnedBy" | "shillelagh" | "burning" | "wildShape";
  point?: Point;
  dice?: string;
  condition?: Condition;
  saveDc?: number;
  saveAbility?: Ability;
  amount?: number;
  targetId?: string;           // for vex (advantage vs a target) / hunters mark
  expires: "startOfSourceTurn" | "endOfSourceTurn" | "endOfOwnTurn" | "startOfOwnTurn" | "concentration" | "never" | "used";
  concentration?: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  side: "party" | "enemy" | "neutral";
  controller: Controller;
  characterId?: string;        // when a PC
  monsterId?: string;          // when a monster
  level: number;
  size: Size;
  abilities: AbilityScores;
  profBonus: number;
  ac: number;
  maxHp: number;
  hp: number;
  tempHp: number;
  speed: number;
  pos: Point;
  initiative: number;
  initiativeBonus: number;
  conditions: Condition[];
  effects: ActiveEffect[];
  saveProficiencies: Ability[];
  saveBonuses?: Partial<Record<Ability, number>>;
  skillBonuses: Partial<Record<Skill, number>>;
  resistances: DamageType[];
  immunities: DamageType[];
  vulnerabilities: DamageType[];
  conditionImmunities: Condition[];
  /** for PCs */
  classId?: ClassId;
  subclass?: string;
  attacks: AttackOption[];
  spells: string[];            // spell ids castable (incl cantrips)
  spellSlots: number[];
  spellSlotsUsed: number[];
  spellAbility?: Ability;
  resources: Record<string, number>;   // remaining uses
  features: string[];          // feature keys (sneakAttack, secondWind, cunningAction, packTactics ...)
  monsterActions?: MonsterAction[];
  behavior?: MonsterBehavior;
  deathSaves: { successes: number; failures: number };
  stable: boolean;
  dead: boolean;
  fled: boolean;
  concentratingOn?: string;    // spell id
  xp?: number;
  heroicInspiration?: boolean;
  lastAttackerId?: string;
  speciesTraits?: string[];
  /** Druid Wild Shape: original statistics to restore */
  wildShape?: { ac: number; abilities: AbilityScores; speed: number; attacks: AttackOption[]; size: Size };
}

export interface AttackOption {
  id: string;
  name: string;
  kind: "melee" | "ranged";
  weaponId?: string;
  toHit: number;
  damage: string;              // e.g. "1d8"
  damageBonus: number;
  damageType: DamageType;
  reach: number;
  range?: [number, number];
  finesse?: boolean;
  light?: boolean;
  heavy?: boolean;
  mastery?: WeaponMastery;
  thrown?: boolean;
}

export interface TurnBudget {
  action: boolean;
  bonusAction: boolean;
  reaction: boolean;
  movement: number;            // feet remaining
  attacksLeft: number;         // for Extra Attack (within the Attack action)
  sneakAttackUsed: boolean;
  actionSurgeActive?: boolean;
  bonusSpellCast?: boolean;    // a leveled bonus-action spell cast this turn
  disengaged?: boolean;
  dashed?: boolean;
  lightAttackMade?: boolean;
  nickUsed?: boolean;
  cleaveUsed?: boolean;
  /** creatures hit this turn with a melee weapon / unarmed strike (for smites, stunning strike) */
  meleeHits?: { targetId: string; crit: boolean; smitten?: boolean; unarmed?: boolean }[];
  stunningUsed?: boolean;
  leveledSpellCast?: boolean;
  attackActionTaken?: boolean;
}

export interface LogEntry {
  t: number;
  kind: "narration" | "roll" | "combat" | "system" | "dialogue" | "loot" | "check" | "death" | "level";
  text: string;
  actorId?: string;
  data?: unknown;
}

export interface EncounterState {
  id: string;
  name: string;
  map: GridMap;
  combatants: Combatant[];
  order: string[];             // combatant ids in initiative order
  turnIndex: number;
  round: number;
  budget: TurnBudget;
  status: "active" | "victory" | "defeat" | "fled";
  difficulty?: "story" | "normal" | "hard" | "brutal";
  log: LogEntry[];
  objective?: string;
  rngState: number;
  xpPool: number;
  lootTableId?: string;
}

// ---------------------------------------------------------------------------
// Commands a controller may issue during combat. All are validated by the engine.

export type CombatCommand =
  | { type: "move"; to: Point }
  | { type: "attack"; attackId: string; targetId: string }
  | { type: "cast"; spellId: string; slotLevel?: number; targetIds?: string[]; point?: Point; metamagic?: "quickened" | "twinned"; damageType?: DamageType }
  | { type: "monsterAction"; actionId: string; targetIds?: string[]; point?: Point }
  | { type: "dash" }
  | { type: "disengage" }
  | { type: "dodge" }
  | { type: "help"; targetId: string }
  | { type: "hide" }
  | { type: "secondWind" }
  | { type: "actionSurge" }
  | { type: "rage" }
  | { type: "reckless" }
  | { type: "smite"; spellId: string; targetId: string; slotLevel?: number }
  | { type: "layOnHands"; targetId: string; amount: number; curePoison?: boolean }
  | { type: "martialArts"; targetId: string }
  | { type: "flurryOfBlows"; targetIds: string[]; technique?: "addle" | "push" | "topple" }
  | { type: "patientDefense"; focus?: boolean }
  | { type: "stepOfTheWind"; focus?: boolean }
  | { type: "stunningStrike"; targetId: string }
  | { type: "bardicInspiration"; targetId: string }
  | { type: "innateSorcery" }
  | { type: "fontOfMagic"; mode: "createSlot" | "toPoints"; slotLevel: number }
  | { type: "wildShape" }
  | { type: "revertShape" }
  | { type: "landsAid"; point: Point; healTargetId?: string }
  | { type: "moveMoonbeam"; point: Point }
  | { type: "breathWeapon"; point: Point }
  | { type: "cunningAction"; mode: "dash" | "disengage" | "hide" }
  | { type: "channelDivinity"; mode: "turnUndead" | "divineSpark" | "preserveLife" | "sacredWeapon"; targetId?: string }
  | { type: "useItem"; itemId: string; targetId?: string }
  | { type: "stabilize"; targetId: string }
  | { type: "standUp" }
  | { type: "endTurn" };

export interface CommandResult {
  ok: boolean;
  error?: string;
  log: LogEntry[];
}
