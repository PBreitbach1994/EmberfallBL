import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quickBuild, toCombatant, createEncounter, monsterCombatant, MONSTERS, mapFromAscii, current, Rng, levelUp, applyCommand,
  SPELLS, XP_THRESHOLDS, CLASSES, isCombatSpell,
} from "../index.js";
import type { CharacterSheet, ClassId, Combatant, EncounterState } from "../index.js";

const MAP = ["##########", "#........#", "#........#", "#........#", "#........#", "##########"];
function hero(cls: ClassId, level: number): CharacterSheet {
  const s = quickBuild("Hero", "u", cls, "human", "sage", "pc");
  while (s.level < level) { s.xp = XP_THRESHOLDS[s.level + 1]; levelUp(s); }
  return s;
}
/** A fight where the hero acts first, with the given spell ready. */
function setup(cls: ClassId, level: number, spellId: string, monsters: { id: string; at: { x: number; y: number } }[], seed0 = 1): { enc: EncounterState; me: Combatant } {
  for (let seed = seed0; seed < seed0 + 400; seed++) {
    const s = hero(cls, level);
    const me = toCombatant(s, { x: 1, y: 2 }, { kind: "human", userId: "u" });
    if (!me.spells.includes(spellId)) me.spells.push(spellId);
    const rng = new Rng(seed);
    const ms = monsters.map((m, i) => monsterCombatant(MONSTERS[m.id], `m${i}`, m.at, rng));
    const enc = createEncounter({ id: "t", name: "T", map: mapFromAscii(MAP), combatants: [me, ...ms], seed });
    const cur = current(enc);
    if (cur.characterId === "pc") return { enc, me: cur };
  }
  throw new Error("no seed");
}
const text = (enc: EncounterState) => enc.log.map((l) => l.text).join("\n");

test("Web restrains creatures in the area, and they get saves to break free", () => {
  let restrained = 0;
  for (let n = 0; n < 20; n++) {
    const { enc, me } = setup("wizard", 3, "web", [{ id: "ogre", at: { x: 5, y: 2 } }], n * 101 + 7);
    const r = applyCommand(enc, me.id, { type: "cast", spellId: "web", point: { x: 5, y: 2 } });
    assert.ok(r.ok, r.error);
    const ogre = enc.combatants.find((c) => c.id === "m0")!;
    if (ogre.conditions.includes("restrained")) { restrained++; assert.ok(ogre.effects.some((e) => e.kind === "heldBySpell" && e.saveAbility === "dex")); }
  }
  assert.ok(restrained > 0, "an ogre (Dex -1) should fail at least once in 20 webs");
});

test("Wrathful Smite deals psychic damage and can frighten", () => {
  let done = false;
  for (let seed = 1; seed < 120 && !done; seed++) {
    const { enc, me } = setup("paladin", 2, "wrathfulSmite", [{ id: "ogre", at: { x: 2, y: 2 } }], seed * 31);
    const w = me.attacks.find((a) => a.kind === "melee" && a.id !== "unarmed")!;
    applyCommand(enc, me.id, { type: "attack", attackId: w.id, targetId: "m0" });
    if (!enc.budget.meleeHits?.length) continue;
    const r = applyCommand(enc, me.id, { type: "smite", spellId: "wrathfulSmite", targetId: "m0", slotLevel: 1 });
    assert.ok(r.ok, r.error);
    assert.match(text(enc), /Wrathful Smite: \d+ psychic/);
    done = true;
  }
  assert.ok(done);
});

test("Blinding Smite needs a 3rd-level slot", () => {
  for (let seed = 1; seed < 120; seed++) {
    const { enc, me } = setup("paladin", 5, "blindingSmite", [{ id: "ogre", at: { x: 2, y: 2 } }], seed * 31);
    const w = me.attacks.find((a) => a.kind === "melee" && a.id !== "unarmed")!;
    applyCommand(enc, me.id, { type: "attack", attackId: w.id, targetId: "m0" });
    if (!enc.budget.meleeHits?.length) continue;
    me.spellSlotsUsed = [0, 0, 0, 0]; // paladin 5 has only 1st/2nd slots
    const r = applyCommand(enc, me.id, { type: "smite", spellId: "blindingSmite", targetId: "m0", slotLevel: 1 });
    assert.equal(r.ok, false, "a paladin without 3rd-level slots can't cast it");
    return;
  }
  assert.fail("no hit");
});

test("Vampiric Touch heals the caster", () => {
  for (let seed = 1; seed < 200; seed++) {
    const { enc, me } = setup("wizard", 5, "vampiricTouch", [{ id: "ogre", at: { x: 2, y: 2 } }], seed * 31);
    me.hp = 5;
    applyCommand(enc, me.id, { type: "cast", spellId: "vampiricTouch", targetIds: ["m0"] });
    if (/takes \d+ necrotic/.test(text(enc))) { assert.ok(me.hp > 5, "healed"); return; }
  }
  assert.fail("never hit");
});

