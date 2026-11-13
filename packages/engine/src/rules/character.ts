// Character creation, derived statistics, levelling and rests.
import { BACKGROUNDS, FEATS, SKILL_ABILITY, SPECIES } from "../data/origins.js";
import { CLASSES, FULL_CASTER_SLOTS, HALF_CASTER_SLOTS, MAX_LEVEL, RAGE_USES, XP_THRESHOLDS } from "../data/classes.js";
import { ARMOR, WEAPONS } from "../data/equipment.js";
import { SPELLS } from "../data/spells.js";
import { mod, profForLevel, Rng, roll } from "../dice.js";
import type {
  Ability, AbilityScores, AttackOption, BackgroundId, CharacterSheet, ClassId, Combatant, FeatId, Point, Skill, SpeciesId,
} from "../types.js";
import { ABILITIES } from "../types.js";

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUY_BUDGET = 27;

export interface CharacterCreationInput {
  name: string;
  ownerId: string;
  species: SpeciesId;
  classId: ClassId;
  background: BackgroundId;
  abilityMethod: "standard" | "pointBuy" | "rolled";
  baseAbilities: AbilityScores;
  /** background bonus distribution: either {a:2,b:1} or {a:1,b:1,c:1} over the background's three abilities */
  abilityBonuses: Partial<AbilityScores>;
  skills: Skill[];                     // class skill choices (+ human Skillful / elf Keen Senses extra at end)
  expertise?: Skill[];                 // rogue
  equipmentPackage?: string;
  cantrips?: string[];
  spells?: string[];
  weaponMasteries?: string[];
  fightingStyle?: CharacterSheet["fightingStyle"];
  humanFeat?: FeatId;
  personality?: CharacterSheet["personality"];
  backstory?: string;
  hardcore?: boolean;
  /** dice-rolled scores must be supplied by the server's roll, this flag lets the server skip validation */
  trustedRoll?: boolean;
}

export function validateAbilityScores(method: CharacterCreationInput["abilityMethod"], scores: AbilityScores, trusted = false): string | null {
  const vals = ABILITIES.map((a) => scores[a]);
  if (vals.some((v) => !Number.isInteger(v))) return "Ability scores must be integers.";
  if (method === "standard") {
    const sorted = [...vals].sort((a, b) => b - a);
    if (sorted.join(",") !== STANDARD_ARRAY.join(",")) return "Standard array must use 15, 14, 13, 12, 10, 8 exactly once each.";
  } else if (method === "pointBuy") {
    if (vals.some((v) => v < 8 || v > 15)) return "Point buy scores must be between 8 and 15.";
    const cost = vals.reduce((s, v) => s + POINT_BUY_COST[v], 0);
    if (cost > POINT_BUY_BUDGET) return `Point buy costs ${cost}, budget is ${POINT_BUY_BUDGET}.`;
  } else {
    if (!trusted) return "Rolled scores must come from the server roll.";
    if (vals.some((v) => v < 3 || v > 18)) return "Rolled scores must be 3-18.";
  }
  return null;
}

export function rollAbilityScores(rng: Rng): number[] {
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    const r = [rng.die(6), rng.die(6), rng.die(6), rng.die(6)].sort((a, b) => a - b);
    out.push(r[1] + r[2] + r[3]);
  }
  return out;
}

function uniq<T>(a: T[]): T[] { return [...new Set(a)]; }

