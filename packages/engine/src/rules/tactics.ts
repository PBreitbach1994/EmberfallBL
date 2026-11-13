// Deterministic tactical AI. Monsters follow fixed behaviour profiles (brute, pack, archer...),
// so fights are fair and repeatable. AI companions use class-aware heuristics; the LLM is only
// asked for flavour (banter), never for rules decisions.
import { SPELLS } from "../data/spells.js";
import { MONSTERS } from "../data/monsters.js";
import { averageDice } from "../dice.js";
import type { AttackOption, CombatCommand, Combatant, EncounterState, MonsterAction, Point } from "../types.js";
import { applyCommand, byId, current, effectiveSpeed, isDown, slotsRemaining } from "./combat.js";
import { areaTiles, dist, findPath, hasLineOfSight, reachable, samePoint } from "./grid.js";

const hostile = (a: Combatant, b: Combatant) => a.side !== b.side && a.side !== "neutral" && b.side !== "neutral";
const alive = (c: Combatant) => !isDown(c);
const incap = (c: Combatant) => c.conditions.some((x) => ["incapacitated", "paralyzed", "stunned", "unconscious", "petrified"].includes(x));

function enemiesOf(enc: EncounterState, c: Combatant) {
  return enc.combatants.filter((o) => hostile(c, o) && alive(o));
}
function alliesOf(enc: EncounterState, c: Combatant) {
  return enc.combatants.filter((o) => o.side === c.side && o.id !== c.id && !o.dead && !o.fled);
}

/** Best tile to stand on to be within `range` ft of target, minimising movement; null if none reachable this turn. */
function approachTile(enc: EncounterState, c: Combatant, target: Combatant, range: number, budget: number, preferFar = false): Point | null {
  const tiles = reachable(enc, c, budget);
  let best: { p: Point; score: number } | null = null;
  for (const [k, cost] of tiles) {
    const [x, y] = k.split(",").map(Number);
    const p = { x, y };
    const d = dist(p, target.pos);
    if (d > range || !hasLineOfSight(enc.map, p, target.pos)) continue;
    const score = preferFar ? -d * 10 + cost * 0.1 : cost + d * 0.01;
    if (!best || score < best.score) best = { p, score };
  }
  return best?.p ?? null;
}

/** Move as close as possible to target. */
function closerTile(enc: EncounterState, c: Combatant, target: Combatant, budget: number): Point | null {
  const tiles = reachable(enc, c, budget);
  let best: { p: Point; d: number; cost: number } | null = null;
  for (const [k, cost] of tiles) {
    const [x, y] = k.split(",").map(Number);
    const p = { x, y };
    // use true path distance to the target where possible
    const d = dist(p, target.pos);
    if (!best || d < best.d || (d === best.d && cost < best.cost)) best = { p, d, cost };
  }
  if (!best || samePoint(best.p, c.pos)) return null;
  return best.p;
}

function fleeTile(enc: EncounterState, c: Combatant, budget: number): Point | null {
  const foes = enemiesOf(enc, c);
  const tiles = reachable(enc, c, budget);
  let best: { p: Point; score: number } | null = null;
  for (const [k] of tiles) {
    const [x, y] = k.split(",").map(Number);
    const p = { x, y };
    const score = Math.min(...foes.map((f) => dist(p, f.pos)));
    if (!best || score > best.score) best = { p, score };
  }
  if (!best || samePoint(best.p, c.pos)) return null;
  return best.p;
}

// ---------------------------------------------------------------------------------------------
// Monsters

function monsterReach(a: MonsterAction): number {
  if (a.kind === "melee") return a.reach ?? 5;
  if (a.range) return a.range[0];
  return a.reach ?? 5;
}

