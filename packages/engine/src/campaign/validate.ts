// Validation for custom content created in the World Workshop. Shared by server and client so the
// editor can show the same errors the server would reject with.
import { parseDice } from "../dice.js";
import { MONSTERS } from "../data/monsters.js";
import { itemExists } from "../data/equipment.js";
import { mapFromAscii } from "../rules/grid.js";
import type { ItemDef, MonsterDef, Skill, Ability } from "../types.js";
import type { EventCard, Outcome, Scenario, SceneOption, Effect } from "./types.js";
import { SKILL_ABILITY } from "../data/origins.js";

export type ContentKind = "monster" | "item" | "event" | "scenario" | "lore";
export interface LoreEntry { title: string; text: string }

const SKILLS = Object.keys(SKILL_ABILITY) as Skill[];
const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
const DAMAGE = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const BEHAVIORS = ["brute", "skirmisher", "archer", "leader", "pack", "mindless", "cowardly"];
const SIZES = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

const isNum = (v: unknown, lo = -Infinity, hi = Infinity) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isStr = (v: unknown, max = 10_000) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const diceOk = (d: unknown) => { if (typeof d !== "string") return false; try { parseDice(d); return true; } catch { return false; } };

export function validateMonster(m: Partial<MonsterDef>, errs: string[] = []): string[] {
  if (!isStr(m.name, 60)) errs.push("Monster needs a name.");
  if (!SIZES.includes(m.size as string)) errs.push(`size must be one of ${SIZES.join(", ")}.`);
  if (!isStr(m.type, 40)) errs.push("type is required (e.g. undead, beast, humanoid).");
  if (!isNum(m.ac, 5, 30)) errs.push("ac must be 5–30.");
  if (!diceOk(m.hp)) errs.push("hp must be a dice expression like 4d8+4.");
  if (!isNum(m.avgHp, 1, 1000)) errs.push("avgHp must be 1–1000.");
  if (!isNum(m.speed, 0, 120)) errs.push("speed must be 0–120.");
  if (!m.abilities || ABILITIES.some((a) => !isNum(m.abilities![a], 1, 30))) errs.push("abilities needs str/dex/con/int/wis/cha (1–30).");
  if (!isNum(m.passivePerception, 1, 30)) errs.push("passivePerception must be 1–30.");
  if (!isNum(m.cr, 0, 30)) errs.push("cr must be 0–30.");
  if (!isNum(m.xp, 0, 155000)) errs.push("xp must be a number.");
  if (!BEHAVIORS.includes(m.behavior as string)) errs.push(`behavior must be one of ${BEHAVIORS.join(", ")}.`);
  if (!Array.isArray(m.actions) || !m.actions.length) errs.push("A monster needs at least one action.");
  const ids = new Set((m.actions ?? []).map((a) => a.id));
  for (const a of m.actions ?? []) {
    const where = `action "${a.id ?? "?"}"`;
    if (!isStr(a.id, 40) || !isStr(a.name, 60)) errs.push(`${where}: id and name are required.`);
    if (!["melee", "ranged", "save", "multiattack", "heal", "special"].includes(a.kind)) errs.push(`${where}: kind must be melee, ranged, save or multiattack.`);
    if ((a.kind === "melee" || a.kind === "ranged") && !isNum(a.toHit, -5, 20)) errs.push(`${where}: toHit must be -5–20.`);
    if (a.kind === "ranged" && !(Array.isArray(a.range) && isNum(a.range[0], 5, 1000))) errs.push(`${where}: ranged actions need range [normal, long].`);
    if (a.kind === "save" && !(a.save && ABILITIES.includes(a.save.ability) && isNum(a.save.dc, 5, 30))) errs.push(`${where}: save actions need save { ability, dc }.`);
    if (a.kind === "multiattack" && !(a.multiattack?.length && a.multiattack.every((x) => ids.has(x) && x !== a.id))) errs.push(`${where}: multiattack must list other action ids.`);
    for (const d of a.damage ?? []) if (!diceOk(d.dice) || !isNum(d.bonus, -10, 50) || !DAMAGE.includes(d.type)) errs.push(`${where}: damage entries need dice, bonus and a damage type.`);
  }
  return errs;
}

export function validateItem(i: Partial<ItemDef>, errs: string[] = []): string[] {
  if (!isStr(i.name, 60)) errs.push("Item needs a name.");
  if (!["consumable", "gear", "treasure", "material", "quest"].includes(i.kind as string)) errs.push("kind must be consumable, gear, treasure or quest.");
  if (!isStr(i.description, 500)) errs.push("Item needs a description.");
  if (!isNum(i.cost, 0, 1_000_000)) errs.push("cost (gp) must be a number.");
  if (i.use?.heal !== undefined && !diceOk(i.use.heal)) errs.push("use.heal must be dice like 2d4+2.");
  return errs;
}