export function createCharacter(input: CharacterCreationInput, id: string): CharacterSheet {
  const cls = CLASSES[input.classId];
  const species = SPECIES[input.species];
  const bg = BACKGROUNDS[input.background];
  if (!cls) throw new Error("Unknown class");
  if (!species) throw new Error("Unknown species");
  if (!bg) throw new Error("Unknown background");
  if (!input.name?.trim()) throw new Error("Name is required");

  const err = validateAbilityScores(input.abilityMethod, input.baseAbilities, input.trustedRoll);
  if (err) throw new Error(err);

  // Background ability bonuses (2024: +2/+1 or +1/+1/+1 among three listed abilities, no score above 20)
  const bonusEntries = Object.entries(input.abilityBonuses).filter(([, v]) => v) as [Ability, number][];
  const total = bonusEntries.reduce((s, [, v]) => s + v, 0);
  const valid = total === 3 && bonusEntries.every(([a, v]) => bg.abilityOptions.includes(a) && (v === 1 || v === 2)) &&
    (bonusEntries.length === 3 || (bonusEntries.length === 2 && bonusEntries.some(([, v]) => v === 2)));
  if (!valid) throw new Error(`Background bonuses must be +2/+1 or +1/+1/+1 among ${bg.abilityOptions.join(", ")}.`);
  const abilities = { ...input.baseAbilities };
  for (const [a, v] of bonusEntries) abilities[a] = Math.min(20, abilities[a] + v);

  // Skills
  const fixed = [...bg.skills];
  const classPicks = input.skills.filter((s) => !fixed.includes(s));
  const extra = (species.bonusSkills ?? 0) + (species.skillChoice ? 1 : 0) + (input.humanFeat === "skilled" ? 3 : 0);
  const allowedClassPicks = cls.skillCount;
  const classChosen = classPicks.filter((s) => cls.skillOptions.includes(s)).slice(0, allowedClassPicks);
  const leftovers = classPicks.filter((s) => !classChosen.includes(s)).slice(0, extra);
  const skillProficiencies = uniq([...fixed, ...classChosen, ...leftovers]);

  const expertise = input.classId === "rogue" ? (input.expertise ?? []).filter((s) => skillProficiencies.includes(s)).slice(0, 2) : [];

  // Feats
  const feats: FeatId[] = [bg.feat];
  if (species.bonusFeat) feats.push(input.humanFeat && FEATS[input.humanFeat] ? input.humanFeat : "skilled");

  // Equipment
  const pkg = cls.equipment.find((p) => p.id === input.equipmentPackage) ?? cls.equipment[0];
  const inventory = [...pkg.items.map((i) => ({ ...i })), ...bg.equipment.map((i) => ({ ...i }))];
  if (!inventory.some((i) => i.itemId === "potionHealing")) inventory.push({ itemId: "potionHealing", qty: 1 });

  // Spells
  let cantrips: string[] = [];
  let spellsKnown: string[] = [];
  if (cls.spellcasting) {
    const nC = cls.spellcasting.cantrips[1];
    const nP = cls.spellcasting.prepared[1];
    const classSpells = Object.values(SPELLS).filter((s) => s.classes.includes(input.classId));
    cantrips = (input.cantrips ?? []).filter((c) => classSpells.some((s) => s.id === c && s.level === 0)).slice(0, nC);
    spellsKnown = (input.spells ?? []).filter((c) => classSpells.some((s) => s.id === c && s.level === 1)).slice(0, nP);
    // sensible defaults so quick-build always works
    const defaults: Record<string, { c: string[]; s: string[] }> = {
      cleric: { c: ["sacredFlame", "guidance", "spareTheDying"], s: ["cureWounds", "healingWord", "bless", "guidingBolt"] },
      wizard: { c: ["fireBolt", "rayOfFrost", "mageHand"], s: ["magicMissile", "shield", "burningHands", "sleep"] },
      ranger: { c: [], s: ["cureWounds", "huntersMark"] },
    };
    const d = defaults[input.classId];
    for (const c of d?.c ?? []) if (cantrips.length < nC && !cantrips.includes(c)) cantrips.push(c);
    for (const s of d?.s ?? []) if (spellsKnown.length < nP && !spellsKnown.includes(s)) spellsKnown.push(s);
    if (input.classId === "ranger" && !spellsKnown.includes("huntersMark")) spellsKnown.push("huntersMark");
  }
  if (feats.includes("magicInitiateCleric")) { cantrips.push("guidance", "sacredFlame"); spellsKnown.push("bless"); }
  if (feats.includes("magicInitiateWizard")) { cantrips.push("fireBolt", "mageHand"); spellsKnown.push("magicMissile"); }
  for (const c of species.cantrips ?? []) cantrips.push(c);
  cantrips = uniq(cantrips);
  spellsKnown = uniq(spellsKnown);

  // Weapon masteries: default to equipped weapons
  const weaponIds = inventory.map((i) => i.itemId).filter((i) => WEAPONS[i]);
  const masteries = uniq([...(input.weaponMasteries ?? []), ...weaponIds]).filter((w) => WEAPONS[w]).slice(0, cls.masteryCount);

  const sheet: CharacterSheet = {
    id, ownerId: input.ownerId, name: input.name.trim().slice(0, 40), species: input.species, classId: input.classId,
    level: 1, xp: 0, background: input.background, baseAbilities: input.baseAbilities, abilityBonuses: input.abilityBonuses, abilities,
    maxHp: 0, hp: 0, tempHp: 0, hitDice: 1, skillProficiencies, expertise, saveProficiencies: [...cls.saves], feats,
    fightingStyle: input.classId === "fighter" ? (input.fightingStyle ?? "defense") : undefined,
    weaponMasteries: masteries, spellsKnown, cantrips, spellSlots: [], spellSlotsUsed: [], resources: {},
    inventory, gold: pkg.gold + bg.gold, personality: input.personality, backstory: input.backstory,
    heroicInspiration: input.species === "human", deathCount: 0, dead: false, retired: false, prestige: 0, hardcore: !!input.hardcore,
    stats: { kills: {}, scenariosCompleted: [], goldEarned: 0, criticals: 0, knockouts: 0 }, conditions: [], exhaustion: 0, createdAt: Date.now(),
  };
  recalcDerived(sheet);
  sheet.hp = sheet.maxHp;
  return sheet;
}

