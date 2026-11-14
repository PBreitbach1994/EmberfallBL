// The AI Dungeon Master harness.
//
// Design rule: Claude narrates, voices NPCs and interprets free-form player intent, but every
// mechanical consequence goes through a tool that the rules engine validates. The model cannot
// roll dice, change HP, invent loot, or move the story to a scene that isn't connected. All tool
// inputs are re-validated here; out-of-bounds requests are clamped or refused and Claude is told why.
import Anthropic from "@anthropic-ai/sdk";
import {
  CLASSES, GEAR, SKILL_NAMES, SPECIES, checkLabel, currentNode, improvisedCheck, improvisedReward, chooseOption,
  optionAvailable, logEntry, applyEffects, itemName,
  type AdventureContext, type AdventureState, type CharacterSheet, type Skill, type Ability, type LogEntry, type SceneNode,
} from "@tavern/engine";
import { WORLD, DM_STYLE_GUIDE } from "@tavern/engine/content";
import type { CampaignState } from "@tavern/engine";
import { aiMode, costUsd, ownKey, recordUsage, type AiMode } from "./campaigns.js";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const SKILLS = Object.keys(SKILL_NAMES) as Skill[];
const ABILITIES: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
const NARRATIVE_DAMAGE = ["1d4", "1d6", "2d4", "2d6"];

let siteClient: Anthropic | null = null;
const ownClients = new Map<string, Anthropic>();

/** Is an AI DM available for this campaign (its owner's key, or the site key within its cap)? */
export function aiAvailable(c?: CampaignState): boolean {
  return aiMode(c) !== "none";
}
function clientFor(c: CampaignState | undefined): { client: Anthropic; mode: AiMode } {
  const mode = aiMode(c);
  if (mode === "own-key" && c) {
    const key = ownKey(c)!;
    let cl = ownClients.get(key);
    if (!cl) { cl = new Anthropic({ apiKey: key, maxRetries: 2, timeout: 120_000 }); ownClients.set(key, cl); }
    return { client: cl, mode };
  }
  if (mode === "site-key") {
    if (!siteClient) siteClient = new Anthropic({ maxRetries: 2, timeout: 120_000 });
    return { client: siteClient, mode };
  }
  throw new Error("No AI Dungeon Master is configured for this campaign.");
}

// ---------------------------------------------------------------------------------------------
// System prompt (stable → cached)

function systemPrompt(): Anthropic.Beta.BetaTextBlockParam[] {
  return [{
    type: "text",
    cache_control: { type: "ephemeral" },
    text: `You are the Dungeon Master for a Dungeons & Dragons 5th Edition (2024 rules) campaign played in a web app. The players gather at ${WORLD.tavern.name} between adventures, then set out on scenarios.

${DM_STYLE_GUIDE}

WORLD
${JSON.stringify(WORLD, null, 1).slice(0, 6000)}

HOW THIS GAME WORKS
- A rules engine runs the game. Scenarios are authored scene graphs: each scene has authored text, private DM notes, NPCs, and a list of options (some hidden). You bring the scenes to life; the engine owns every number.
- You never roll dice yourself, never state numeric results you didn't get from a tool, and never declare that a character gains items, gold, HP, XP, or conditions except through tools.
- When a player's action clearly matches an option (including hidden ones), call choose_option. The engine resolves the check and moves the story. Don't call it for options marked unavailable.
- When a player tries something reasonable that no option covers, you may call ability_check (DC 5-20 per 2024 guidance: 10 easy, 15 medium, 20 hard) and narrate the result, or just narrate if no roll is warranted. Small improvised rewards for clever play go through grant_reward (the engine caps them). Narrative hazards (falling, a trap, a bar fight) go through narrative_damage.
- Improvisation must not contradict authored facts, reveal DM notes the players haven't earned, or move the party to a different scene. Only choose_option changes scenes.
- Address the players directly ("you"), keep narration to 1-3 short paragraphs, and end with a prompt that invites action. NPC dialogue goes in quotes with the speaker named. Don't list the options back to the players; the interface shows them.
- AI companions are party members controlled by the AI. When it fits, give a companion a brief in-character line or reaction in their own voice.
- Players may try anything. Keep consequences fair and the game moving. If an action is impossible, say so in the fiction and suggest what might work.
- Content: the table has opted into mature themes; match the table's lead and keep it in service of the story.`,
  }];
}