function chooseMonsterTarget(enc: EncounterState, m: Combatant): Combatant | undefined {
  const foes = enemiesOf(enc, m).filter((f) => !f.effects.some((e) => e.kind === "hidden"));
  if (!foes.length) return enemiesOf(enc, m)[0];
  const near = (x: Combatant) => dist(m.pos, x.pos);
  const up = foes.filter((f) => f.hp > 0);
  const pool = up.length ? up : foes;
  switch (m.behavior) {
    case "brute": {
      const last = m.lastAttackerId ? byId(enc, m.lastAttackerId) : undefined;
      if (last && alive(last) && last.hp > 0 && near(last) <= 30) return last;
      return [...pool].sort((a, b) => near(a) - near(b))[0];
    }
    case "pack": {
      // gang up: prefer foes already engaged by allies, then nearest
      const allies = alliesOf(enc, m).filter(alive);
      return [...pool].sort((a, b) => {
        const ea = allies.filter((x) => dist(x.pos, a.pos) <= 5).length;
        const eb = allies.filter((x) => dist(x.pos, b.pos) <= 5).length;
        return eb - ea || near(a) - near(b);
      })[0];
    }
    case "archer":
    case "skirmisher":
      return [...pool].sort((a, b) => a.hp - b.hp || near(a) - near(b))[0];
    case "leader":
      return [...pool].sort((a, b) => a.ac - b.ac || near(a) - near(b))[0];
    default:
      return [...pool].sort((a, b) => near(a) - near(b))[0];
  }
}

function planMonster(enc: EncounterState, m: Combatant): CombatCommand {
  const b = enc.budget;
  const actions = m.monsterActions ?? [];
  if (incap(m) || m.hp <= 0) return { type: "endTurn" };
  if (m.conditions.includes("prone") && b.movement >= Math.ceil(effectiveSpeed(m) / 2) && effectiveSpeed(m) > 0) return { type: "standUp" };
  const target = chooseMonsterTarget(enc, m);
  if (!target) return { type: "endTurn" };

  // Cowardly creatures flee when bloodied
  if (m.behavior === "cowardly" && m.hp <= m.maxHp / 2) {
    const adjacent = enemiesOf(enc, m).some((f) => dist(f.pos, m.pos) <= 5);
    if (adjacent && b.action && !b.disengaged) return { type: "disengage" };
    if (b.movement > 0) { const p = fleeTile(enc, m, b.movement); if (p) return { type: "move", to: p }; }
    return { type: "endTurn" };
  }

  if (b.action) {
    const usable = actions.filter((a) => !a.bonusAction && !(a.recharge && (m.resources[`spent:${a.id}`] ?? 0) > 0) && !(a.usesPerDay && (m.resources[`used:${a.id}`] ?? 0) >= a.usesPerDay));
    const melee = usable.filter((a) => a.kind === "melee");
    const ranged = usable.filter((a) => a.kind === "ranged" || (a.kind === "melee" && a.range));
    const multi = usable.find((a) => a.kind === "multiattack");
    const saves = usable.filter((a) => a.kind === "save");
    const d = dist(m.pos, target.pos);

    // Special save abilities (webs, hold person) on a healthy target in range
    for (const s of saves) {
      const r = s.range?.[0] ?? s.reach ?? 5;
      if (d <= r && hasLineOfSight(enc.map, m.pos, target.pos) && !target.conditions.includes(s.rider?.condition ?? "prone") && (s.rider?.condition || s.damage)) {
        if (s.id === "holdPerson" && m.concentratingOn) continue;
        return { type: "monsterAction", actionId: s.id, targetIds: [target.id] };
      }
    }
    const meleeReach = Math.max(0, ...melee.map((a) => a.reach ?? 5));
    const wantsRange = m.behavior === "archer" || (m.behavior === "skirmisher" && ranged.length && d > 5);
    // In melee reach: attack (multiattack if all its parts are melee)
    if (meleeReach && d <= meleeReach) {
      if (multi && multi.multiattack?.every((id) => actions.find((x) => x.id === id)?.kind === "melee")) {
        const targets = enemiesOf(enc, m).filter((f) => dist(f.pos, m.pos) <= meleeReach).map((f) => f.id);
        return { type: "monsterAction", actionId: multi.id, targetIds: [target.id, ...targets.filter((t) => t !== target.id)] };
      }
      const best = [...melee].sort((a, b) => dmg(b) - dmg(a))[0];
      return { type: "monsterAction", actionId: best.id, targetIds: [target.id] };
    }
    // Ranged attackers keep distance and shoot
    if (ranged.length && (wantsRange || !meleeReach)) {
      const r = ranged[0];
      const range = r.range?.[0] ?? 30;
      if (d <= range && hasLineOfSight(enc.map, m.pos, target.pos)) {
        // archers step away from adjacent foes first
        const adjacent = enemiesOf(enc, m).some((f) => dist(f.pos, m.pos) <= 5);
        if (adjacent && b.movement > 0 && m.features.includes("nimbleEscape") && b.bonusAction) return { type: "cunningAction", mode: "disengage" };
        if (adjacent && b.movement > 0 && b.disengaged) { const p = approachTile(enc, m, target, range, b.movement, true); if (p && !samePoint(p, m.pos)) return { type: "move", to: p }; }
        return { type: "monsterAction", actionId: r.id, targetIds: [target.id] };
      }
      if (b.movement > 0) { const p = approachTile(enc, m, target, range, b.movement, true); if (p && !samePoint(p, m.pos)) return { type: "move", to: p }; }
    }
    // Close to melee
    if (meleeReach && b.movement > 0) {
      const p = approachTile(enc, m, target, meleeReach, b.movement);
      if (p && !samePoint(p, m.pos)) return { type: "move", to: p };
      // try any other foe reachable this turn
      for (const f of enemiesOf(enc, m)) {
        const q = approachTile(enc, m, f, meleeReach, b.movement);
        if (q && !samePoint(q, m.pos)) return { type: "move", to: q };
      }
      const c = closerTile(enc, m, target, b.movement);
      if (c) return { type: "move", to: c };
    }
    // Far away with nothing to do: shoot if possible, else dash
    if (ranged.length) {
      const r = ranged[0];
      if (d <= (r.range?.[1] ?? 60) && hasLineOfSight(enc.map, m.pos, target.pos)) return { type: "monsterAction", actionId: r.id, targetIds: [target.id] };
    }
    if (!b.dashed && meleeReach && d > meleeReach) return { type: "dash" };
  } else if (b.movement > 0) {
    // after acting: skirmishers withdraw
    if ((m.behavior === "skirmisher" || m.behavior === "archer") && m.features.includes("nimbleEscape") && b.bonusAction && enemiesOf(enc, m).some((f) => dist(f.pos, m.pos) <= 5)) {
      return { type: "cunningAction", mode: "disengage" };
    }
    if ((m.behavior === "skirmisher" || m.behavior === "archer") && b.disengaged) {
      const p = fleeTile(enc, m, Math.min(b.movement, 15));
      if (p) return { type: "move", to: p };
    }
  }
  return { type: "endTurn" };
}

