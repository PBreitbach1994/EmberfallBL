// The adventure runner: walks a party through a scenario's scene graph, resolving options,
// checks, effects and encounters. This is pure rules logic with no AI; the AI DM layer sits on
// top and may only act through the functions exported here.
import { Rng, roll } from "../dice.js";
import { MONSTERS } from "../data/monsters.js";
import { itemExists, itemName } from "../data/equipment.js";
import { CLASSES } from "../data/classes.js";
import type { CharacterSheet, Controller, EncounterState, LogEntry, Skill, Ability } from "../types.js";
import { applyCombatantToSheet, canLevelUp, toCombatant } from "../rules/character.js";
import { createEncounter, loadItems, monsterCombatant } from "../rules/combat.js";
import { mapFromAscii } from "../rules/grid.js";
import { groupCheck, rollCheck, type CheckResult } from "../rules/checks.js";
import type { CampaignState, Effect, EncounterDef, EventCard, Outcome, Scenario, SceneCheck, SceneNode, SceneOption } from "./types.js";
import { SKILL_ABILITY } from "../data/origins.js";

export interface PartyMember {
  characterId: string;
  controller: Controller;
  /** user who brought this character (for AI companions: the user who recruited them) */
  userId: string;
}

export type DmMode = "ai" | "scripted" | "human";

export interface AdventureState {
  id: string;
  campaignId: string;
  scenarioId: string;
  nodeId: string;
  party: PartyMember[];
  encounter?: EncounterState;
  status: "exploring" | "combat" | "complete" | "failed" | "retreated";
  log: LogEntry[];
  scenarioFlags: string[];
  usedOptions: string[];
  visited: string[];
  narration: Record<string, string>;
  rngState: number;
  startedAt: number;
  updatedAt: number;
  dmMode: DmMode;
  dmUserId?: string;
  hostUserId: string;
  earnedGold: number;
  earnedXp: number;
  kills: Record<string, number>;   // characterId -> kills this adventure (for summary)
  autonomous?: boolean;             // AI-only party playing on its own
  title: string;
  /** a road event drawn before the scenario begins (Frosthaven-style) */
  pendingEvent?: string;
  openSeats: number;
}

export interface AdventureContext {
  campaign: CampaignState;
  scenario: Scenario;
  characters: Map<string, CharacterSheet>;
}

const MATERIALS = ["timber", "iron", "herbs", "relic"];
let tick = 0;
export function logEntry(kind: LogEntry["kind"], text: string, actorId?: string, data?: unknown): LogEntry {
  return { t: Date.now() * 1000 + (tick++ % 1000), kind, text, actorId, data };
}

export function startAdventure(id: string, ctx: AdventureContext, party: PartyMember[], opts: { dmMode: DmMode; hostUserId: string; dmUserId?: string; autonomous?: boolean; seed?: number }): AdventureState {
  const s = ctx.scenario;
  const adv: AdventureState = {
    id, campaignId: ctx.campaign.id, scenarioId: s.id, nodeId: s.start, party, status: "exploring", log: [], scenarioFlags: [], usedOptions: [],
    visited: [], narration: {}, rngState: opts.seed ?? (Date.now() >>> 0), startedAt: Date.now(), updatedAt: Date.now(),
    dmMode: opts.dmMode, dmUserId: opts.dmUserId, hostUserId: opts.hostUserId, earnedGold: 0, earnedXp: 0, kills: {}, autonomous: opts.autonomous,
    title: s.name, openSeats: 0,
  };
  adv.log.push(logEntry("system", `📜 ${s.name} — ${s.location}`));
  enterNode(adv, ctx, s.start);
  return adv;
}

export function currentNode(adv: AdventureState, ctx: AdventureContext): SceneNode {
  const n = ctx.scenario.nodes[adv.nodeId];
  if (!n) throw new Error(`Scenario ${ctx.scenario.id} has no node ${adv.nodeId}`);
  return n;
}

function partySheets(adv: AdventureState, ctx: AdventureContext): CharacterSheet[] {
  return adv.party.map((p) => ctx.characters.get(p.characterId)).filter((c): c is CharacterSheet => !!c);
}
function aliveSheets(adv: AdventureState, ctx: AdventureContext) {
  return partySheets(adv, ctx).filter((c) => !c.dead);
}