// ---------------------------------------------------------------------------------------------
// Context rendering

function sheetLine(s: CharacterSheet, controller: string): string {
  const profs = s.skillProficiencies.map((k) => SKILL_NAMES[k]).join(", ");
  return `- ${s.name} (id ${s.id}): ${SPECIES[s.species].name} ${CLASSES[s.classId].name} ${s.level}, HP ${s.hp}/${s.maxHp}, ${controller}. Skills: ${profs}.${s.personality ? ` Personality: ${s.personality.traits}; ideal ${s.personality.ideal}; bond ${s.personality.bond}; flaw ${s.personality.flaw}.` : ""}${s.aiPersona ? ` Voice: ${s.aiPersona}` : ""}`;
}

function sceneContext(adv: AdventureState, ctx: AdventureContext): string {
  const node = currentNode(adv, ctx);
  const party = adv.party.map((p) => { const s = ctx.characters.get(p.characterId); return s ? sheetLine(s, p.controller.kind === "human" ? "played by a human" : "AI companion") : ""; }).join("\n");
  const opts = node.options.map((o) => {
    const a = optionAvailable(adv, ctx, o);
    return `- [${o.id}]${o.hidden ? " (hidden)" : ""} ${o.label}${o.check ? ` — ${checkLabel(o.check)}` : ""}${a.ok ? "" : ` — UNAVAILABLE: ${a.reason}`}\n    success: ${o.success.text.slice(0, 220)}${o.failure ? `\n    failure: ${o.failure.text.slice(0, 160)}` : ""}`;
  }).join("\n");
  const npcs = (node.npcs ?? []).map((n) => `- ${n.name}, ${n.role} (${n.attitude ?? "indifferent"}): ${n.personality}${n.voice ? ` Voice: ${n.voice}.` : ""}${n.secrets?.length ? ` Secrets: ${n.secrets.join(" / ")}` : ""}`).join("\n");
  const recent = adv.log.slice(-30).filter((l) => l.kind !== "roll").map((l) => `${l.kind === "dialogue" ? "PLAYER" : l.kind.toUpperCase()}: ${l.text}`).join("\n");
  return `SCENARIO: ${ctx.scenario.name} — ${ctx.scenario.summary}
SCENE [${node.id}] ${node.title}
Authored text: ${node.text}
DM notes (secret): ${node.dmNotes ?? "none"}
NPCs present:
${npcs || "- none"}
Options:
${opts || "- none (the scene resolves through combat or has ended)"}
Improvisation caps: max gold ${node.improv?.maxGold ?? 0}, allowed items ${(node.improv?.allowedItems ?? []).join(", ") || "none"}, max DC ${node.improv?.maxDc ?? 20}.
Campaign flags: ${[...ctx.campaign.flags, ...adv.scenarioFlags].join(", ") || "none"}

PARTY
${party}

RECENT LOG
${recent}`;
}

