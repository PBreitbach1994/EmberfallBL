// Species, backgrounds and origin feats from the SRD 5.2.1 (2024 rules), CC-BY-4.0.
import type { Ability, BackgroundId, DamageType, FeatId, Size, Skill, SpeciesId } from "../types.js";

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  size: Size;
  speed: number;
  darkvision: number;
  resistances: DamageType[];
  traits: { key: string; name: string; description: string }[];
  bonusSkills?: number;          // human Skillful
  skillChoice?: Skill[];         // elf Keen Senses
  cantrips?: string[];
  bonusFeat?: boolean;           // human Versatile
  description: string;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  human: { id: "human", name: "Human", size: "medium", speed: 30, darkvision: 0, resistances: [], bonusSkills: 1, bonusFeat: true,
    traits: [
      { key: "resourceful", name: "Resourceful", description: "You gain Heroic Inspiration whenever you finish a Long Rest." },
      { key: "skillful", name: "Skillful", description: "You gain proficiency in one skill of your choice." },
      { key: "versatile", name: "Versatile", description: "You gain an Origin feat of your choice." },
    ],
    description: "Ambitious and adaptable, found in every corner of the world." },
  elf: { id: "elf", name: "Elf", size: "medium", speed: 30, darkvision: 60, resistances: [], skillChoice: ["insight", "perception", "survival"], cantrips: ["prestidigitation"],
    traits: [
      { key: "feyAncestry", name: "Fey Ancestry", description: "Advantage on saving throws to avoid or end the Charmed condition." },
      { key: "keenSenses", name: "Keen Senses", description: "Proficiency in Insight, Perception, or Survival." },
      { key: "trance", name: "Trance", description: "You don't need to sleep, and magic can't put you to sleep." },
    ],
    description: "Long-lived people of the old forests, touched by the magic of the Feywild." },
  dwarf: { id: "dwarf", name: "Dwarf", size: "medium", speed: 30, darkvision: 120, resistances: ["poison"],
    traits: [
      { key: "dwarvenResilience", name: "Dwarven Resilience", description: "Resistance to Poison damage; advantage on saves to avoid or end the Poisoned condition." },
      { key: "dwarvenToughness", name: "Dwarven Toughness", description: "Your HP maximum increases by 1, and by 1 again whenever you gain a level." },
      { key: "stonecunning", name: "Stonecunning", description: "Tremorsense through stone (narrative)." },
    ],
    description: "Stout folk of the deep halls, enduring as the mountains." },
  halfling: { id: "halfling", name: "Halfling", size: "small", speed: 30, darkvision: 0, resistances: [],
    traits: [
      { key: "brave", name: "Brave", description: "Advantage on saves to avoid or end the Frightened condition." },
      { key: "halflingNimbleness", name: "Halfling Nimbleness", description: "You can move through the space of any creature larger than you." },
      { key: "luck", name: "Luck", description: "When you roll a 1 on a d20 Test, you can reroll the die and must use the new roll." },
      { key: "naturallyStealthy", name: "Naturally Stealthy", description: "You can take the Hide action while obscured only by a larger creature." },
    ],
    description: "Small, cheerful folk who prize home and hearth, and fortune that favours the bold." },
  dragonborn: { id: "dragonborn", name: "Dragonborn", size: "medium", speed: 30, darkvision: 60, resistances: ["fire"],
    traits: [
      { key: "breathWeapon", name: "Breath Weapon (Red/Fire)", description: "Replace one attack with a 15-ft cone: Dex save (DC 8 + Con mod + PB), 1d10 fire (2d10 at 5th), half on success. Uses = proficiency bonus per Long Rest." },
      { key: "damageResistance", name: "Damage Resistance", description: "Resistance to Fire damage (from your draconic ancestry)." },
    ],
    description: "Proud descendants of dragons, bearing their ancestors' breath and scales." },
  gnome: { id: "gnome", name: "Gnome", size: "small", speed: 30, darkvision: 60, resistances: [],
    traits: [{ key: "gnomishCunning", name: "Gnomish Cunning", description: "Advantage on Intelligence, Wisdom, and Charisma saving throws." }],
    description: "Curious tinkerers and illusionists with boundless enthusiasm." },
  goliath: { id: "goliath", name: "Goliath", size: "medium", speed: 35, darkvision: 0, resistances: [],
    traits: [
      { key: "stonesEndurance", name: "Giant Ancestry: Stone's Endurance", description: "Reaction when you take damage: roll 1d12 + Con mod and reduce the damage by that total. Uses = proficiency bonus per Long Rest." },
      { key: "powerfulBuild", name: "Powerful Build", description: "Advantage on checks to end the Grappled condition; count as one size larger for carrying." },
    ],
    description: "Towering mountain folk with the blood of giants." },
  orc: { id: "orc", name: "Orc", size: "medium", speed: 30, darkvision: 120, resistances: [],
    traits: [
      { key: "adrenalineRush", name: "Adrenaline Rush", description: "Dash as a Bonus Action and gain temp HP equal to your proficiency bonus. Uses = proficiency bonus per Short or Long Rest." },
      { key: "relentlessEndurance", name: "Relentless Endurance", description: "When reduced to 0 HP but not killed outright, drop to 1 HP instead. Once per Long Rest." },
    ],
    description: "Tireless, powerful folk gifted by their god with endurance." },
  tiefling: { id: "tiefling", name: "Tiefling", size: "medium", speed: 30, darkvision: 60, resistances: ["fire"], cantrips: ["fireBolt", "thaumaturgy"],
    traits: [
      { key: "infernalLegacy", name: "Fiendish Legacy (Infernal)", description: "Resistance to Fire damage; you know the Fire Bolt cantrip." },
      { key: "otherworldlyPresence", name: "Otherworldly Presence", description: "You know the Thaumaturgy cantrip." },
    ],
    description: "Bearers of a fiendish legacy in their blood." },
};