export function hasFlag(adv: AdventureState, ctx: AdventureContext, flag: string) {
  return adv.scenarioFlags.includes(flag) || ctx.campaign.flags.includes(flag);
}

export function optionAvailable(adv: AdventureState, ctx: AdventureContext, o: SceneOption): { ok: boolean; reason?: string } {
  if (o.once && adv.usedOptions.includes(`${adv.nodeId}:${o.id}`)) return { ok: false, reason: "Already done." };
  const r = o.requires;
  if (!r) return { ok: true };
  const sheets = aliveSheets(adv, ctx);
  if (r.flag && !hasFlag(adv, ctx, r.flag)) return { ok: false, reason: "Requires something you haven't discovered." };
  if (r.notFlag && hasFlag(adv, ctx, r.notFlag)) return { ok: false, reason: "No longer possible." };
  if (r.item && MATERIALS.includes(r.item)) { if ((ctx.campaign.materials[r.item as keyof CampaignState["materials"]] ?? 0) <= 0) return { ok: false, reason: `Requires ${r.item} from the town stores.` }; }
  else if (r.item && !sheets.some((s) => s.inventory.some((i) => i.itemId === r.item && i.qty > 0))) return { ok: false, reason: `Requires ${itemName(r.item)}.` };
  if (r.classId && !sheets.some((s) => s.classId === r.classId)) return { ok: false, reason: `Requires a ${CLASSES[r.classId].name}.` };
  if (r.proficient && !sheets.some((s) => s.skillProficiencies.includes(r.proficient!))) return { ok: false, reason: `Requires someone proficient in ${r.proficient}.` };
  if (r.gold && sheets.reduce((s, c) => s + c.gold, 0) < r.gold) return { ok: false, reason: `Requires ${r.gold} gp.` };
  return { ok: true };
}

export function checkLabel(c?: SceneCheck): string | undefined {
  if (!c) return undefined;
  const what = c.skill ? c.skill.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()) : (c.ability ?? "").toUpperCase();
  return `${what}${c.save ? " save" : ""} DC ${c.dc}${c.who === "group" ? " (group)" : ""}`;
}

export function enterNode(adv: AdventureState, ctx: AdventureContext, nodeId: string): SceneNode {
  const node = ctx.scenario.nodes[nodeId];
  if (!node) throw new Error(`Unknown node ${nodeId}`);
  adv.nodeId = nodeId;
  const first = !adv.visited.includes(nodeId);
  if (first) adv.visited.push(nodeId);
  adv.log.push(logEntry("system", `◆ ${node.title}`, undefined, { nodeId }));
  if (first && node.onEnter) applyEffects(adv, ctx, node.onEnter, undefined);
  if (node.encounter && first) beginEncounter(adv, ctx, node.encounter);
  if (node.end) finish(adv, ctx, node.end);
  adv.updatedAt = Date.now();
  return node;
}

export interface ChoiceResult { ok: boolean; error?: string; check?: CheckResult[]; success?: boolean; outcome?: Outcome }

/** Pick the character who should roll for a check. */
export function bestRoller(adv: AdventureState, ctx: AdventureContext, check: SceneCheck, actorId?: string): CharacterSheet | undefined {
  const sheets = aliveSheets(adv, ctx).filter((s) => s.hp > 0);
  if (check.who === "actor" && actorId) return sheets.find((s) => s.id === actorId) ?? sheets[0];
  const score = (s: CharacterSheet) => {
    const ab: Ability = check.skill ? SKILL_ABILITY[check.skill] : (check.ability ?? "str");
    const m = Math.floor((s.abilities[ab] - 10) / 2);
    const prof = check.skill && s.skillProficiencies.includes(check.skill) ? (s.expertise.includes(check.skill) ? 2 : 1) : 0;
    return m + prof * (2 + Math.floor((s.level - 1) / 4));
  };
  return [...sheets].sort((a, b) => score(b) - score(a))[0];
}