function dmg(a: MonsterAction) {
  return (a.damage ?? []).reduce((s, d) => s + averageDice(d.dice) + d.bonus, 0);
}

// ---------------------------------------------------------------------------------------------
// AI companions (and auto-play for absent humans)

function bestAttack(c: Combatant, target: Combatant, from: Point): AttackOption | undefined {
  const d = dist(from, target.pos);
  const opts = c.attacks.filter((a) => (a.kind === "melee" && d <= a.reach) || ((a.kind === "ranged" || a.thrown) && a.range && d <= a.range[0]));
  return opts.sort((x, y) => expected(y) - expected(x))[0];
}
const expected = (a: AttackOption) => averageDice(a.damage) + a.damageBonus + (a.toHit * 0.3);

function canCast(c: Combatant, id: string, enc: EncounterState): boolean {
  const sp = SPELLS[id];
  if (!sp || !c.spells.includes(id)) return false;
  if (sp.castingTime === "action" && !enc.budget.action) return false;
  if (sp.castingTime === "bonus" && !enc.budget.bonusAction) return false;
  if (sp.level > 0 && enc.budget.bonusSpellCast) return false;
  if (sp.level === 0) return true;
  if (id === "huntersMark" && (c.resources.favoredEnemy ?? 0) > 0) return true;
  return slotsRemaining(c).some((s, i) => i >= sp.level && s > 0);
}

function clusterPoint(enc: EncounterState, c: Combatant, shape: "cone" | "cube" | "sphere" | "line", size: number, range: number): { point: Point; foes: number } | null {
  let best: { point: Point; foes: number } | null = null;
  const foes = enemiesOf(enc, c);
  const candidates = shape === "sphere" ? foes.map((f) => f.pos) : foes.map((f) => f.pos).filter((p) => dist(p, c.pos) <= size + 5);
  for (const p of candidates) {
    if (shape === "sphere" && dist(c.pos, p) > range) continue;
    const tiles = areaTiles(enc.map, shape, size, c.pos, p);
    const hitFoes = foes.filter((f) => tiles.some((t) => samePoint(t, f.pos))).length;
    const hitAllies = enc.combatants.filter((o) => o.side === c.side && !o.dead && o.id !== c.id && tiles.some((t) => samePoint(t, o.pos))).length;
    const sculpted = c.features.includes("sculptSpells");
    if (hitAllies && !sculpted) continue;
    if (shape === "sphere" && tiles.some((t) => samePoint(t, c.pos))) continue;
    if (!best || hitFoes > best.foes) best = { point: p, foes: hitFoes };
  }
  return best;
}

