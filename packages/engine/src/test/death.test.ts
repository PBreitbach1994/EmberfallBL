import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quickBuild, toCombatant, createEncounter, monsterCombatant, MONSTERS, mapFromAscii, applyCombatantToSheet, Rng,
  graveMarks, raiseDeadCost, resurrectionCost, phoenixAllowed, reviveSheet, current, applyCommand,
} from "../index.js";

const MAP = ["##########", "#........#", "#........#", "#........#", "##########"];

test("grave marks: −1 death saves per return, capped at −3", () => {
  const s = quickBuild("Tor", "u", "fighter", "human", "soldier", "t");
  assert.equal(graveMarks(s), 0);
  s.deathCount = 5;
  assert.equal(graveMarks(s), 3);
  assert.equal(toCombatant(s, { x: 1, y: 1 }, { kind: "ai-player" }).deathSaveMod, -3);
});

test("temple prices climb with every death", () => {
  assert.equal(raiseDeadCost({ deathCount: 0 }), 500);
  assert.equal(raiseDeadCost({ deathCount: 2 }), 1000);
  assert.equal(resurrectionCost({ deathCount: 1 }), 1500);
});

test("phoenix feather rules", () => {
  const s = quickBuild("Tor", "u", "fighter", "human", "soldier", "t");
  assert.equal(phoenixAllowed({ hardcore: false }, s).ok, false, "not dead");
  s.dead = true;
  assert.equal(phoenixAllowed({ hardcore: false, difficulty: "normal" }, s).ok, true);
  assert.equal(phoenixAllowed({ hardcore: false, difficulty: "brutal" }, s).ok, false);
  assert.equal(phoenixAllowed({ hardcore: true }, s).ok, false);
  reviveSheet(s, { exhaustion: 2 });
  s.phoenixUsed = true;
  s.dead = true;
  assert.equal(phoenixAllowed({ hardcore: false }, s).ok, false, "once per hero");
});

test("death saves apply the grave-mark penalty in combat", () => {
  const s = quickBuild("Tor", "u", "fighter", "human", "soldier", "t");
  s.deathCount = 3;
  let saw = false;
  for (let seed = 1; seed < 40 && !saw; seed++) {
    const pc = toCombatant(s, { x: 1, y: 1 }, { kind: "human", userId: "u" });
    pc.hp = 0; pc.conditions.push("unconscious");
    const rat = monsterCombatant(MONSTERS.giantRat, "r", { x: 8, y: 3 }, new Rng(seed));
    const enc = createEncounter({ id: "d", name: "d", map: mapFromAscii(MAP), combatants: [pc, rat], seed });
    for (let i = 0; i < 6 && enc.status === "active"; i++) {
      const c = current(enc);
      applyCommand(enc, c.id, { type: "endTurn" });
    }
    saw = enc.log.some((l) => /death save: \d+ -3 \(returned from the grave\)/.test(l.text));
  }
  assert.ok(saw, "death save log shows the −3 mark");
});

test("Revivify mid-fight counts as a death on the sheet", () => {
  const s = quickBuild("Tor", "u", "fighter", "human", "soldier", "t");
  const c = toCombatant(s, { x: 1, y: 1 }, { kind: "ai-player" });
  c.resources._deaths = 1;
  applyCombatantToSheet(s, c);
  assert.equal(s.deathCount, 1);
});
