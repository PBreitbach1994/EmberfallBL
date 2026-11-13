import { test } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "../sim.js";

// Guards against balance drift. Wide bands: these are small samples of a noisy process.
test("normal difficulty: a mid-arc fight is winnable but costly", () => {
  const s = simulate("greyHounds", "brawl", 3, 16, "normal");
  console.log("greyHounds/brawl normal", s);
  assert.ok(s.winRate >= 0.55, `win rate too low: ${s.winRate}`);
  assert.ok(s.hpLeft <= 0.75, `too easy: ${s.hpLeft} HP left`);
});

test("difficulty levels are ordered", () => {
  const story = simulate("warren", "fight", 1, 16, "story");
  const brutal = simulate("warren", "fight", 1, 16, "brutal");
  console.log("warren story", story.winRate, story.hpLeft, "brutal", brutal.winRate, brutal.hpLeft);
  assert.ok(story.hpLeft > brutal.hpLeft + 0.2);
  assert.ok(story.winRate >= brutal.winRate);
});