export function hpForLevel(sheet: CharacterSheet): number {
  const cls = CLASSES[sheet.classId];
  const conMod = mod(sheet.abilities.con);
  // 2024: max at 1st level, then fixed average (die/2 + 1) per level
  let hp = cls.hitDie + conMod + (sheet.level - 1) * (cls.hitDie / 2 + 1 + conMod);
  if (sheet.species === "dwarf") hp += sheet.level;
  if (sheet.feats.includes("tough")) hp += 2 * sheet.level;
  return Math.max(1, hp);
}

export function recalcDerived(sheet: CharacterSheet): void {
  const cls = CLASSES[sheet.classId];
  sheet.maxHp = hpForLevel(sheet);
  sheet.hp = Math.min(sheet.hp, sheet.maxHp);
  if (cls.spellcasting) {
    const table = cls.spellcasting.kind === "full" ? FULL_CASTER_SLOTS : HALF_CASTER_SLOTS;
    sheet.spellSlots = [...(table[sheet.level] ?? [])];
    while (sheet.spellSlotsUsed.length < sheet.spellSlots.length) sheet.spellSlotsUsed.push(0);
  }
  if (sheet.level >= 3 && !sheet.subclass) sheet.subclass = cls.subclass.id;
}

export function profBonus(sheet: { level: number }): number { return profForLevel(sheet.level); }

export function skillBonus(sheet: CharacterSheet, skill: Skill): number {
  const ab = SKILL_ABILITY[skill];
  let b = mod(sheet.abilities[ab]);
  const pb = profBonus(sheet);
  if (sheet.skillProficiencies.includes(skill)) b += pb;
  if (sheet.expertise.includes(skill)) b += pb;
  return b;
}

export function saveBonus(sheet: CharacterSheet, ability: Ability): number {
  return mod(sheet.abilities[ability]) + (sheet.saveProficiencies.includes(ability) ? profBonus(sheet) : 0);
}

export function equippedArmor(sheet: CharacterSheet) {
  const eq = sheet.inventory.filter((i) => i.equipped);
  const body = eq.map((i) => ARMOR[i.itemId]).find((a) => a && a.category !== "shield");
  const shield = eq.some((i) => ARMOR[i.itemId]?.category === "shield");
  return { body, shield };
}

