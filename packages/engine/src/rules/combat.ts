// Turn-based tactical combat implementing the 2024 core rules.
// Every state change goes through `applyCommand`, which validates legality first; illegal
// commands are rejected with an explanation and leave the state untouched.
import { MONSTERS } from "../data/monsters.js";
import { SPELLS } from "../data/spells.js";
import { WEAPONS } from "../data/equipment.js";
import { GEAR } from "../data/equipment.js";
import { averageDice, discardRolledDice, drainRolledDice, fmtMod, mod, profForLevel, resetRolledDice, rolledDiceMark, Rng, roll, rollD20 } from "../dice.js";
import type {
  Ability, ActiveEffect, AttackOption, CombatCommand, Combatant, CommandResult, Condition, DamageType, EncounterState,
  GridMap, LogEntry, MonsterAction, MonsterDef, Point, TurnBudget,
} from "../types.js";
import { areaTiles, coverBonus, dist, findPath, hasLineOfSight, inBounds, occupant, passable, samePoint } from "./grid.js";
import { rageDamage, sneakDice, martialArtsDie, bardicDie, SORCERY_SLOT_COST } from "../data/classes.js";

// ---------------------------------------------------------------------------------------------
// Construction

export function monsterCombatant(def: MonsterDef, id: string, pos: Point, rng: Rng, opts: { name?: string; side?: Combatant["side"]; rollHp?: boolean } = {}): Combatant {
  const hp = opts.rollHp ? Math.max(1, roll(rng, def.hp).total) : def.avgHp;
  const profBonus = def.cr < 5 ? 2 : profForLevel(Math.ceil(def.cr));
  const saveBonuses: Partial<Record<Ability, number>> = {};
  for (const a of ["str", "dex", "con", "int", "wis", "cha"] as Ability[]) saveBonuses[a] = def.saves?.[a] ?? mod(def.abilities[a]);
  return {
    id, name: opts.name ?? def.name, side: opts.side ?? "enemy", controller: { kind: "monster" }, monsterId: def.id, level: Math.max(1, Math.ceil(def.cr)),
    size: def.size, abilities: { ...def.abilities }, profBonus, ac: def.ac, maxHp: hp, hp, tempHp: 0, speed: def.speed, pos,
    initiative: 0, initiativeBonus: def.initiativeBonus ?? mod(def.abilities.dex), conditions: [], effects: [], saveProficiencies: [],
    saveBonuses, skillBonuses: { ...(def.skills ?? {}), perception: def.skills?.perception ?? mod(def.abilities.wis), stealth: def.skills?.stealth ?? mod(def.abilities.dex) },
    resistances: [...(def.resistances ?? [])], immunities: [...(def.immunities ?? [])], vulnerabilities: [...(def.vulnerabilities ?? [])],
    conditionImmunities: [...(def.conditionImmunities ?? [])], attacks: [], spells: [], spellSlots: [], spellSlotsUsed: [], resources: {},
    features: (def.traits ?? []).map((t) => t.key ?? t.name), monsterActions: def.actions, behavior: def.behavior,
    deathSaves: { successes: 0, failures: 0 }, stable: false, dead: false, fled: false, xp: def.xp,
  };
}

export function newBudget(c: Combatant): TurnBudget {
  let speed = effectiveSpeed(c);
  return {
    action: true, bonusAction: true, reaction: true, movement: speed,
    attacksLeft: c.features.includes("extraAttack") || c.features.includes("thirstingBlade") ? 2 : 1, sneakAttackUsed: false,
    meleeHits: [],
  };
}

export function effectiveSpeed(c: Combatant): number {
  if (c.conditions.some((x) => x === "grappled" || x === "restrained" || x === "paralyzed" || x === "stunned" || x === "unconscious" || x === "petrified")) return 0;
  let s = c.speed;
  for (const e of c.effects) if (e.kind === "slowed") s -= e.amount ?? 10;
  return Math.max(0, s);
}

export interface EncounterSetup {
  id: string;
  name: string;
  map: GridMap;
  combatants: Combatant[];
  seed?: number;
  objective?: string;
  lootTableId?: string;
  surprised?: ("party" | "enemy")[];
}

export function createEncounter(setup: EncounterSetup): EncounterState {
  const rng = new Rng(setup.seed ?? (Date.now() >>> 0));
  const enc: EncounterState = {
    id: setup.id, name: setup.name, map: setup.map, combatants: setup.combatants, order: [], turnIndex: 0, round: 1,
    budget: { action: true, bonusAction: true, reaction: true, movement: 0, attacksLeft: 1, sneakAttackUsed: false },
    status: "active", log: [], objective: setup.objective, rngState: rng.state, xpPool: 0, lootTableId: setup.lootTableId,
  };
  const log: LogEntry[] = [];
  for (const c of enc.combatants) {
    let adv = 0;
    if (c.features.includes("remarkableAthlete")) adv = 1;
    if (c.side !== "neutral" && setup.surprised?.includes(c.side)) adv = -1; // 2024: surprise = disadvantage on initiative
    if (c.heroicInspiration && c.controller.kind !== "monster") adv = Math.max(adv, 0);
    const r = rollD20(rng, c.initiativeBonus, adv);
    c.initiative = r.total + c.abilities.dex / 100; // dex breaks ties
    log.push(entry("roll", `${c.name} rolls initiative: ${r.rolls.join("/")} ${fmtMod(c.initiativeBonus)} = ${r.total}`, c.id));
  }
  enc.order = [...enc.combatants].sort((a, b) => b.initiative - a.initiative).map((c) => c.id);
  // Monk Uncanny Metabolism: on rolling initiative, regain all Focus and heal (once per Long Rest)
  for (const c of enc.combatants) {
    if (c.features.includes("uncannyMetabolism") && (c.resources.uncannyMetabolism ?? 0) > 0 && (c.resources.focus ?? 0) < c.level && !c.dead && c.hp > 0) {
      c.resources.uncannyMetabolism--;
      c.resources.focus = c.level;
      const h = roll(rng, martialArtsDie(c.level)).total + c.level;
      heal(c, h, log, "Uncanny Metabolism");
    }
  }
  enc.rngState = rng.state;
  enc.log.push(entry("system", `⚔ ${setup.name} — roll for initiative!`), ...log);
  enc.xpPool = enc.combatants.filter((c) => c.side === "enemy").reduce((s, c) => s + (c.xp ?? 0), 0);
  startTurn(enc, rng);
  enc.rngState = rng.state;
  return enc;
}

// ---------------------------------------------------------------------------------------------
// Helpers

let tick = 0;
function entry(kind: LogEntry["kind"], text: string, actorId?: string, data?: unknown): LogEntry {
  // damage/healing lines carry the dice that produced them (for the client's dice animation)
  if (kind === "combat" && /💥|regains|takes \d+/.test(text)) {
    const dice = drainRolledDice();
    if (dice.length) data = { ...(data as object | undefined), dice };
  }
  return { t: Date.now() * 1000 + (tick++ % 1000), kind, text, actorId, data };
}

export function current(enc: EncounterState): Combatant {
  return byId(enc, enc.order[enc.turnIndex])!;
}

export function byId(enc: EncounterState, id: string): Combatant | undefined {
  return enc.combatants.find((c) => c.id === id);
}

export const isDown = (c: Combatant) => c.dead || c.fled || c.hp <= 0;
const incapacitated = (c: Combatant) => c.conditions.some((x) => x === "incapacitated" || x === "paralyzed" || x === "stunned" || x === "unconscious" || x === "petrified");
const hostile = (a: Combatant, b: Combatant) => a.side !== b.side && a.side !== "neutral" && b.side !== "neutral";

function addCondition(c: Combatant, cond: Condition): boolean {
  if (c.conditionImmunities.includes(cond)) return false;
  if (!c.conditions.includes(cond)) c.conditions.push(cond);
  return true;
}
function removeCondition(c: Combatant, cond: Condition) { c.conditions = c.conditions.filter((x) => x !== cond); }

function abilityMod(c: Combatant, a: Ability) { return mod(c.abilities[a]); }

export function saveBonusOf(c: Combatant, a: Ability): number {
  if (c.saveBonuses?.[a] !== undefined) return c.saveBonuses[a]!;
  return abilityMod(c, a) + (c.saveProficiencies.includes(a) ? c.profBonus : 0);
}

function effectiveAc(c: Combatant): number {
  let ac = c.ac;
  for (const e of c.effects) if (e.kind === "acBonus" || e.kind === "shieldSpell") ac += e.amount ?? 0;
  return ac;
}

function spellAttackBonus(c: Combatant): number {
  return c.profBonus + (c.spellAbility ? abilityMod(c, c.spellAbility) : 0);
}
export function spellDc(c: Combatant): number {
  return 8 + spellAttackBonus(c) + (c.effects.some((e) => e.kind === "innateSorcery") ? 1 : 0);
}

/** Monk focus / class feature save DC (8 + Wis + PB). */
function featureDc(c: Combatant, ability: Ability): number {
  return 8 + abilityMod(c, ability) + c.profBonus;
}

/** Bardic Inspiration: an inspired creature adds the die to a failed d20 Test when it could turn the result. */
function useInspiration(c: Combatant, rng: Rng, total: number, target: number, log: LogEntry[], what: string): number {
  const eff = c.effects.find((e) => e.kind === "inspired");
  if (!eff || total >= target || total + (eff.amount ?? 6) < target) return total;
  const d = rng.die(eff.amount ?? 6);
  c.effects = c.effects.filter((e) => e !== eff);
  log.push(entry("roll", `🎵 ${c.name} uses Bardic Inspiration on the ${what}: +${d} (d${eff.amount ?? 6}).`, c.id));
  return total + d;
}

function blessBonus(c: Combatant, rng: Rng): number {
  return c.effects.some((e) => e.kind === "bless") ? rng.die(4) : 0;
}

// ---------------------------------------------------------------------------------------------
// Saving throws

export function makeSave(enc: EncounterState, rng: Rng, c: Combatant, ability: Ability, dc: number, log: LogEntry[], opts: { vsCondition?: Condition; magic?: boolean } = {}): boolean {
  if ((ability === "str" || ability === "dex") && c.conditions.some((x) => x === "paralyzed" || x === "stunned" || x === "unconscious")) {
    log.push(entry("roll", `${c.name} automatically fails the ${ability.toUpperCase()} save.`, c.id));
    return false;
  }
  let adv = 0;
  if (ability === "dex" && c.effects.some((e) => e.kind === "dodge")) adv++;
  if (ability === "dex" && c.features.includes("dangerSense") && !incapacitated(c)) adv++;
  if (ability === "str" && c.effects.some((e) => e.kind === "rage")) adv++;
  if ((ability === "int" || ability === "wis" || ability === "cha") && c.features.includes("gnomishCunning")) adv++;
  if (opts.vsCondition === "charmed" && c.features.includes("feyAncestry")) adv++;
  if (opts.vsCondition === "frightened" && c.features.includes("brave")) adv++;
  if (opts.vsCondition === "poisoned" && c.features.includes("dwarvenResilience")) adv++;
  if (c.conditions.includes("restrained") && ability === "dex") adv--;
  const bonus = saveBonusOf(c, ability) + blessBonus(c, rng);
  const r = rollD20(rng, bonus, Math.sign(adv), { halflingLuck: c.features.includes("luck") });
  const pre = r.total;
  const total = useInspiration(c, rng, pre, dc, log, "saving throw");
  const ok = total >= dc;
  log.push(entry("roll", `${c.name} ${ability.toUpperCase()} save: ${r.rolls.join("/")} ${fmtMod(bonus)}${total !== pre ? ` +${total - pre}` : ""} = ${total} vs DC ${dc} — ${ok ? "success" : "failure"}`, c.id));
  return ok;
}

// ---------------------------------------------------------------------------------------------
// Damage & healing

export interface DamageOptions { crit?: boolean; sourceId?: string; melee?: boolean; attack?: boolean; reaction?: boolean }

