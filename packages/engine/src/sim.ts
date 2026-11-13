// Balance simulator: plays every authored encounter many times with AI parties and reports
// win rate and attrition. Run with `npm run sim -w packages/engine` (after building).
import { SCENARIOS } from "./campaign/content/index.js";
import { BALANCE } from "./campaign/content/balance.js";
import fs from "node:fs";
import { beginEncounter, startAdventure, type AdventureContext } from "./campaign/adventure.js";
import { autoPlayTurn } from "./rules/tactics.js";
import { levelUp, quickBuild } from "./rules/character.js";
import { XP_THRESHOLDS } from "./data/classes.js";
import type { CampaignState, Difficulty } from "./campaign/types.js";
import type { CharacterSheet, ClassId, SpeciesId, BackgroundId } from "./types.js";

const PARTY: [ClassId, SpeciesId, BackgroundId][] = [["fighter", "human", "soldier"], ["rogue", "halfling", "criminal"], ["cleric", "dwarf", "acolyte"], ["wizard", "elf", "sage"]];

export function buildParty(level: number, seed: number, classes = PARTY): CharacterSheet[] {
  return classes.map(([c, s, b], i) => {
    const sh = quickBuild(`${c}${i}`, "ai", c, s, b, `p${seed}-${i}`);
    while (sh.level < level) { sh.xp = XP_THRESHOLDS[sh.level + 1]; levelUp(sh); }
    return sh;
  });
}

export function baseCampaign(difficulty: Difficulty = "normal"): CampaignState {
  return {
    id: "sim", name: "sim", createdAt: 0, week: 1, season: "summer", prosperity: 0, reputation: 0, treasury: 0,
    materials: { timber: 0, iron: 0, herbs: 0, relic: 0 }, buildings: {}, unlockedScenarios: Object.keys(SCENARIOS), completedScenarios: [], failedScenarios: [], flags: [],
    unlockedClasses: [], roadDeck: [], townDeck: [], retired: [], chronicle: [],
    settings: { hardcore: false, flanking: false, aiDm: false, aiCompanionBanter: false, autoReactions: true, maxPartySize: 6, allowAutonomousParties: true, difficulty },
  };
}

export interface SimStats { encounter: string; level: number; runs: number; winRate: number; hpLeft: number; knockouts: number; deaths: number; rounds: number }

export function simulate(scenarioId: string, nodeId: string, level: number, runs: number, difficulty: Difficulty = "normal", hpOverride?: number): SimStats {
  const scenario = SCENARIOS[scenarioId];
  const def = scenario.nodes[nodeId].encounter!;
  let wins = 0, hp = 0, kos = 0, deaths = 0, rounds = 0;
  for (let r = 0; r < runs; r++) {
    const party = buildParty(level, r);
    const chars = new Map(party.map((p) => [p.id, p]));
    const ctx: AdventureContext = { campaign: baseCampaign(difficulty), scenario, characters: chars };
    const adv = startAdventure(`sim${r}`, ctx, party.map((p) => ({ characterId: p.id, controller: { kind: "ai-player" as const }, userId: "ai" })), { dmMode: "scripted", hostUserId: "x", seed: 1000 + r * 7919 });
    adv.encounter = undefined; adv.status = "exploring";
    if (hpOverride !== undefined) BALANCE[`${scenarioId}/${nodeId}`] = hpOverride;
    beginEncounter(adv, ctx, def);
    const enc = adv.encounter!;
    for (let g = 0; g < 600 && enc.status === "active"; g++) autoPlayTurn(enc);
    if (enc.status === "victory") wins++;
    const pcs = enc.combatants.filter((c) => c.side === "party");
    hp += pcs.reduce((s, c) => s + Math.max(0, c.hp), 0) / pcs.reduce((s, c) => s + c.maxHp, 0);
    kos += enc.log.filter((l) => l.text.includes("falls unconscious")).length;
    deaths += pcs.filter((c) => c.dead).length;
    rounds += enc.round;
  }
  return { encounter: `${scenarioId}/${nodeId}`, level, runs, winRate: wins / runs, hpLeft: hp / runs, knockouts: kos / runs, deaths: deaths / runs, rounds: rounds / runs };
}