// ---------------------------------------------------------------------------------------------
// Tools

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "choose_option",
    description: "Resolve one of the scene's authored options (including hidden ones) because the player's action matches it. The engine rolls any check, applies effects and may move to the next scene. Use at most once per player action; afterwards narrate the result briefly.",
    input_schema: {
      type: "object",
      properties: {
        option_id: { type: "string", description: "The option id in [brackets]." },
        actor_character_id: { type: "string", description: "Character performing the action." },
      },
      required: ["option_id", "actor_character_id"],
      additionalProperties: false,
    },
  },
  {
    name: "ability_check",
    description: "Ask the engine to roll an improvised ability check or saving throw for an action no option covers. Returns the roll and success/failure.",
    input_schema: {
      type: "object",
      properties: {
        character_id: { type: "string", description: "Character rolling, or 'best' for whoever is best suited, or 'group' for a group check." },
        skill: { type: "string", enum: SKILLS },
        ability: { type: "string", enum: ABILITIES, description: "Use instead of skill for a raw ability check or with save=true." },
        save: { type: "boolean" },
        dc: { type: "integer", minimum: 5, maximum: 25 },
        reason: { type: "string" },
      },
      required: ["character_id", "dc", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "grant_reward",
    description: "Grant a small improvised reward for clever play, within this scene's caps (the engine clamps it and only allows one improvised reward per scene).",
    input_schema: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        gold: { type: "integer", minimum: 0 },
        item_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["character_id", "reason"],
      additionalProperties: false,
    },
  },
  {
    name: "narrative_damage",
    description: "Apply minor damage from a narrative hazard (a fall, a trap, a brawl). Cannot kill; leaves a character at 1 HP at worst.",
    input_schema: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        dice: { type: "string", enum: NARRATIVE_DAMAGE },
        damage_type: { type: "string", enum: ["bludgeoning", "piercing", "slashing", "fire", "cold", "poison", "acid", "necrotic", "psychic"] },
        reason: { type: "string" },
      },
      required: ["character_id", "dice", "damage_type", "reason"],
      additionalProperties: false,
    },
  },
];

type ToolInput = Record<string, unknown>;

export function runTool(adv: AdventureState, ctx: AdventureContext, name: string, input: ToolInput, state: { optionChosen: boolean }): { text: string; isError?: boolean } {
  const str = (k: string) => (typeof input[k] === "string" ? (input[k] as string) : undefined);
  const charOk = (id?: string) => !!id && adv.party.some((p) => p.characterId === id);
  switch (name) {
    case "choose_option": {
      if (state.optionChosen) return { text: "An option was already resolved for this action. Narrate the outcome now.", isError: true };
      const id = str("option_id");
      const actor = str("actor_character_id");
      const node = currentNode(adv, ctx);
      const opt = node.options.find((o) => o.id === id);
      if (!opt) return { text: `No option '${id}' in this scene. Valid ids: ${node.options.map((o) => o.id).join(", ")}`, isError: true };
      const before = adv.nodeId;
      const r = chooseOption(adv, ctx, opt.id, charOk(actor) ? actor : undefined);
      if (!r.ok) return { text: `Refused: ${r.error}`, isError: true };
      state.optionChosen = true;
      const checks = (r.check ?? []).map((c) => c.text).join("; ");
      const moved = adv.nodeId !== before ? ` The story moves to scene "${currentNode(adv, ctx).title}" — do NOT narrate that new scene in detail; it will be described separately. Just narrate the outcome of the action.` : "";
      const status = adv.status === "combat" ? " Combat has begun." : adv.status !== "exploring" ? ` The scenario has ended (${adv.status}).` : "";
      return { text: `${checks ? `Rolls: ${checks}. ` : ""}${r.success ? "SUCCESS" : "FAILURE"}. Authored outcome: ${r.outcome?.text ?? ""}${moved}${status}` };
    }
    case "ability_check": {
      const who = str("character_id");
      const skill = str("skill") as Skill | undefined;
      const ability = str("ability") as Ability | undefined;
      if (skill && !SKILLS.includes(skill)) return { text: "Unknown skill.", isError: true };
      if (ability && !ABILITIES.includes(ability)) return { text: "Unknown ability.", isError: true };
      if (!skill && !ability) return { text: "Provide a skill or an ability.", isError: true };
      const dc = typeof input.dc === "number" ? input.dc : 12;
      const mode = who === "group" ? "group" : who === "best" || !charOk(who) ? "best" : "actor";
      const r = improvisedCheck(adv, ctx, { skill, ability, dc, actorId: mode === "actor" ? who : undefined, who: mode, reason: str("reason") ?? "" });
      return { text: `${r.results.map((x) => x.text).join("; ")} → overall ${r.success ? "SUCCESS" : "FAILURE"}` };
    }
    case "grant_reward": {
      const who = str("character_id");
      const itemId = str("item_id");
      const gold = typeof input.gold === "number" ? input.gold : undefined;
      if (itemId && !GEAR[itemId]) return { text: `Unknown item '${itemId}'.`, isError: true };
      const got = improvisedReward(adv, ctx, { gold, itemId, actorId: charOk(who) ? who : undefined });
      return { text: `Granted: ${got}` };
    }
    case "narrative_damage": {
      const who = str("character_id");
      const dice = str("dice");
      if (!charOk(who) || !dice || !NARRATIVE_DAMAGE.includes(dice)) return { text: "Invalid character or dice.", isError: true };
      const type = (str("damage_type") ?? "bludgeoning") as "bludgeoning";
      const before = ctx.characters.get(who!)?.hp ?? 0;
      applyEffects(adv, ctx, [{ kind: "damage", dice, type, who: "chooser" }], who);
      const after = ctx.characters.get(who!)?.hp ?? 0;
      return { text: `${ctx.characters.get(who!)?.name} took ${before - after} damage (now ${after} HP).` };
    }
  }
  return { text: `Unknown tool ${name}`, isError: true };
}