function checkEffects(effects: Effect[] | undefined, where: string, errs: string[], ctx: { items: (id: string) => boolean }) {
  for (const e of effects ?? []) {
    if (e.kind === "item" && !ctx.items(e.itemId)) errs.push(`${where}: unknown item "${e.itemId}".`);
    if (e.kind === "damage" && !diceOk(e.dice)) errs.push(`${where}: damage dice "${e.dice}" isn't valid.`);
    if (e.kind === "gold" && !isNum(e.amount, -100000, 100000)) errs.push(`${where}: gold amount must be a number.`);
  }
}

function checkOption(o: SceneOption, where: string, errs: string[], nodes: Set<string> | null, ctx: { items: (id: string) => boolean }) {
  if (!isStr(o.id, 40) || !isStr(o.label, 200)) errs.push(`${where}: every option needs an id and a label.`);
  if (o.check) {
    if (o.check.skill && !SKILLS.includes(o.check.skill)) errs.push(`${where}: unknown skill "${o.check.skill}".`);
    if (o.check.ability && !ABILITIES.includes(o.check.ability)) errs.push(`${where}: unknown ability "${o.check.ability}".`);
    if (!o.check.skill && !o.check.ability) errs.push(`${where}: a check needs a skill or an ability.`);
    if (!isNum(o.check.dc, 5, 30)) errs.push(`${where}: DC must be 5–30.`);
  }
  for (const [label, out] of [["success", o.success], ["failure", o.failure]] as [string, Outcome | undefined][]) {
    if (!out) { if (label === "success") errs.push(`${where}: missing success outcome.`); continue; }
    if (!isStr(out.text, 4000)) errs.push(`${where} ${label}: needs text.`);
    if (nodes && out.goto && !nodes.has(out.goto)) errs.push(`${where} ${label}: goes to unknown scene "${out.goto}".`);
    checkEffects(out.effects, `${where} ${label}`, errs, ctx);
  }
}

export function validateEvent(ev: Partial<EventCard>, errs: string[] = [], ctx = defaultCtx()): string[] {
  if (!isStr(ev.title, 80) || !isStr(ev.text, 4000)) errs.push("Event needs a title and text.");
  if (ev.deck !== "road" && ev.deck !== "town") errs.push('deck must be "road" or "town".');
  if (ev.season && ev.season !== "summer" && ev.season !== "winter") errs.push("season must be summer or winter (or left out).");
  if (!Array.isArray(ev.options) || ev.options.length < 1) errs.push("An event needs at least one option.");
  for (const o of ev.options ?? []) { checkOption(o, `option "${o.id}"`, errs, null, ctx); if (o.success?.goto || o.failure?.goto) errs.push(`option "${o.id}": events can't jump to scenes.`); }
  return errs;
}

