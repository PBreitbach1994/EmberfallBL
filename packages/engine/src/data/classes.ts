// Classes from the SRD 5.2.1 (2024 rules), CC-BY-4.0. Levels 1-5 are implemented.
import type { Ability, ClassId, Skill } from "../types.js";

export interface ClassFeature { level: number; key: string; name: string; description: string }

export interface EquipmentPackage { id: string; label: string; items: { itemId: string; qty: number; equipped?: boolean }[]; gold: number }

export interface ClassDef {
  id: ClassId;
  name: string;
  hitDie: number;
  primary: Ability[];
  saves: [Ability, Ability];
  skillCount: number;
  skillOptions: Skill[];
  armor: ("light" | "medium" | "heavy" | "shield")[];
  weapons: "simple" | "martial" | "rogue";   // rogue = simple + martial with finesse/light
  masteryCount: number;
  spellcasting?: { ability: Ability; kind: "full" | "half"; cantrips: number[]; prepared: number[] };
  subclass: { level: number; id: string; name: string };
  features: ClassFeature[];
  equipment: EquipmentPackage[];
  suggestedAbilities: Record<Ability, number>; // standard array assignment
  description: string;
}

// 2024 full-caster slots by level (index = spell level)
export const FULL_CASTER_SLOTS: number[][] = [
  [], [0, 2], [0, 3], [0, 4, 2], [0, 4, 3], [0, 4, 3, 2],
];
export const HALF_CASTER_SLOTS: number[][] = [
  [], [0, 2], [0, 2], [0, 3], [0, 3], [0, 4, 2],
];

export const XP_THRESHOLDS = [0, 0, 300, 900, 2700, 6500, 14000];
export const MAX_LEVEL = 5;