export function applyDamage(enc: EncounterState, rng: Rng, target: Combatant, amount: number, type: DamageType, log: LogEntry[], opts: DamageOptions = {}): number {
  if (target.dead || amount <= 0) return 0;
  let dmg = amount;
  const source = opts.sourceId ? byId(enc, opts.sourceId) : undefined;
  // Monk Deflect Attacks (reaction, automatic)
  if (opts.attack && (type === "bludgeoning" || type === "piercing" || type === "slashing") && target.features.includes("deflectAttacks") && target.hp > 0 && targetHasReaction(enc, target)) {
    useReaction(enc, target);
    const red = roll(rng, "1d10").total + abilityMod(target, "dex") + target.level;
    dmg = Math.max(0, dmg - red);
    log.push(entry("combat", `🥋 ${target.name} deflects the blow, reducing the damage by ${red}.`, target.id));
    if (dmg <= 0) return 0;
  }
  // Armor of Agathys: melee attackers take cold damage while the temp HP last
  const agathys = target.effects.find((e) => e.kind === "armorOfAgathys");
  if (agathys && opts.melee && target.tempHp > 0 && source && !source.dead && source.id !== target.id) {
    log.push(entry("combat", `❄ ${source.name} is bitten by frost from ${target.name}'s Armor of Agathys (${agathys.amount} cold).`, target.id));
    applyDamage(enc, rng, source, agathys.amount ?? 5, "cold", log, { sourceId: target.id, reaction: true });
  }
  const rage = target.effects.some((e) => e.kind === "rage");
  if (target.immunities.includes(type)) { log.push(entry("combat", `${target.name} is immune to ${type}.`, target.id)); return 0; }
  if (target.resistances.includes(type) || (rage && (type === "bludgeoning" || type === "piercing" || type === "slashing"))) dmg = Math.floor(dmg / 2);
  if (target.vulnerabilities.includes(type)) dmg *= 2;
  if (target.tempHp > 0) {
    const absorbed = Math.min(target.tempHp, dmg);
    target.tempHp -= absorbed;
    dmg -= absorbed;
  }
  const before = target.hp;
  if (opts.sourceId) target.lastAttackerId = opts.sourceId;

  // Wake from magical sleep
  if (target.effects.some((e) => e.kind === "asleep") && (amount > 0)) {
    target.effects = target.effects.filter((e) => e.kind !== "asleep");
    removeCondition(target, "unconscious");
    removeCondition(target, "incapacitated");
    log.push(entry("combat", `${target.name} wakes up!`, target.id));
  }
  // Hypnotic Pattern ends when the creature takes damage
  if (target.effects.some((e) => e.kind === "pattern")) {
    target.effects = target.effects.filter((e) => e.kind !== "pattern");
    removeCondition(target, "charmed"); removeCondition(target, "incapacitated");
    log.push(entry("combat", `${target.name} snaps out of the hypnotic pattern!`, target.id));
  }
  // Turn Undead ends when the creature takes damage
  if (target.effects.some((e) => e.kind === "frightenedBy")) {
    target.effects = target.effects.filter((e) => e.kind !== "frightenedBy");
    removeCondition(target, "frightened"); removeCondition(target, "incapacitated");
  }

  if (target.hp <= 0 && target.side === "party" && !target.dead) {
    // damage at 0 HP: death save failures (2024)
    if (dmg >= target.maxHp) { target.dead = true; log.push(entry("death", `💀 ${target.name} is killed outright.`, target.id)); return dmg; }
    target.deathSaves.failures += opts.crit ? 2 : 1;
    target.stable = false;
    log.push(entry("combat", `${target.name} takes damage while dying (${target.deathSaves.failures} failure${target.deathSaves.failures > 1 ? "s" : ""}).`, target.id));
    if (target.deathSaves.failures >= 3) { target.dead = true; log.push(entry("death", `💀 ${target.name} has died.`, target.id)); }
    return dmg;
  }

  target.hp -= dmg;
  if (target.hp <= 0) {
    const overflow = -target.hp;
    // Zombie Undead Fortitude
    if (target.features.includes("undeadFortitude") && type !== "radiant" && !opts.crit) {
      const ok = makeSave(enc, rng, target, "con", 5 + dmg, log);
      if (ok) { target.hp = 1; log.push(entry("combat", `${target.name} refuses to fall! (Undead Fortitude)`, target.id)); return dmg; }
    }
    // Orc Relentless Endurance
    if (target.features.includes("relentlessEndurance") && (target.resources.relentlessEndurance ?? 0) > 0 && overflow < target.maxHp) {
      target.resources.relentlessEndurance--;
      target.hp = 1;
      log.push(entry("combat", `${target.name} drops to 1 HP instead! (Relentless Endurance)`, target.id));
      return dmg;
    }
    target.hp = 0;
    if (target.wildShape) revertWildShape(target, log);
    if (target.side === "party" && target.controller.kind !== "monster") {
      if (overflow >= target.maxHp) {
        target.dead = true;
        log.push(entry("death", `💀 ${target.name} suffers massive damage and dies instantly.`, target.id));
      } else {
        addCondition(target, "unconscious");
        addCondition(target, "prone");
        target.deathSaves = { successes: 0, failures: 0 };
        target.stable = false;
        log.push(entry("combat", `${target.name} falls unconscious and is dying!`, target.id));
      }
      endConcentration(enc, target, log);
    } else {
      target.dead = true;
      log.push(entry("death", `☠ ${target.name} falls${before > 0 ? "" : ""}.`, target.id));
      endConcentration(enc, target, log);
      // Fiend warlock: Dark One's Blessing
      if (source && source.features.includes("darkOnesBlessing") && hostile(source, target) && !source.dead) {
        const t = Math.max(1, abilityMod(source, "cha") + source.level);
        if (t > source.tempHp) { source.tempHp = t; log.push(entry("combat", `🔥 ${source.name} drinks in the moment of death: ${t} temporary HP (Dark One's Blessing).`, source.id)); }
      }
    }
    return dmg;
  }
  // Concentration check
  if (target.concentratingOn) {
    const dc = Math.min(30, Math.max(10, Math.floor(dmg / 2)));
    const ok = makeSave(enc, rng, target, "con", dc, log);
    if (!ok) endConcentration(enc, target, log);
  }
  // Hellish Rebuke (automatic reaction)
  if (!opts.reaction && source && hostile(source, target) && !source.dead && target.hp > 0 && target.spells.includes("hellishRebuke") && hasSlot(target, 1)
    && targetHasReaction(enc, target) && dist(source.pos, target.pos) <= 60 && !target.wildShape) {
    const slot = spendSlot(target, 1);
    useReaction(enc, target);
    log.push(entry("combat", `🔥 ${target.name} answers with Hellish Rebuke${slot > 1 ? ` (level ${slot})` : ""}!`, target.id));
    const ok = makeSave(enc, rng, source, "dex", spellDc(target), log);
    const r = roll(rng, `${1 + slot}d10`).total;
    const amt = ok ? Math.floor(r / 2) : r;
    log.push(entry("combat", `💥 ${source.name} takes ${amt} fire.`, target.id));
    applyDamage(enc, rng, source, amt, "fire", log, { sourceId: target.id, reaction: true });
  }
  return dmg;
}

function revertWildShape(c: Combatant, log: LogEntry[]) {
  const w = c.wildShape;
  if (!w) return;
  c.ac = w.ac; c.abilities = w.abilities; c.speed = w.speed; c.attacks = w.attacks; c.size = w.size;
  c.effects = c.effects.filter((e) => e.kind !== "wildShape");
  c.wildShape = undefined;
  log.push(entry("combat", `🐾 ${c.name} returns to their true form.`, c.id));
}

export function heal(target: Combatant, amount: number, log: LogEntry[], source?: string) {
  if (target.dead) return 0;
  if (target.effects.some((e) => e.kind === "noHeal")) { log.push(entry("combat", `${target.name} can't regain HP (necrotic chill).`, target.id)); return 0; }
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  if (before <= 0 && target.hp > 0) {
    removeCondition(target, "unconscious");
    target.deathSaves = { successes: 0, failures: 0 };
    target.stable = false;
  }
  log.push(entry("combat", `${target.name} regains ${target.hp - before} HP${source ? ` (${source})` : ""}. (${target.hp}/${target.maxHp})`, target.id));
  return target.hp - before;
}

function endConcentration(enc: EncounterState, c: Combatant, log: LogEntry[]) {
  if (!c.concentratingOn) return;
  const spell = SPELLS[c.concentratingOn];
  for (const other of enc.combatants) {
    const removed = other.effects.filter((e) => e.source === c.id && e.concentration);
    if (!removed.length) continue;
    other.effects = other.effects.filter((e) => !(e.source === c.id && e.concentration));
    for (const r of removed) {
      if (r.kind === "heldBySpell") removeCondition(other, r.condition ?? "paralyzed");
      if (r.kind === "pattern") { removeCondition(other, "charmed"); removeCondition(other, "incapacitated"); }
      if (r.kind === "asleep") { removeCondition(other, "unconscious"); removeCondition(other, "incapacitated"); }
    }
  }
  log.push(entry("combat", `${c.name} loses concentration on ${spell?.name ?? c.concentratingOn}.`, c.id));
  c.concentratingOn = undefined;
}

function startConcentration(enc: EncounterState, c: Combatant, spellId: string, log: LogEntry[]) {
  if (c.concentratingOn) endConcentration(enc, c, log);
  c.concentratingOn = spellId;
}

// ---------------------------------------------------------------------------------------------
// Attack resolution

interface AttackContext {
  attacker: Combatant;
  target: Combatant;
  toHit: number;
  kind: "melee" | "ranged";
  range?: [number, number];
  reach: number;
  isSpell?: boolean;
  weapon?: AttackOption;
}

function attackAdvantage(enc: EncounterState, ctx: AttackContext, notes: string[]): number {
  const { attacker: a, target: t } = ctx;
  let adv = 0, dis = 0;
  const d = dist(a.pos, t.pos);
  if (t.conditions.includes("prone")) { if (d <= 5) { adv++; notes.push("target prone"); } else { dis++; notes.push("target prone at range"); } }
  if (a.conditions.includes("prone")) { dis++; notes.push("attacker prone"); }
  if (t.conditions.some((x) => x === "restrained" || x === "paralyzed" || x === "stunned" || x === "unconscious" || x === "blinded")) { adv++; notes.push("target helpless"); }
  if (a.conditions.some((x) => x === "restrained" || x === "poisoned" || x === "blinded" || x === "frightened")) { dis++; notes.push("attacker hindered"); }
  if (a.effects.some((e) => e.kind === "hidden") || a.conditions.includes("invisible")) { adv++; notes.push("unseen attacker"); }
  if (t.conditions.includes("invisible")) { dis++; notes.push("invisible target"); }
  if (t.effects.some((e) => e.kind === "dodge") && !incapacitated(t)) { dis++; notes.push("dodging"); }
  if (t.effects.some((e) => e.kind === "advantageNextAttackAgainst")) { adv++; notes.push("guided/helped"); }
  if (t.effects.some((e) => e.kind === "recklessAttack")) { adv++; notes.push("reckless target"); }
  if (a.effects.some((e) => e.kind === "recklessAttack") && ctx.kind === "melee" && !ctx.isSpell) { adv++; notes.push("reckless"); }
  if (a.effects.some((e) => e.kind === "vexed" && e.targetId === t.id)) { adv++; notes.push("vex"); }
  if (a.effects.some((e) => e.kind === "sapped")) { dis++; notes.push("sapped"); }
  if (a.effects.some((e) => e.kind === "helped")) { adv++; notes.push("helped"); }
  if (t.effects.some((e) => e.kind === "faerieFire")) { adv++; notes.push("faerie fire"); }
  if (a.effects.some((e) => e.kind === "mockery")) { dis++; notes.push("mocked"); }
  if (ctx.isSpell && a.effects.some((e) => e.kind === "innateSorcery")) { adv++; notes.push("innate sorcery"); }
  if (ctx.kind === "ranged") {
    const enemyAdjacent = enc.combatants.some((o) => hostile(o, a) && !isDown(o) && !incapacitated(o) && dist(o.pos, a.pos) <= 5);
    if (enemyAdjacent) { dis++; notes.push("enemy adjacent"); }
    if (ctx.range && d > ctx.range[0]) { dis++; notes.push("long range"); }
  }
  if (a.features.includes("packTactics")) {
    const ally = enc.combatants.some((o) => o.id !== a.id && o.side === a.side && !isDown(o) && !incapacitated(o) && dist(o.pos, t.pos) <= 5);
    if (ally) { adv++; notes.push("pack tactics"); }
  }
  return adv > 0 && dis === 0 ? 1 : dis > 0 && adv === 0 ? -1 : 0;
}

function consumeOnAttackEffects(a: Combatant, t: Combatant) {
  t.effects = t.effects.filter((e) => e.kind !== "advantageNextAttackAgainst");
  a.effects = a.effects.filter((e) => !(e.kind === "vexed" && e.targetId === t.id) && e.kind !== "sapped" && e.kind !== "helped" && e.kind !== "hidden" && e.kind !== "mockery");
}

interface AttackRollResult { hit: boolean; crit: boolean; natural: number; total: number; adv: number }

function rollAttack(enc: EncounterState, rng: Rng, ctx: AttackContext, log: LogEntry[], label: string): AttackRollResult {
  const notes: string[] = [];
  const adv = attackAdvantage(enc, ctx, notes);
  const bonus = ctx.toHit + blessBonus(ctx.attacker, rng);
  const r = rollD20(rng, bonus, adv, { halflingLuck: ctx.attacker.features.includes("luck") });
  const cover = coverBonus(enc, ctx.attacker.pos, ctx.target.pos, [ctx.attacker.id, ctx.target.id]);
  let ac = effectiveAc(ctx.target) + cover;
  const critRange = ctx.attacker.features.includes("improvedCritical") && !ctx.isSpell ? 19 : 20;
  let crit = r.natural >= critRange;
  let total = r.natural === 1 ? r.total : useInspiration(ctx.attacker, rng, r.total, ac, log, "attack roll");
  let hit = r.natural !== 1 && (crit || total >= ac);
  // College of Lore: Cutting Words (automatic reaction from an enemy bard within 60 ft)
  if (hit && !crit) {
    const bard = enc.combatants.find((o) => o.features.includes("cuttingWords") && hostile(o, ctx.attacker) && !isDown(o) && (o.resources.bardicInspiration ?? 0) > 0
      && dist(o.pos, ctx.attacker.pos) <= 60 && targetHasReaction(enc, o) && total - ac < bardicDie(o.level));
    if (bard) {
      useReaction(enc, bard);
      bard.resources.bardicInspiration--;
      const d = rng.die(bardicDie(bard.level));
      total -= d;
      hit = total >= ac;
      log.push(entry("combat", `🎵 ${bard.name}'s Cutting Words distract ${ctx.attacker.name}: -${d}${hit ? "" : " — the attack misses!"}`, bard.id));
    }
  }
  // Auto-crit on paralyzed/unconscious within 5 ft
  if (hit && dist(ctx.attacker.pos, ctx.target.pos) <= 5 && ctx.target.conditions.some((x) => x === "paralyzed" || x === "unconscious")) crit = true;
  // Shield spell reaction (auto when it turns a hit into a miss)
  if (hit && !crit && ctx.target.spells.includes("shield") && hasSlot(ctx.target, 1) && targetHasReaction(enc, ctx.target) && total < ac + 5 && !ctx.target.wildShape) {
    spendSlot(ctx.target, 1);
    useReaction(enc, ctx.target);
    ctx.target.effects.push({ id: `shield-${ctx.target.id}`, name: "Shield", source: ctx.target.id, kind: "shieldSpell", amount: 5, expires: "startOfOwnTurn" });
    ac += 5;
    hit = false;
    log.push(entry("combat", `🛡 ${ctx.target.name} casts Shield! (+5 AC)`, ctx.target.id));
  }
  const advTxt = adv > 0 ? " (adv)" : adv < 0 ? " (disadv)" : "";
  log.push(entry("roll", `${ctx.attacker.name} → ${ctx.target.name}: ${label}${advTxt} ${r.rolls.join("/")} ${fmtMod(bonus)} = ${total} vs AC ${ac}${cover ? ` (incl. +${cover} cover)` : ""} — ${crit ? "CRITICAL HIT!" : hit ? "hit" : "miss"}${notes.length ? ` [${notes.join(", ")}]` : ""}`, ctx.attacker.id, { natural: r.natural, rolls: r.rolls }));
  consumeOnAttackEffects(ctx.attacker, ctx.target);
  return { hit, crit, natural: r.natural, total, adv };
}

// Reaction tracking for non-active combatants lives in effects: a "used" reaction effect until their turn.
function targetHasReaction(enc: EncounterState, c: Combatant): boolean {
  if (incapacitated(c) || isDown(c)) return false;
  if (current(enc).id === c.id) return enc.budget.reaction;
  return !c.effects.some((e) => e.id === `reaction-used-${c.id}`) && !c.effects.some((e) => e.kind === "noReactions");
}
function useReaction(enc: EncounterState, c: Combatant) {
  if (current(enc).id === c.id) enc.budget.reaction = false;
  else c.effects.push({ id: `reaction-used-${c.id}`, name: "Reaction used", source: c.id, kind: "heroic", expires: "startOfOwnTurn" });
}

function hasSlot(c: Combatant, level: number): boolean {
  for (let l = level; l < c.spellSlots.length; l++) if ((c.spellSlots[l] ?? 0) - (c.spellSlotsUsed[l] ?? 0) > 0) return true;
  return false;
}
function spendSlot(c: Combatant, level: number): number {
  for (let l = level; l < c.spellSlots.length; l++) {
    if ((c.spellSlots[l] ?? 0) - (c.spellSlotsUsed[l] ?? 0) > 0) { c.spellSlotsUsed[l] = (c.spellSlotsUsed[l] ?? 0) + 1; return l; }
  }
  return 0;
}
export function slotsRemaining(c: Combatant): number[] {
  return c.spellSlots.map((s, i) => Math.max(0, s - (c.spellSlotsUsed[i] ?? 0)));
}

// ---------------------------------------------------------------------------------------------
// Weapon attacks (PCs)