export function armorClass(sheet: CharacterSheet, mageArmor = false): number {
  const dex = mod(sheet.abilities.dex);
  const { body, shield } = equippedArmor(sheet);
  let ac: number;
  if (body) {
    const cap = body.dexCap === undefined ? dex : Math.min(dex, body.dexCap);
    ac = body.baseAc + cap;
  } else if (sheet.classId === "barbarian") {
    ac = 10 + dex + mod(sheet.abilities.con);
  } else if (mageArmor) {
    ac = 13 + dex;
  } else {
    ac = 10 + dex;
  }
  if (shield) ac += 2;
  if (body && sheet.fightingStyle === "defense") ac += 1;
  return ac;
}

function proficientWith(sheet: CharacterSheet, weaponId: string): boolean {
  const wpn = WEAPONS[weaponId];
  if (!wpn) return false;
  const cls = CLASSES[sheet.classId];
  if (wpn.category === "simple") return true;
  if (cls.weapons === "martial") return true;
  if (cls.weapons === "rogue") return wpn.properties.includes("finesse") || wpn.properties.includes("light");
  if (sheet.classId === "cleric" && sheet.inventory.some((i) => i.itemId === "chainMail" || i.itemId === "warhammer")) return true; // Protector order
  return false;
}

export function weaponAttacks(sheet: CharacterSheet): AttackOption[] {
  const pb = profBonus(sheet);
  const str = mod(sheet.abilities.str);
  const dex = mod(sheet.abilities.dex);
  const { shield } = equippedArmor(sheet);
  const out: AttackOption[] = [];
  const equippedWeapons = sheet.inventory.filter((i) => WEAPONS[i.itemId] && (i.equipped || i.qty > 0));
  const seen = new Set<string>();
  for (const inv of equippedWeapons) {
    if (seen.has(inv.itemId)) continue;
    seen.add(inv.itemId);
    const w = WEAPONS[inv.itemId];
    const finesse = w.properties.includes("finesse");
    const abilityMod = w.kind === "ranged" ? dex : finesse ? Math.max(str, dex) : str;
    let toHit = abilityMod + (proficientWith(sheet, w.id) ? pb : 0);
    let dmgBonus = abilityMod;
    let dice = w.damage;
    if (w.versatileDamage && !shield) dice = w.versatileDamage;
    if (w.kind === "ranged" && sheet.fightingStyle === "archery") toHit += 2;
    const oneHanded = !w.properties.includes("twoHanded") && w.kind === "melee";
    const onlyWeapon = equippedWeapons.filter((i) => WEAPONS[i.itemId]?.kind === "melee" && i.equipped).length <= 1;
    if (sheet.fightingStyle === "dueling" && oneHanded && onlyWeapon) dmgBonus += 2;
    const mastery = sheet.weaponMasteries.includes(w.id) ? w.mastery : undefined;
    out.push({
      id: w.id, name: w.name, kind: w.kind, weaponId: w.id, toHit, damage: dice, damageBonus: dmgBonus, damageType: w.damageType,
      reach: w.kind === "melee" ? (w.properties.includes("reach") ? 10 : 5) : 0, range: w.range, finesse, light: w.properties.includes("light"),
      heavy: w.properties.includes("heavy"), mastery, thrown: w.properties.includes("thrown"),
    });
  }
  // Unarmed strike always available (2024: 1 + Str mod bludgeoning)
  out.push({ id: "unarmed", name: "Unarmed Strike", kind: "melee", toHit: str + pb, damage: "1", damageBonus: str, damageType: "bludgeoning", reach: 5 });
  return out;
}

export function spellSaveDc(sheet: { level: number; abilities: AbilityScores }, ability: Ability): number {
  return 8 + profForLevel(sheet.level) + mod(sheet.abilities[ability]);
}

export function spellAbility(classId: ClassId): Ability | undefined {
  return CLASSES[classId].spellcasting?.ability ?? (classId === "fighter" || classId === "rogue" || classId === "barbarian" ? "int" : undefined);
}