export function validateScenario(s: Partial<Scenario>, errs: string[] = [], ctx = defaultCtx()): string[] {
  if (!isStr(s.name, 80) || !isStr(s.hook, 400) || !isStr(s.summary, 2000) || !isStr(s.location, 120)) errs.push("Scenario needs name, hook, summary and location.");
  if (!(Array.isArray(s.recommendedLevel) && isNum(s.recommendedLevel[0], 1, 20) && isNum(s.recommendedLevel[1], s.recommendedLevel[0], 20))) errs.push("recommendedLevel must be [min, max].");
  if (!s.rewards || !isNum(s.rewards.xp, 0, 100000) || !isNum(s.rewards.gold, 0, 100000)) errs.push("rewards needs xp and gold.");
  if (!(Array.isArray(s.mapPosition) && isNum(s.mapPosition[0], 0, 100) && isNum(s.mapPosition[1], 0, 100))) errs.push("mapPosition must be [x, y] between 0 and 100.");
  const nodes = s.nodes ?? {};
  const ids = new Set(Object.keys(nodes));
  if (!ids.size) { errs.push("A scenario needs scenes (nodes)."); return errs; }
  if (!s.start || !ids.has(s.start)) errs.push(`start must name one of the scenes (${[...ids].join(", ")}).`);
  let successEnd = false, otherEnd = false;
  for (const [key, n] of Object.entries(nodes)) {
    const where = `scene "${key}"`;
    if (n.id !== key) errs.push(`${where}: its id must match its key.`);
    if (!isStr(n.title, 120) || !isStr(n.text, 6000)) errs.push(`${where}: needs a title and text.`);
    if (n.end === "success") successEnd = true; else if (n.end) otherEnd = true;
    if (!n.end && !n.encounter && !(n.options ?? []).some((o) => !o.hidden)) errs.push(`${where}: a dead end — add an option, an encounter, or mark it as an end.`);
    for (const o of n.options ?? []) checkOption(o, `${where} option "${o.id}"`, errs, ids, ctx);
    checkEffects(n.onEnter, `${where} onEnter`, errs, ctx);
    if (n.encounter) {
      const e = n.encounter;
      const ew = `${where} encounter`;
      if (!Array.isArray(e.map) || e.map.length < 5 || e.map.length > 30 || e.map.some((r) => typeof r !== "string" || r.length > 40)) { errs.push(`${ew}: map must be 5–30 rows of text (max 40 wide).`); continue; }
      const map = mapFromAscii(e.map);
      const taken = new Set<string>();
      const spot = (xy: [number, number], what: string) => {
        if (!Array.isArray(xy) || !isNum(xy[0], 0, map.width - 1) || !isNum(xy[1], 0, map.height - 1)) { errs.push(`${ew}: ${what} at ${JSON.stringify(xy)} is off the map.`); return; }
        const t = map.tiles[xy[1]][xy[0]];
        if (t !== "floor" && t !== "difficult") errs.push(`${ew}: ${what} at [${xy}] is on ${t}, not floor.`);
        const k = xy.join(","); if (taken.has(k)) errs.push(`${ew}: two creatures share [${xy}].`); taken.add(k);
      };
      if (!Array.isArray(e.partyStart) || e.partyStart.length < 4) errs.push(`${ew}: partyStart needs at least 4 spots (6 recommended).`);
      for (const p of e.partyStart ?? []) spot(p, "a party start");
      if (!Array.isArray(e.monsters) || !e.monsters.length) errs.push(`${ew}: add monsters.`);
      for (const m of e.monsters ?? []) { if (!ctx.monsters(m.monsterId)) errs.push(`${ew}: unknown monster "${m.monsterId}".`); spot(m.at, m.monsterId); }
      if (!e.onVictory) errs.push(`${ew}: needs onVictory.`);
      for (const [label, out] of [["onVictory", e.onVictory], ["onDefeat", e.onDefeat]] as [string, Outcome | undefined][]) {
        if (out?.goto && !ids.has(out.goto)) errs.push(`${ew} ${label}: goes to unknown scene "${out.goto}".`);
        checkEffects(out?.effects, `${ew} ${label}`, errs, ctx);
      }
      checkEffects(e.loot, `${ew} loot`, errs, ctx);
    }
  }
  if (!successEnd) errs.push('Add at least one scene with "end": "success".');
  if (!otherEnd) errs.push('Add a scene with "end": "failure" or "retreat" for when things go wrong.');
  // every success end must be reachable from the start
  if (s.start && ids.has(s.start)) {
    const seen = new Set<string>([s.start]);
    const queue = [s.start];
    while (queue.length) {
      const n = nodes[queue.shift()!];
      const outs: (Outcome | undefined)[] = [...(n.options ?? []).flatMap((o) => [o.success, o.failure]), n.encounter?.onVictory, n.encounter?.onDefeat];
      for (const o of outs) if (o?.goto && ids.has(o.goto) && !seen.has(o.goto)) { seen.add(o.goto); queue.push(o.goto); }
    }
    if (![...seen].some((k) => nodes[k].end === "success")) errs.push("No success ending can be reached from the start scene.");
    const unreachable = [...ids].filter((k) => !seen.has(k));
    if (unreachable.length) errs.push(`Scenes nobody can reach: ${unreachable.join(", ")}.`);
  }
  return errs;
}

export function validateLore(l: Partial<LoreEntry>, errs: string[] = []): string[] {
  if (!isStr(l.title, 80)) errs.push("Lore needs a title.");
  if (!isStr(l.text, 4000)) errs.push("Lore needs text (up to 4000 characters).");
  return errs;
}

function defaultCtx() {
  return { monsters: (id: string) => !!MONSTERS[id], items: (id: string) => itemExists(id) };
}

export function validateContent(kind: ContentKind, data: unknown): string[] {
  const d = (data ?? {}) as never;
  switch (kind) {
    case "monster": return validateMonster(d);
    case "item": return validateItem(d);
    case "event": return validateEvent(d);
    case "scenario": return validateScenario(d);
    case "lore": return validateLore(d);
  }
  return ["Unknown content kind."];
}