export const CLASSES: Record<ClassId, ClassDef> = {
  fighter: {
    id: "fighter", name: "Fighter", hitDie: 10, primary: ["str", "dex"], saves: ["str", "con"], skillCount: 2,
    skillOptions: ["acrobatics", "animalHandling", "athletics", "history", "insight", "intimidation", "persuasion", "perception", "survival"],
    armor: ["light", "medium", "heavy", "shield"], weapons: "martial", masteryCount: 3,
    subclass: { level: 3, id: "champion", name: "Champion" },
    features: [
      { level: 1, key: "fightingStyle", name: "Fighting Style", description: "Choose a fighting style feat (Defense, Dueling, Archery, Great Weapon Fighting)." },
      { level: 1, key: "secondWind", name: "Second Wind", description: "Bonus Action: regain 1d10 + fighter level HP. Two uses, regain one on a Short Rest and all on a Long Rest." },
      { level: 1, key: "weaponMastery", name: "Weapon Mastery", description: "Use the mastery properties of three kinds of weapons." },
      { level: 2, key: "actionSurge", name: "Action Surge", description: "Take one additional action on your turn (not Magic). Once per Short or Long Rest." },
      { level: 2, key: "tacticalMind", name: "Tactical Mind", description: "When you fail an ability check, expend a Second Wind use to add 1d10 to it." },
      { level: 3, key: "improvedCritical", name: "Improved Critical (Champion)", description: "Your weapon attacks score a Critical Hit on a 19 or 20." },
      { level: 3, key: "remarkableAthlete", name: "Remarkable Athlete (Champion)", description: "Advantage on Initiative and Athletics checks." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "extraAttack", name: "Extra Attack", description: "Attack twice when you take the Attack action." },
      { level: 5, key: "tacticalShift", name: "Tactical Shift", description: "When you use Second Wind, move up to half your speed without provoking Opportunity Attacks." },
    ],
    equipment: [
      { id: "A", label: "Chain Mail, Greatsword, Flail, 8 Javelins", items: [{ itemId: "chainMail", qty: 1, equipped: true }, { itemId: "greatsword", qty: 1, equipped: true }, { itemId: "flail", qty: 1 }, { itemId: "javelin", qty: 8 }], gold: 4 },
      { id: "B", label: "Studded Leather, Scimitar, Shortsword, Longbow, 20 Arrows", items: [{ itemId: "studdedLeather", qty: 1, equipped: true }, { itemId: "scimitar", qty: 1, equipped: true }, { itemId: "shortsword", qty: 1, equipped: true }, { itemId: "longbow", qty: 1, equipped: true }, { itemId: "arrows", qty: 1 }], gold: 11 },
      { id: "C", label: "Chain Mail, Longsword, Shield, Handaxe x2 (sword & board)", items: [{ itemId: "chainMail", qty: 1, equipped: true }, { itemId: "longsword", qty: 1, equipped: true }, { itemId: "shield", qty: 1, equipped: true }, { itemId: "handaxe", qty: 2 }], gold: 6 },
    ],
    suggestedAbilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
    description: "A master of martial combat, skilled with a variety of weapons and armor.",
  },
  rogue: {
    id: "rogue", name: "Rogue", hitDie: 8, primary: ["dex"], saves: ["dex", "int"], skillCount: 4,
    skillOptions: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "persuasion", "sleightOfHand", "stealth"],
    armor: ["light"], weapons: "rogue", masteryCount: 2,
    subclass: { level: 3, id: "thief", name: "Thief" },
    features: [
      { level: 1, key: "expertise", name: "Expertise", description: "Double your proficiency bonus for two of your skill proficiencies." },
      { level: 1, key: "sneakAttack", name: "Sneak Attack", description: "Once per turn, deal extra damage (1d6 per two rogue levels, rounded up) when you hit with a Finesse or Ranged weapon and have Advantage, or an ally is within 5 ft of the target." },
      { level: 1, key: "thievesCant", name: "Thieves' Cant", description: "You know the secret language of rogues." },
      { level: 1, key: "weaponMastery", name: "Weapon Mastery", description: "Use the mastery properties of two kinds of weapons." },
      { level: 2, key: "cunningAction", name: "Cunning Action", description: "Bonus Action: Dash, Disengage, or Hide." },
      { level: 3, key: "steadyAim", name: "Steady Aim", description: "Bonus Action: gain Advantage on your next attack this turn if you haven't moved; your speed becomes 0." },
      { level: 3, key: "fastHands", name: "Fast Hands (Thief)", description: "Cunning Action can also Sleight of Hand, use Thieves' Tools, or Use an Object." },
      { level: 3, key: "secondStoryWork", name: "Second-Story Work (Thief)", description: "Climb speed equal to your speed; jump farther using Dexterity." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "uncannyDodge", name: "Uncanny Dodge", description: "Reaction: halve the damage of an attack that hits you from an attacker you can see." },
      { level: 5, key: "cunningStrike", name: "Cunning Strike", description: "Trade Sneak Attack dice for effects such as Trip (Dex save or Prone)." },
    ],
    equipment: [
      { id: "A", label: "Leather Armor, 2 Daggers, Shortsword, Shortbow, 20 Arrows, Thieves' Tools", items: [{ itemId: "leather", qty: 1, equipped: true }, { itemId: "dagger", qty: 2, equipped: true }, { itemId: "shortsword", qty: 1, equipped: true }, { itemId: "shortbow", qty: 1, equipped: true }, { itemId: "arrows", qty: 1 }, { itemId: "thievesTools", qty: 1 }], gold: 8 },
      { id: "B", label: "Leather Armor, Rapier, Hand Crossbow, 20 Bolts, Thieves' Tools", items: [{ itemId: "leather", qty: 1, equipped: true }, { itemId: "rapier", qty: 1, equipped: true }, { itemId: "handCrossbow", qty: 1, equipped: true }, { itemId: "bolts", qty: 1 }, { itemId: "thievesTools", qty: 1 }], gold: 5 },
    ],
    suggestedAbilities: { str: 8, dex: 15, con: 14, int: 12, wis: 13, cha: 10 },
    description: "A dexterous expert in stealth and subterfuge who strikes where it hurts.",
  },
  cleric: {
    id: "cleric", name: "Cleric", hitDie: 8, primary: ["wis"], saves: ["wis", "cha"], skillCount: 2,
    skillOptions: ["history", "insight", "medicine", "persuasion", "religion"],
    armor: ["light", "medium", "shield"], weapons: "simple", masteryCount: 0,
    spellcasting: { ability: "wis", kind: "full", cantrips: [0, 3, 3, 3, 4, 4], prepared: [0, 4, 5, 6, 7, 9] },
    subclass: { level: 3, id: "life", name: "Life Domain" },
    features: [
      { level: 1, key: "spellcasting", name: "Spellcasting", description: "Cast cleric spells using Wisdom." },
      { level: 1, key: "divineOrder", name: "Divine Order: Protector", description: "Training with Martial weapons and Heavy armor." },
      { level: 2, key: "channelDivinity", name: "Channel Divinity", description: "Two uses per Short/Long Rest: Divine Spark (heal or harm 1d8 + Wis) or Turn Undead (Wis save or Frightened & Incapacitated)." },
      { level: 3, key: "discipleOfLife", name: "Disciple of Life (Life)", description: "Healing spells restore additional HP equal to 2 + the spell's level." },
      { level: 3, key: "preserveLife", name: "Preserve Life (Life)", description: "Channel Divinity: restore HP equal to 5 x cleric level, divided among creatures within 30 ft (each up to half its HP max)." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "searUndead", name: "Sear Undead", description: "Turn Undead also deals Wis-mod d8 radiant damage to undead that fail." },
    ],
    equipment: [
      { id: "A", label: "Chain Shirt, Shield, Mace, Holy Symbol", items: [{ itemId: "chainShirt", qty: 1, equipped: true }, { itemId: "shield", qty: 1, equipped: true }, { itemId: "mace", qty: 1, equipped: true }, { itemId: "holySymbol", qty: 1 }, { itemId: "potionHealing", qty: 1 }], gold: 7 },
      { id: "B", label: "Chain Mail, Shield, Warhammer, Holy Symbol (Protector)", items: [{ itemId: "chainMail", qty: 1, equipped: true }, { itemId: "shield", qty: 1, equipped: true }, { itemId: "warhammer", qty: 1, equipped: true }, { itemId: "holySymbol", qty: 1 }], gold: 2 },
    ],
    suggestedAbilities: { str: 14, dex: 8, con: 13, int: 10, wis: 15, cha: 12 },
    description: "A miraculous priest of divine power, healer and warrior.",
  },
  wizard: {
    id: "wizard", name: "Wizard", hitDie: 6, primary: ["int"], saves: ["int", "wis"], skillCount: 2,
    skillOptions: ["arcana", "history", "insight", "investigation", "medicine", "nature", "religion"],
    armor: [], weapons: "simple", masteryCount: 0,
    spellcasting: { ability: "int", kind: "full", cantrips: [0, 3, 3, 3, 4, 4], prepared: [0, 4, 5, 6, 7, 9] },
    subclass: { level: 3, id: "evoker", name: "Evoker" },
    features: [
      { level: 1, key: "spellcasting", name: "Spellcasting", description: "Cast wizard spells from your spellbook using Intelligence." },
      { level: 1, key: "ritualAdept", name: "Ritual Adept", description: "Cast any Ritual spell in your spellbook as a Ritual without preparing it." },
      { level: 1, key: "arcaneRecovery", name: "Arcane Recovery", description: "Once per day on a Short Rest, recover spell slots totalling up to half your wizard level (rounded up)." },
      { level: 2, key: "scholar", name: "Scholar", description: "Expertise in one of Arcana, History, Investigation, Medicine, Nature, or Religion." },
      { level: 3, key: "potentCantrip", name: "Potent Cantrip (Evoker)", description: "When a creature succeeds on a save against your cantrip, or your cantrip attack misses, it still takes half damage." },
      { level: 3, key: "sculptSpells", name: "Sculpt Spells (Evoker)", description: "Allies automatically succeed on saves against your evocation spells and take no damage." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "memorizeSpell", name: "Memorize Spell", description: "On a Short Rest, swap one prepared spell." },
    ],
    equipment: [
      { id: "A", label: "2 Daggers, Quarterstaff, Spellbook, Arcane Focus", items: [{ itemId: "dagger", qty: 2, equipped: true }, { itemId: "quarterstaff", qty: 1, equipped: true }, { itemId: "spellbook", qty: 1 }, { itemId: "arcaneFocus", qty: 1 }], gold: 5 },
    ],
    suggestedAbilities: { str: 8, dex: 13, con: 14, int: 15, wis: 12, cha: 10 },
    description: "A scholarly magic-user capable of manipulating the structures of reality.",
  },
  barbarian: {
    id: "barbarian", name: "Barbarian", hitDie: 12, primary: ["str"], saves: ["str", "con"], skillCount: 2,
    skillOptions: ["animalHandling", "athletics", "intimidation", "nature", "perception", "survival"],
    armor: ["light", "medium", "shield"], weapons: "martial", masteryCount: 2,
    subclass: { level: 3, id: "berserker", name: "Path of the Berserker" },
    features: [
      { level: 1, key: "rage", name: "Rage", description: "Bonus Action: Resistance to Bludgeoning, Piercing and Slashing; +2 damage on Strength attacks; Advantage on Strength checks and saves. 2 uses (3 at 3rd level)." },
      { level: 1, key: "unarmoredDefense", name: "Unarmored Defense", description: "Without armor, AC = 10 + Dex mod + Con mod (shield allowed)." },
      { level: 1, key: "weaponMastery", name: "Weapon Mastery", description: "Use the mastery properties of two kinds of weapons." },
      { level: 2, key: "dangerSense", name: "Danger Sense", description: "Advantage on Dexterity saving throws unless Incapacitated." },
      { level: 2, key: "recklessAttack", name: "Reckless Attack", description: "Advantage on Strength attacks this turn; attacks against you have Advantage until your next turn." },
      { level: 3, key: "frenzy", name: "Frenzy (Berserker)", description: "While raging, the first creature you hit on a Reckless turn takes extra damage: d6s equal to your Rage Damage bonus." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "extraAttack", name: "Extra Attack", description: "Attack twice when you take the Attack action." },
      { level: 5, key: "fastMovement", name: "Fast Movement", description: "Your speed increases by 10 feet while you aren't wearing Heavy armor." },
    ],
    equipment: [
      { id: "A", label: "Greataxe, 4 Handaxes", items: [{ itemId: "greataxe", qty: 1, equipped: true }, { itemId: "handaxe", qty: 4 }], gold: 15 },
    ],
    suggestedAbilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
    description: "A fierce warrior of primal rage.",
  },
  ranger: {
    id: "ranger", name: "Ranger", hitDie: 10, primary: ["dex", "wis"], saves: ["str", "dex"], skillCount: 3,
    skillOptions: ["animalHandling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"],
    armor: ["light", "medium", "shield"], weapons: "martial", masteryCount: 2,
    spellcasting: { ability: "wis", kind: "half", cantrips: [0, 0, 0, 0, 0, 0], prepared: [0, 2, 3, 4, 5, 6] },
    subclass: { level: 3, id: "hunter", name: "Hunter" },
    features: [
      { level: 1, key: "spellcasting", name: "Spellcasting", description: "Cast ranger spells using Wisdom." },
      { level: 1, key: "favoredEnemy", name: "Favored Enemy", description: "Hunter's Mark is always prepared; cast it twice per Long Rest without a slot." },
      { level: 1, key: "weaponMastery", name: "Weapon Mastery", description: "Use the mastery properties of two kinds of weapons." },
      { level: 2, key: "deftExplorer", name: "Deft Explorer", description: "Expertise in one skill; learn two languages." },
      { level: 2, key: "fightingStyle", name: "Fighting Style", description: "Choose a fighting style feat." },
      { level: 3, key: "colossusSlayer", name: "Hunter's Prey: Colossus Slayer", description: "Once per turn, a weapon hit deals +1d8 damage to a creature that's missing any HP." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "extraAttack", name: "Extra Attack", description: "Attack twice when you take the Attack action." },
    ],
    equipment: [
      { id: "A", label: "Studded Leather, Scimitar, Shortsword, Longbow, 20 Arrows", items: [{ itemId: "studdedLeather", qty: 1, equipped: true }, { itemId: "scimitar", qty: 1, equipped: true }, { itemId: "shortsword", qty: 1, equipped: true }, { itemId: "longbow", qty: 1, equipped: true }, { itemId: "arrows", qty: 1 }], gold: 7 },
    ],
    suggestedAbilities: { str: 12, dex: 15, con: 13, int: 8, wis: 14, cha: 10 },
    description: "A wandering warrior imbued with primal magic, hunter of the wild places.",
  },
};

export const RAGE_USES = [0, 2, 2, 3, 3, 3];
export const rageDamage = (level: number) => (level >= 9 ? 3 : 2);
export const sneakDice = (level: number) => Math.ceil(level / 2);