export function resourceMax(sheet: CharacterSheet): Record<string, number> {
  const r: Record<string, number> = {};
  const pb = profBonus(sheet);
  if (sheet.classId === "fighter") { r.secondWind = sheet.level >= 4 ? 3 : 2; if (sheet.level >= 2) r.actionSurge = 1; }
  if (sheet.classId === "barbarian") r.rage = RAGE_USES[sheet.level] ?? 3;
  if (sheet.classId === "cleric" && sheet.level >= 2) r.channelDivinity = 2;
  if (sheet.classId === "ranger") r.favoredEnemy = 2;
  if (sheet.classId === "wizard") r.arcaneRecovery = 1;
  if (sheet.species === "dragonborn") r.breathWeapon = pb;
  if (sheet.species === "orc") { r.adrenalineRush = pb; r.relentlessEndurance = 1; }
  if (sheet.species === "goliath") r.stonesEndurance = pb;
  if (sheet.feats.includes("magicInitiateCleric") || sheet.feats.includes("magicInitiateWizard")) r.magicInitiate = 1;
  return r;
}

export function resourcesRemaining(sheet: CharacterSheet): Record<string, number> {
  const max = resourceMax(sheet);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(max)) out[k] = Math.max(0, v - (sheet.resources[k] ?? 0));
  return out;
}

export function featureKeys(sheet: CharacterSheet): string[] {
  const cls = CLASSES[sheet.classId];
  const keys = cls.features.filter((f) => f.level <= sheet.level).map((f) => f.key);
  for (const t of SPECIES[sheet.species].traits) keys.push(t.key);
  for (const f of sheet.feats) keys.push(f);
  return keys;
}

export function toCombatant(sheet: CharacterSheet, pos: Point, controller: Combatant["controller"]): Combatant {
  const species = SPECIES[sheet.species];
  const features = featureKeys(sheet);
  const pb = profBonus(sheet);
  const skills: Combatant["skillBonuses"] = {};
  for (const s of Object.keys(SKILL_ABILITY) as Skill[]) skills[s] = skillBonus(sheet, s);
  const mageArmor = false;
  let initBonus = mod(sheet.abilities.dex) + (sheet.feats.includes("alert") ? pb : 0);
  if (features.includes("remarkableAthlete")) initBonus += 0; // advantage handled in rollInitiative
  const speed = species.speed + (features.includes("fastMovement") && equippedArmor(sheet).body?.category !== "heavy" ? 10 : 0);
  if (sheet.fightingStyle) features.push(`style:${sheet.fightingStyle}`);
  return {
    id: `pc-${sheet.id}`, name: sheet.name, side: "party", controller, characterId: sheet.id, level: sheet.level, size: species.size,
    abilities: { ...sheet.abilities }, profBonus: pb, ac: armorClass(sheet, mageArmor), maxHp: sheet.maxHp, hp: sheet.hp, tempHp: sheet.tempHp,
    speed, pos, initiative: 0, initiativeBonus: initBonus, conditions: [...sheet.conditions], effects: [],
    saveProficiencies: [...sheet.saveProficiencies], skillBonuses: skills, resistances: [...species.resistances], immunities: [], vulnerabilities: [],
    conditionImmunities: [], classId: sheet.classId, subclass: sheet.subclass, attacks: weaponAttacks(sheet),
    spells: [...sheet.cantrips, ...sheet.spellsKnown], spellSlots: [...sheet.spellSlots], spellSlotsUsed: [...sheet.spellSlotsUsed],
    spellAbility: spellAbility(sheet.classId), resources: resourcesRemaining(sheet), features,
    deathSaves: { successes: 0, failures: 0 }, stable: false, dead: sheet.dead, fled: false, heroicInspiration: sheet.heroicInspiration,
    speciesTraits: species.traits.map((t) => t.key),
  };
}