function planCompanion(enc: EncounterState, c: Combatant): CombatCommand {
  const b = enc.budget;
  if (c.hp <= 0 || incap(c)) return { type: "endTurn" };
  if (c.conditions.includes("prone") && b.movement >= Math.ceil(effectiveSpeed(c) / 2) && effectiveSpeed(c) > 0) return { type: "standUp" };
  const foes = enemiesOf(enc, c).filter((f) => f.hp > 0);
  if (!foes.length) return { type: "endTurn" };
  const allies = enc.combatants.filter((o) => o.side === c.side && !o.dead && !o.fled);
  const dying = allies.filter((o) => o.hp <= 0 && !o.dead);
  const hurt = allies.filter((o) => o.hp > 0 && o.hp < o.maxHp * 0.35).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp);
  const nearestFoe = [...foes].sort((x, y) => dist(c.pos, x.pos) - dist(c.pos, y.pos))[0];
  const weakestFoe = [...foes].sort((x, y) => x.hp - y.hp)[0];

  // --- Save the dying
  for (const d of dying) {
    if (canCast(c, "healingWord", enc) && dist(c.pos, d.pos) <= 60) return { type: "cast", spellId: "healingWord", targetIds: [d.id] };
    if (canCast(c, "cureWounds", enc)) {
      if (dist(c.pos, d.pos) <= 5) return { type: "cast", spellId: "cureWounds", targetIds: [d.id] };
      const p = approachTile(enc, c, d, 5, b.movement); if (p && !samePoint(p, c.pos)) return { type: "move", to: p };
    }
    if ((c.resources["item:potionHealing"] ?? 0) > 0 && b.bonusAction) {
      if (dist(c.pos, d.pos) <= 5) return { type: "useItem", itemId: "potionHealing", targetId: d.id };
      const p = approachTile(enc, c, d, 5, b.movement); if (p && !samePoint(p, c.pos)) return { type: "move", to: p };
    }
  }
  // --- Self preservation
  if (c.features.includes("secondWind") && b.bonusAction && (c.resources.secondWind ?? 0) > 0 && c.hp < c.maxHp * 0.5) return { type: "secondWind" };
  if (c.hp < c.maxHp * 0.3 && b.bonusAction && (c.resources["item:potionHealing"] ?? 0) > 0) return { type: "useItem", itemId: "potionHealing", targetId: c.id };
  if (hurt.length && canCast(c, "healingWord", enc) && dist(c.pos, hurt[0].pos) <= 60) return { type: "cast", spellId: "healingWord", targetIds: [hurt[0].id] };

  // --- Openers
  if (c.features.includes("rage") && b.bonusAction && !c.effects.some((e) => e.kind === "rage") && (c.resources.rage ?? 0) > 0 && dist(c.pos, nearestFoe.pos) <= 35) return { type: "rage" };
  if (c.features.includes("recklessAttack") && b.action && !c.effects.some((e) => e.kind === "recklessAttack") && dist(c.pos, nearestFoe.pos) <= 5 && c.hp > c.maxHp * 0.4) return { type: "reckless" };
  if (canCast(c, "huntersMark", enc) && !foes.some((f) => f.effects.some((e) => e.kind === "huntersMark" && e.source === c.id)) && !c.concentratingOn && dist(c.pos, weakestFoe.pos) <= 90)
    return { type: "cast", spellId: "huntersMark", targetIds: [weakestFoe.id] };
  if (canCast(c, "bless", enc) && !c.concentratingOn && enc.round <= 2 && b.action) {
    const tgts = allies.filter((o) => o.hp > 0 && dist(c.pos, o.pos) <= 30).slice(0, 3);
    if (tgts.length >= 2) return { type: "cast", spellId: "bless", targetIds: tgts.map((t) => t.id) };
  }
  if (canCast(c, "spiritualWeapon", enc) && !c.concentratingOn && dist(c.pos, nearestFoe.pos) <= 60) return { type: "cast", spellId: "spiritualWeapon", targetIds: [nearestFoe.id] };
  if (c.effects.some((e) => e.kind === "spiritualWeapon") && b.bonusAction && !b.bonusSpellCast && dist(c.pos, nearestFoe.pos) <= 60) return { type: "cast", spellId: "spiritualWeapon", targetIds: [nearestFoe.id] };
  if (c.features.includes("turnUndead") || c.features.includes("channelDivinity")) {
    const undead = foes.filter((f) => f.monsterId && MONSTERS[f.monsterId]?.type === "undead" && dist(c.pos, f.pos) <= 30);
    if (undead.length >= 2 && b.action && (c.resources.channelDivinity ?? 0) > 0) return { type: "channelDivinity", mode: "turnUndead" };
  }

  // --- Area spells
  if (b.action) {
    for (const id of ["fireball", "shatter", "burningHands", "thunderwave", "sleep"]) {
      if (!canCast(c, id, enc)) continue;
      const sp = SPELLS[id];
      if (sp.targeting.kind !== "area") continue;
      if (id === "sleep" && foes.every((f) => f.hp > 15)) continue;
      const best = clusterPoint(enc, c, sp.targeting.shape, sp.targeting.size, sp.targeting.range);
      if (best && best.foes >= 2) return { type: "cast", spellId: id, point: best.point };
    }
    if (c.features.includes("breathWeapon") && (c.resources.breathWeapon ?? 0) > 0 && b.attacksLeft > 0) {
      const best = clusterPoint(enc, c, "cone", 15, 0);
      if (best && best.foes >= 2) return { type: "breathWeapon", point: best.point };
    }
  }

  // --- Spellcasters: ranged spell damage
  const casterFirst = c.classId === "wizard" || c.classId === "cleric";
  if (casterFirst && b.action) {
    const inRange = (r: number) => foes.filter((f) => dist(c.pos, f.pos) <= r && hasLineOfSight(enc.map, c.pos, f.pos));
    if (canCast(c, "magicMissile", enc) && weakestFoe.hp <= 10 && inRange(120).includes(weakestFoe) && slotsRemaining(c).reduce((s, x) => s + x, 0) > 1) return { type: "cast", spellId: "magicMissile", targetIds: [weakestFoe.id] };
    if (canCast(c, "guidingBolt", enc) && inRange(120).length && slotsRemaining(c).reduce((s, x) => s + x, 0) > 2) return { type: "cast", spellId: "guidingBolt", targetIds: [inRange(120).sort((x, y) => y.hp - x.hp)[0].id] };
    const adjacentFoe = foes.some((f) => dist(c.pos, f.pos) <= 5);
    // casters step back from melee before casting
    if (adjacentFoe && c.classId === "wizard" && b.movement > 0 && !b.disengaged) {
      const p = fleeTile(enc, c, b.movement);
      if (p && !samePoint(p, c.pos)) return { type: "move", to: p };
    }
    for (const id of ["fireBolt", "sacredFlame", "rayOfFrost"]) {
      if (!canCast(c, id, enc)) continue;
      const sp = SPELLS[id];
      const range = sp.targeting.kind === "creature" ? sp.targeting.range : 60;
      const t = inRange(range).sort((x, y) => x.hp - y.hp)[0];
      if (t) return { type: "cast", spellId: id, targetIds: [t.id] };
      if (b.movement > 0) { const p = approachTile(enc, c, weakestFoe, range, b.movement, true); if (p && !samePoint(p, c.pos)) return { type: "move", to: p }; }
    }
  }

  // --- Weapon attacks
  if (b.action && b.attacksLeft > 0 || (b.lightAttackMade && b.bonusAction && c.attacks.some((a) => a.light))) {
    const melee = c.attacks.filter((a) => a.kind === "melee" && a.id !== "unarmed").sort((x, y) => expected(y) - expected(x));
    const ranged = c.attacks.filter((a) => a.kind === "ranged").sort((x, y) => expected(y) - expected(x));
    const preferRanged = ranged.length > 0 && (c.classId === "rogue" || c.classId === "ranger" || (expected(ranged[0]) >= (melee[0] ? expected(melee[0]) : 0) && c.classId !== "barbarian"));
    const offhand = !(b.action && b.attacksLeft > 0);
    if (offhand) {
      const lt = c.attacks.filter((a) => a.light && a.kind === "melee");
      const t = foes.find((f) => lt.some((a) => dist(c.pos, f.pos) <= a.reach));
      if (t && lt.length) return { type: "attack", attackId: lt[lt.length > 1 ? 1 : 0].id, targetId: t.id };
    } else {
      // Attack whoever is already in reach (lowest HP first)
      const inReach = foes.filter((f) => melee.some((a) => dist(c.pos, f.pos) <= a.reach)).sort((x, y) => x.hp - y.hp);
      if (inReach.length && (!preferRanged || foes.some((f) => dist(c.pos, f.pos) <= 5))) {
        const t = inReach[0];
        const atk = bestAttack(c, t, c.pos) ?? melee[0];
        if (atk.kind === "ranged" && melee.length) return { type: "attack", attackId: melee[0].id, targetId: t.id };
        return { type: "attack", attackId: atk.id, targetId: t.id };
      }
      if (preferRanged) {
        const r = ranged[0];
        const t = foes.filter((f) => r.range && dist(c.pos, f.pos) <= r.range[0] && hasLineOfSight(enc.map, c.pos, f.pos)).sort((x, y) => x.hp - y.hp)[0];
        const adjacent = foes.some((f) => dist(c.pos, f.pos) <= 5);
        if (adjacent && c.features.includes("cunningAction") && b.bonusAction) return { type: "cunningAction", mode: "disengage" };
        if (adjacent && b.disengaged && b.movement > 0) { const p = fleeTile(enc, c, b.movement); if (p) return { type: "move", to: p }; }
        if (t) {
          // rogues try to hide first for sneak-attack advantage
          if (c.features.includes("cunningAction") && b.bonusAction && !c.effects.some((e) => e.kind === "hidden") && !adjacent) return { type: "cunningAction", mode: "hide" };
          return { type: "attack", attackId: r.id, targetId: t.id };
        }
        if (b.movement > 0 && r.range) { const p = approachTile(enc, c, weakestFoe, r.range[0], b.movement, true); if (p && !samePoint(p, c.pos)) return { type: "move", to: p }; }
      }
      // Close the distance
      if (melee.length && b.movement > 0) {
        const reach = melee[0].reach;
        const candidates = [...foes].sort((x, y) => dist(c.pos, x.pos) - dist(c.pos, y.pos));
        for (const t of candidates) {
          const p = approachTile(enc, c, t, reach, b.movement);
          if (p && !samePoint(p, c.pos)) return { type: "move", to: p };
        }
        const p = closerTile(enc, c, nearestFoe, b.movement);
        if (p) return { type: "move", to: p };
      }
      // thrown / ranged fallback at long range
      for (const atk of [...ranged, ...c.attacks.filter((a) => a.thrown)]) {
        const t = foes.find((f) => atk.range && dist(c.pos, f.pos) <= atk.range[1] && hasLineOfSight(enc.map, c.pos, f.pos));
        if (t) return { type: "attack", attackId: atk.id, targetId: t.id };
      }
      if (!b.dashed && b.action) return { type: "dash" };
    }
  }
  // spare bonus action: cunning hide
  if (c.features.includes("cunningAction") && b.bonusAction && !foes.some((f) => dist(c.pos, f.pos) <= 5) && !c.effects.some((e) => e.kind === "hidden")) return { type: "cunningAction", mode: "hide" };
  return { type: "endTurn" };
}

export function planNext(enc: EncounterState): CombatCommand {
  const c = current(enc);
  if (c.controller.kind === "monster") return planMonster(enc, c);
  return planCompanion(enc, c);
}

/** Play out the current creature's turn using the tactical AI. Returns the commands issued. */
export function autoPlayTurn(enc: EncounterState): CombatCommand[] {
  const actor = current(enc);
  const issued: CombatCommand[] = [];
  for (let i = 0; i < 12; i++) {
    if (enc.status !== "active" || current(enc).id !== actor.id) break;
    const cmd = planNext(enc);
    const res = applyCommand(enc, actor.id, cmd);
    issued.push(cmd);
    if (cmd.type === "endTurn") break;
    if (!res.ok) {
      applyCommand(enc, actor.id, { type: "endTurn" });
      issued.push({ type: "endTurn" });
      break;
    }
  }
  if (enc.status === "active" && current(enc).id === actor.id) applyCommand(enc, actor.id, { type: "endTurn" });
  return issued;
}

/** Whether the current creature should be driven by the AI (monsters and AI players). */
export function isAiTurn(enc: EncounterState): boolean {
  const c = current(enc);
  return c.controller.kind !== "human";
}

export { findPath };