export function allEncounters(): { scenarioId: string; nodeId: string; level: number }[] {
  const out: { scenarioId: string; nodeId: string; level: number }[] = [];
  for (const s of Object.values(SCENARIOS)) for (const n of Object.values(s.nodes)) if (n.encounter) out.push({ scenarioId: s.id, nodeId: n.id, level: s.recommendedLevel[0] });
  return out;
}

/** Target fraction of party HP left after a Normal fight, by encounter role. */
function targetHpLeft(scenarioId: string, nodeId: string): number {
  if (scenarioId === "cellar") return 0.7;                       // tutorial
  if (/hollowKing\/ritual$|rimeQueen\/queenFight$/.test(`${scenarioId}/${nodeId}`)) return 0.3; // finales
  if (/Allied|Weakened|Fortified/.test(nodeId)) return 0.55;      // fights made easier by good choices
  return 0.42;
}

export function calibrate(runs = 40, outFile?: string) {
  const result: Record<string, number> = {};
  for (const e of allEncounters()) {
    const key = `${e.scenarioId}/${e.nodeId}`;
    const target = targetHpLeft(e.scenarioId, e.nodeId);
    const minWin = target <= 0.3 ? 0.7 : target >= 0.7 ? 0.95 : 0.8;
    let lo = 0.4, hi = 3.2, best = 1;
    for (let i = 0; i < 7; i++) {
      const mid = (lo + hi) / 2;
      const st = simulate(e.scenarioId, e.nodeId, e.level, runs, "normal", mid);
      // too easy if lots of HP left and near-certain wins; too hard if wins fall below 80%
      const tooEasy = st.hpLeft > target && st.winRate >= minWin;
      if (tooEasy) lo = mid; else hi = mid;
      best = mid;
    }
    result[key] = Math.round(((lo + hi) / 2) * 100) / 100;
    const st = simulate(e.scenarioId, e.nodeId, e.level, runs, "normal", result[key]);
    console.log(key.padEnd(40), "×" + result[key].toFixed(2), `win ${(st.winRate * 100).toFixed(0)}%  hpLeft ${(st.hpLeft * 100).toFixed(0)}% (target ${target * 100}%)`);
    void best;
  }
  if (outFile) {
    const body = Object.entries(result).map(([k, v]) => `  "${k}": ${v},`).join("\n");
    fs.writeFileSync(outFile, `// Generated by \`npm run calibrate -w packages/engine\`. Per-encounter HP multipliers that bring every\n// authored fight to the same "Normal" feel. Safe to regenerate after editing encounters.\nexport const BALANCE: Record<string, number> = {\n${body}\n};\n`);
  }
  return result;
}

if (process.argv[1]?.endsWith("sim.js") && process.argv[2] === "calibrate") {
  for (const k of Object.keys(BALANCE)) delete BALANCE[k];
  calibrate(Number(process.argv[3] ?? 40), process.argv[4]);
} else if (process.argv[1]?.endsWith("sim.js")) {
  const runs = Number(process.argv[2] ?? 30);
  const diff = (process.argv[3] ?? "normal") as Difficulty;
  const filter = process.argv[4];
  console.log(`difficulty=${diff} runs=${runs}`);
  console.log("encounter".padEnd(40), "lvl  win%  hpLeft  KOs  deaths rounds");
  for (const e of allEncounters()) {
    if (filter && !e.scenarioId.includes(filter)) continue;
    const s = simulate(e.scenarioId, e.nodeId, e.level, runs, diff);
    console.log(s.encounter.padEnd(40), String(s.level).padStart(3), (s.winRate * 100).toFixed(0).padStart(5), (s.hpLeft * 100).toFixed(0).padStart(6) + "%", s.knockouts.toFixed(1).padStart(5), s.deaths.toFixed(2).padStart(6), s.rounds.toFixed(1).padStart(6));
  }
}