/** Write combat results back to the persistent sheet. */
export function applyCombatantToSheet(sheet: CharacterSheet, c: Combatant): void {
  sheet.hp = Math.max(0, Math.min(c.hp, sheet.maxHp));
  sheet.tempHp = c.tempHp;
  sheet.spellSlotsUsed = [...c.spellSlotsUsed];
  const max = resourceMax(sheet);
  for (const [k, v] of Object.entries(max)) sheet.resources[k] = Math.max(0, v - (c.resources[k] ?? v));
  sheet.heroicInspiration = !!c.heroicInspiration;
  sheet.conditions = c.conditions.filter((x) => x === "poisoned" || x === "exhaustion");
  if (c.dead) sheet.dead = true;
  if (!c.dead && c.hp <= 0) sheet.hp = 1; // stabilised characters wake with 1 HP after the fight
}

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) if (xp >= XP_THRESHOLDS[l]) lvl = l;
  return lvl;
}

export interface LevelUpChoices { asi?: Partial<AbilityScores>; newSpells?: string[]; newCantrips?: string[] }

export function canLevelUp(sheet: CharacterSheet): boolean {
  return sheet.level < MAX_LEVEL && levelForXp(sheet.xp) > sheet.level;
}

export function levelUp(sheet: CharacterSheet, choices: LevelUpChoices = {}): string[] {
  if (!canLevelUp(sheet)) throw new Error("Not enough XP to level up.");
  const cls = CLASSES[sheet.classId];
  const notes: string[] = [];
  const oldMax = sheet.maxHp;
  sheet.level += 1;
  sheet.hitDice = sheet.level;
  if (sheet.level === 4) {
    const asi = choices.asi ?? { [cls.primary[0]]: 2 };
    const total = Object.values(asi).reduce((s, v) => s + (v ?? 0), 0);
    if (total !== 2) throw new Error("Ability Score Improvement must total +2.");
    for (const [a, v] of Object.entries(asi) as [Ability, number][]) sheet.abilities[a] = Math.min(20, sheet.abilities[a] + v);
    notes.push(`Ability Score Improvement: ${Object.entries(asi).map(([a, v]) => `${a.toUpperCase()} +${v}`).join(", ")}`);
  }
  recalcDerived(sheet);
  sheet.hp += sheet.maxHp - oldMax;
  if (cls.spellcasting) {
    const classSpells = Object.values(SPELLS).filter((s) => s.classes.includes(sheet.classId));
    const maxSpellLevel = sheet.spellSlots.length - 1;
    const wantPrepared = cls.spellcasting.prepared[sheet.level];
    const wantCantrips = cls.spellcasting.cantrips[sheet.level];
    for (const id of choices.newSpells ?? []) {
      const sp = classSpells.find((s) => s.id === id && s.level >= 1 && s.level <= maxSpellLevel);
      if (sp && !sheet.spellsKnown.includes(id)) sheet.spellsKnown.push(id);
    }
    // auto-fill with the highest-level spells available if the player didn't choose
    const pool = classSpells.filter((s) => s.level >= 1 && s.level <= maxSpellLevel && !sheet.spellsKnown.includes(s.id)).sort((a, b) => b.level - a.level);
    while (sheet.spellsKnown.filter((s) => SPELLS[s]?.classes.includes(sheet.classId)).length < wantPrepared && pool.length) sheet.spellsKnown.push(pool.shift()!.id);
    for (const id of choices.newCantrips ?? []) if (classSpells.some((s) => s.id === id && s.level === 0) && !sheet.cantrips.includes(id)) sheet.cantrips.push(id);
    const cpool = classSpells.filter((s) => s.level === 0 && !sheet.cantrips.includes(s.id));
    while (sheet.cantrips.filter((c) => SPELLS[c]?.classes.includes(sheet.classId)).length < wantCantrips && cpool.length) sheet.cantrips.push(cpool.shift()!.id);
    if (sheet.classId === "cleric" && sheet.level >= 3) for (const d of ["aid", "bless", "cureWounds", "lesserRestoration"]) if (!sheet.spellsKnown.includes(d)) sheet.spellsKnown.push(d);
  }
  if (sheet.classId === "rogue" && sheet.level === 2) { /* cunning action */ }
  if (sheet.classId === "wizard" && sheet.level === 2 && !sheet.expertise.length) {
    const s = (["arcana", "history", "investigation"] as Skill[]).find((x) => sheet.skillProficiencies.includes(x));
    if (s) sheet.expertise.push(s);
  }
  if (sheet.classId === "ranger" && sheet.level === 2) {
    sheet.fightingStyle = sheet.fightingStyle ?? "archery";
    const s = sheet.skillProficiencies.find((x) => x === "survival" || x === "perception" || x === "stealth");
    if (s) sheet.expertise.push(s);
  }
  for (const f of cls.features.filter((f) => f.level === sheet.level)) notes.push(`${f.name}: ${f.description}`);
  notes.unshift(`${sheet.name} reaches level ${sheet.level}! HP max ${oldMax} → ${sheet.maxHp}.`);
  return notes;
}