// ---------------------------------------------------------------------------------------------
// Model calls

async function callClaude(campaign: CampaignState | undefined, params: { messages: Anthropic.Beta.BetaMessageParam[]; tools?: Anthropic.Beta.BetaTool[]; effort?: "low" | "medium" | "high"; maxTokens?: number }) {
  const { client: c, mode } = clientFor(campaign);
  const msg = await c.beta.messages.create({
    model: MODEL,
    max_tokens: params.maxTokens ?? 4000,
    system: systemPrompt(),
    messages: params.messages,
    tools: params.tools,
    output_config: { effort: params.effort ?? "low" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (campaign) recordUsage(campaign, mode, costUsd(msg.usage));
  return msg;
}

function textOf(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

/** Expand a scene's authored text into live narration. */
export async function narrateScene(adv: AdventureState, ctx: AdventureContext, node: SceneNode): Promise<string> {
  const msg = await callClaude(ctx.campaign, {
    effort: "low",
    maxTokens: 1500,
    messages: [{ role: "user", content: `${sceneContext(adv, ctx)}\n\nThe party has just arrived at this scene. Narrate it for the players in 1-2 short paragraphs, keeping every authored fact. Introduce NPCs present (without revealing secrets). Optionally include one brief in-character line from an AI companion. Don't list options.` }],
  });
  if (msg.stop_reason === "refusal") return node.text;
  return textOf(msg) || node.text;
}

/** Handle a player's free-form action or dialogue. Returns the final narration. */
export async function handlePlayerAction(adv: AdventureState, ctx: AdventureContext, actor: CharacterSheet, text: string): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: "user",
    content: `${sceneContext(adv, ctx)}\n\nPLAYER ACTION — ${actor.name} (id ${actor.id}) says/does:\n"""${text.slice(0, 1500)}"""\n\nAdjudicate this as the DM. Use tools for any mechanical effect, then narrate the result. If it's just roleplay or dialogue, respond in character as the relevant NPC(s) with no tools.`,
  }];
  const state = { optionChosen: false };
  for (let i = 0; i < 5; i++) {
    const msg = await callClaude(ctx.campaign, { messages, tools: TOOLS, effort: "medium", maxTokens: 3000 });
    if (msg.stop_reason === "refusal") return "The DM pauses, then gently steers the story elsewhere. (That request was declined; try a different approach.)";
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !uses.length) return textOf(msg) || "…";
    messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = uses.map((u) => {
      let r: { text: string; isError?: boolean };
      try {
        const input = typeof u.input === "object" && u.input ? (u.input as ToolInput) : {};
        r = runTool(adv, ctx, u.name, input, state);
      } catch (e) {
        r = { text: `Engine error: ${(e as Error).message}`, isError: true };
      }
      return { type: "tool_result", tool_use_id: u.id, content: r.text, is_error: r.isError };
    });
    messages.push({ role: "user", content: results });
    if (adv.status !== "exploring") {
      // story moved into combat or ended: one last narration pass without tools
      const fin = await callClaude(ctx.campaign, { messages, effort: "low", maxTokens: 1200 });
      return textOf(fin) || "";
    }
  }
  return "The moment passes.";
}