test("every caster still has enough spells to fill their prepared list at level 5", () => {
  for (const c of Object.values(CLASSES)) {
    if (!c.spellcasting) continue;
    const s = hero(c.id, 5);
    assert.ok(s.spellsKnown.length >= c.spellcasting.prepared[5], `${c.id}: ${s.spellsKnown.length}`);
    assert.ok(s.spellsKnown.every((id) => SPELLS[id]), "all ids exist");
  }
  // auto-picks prefer spells that do something in a fight
  const r = hero("ranger", 1);
  assert.ok(r.spellsKnown.every((id) => isCombatSpell(SPELLS[id])), r.spellsKnown.join(","));
});

import { applyPrepare, chosenSpells, copyScroll, ensureSpellbook, lockedSpells, longRest, preparablePool, preparedLimit, scrollId, spellbookSize, GEAR } from "../index.js";

test("a new wizard has a 6-spell book and prepares 4 from it; the book grows by 2 a level", () => {
  const w = hero("wizard", 1);
  assert.equal(w.spellbook?.length, 6);
  assert.equal(chosenSpells(w).length, 4);
  assert.ok(w.spellsKnown.every((id) => w.spellbook!.includes(id)));
  const w3 = hero("wizard", 3);
  assert.equal(w3.spellbook!.length, spellbookSize(3));
  assert.ok(chosenSpells(w3).every((id) => w3.spellbook!.includes(id)), "prepared spells come from the book");
});

test("a wizard picks which spells go into the book at level-up", () => {
  const w = hero("wizard", 2);
  w.xp = XP_THRESHOLDS[3];
  const want = ["web", "acidArrow"].filter((id) => !w.spellbook!.includes(id));
  levelUp(w, { newSpells: want });
  for (const id of want) assert.ok(w.spellbook!.includes(id), `${id} in book`);
});

test("clerics re-prepare freely; the limit doesn't count always-prepared domain spells", () => {
  const c = hero("cleric", 3);
  const locked = lockedSpells(c);
  assert.ok(locked.includes("bless") && locked.includes("aid"), "Life domain spells are locked");
  const pool = preparablePool(c).map((s) => s.id).filter((id) => !locked.includes(id));
  const pick = pool.slice(0, preparedLimit(c));
  applyPrepare(c, { spells: pick });
  assert.deepEqual(chosenSpells(c).sort(), [...pick].sort());
  assert.ok(locked.every((id) => c.spellsKnown.includes(id)), "domain spells stay");
  assert.throws(() => applyPrepare(c, { spells: pool.slice(0, preparedLimit(c) + 1) }), /You can prepare/);
  assert.throws(() => applyPrepare(c, { spells: ["fireball"] }), /isn't one you can prepare/);
});

test("paladins swap one spell per long rest; bards one per level", () => {
  const p = hero("paladin", 3);
  p.spellSwaps = 0;
  const cur = chosenSpells(p);
  const other = preparablePool(p).map((s) => s.id).filter((id) => !cur.includes(id));
  const swapped = [...cur.slice(1), other[0]];
  assert.throws(() => applyPrepare(p, { spells: swapped }), /after each long rest/);
  longRest(p);
  assert.equal(p.spellSwaps, 1);
  applyPrepare(p, { spells: swapped });
  assert.equal(p.spellSwaps, 0);
  assert.throws(() => applyPrepare(p, { spells: [...swapped.slice(1), cur[0]] }), /long rest/);
  assert.doesNotThrow(() => applyPrepare(p, { spells: [...swapped.slice(1), cur[0]], retrain: true }), "the Training Yard pays for extra swaps");

  const b = hero("bard", 2);
  assert.equal(b.spellSwaps, 1, "one swap from reaching level 2");
  assert.equal(b.cantripSwaps, 1, "and one cantrip swap");
});

test("wizards copy scrolls into their book for gold; the scroll is used up", () => {
  const w = hero("wizard", 3);
  const id = ["web", "acidArrow", "blindness", "gustOfWind"].find((x) => !w.spellbook!.includes(x))!;
  assert.ok(GEAR[scrollId(id)], "scroll items are registered");
  w.inventory.push({ itemId: scrollId(id), qty: 1 });
  w.gold = 10;
  assert.throws(() => copyScroll(w, scrollId(id)), /takes 100 gp/);
  w.gold = 150;
  copyScroll(w, scrollId(id));
  assert.ok(w.spellbook!.includes(id));
  assert.equal(w.gold, 50);
  assert.ok(!w.inventory.some((i) => i.itemId === scrollId(id)));
  w.inventory.push({ itemId: scrollId("fireball"), qty: 1 });
  w.gold = 500;
  assert.throws(() => copyScroll(w, scrollId("fireball")), /level 3 spell slots/);
});

test("older wizards without a book get one built from what they know", () => {
  const w = hero("wizard", 3);
  delete w.spellbook;
  assert.ok(ensureSpellbook(w));
  assert.ok(w.spellsKnown.filter((id) => SPELLS[id].level >= 1 && SPELLS[id].classes.includes("wizard")).every((id) => w.spellbook!.includes(id)));
  assert.equal(w.spellbook!.length, spellbookSize(3));
});