export function longRest(sheet: CharacterSheet): void {
  sheet.hp = sheet.maxHp;
  sheet.tempHp = 0;
  sheet.spellSlotsUsed = sheet.spellSlots.map(() => 0);
  sheet.resources = {};
  sheet.hitDice = sheet.level;
  if (sheet.species === "human") sheet.heroicInspiration = true;
  sheet.exhaustion = Math.max(0, sheet.exhaustion - 1);
  sheet.conditions = [];
}

export function shortRest(sheet: CharacterSheet, rng: Rng, hitDiceToSpend: number): string[] {
  const cls = CLASSES[sheet.classId];
  const notes: string[] = [];
  let spent = 0;
  while (spent < hitDiceToSpend && sheet.hitDice > 0 && sheet.hp < sheet.maxHp) {
    const r = roll(rng, `1d${cls.hitDie}`).total + mod(sheet.abilities.con);
    sheet.hp = Math.min(sheet.maxHp, sheet.hp + Math.max(1, r));
    sheet.hitDice -= 1;
    spent++;
    notes.push(`Spent a Hit Die: +${Math.max(1, r)} HP`);
  }
  if (sheet.classId === "fighter") { sheet.resources.secondWind = Math.max(0, (sheet.resources.secondWind ?? 0) - 1); sheet.resources.actionSurge = 0; }
  if (sheet.classId === "cleric") sheet.resources.channelDivinity = Math.max(0, (sheet.resources.channelDivinity ?? 0) - 1);
  if (sheet.species === "orc") sheet.resources.adrenalineRush = 0;
  if (sheet.classId === "wizard" && !(sheet.resources.arcaneRecovery)) {
    let budget = Math.ceil(sheet.level / 2);
    for (let lvl = Math.min(5, sheet.spellSlots.length - 1); lvl >= 1; lvl--) {
      while (budget >= lvl && (sheet.spellSlotsUsed[lvl] ?? 0) > 0) { sheet.spellSlotsUsed[lvl]--; budget -= lvl; notes.push(`Arcane Recovery restores a level ${lvl} slot.`); }
    }
    if (notes.some((n) => n.startsWith("Arcane"))) sheet.resources.arcaneRecovery = 1;
  }
  return notes;
}

/** Quick-build a sensible character for AI companions or "make one for me". */
export function quickBuild(name: string, ownerId: string, classId: ClassId, species: SpeciesId, background: BackgroundId, id: string): CharacterSheet {
  const cls = CLASSES[classId];
  const bg = BACKGROUNDS[background];
  const base = { ...cls.suggestedAbilities };
  // +2 to the highest-priority available background ability, +1 to the next
  const order = [...cls.primary, "con", "dex", "wis", "str", "int", "cha"] as Ability[];
  const avail = order.filter((a, i) => bg.abilityOptions.includes(a) && order.indexOf(a) === i);
  const bonuses: Partial<AbilityScores> = { [avail[0]]: 2, [avail[1]]: 1 };
  const skills = cls.skillOptions.filter((s) => !bg.skills.includes(s)).slice(0, cls.skillCount + 2);
  return createCharacter({
    name, ownerId, species, classId, background, abilityMethod: "standard", baseAbilities: base, abilityBonuses: bonuses,
    skills, expertise: skills.slice(0, 2), fightingStyle: classId === "fighter" ? "defense" : undefined,
  }, id);
}