export interface BackgroundDef {
  id: BackgroundId;
  name: string;
  abilityOptions: [Ability, Ability, Ability];
  feat: FeatId;
  skills: [Skill, Skill];
  tool: string;
  equipment: { itemId: string; qty: number }[];
  gold: number;
  description: string;
}

export const BACKGROUNDS: Record<BackgroundId, BackgroundDef> = {
  acolyte: { id: "acolyte", name: "Acolyte", abilityOptions: ["int", "wis", "cha"], feat: "magicInitiateCleric", skills: ["insight", "religion"],
    tool: "Calligrapher's Supplies", equipment: [{ itemId: "holySymbol", qty: 1 }], gold: 8,
    description: "You devoted yourself to service in a temple." },
  criminal: { id: "criminal", name: "Criminal", abilityOptions: ["dex", "con", "int"], feat: "alert", skills: ["sleightOfHand", "stealth"],
    tool: "Thieves' Tools", equipment: [{ itemId: "dagger", qty: 2 }, { itemId: "thievesTools", qty: 1 }], gold: 16,
    description: "You eked out a living in dark alleys, cutting purses or burgling shops." },
  sage: { id: "sage", name: "Sage", abilityOptions: ["con", "int", "wis"], feat: "magicInitiateWizard", skills: ["arcana", "history"],
    tool: "Calligrapher's Supplies", equipment: [{ itemId: "quarterstaff", qty: 1 }], gold: 8,
    description: "You spent your formative years travelling between manors and monasteries, studying lore." },
  soldier: { id: "soldier", name: "Soldier", abilityOptions: ["str", "dex", "con"], feat: "savageAttacker", skills: ["athletics", "intimidation"],
    tool: "Gaming Set", equipment: [{ itemId: "spear", qty: 1 }, { itemId: "shortbow", qty: 1 }, { itemId: "arrows", qty: 1 }, { itemId: "potionHealing", qty: 1 }], gold: 14,
    description: "You began training for war as soon as you reached adulthood." },
};

export interface FeatDef { id: FeatId; name: string; description: string }

export const FEATS: Record<FeatId, FeatDef> = {
  alert: { id: "alert", name: "Alert", description: "Add your proficiency bonus to Initiative rolls." },
  magicInitiateCleric: { id: "magicInitiateCleric", name: "Magic Initiate (Cleric)", description: "Learn two cleric cantrips (Guidance, Sacred Flame) and one 1st-level spell (Bless) castable once per Long Rest." },
  magicInitiateWizard: { id: "magicInitiateWizard", name: "Magic Initiate (Wizard)", description: "Learn two wizard cantrips (Fire Bolt, Mage Hand) and one 1st-level spell (Magic Missile) castable once per Long Rest." },
  savageAttacker: { id: "savageAttacker", name: "Savage Attacker", description: "Once per turn when you hit with a weapon, roll the damage dice twice and use either roll." },
  skilled: { id: "skilled", name: "Skilled", description: "Gain proficiency in any combination of three skills or tools." },
  tough: { id: "tough", name: "Tough", description: "Your HP maximum increases by twice your character level." },
};

export const SKILL_ABILITY: Record<Skill, Ability> = {
  acrobatics: "dex", animalHandling: "wis", arcana: "int", athletics: "str", deception: "cha", history: "int",
  insight: "wis", intimidation: "cha", investigation: "int", medicine: "wis", nature: "int", perception: "wis",
  performance: "cha", persuasion: "cha", religion: "int", sleightOfHand: "dex", stealth: "dex", survival: "wis",
};

export const SKILL_NAMES: Record<Skill, string> = {
  acrobatics: "Acrobatics", animalHandling: "Animal Handling", arcana: "Arcana", athletics: "Athletics", deception: "Deception",
  history: "History", insight: "Insight", intimidation: "Intimidation", investigation: "Investigation", medicine: "Medicine",
  nature: "Nature", perception: "Perception", performance: "Performance", persuasion: "Persuasion", religion: "Religion",
  sleightOfHand: "Sleight of Hand", stealth: "Stealth", survival: "Survival",
};

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};
