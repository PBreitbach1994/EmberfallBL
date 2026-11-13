import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quickBuild, toCombatant, loadItems, createEncounter, monsterCombatant, MONSTERS, mapFromAscii, autoPlayTurn, current,
  Rng, levelUp, applyCommand, slotsRemaining, shortRest, armorClass, CLASSES, SPELLS, XP_THRESHOLDS,
} from "../index.js";
import type { BackgroundId, CharacterSheet, ClassId, Combatant, EncounterState, SpeciesId } from "../index.js";

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

const BUILD: Record<string, [SpeciesId, BackgroundId]> = {
  paladin: ["human", "soldier"], monk: ["elf", "criminal"], bard: ["halfling", "acolyte"],
  druid: ["dwarf", "sage"], sorcerer: ["dragonborn", "acolyte"], warlock: ["tiefling", "acolyte"],
  fighter: ["dwarf", "soldier"], cleric: ["human", "acolyte"], wizard: ["elf", "sage"], rogue: ["halfling", "criminal"],
  barbarian: ["orc", "soldier"], ranger: ["elf", "soldier"],
};
const NEW: ClassId[] = ["paladin", "monk", "bard", "druid", "sorcerer", "warlock"];

function hero(cls: ClassId, level: number, id: string = cls): CharacterSheet {
  const [sp, bg] = BUILD[cls];
  const s = quickBuild(cls[0].toUpperCase() + cls.slice(1), "ai", cls, sp, bg, id);
  while (s.level < level) { s.xp = XP_THRESHOLDS[s.level + 1]; levelUp(s); }
  return s;
}

function encounter(pcs: CharacterSheet[], monsters: string[], seed: number, opts: { monsterAt?: (i: number) => { x: number; y: number }; human?: boolean } = {}): EncounterState {
  const rng = new Rng(seed);
  const cs = pcs.map((s, i) => {
    const c = toCombatant(s, { x: 2, y: 2 + i }, opts.human ? { kind: "human", userId: "u" } : { kind: "ai-player" });
    loadItems(c, s.inventory);
    return c;
  });
  const ms = monsters.map((id, i) => monsterCombatant(MONSTERS[id], `m${i}`, opts.monsterAt?.(i) ?? { x: 12 + (i % 2), y: 1 + i }, rng));
  return createEncounter({ id: "t", name: "Test", map: mapFromAscii(MAP), combatants: [...cs, ...ms], seed });
}

function playOut(enc: EncounterState) {
  let guard = 0;
  while (enc.status === "active" && guard++ < 500) autoPlayTurn(enc);
  return enc;
}

const FIGHTS: Record<number, string[]> = {
  1: ["goblinWarrior", "goblinWarrior", "goblinWarrior", "goblinWarrior"],
  3: ["bugbearWarrior", "bugbearWarrior", "goblinWarrior", "goblinWarrior", "skeleton"],
  5: ["ogre", "ogre", "bugbearWarrior", "ghoul"],
};
const SIGNATURE: Record<string, RegExp[]> = {
  paladin: [/smites|Lay On Hands|casts (Bless|Cure Wounds|Shield of Faith)|Sacred Weapon/],
  monk: [/Martial Arts|Flurry/],
  bard: [/inspires|Vicious Mockery|Dissonant Whispers|Faerie Fire/],
  druid: [/Produce Flame|Entangle|Faerie Fire|Moonbeam|calls on the land|shifts into/],
  sorcerer: [/Innate Sorcery|Chromatic Orb|Fire Bolt/],
  warlock: [/Eldritch Blast|hexes/],
};