function weaponDamage(enc: EncounterState, rng: Rng, a: Combatant, t: Combatant, atk: AttackOption, crit: boolean, adv: number, log: LogEntry[], opts: { offhand?: boolean; cleave?: boolean } = {}) {
  // Great Weapon Fighting: two-handed melee (or versatile wielded in two hands) treats 1s and 2s as 3s
  const twoHanded = atk.kind === "melee" && (WEAPONS[atk.weaponId ?? ""]?.properties.includes("twoHanded") || atk.damage !== WEAPONS[atk.weaponId ?? ""]?.damage);
  const rerollBelow = twoHanded && hasFightingStyle(a, "greatWeapon") ? 3 : undefined;
  const mark = rolledDiceMark();
  let r = roll(rng, atk.damage, { crit, rerollBelow });
  // Savage Attacker: once per turn roll weapon damage dice twice and take the higher
  if (a.features.includes("savageAttacker") && !a.effects.some((e) => e.id === `savage-${a.id}`)) {
    const r2 = roll(rng, atk.damage, { crit, rerollBelow });
    const n = r.rolls.length;
    if (r2.total > r.total) { r = r2; discardRolledDice(mark, n); } else discardRolledDice(mark + n, n);
    a.effects.push({ id: `savage-${a.id}`, name: "Savage Attacker used", source: a.id, kind: "heroic", expires: "endOfOwnTurn" });
  }
  let bonus = opts.offhand || opts.cleave ? Math.min(0, atk.damageBonus) : atk.damageBonus;
  const parts: string[] = [`${atk.damage}${crit ? "×2" : ""}: ${r.rolls.join("+")}${bonus ? ` ${fmtMod(bonus)}` : ""}`];
  let total = r.total + bonus;
  // Rage damage
  if (a.effects.some((e) => e.kind === "rage") && atk.kind === "melee" && abilityMod(a, "str") >= abilityMod(a, "dex") - (atk.finesse ? 0 : 99)) { total += rageDamage(a.level); parts.push(`rage +${rageDamage(a.level)}`); }
  // Berserker Frenzy
  if (a.features.includes("frenzy") && a.effects.some((e) => e.kind === "rage") && a.effects.some((e) => e.kind === "recklessAttack") && !a.effects.some((e) => e.id === `frenzy-${a.id}`)) {
    const f = roll(rng, `${rageDamage(a.level)}d6`, { crit });
    total += f.total; parts.push(`frenzy ${f.rolls.join("+")}`);
    a.effects.push({ id: `frenzy-${a.id}`, name: "Frenzy used", source: a.id, kind: "heroic", expires: "endOfOwnTurn" });
  }
  // Sneak Attack
  if (a.features.includes("sneakAttack") && !enc.budget.sneakAttackUsed && current(enc).id === a.id && (atk.finesse || atk.kind === "ranged")) {
    const allyNear = enc.combatants.some((o) => o.id !== a.id && o.side === a.side && !isDown(o) && !incapacitated(o) && dist(o.pos, t.pos) <= 5);
    if ((adv > 0 || (allyNear && adv >= 0))) {
      const s = roll(rng, `${sneakDice(a.level)}d6`, { crit });
      total += s.total; parts.push(`sneak attack ${s.rolls.join("+")}`);
      enc.budget.sneakAttackUsed = true;
    }
  }
  // Hunter's Mark
  if (a.effects.some((e) => e.kind === "huntersMark" && e.targetId === t.id) || t.effects.some((e) => e.kind === "huntersMark" && e.source === a.id)) {
    const h = roll(rng, "1d6", { crit }); total += h.total; parts.push(`hunter's mark ${h.rolls.join("+")}`);
  }
  // Colossus Slayer
  if (a.features.includes("colossusSlayer") && t.hp < t.maxHp && !a.effects.some((e) => e.id === `colossus-${a.id}`)) {
    const h = roll(rng, "1d8", { crit }); total += h.total; parts.push(`colossus slayer ${h.rolls.join("+")}`);
    a.effects.push({ id: `colossus-${a.id}`, name: "Colossus Slayer used", source: a.id, kind: "heroic", expires: "endOfOwnTurn" });
  }
  log.push(entry("combat", `💥 ${t.name} takes ${Math.max(0, total)} ${atk.damageType} damage (${parts.join(", ")}).`, a.id));
  if (crit && a.side === "party") a.resources._crits = (a.resources._crits ?? 0) + 1;
  applyDamage(enc, rng, t, Math.max(0, total), atk.damageType, log, { crit, sourceId: a.id, attack: true, melee: atk.kind === "melee" });
  hexDamage(enc, rng, a, t, crit, log);
}

/** Warlock Hex: +1d6 necrotic when the caster hits the cursed creature with an attack. */
function hexDamage(enc: EncounterState, rng: Rng, a: Combatant, t: Combatant, crit: boolean, log: LogEntry[]) {
  if (t.dead || !t.effects.some((e) => e.kind === "hexed" && e.source === a.id)) return;
  const h = roll(rng, "1d6", { crit }).total;
  log.push(entry("combat", `🕯 Hex: ${t.name} takes ${h} necrotic.`, a.id));
  applyDamage(enc, rng, t, h, "necrotic", log, { sourceId: a.id });
}

/** A full weapon/unarmed attack: roll, damage, mastery, and tracking hits for smites and Stunning Strike. */
function weaponStrike(enc: EncounterState, rng: Rng, a: Combatant, t: Combatant, atk: AttackOption, kind: "melee" | "ranged", log: LogEntry[], opts: { offhand?: boolean; label?: string } = {}): AttackRollResult {
  const res = rollAttack(enc, rng, { attacker: a, target: t, toHit: atk.toHit, kind, reach: atk.reach, range: atk.range, weapon: atk }, log, opts.label ?? atk.name);
  if (res.hit) weaponDamage(enc, rng, a, t, atk, res.crit, res.adv, log, { offhand: opts.offhand });
  applyMastery(enc, rng, a, t, atk, res.hit, log);
  if (res.hit && kind === "melee" && current(enc).id === a.id) {
    enc.budget.meleeHits = enc.budget.meleeHits ?? [];
    enc.budget.meleeHits.push({ targetId: t.id, crit: res.crit, unarmed: atk.id === "unarmed" });
  }
  return res;
}

/** Applies temporary attack modifiers (Shillelagh, Sacred Weapon) to an attack option. */
function effectiveAttack(a: Combatant, atk: AttackOption): AttackOption {
  let x = atk;
  const shil = a.effects.find((e) => e.kind === "shillelagh");
  if (shil && (atk.weaponId === "club" || atk.weaponId === "quarterstaff")) {
    const m = a.spellAbility ? abilityMod(a, a.spellAbility) : 0;
    x = { ...x, toHit: m + a.profBonus, damage: a.level >= 5 ? "1d10" : "1d8", damageBonus: m, name: `${atk.name} (Shillelagh)` };
  }
  const sw = a.effects.find((e) => e.kind === "sacredWeapon");
  if (sw && atk.kind === "melee" && atk.weaponId) x = { ...x, toHit: x.toHit + (sw.amount ?? 1), name: `${x.name} (Sacred)` };
  return x;
}

function hasFightingStyle(_a: Combatant, _s: string) {
  return _a.features.includes(`style:${_s}`);
}

function applyMastery(enc: EncounterState, rng: Rng, a: Combatant, t: Combatant, atk: AttackOption, hit: boolean, log: LogEntry[]) {
  if (!atk.mastery) return;
  const abil = atk.kind === "ranged" ? "dex" : atk.finesse ? (abilityMod(a, "dex") > abilityMod(a, "str") ? "dex" : "str") : "str";
  const dc = 8 + abilityMod(a, abil) + a.profBonus;
  switch (atk.mastery) {
    case "graze":
      if (!hit && atk.damageBonus > 0 && !t.dead) {
        log.push(entry("combat", `Graze: ${t.name} still takes ${atk.damageBonus} ${atk.damageType} damage.`, a.id));
        applyDamage(enc, rng, t, atk.damageBonus, atk.damageType, log, { sourceId: a.id });
      }
      return;
    case "vex":
      if (hit) a.effects.push({ id: `vex-${a.id}-${t.id}`, name: "Vex", source: a.id, kind: "vexed", targetId: t.id, expires: "endOfOwnTurn" });
      if (hit) { const e = a.effects[a.effects.length - 1]; e.expires = "never"; e.id += `-r${enc.round}`; }
      return;
    case "sap":
      if (hit && !t.dead) { t.effects.push({ id: `sap-${t.id}`, name: "Sapped", source: a.id, kind: "sapped", expires: "startOfSourceTurn" }); log.push(entry("combat", `Sap: ${t.name} has disadvantage on its next attack.`, a.id)); }
      return;
    case "slow":
      if (hit && !t.dead && !t.effects.some((e) => e.kind === "slowed" && e.source === a.id)) { t.effects.push({ id: `slow-${t.id}-${a.id}`, name: "Slowed", source: a.id, kind: "slowed", amount: 10, expires: "startOfSourceTurn" }); log.push(entry("combat", `Slow: ${t.name}'s speed drops by 10 ft.`, a.id)); }
      return;
    case "topple":
      if (hit && !t.dead && !t.conditions.includes("prone")) {
        const ok = makeSave(enc, rng, t, "con", dc, log);
        if (!ok && addCondition(t, "prone")) log.push(entry("combat", `Topple: ${t.name} is knocked Prone!`, a.id));
      }
      return;
    case "push":
      if (hit && !t.dead && (t.size !== "huge" && t.size !== "gargantuan")) pushAway(enc, a.pos, t, 10, log);
      return;
    case "cleave":
      if (hit && !enc.budget.cleaveUsed && atk.kind === "melee") {
        const second = enc.combatants.find((o) => o.id !== t.id && hostile(a, o) && !isDown(o) && dist(o.pos, t.pos) <= 5 && dist(o.pos, a.pos) <= atk.reach);
        if (second) {
          enc.budget.cleaveUsed = true;
          log.push(entry("combat", `Cleave! ${a.name} swings through to ${second.name}.`, a.id));
          const res = rollAttack(enc, rng, { attacker: a, target: second, toHit: atk.toHit, kind: "melee", reach: atk.reach, weapon: atk }, log, atk.name);
          if (res.hit) weaponDamage(enc, rng, a, second, atk, res.crit, res.adv, log, { cleave: true });
        }
      }
      return;
    case "nick":
      return; // handled in the light-weapon extra attack rule
  }
}

function pushAway(enc: EncounterState, from: Point, t: Combatant, feet: number, log: LogEntry[]) {
  const dx = Math.sign(t.pos.x - from.x), dy = Math.sign(t.pos.y - from.y);
  let moved = 0;
  for (let i = 0; i < feet / 5; i++) {
    const n = { x: t.pos.x + dx, y: t.pos.y + dy };
    if (!inBounds(enc.map, n) || !passable(enc.map, n) || occupant(enc, n)) break;
    t.pos = n; moved += 5;
  }
  if (moved) log.push(entry("combat", `${t.name} is pushed ${moved} ft.`, t.id));
}

// ---------------------------------------------------------------------------------------------
// Turn flow

function expireEffects(enc: EncounterState, actorId: string, when: "start" | "end") {
  for (const c of enc.combatants) {
    c.effects = c.effects.filter((e) => {
      if (when === "start" && e.expires === "startOfSourceTurn" && e.source === actorId) { if (e.kind === "stunnedBy") removeCondition(c, "stunned"); return false; }
      if (when === "start" && e.expires === "startOfOwnTurn" && c.id === actorId) return false;
      if (when === "end" && e.expires === "endOfSourceTurn" && e.source === actorId) return false;
      if (when === "end" && e.expires === "endOfOwnTurn" && c.id === actorId) return false;
      return true;
    });
  }
  // Vex lasts until the end of the attacker's next turn: drop vex marks from previous rounds at turn end
  if (when === "end") {
    const a = byId(enc, actorId);
    if (a) a.effects = a.effects.filter((e) => !(e.kind === "vexed" && !e.id.endsWith(`-r${enc.round}`)));
  }
}

function startTurn(enc: EncounterState, rng: Rng) {
  resetRolledDice();
  const c = current(enc);
  const log: LogEntry[] = [];
  expireEffects(enc, c.id, "start");
  enc.budget = newBudget(c);
  if (c.effects.some((e) => e.kind === "rage") && false) { /* rage persists */ }
  // Monster recharge
  if (c.monsterActions) for (const a of c.monsterActions) if (a.recharge && (c.resources[`spent:${a.id}`] ?? 0) > 0) {
    const r = rng.die(6);
    if (r >= a.recharge) { c.resources[`spent:${a.id}`] = 0; log.push(entry("roll", `${c.name}'s ${a.name} recharges (${r}).`, c.id)); }
  }
  // Spirit Guardians damage to enemies starting turn in aura
  for (const caster of enc.combatants) {
    const eff = caster.effects.find((e) => e.kind === "spiritGuardians" && e.source === caster.id);
    if (!eff || isDown(caster) || !hostile(caster, c) || isDown(c)) continue;
    if (dist(caster.pos, c.pos) <= 15) {
      const ok = makeSave(enc, rng, c, "wis", eff.saveDc ?? spellDc(caster), log);
      const r = roll(rng, `${eff.amount ?? 3}d8`);
      const dmg = ok ? Math.floor(r.total / 2) : r.total;
      log.push(entry("combat", `Spirit Guardians sear ${c.name} for ${dmg} radiant.`, caster.id));
      applyDamage(enc, rng, c, dmg, "radiant", log, { sourceId: caster.id });
    }
  }
  // Moonbeam: creatures starting their turn in the beam
  for (const caster of enc.combatants) {
    const mb = caster.effects.find((e) => e.kind === "moonbeam" && e.source === caster.id);
    if (!mb?.point || isDown(c) || dist(mb.point, c.pos) > 5) continue;
    const ok = makeSave(enc, rng, c, "con", mb.saveDc ?? spellDc(caster), log);
    const r = roll(rng, mb.dice ?? "2d10").total;
    const dmg = ok ? Math.floor(r / 2) : r;
    log.push(entry("combat", `🌕 The moonbeam sears ${c.name} for ${dmg} radiant.`, caster.id));
    applyDamage(enc, rng, c, dmg, "radiant", log, { sourceId: caster.id });
  }
  // Searing Smite: burning creatures take fire damage, then try to put it out
  const burn = c.effects.find((e) => e.kind === "burning");
  if (burn && !isDown(c)) {
    const r = roll(rng, burn.dice ?? "1d6").total;
    log.push(entry("combat", `🔥 ${c.name} burns for ${r} fire.`, burn.source));
    applyDamage(enc, rng, c, r, "fire", log, { sourceId: burn.source });
    if (!c.dead && makeSave(enc, rng, c, "con", burn.saveDc ?? 13, log)) {
      c.effects = c.effects.filter((e) => e !== burn);
      log.push(entry("combat", `${c.name} puts out the flames.`, c.id));
    }
  }
  log.push(entry("system", `— ${c.name}'s turn (round ${enc.round}) —`, c.id));
  // Death saves
  if (c.side === "party" && c.hp <= 0 && !c.dead && !c.stable) {
    const r = rollD20(rng, 0, 0, { halflingLuck: c.features.includes("luck") });
    const mark = c.deathSaveMod ?? 0; // "Returned from the Grave" penalty
    const total = r.natural + mark;
    const markTxt = mark ? ` ${mark} (returned from the grave) = ${total}` : "";
    if (r.natural === 20) { c.hp = 1; removeCondition(c, "unconscious"); c.deathSaves = { successes: 0, failures: 0 }; log.push(entry("roll", `${c.name} rolls a natural 20 on the death save and surges back with 1 HP!`, c.id)); }
    else if (r.natural === 1) { c.deathSaves.failures += 2; log.push(entry("roll", `${c.name} rolls a 1 on the death save — two failures!`, c.id)); }
    else if (total >= 10) { c.deathSaves.successes++; log.push(entry("roll", `${c.name} death save: ${r.natural}${markTxt} — success (${c.deathSaves.successes}/3).`, c.id, { natural: r.natural, rolls: r.rolls })); }
    else { c.deathSaves.failures++; log.push(entry("roll", `${c.name} death save: ${r.natural}${markTxt} — failure (${c.deathSaves.failures}/3).`, c.id, { natural: r.natural, rolls: r.rolls })); }
    if (c.deathSaves.failures >= 3) { c.dead = true; log.push(entry("death", `💀 ${c.name} has died.`, c.id)); }
    else if (c.deathSaves.successes >= 3) { c.stable = true; log.push(entry("combat", `${c.name} is stable.`, c.id)); }
  }
  enc.log.push(...log);
}