export function resolveCheck(adv: AdventureState, ctx: AdventureContext, check: SceneCheck, actorId?: string, reason?: string): { results: CheckResult[]; success: boolean } {
  const rng = new Rng(adv.rngState);
  let out: { results: CheckResult[]; success: boolean };
  if (check.who === "group") {
    out = groupCheck(rng, aliveSheets(adv, ctx).filter((s) => s.hp > 0), { skill: check.skill, ability: check.ability, save: check.save, dc: check.dc, reason });
  } else {
    const who = bestRoller(adv, ctx, check, actorId);
    if (!who) return { results: [], success: false };
    const r = rollCheck(rng, who, { characterId: who.id, skill: check.skill, ability: check.ability, save: check.save, dc: check.dc, reason });
    out = { results: [r], success: r.success };
  }
  adv.rngState = rng.state;
  for (const r of out.results) adv.log.push(logEntry("check", `🎲 ${r.text}`, r.characterId, r));
  if (check.who === "group") adv.log.push(logEntry("check", `Group check ${out.success ? "succeeds" : "fails"} (${out.results.filter((r) => r.success).length}/${out.results.length}).`));
  return out;
}

export function chooseOption(adv: AdventureState, ctx: AdventureContext, optionId: string, actorId?: string): ChoiceResult {
  if (adv.status !== "exploring") return { ok: false, error: adv.status === "combat" ? "Finish the fight first." : "The adventure is over." };
  const node = currentNode(adv, ctx);
  const opt = node.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: "That isn't an option here." };
  const avail = optionAvailable(adv, ctx, opt);
  if (!avail.ok) return { ok: false, error: avail.reason };
  const actor = actorId ? ctx.characters.get(actorId) : undefined;
  adv.log.push(logEntry("narration", `▶ ${actor ? `${actor.name}: ` : ""}${opt.label}`, actorId));
  adv.usedOptions.push(`${node.id}:${opt.id}`);
  let success = true;
  let results: CheckResult[] | undefined;
  if (opt.check) {
    const r = resolveCheck(adv, ctx, opt.check, actorId, opt.label);
    success = r.success;
    results = r.results;
  }
  const outcome = success ? opt.success : (opt.failure ?? opt.success);
  applyOutcome(adv, ctx, outcome, actorId);
  return { ok: true, check: results, success, outcome };
}

export function applyOutcome(adv: AdventureState, ctx: AdventureContext, outcome: Outcome, actorId?: string) {
  adv.log.push(logEntry("narration", outcome.text, undefined, { authored: true }));
  if (outcome.effects) applyEffects(adv, ctx, outcome.effects, actorId);
  if (outcome.goto && adv.status === "exploring") enterNode(adv, ctx, outcome.goto);
}