/** AI companion chooses what to do in an exploration scene (autonomous play / "let my companion decide"). */
export async function companionDecide(adv: AdventureState, ctx: AdventureContext, companion: CharacterSheet): Promise<{ say: string; optionId?: string }> {
  const msg = await callClaude(ctx.campaign, {
    effort: "low",
    maxTokens: 800,
    messages: [{
      role: "user",
      content: `${sceneContext(adv, ctx)}\n\nYou are now playing the party member ${companion.name} (not the DM). Decide what ${companion.name} does next, true to their personality. Reply with JSON only: {"say": "one or two sentences of in-character speech or action", "option_id": "an AVAILABLE visible option id, or null to just speak"}`,
    }],
  });
  const raw = textOf(msg);
  try {
    const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { say?: string; option_id?: string | null };
    const node = currentNode(adv, ctx);
    const opt = node.options.find((o) => o.id === j.option_id && !o.hidden && optionAvailable(adv, ctx, o).ok);
    return { say: (j.say ?? "").slice(0, 500), optionId: opt?.id };
  } catch {
    return { say: raw.slice(0, 300) };
  }
}

/** AI players respond to a human DM's narration. */
export async function companionsReact(adv: AdventureState, ctx: AdventureContext, companions: CharacterSheet[], dmText: string): Promise<{ id: string; text: string }[]> {
  if (!companions.length) return [];
  const msg = await callClaude(ctx.campaign, {
    effort: "low",
    maxTokens: 1200,
    messages: [{
      role: "user",
      content: `${sceneContext(adv, ctx)}\n\nA human is the DM this time; you are playing the AI party members: ${companions.map((c) => `${c.name} (id ${c.id})`).join(", ")}. The DM just said:\n"""${dmText.slice(0, 2000)}"""\nRespond as those characters: what each says or attempts (declare intent; the DM decides outcomes). Reply with JSON only: [{"id": "...", "text": "..."}] with at most one short entry per character; omit characters who'd stay quiet.`,
    }],
  });
  const raw = textOf(msg);
  try {
    const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)) as { id: string; text: string }[];
    return arr.filter((x) => companions.some((c) => c.id === x.id)).map((x) => ({ id: x.id, text: String(x.text).slice(0, 600) }));
  } catch {
    return [];
  }
}

/** A chronicle entry summarising an adventure (for autonomous parties and the tavern feed). */
export async function chronicle(adv: AdventureState, ctx: AdventureContext): Promise<string> {
  const log = adv.log.filter((l) => l.kind !== "roll").slice(-120).map((l) => l.text).join("\n");
  const msg = await callClaude(ctx.campaign, {
    effort: "low",
    maxTokens: 1000,
    messages: [{ role: "user", content: `Write a short tavern-tale (one paragraph, ~120 words, past tense, as the tavern keeper would tell it) of this adventure in "${ctx.scenario.name}":\n${log}` }],
  });
  return textOf(msg);
}

/** A short ballad about a hero for the Curio Shop's Bard's Ballad. */
export async function writeBallad(campaign: CampaignState, facts: Record<string, unknown>): Promise<string> {
  const msg = await callClaude(campaign, {
    effort: "low",
    maxTokens: 800,
    messages: [{ role: "user", content: `Write a rousing tavern ballad (6-8 short rhyming lines, no title, no commentary) about this adventurer, true to these facts and nothing more:\n${JSON.stringify(facts)}` }],
  });
  if (msg.stop_reason === "refusal") return "";
  return textOf(msg).slice(0, 1200);
}

export function logNarration(adv: AdventureState, text: string, nodeId?: string): LogEntry {
  const e = logEntry("narration", text, undefined, { ai: true, nodeId });
  adv.log.push(e);
  return e;
}

export { itemName };
