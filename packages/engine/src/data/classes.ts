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
  weapons: "simple" | "martial" | "rogue" | "monk";   // rogue = simple + martial with finesse/light; monk = simple + martial light
  masteryCount: number;
  spellcasting?: { ability: Ability; kind: "full" | "half" | "pact"; cantrips: number[]; prepared: number[] };
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

// Warlock Pact Magic: all slots are of the same (highest) level, regained on a Short Rest
export const PACT_SLOTS: number[][] = [
  [], [0, 1], [0, 2], [0, 0, 2], [0, 0, 2], [0, 0, 0, 2],
];
export const SORCERY_SLOT_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };
export const martialArtsDie = (level: number) => (level >= 17 ? "1d12" : level >= 11 ? "1d10" : level >= 5 ? "1d8" : "1d6");
export const bardicDie = (level: number) => (level >= 15 ? 12 : level >= 10 ? 10 : level >= 5 ? 8 : 6);

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
  paladin: {
    id: "paladin", name: "Paladin", hitDie: 10, primary: ["str", "cha"], saves: ["wis", "cha"], skillCount: 2,
    skillOptions: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"],
    armor: ["light", "medium", "heavy", "shield"], weapons: "martial", masteryCount: 2,
    spellcasting: { ability: "cha", kind: "half", cantrips: [0, 0, 0, 0, 0, 0], prepared: [0, 2, 3, 4, 5, 6] },
    subclass: { level: 3, id: "devotion", name: "Oath of Devotion" },
    features: [
      { level: 1, key: "layOnHands", name: "Lay On Hands", description: "Bonus Action: touch a creature and restore HP from a pool of 5 x paladin level (or spend 5 to cure Poisoned)." },
      { level: 1, key: "spellcasting", name: "Spellcasting", description: "Cast paladin spells using Charisma." },
      { level: 1, key: "weaponMastery", name: "Weapon Mastery", description: "Use the mastery properties of two kinds of weapons." },
      { level: 2, key: "fightingStyle", name: "Fighting Style", description: "Choose a fighting style feat." },
      { level: 2, key: "paladinsSmite", name: "Paladin's Smite", description: "Divine Smite is always prepared, and you can cast it once per Long Rest without a spell slot." },
      { level: 3, key: "paladinChannelDivinity", name: "Channel Divinity", description: "Two uses per Short/Long Rest: Divine Sense, or your oath's option." },
      { level: 3, key: "sacredWeapon", name: "Sacred Weapon (Devotion)", description: "Channel Divinity when you take the Attack action: add your Charisma modifier (min +1) to attack rolls with melee weapons for 10 minutes." },
      { level: 3, key: "oathSpells", name: "Oath of Devotion Spells", description: "Protection from Evil and Good and Shield of Faith are always prepared (Aid and Zone of Truth at 5th)." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "extraAttack", name: "Extra Attack", description: "Attack twice when you take the Attack action." },
      { level: 5, key: "faithfulSteed", name: "Faithful Steed", description: "Find Steed is always prepared and can be cast once per Long Rest without a slot (narrative)." },
    ],
    equipment: [
      { id: "A", label: "Chain Mail, Shield, Longsword, 6 Javelins, Holy Symbol", items: [{ itemId: "chainMail", qty: 1, equipped: true }, { itemId: "shield", qty: 1, equipped: true }, { itemId: "longsword", qty: 1, equipped: true }, { itemId: "javelin", qty: 6 }, { itemId: "holySymbol", qty: 1 }], gold: 9 },
      { id: "B", label: "Chain Mail, Greatsword, 6 Javelins, Holy Symbol", items: [{ itemId: "chainMail", qty: 1, equipped: true }, { itemId: "greatsword", qty: 1, equipped: true }, { itemId: "javelin", qty: 6 }, { itemId: "holySymbol", qty: 1 }], gold: 9 },
    ],
    suggestedAbilities: { str: 15, dex: 10, con: 13, int: 8, wis: 12, cha: 14 },
    description: "A devout warrior bound by a sacred oath, smiting foes and healing allies.",
  },
  monk: {
    id: "monk", name: "Monk", hitDie: 8, primary: ["dex", "wis"], saves: ["str", "dex"], skillCount: 2,
    skillOptions: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"],
    armor: [], weapons: "monk", masteryCount: 0,
    subclass: { level: 3, id: "openHand", name: "Warrior of the Open Hand" },
    features: [
      { level: 1, key: "martialArts", name: "Martial Arts", description: "Use Dex for unarmed strikes and monk weapons, which deal your Martial Arts die (d6, d8 at 5th). Bonus Action: make an Unarmed Strike." },
      { level: 1, key: "unarmoredDefenseMonk", name: "Unarmored Defense", description: "Without armor or a shield, AC = 10 + Dex mod + Wis mod." },
      { level: 2, key: "monksFocus", name: "Monk's Focus", description: "Focus Points equal to your monk level (regain on a Short or Long Rest): Flurry of Blows, Patient Defense, Step of the Wind." },
      { level: 2, key: "unarmoredMovement", name: "Unarmored Movement", description: "Your speed increases by 10 ft while you wear no armor or shield." },
      { level: 2, key: "uncannyMetabolism", name: "Uncanny Metabolism", description: "When you roll Initiative, regain all Focus Points and heal Martial Arts die + monk level. Once per Long Rest." },
      { level: 3, key: "deflectAttacks", name: "Deflect Attacks", description: "Reaction when hit by an attack dealing B/P/S damage: reduce the damage by 1d10 + Dex mod + monk level (automatic)." },
      { level: 3, key: "openHandTechnique", name: "Open Hand Technique", description: "When you hit with a Flurry of Blows strike: Addle (no Opportunity Attacks), Push (Str save or pushed 15 ft), or Topple (Dex save or Prone)." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 4, key: "slowFall", name: "Slow Fall", description: "Reaction: reduce falling damage by 5 x monk level." },
      { level: 5, key: "extraAttack", name: "Extra Attack", description: "Attack twice when you take the Attack action." },
      { level: 5, key: "stunningStrike", name: "Stunning Strike", description: "Once per turn when you hit with a monk weapon or unarmed strike, spend 1 Focus Point: Con save or Stunned until the start of your next turn." },
    ],
    equipment: [
      { id: "A", label: "Spear, 5 Daggers", items: [{ itemId: "spear", qty: 1, equipped: true }, { itemId: "dagger", qty: 5 }], gold: 11 },
      { id: "B", label: "Quarterstaff, Shortbow, 20 Arrows", items: [{ itemId: "quarterstaff", qty: 1, equipped: true }, { itemId: "shortbow", qty: 1 }, { itemId: "arrows", qty: 1 }], gold: 6 },
    ],
    suggestedAbilities: { str: 12, dex: 15, con: 13, int: 10, wis: 14, cha: 8 },
    description: "A martial artist who channels inner focus into lightning-fast strikes.",
  },
  bard: {
    id: "bard", name: "Bard", hitDie: 8, primary: ["cha"], saves: ["dex", "cha"], skillCount: 3,
    skillOptions: ["acrobatics", "animalHandling", "arcana", "athletics", "deception", "history", "insight", "intimidation", "investigation", "medicine", "nature", "perception", "performance", "persuasion", "religion", "sleightOfHand", "stealth", "survival"],
    armor: ["light"], weapons: "simple", masteryCount: 0,
    spellcasting: { ability: "cha", kind: "full", cantrips: [0, 2, 2, 2, 3, 3], prepared: [0, 4, 5, 6, 7, 9] },
    subclass: { level: 3, id: "lore", name: "College of Lore" },
    features: [
      { level: 1, key: "bardicInspiration", name: "Bardic Inspiration", description: "Bonus Action: give a creature within 60 ft a Bardic Inspiration die (d6, d8 at 5th) it adds to a failed d20 Test. Uses = Cha mod per Long Rest." },
      { level: 1, key: "spellcasting", name: "Spellcasting", description: "Cast bard spells using Charisma." },
      { level: 2, key: "expertise", name: "Expertise", description: "Expertise in two of your skill proficiencies." },
      { level: 2, key: "jackOfAllTrades", name: "Jack of All Trades", description: "Add half your proficiency bonus to ability checks you aren't proficient in." },
      { level: 3, key: "bonusProficiencies", name: "Bonus Proficiencies (Lore)", description: "Proficiency in three skills of your choice." },
      { level: 3, key: "cuttingWords", name: "Cutting Words (Lore)", description: "Reaction: subtract a Bardic Inspiration roll from an enemy's attack roll within 60 ft, potentially causing it to miss (automatic)." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "fontOfInspiration", name: "Font of Inspiration", description: "Regain Bardic Inspiration on a Short Rest; the die becomes a d8." },
    ],
    equipment: [
      { id: "A", label: "Leather Armor, 2 Daggers", items: [{ itemId: "leather", qty: 1, equipped: true }, { itemId: "dagger", qty: 2, equipped: true }], gold: 19 },
    ],
    suggestedAbilities: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
    description: "An inspiring magician whose music, words and wit weave magic.",
  },
  druid: {
    id: "druid", name: "Druid", hitDie: 8, primary: ["wis"], saves: ["int", "wis"], skillCount: 2,
    skillOptions: ["arcana", "animalHandling", "insight", "medicine", "nature", "perception", "religion", "survival"],
    armor: ["light", "shield"], weapons: "simple", masteryCount: 0,
    // Primal Order: Magician (one extra cantrip) is baked into the cantrip counts
    spellcasting: { ability: "wis", kind: "full", cantrips: [0, 3, 3, 3, 4, 4], prepared: [0, 4, 5, 6, 7, 9] },
    subclass: { level: 3, id: "land", name: "Circle of the Land (Temperate)" },
    features: [
      { level: 1, key: "spellcasting", name: "Spellcasting", description: "Cast druid spells using Wisdom." },
      { level: 1, key: "primalOrder", name: "Primal Order: Magician", description: "One extra druid cantrip; add Wis mod to Arcana and Nature checks." },
      { level: 2, key: "wildShape", name: "Wild Shape", description: "Bonus Action: assume a beast form (Wolf) gaining temp HP equal to druid level. Two uses; regain one on a Short Rest. Bonus Action to revert." },
      { level: 2, key: "wildCompanion", name: "Wild Companion", description: "Expend a Wild Shape use to cast Find Familiar (narrative)." },
      { level: 3, key: "landsAid", name: "Land's Aid (Land)", description: "Magic action, expend a Wild Shape use: 10-ft sphere within 60 ft, Con save or 2d6 necrotic (half on success), and one creature there regains 2d6 HP." },
      { level: 3, key: "circleSpells", name: "Circle Spells (Temperate)", description: "Misty Step, Shocking Grasp and Sleep always prepared (Lightning Bolt at 5th)." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "wildResurgence", name: "Wild Resurgence", description: "Trade spell slots and Wild Shape uses (narrative between fights)." },
    ],
    equipment: [
      { id: "A", label: "Leather Armor, Shield, Sickle, Quarterstaff", items: [{ itemId: "leather", qty: 1, equipped: true }, { itemId: "shield", qty: 1, equipped: true }, { itemId: "sickle", qty: 1 }, { itemId: "quarterstaff", qty: 1, equipped: true }], gold: 9 },
    ],
    suggestedAbilities: { str: 10, dex: 13, con: 14, int: 8, wis: 15, cha: 12 },
    description: "A priest of the Old Faith, wielding the powers of nature and taking animal forms.",
  },
  sorcerer: {
    id: "sorcerer", name: "Sorcerer", hitDie: 6, primary: ["cha"], saves: ["con", "cha"], skillCount: 2,
    skillOptions: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"],
    armor: [], weapons: "simple", masteryCount: 0,
    spellcasting: { ability: "cha", kind: "full", cantrips: [0, 4, 4, 4, 5, 5], prepared: [0, 2, 4, 6, 7, 9] },
    subclass: { level: 3, id: "draconic", name: "Draconic Sorcery" },
    features: [
      { level: 1, key: "spellcasting", name: "Spellcasting", description: "Cast sorcerer spells using Charisma." },
      { level: 1, key: "innateSorcery", name: "Innate Sorcery", description: "Bonus Action, twice per Long Rest: for 1 minute your spell save DC +1 and your sorcerer spell attacks have Advantage." },
      { level: 2, key: "fontOfMagic", name: "Font of Magic", description: "Sorcery Points equal to sorcerer level. Convert slots to points or points to slots (1st 2 SP, 2nd 3 SP, 3rd 5 SP) as a Bonus Action." },
      { level: 2, key: "metamagic", name: "Metamagic: Quickened & Twinned", description: "Quickened Spell (2 SP: cast an action spell as a Bonus Action). Twinned Spell (1 SP: a single-target leveled spell targets a second creature)." },
      { level: 3, key: "draconicResilience", name: "Draconic Resilience", description: "HP max +1 per sorcerer level; unarmored AC = 10 + Dex + Cha." },
      { level: 3, key: "draconicSpells", name: "Draconic Spells", description: "Chromatic Orb always prepared (plus utility spells)." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "sorcerousRestoration", name: "Sorcerous Restoration", description: "On a Short Rest, regain Sorcery Points up to half your sorcerer level. Once per Long Rest." },
    ],
    equipment: [
      { id: "A", label: "Spear, 2 Daggers, Arcane Focus", items: [{ itemId: "spear", qty: 1, equipped: true }, { itemId: "dagger", qty: 2, equipped: true }, { itemId: "arcaneFocus", qty: 1 }], gold: 28 },
    ],
    suggestedAbilities: { str: 8, dex: 13, con: 14, int: 10, wis: 12, cha: 15 },
    description: "A spellcaster who draws on inherent magic from a draconic bloodline.",
  },
  warlock: {
    id: "warlock", name: "Warlock", hitDie: 8, primary: ["cha"], saves: ["wis", "cha"], skillCount: 2,
    skillOptions: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"],
    armor: ["light"], weapons: "simple", masteryCount: 0,
    spellcasting: { ability: "cha", kind: "pact", cantrips: [0, 2, 2, 2, 3, 3], prepared: [0, 2, 3, 4, 5, 6] },
    subclass: { level: 3, id: "fiend", name: "Fiend Patron" },
    features: [
      { level: 1, key: "pactMagic", name: "Pact Magic", description: "Few spell slots, all of your highest level, regained on a Short or Long Rest." },
      { level: 1, key: "pactOfTheBlade", name: "Eldritch Invocation: Pact of the Blade", description: "Your melee weapon is a pact weapon: proficient, and you may use Charisma for its attack and damage rolls." },
      { level: 2, key: "agonizingBlast", name: "Eldritch Invocation: Agonizing Blast", description: "Add your Charisma modifier to Eldritch Blast damage." },
      { level: 2, key: "repellingBlast", name: "Eldritch Invocation: Repelling Blast", description: "Eldritch Blast hits push Large or smaller creatures 10 ft away." },
      { level: 2, key: "magicalCunning", name: "Magical Cunning", description: "Once per Long Rest, a 1-minute rite restores half your Pact Magic slots (narrative between fights)." },
      { level: 3, key: "darkOnesBlessing", name: "Dark One's Blessing (Fiend)", description: "When you reduce an enemy to 0 HP, gain temp HP equal to Cha mod + warlock level." },
      { level: 3, key: "fiendSpells", name: "Fiend Spells", description: "Burning Hands and Scorching Ray always prepared (Fireball at 5th)." },
      { level: 4, key: "asi", name: "Ability Score Improvement", description: "+2 to one ability score (or +1 to two)." },
      { level: 5, key: "thirstingBlade", name: "Eldritch Invocation: Thirsting Blade", description: "Attack twice with your pact weapon when you take the Attack action." },
    ],
    equipment: [
      { id: "A", label: "Leather Armor, Sickle, 2 Daggers, Arcane Focus", items: [{ itemId: "leather", qty: 1, equipped: true }, { itemId: "sickle", qty: 1, equipped: true }, { itemId: "dagger", qty: 2 }, { itemId: "arcaneFocus", qty: 1 }], gold: 15 },
      { id: "B", label: "Leather Armor, Pact Blade (Longsword), Arcane Focus", items: [{ itemId: "leather", qty: 1, equipped: true }, { itemId: "longsword", qty: 1, equipped: true }, { itemId: "arcaneFocus", qty: 1 }], gold: 5 },
    ],
    suggestedAbilities: { str: 8, dex: 14, con: 13, int: 10, wis: 12, cha: 15 },
    description: "A wielder of magic granted by a pact with an otherworldly patron.",
  },
};

export const RAGE_USES = [0, 2, 2, 3, 3, 3];
export const rageDamage = (level: number) => (level >= 9 ? 3 : 2);
export const sneakDice = (level: number) => Math.ceil(level / 2);