export function applyEffects(adv: AdventureState, ctx: AdventureContext, effects: Effect[], actorId?: string) {
  const rng = new Rng(adv.rngState);
  const sheets = aliveSheets(adv, ctx);
  const chooser = (actorId && ctx.characters.get(actorId)) || sheets[0];
  const targetsFor = (who: "all" | "chooser" | "random") => who === "all" ? sheets : who === "random" ? [rng.pick(sheets)] : chooser ? [chooser] : [];
  for (const e of effects) {
    switch (e.kind) {
      case "gold": {
        if (!sheets.length) break;
        if (e.amount >= 0) {
          const share = Math.floor(e.amount / sheets.length);
          let rem = e.amount - share * sheets.length;
          for (const s of sheets) { s.gold += share + (rem-- > 0 ? 1 : 0); s.stats.goldEarned += share; }
          adv.earnedGold += e.amount;
          adv.log.push(logEntry("loot", `💰 The party gains ${e.amount} gp.`));
        } else {
          let owed = -e.amount;
          for (const s of [...sheets].sort((a, b) => b.gold - a.gold)) { const pay = Math.min(s.gold, owed); s.gold -= pay; owed -= pay; }
          adv.log.push(logEntry("loot", `💸 The party pays ${-e.amount} gp.`));
        }
        break;
      }
      case "item": {
        if (!itemExists(e.itemId) || !chooser) break;
        const qty = e.qty ?? 1;
        const inv = chooser.inventory.find((i) => i.itemId === e.itemId);
        if (inv) inv.qty += qty; else chooser.inventory.push({ itemId: e.itemId, qty });
        adv.log.push(logEntry("loot", `🎁 ${chooser.name} receives ${qty > 1 ? `${qty}× ` : ""}${itemName(e.itemId)}.`, chooser.id));
        break;
      }
      case "removeItem": {
        if (MATERIALS.includes(e.itemId)) {
          const k = e.itemId as keyof CampaignState["materials"];
          ctx.campaign.materials[k] = Math.max(0, (ctx.campaign.materials[k] ?? 0) - (e.qty ?? 1));
          adv.log.push(logEntry("loot", `📦 -${e.qty ?? 1} ${e.itemId} from the town stores.`));
          break;
        }
        const holder = sheets.find((s) => s.inventory.some((i) => i.itemId === e.itemId && i.qty > 0));
        if (!holder) break;
        const inv = holder.inventory.find((i) => i.itemId === e.itemId)!;
        inv.qty -= e.qty ?? 1;
        holder.inventory = holder.inventory.filter((i) => i.qty > 0);
        adv.log.push(logEntry("loot", `${holder.name} gives up ${itemName(e.itemId)}.`, holder.id));
        break;
      }
      case "xp":
        adv.earnedXp += e.amount;
        for (const s of sheets) s.xp += Math.floor(e.amount / Math.max(1, sheets.length));
        adv.log.push(logEntry("level", `✦ ${e.amount} XP shared among the party.`));
        break;
      case "flag": if (!adv.scenarioFlags.includes(e.flag)) adv.scenarioFlags.push(e.flag); break;
      case "unflag": adv.scenarioFlags = adv.scenarioFlags.filter((f) => f !== e.flag); break;
      case "damage":
        for (const s of targetsFor(e.who)) {
          const r = roll(rng, e.dice);
          s.hp = Math.max(1, s.hp - r.total); // narrative damage never kills outright
          adv.log.push(logEntry("combat", `🩸 ${s.name} takes ${r.total} ${e.type} damage. (${s.hp}/${s.maxHp})`, s.id));
        }
        break;
      case "heal":
        for (const s of targetsFor(e.who)) {
          const r = roll(rng, e.dice);
          s.hp = Math.min(s.maxHp, s.hp + r.total);
          adv.log.push(logEntry("combat", `💚 ${s.name} regains ${r.total} HP. (${s.hp}/${s.maxHp})`, s.id));
        }
        break;
      case "material":
        ctx.campaign.materials[e.id] = Math.max(0, (ctx.campaign.materials[e.id] ?? 0) + e.qty);
        adv.log.push(logEntry("loot", `📦 ${e.qty >= 0 ? "+" : ""}${e.qty} ${e.id} ${e.qty >= 0 ? "for" : "from"} the town stores.`));
        break;
      case "prosperity": ctx.campaign.prosperity += e.amount; adv.log.push(logEntry("system", `Emberfall's prosperity ${e.amount >= 0 ? "grows" : "falls"} (${e.amount >= 0 ? "+" : ""}${e.amount}).`)); break;
      case "reputation": ctx.campaign.reputation += e.amount; adv.log.push(logEntry("system", `Reputation ${e.amount >= 0 ? "+" : ""}${e.amount}.`)); break;
      case "rest":
        for (const s of sheets) {
          if (e.type === "long") { s.hp = s.maxHp; s.spellSlotsUsed = s.spellSlots.map(() => 0); s.resources = {}; }
          else s.hp = Math.min(s.maxHp, s.hp + Math.max(1, Math.floor(s.maxHp / 4)));
        }
        adv.log.push(logEntry("system", e.type === "long" ? "🌙 The party takes a long rest." : "☕ The party catches its breath (short rest)."));
        break;
      case "condition":
        for (const s of targetsFor(e.who)) {
          if (e.condition === "exhaustion") s.exhaustion = Math.min(6, s.exhaustion + 1);
          else if (!s.conditions.includes(e.condition)) s.conditions.push(e.condition);
          adv.log.push(logEntry("combat", `${s.name} is ${e.condition === "exhaustion" ? "exhausted" : e.condition}.`, s.id));
        }
        break;
      case "unlockScenario":
        if (!ctx.campaign.unlockedScenarios.includes(e.scenarioId)) { ctx.campaign.unlockedScenarios.push(e.scenarioId); adv.log.push(logEntry("system", `🗺 A new location is revealed on the campaign map.`)); }
        break;
      case "questCounter":
        if (e.counter.startsWith("kill") || e.counter === "scenarioDone") break; // tracked by the engine itself
        for (const s of targetsFor(e.counter === "secretsFound" && actorId ? "chooser" : "all")) bumpQuest(s, e.counter, e.amount);
        break;
    }
  }
  adv.rngState = rng.state;
}

export function bumpQuest(s: CharacterSheet, counter: string, amount: number) {
  if (!s.personalQuest || s.personalQuest.complete) return;
  s.personalQuest.counters[counter] = (s.personalQuest.counters[counter] ?? 0) + amount;
}

