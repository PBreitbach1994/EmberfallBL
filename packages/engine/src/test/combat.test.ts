import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quickBuild, toCombatant, loadItems, createEncounter, monsterCombatant, MONSTERS, mapFromAscii, autoPlayTurn, current,
  Rng, levelUp, createCharacter, applyCommand, CLASSES, renderAscii,
} from "../index.js";
import type { CharacterSheet, ClassId } from "../index.js";

const MAP = [
  "################",
  "#..............#",
  "#..%.......%...#",
  "#..............#",
  "#....::::......#",
  "#..............#",
  "#..%.......%...#",
  "#..............#",
  "################",
];

function party(level = 1): CharacterSheet[] {
  const specs: [string, ClassId, any, any][] = [
    ["Brakka", "fighter", "dwarf", "soldier"], ["Wren", "rogue", "halfling", "criminal"],
    ["Sister Ama", "cleric", "human", "acolyte"], ["Ilsevel", "wizard", "elf", "sage"],
  ];
  return specs.map(([n, c, s, b], i) => {
    const sh = quickBuild(n, "ai", c, s, b, `t${i}`);
    while (sh.level < level) { sh.xp = [0, 0, 300, 900, 2700, 6500][sh.level + 1]; levelUp(sh); }
    return sh;
  });
}

function fight(level: number, monsters: string[], seed: number) {
  const rng = new Rng(seed);
  const pcs = party(level).map((s, i) => { const c = toCombatant(s, { x: 2, y: 2 + i }, { kind: "ai-player" }); loadItems(c, s.inventory); return c; });
  const mons = monsters.map((id, i) => monsterCombatant(MONSTERS[id], `m${i}`, { x: 12, y: 1 + i * 2 }, rng));
  const enc = createEncounter({ id: "t", name: "Test Fight", map: mapFromAscii(MAP), combatants: [...pcs, ...mons], seed });
  let guard = 0;
  while (enc.status === "active" && guard++ < 400) autoPlayTurn(enc);
  return enc;
}

test("level 1 party vs goblins resolves", () => {
  let wins = 0;
  for (let s = 1; s <= 20; s++) {
    const enc = fight(1, ["goblinWarrior", "goblinWarrior", "goblinWarrior", "goblinWarrior"], s * 7919);
    assert.notEqual(enc.status, "active", "fight should end");
    if (enc.status === "victory") wins++;
  }
  console.log(`L1 vs 4 goblins: ${wins}/20 wins`);
  assert.ok(wins >= 8, "party should usually win a moderate fight");
});

test("level 3 party vs undead and the wight", () => {
  let wins = 0;
  for (let s = 1; s <= 10; s++) {
    const enc = fight(3, ["wight", "skeleton", "zombie", "skeleton"], s * 104729);
    if (enc.status === "victory") wins++;
    if (s === 1) { console.log(renderAscii(enc)); console.log(enc.log.slice(-25).map((l) => l.text).join("\n")); }
  }
  console.log(`L3 vs wight+undead: ${wins}/10 wins`);
});

test("illegal commands are rejected", () => {
  const enc = fight(1, ["ogre"], 3);
  void enc;
  const rng = new Rng(1);
  const pcs = party(1).map((s, i) => toCombatant(s, { x: 2, y: 2 + i }, { kind: "human", userId: "u" }));
  const mons = [monsterCombatant(MONSTERS.ogre, "o", { x: 12, y: 4 }, rng)];
  const e = createEncounter({ id: "x", name: "x", map: mapFromAscii(MAP), combatants: [...pcs, ...mons], seed: 5 });
  while (current(e).controller.kind === "monster") autoPlayTurn(e);
  const me = current(e);
  const r1 = applyCommand(e, me.id, { type: "attack", attackId: "unarmed", targetId: "o" });
  assert.equal(r1.ok, false);
  const r2 = applyCommand(e, me.id, { type: "move", to: { x: 0, y: 0 } });
  assert.equal(r2.ok, false);
  const other = e.combatants.find((c) => c.id !== me.id)!;
  const r3 = applyCommand(e, other.id, { type: "endTurn" });
  assert.equal(r3.ok, false);
});

test("character creation validates", () => {
  assert.throws(() => createCharacter({ name: "X", ownerId: "u", species: "human", classId: "fighter", background: "soldier", abilityMethod: "standard",
    baseAbilities: { str: 15, dex: 15, con: 13, int: 12, wis: 10, cha: 8 }, abilityBonuses: { str: 2, con: 1 }, skills: [] }, "x"));
  const ok = createCharacter({ name: "Y", ownerId: "u", species: "human", classId: "fighter", background: "soldier", abilityMethod: "pointBuy",
    baseAbilities: { str: 15, dex: 14, con: 14, int: 8, wis: 10, cha: 8 }, abilityBonuses: { str: 2, con: 1 }, skills: ["perception", "survival", "insight"] }, "y");
  assert.equal(ok.abilities.str, 17);
  assert.equal(ok.maxHp, 10 + 2);
  assert.ok(ok.skillProficiencies.includes("athletics"));
  assert.equal(CLASSES.fighter.hitDie, 10);
});