for (const cls of NEW) {
  test(`${cls} parties fight to a conclusion at levels 1, 3 and 5`, () => {
    for (const level of [1, 3, 5]) {
      let wins = 0;
      let used = false;
      const N = 8;
      for (let seed = 1; seed <= N; seed++) {
        const party = [hero(cls, level, `${cls}1`), hero("fighter", level, "f"), hero("cleric", level, "c"), hero(cls === "warlock" ? "bard" : "warlock", level, "x")];
        const enc = playOut(encounter(party, FIGHTS[level], seed * 7907 + level));
        assert.notEqual(enc.status, "active", `${cls} L${level} fight should end`);
        if (enc.status === "victory") wins++;
        const actor = enc.combatants.find((c) => c.characterId === `${cls}1`)!;
        const texts = enc.log.filter((l) => l.actorId === actor.id || l.text.includes(actor.name)).map((l) => l.text).join("\n");
        if (SIGNATURE[cls].some((re) => re.test(texts))) used = true;
      }
      console.log(`${cls} L${level}: ${wins}/${N} wins`);
      assert.ok(wins >= N / 2, `${cls} L${level} party should usually win (got ${wins}/${N})`);
      assert.ok(used, `${cls} L${level} should use its class features`);
    }
  });
}

/** Run seeds until a human-controlled PC gets the first turn. */
function myTurn(pcs: CharacterSheet[], monsters: string[], at: (i: number) => { x: number; y: number }, seed0 = 1): { enc: EncounterState; me: Combatant } {
  for (let seed = seed0; seed < seed0 + 400; seed++) {
    const enc = encounter(pcs, monsters, seed, { monsterAt: at, human: true });
    const cur = current(enc);
    if (cur.characterId === pcs[0].id) return { enc, me: cur };
  }
  throw new Error("no seed gave the first PC the first turn");
}

test("Divine Smite needs a melee hit first, then spends the free use", () => {
  const pal = hero("paladin", 2, "pal");
  let smote = false;
  for (let seed = 1; seed < 80 && !smote; seed++) {
    const { enc, me } = myTurn([pal], ["ogre"], () => ({ x: 3, y: 2 }), seed);
    const before = applyCommand(enc, me.id, { type: "smite", spellId: "divineSmite", targetId: "m0" });
    assert.equal(before.ok, false, "can't smite before hitting");
    const weapon = me.attacks.find((a) => a.kind === "melee" && a.id !== "unarmed")!;
    applyCommand(enc, me.id, { type: "attack", attackId: weapon.id, targetId: "m0" });
    if (!enc.budget.meleeHits?.length) continue;
    const r = applyCommand(enc, me.id, { type: "smite", spellId: "divineSmite", targetId: "m0" });
    assert.ok(r.ok, r.error);
    assert.equal(me.resources.paladinsSmite, 0);
    assert.ok(r.log.some((l) => /smites/.test(l.text)));
    const again = applyCommand(enc, me.id, { type: "smite", spellId: "divineSmite", targetId: "m0", slotLevel: 1 });
    assert.equal(again.ok, false, "only one bonus action");
    smote = true;
  }
  assert.ok(smote, "the paladin should land a hit within 80 tries");
});

test("Lay On Hands heals from the pool", () => {
  const pal = hero("paladin", 3, "pal");
  const ally = hero("fighter", 3, "ally");
  const { enc, me } = myTurn([pal, ally], ["goblinWarrior"], () => ({ x: 13, y: 7 }));
  const friend = enc.combatants.find((c) => c.characterId === "ally")!;
  friend.hp = 5;
  const pool = me.resources.layOnHands;
  assert.equal(pool, 15);
  const r = applyCommand(enc, me.id, { type: "layOnHands", targetId: friend.id, amount: 10 });
  assert.ok(r.ok, r.error);
  assert.equal(friend.hp, 15);
  assert.equal(me.resources.layOnHands, 5);
  assert.equal(applyCommand(enc, me.id, { type: "layOnHands", targetId: friend.id, amount: 5 }).ok, false, "bonus action already used");
});

test("Flurry of Blows spends a Focus Point for two unarmed strikes", () => {
  const monk = hero("monk", 2, "monk");
  const { enc, me } = myTurn([monk], ["ogre"], () => ({ x: 3, y: 2 }));
  assert.equal(me.resources.focus, 2);
  const r = applyCommand(enc, me.id, { type: "flurryOfBlows", targetIds: ["m0"] });
  assert.ok(r.ok, r.error);
  assert.equal(me.resources.focus, 1);
  assert.equal(r.log.filter((l) => /Flurry strike/.test(l.text)).length, 2);
  assert.equal(armorClass(monk), 10 + Math.floor((monk.abilities.dex - 10) / 2) + Math.floor((monk.abilities.wis - 10) / 2));
});