// ---------------------------------------------------------------------------------------------
// Encounters

export function beginEncounter(adv: AdventureState, ctx: AdventureContext, def: EncounterDef) {
  const rng = new Rng(adv.rngState);
  const map = mapFromAscii(def.map);
  const combatants = [];
  const members = adv.party.filter((p) => { const s = ctx.characters.get(p.characterId); return s && !s.dead; });
  members.forEach((p, i) => {
    const s = ctx.characters.get(p.characterId)!;
    const start = def.partyStart[i] ?? def.partyStart[def.partyStart.length - 1];
    const c = toCombatant(s, { x: start[0], y: start[1] }, p.controller);
    loadItems(c, s.inventory);
    if (s.hp <= 0) { c.hp = 0; c.conditions.push("unconscious"); c.stable = true; }
    combatants.push(c);
  });
  // party-size scaling
  const monsters = [...def.monsters];
  const counts: Record<string, number> = {};
  for (const m of monsters) {
    const md = MONSTERS[m.monsterId];
    if (!md) continue;
    counts[m.monsterId] = (counts[m.monsterId] ?? 0) + 1;
    const n = counts[m.monsterId];
    const same = monsters.filter((x) => x.monsterId === m.monsterId).length;
    const name = m.name ?? (same > 1 ? `${md.name} ${n}` : md.name);
    combatants.push(monsterCombatant(md, `m-${m.monsterId}-${n}-${combatants.length}`, { x: m.at[0], y: m.at[1] }, rng, { name, rollHp: false }));
  }
  const extraHeroes = members.length - 4;
  if (def.scaling?.perExtraHero && extraHeroes > 0) {
    const md = MONSTERS[def.scaling.perExtraHero];
    for (let i = 0; i < extraHeroes && md; i++) {
      const spot = findFreeSpot(map, combatants.map((c) => c.pos), def.monsters[0]?.at ?? [1, 1]);
      if (spot) combatants.push(monsterCombatant(md, `m-x-${i}`, spot, rng, { name: `${md.name} (reinforcement)` }));
    }
  }
  if (def.scaling?.perMissingHero && members.length < 3) {
    for (let i = 0; i < 3 - members.length; i++) {
      const idx = combatants.findIndex((c) => c.monsterId === def.scaling!.perMissingHero);
      if (idx >= 0) combatants.splice(idx, 1);
    }
  }
  adv.encounter = createEncounter({ id: `${adv.id}-${def.id}`, name: def.name, map, combatants, seed: rng.next() * 2 ** 32, objective: def.objective, surprised: def.surprise ? [def.surprise] : undefined });
  adv.status = "combat";
  adv.rngState = rng.state;
  adv.log.push(logEntry("system", `⚔ Combat: ${def.name}${def.objective ? ` — ${def.objective}` : ""}`));
}

function findFreeSpot(map: ReturnType<typeof mapFromAscii>, taken: { x: number; y: number }[], near: [number, number]) {
  for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const p = { x: near[0] + dx, y: near[1] + dy };
    if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) continue;
    if (map.tiles[p.y][p.x] !== "floor") continue;
    if (taken.some((t) => t.x === p.x && t.y === p.y)) continue;
    return p;
  }
  return null;
}