/** Starting templates shown in the editor. */
export const CONTENT_TEMPLATES: Record<ContentKind, unknown> = {
  monster: {
    name: "Bog Hag's Thrall", size: "medium", type: "humanoid", alignment: "chaotic evil", ac: 12, hp: "4d8+4", avgHp: 22, speed: 30,
    abilities: { str: 14, dex: 12, con: 13, int: 7, wis: 10, cha: 8 }, passivePerception: 10, cr: 0.5, xp: 100, behavior: "brute",
    traits: [{ name: "Mire-Touched", description: "Ignores difficult terrain from mud and water." }],
    actions: [{ id: "claws", name: "Claws", kind: "melee", toHit: 4, reach: 5, damage: [{ dice: "1d8", bonus: 2, type: "slashing" }] }],
  },
  item: { name: "Ember Tonic", kind: "consumable", description: "A fizzing orange draught. Regain 1d8+2 HP.", cost: 30, use: { heal: "1d8+2" } },
  event: {
    deck: "road", title: "The Lost Pilgrim", text: "A pilgrim in torn robes stumbles out of the fog, begging for directions to the shrine.",
    options: [
      { id: "guide", label: "Guide them to the shrine", check: { skill: "survival", dc: 12, who: "best" },
        success: { text: "You find the shrine before nightfall. The pilgrim presses a coin into your hand.", effects: [{ kind: "gold", amount: 10 }] },
        failure: { text: "You lose the trail and a cold night in the open.", effects: [{ kind: "condition", condition: "exhaustion", who: "all" }] } },
      { id: "ignore", label: "Point vaguely and move on", success: { text: "The pilgrim wanders off into the fog." } },
    ],
  },
  scenario: {
    name: "The Smugglers' Cove", hook: "“Lights in the cove at night. Find out who's there.” — Harbourmaster", summary: "Smugglers are using a sea cave below the cliffs.",
    location: "The Grey Cliffs", recommendedLevel: [1, 2], arc: "Side Jobs", mapPosition: [80, 70], start: "cliff",
    rewards: { xp: 150, gold: 40, effects: [{ kind: "material", id: "timber", qty: 2 }] },
    nodes: {
      cliff: { id: "cliff", title: "The Cliff Path", text: "A narrow path winds down to a sea cave. Lantern light flickers inside.", improv: { maxGold: 10 },
        options: [
          { id: "sneak", label: "Creep down quietly", check: { skill: "stealth", dc: 12, who: "group" },
            success: { text: "You reach the cave mouth unseen.", goto: "cave" }, failure: { text: "A loose stone clatters — they know you're coming.", goto: "fight" } },
          { id: "charge", label: "Charge in", success: { text: "Steel out, you rush the cave.", goto: "fight" } },
        ] },
      cave: { id: "cave", title: "The Cave Mouth", text: "Three smugglers argue over crates of stolen wine.",
        options: [
          { id: "talk", label: "Talk them into leaving", check: { skill: "persuasion", dc: 13, who: "best" },
            success: { text: "They grumble, but they go. The crates are yours.", goto: "done" }, failure: { text: "They reach for their blades.", goto: "fight" } },
          { id: "attack", label: "Attack", success: { text: "You strike first.", goto: "fight" } },
        ] },
      fight: { id: "fight", title: "Fight in the Cove", text: "The smugglers draw scimitars.", options: [],
        encounter: { id: "cove", name: "Smugglers' Cove", objective: "Defeat the smugglers.",
          map: ["##############", "#............#", "#..%......~~.#", "#..........~~#", "#.....:::....#", "#............#", "#..%.........#", "##############"],
          monsters: [{ monsterId: "bandit", at: [9, 1] }, { monsterId: "bandit", at: [10, 5] }, { monsterId: "bandit", at: [8, 3] }],
          partyStart: [[1, 1], [1, 2], [2, 3], [1, 4], [2, 5], [1, 6]],
          onVictory: { text: "The last smuggler drops. The cove is yours.", goto: "done" },
          onDefeat: { text: "You're driven back up the cliff, battered.", goto: "retreat" } } },
      done: { id: "done", title: "Spoils of the Cove", text: "Crates of wine and a ledger naming the buyer in town.", options: [], end: "success" },
      retreat: { id: "retreat", title: "Back Up the Cliff", text: "The smugglers keep their cove — for now.", options: [], end: "retreat" },
    },
  },
  lore: { title: "The Grey Cliffs", text: "South of Emberfall, the Grey Cliffs drop into a cold sea. Fishermen say the old kingdom's navy sank there, and that on foggy nights you can still hear its bells." },
};