test("Eldritch Blast fires two beams at level 5 with Agonizing Blast", () => {
  const wl = hero("warlock", 5, "wl");
  const { enc, me } = myTurn([wl], ["ogre"], () => ({ x: 12, y: 2 }));
  assert.ok(me.features.includes("agonizingBlast"));
  const r = applyCommand(enc, me.id, { type: "cast", spellId: "eldritchBlast", targetIds: ["m0"] });
  assert.ok(r.ok, r.error);
  assert.equal(r.log.filter((l) => /Eldritch Blast \(beam/.test(l.text)).length, 2);
  const wl1 = hero("warlock", 1, "wl1");
  const t = myTurn([wl1], ["ogre"], () => ({ x: 12, y: 2 }));
  const r1 = applyCommand(t.enc, t.me.id, { type: "cast", spellId: "eldritchBlast", targetIds: ["m0"] });
  assert.ok(r1.ok);
  assert.equal(r1.log.filter((l) => /Eldritch Blast/.test(l.text) && /→/.test(l.text)).length, 1);
});

test("Font of Magic converts Sorcery Points and slots", () => {
  const so = hero("sorcerer", 3, "so");
  const { enc, me } = myTurn([so], ["ogre"], () => ({ x: 13, y: 7 }));
  assert.equal(me.resources.sorceryPoints, 3);
  const slots = slotsRemaining(me)[1];
  const r = applyCommand(enc, me.id, { type: "fontOfMagic", mode: "createSlot", slotLevel: 1 });
  assert.ok(r.ok, r.error);
  assert.equal(me.resources.sorceryPoints, 1);
  assert.equal(slotsRemaining(me)[1], slots + 1);
  const r2 = applyCommand(enc, me.id, { type: "fontOfMagic", mode: "toPoints", slotLevel: 2 });
  assert.ok(r2.ok, r2.error);
  assert.equal(me.resources.sorceryPoints, 3);
  assert.equal(applyCommand(enc, me.id, { type: "fontOfMagic", mode: "createSlot", slotLevel: 3 }).ok, false, "bonus action spent / not enough points");
  // Draconic Resilience
  assert.equal(so.maxHp, 6 + 2 * (4 + Math.floor((so.abilities.con - 10) / 2)) + Math.floor((so.abilities.con - 10) / 2) + 3);
});

test("Quickened and Twinned Spell", () => {
  const so = hero("sorcerer", 3, "so");
  so.spellsKnown.push("holdPerson");
  const { enc, me } = myTurn([so], ["bandit", "bandit"], (i) => ({ x: 8, y: 2 + i * 2 }));
  const tw = applyCommand(enc, me.id, { type: "cast", spellId: "holdPerson", targetIds: ["m0", "m1"], metamagic: "twinned" });
  assert.ok(tw.ok, tw.error);
  assert.equal(me.resources.sorceryPoints, 2);
  assert.equal(tw.log.filter((l) => /WIS save/.test(l.text)).length, 2);
  const q = applyCommand(enc, me.id, { type: "cast", spellId: "fireBolt", targetIds: ["m0"], metamagic: "quickened" });
  assert.ok(q.ok, q.error);
  assert.equal(me.resources.sorceryPoints, 0);
  assert.equal(enc.budget.bonusAction, false);
});

test("Only one leveled spell per turn", () => {
  const wl = hero("warlock", 3, "wl");
  const { enc, me } = myTurn([wl], ["ogre"], () => ({ x: 12, y: 2 }));
  assert.ok(applyCommand(enc, me.id, { type: "cast", spellId: "hex", targetIds: ["m0"] }).ok);
  const r = applyCommand(enc, me.id, { type: "cast", spellId: "scorchingRay", targetIds: ["m0"] });
  assert.equal(r.ok, false);
  assert.ok(applyCommand(enc, me.id, { type: "cast", spellId: "eldritchBlast", targetIds: ["m0"] }).ok);
});

test("Pact Magic slots return on a short rest", () => {
  const wl = hero("warlock", 3, "wl");
  assert.deepEqual(wl.spellSlots, [0, 0, 2]);
  wl.spellSlotsUsed = [0, 0, 2];
  shortRest(wl, new Rng(1), 0);
  assert.deepEqual(wl.spellSlotsUsed, [0, 0, 0]);
  const wl5 = hero("warlock", 5, "wl5");
  assert.deepEqual(wl5.spellSlots, [0, 0, 0, 2]);
  assert.ok(wl5.spellsKnown.includes("fireball"), "Fiend spells at 5th");
});

test("Wild Shape transforms and reverts", () => {
  const dr = hero("druid", 2, "dr");
  const { enc, me } = myTurn([dr], ["ogre"], () => ({ x: 13, y: 7 }));
  const ac = me.ac;
  assert.ok(applyCommand(enc, me.id, { type: "wildShape" }).ok);
  assert.equal(me.ac, 12);
  assert.equal(me.tempHp, 2);
  assert.equal(me.attacks[0].id, "bite");
  assert.equal(applyCommand(enc, me.id, { type: "cast", spellId: "produceFlame", targetIds: ["m0"] }).ok, false, "no spells in beast form");
  applyCommand(enc, me.id, { type: "endTurn" });
  while (current(enc).id !== me.id && enc.status === "active") autoPlayTurn(enc);
  if (enc.status === "active" && me.wildShape) {
    assert.ok(applyCommand(enc, me.id, { type: "revertShape" }).ok);
    assert.equal(me.ac, ac);
  }
});

test("every class and spell is wired up", () => {
  for (const cls of Object.keys(CLASSES) as ClassId[]) {
    const s = hero(cls, 5, `all-${cls}`);
    assert.ok(s.maxHp > 0, cls);
    for (const id of [...s.cantrips, ...s.spellsKnown]) assert.ok(SPELLS[id], `${cls} has unknown spell ${id}`);
  }
  for (const sp of Object.values(SPELLS)) assert.ok(sp.classes.length, `${sp.id} has no class`);
});

test("every combat spell can be cast in a fight", () => {
  const skip = new Set(["revivify", "spareTheDying"]);
  const failures: string[] = [];
  for (const sp of Object.values(SPELLS)) {
    if (skip.has(sp.id) || sp.castingTime === "reaction" || sp.effect?.kind === "smite") continue;
    const cls = sp.classes[0];
    const caster = hero(cls, 5, `sw-${sp.id}`);
    if (!caster.spellsKnown.includes(sp.id) && !caster.cantrips.includes(sp.id)) caster.spellsKnown.push(sp.id);
    const ally = hero("fighter", 5, `ally-${sp.id}`);
    const { enc, me } = myTurn([caster, ally], ["bandit", "bandit"], (i) => ({ x: 4 + i * 2, y: 2 }));
    const friend = enc.combatants.find((c) => c.characterId === ally.id)!;
    const foe = enc.combatants.find((c) => c.id === "m0")!;
    const tg = sp.targeting;
    let cmd: Parameters<typeof applyCommand>[2];
    if (sp.id === "mistyStep") cmd = { type: "cast", spellId: sp.id, point: { x: me.pos.x + 1, y: me.pos.y + 3 } };
    else if (tg.kind === "area") cmd = { type: "cast", spellId: sp.id, point: { ...foe.pos } };
    else if (tg.kind === "self") cmd = { type: "cast", spellId: sp.id };
    else if (tg.ally) cmd = { type: "cast", spellId: sp.id, targetIds: tg.range <= 5 ? [me.id] : [friend.id] };
    else {
      if (tg.range <= 5) me.pos = { x: foe.pos.x - 1, y: foe.pos.y };
      cmd = { type: "cast", spellId: sp.id, targetIds: [foe.id] };
    }
    const r = applyCommand(enc, me.id, cmd);
    if (!r.ok) failures.push(`${sp.id} (${cls}): ${r.error}`);
  }
  assert.deepEqual(failures, []);
});