/** Call after every combat command; when the encounter has ended, writes results back and continues the story. */
export function settleEncounter(adv: AdventureState, ctx: AdventureContext): boolean {
  const enc = adv.encounter;
  if (!enc || enc.status === "active") return false;
  const node = currentNode(adv, ctx);
  const def = node.encounter;
  // write back PCs
  for (const c of enc.combatants.filter((c) => c.characterId)) {
    const s = ctx.characters.get(c.characterId!);
    if (!s) continue;
    applyCombatantToSheet(s, c);
    if (c.hp <= 0 && !c.dead) { s.stats.knockouts++; bumpQuest(s, "knockedOut", 1); }
    if (c.resources._crits) { s.stats.criticals += c.resources._crits; bumpQuest(s, "criticals", c.resources._crits); }
    if (c.dead) adv.log.push(logEntry("death", `💀 ${s.name} has fallen. ${ctx.campaign.settings.hardcore || s.hardcore ? "In hardcore mode, death is final." : "Their body is carried back to Emberfall — the temple may yet bring them back."}`, s.id));
  }
  // kills & quest counters
  const defeated = enc.combatants.filter((c) => c.side === "enemy" && c.dead);
  for (const m of defeated) {
    const md = m.monsterId ? MONSTERS[m.monsterId] : undefined;
    const counter = md?.type.includes("goblinoid") ? "killGoblinoid" : md?.type === "undead" ? "killUndead" : md?.type === "beast" ? "killBeast" : "killOther";
    // credit the creature that landed the final blow
    const killer = m.lastAttackerId ? enc.combatants.find((c) => c.id === m.lastAttackerId) : undefined;
    const ks = killer?.characterId ? ctx.characters.get(killer.characterId) : undefined;
    if (ks) {
      bumpQuest(ks, counter, 1);
      ks.stats.kills[counter] = (ks.stats.kills[counter] ?? 0) + 1;
      adv.kills[ks.id] = (adv.kills[ks.id] ?? 0) + 1;
    }
  }
  // XP
  const xp = defeated.reduce((s, c) => s + (c.xp ?? 0), 0);
  const survivors = aliveSheets(adv, ctx);
  if (xp && survivors.length) {
    const each = Math.floor(xp / survivors.length);
    for (const s of survivors) s.xp += each;
    adv.earnedXp += xp;
    adv.log.push(logEntry("level", `✦ ${xp} XP from the battle (${each} each).`));
    for (const s of survivors) if (canLevelUp(s)) adv.log.push(logEntry("level", `⬆ ${s.name} can level up! (Visit the character sheet.)`, s.id));
  }
  adv.status = "exploring";
  const won = enc.status === "victory";
  adv.encounter = undefined;
  if (!def) return true;
  if (won) {
    if (def.loot) applyEffects(adv, ctx, def.loot);
    applyOutcome(adv, ctx, def.onVictory);
  } else {
    // revive unconscious survivors to 1 HP; they were dragged away
    for (const s of partySheets(adv, ctx)) if (!s.dead && s.hp <= 0) s.hp = 1;
    applyOutcome(adv, ctx, def.onDefeat ?? { text: "The party is overwhelmed and flees back toward Emberfall, battered and bloodied.", goto: undefined });
    if (!def.onDefeat?.goto) finish(adv, ctx, "failure");
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Completion

export function finish(adv: AdventureState, ctx: AdventureContext, end: "success" | "failure" | "retreat") {
  if (adv.status === "complete" || adv.status === "failed" || adv.status === "retreated") return;
  const s = ctx.scenario;
  const sheets = aliveSheets(adv, ctx);
  const c = ctx.campaign;
  if (end === "success") {
    adv.status = "complete";
    applyEffects(adv, ctx, [{ kind: "xp", amount: s.rewards.xp * Math.max(1, sheets.length) }, { kind: "gold", amount: s.rewards.gold }, ...(s.rewards.effects ?? [])]);
    if (!c.completedScenarios.includes(s.id)) c.completedScenarios.push(s.id);
    for (const u of s.rewards.unlocks ?? []) if (!c.unlockedScenarios.includes(u)) c.unlockedScenarios.push(u);
    for (const sh of sheets) { if (!sh.stats.scenariosCompleted.includes(s.id)) { sh.stats.scenariosCompleted.push(s.id); bumpQuest(sh, "scenarioDone", 1); } }
    adv.log.push(logEntry("system", `🏆 Scenario complete: ${s.name}!`));
  } else {
    adv.status = end === "retreat" ? "retreated" : "failed";
    if (!c.failedScenarios.includes(s.id)) c.failedScenarios.push(s.id);
    // half XP for the attempt (Gloomhaven-style: you keep what you earned)
    adv.log.push(logEntry("system", end === "retreat" ? "🏳 The party retreats to Emberfall. The scenario can be attempted again." : "☠ The scenario has failed. It can be attempted again."));
  }
  // promote scenario flags to campaign flags (only those prefixed with "c:" or all on success)
  for (const f of adv.scenarioFlags) if ((end === "success" || f.startsWith("c:")) && !c.flags.includes(f)) c.flags.push(f);
  c.week += 1;
  if (c.week % 10 === 0) c.season = c.season === "summer" ? "winter" : "summer";
  c.chronicle.push({ week: c.week, text: `${sheets.map((x) => x.name).join(", ") || "A lost party"} ${end === "success" ? "completed" : end === "retreat" ? "retreated from" : "failed"} "${s.name}".` });
  adv.updatedAt = Date.now();
}

/** Visible options for the current node, with availability. */
export function visibleOptions(adv: AdventureState, ctx: AdventureContext) {
  if (adv.status !== "exploring") return [];
  const node = currentNode(adv, ctx);
  return node.options.filter((o) => !o.hidden).map((o) => {
    const a = optionAvailable(adv, ctx, o);
    return { id: o.id, label: o.label, check: checkLabel(o.check), available: a.ok, reason: a.reason };
  });
}

/** For AI-DM improvisation: a bounded, validated ad-hoc check. */
export function improvisedCheck(adv: AdventureState, ctx: AdventureContext, req: { skill?: Skill; ability?: Ability; dc: number; actorId?: string; who?: "actor" | "best" | "group"; reason: string }) {
  const node = currentNode(adv, ctx);
  const maxDc = node.improv?.maxDc ?? 20;
  const dc = Math.max(5, Math.min(maxDc, Math.round(req.dc)));
  return resolveCheck(adv, ctx, { skill: req.skill, ability: req.ability, dc, who: req.who ?? (req.actorId ? "actor" : "best") }, req.actorId, req.reason);
}

/** For AI-DM improvisation: small rewards within the node's improv caps. Returns what was actually granted. */
export function improvisedReward(adv: AdventureState, ctx: AdventureContext, req: { gold?: number; itemId?: string; actorId?: string }): string {
  const node = currentNode(adv, ctx);
  const key = `improv:${node.id}`;
  if (adv.usedOptions.includes(key)) return "Nothing more of value turns up here.";
  const granted: string[] = [];
  const maxGold = node.improv?.maxGold ?? 0;
  const effects: Effect[] = [];
  if (req.gold && maxGold > 0) { const g = Math.min(maxGold, Math.max(0, Math.floor(req.gold))); if (g) { effects.push({ kind: "gold", amount: g }); granted.push(`${g} gp`); } }
  if (req.itemId && node.improv?.allowedItems?.includes(req.itemId)) { effects.push({ kind: "item", itemId: req.itemId }); granted.push(itemName(req.itemId)); }
  if (!effects.length) return "Nothing of value.";
  adv.usedOptions.push(key);
  applyEffects(adv, ctx, effects, req.actorId);
  return granted.join(", ");
}

export function partyPositionsForMembers(adv: AdventureState): PartyMember[] {
  return adv.party;
}

export function scenarioAvailable(c: CampaignState, s: Scenario): { ok: boolean; reason?: string } {
  if (!c.unlockedScenarios.includes(s.id)) return { ok: false, reason: "Not yet discovered." };
  for (const f of s.requires?.flags ?? []) if (!c.flags.includes(f)) return { ok: false, reason: "Requirements not met." };
  for (const sc of s.requires?.scenarios ?? []) if (!c.completedScenarios.includes(sc)) return { ok: false, reason: "Complete the prerequisite scenarios first." };
  return { ok: true };
}

/** Resolve a road/town event option. Event outcomes never `goto`; the scenario continues afterward. */
export function resolveEvent(adv: AdventureState, ctx: AdventureContext, card: EventCard, optionId: string, actorId?: string): ChoiceResult {
  const opt = card.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: "Not an option." };
  const avail = optionAvailable(adv, ctx, opt);
  if (!avail.ok) return { ok: false, error: avail.reason };
  adv.log.push(logEntry("narration", `▶ ${opt.label}`, actorId));
  let success = true;
  let results: CheckResult[] | undefined;
  if (opt.check) { const r = resolveCheck(adv, ctx, opt.check, actorId, opt.label); success = r.success; results = r.results; }
  const outcome = success ? opt.success : (opt.failure ?? opt.success);
  adv.log.push(logEntry("narration", outcome.text, undefined, { authored: true }));
  if (outcome.effects) applyEffects(adv, ctx, outcome.effects, actorId);
  adv.pendingEvent = undefined;
  adv.log.push(logEntry("system", `The road leads on to ${ctx.scenario.location}.`));
  return { ok: true, check: results, success, outcome };
}

export function eventOptions(adv: AdventureState, ctx: AdventureContext, card: EventCard) {
  return card.options.filter((o) => !o.hidden).map((o) => {
    const a = optionAvailable(adv, ctx, o);
    return { id: o.id, label: o.label, check: checkLabel(o.check), available: a.ok, reason: a.reason };
  });
}