function endTurnInternal(enc: EncounterState, rng: Rng, log: LogEntry[]) {
  const c = current(enc);
  // repeat saves vs ongoing conditions
  for (const e of [...c.effects]) {
    if (e.kind === "heldBySpell" && e.saveAbility && e.saveDc) {
      const ok = makeSave(enc, rng, c, e.saveAbility, e.saveDc, log);
      if (ok) { c.effects = c.effects.filter((x) => x !== e); removeCondition(c, e.condition ?? "paralyzed"); log.push(entry("combat", `${c.name} breaks free of ${e.name}.`, c.id)); }
    }
    if (e.kind === "frightenedBy" && e.saveAbility && e.saveDc && e.expires === "never") {
      // Turn Undead lasts 1 minute; no repeat save in 2024 (ends on damage)
    }
  }
  // Ghoul paralysis ends at end of target's next turn
  c.effects = c.effects.filter((e) => {
    if (e.name === "Ghoul Paralysis") { removeCondition(c, "paralyzed"); log.push(entry("combat", `${c.name} can move again.`, c.id)); return false; }
    return true;
  });
  // Rage ends if you didn't attack or take damage... (simplified: rage lasts the encounter, 10 rounds)
  expireEffects(enc, c.id, "end");
  enc.log.push(...log);
  checkEnd(enc);
  if (enc.status !== "active") return;
  // advance
  for (let i = 0; i < enc.order.length; i++) {
    enc.turnIndex = (enc.turnIndex + 1) % enc.order.length;
    if (enc.turnIndex === 0) enc.round++;
    const n = current(enc);
    if (!n.dead && !n.fled) break;
  }
  startTurn(enc, rng);
  // auto-skip incapacitated non-dying creatures
  const n = current(enc);
  if (n.hp <= 0 || n.dead || incapacitated(n)) {
    if (n.side === "party" && n.hp <= 0 && !n.dead) { /* death save already rolled */ }
    else if (incapacitated(n)) enc.log.push(entry("combat", `${n.name} is ${n.conditions.filter((x) => ["paralyzed", "stunned", "unconscious", "incapacitated"].includes(x)).join(", ")} and can't act.`, n.id));
    checkEnd(enc);
    if (enc.status === "active") endTurnInternal(enc, rng, []);
  }
}

export function checkEnd(enc: EncounterState) {
  if (enc.status !== "active") return;
  const enemiesUp = enc.combatants.some((c) => c.side === "enemy" && !c.dead && !c.fled && c.hp > 0 && !c.effects.some((e) => e.kind === "frightenedBy" && false));
  const partyUp = enc.combatants.some((c) => c.side === "party" && !c.dead && !c.fled && c.hp > 0);
  if (!enemiesUp) { enc.status = "victory"; enc.log.push(entry("system", `🏆 Victory! The ${enc.name} is won.`)); }
  else if (!partyUp) { enc.status = "defeat"; enc.log.push(entry("system", `☠ The party has fallen...`)); }
  else if (!enc.combatants.some((c) => c.side === "party" && !c.dead && !c.fled)) { enc.status = "fled"; }
}

// ---------------------------------------------------------------------------------------------
// Opportunity attacks

function opportunityAttacks(enc: EncounterState, rng: Rng, mover: Combatant, from: Point, to: Point, log: LogEntry[]) {
  if (enc.budget.disengaged) return;
  for (const o of enc.combatants) {
    if (!hostile(o, mover) || isDown(o) || incapacitated(o) || isDown(mover)) continue;
    const reach = o.attacks.find((a) => a.kind === "melee")?.reach ?? o.monsterActions?.find((a) => a.kind === "melee")?.reach ?? 0;
    if (!reach) continue;
    if (dist(o.pos, from) <= reach && dist(o.pos, to) > reach && targetHasReaction(enc, o)) {
      useReaction(enc, o);
      log.push(entry("combat", `⚡ ${o.name} makes an Opportunity Attack against ${mover.name}!`, o.id));
      if (o.monsterActions) {
        const act = o.monsterActions.find((a) => a.kind === "melee")!;
        resolveMonsterAttack(enc, rng, o, mover, act, log);
      } else {
        const atk = o.attacks.find((a) => a.kind === "melee")!;
        const res = rollAttack(enc, rng, { attacker: o, target: mover, toHit: atk.toHit, kind: "melee", reach: atk.reach, weapon: atk }, log, atk.name);
        if (res.hit) weaponDamage(enc, rng, o, mover, atk, res.crit, res.adv, log);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Monster actions

function resolveMonsterAttack(enc: EncounterState, rng: Rng, m: Combatant, t: Combatant, act: MonsterAction, log: LogEntry[]) {
  const kind = act.kind === "ranged" || (act.range && dist(m.pos, t.pos) > (act.reach ?? 5)) ? "ranged" : "melee";
  const res = rollAttack(enc, rng, { attacker: m, target: t, toHit: act.toHit ?? 0, kind, reach: act.reach ?? 5, range: act.range }, log, act.name);
  if (!res.hit) return;
  let total = 0;
  const parts: string[] = [];
  for (const d of act.damage ?? []) {
    const r = roll(rng, d.dice, { crit: res.crit });
    let amt = r.total + d.bonus;
    // goblin "extra damage with advantage"
    total += amt;
    parts.push(`${amt} ${d.type}`);
    applyDamage(enc, rng, t, amt, d.type, log, { crit: res.crit, sourceId: m.id, attack: true, melee: kind === "melee" });
  }
  if (act.description?.includes("if the attack roll had Advantage") && res.adv > 0 && !t.dead) {
    const extra = rng.die(4); total += extra; parts.push(`${extra} (advantage)`);
    applyDamage(enc, rng, t, extra, act.damage?.[0]?.type ?? "slashing", log, { sourceId: m.id });
  }
  log.push(entry("combat", `💥 ${act.name} deals ${parts.join(" + ")} to ${t.name}.`, m.id));
  if (act.rider && !t.dead) {
    const r = act.rider;
    if (r.condition) {
      let applies = true;
      if (r.dcSave) applies = !makeSave(enc, rng, t, r.dcSave.ability, r.dcSave.dc, log, { vsCondition: r.condition });
      if (r.condition === "paralyzed" && (t.features.includes("feyAncestry") || t.features.includes("trance"))) applies = false; // elves resist ghoul paralysis
      if (r.condition === "prone" && (t.size === "huge" || t.size === "gargantuan")) applies = false;
      if (applies && addCondition(t, r.condition)) {
        log.push(entry("combat", `${t.name} is ${r.condition}!`, t.id));
        if (r.condition === "paralyzed") t.effects.push({ id: `ghoulpara-${t.id}`, name: "Ghoul Paralysis", source: m.id, kind: "heroic", expires: "never" });
      }
    }
    if (act.id === "lifeDrain") { t.maxHp = Math.max(1, t.maxHp - total); t.hp = Math.min(t.hp, t.maxHp); }
  }
}

function resolveMonsterSave(enc: EncounterState, rng: Rng, m: Combatant, targets: Combatant[], act: MonsterAction, log: LogEntry[]) {
  for (const t of targets) {
    const ok = makeSave(enc, rng, t, act.save!.ability, act.save!.dc, log, { vsCondition: act.rider?.condition });
    if (act.damage?.length) {
      for (const d of act.damage) {
        const r = roll(rng, d.dice);
        const amt = ok ? (act.save!.half ? Math.floor((r.total + d.bonus) / 2) : 0) : r.total + d.bonus;
        if (amt > 0) { log.push(entry("combat", `💥 ${act.name}: ${t.name} takes ${amt} ${d.type}.`, m.id)); applyDamage(enc, rng, t, amt, d.type, log, { sourceId: m.id }); }
      }
    }
    if (!ok && act.rider?.condition && !t.dead) {
      if (addCondition(t, act.rider.condition)) {
        log.push(entry("combat", `${t.name} is ${act.rider.condition}!`, t.id));
        if (act.id === "holdPerson") {
          t.effects.push({ id: `hold-${t.id}`, name: "Hold Person", source: m.id, kind: "heldBySpell", condition: "paralyzed", saveAbility: "wis", saveDc: act.save!.dc, expires: "never", concentration: true });
          m.concentratingOn = "holdPerson";
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Command application

export function applyCommand(enc: EncounterState, actorId: string, cmd: CombatCommand): CommandResult {
  resetRolledDice();
  const rng = new Rng(enc.rngState);
  const log: LogEntry[] = [];
  const fail = (error: string): CommandResult => ({ ok: false, error, log: [] });
  if (enc.status !== "active") return fail("The encounter is over.");
  const a = current(enc);
  if (a.id !== actorId) return fail(`It is ${a.name}'s turn.`);
  if (a.dead || a.hp <= 0) {
    if (cmd.type !== "endTurn") return fail(`${a.name} is down.`);
  }
  if (incapacitated(a) && cmd.type !== "endTurn") return fail(`${a.name} is incapacitated.`);
  const b = enc.budget;
  const target = (id?: string) => (id ? byId(enc, id) : undefined);

  const needAction = () => {
    if (!b.action) return "No action remaining this turn.";
    return null;
  };

  switch (cmd.type) {
    case "endTurn": {
      log.push(entry("system", `${a.name} ends their turn.`, a.id));
      enc.log.push(...log);
      endTurnInternal(enc, rng, []);
      enc.rngState = rng.state;
      return { ok: true, log };
    }
    case "standUp": {
      if (!a.conditions.includes("prone")) return fail("Not prone.");
      const cost = Math.ceil(effectiveSpeed(a) / 2);
      if (b.movement < cost) return fail("Not enough movement to stand.");
      b.movement -= cost; removeCondition(a, "prone");
      log.push(entry("combat", `${a.name} stands up (${cost} ft of movement).`, a.id));
      break;
    }
    case "move": {
      if (a.conditions.includes("prone")) return fail("You are prone. Stand up first (costs half your speed).");
      const res = findPath(enc, a, cmd.to, b.movement);
      if (!res) return fail("Can't reach that square with your remaining movement.");
      if (res.cost > b.movement) return fail(`That move costs ${res.cost} ft; you have ${b.movement} ft left.`);
      let prev = a.pos;
      for (const step of res.path.slice(1)) {
        opportunityAttacks(enc, rng, a, prev, step, log);
        if (isDown(a) || incapacitated(a) || a.conditions.includes("prone") && a.hp <= 0) { log.push(entry("combat", `${a.name}'s movement is stopped.`, a.id)); break; }
        a.pos = step;
        prev = step;
      }
      b.movement -= res.cost;
      a.effects = a.effects.filter((e) => e.kind !== "hidden" || true);
      log.push(entry("combat", `${a.name} moves to (${a.pos.x},${a.pos.y}).`, a.id, { path: res.path }));
      break;
    }
    case "dash": {
      const e = needAction(); if (e) return fail(e);
      b.action = false; b.movement += effectiveSpeed(a); b.dashed = true;
      log.push(entry("combat", `${a.name} Dashes.`, a.id));
      break;
    }
    case "disengage": {
      const e = needAction(); if (e) return fail(e);
      b.action = false; b.disengaged = true;
      log.push(entry("combat", `${a.name} Disengages.`, a.id));
      break;
    }
    case "dodge": {
      const e = needAction(); if (e) return fail(e);
      b.action = false;
      a.effects.push({ id: `dodge-${a.id}`, name: "Dodging", source: a.id, kind: "dodge", expires: "startOfOwnTurn" });
      log.push(entry("combat", `${a.name} takes the Dodge action.`, a.id));
      break;
    }
    case "help": {
      const e = needAction(); if (e) return fail(e);
      const t = target(cmd.targetId);
      if (!t || isDown(t)) return fail("Invalid target.");
      if (hostile(a, t)) {
        if (dist(a.pos, t.pos) > 5) return fail("You must be within 5 ft of the enemy to help attack it.");
        t.effects.push({ id: `help-${t.id}-${a.id}`, name: "Distracted", source: a.id, kind: "advantageNextAttackAgainst", expires: "startOfSourceTurn" });
        log.push(entry("combat", `${a.name} distracts ${t.name}; the next attack against it has advantage.`, a.id));
      } else {
        if (dist(a.pos, t.pos) > 5) return fail("Must be within 5 ft.");
        t.effects.push({ id: `helped-${t.id}`, name: "Helped", source: a.id, kind: "helped", expires: "startOfSourceTurn" });
        log.push(entry("combat", `${a.name} helps ${t.name}.`, a.id));
      }
      b.action = false;
      break;
    }
    case "hide":
    case "cunningAction": {
      const isCunning = cmd.type === "cunningAction";
      const mode = cmd.type === "hide" ? "hide" : cmd.mode;
      const nimble = a.features.includes("nimbleEscape");
      if (isCunning) {
        if (!a.features.includes("cunningAction") && !nimble) return fail("You don't have Cunning Action.");
        if (!b.bonusAction) return fail("No bonus action remaining.");
      } else { const e = needAction(); if (e) return fail(e); }
      if (mode === "dash") { b.movement += effectiveSpeed(a); log.push(entry("combat", `${a.name} dashes (bonus action).`, a.id)); }
      else if (mode === "disengage") { b.disengaged = true; log.push(entry("combat", `${a.name} disengages (bonus action).`, a.id)); }
      else {
        const seen = enc.combatants.some((o) => hostile(o, a) && !isDown(o) && !incapacitated(o) && dist(o.pos, a.pos) <= 5);
        const nearCover = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = enc.map.tiles[a.pos.y + dy]?.[a.pos.x + dx]; return t === "cover" || t === "wall"; });
        const r = rollD20(rng, a.skillBonuses.stealth ?? abilityMod(a, "dex"), 0, { halflingLuck: a.features.includes("luck") });
        log.push(entry("roll", `${a.name} Stealth: ${r.rolls.join("/")} ${fmtMod(a.skillBonuses.stealth ?? 0)} = ${r.total} vs DC 15`, a.id));
        if (seen) log.push(entry("combat", `${a.name} can't hide with an enemy right next to them.`, a.id));
        else if (!nearCover && a.monsterId !== "goblinWarrior" && a.monsterId !== "goblinBoss") log.push(entry("combat", `${a.name} has nothing to hide behind.`, a.id));
        else if (r.total >= 15) { a.effects.push({ id: `hidden-${a.id}`, name: "Hidden", source: a.id, kind: "hidden", expires: "never" }); log.push(entry("combat", `${a.name} is hidden!`, a.id)); }
        else log.push(entry("combat", `${a.name} fails to hide.`, a.id));
      }
      if (isCunning) b.bonusAction = false; else b.action = false;
      break;
    }
    case "secondWind": {
      if (!a.features.includes("secondWind")) return fail("You don't have Second Wind.");
      if (!b.bonusAction) return fail("No bonus action remaining.");
      if ((a.resources.secondWind ?? 0) <= 0) return fail("No uses of Second Wind left.");
      a.resources.secondWind--; b.bonusAction = false;
      const r = roll(rng, `1d10+${a.level}`);
      heal(a, r.total, log, "Second Wind");
      if (a.features.includes("tacticalShift")) { b.disengaged = true; b.movement += Math.floor(effectiveSpeed(a) / 2); }
      break;
    }
    case "actionSurge": {
      if (!a.features.includes("actionSurge")) return fail("You don't have Action Surge.");
      if ((a.resources.actionSurge ?? 0) <= 0) return fail("Action Surge is spent.");
      if (b.actionSurgeActive) return fail("Already surged this turn.");
      a.resources.actionSurge--; b.action = true; b.actionSurgeActive = true; b.attacksLeft = a.features.includes("extraAttack") ? 2 : 1;
      log.push(entry("combat", `🔥 ${a.name} uses Action Surge!`, a.id));
      break;
    }
    case "rage": {
      if (!a.features.includes("rage")) return fail("You can't rage.");
      if (!b.bonusAction) return fail("No bonus action remaining.");
      if (a.effects.some((e) => e.kind === "rage")) {
        // Reckless attack toggle is separate; re-raging is illegal
        return fail("Already raging.");
      }
      if ((a.resources.rage ?? 0) <= 0) return fail("No rages left.");
      a.resources.rage--; b.bonusAction = false;
      a.effects.push({ id: `rage-${a.id}`, name: "Rage", source: a.id, kind: "rage", expires: "never" });
      if (a.concentratingOn) endConcentration(enc, a, log);
      log.push(entry("combat", `😡 ${a.name} flies into a RAGE!`, a.id));
      break;
    }
    case "reckless": {
      if (!a.features.includes("recklessAttack")) return fail("You don't have Reckless Attack.");
      if (a.effects.some((e) => e.kind === "recklessAttack")) return fail("Already reckless this turn.");
      a.effects.push({ id: `reckless-${a.id}`, name: "Reckless", source: a.id, kind: "recklessAttack", expires: "startOfOwnTurn" });
      log.push(entry("combat", `${a.name} attacks recklessly! (advantage on Strength attacks; enemies have advantage against them)`, a.id));
      break;
    }
    case "breathWeapon": {
      if (!a.features.includes("breathWeapon")) return fail("You don't have a Breath Weapon.");
      if ((a.resources.breathWeapon ?? 0) <= 0) return fail("Breath Weapon is spent.");
      if (b.attacksLeft <= 0 || !b.action) return fail("Breath Weapon replaces one of your attacks; none remain.");
      b.attacksLeft--; if (b.attacksLeft <= 0) b.action = false;
      a.resources.breathWeapon--;
      const tiles = areaTiles(enc.map, "cone", 15, a.pos, cmd.point);
      const hit = enc.combatants.filter((c) => !c.dead && !c.fled && c.id !== a.id && tiles.some((p) => samePoint(p, c.pos)));
      const dc = 8 + abilityMod(a, "con") + a.profBonus;
      const r = roll(rng, a.level >= 5 ? "2d10" : "1d10");
      log.push(entry("combat", `🐉 ${a.name} exhales a cone of fire! (${hit.map((h) => h.name).join(", ") || "no one"})`, a.id, { tiles }));
      for (const t of hit) {
        const ok = makeSave(enc, rng, t, "dex", dc, log);
        const amt = ok ? Math.floor(r.total / 2) : r.total;
        log.push(entry("combat", `💥 ${t.name} takes ${amt} fire.`, a.id));
        applyDamage(enc, rng, t, amt, "fire", log, { sourceId: a.id });
      }
      break;
    }
    case "channelDivinity": {
      if (cmd.mode === "sacredWeapon") {
        if (!a.features.includes("sacredWeapon")) return fail("You don't have Sacred Weapon.");
        if ((a.resources.channelDivinity ?? 0) <= 0) return fail("No Channel Divinity uses left.");
        if (!b.action && !b.attackActionTaken) return fail("Sacred Weapon is used as part of the Attack action.");
        if (a.effects.some((e) => e.kind === "sacredWeapon")) return fail("Your weapon is already sacred.");
        a.resources.channelDivinity--;
        const amt = Math.max(1, abilityMod(a, "cha"));
        a.effects.push({ id: `sacred-${a.id}`, name: "Sacred Weapon", source: a.id, kind: "sacredWeapon", amount: amt, expires: "never" });
        log.push(entry("combat", `✨ ${a.name}'s weapon blazes with holy light! (+${amt} to melee weapon attack rolls)`, a.id));
        break;
      }
      if (!a.features.includes("channelDivinity")) return fail("You don't have Channel Divinity.");
      const e = needAction(); if (e) return fail(e);
      if ((a.resources.channelDivinity ?? 0) <= 0) return fail("No Channel Divinity uses left.");
      const dc = spellDc(a);
      if (cmd.mode === "turnUndead") {
        const undead = enc.combatants.filter((o) => hostile(a, o) && !isDown(o) && o.monsterId && MONSTERS[o.monsterId]?.type === "undead" && dist(a.pos, o.pos) <= 30);
        if (!undead.length) return fail("No undead within 30 ft.");
        log.push(entry("combat", `✨ ${a.name} presents their holy symbol: Turn Undead!`, a.id));
        for (const u of undead) {
          const ok = makeSave(enc, rng, u, "wis", dc, log);
          if (!ok) {
            if (a.features.includes("searUndead")) { const r = roll(rng, `${Math.max(1, abilityMod(a, "wis"))}d8`); applyDamage(enc, rng, u, r.total, "radiant", log, { sourceId: a.id }); }
            if (!u.dead) {
              addCondition(u, "frightened"); addCondition(u, "incapacitated");
              u.effects.push({ id: `turn-${u.id}`, name: "Turned", source: a.id, kind: "frightenedBy", expires: "never" });
              log.push(entry("combat", `${u.name} is Turned and flees in terror!`, u.id));
            }
          }
        }
      } else if (cmd.mode === "divineSpark") {
        const t = target(cmd.targetId);
        if (!t || t.dead) return fail("Choose a target within 30 ft.");
        if (dist(a.pos, t.pos) > 30 || !hasLineOfSight(enc.map, a.pos, t.pos)) return fail("Target must be within 30 ft and in sight.");
        const r = roll(rng, `1d8+${abilityMod(a, "wis")}`);
        if (hostile(a, t)) {
          const ok = makeSave(enc, rng, t, "con", dc, log);
          const amt = ok ? Math.floor(r.total / 2) : r.total;
          log.push(entry("combat", `✨ Divine Spark sears ${t.name} for ${amt} radiant.`, a.id));
          applyDamage(enc, rng, t, amt, "radiant", log, { sourceId: a.id });
        } else heal(t, r.total, log, "Divine Spark");
      } else {
        if (!a.features.includes("preserveLife")) return fail("You don't have Preserve Life.");
        let pool = 5 * a.level;
        const allies = enc.combatants.filter((o) => !hostile(a, o) && !o.dead && dist(a.pos, o.pos) <= 30 && o.hp < Math.floor(o.maxHp / 2)).sort((x, y) => x.hp - y.hp);
        if (!allies.length) return fail("No ally within 30 ft is below half HP.");
        for (const o of allies) {
          if (pool <= 0) break;
          const amt = Math.min(pool, Math.floor(o.maxHp / 2) - o.hp);
          if (amt > 0) { heal(o, amt, log, "Preserve Life"); pool -= amt; }
        }
      }
      a.resources.channelDivinity--; b.action = false;
      break;
    }
    case "useItem": {
      const item = GEAR[cmd.itemId];
      if (!item?.use) return fail("That item can't be used in combat.");
      const have = a.resources[`item:${cmd.itemId}`] ?? 0;
      if (have <= 0) return fail(`No ${item.name} left.`);
      if (item.use.heal) {
        if (!b.bonusAction) return fail("Drinking or administering a potion takes a bonus action.");
        const t = target(cmd.targetId) ?? a;
        if (dist(a.pos, t.pos) > 5) return fail("Target must be within 5 ft.");
        const r = roll(rng, item.use.heal);
        heal(t, r.total, log, item.name);
        b.bonusAction = false;
      } else if (item.use.effect === "holyWater" || item.use.effect === "alchemistsFire") {
        const e = needAction(); if (e) return fail(e);
        const t = target(cmd.targetId);
        if (!t || dist(a.pos, t.pos) > 20) return fail("Throw at a target within 20 ft.");
        const ok = makeSave(enc, rng, t, "dex", 8 + abilityMod(a, "dex") + a.profBonus, log);
        if (!ok) {
          if (item.use.effect === "holyWater") {
            const isFiendish = t.monsterId && ["undead", "fiend"].includes(MONSTERS[t.monsterId]?.type ?? "");
            if (isFiendish) { const r = roll(rng, "2d8"); applyDamage(enc, rng, t, r.total, "radiant", log, { sourceId: a.id }); log.push(entry("combat", `Holy water burns ${t.name} for ${r.total}!`, a.id)); }
            else log.push(entry("combat", `The holy water splashes harmlessly on ${t.name}.`, a.id));
          } else { const r = roll(rng, "1d4"); applyDamage(enc, rng, t, r.total, "fire", log, { sourceId: a.id }); log.push(entry("combat", `${t.name} catches fire! (${r.total} fire)`, a.id)); }
        }
        b.action = false;
      } else return fail("Not usable here.");
      a.resources[`item:${cmd.itemId}`] = have - 1;
      break;
    }
    case "stabilize": {
      const e = needAction(); if (e) return fail(e);
      const t = target(cmd.targetId);
      if (!t || t.hp > 0 || t.dead) return fail("Target must be dying.");
      if (dist(a.pos, t.pos) > 5) return fail("Must be within 5 ft.");
      const kit = (a.resources["item:healersKit"] ?? 0) > 0;
      let ok = kit;
      if (!kit) {
        const r = rollD20(rng, a.skillBonuses.medicine ?? abilityMod(a, "wis"), 0);
        ok = r.total >= 10;
        log.push(entry("roll", `${a.name} Medicine: ${r.total} vs DC 10`, a.id));
      } else a.resources["item:healersKit"]--;
      if (ok) { t.stable = true; log.push(entry("combat", `${a.name} stabilizes ${t.name}.`, a.id)); }
      else log.push(entry("combat", `${a.name} fails to stabilize ${t.name}.`, a.id));
      b.action = false;
      break;
    }
    case "attack": {
      const baseAtk = a.attacks.find((x) => x.id === cmd.attackId);
      if (!baseAtk) return fail("Unknown attack.");
      const atk = effectiveAttack(a, baseAtk);
      const t = target(cmd.targetId);
      if (!t || isDown(t) && t.side !== "party") return fail("Invalid target.");
      if (t.id === a.id) return fail("You can't attack yourself.");
      // Light-weapon extra attack (2024): after attacking with a Light weapon, a bonus-action attack with a different Light weapon (Nick: no bonus action needed)
      let offhand = false;
      if (b.attacksLeft <= 0 || !b.action) {
        const canLight = b.lightAttackMade && atk.light;
        const nick = canLight && a.attacks.some((x) => x.mastery === "nick" && x.light) && !b.nickUsed;
        if (canLight && (nick || b.bonusAction)) {
          offhand = true;
          if (nick) b.nickUsed = true; else b.bonusAction = false;
        } else return fail("No attacks remaining this turn.");
      }
      const d = dist(a.pos, t.pos);
      let kind: "melee" | "ranged" = atk.kind;
      if (atk.kind === "melee" && d > atk.reach) {
        if (atk.thrown && atk.range && d <= atk.range[1]) kind = "ranged";
        else return fail(`${t.name} is out of reach (${d} ft, reach ${atk.reach} ft).`);
      }
      if (kind === "ranged" && atk.range && d > atk.range[1]) return fail(`${t.name} is beyond maximum range (${atk.range[1]} ft).`);
      if (!hasLineOfSight(enc.map, a.pos, t.pos)) return fail("No line of sight.");
      if (!offhand) {
        if (b.attacksLeft === (a.features.includes("extraAttack") ? 2 : 1) || b.attacksLeft === 0) { /* first attack of the Attack action */ }
        b.attacksLeft--;
        if (b.attacksLeft <= 0) b.action = false;
      }
      if (atk.light) b.lightAttackMade = true;
      if (!offhand) b.attackActionTaken = true;
      weaponStrike(enc, rng, a, t, atk, kind, log, { offhand });
      if (atk.thrown && kind === "ranged" && atk.weaponId) {
        const left = a.resources[`item:${atk.weaponId}`];
        if (left !== undefined) { a.resources[`item:${atk.weaponId}`] = left - 1; if (left - 1 <= 0) a.attacks = a.attacks.filter((x) => x.id !== atk.id); }
      }
      break;
    }
    case "smite": {
      const sp = SPELLS[cmd.spellId];
      if (!sp || sp.effect?.kind !== "smite") return fail("That isn't a smite spell.");
      const eff = sp.effect;
      if (!a.spells.includes(sp.id)) return fail(`${a.name} hasn't prepared ${sp.name}.`);
      if (!b.bonusAction) return fail("Smiting takes your bonus action.");
      if (a.wildShape) return fail("You can't cast spells in Wild Shape.");
      if (b.leveledSpellCast) return fail("You've already cast a spell with a spell slot this turn.");
      const hitRec = (b.meleeHits ?? []).find((h) => h.targetId === cmd.targetId && !h.smitten);
      if (!hitRec) return fail("Smite right after you hit that creature with a melee weapon or unarmed strike this turn.");
      const t = target(cmd.targetId);
      if (!t || t.dead) return fail("The target is already down.");
      const free = sp.id === "divineSmite" && (a.resources.paladinsSmite ?? 0) > 0 && cmd.slotLevel === undefined;
      let slot = 1;
      if (free) a.resources.paladinsSmite--;
      else {
        const want = Math.max(1, sp.level, cmd.slotLevel ?? 1);
        if (!hasSlot(a, want)) return fail(`No spell slots of level ${want}+ remaining.`);
        slot = spendSlot(a, want);
        b.leveledSpellCast = true;
      }
      b.bonusAction = false;
      b.bonusSpellCast = true;
      hitRec.smitten = true;
      const upcast = Math.max(0, slot - Math.max(1, sp.level));
      let dice = eff.dice;
      const pm = eff.perSlot.match(/^(\d+)d(\d+)$/);
      if (pm && upcast) dice += `+${parseInt(pm[1]) * upcast}d${pm[2]}`;
      const fiendish = t.monsterId && ["undead", "fiend"].some((k) => MONSTERS[t.monsterId!]?.type.includes(k));
      if (sp.id === "divineSmite" && fiendish) dice += "+1d8";
      const r = roll(rng, dice, { crit: hitRec.crit });
      log.push(entry("combat", `⚡ ${a.name} smites ${t.name} with ${sp.name}${free ? " (Paladin's Smite)" : slot > 1 ? ` (level ${slot})` : ""}: ${r.total} ${eff.type}${hitRec.crit ? " (critical!)" : ""}.`, a.id));
      applyDamage(enc, rng, t, r.total, eff.type, log, { crit: hitRec.crit, sourceId: a.id });
      if (!t.dead && eff.condition && !makeSave(enc, rng, t, eff.condition.ability, spellDc(a), log, { vsCondition: eff.condition.condition }) && addCondition(t, eff.condition.condition)) {
        t.effects.push({ id: `smite-${t.id}`, name: sp.name, source: a.id, kind: "heldBySpell", condition: eff.condition.condition, saveAbility: eff.condition.ability, saveDc: spellDc(a), expires: "never" });
        log.push(entry("combat", `${t.name} is ${eff.condition.condition}!`, a.id));
      }
      if (!t.dead && eff.rider === "burning") {
        t.effects = t.effects.filter((e) => e.kind !== "burning");
        t.effects.push({ id: `burn-${t.id}`, name: "Burning", source: a.id, kind: "burning", dice: `${1 + upcast}d6`, saveDc: spellDc(a), saveAbility: "con", expires: "never" });
        log.push(entry("combat", `🔥 ${t.name} bursts into searing flame!`, a.id));
      }
      if (!t.dead && eff.rider === "thunderous") {
        if (!makeSave(enc, rng, t, "str", spellDc(a), log)) {
          pushAway(enc, a.pos, t, 10, log);
          if (addCondition(t, "prone")) log.push(entry("combat", `${t.name} is knocked Prone!`, a.id));
        }
      }
      break;
    }
    case "layOnHands": {
      if (!a.features.includes("layOnHands")) return fail("You don't have Lay On Hands.");
      if (!b.bonusAction) return fail("Lay On Hands takes a bonus action.");
      const t = target(cmd.targetId) ?? a;
      if (t.dead) return fail(`${t.name} is beyond Lay On Hands.`);
      if (dist(a.pos, t.pos) > 5) return fail("Touch range: the target must be within 5 ft.");
      const pool = a.resources.layOnHands ?? 0;
      if (cmd.curePoison) {
        if (pool < 5) return fail("Curing poison costs 5 points from the pool.");
        if (!t.conditions.includes("poisoned")) return fail(`${t.name} isn't poisoned.`);
        a.resources.layOnHands = pool - 5;
        removeCondition(t, "poisoned");
        log.push(entry("combat", `🤲 ${a.name} purges the poison from ${t.name}.`, a.id));
      } else {
        const amt = Math.max(0, Math.min(pool, Math.floor(cmd.amount || 0), t.maxHp - Math.max(0, t.hp)));
        if (amt <= 0) return fail(pool <= 0 ? "Your Lay On Hands pool is empty." : `${t.name} doesn't need healing.`);
        a.resources.layOnHands = pool - amt;
        heal(t, amt, log, "Lay On Hands");
      }
      b.bonusAction = false;
      break;
    }
    case "martialArts": {
      if (!a.features.includes("martialArts")) return fail("You don't know Martial Arts.");
      if (!b.bonusAction) return fail("No bonus action remaining.");
      const unarmed = a.attacks.find((x) => x.id === "unarmed");
      const t = target(cmd.targetId);
      if (!unarmed || !t || isDown(t) || !hostile(a, t)) return fail("Choose an enemy to strike.");
      if (dist(a.pos, t.pos) > unarmed.reach) return fail(`${t.name} is out of reach.`);
      b.bonusAction = false;
      weaponStrike(enc, rng, a, t, unarmed, "melee", log, { label: "Martial Arts (bonus strike)" });
      break;
    }
    case "flurryOfBlows": {
      if (!a.features.includes("monksFocus")) return fail("Flurry of Blows needs Monk's Focus (level 2).");
      if (!b.bonusAction) return fail("No bonus action remaining.");
      if ((a.resources.focus ?? 0) < 1) return fail("No Focus Points left.");
      const unarmed = a.attacks.find((x) => x.id === "unarmed");
      const ids = cmd.targetIds.length ? cmd.targetIds : [];
      const first = ids.map((id) => target(id)).find((x) => x && !isDown(x) && hostile(a, x) && dist(a.pos, x.pos) <= 5);
      if (!unarmed || !first) return fail("Choose an enemy within reach.");
      a.resources.focus--;
      b.bonusAction = false;
      log.push(entry("combat", `🥋 ${a.name} unleashes a Flurry of Blows!`, a.id));
      for (let i = 0; i < 2; i++) {
        let t = target(ids[i] ?? ids[0]);
        if (!t || isDown(t) || dist(a.pos, t.pos) > 5) t = enc.combatants.find((x) => hostile(a, x) && !isDown(x) && dist(a.pos, x.pos) <= 5);
        if (!t) break;
        const res = weaponStrike(enc, rng, a, t, unarmed, "melee", log, { label: `Flurry strike ${i + 1}` });
        if (res.hit && !t.dead && a.features.includes("openHandTechnique") && cmd.technique) {
          const dc = featureDc(a, "wis");
          if (cmd.technique === "addle") { t.effects.push({ id: `addle-${t.id}`, name: "Addled", source: a.id, kind: "noReactions", expires: "startOfOwnTurn" }); log.push(entry("combat", `${t.name} is addled and can't make Opportunity Attacks.`, a.id)); }
          if (cmd.technique === "push" && !makeSave(enc, rng, t, "str", dc, log) && t.size !== "huge" && t.size !== "gargantuan") pushAway(enc, a.pos, t, 15, log);
          if (cmd.technique === "topple" && !makeSave(enc, rng, t, "dex", dc, log) && addCondition(t, "prone")) log.push(entry("combat", `${t.name} is knocked Prone!`, a.id));
        }
      }
      break;
    }
    case "patientDefense":
    case "stepOfTheWind": {
      if (!a.features.includes("monksFocus")) return fail("This needs Monk's Focus (level 2).");
      if (!b.bonusAction) return fail("No bonus action remaining.");
      if (cmd.focus) {
        if ((a.resources.focus ?? 0) < 1) return fail("No Focus Points left.");
        a.resources.focus--;
      }
      b.bonusAction = false;
      if (cmd.type === "patientDefense") {
        b.disengaged = true;
        if (cmd.focus) a.effects.push({ id: `dodge-${a.id}`, name: "Dodging", source: a.id, kind: "dodge", expires: "startOfOwnTurn" });
        log.push(entry("combat", `${a.name} uses Patient Defense (${cmd.focus ? "Disengage + Dodge" : "Disengage"}).`, a.id));
      } else {
        b.movement += effectiveSpeed(a);
        if (cmd.focus) b.disengaged = true;
        log.push(entry("combat", `${a.name} uses Step of the Wind (${cmd.focus ? "Dash + Disengage" : "Dash"}).`, a.id));
      }
      break;
    }
    case "stunningStrike": {
      if (!a.features.includes("stunningStrike")) return fail("You don't know Stunning Strike.");
      if (b.stunningUsed) return fail("Stunning Strike can be used once per turn.");
      if ((a.resources.focus ?? 0) < 1) return fail("No Focus Points left.");
      const hitRec = (b.meleeHits ?? []).find((h) => h.targetId === cmd.targetId);
      const t = target(cmd.targetId);
      if (!hitRec || !t || t.dead) return fail("Use Stunning Strike right after hitting that creature with a monk weapon or unarmed strike.");
      a.resources.focus--;
      b.stunningUsed = true;
      log.push(entry("combat", `🥋 ${a.name} strikes a pressure point: Stunning Strike!`, a.id));
      if (!makeSave(enc, rng, t, "con", featureDc(a, "wis"), log)) {
        if (addCondition(t, "stunned")) {
          t.effects.push({ id: `stun-${t.id}`, name: "Stunned", source: a.id, kind: "stunnedBy", condition: "stunned", expires: "startOfSourceTurn" });
          log.push(entry("combat", `💫 ${t.name} is Stunned!`, a.id));
        }
      } else {
        t.effects.push({ id: `stunslow-${t.id}`, name: "Reeling", source: a.id, kind: "slowed", amount: Math.floor(t.speed / 2), expires: "startOfSourceTurn" });
        t.effects.push({ id: `stunadv-${t.id}`, name: "Reeling", source: a.id, kind: "advantageNextAttackAgainst", expires: "startOfSourceTurn" });
        log.push(entry("combat", `${t.name} reels: its speed is halved and the next attack against it has advantage.`, a.id));
      }
      break;
    }
    case "bardicInspiration": {
      if (!a.features.includes("bardicInspiration")) return fail("You can't give Bardic Inspiration.");
      if (!b.bonusAction) return fail("No bonus action remaining.");
      if ((a.resources.bardicInspiration ?? 0) <= 0) return fail("No Bardic Inspiration left.");
      const t = target(cmd.targetId);
      if (!t || t.id === a.id || t.dead || hostile(a, t)) return fail("Inspire another ally.");
      if (dist(a.pos, t.pos) > 60) return fail("The ally must be within 60 ft.");
      if (t.effects.some((e) => e.kind === "inspired")) return fail(`${t.name} is already inspired.`);
      a.resources.bardicInspiration--;
      b.bonusAction = false;
      t.effects.push({ id: `insp-${t.id}`, name: `Bardic Inspiration (d${bardicDie(a.level)})`, source: a.id, kind: "inspired", amount: bardicDie(a.level), expires: "never" });
      log.push(entry("combat", `🎵 ${a.name} inspires ${t.name} (d${bardicDie(a.level)}).`, a.id));
      break;
    }
    case "innateSorcery": {
      if (!a.features.includes("innateSorcery")) return fail("You don't have Innate Sorcery.");
      if (!b.bonusAction) return fail("No bonus action remaining.");
      if ((a.resources.innateSorcery ?? 0) <= 0) return fail("Innate Sorcery is spent.");
      if (a.effects.some((e) => e.kind === "innateSorcery")) return fail("Innate Sorcery is already active.");
      a.resources.innateSorcery--;
      b.bonusAction = false;
      a.effects.push({ id: `innate-${a.id}`, name: "Innate Sorcery", source: a.id, kind: "innateSorcery", expires: "never" });
      log.push(entry("combat", `🐉 ${a.name}'s draconic blood surges: Innate Sorcery! (+1 spell DC, advantage on spell attacks)`, a.id));
      break;
    }
    case "fontOfMagic": {
      if (!a.features.includes("fontOfMagic")) return fail("You don't have Font of Magic.");
      const lvl = Math.floor(cmd.slotLevel);
      if (cmd.mode === "createSlot") {
        if (!b.bonusAction) return fail("Creating a spell slot takes a bonus action.");
        const cost = SORCERY_SLOT_COST[lvl];
        if (!cost || lvl > 5) return fail("You can create slots of level 1-5.");
        if ((a.resources.sorceryPoints ?? 0) < cost) return fail(`A level ${lvl} slot costs ${cost} Sorcery Points.`);
        while (a.spellSlots.length <= lvl) a.spellSlots.push(0);
        while (a.spellSlotsUsed.length <= lvl) a.spellSlotsUsed.push(0);
        a.resources.sorceryPoints -= cost;
        a.spellSlotsUsed[lvl] = (a.spellSlotsUsed[lvl] ?? 0) - 1;
        b.bonusAction = false;
        log.push(entry("combat", `🐉 ${a.name} shapes ${cost} Sorcery Points into a level ${lvl} spell slot.`, a.id));
      } else {
        if ((a.spellSlots[lvl] ?? 0) - (a.spellSlotsUsed[lvl] ?? 0) <= 0) return fail(`No level ${lvl} slot to convert.`);
        a.spellSlotsUsed[lvl] = (a.spellSlotsUsed[lvl] ?? 0) + 1;
        a.resources.sorceryPoints = (a.resources.sorceryPoints ?? 0) + lvl;
        log.push(entry("combat", `🐉 ${a.name} unravels a level ${lvl} slot into ${lvl} Sorcery Points.`, a.id));
      }
      break;
    }
    case "wildShape": {
      if (!a.features.includes("wildShape")) return fail("You can't Wild Shape yet.");
      if (!b.bonusAction) return fail("No bonus action remaining.");
      if (a.wildShape) return fail("Already in beast form.");
      if ((a.resources.wildShape ?? 0) <= 0) return fail("No Wild Shape uses left.");
      a.resources.wildShape--;
      b.bonusAction = false;
      const f = WILD_SHAPE_FORM;
      a.wildShape = { ac: a.ac, abilities: { ...a.abilities }, speed: a.speed, attacks: a.attacks, size: a.size };
      a.ac = f.ac; a.speed = f.speed; a.size = "medium";
      a.abilities = { ...a.abilities, str: f.str, dex: f.dex, con: f.con };
      a.attacks = [{ ...f.attack }];
      a.tempHp = Math.max(a.tempHp, a.level);
      a.effects.push({ id: `ws-${a.id}`, name: `Wild Shape (${f.name})`, source: a.id, kind: "wildShape", expires: "never" });
      log.push(entry("combat", `🐺 ${a.name} shifts into a ${f.name}! (+${a.level} temp HP)`, a.id));
      break;
    }
    case "revertShape": {
      if (!a.wildShape) return fail("You're in your true form.");
      if (!b.bonusAction) return fail("Reverting takes a bonus action.");
      b.bonusAction = false;
      revertWildShape(a, log);
      break;
    }
    case "landsAid": {
      if (!a.features.includes("landsAid")) return fail("You don't have Land's Aid.");
      const e = needAction(); if (e) return fail(e);
      if ((a.resources.wildShape ?? 0) <= 0) return fail("Land's Aid expends a Wild Shape use; none left.");
      if (dist(a.pos, cmd.point) > 60 || !inBounds(enc.map, cmd.point)) return fail("Choose a point within 60 ft.");
      a.resources.wildShape--;
      b.action = false;
      const tiles = areaTiles(enc.map, "sphere", 10, a.pos, cmd.point);
      const inArea = enc.combatants.filter((c) => !c.dead && !c.fled && tiles.some((p) => samePoint(p, c.pos)));
      log.push(entry("combat", `🌱 ${a.name} calls on the land: thorny growth erupts!`, a.id, { tiles }));
      const r = roll(rng, "2d6").total;
      for (const t of inArea.filter((c) => hostile(a, c))) {
        const ok = makeSave(enc, rng, t, "con", spellDc(a), log);
        const amt = ok ? Math.floor(r / 2) : r;
        log.push(entry("combat", `💥 ${t.name} takes ${amt} necrotic.`, a.id));
        applyDamage(enc, rng, t, amt, "necrotic", log, { sourceId: a.id });
      }
      const ht = cmd.healTargetId ? target(cmd.healTargetId) : inArea.filter((c) => !hostile(a, c)).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
      if (ht && !ht.dead && !hostile(a, ht) && inArea.includes(ht)) heal(ht, roll(rng, "2d6").total, log, "Land's Aid");
      break;
    }
    case "moveMoonbeam": {
      const mb = a.effects.find((e) => e.kind === "moonbeam" && e.source === a.id);
      if (!mb?.point) return fail("You have no Moonbeam to move.");
      if (!b.bonusAction) return fail("Moving the beam takes a bonus action.");
      if (dist(mb.point, cmd.point) > 60 || !inBounds(enc.map, cmd.point)) return fail("The beam moves up to 60 ft.");
      mb.point = cmd.point;
      b.bonusAction = false;
      log.push(entry("combat", `🌕 ${a.name} moves the moonbeam to (${cmd.point.x},${cmd.point.y}).`, a.id));
      break;
    }
    case "cast": {
      const r = castSpell(enc, rng, a, cmd, log);
      if (r) return fail(r);
      break;
    }
    case "monsterAction": {
      if (!a.monsterActions) return fail("Not a monster.");
      const act = a.monsterActions.find((x) => x.id === cmd.actionId);
      if (!act) return fail("Unknown action.");
      if (act.bonusAction ? !b.bonusAction : !b.action) return fail("No action remaining.");
      if (act.recharge && (a.resources[`spent:${act.id}`] ?? 0) > 0) return fail(`${act.name} hasn't recharged.`);
      if (act.usesPerDay && (a.resources[`used:${act.id}`] ?? 0) >= act.usesPerDay) return fail(`${act.name} is spent.`);
      const targets = (cmd.targetIds ?? []).map((id) => byId(enc, id)).filter((x): x is Combatant => !!x && !isDown(x));
      const inReach = (x: Combatant, ac: MonsterAction) => {
        const d = dist(a.pos, x.pos);
        return (ac.reach && d <= ac.reach) || (ac.range && d <= ac.range[1]);
      };
      if (act.kind === "multiattack") {
        const seq = act.multiattack ?? [];
        if (!targets.length) return fail("Choose targets.");
        log.push(entry("combat", `${a.name} attacks!`, a.id));
        seq.forEach((sid, i) => {
          const sub = a.monsterActions!.find((x) => x.id === sid);
          let t = targets[i % targets.length];
          if (!sub) return;
          if (isDown(t)) t = targets.find((x) => !isDown(x)) ?? t;
          if (isDown(t) || !inReach(t, sub)) {
            const alt = enc.combatants.find((x) => hostile(a, x) && !isDown(x) && inReach(x, sub));
            if (!alt) return;
            t = alt;
          }
          resolveMonsterAttack(enc, rng, a, t, sub, log);
        });
      } else if (act.kind === "melee" || act.kind === "ranged") {
        const t = targets[0];
        if (!t) return fail("Choose a target.");
        if (!inReach(t, act)) return fail("Target out of range.");
        if (!hasLineOfSight(enc.map, a.pos, t.pos)) return fail("No line of sight.");
        resolveMonsterAttack(enc, rng, a, t, act, log);
      } else if (act.kind === "save") {
        if (!targets.length) return fail("Choose a target.");
        const t = targets.filter((x) => inReach(x, act));
        if (!t.length) return fail("Target out of range.");
        log.push(entry("combat", `${a.name} uses ${act.name}!`, a.id));
        resolveMonsterSave(enc, rng, a, act.area ? t : [t[0]], act, log);
      } else return fail("Unsupported action.");
      if (act.recharge) a.resources[`spent:${act.id}`] = 1;
      if (act.usesPerDay) a.resources[`used:${act.id}`] = (a.resources[`used:${act.id}`] ?? 0) + 1;
      a.effects = a.effects.filter((e) => e.kind !== "hidden");
      if (act.bonusAction) b.bonusAction = false; else b.action = false;
      break;
    }
    default:
      return fail("Unknown command.");
  }
  enc.log.push(...log);
  checkEnd(enc);
  enc.rngState = rng.state;
  return { ok: true, log };
}

// ---------------------------------------------------------------------------------------------
// Spellcasting

function castSpell(enc: EncounterState, rng: Rng, a: Combatant, cmd: Extract<CombatCommand, { type: "cast" }>, log: LogEntry[]): string | null {
  const sp = SPELLS[cmd.spellId];
  if (!sp) return "Unknown spell.";
  const b = enc.budget;
  const freeMark = sp.id === "huntersMark" && (a.resources.favoredEnemy ?? 0) > 0;
  const freeInitiate = sp.level === 1 && (a.resources.magicInitiate ?? 0) > 0 && !hasSlot(a, 1);
  const spiritualRepeat = sp.id === "spiritualWeapon" && a.effects.some((e) => e.kind === "spiritualWeapon" && e.source === a.id);
  if (!a.spells.includes(sp.id)) return `${a.name} doesn't know ${sp.name}.`;
  if (sp.castingTime === "reaction") return `${sp.name} is cast automatically as a reaction.`;
  if (sp.effect?.kind === "smite") return `${sp.name} is cast right after you hit with a melee attack — use Smite.`;
  if (a.effects.some((e) => e.kind === "rage")) return "You can't cast spells while raging.";
  if (a.wildShape) return "You can't cast spells in Wild Shape.";
  // Sorcerer Metamagic
  const meta = cmd.metamagic;
  let castTime = sp.castingTime;
  let metaCost = 0;
  if (meta) {
    if (!a.features.includes("metamagic")) return "You don't know Metamagic.";
    if (meta === "quickened") {
      if (sp.castingTime !== "action") return "Quickened Spell changes an action casting time to a bonus action.";
      metaCost = 2; castTime = "bonus";
    } else {
      const single = sp.targeting.kind === "creature" && (sp.targeting.count ?? 1) === 1 && sp.level >= 1 && sp.effect?.kind !== "eldritchBlast";
      if (!single) return "Twinned Spell works on leveled spells that target a single creature.";
      metaCost = 1;
    }
    if ((a.resources.sorceryPoints ?? 0) < metaCost) return `Not enough Sorcery Points (${metaCost} needed).`;
  }
  if (castTime === "action" && !b.action) return "No action remaining.";
  if (castTime === "bonus" && !b.bonusAction) return "No bonus action remaining.";
  // 2024: one spell with a spell slot per turn
  if (sp.level > 0 && b.leveledSpellCast && !spiritualRepeat) return "You've already cast a spell with a spell slot this turn; only cantrips remain.";
  let slot = 0;
  if (sp.level > 0 && !spiritualRepeat && !freeMark && !freeInitiate) {
    const want = Math.max(sp.level, cmd.slotLevel ?? sp.level);
    if (!hasSlot(a, want)) return `No spell slots of level ${want}+ remaining.`;
  }
  // targets
  const targets = (cmd.targetIds ?? []).map((id) => byId(enc, id)).filter((x): x is Combatant => !!x);
  const tg = sp.targeting;
  if (tg.kind === "creature") {
    if (!targets.length && !spiritualRepeat) return "Choose a target.";
    const beams = sp.effect?.kind === "eldritchBlast" ? eldritchBeams(a.level) : 0;
    const max = (tg.count ?? 1) + (sp.effect?.kind === "magicMissile" || sp.effect?.kind === "scorchingRay" ? 10 : 0) + (meta === "twinned" ? 1 : 0) + Math.max(0, beams - 1);
    if (targets.length > max) return `Too many targets (max ${tg.count ?? 1}).`;
    if (meta === "twinned" && (targets.length !== 2 || targets[0].id === targets[1].id)) return "Twinned Spell needs two different targets.";
    if (sp.id === "hex" && targets.some((t) => !hostile(a, t))) return "Hex a foe.";
    for (const t of targets) {
      if (dist(a.pos, t.pos) > tg.range) return `${t.name} is out of range (${tg.range} ft).`;
      if (!hasLineOfSight(enc.map, a.pos, t.pos)) return `No line of sight to ${t.name}.`;
      if (t.dead && sp.id !== "revivify") return `${t.name} is dead.`;
    }
  }
  if (tg.kind === "area" && !cmd.point) return "Choose a point to aim the spell.";
  if (tg.kind === "area" && cmd.point) {
    if (dist(a.pos, cmd.point) > Math.max(tg.range, 5) && tg.range > 0) return "Point out of range.";
    if (!inBounds(enc.map, cmd.point)) return "Point out of bounds.";
  }
  if (sp.id === "mistyStep") {
    if (!cmd.point || dist(a.pos, cmd.point) > 30 || occupant(enc, cmd.point) || !passable(enc.map, cmd.point)) return "Choose an empty square within 30 ft.";
  }
  if (sp.id === "revivify") {
    const t = targets[0];
    if (!t?.dead) return "Revivify needs a creature that died within the last minute.";
    if ((a.resources["item:diamond300"] ?? 0) <= 0) return "Revivify consumes a diamond worth 300 gp, which you don't have.";
  }

  // pay costs
  if (sp.level > 0 && !spiritualRepeat) {
    if (freeMark) a.resources.favoredEnemy--;
    else if (freeInitiate && !hasSlot(a, 1)) a.resources.magicInitiate--;
    else slot = spendSlot(a, Math.max(sp.level, cmd.slotLevel ?? sp.level));
  }
  if (castTime === "action") b.action = false;
  else { b.bonusAction = false; if (sp.level > 0) b.bonusSpellCast = true; }
  if (slot > 0) b.leveledSpellCast = true;
  if (metaCost) { a.resources.sorceryPoints -= metaCost; log.push(entry("combat", `🐉 ${a.name} uses ${meta === "quickened" ? "Quickened" : "Twinned"} Spell (${metaCost} SP).`, a.id)); }
  const upcast = Math.max(0, slot - sp.level);
  a.effects = a.effects.filter((e) => e.kind !== "hidden");
  if (sp.concentration && !spiritualRepeat) startConcentration(enc, a, sp.id, log);
  log.push(entry("combat", `✨ ${a.name} casts ${sp.name}${slot > sp.level ? ` at level ${slot}` : ""}${spiritualRepeat ? " (repeat attack)" : ""}.`, a.id));

  const sMod = a.spellAbility ? abilityMod(a, a.spellAbility) : 0;
  const cantripDice = (dice: string) => {
    if (!sp.damage?.cantripScale) return dice;
    const n = a.level >= 17 ? 4 : a.level >= 11 ? 3 : a.level >= 5 ? 2 : 1;
    return dice.replace(/^1d/, `${n}d`);
  };
  const dmgDice = (base: string) => {
    let d = cantripDice(base);
    if (sp.damage?.perSlot && upcast > 0) {
      const m = sp.damage.perSlot.match(/^(\d+)d(\d+)$/);
      if (m) d += `+${parseInt(m[1]) * upcast}d${m[2]}`;
    }
    return d;
  };
  const potent = a.features.includes("potentCantrip") && sp.level === 0;

  // Effects that don't follow the attack/save template
  const eff = sp.effect;
  if (eff?.kind === "magicMissile") {
    const darts = eff.darts + upcast;
    const list = targets.length ? targets : [];
    for (let i = 0; i < darts; i++) {
      const t = list[i % list.length];
      if (!t || t.dead) continue;
      const r = roll(rng, "1d4+1");
      log.push(entry("combat", `Magic Missile dart strikes ${t.name} for ${r.total} force.`, a.id));
      applyDamage(enc, rng, t, r.total, "force", log, { sourceId: a.id });
    }
    return null;
  }
  if (eff?.kind === "scorchingRay") {
    const rays = eff.rays + upcast;
    for (let i = 0; i < rays; i++) {
      const t = targets[i % targets.length];
      if (!t || t.dead) continue;
      const res = rollAttack(enc, rng, { attacker: a, target: t, toHit: spellAttackBonus(a), kind: "ranged", reach: 0, isSpell: true }, log, "Scorching Ray");
      if (res.hit) { const r = roll(rng, "2d6", { crit: res.crit }); applyDamage(enc, rng, t, r.total, "fire", log, { crit: res.crit, sourceId: a.id }); log.push(entry("combat", `🔥 ${t.name} takes ${r.total} fire.`, a.id)); }
    }
    return null;
  }
  if (eff?.kind === "mistyStep") { a.pos = cmd.point!; log.push(entry("combat", `${a.name} vanishes in silvery mist and reappears at (${a.pos.x},${a.pos.y}).`, a.id)); return null; }
  if (sp.id === "spiritGuardians") {
    a.effects.push({ id: `sg-${a.id}`, name: "Spirit Guardians", source: a.id, kind: "spiritGuardians", amount: 3 + upcast, saveDc: spellDc(a), expires: "concentration", concentration: true });
    return null;
  }
  if (sp.id === "spareTheDying") { const t = targets[0]; if (t && t.hp <= 0 && !t.dead) { t.stable = true; log.push(entry("combat", `${t.name} is stabilized.`, a.id)); } return null; }
  if (sp.id === "revivify") {
    const t = targets[0];
    a.resources["item:diamond300"]--;
    t.dead = false; t.hp = 1; t.deathSaves = { successes: 0, failures: 0 }; removeCondition(t, "unconscious");
    t.resources._deaths = (t.resources._deaths ?? 0) + 1; // the return leaves a mark
    t.deathSaveMod = Math.max(-3, (t.deathSaveMod ?? 0) - 1);
    log.push(entry("combat", `🌟 ${t.name} gasps back to life! (Revivify — the diamond crumbles to dust)`, a.id));
    return null;
  }
  if (sp.id === "lesserRestoration") {
    const t = targets[0];
    const cond = t.conditions.find((c) => ["blinded", "deafened", "paralyzed", "poisoned"].includes(c));
    if (cond) { removeCondition(t, cond); t.effects = t.effects.filter((e) => e.condition !== cond && e.name !== "Ghoul Paralysis"); log.push(entry("combat", `${t.name} is no longer ${cond}.`, a.id)); }
    else log.push(entry("combat", `${t.name} has no condition to cure.`, a.id));
    return null;
  }

  if (eff?.kind === "eldritchBlast") {
    const beams = eldritchBeams(a.level);
    const cha = abilityMod(a, "cha");
    for (let i = 0; i < beams; i++) {
      const t = targets[i % targets.length];
      if (!t || t.dead) continue;
      const res = rollAttack(enc, rng, { attacker: a, target: t, toHit: spellAttackBonus(a), kind: "ranged", reach: 0, range: [120, 120], isSpell: true }, log, beams > 1 ? `Eldritch Blast (beam ${i + 1})` : "Eldritch Blast");
      if (!res.hit) continue;
      const r = roll(rng, "1d10", { crit: res.crit }).total + (a.features.includes("agonizingBlast") ? cha : 0);
      log.push(entry("combat", `💥 ${t.name} takes ${r} force.`, a.id));
      applyDamage(enc, rng, t, r, "force", log, { crit: res.crit, sourceId: a.id, attack: true });
      hexDamage(enc, rng, a, t, res.crit, log);
      if (!t.dead && a.features.includes("repellingBlast") && t.size !== "huge" && t.size !== "gargantuan") pushAway(enc, a.pos, t, 10, log);
    }
    return null;
  }
  if (eff?.kind === "armorOfAgathys") {
    const amt = 5 * Math.max(1, slot || sp.level);
    a.tempHp = Math.max(a.tempHp, amt);
    a.effects = a.effects.filter((e) => e.kind !== "armorOfAgathys");
    a.effects.push({ id: `aoa-${a.id}`, name: "Armor of Agathys", source: a.id, kind: "armorOfAgathys", amount: amt, expires: "never" });
    log.push(entry("combat", `❄ Spectral frost armours ${a.name} (${amt} temp HP).`, a.id));
    return null;
  }
  if (eff?.kind === "shillelagh") {
    a.effects = a.effects.filter((e) => e.kind !== "shillelagh");
    a.effects.push({ id: `shil-${a.id}`, name: "Shillelagh", source: a.id, kind: "shillelagh", expires: "never" });
    log.push(entry("combat", `🌿 ${a.name}'s staff thrums with nature's power.`, a.id));
    return null;
  }
  // Area spells
  if (tg.kind === "area" && cmd.point) {
    const tiles = areaTiles(enc.map, tg.shape, tg.size, a.pos, cmd.point);
    const hit = enc.combatants.filter((c) => !c.dead && !c.fled && c.id !== a.id && tiles.some((p) => samePoint(p, c.pos)));
    log.push(entry("combat", `The ${sp.name} engulfs ${hit.length ? hit.map((h) => h.name).join(", ") : "nothing"}.`, a.id, { tiles }));
    const dice = sp.damage ? dmgDice(sp.damage.dice) : "";
    const rolled = sp.damage ? roll(rng, dice) : undefined;
    for (const t of hit) {
      if (eff?.kind === "sleep") {
        if (t.features.includes("trance") || (t.monsterId && MONSTERS[t.monsterId]?.type === "undead") || t.conditionImmunities.includes("unconscious")) { log.push(entry("combat", `${t.name} is unaffected by Sleep.`, t.id)); continue; }
        const ok = makeSave(enc, rng, t, "wis", spellDc(a), log);
        if (!ok) { addCondition(t, "unconscious"); addCondition(t, "incapacitated"); t.effects.push({ id: `sleep-${t.id}`, name: "Asleep", source: a.id, kind: "asleep", expires: "concentration", concentration: true }); log.push(entry("combat", `💤 ${t.name} falls asleep!`, t.id)); }
        continue;
      }
      // Sculpt Spells: allies are spared from your evocations
      if (a.features.includes("sculptSpells") && sp.school === "evocation" && !hostile(a, t)) { log.push(entry("combat", `${t.name} is sculpted out of the blast.`, a.id)); continue; }
      const ok = sp.save ? makeSave(enc, rng, t, sp.save.ability, spellDc(a), log) : false;
      if (rolled && sp.damage) {
        const amt = ok ? (sp.save?.half ? Math.floor(rolled.total / 2) : 0) : rolled.total;
        if (amt > 0) { log.push(entry("combat", `💥 ${t.name} takes ${amt} ${sp.damage.type}.`, a.id)); applyDamage(enc, rng, t, amt, sp.damage.type, log, { sourceId: a.id }); }
      }
      if (!ok && eff?.kind === "push" && !t.dead) pushAway(enc, a.pos, t, eff.feet, log);
      if (!ok && !t.dead && eff?.kind === "faerieFire") {
        removeCondition(t, "invisible");
        t.effects.push({ id: `ff-${t.id}`, name: "Faerie Fire", source: a.id, kind: "faerieFire", expires: "concentration", concentration: true });
        log.push(entry("combat", `✨ ${t.name} is outlined in faerie fire.`, a.id));
      }
      if (!ok && !t.dead && eff?.kind === "entangle" && addCondition(t, "restrained")) {
        t.effects.push({ id: `ent-${t.id}`, name: "Entangle", source: a.id, kind: "heldBySpell", condition: "restrained", saveAbility: "str", saveDc: spellDc(a), expires: "concentration", concentration: true });
        log.push(entry("combat", `🌿 ${t.name} is restrained by grasping weeds!`, a.id));
      }
      if (!ok && !t.dead && eff?.kind === "condition" && addCondition(t, eff.condition)) {
        log.push(entry("combat", `${t.name} is ${eff.condition}!`, t.id));
        if (eff.endsOnSave && sp.save) t.effects.push({ id: `held-${t.id}`, name: sp.name, source: a.id, kind: "heldBySpell", condition: eff.condition, saveAbility: sp.save.ability, saveDc: spellDc(a), expires: sp.concentration ? "concentration" : "never", concentration: !!sp.concentration });
      }
      if (!ok && !t.dead && eff?.kind === "pattern" && addCondition(t, "charmed")) {
        addCondition(t, "incapacitated");
        t.effects.push({ id: `hp-${t.id}`, name: "Hypnotic Pattern", source: a.id, kind: "pattern", expires: "concentration", concentration: true });
        log.push(entry("combat", `🌀 ${t.name} is entranced by the pattern!`, a.id));
      }
    }
    if (eff?.kind === "moonbeam") {
      a.effects.push({ id: `mb-${a.id}`, name: "Moonbeam", source: a.id, kind: "moonbeam", point: cmd.point, dice, saveDc: spellDc(a), expires: "concentration", concentration: true });
    }
    return null;
  }

  // Single/multi target creature spells
  for (const t of targets) {
    if (sp.heal) {
      let dice = sp.heal.dice;
      if (sp.heal.perSlot && upcast > 0) { const m = sp.heal.perSlot.match(/^(\d+)d(\d+)$/); if (m) dice += `+${parseInt(m[1]) * upcast}d${m[2]}`; }
      let amt = roll(rng, dice).total + (sp.heal.addMod ? sMod : 0);
      if (a.features.includes("discipleOfLife")) amt += 2 + (slot || sp.level);
      if (t.dead) { log.push(entry("combat", `${t.name} is beyond healing magic.`, a.id)); continue; }
      heal(t, Math.max(1, amt), log, sp.name);
      continue;
    }
    if (eff?.kind === "bless") { t.effects.push({ id: `bless-${t.id}`, name: "Blessed", source: a.id, kind: "bless", expires: "concentration", concentration: true }); log.push(entry("combat", `${t.name} is blessed.`, a.id)); continue; }
    if (eff?.kind === "acBonus") { t.effects.push({ id: `sof-${t.id}`, name: "Shield of Faith", source: a.id, kind: "acBonus", amount: eff.amount, expires: "concentration", concentration: true }); log.push(entry("combat", `${t.name} is warded (+${eff.amount} AC).`, a.id)); continue; }
    if (eff?.kind === "aid") { t.maxHp += eff.amount + 5 * upcast; t.hp += eff.amount + 5 * upcast; log.push(entry("combat", `${t.name} is bolstered (+${eff.amount + 5 * upcast} HP).`, a.id)); continue; }
    if (eff?.kind === "mageArmor") { t.ac = Math.max(t.ac, 13 + abilityMod(t, "dex")); log.push(entry("combat", `${t.name} is wrapped in a shimmering ward (AC ${t.ac}).`, a.id)); continue; }
    if (eff?.kind === "guidance") { t.effects.push({ id: `guid-${t.id}`, name: "Guidance", source: a.id, kind: "guidance", expires: "concentration", concentration: true }); log.push(entry("combat", `${t.name} receives guidance.`, a.id)); continue; }
    if (eff?.kind === "hex") { t.effects.push({ id: `hex-${t.id}`, name: "Hexed", source: a.id, kind: "hexed", targetId: t.id, expires: "concentration", concentration: true }); log.push(entry("combat", `🕯 ${a.name} hexes ${t.name}.`, a.id)); continue; }
    if (eff?.kind === "huntersMark") { t.effects.push({ id: `hm-${t.id}`, name: "Hunter's Mark", source: a.id, kind: "huntersMark", targetId: t.id, expires: "concentration", concentration: true }); log.push(entry("combat", `${a.name} marks ${t.name} as their quarry.`, a.id)); continue; }
    if (sp.attack) {
      const res = rollAttack(enc, rng, { attacker: a, target: t, toHit: spellAttackBonus(a), kind: sp.attack, reach: tg.kind === "creature" ? tg.range : 5, isSpell: true }, log, sp.name);
      if (sp.damage) {
        const dice = dmgDice(sp.damage.dice);
        const dtype = eff?.kind === "chromaticOrb" ? chromaticType(cmd.damageType) : sp.damage.type;
        if (res.hit || potent) {
          const r = roll(rng, dice, { crit: res.crit });
          let amt = r.total + (sp.damage.addMod ? sMod : 0);
          if (!res.hit) amt = Math.floor(amt / 2);
          log.push(entry("combat", `💥 ${t.name} takes ${amt} ${dtype}${!res.hit ? " (Potent Cantrip)" : ""}.`, a.id));
          applyDamage(enc, rng, t, amt, dtype, log, { crit: res.crit, sourceId: a.id, attack: true, melee: sp.attack === "melee" });
          if (res.hit) hexDamage(enc, rng, a, t, res.crit, log);
          if (sp.id === "vampiricTouch" && amt > 0) heal(a, Math.floor(amt / 2), log, sp.name);
        }
      }
      if (res.hit && !t.dead && eff?.kind === "noHeal") t.effects.push({ id: `ct-${t.id}`, name: "Chilled to the Bone", source: a.id, kind: "noHeal", expires: "startOfSourceTurn" });
      if (res.hit && !t.dead) {
        if (eff?.kind === "slow") t.effects.push({ id: `rof-${t.id}`, name: "Chilled", source: a.id, kind: "slowed", amount: eff.feet, expires: "startOfSourceTurn" });
        if (eff?.kind === "noReactions") t.effects.push({ id: `sg-${t.id}`, name: "Shocked", source: a.id, kind: "noReactions", expires: "startOfOwnTurn" });
        if (eff?.kind === "advantageNext") t.effects.push({ id: `gb-${t.id}`, name: "Glowing", source: a.id, kind: "advantageNextAttackAgainst", expires: "endOfSourceTurn" });
      }
      if (eff?.kind === "spiritualWeapon" && !spiritualRepeat) a.effects.push({ id: `sw-${a.id}`, name: "Spiritual Weapon", source: a.id, kind: "spiritualWeapon", expires: "concentration", concentration: true });
      continue;
    }
    if (sp.save) {
      if (eff?.kind === "condition" && sp.id === "holdPerson" && t.monsterId && !MONSTERS[t.monsterId]?.type.includes("humanoid")) { log.push(entry("combat", `${t.name} is not a humanoid; Hold Person has no effect.`, a.id)); continue; }
      const ok = makeSave(enc, rng, t, sp.save.ability, spellDc(a), log, { vsCondition: eff?.kind === "condition" ? eff.condition : undefined });
      if (sp.damage) {
        const r = roll(rng, dmgDice(sp.id === "tollTheDead" && t.hp < t.maxHp ? "1d12" : sp.damage.dice));
        let amt = ok ? (sp.save.half || potent ? Math.floor(r.total / 2) : 0) : r.total;
        if (amt > 0) { log.push(entry("combat", `💥 ${t.name} takes ${amt} ${sp.damage.type}.`, a.id)); applyDamage(enc, rng, t, amt, sp.damage.type, log, { sourceId: a.id }); }
      }
      if (!ok && !t.dead && eff?.kind === "mockery") t.effects.push({ id: `vm-${t.id}`, name: "Mocked", source: a.id, kind: "mockery", expires: "endOfOwnTurn" });
      if (!ok && !t.dead && eff?.kind === "dissonantWhispers") {
        if (targetHasReaction(enc, t)) { useReaction(enc, t); log.push(entry("combat", `${t.name} flees from the whispers!`, t.id)); pushAway(enc, a.pos, t, effectiveSpeed(t), log); }
      }
      if (!ok && eff?.kind === "condition" && !t.dead) {
        if (addCondition(t, eff.condition)) {
          log.push(entry("combat", `${t.name} is ${eff.condition}!`, t.id));
          if (eff.endsOnSave) t.effects.push({ id: `held-${t.id}`, name: sp.name, source: a.id, kind: "heldBySpell", condition: eff.condition, saveAbility: sp.save.ability, saveDc: spellDc(a), expires: "concentration", concentration: !!sp.concentration });
        }
      }
    }
  }
  if (!targets.length && sp.targeting.kind === "self" && !sp.damage) log.push(entry("narration", sp.description, a.id));
  return null;
}

// ---------------------------------------------------------------------------------------------
// Queries used by UI and AI

export interface LegalAction { label: string; command: CombatCommand }

export function describeCombatant(c: Combatant): string {
  const conds = [...c.conditions, ...c.effects.filter((e) => !e.id.startsWith("reaction-used") && e.kind !== "heroic").map((e) => e.name)];
  return `${c.name} [${c.side}] HP ${c.hp}/${c.maxHp}${c.tempHp ? `+${c.tempHp}` : ""} AC ${effectiveAc(c)} at (${c.pos.x},${c.pos.y})${conds.length ? ` {${conds.join(", ")}}` : ""}${c.dead ? " DEAD" : ""}`;
}

export function expectedDamage(atk: AttackOption): number {
  return averageDice(atk.damage) + atk.damageBonus;
}

/** Hydrate potions etc. into combat resources so items can be used during the fight. */
export function loadItems(c: Combatant, inventory: { itemId: string; qty: number }[]) {
  for (const i of inventory) {
    if (GEAR[i.itemId]?.use || i.itemId === "healersKit" || i.itemId === "diamond300") c.resources[`item:${i.itemId}`] = (c.resources[`item:${i.itemId}`] ?? 0) + i.qty * (i.itemId === "healersKit" ? 10 : 1);
    if (WEAPONS[i.itemId]?.properties.includes("thrown")) c.resources[`item:${i.itemId}`] = i.qty;
  }
}

export function addFightingStyleFeature(c: Combatant, style?: string) {
  if (style) c.features.push(`style:${style}`);
}

export function eldritchBeams(level: number): number {
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
}

const CHROMATIC: DamageType[] = ["acid", "cold", "fire", "lightning", "poison", "thunder"];
function chromaticType(t?: DamageType): DamageType {
  return t && CHROMATIC.includes(t) ? t : "fire";
}
export { CHROMATIC as CHROMATIC_TYPES };

/** Wolf form for Druid Wild Shape (2024: beast statistics, keep your HP, gain temp HP equal to druid level). */
export const WILD_SHAPE_FORM = {
  name: "Wolf", ac: 12, speed: 40, str: 14, dex: 15, con: 12,
  attack: { id: "bite", name: "Bite (Wolf)", kind: "melee" as const, toHit: 4, damage: "1d6", damageBonus: 2, damageType: "piercing" as DamageType, reach: 5 },
};
