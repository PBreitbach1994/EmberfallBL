// Game service: campaign, characters, adventures. Orchestrates the rules engine, the AI DM,
// AI companions and broadcasting. All mutations for an adventure run under a per-adventure lock.
import {
  CLASSES, BACKGROUNDS, SPECIES, MONSTERS, Rng, autoPlayTurn, applyCommand, checkEnd, current, currentNode, enterNode,
  eventOptions, finish, isAiTurn, logEntry, monsterCombatant, optionAvailable, resolveCheck, resolveEvent, scenarioAvailable,
  settleEncounter, startAdventure, visibleOptions, applyEffects, chooseOption, bestRoller, quickBuild, longRest, canLevelUp, levelUp,
  type AdventureAction, type AdventureContext, type AdventureState, type AdventureSummary, type AdventureView, type CampaignState,
  type CharacterSheet, type ClassId, type NewAdventureRequest, type PartyMember, type SceneOption, type EventCard,
} from "@tavern/engine";
import { BUILDINGS, EVENTS, PERSONAL_QUESTS, SCENARIOS } from "@tavern/engine/content";
import { aiAvailable, chronicle, companionDecide, companionsReact, handlePlayerAction, logNarration, narrateScene } from "./dm.js";
import { newId, type Store, type UserRecord } from "./store.js";

export const CAMPAIGN_ID = "emberfall";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const bad = (m: string) => new HttpError(400, m);

type Broadcaster = (adventureId: string, view: (userId: string) => AdventureView) => void;

export class Game {
  private locks = new Map<string, Promise<unknown>>();
  private thinking = new Set<string>();
  private aiRunners = new Set<string>();
  broadcast: Broadcaster = () => {};
  broadcastCampaign: () => void = () => {};

  constructor(public store: Store) {
    this.ensureCampaign();
    this.ensureCompanions();
    // abandoned adventures (no activity for 12h) retreat automatically so shared companions are freed
    setInterval(() => this.sweepStale(), 15 * 60 * 1000).unref();
    this.sweepStale();
    // resume any AI work interrupted by a restart
    for (const a of this.store.adventures.values()) {
      if (a.status === "combat") setTimeout(() => this.kickAi(a.id), 1000);
      if (a.autonomous && (a.status === "combat" || a.status === "exploring")) setTimeout(() => this.runAutonomous(a.id), 1500);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Campaign

  campaign(): CampaignState {
    return this.store.campaigns.get(CAMPAIGN_ID)!;
  }

  private ensureCampaign() {
    if (this.store.campaigns.has(CAMPAIGN_ID)) {
      // make sure newly added content/buildings appear in old saves
      const c = this.store.campaigns.get(CAMPAIGN_ID)!;
      for (const b of Object.values(BUILDINGS)) if (c.buildings[b.id] === undefined) c.buildings[b.id] = b.startingLevel;
      c.settings.difficulty ??= "normal";
      this.store.saveCampaign(c);
      return;
    }
    const rng = new Rng();
    const c: CampaignState = {
      id: CAMPAIGN_ID, name: "The Hollow Crown", createdAt: Date.now(), week: 1, season: "summer", prosperity: 1, reputation: 0, treasury: 50,
      materials: { timber: 2, iron: 0, herbs: 1, relic: 0 },
      buildings: Object.fromEntries(Object.values(BUILDINGS).map((b) => [b.id, b.startingLevel])),
      unlockedScenarios: ["cellar"], completedScenarios: [], failedScenarios: [], flags: [],
      unlockedClasses: ["fighter", "rogue", "cleric", "wizard"],
      roadDeck: rng.shuffle(Object.values(EVENTS).filter((e) => e.deck === "road").map((e) => e.id)),
      townDeck: rng.shuffle(Object.values(EVENTS).filter((e) => e.deck === "town").map((e) => e.id)),
      retired: [], chronicle: [{ week: 1, text: "The Broken Lantern opens its doors to a new company of adventurers." }],
      settings: { difficulty: "normal", hardcore: false, flanking: false, aiDm: true, aiCompanionBanter: true, autoReactions: true, maxPartySize: 6, allowAutonomousParties: true },
    };
    this.store.saveCampaign(c);
  }

  private ensureCompanions() {
    if (this.store.meta.get("companionsSeeded")) return;
    const regulars: [string, ClassId, CharacterSheet["species"], CharacterSheet["background"], string, CharacterSheet["personality"]][] = [
      ["Brakka Ironvein", "fighter", "dwarf", "soldier", "Gruff dwarf veteran; speaks in short barks, secretly sentimental, calls everyone 'recruit'.",
        { traits: "Blunt, protective, hates waste", ideal: "Nobody gets left behind", bond: "Owes her life to her old company", flaw: "Can't refuse a challenge to arm-wrestle" }],
      ["Wren Thistledown", "rogue", "halfling", "criminal", "Cheerful halfling pickpocket with a quip for everything; nervous laughter when scared.",
        { traits: "Curious, light-fingered, chatty", ideal: "Freedom", bond: "Sends coin home to a big family", flaw: "Pockets shiny things without thinking" }],
      ["Sister Amaranth", "cleric", "human", "acolyte", "Calm, wry priestess of the Dawn; speaks gently but has a soldier's dark humour.",
        { traits: "Patient, observant, dry wit", ideal: "Mercy", bond: "Searching for her missing brother", flaw: "Takes on everyone's burdens" }],
      ["Ilsevel Moonquill", "wizard", "elf", "sage", "Precise elven scholar, endlessly curious about the old kingdom; corrects people's pronunciation.",
        { traits: "Pedantic, brave when it matters", ideal: "Knowledge", bond: "Seeks the lost library of the Hollow Crown", flaw: "Underestimates 'lesser' magic" }],
    ];
    for (const [name, cls, sp, bg, persona, personality] of regulars) {
      const s = quickBuild(name, "ai", cls, sp, bg, newId("chr"));
      s.aiPersona = persona;
      s.personality = personality;
      s.personalQuest = { questId: Object.keys(PERSONAL_QUESTS)[Math.floor(Math.random() * Object.keys(PERSONAL_QUESTS).length)], counters: {}, complete: false };
      this.store.saveCharacter(s);
    }
    this.store.saveMeta("companionsSeeded", true);
  }

  sweepStale() {
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    for (const a of this.store.adventures.values()) {
      if ((a.status === "exploring" || a.status === "combat") && a.updatedAt < cutoff && !a.autonomous) {
        void this.withLock(a.id, async () => {
          if (a.encounter) { a.encounter = undefined; a.status = "exploring"; }
          a.log.push(logEntry("system", "The party has been idle too long and makes its way back to Emberfall."));
          finish(a, this.ctx(a), "retreat");
          await this.finalize(a);
          this.save(a);
        });
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // Locks

  private async withLock<T>(id: string, fn: () => Promise<T> | T): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    this.locks.set(id, prev.then(() => next));
    await prev.catch(() => {});
    try { return await fn(); } finally { release(); if (this.locks.get(id) === next) this.locks.delete(id); }
  }

  // ------------------------------------------------------------------------------------------
  // Adventure helpers

  ctx(adv: AdventureState): AdventureContext {
    const scenario = SCENARIOS[adv.scenarioId];
    if (!scenario) throw new HttpError(500, `Missing scenario ${adv.scenarioId}`);
    return { campaign: this.campaign(), scenario, characters: this.store.characters };
  }

  getAdventure(id: string): AdventureState {
    const a = this.store.adventures.get(id);
    if (!a) throw new HttpError(404, "No such adventure.");
    return a;
  }

  private save(adv: AdventureState) {
    adv.updatedAt = Date.now();
    this.store.saveAdventure(adv);
    for (const p of adv.party) { const s = this.store.characters.get(p.characterId); if (s) this.store.saveCharacter(s); }
    this.store.saveCampaign(this.campaign());
  }

  private push(adv: AdventureState) {
    this.save(adv);
    this.broadcast(adv.id, (uid) => this.view(adv, uid));
  }

  view(adv: AdventureState, userId: string): AdventureView {
    const ctx = this.ctx(adv);
    const node = adv.status === "exploring" || adv.status === "combat" || true ? currentNode(adv, ctx) : null;
    const isDm = adv.dmMode === "human" && adv.dmUserId === userId;
    const card = adv.pendingEvent ? EVENTS[adv.pendingEvent] : undefined;
    const users = this.store.users;
    const summary = adv.status === "complete" || adv.status === "failed" || adv.status === "retreated"
      ? { xp: adv.earnedXp, gold: adv.earnedGold, outcome: adv.status === "complete" ? "Victory" : adv.status === "retreated" ? "Retreated" : "Defeat" } : undefined;
    return {
      id: adv.id, title: adv.title, scenarioId: adv.scenarioId, status: adv.status, dmMode: adv.dmMode, hostUserId: adv.hostUserId,
      dmUserId: adv.dmUserId, autonomous: adv.autonomous, openSeats: adv.openSeats, summary,
      event: card ? { id: card.id, title: card.title, text: card.text, options: eventOptions(adv, ctx, card) } : undefined,
      node: node ? {
        id: node.id, title: node.title, narration: adv.narration[node.id] ?? node.text,
        options: adv.pendingEvent ? [] : visibleOptions(adv, ctx), npcs: (node.npcs ?? []).map((n) => ({ name: n.name, role: n.role })),
      } : null,
      dmInfo: isDm && node ? {
        dmNotes: node.dmNotes,
        hiddenOptions: node.options.filter((o) => o.hidden).map((o) => ({ id: o.id, label: o.label, available: optionAvailable(adv, ctx, o).ok })),
        nodes: Object.values(ctx.scenario.nodes).map((n) => ({ id: n.id, title: n.title })),
        npcs: (node.npcs ?? []).map((n) => ({ name: n.name, role: n.role, personality: n.personality, secrets: n.secrets })),
      } : undefined,
      party: adv.party.map((p) => {
        const s = this.store.characters.get(p.characterId)!;
        const c = adv.encounter?.combatants.find((x) => x.characterId === p.characterId);
        return {
          characterId: p.characterId, name: s.name, classId: s.classId, species: SPECIES[s.species].name, level: s.level,
          hp: c ? c.hp : s.hp, maxHp: c ? c.maxHp : s.maxHp, ac: c?.ac ?? 10, controller: p.controller.kind === "human" ? "human" : "ai-player",
          userId: p.userId, userName: users.get(p.userId)?.name ?? (p.userId === "ai" ? "AI" : "?"), dead: s.dead || !!c?.dead,
          conditions: c ? c.conditions : s.conditions,
        };
      }),
      encounter: adv.encounter,
      log: adv.log.slice(-300),
      thinking: this.thinking.has(adv.id),
    };
  }

  summaries(): AdventureSummary[] {
    return [...this.store.adventures.values()]
      .filter((a) => a.status === "exploring" || a.status === "combat" || Date.now() - a.updatedAt < 1000 * 60 * 60 * 24)
      .sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)
      .map((a) => ({
        id: a.id, title: a.title, status: a.status, dmMode: a.dmMode, openSeats: a.openSeats, autonomous: a.autonomous, updatedAt: a.updatedAt,
        hostName: this.store.users.get(a.hostUserId)?.name ?? "AI",
        party: a.party.map((p) => { const s = this.store.characters.get(p.characterId)!; return { name: s?.name ?? "?", classId: s?.classId ?? "fighter", level: s?.level ?? 1, controller: p.controller.kind === "human" ? "human" as const : "ai-player" as const }; }),
      }));
  }

  // ------------------------------------------------------------------------------------------
  // Starting adventures

  async createAdventure(user: UserRecord, req: NewAdventureRequest): Promise<AdventureState> {
    const scenario = SCENARIOS[req.scenarioId];
    if (!scenario) throw bad("Unknown scenario.");
    const campaign = this.campaign();
    const avail = scenarioAvailable(campaign, scenario);
    if (!avail.ok) throw bad(avail.reason ?? "Scenario unavailable.");
    const ids = [...new Set([...(req.characterIds ?? []), ...(req.companionIds ?? [])])];
    if (!ids.length) throw bad("Bring at least one character.");
    if (ids.length > campaign.settings.maxPartySize) throw bad(`A party has at most ${campaign.settings.maxPartySize} members.`);
    const party: PartyMember[] = [];
    for (const id of ids) {
      const s = this.store.characters.get(id);
      if (!s) throw bad("Unknown character.");
      if (s.dead) throw bad(`${s.name} is dead.`);
      if (s.retired) throw bad(`${s.name} has retired.`);
      if (s.activeAdventureId && this.isActive(s.activeAdventureId)) throw bad(`${s.name} is already on an adventure.`);
      const asHuman = (req.characterIds ?? []).includes(id) && !req.autonomous;
      if (asHuman && s.ownerId !== user.id) throw bad(`${s.name} isn't yours to play.`);
      if (!asHuman && s.ownerId !== "ai" && s.ownerId !== user.id) throw bad(`${s.name} belongs to another player.`);
      party.push({ characterId: id, controller: asHuman ? { kind: "human", userId: user.id } : { kind: "ai-player", persona: s.aiPersona }, userId: asHuman ? user.id : "ai" });
    }
    const wantsAi = req.dmMode === "ai";
    if (wantsAi && !aiAvailable()) throw bad("The AI DM needs an ANTHROPIC_API_KEY on the server. Choose the Scripted DM instead.");
    if (req.autonomous && !campaign.settings.allowAutonomousParties) throw bad("Autonomous parties are disabled.");
    if (req.autonomous && party.some((p) => p.controller.kind === "human")) throw bad("Autonomous parties are AI-only.");
    const adv = startAdventure(newId("adv"), { campaign, scenario, characters: this.store.characters }, party, {
      dmMode: req.autonomous ? (aiAvailable() ? "ai" : "scripted") : req.dmMode, hostUserId: user.id, dmUserId: req.dmMode === "human" ? user.id : undefined, autonomous: req.autonomous,
    });
    adv.openSeats = Math.max(0, Math.min(4, req.openSeats ?? 0));
    for (const p of party) { const s = this.store.characters.get(p.characterId)!; s.activeAdventureId = adv.id; }
    // Frosthaven-style road event on the way (the tutorial starts in the tavern itself)
    if (scenario.id !== "cellar") adv.pendingEvent = this.drawRoadEvent();
    if (adv.pendingEvent) {
      const card = EVENTS[adv.pendingEvent];
      adv.log.push(logEntry("system", `🛤 On the road: ${card.title}`));
      adv.log.push(logEntry("narration", card.text, undefined, { authored: true }));
    }
    this.store.saveAdventure(adv);
    await this.afterChange(adv, { prevNode: undefined, prevStatus: "exploring", announceNode: !adv.pendingEvent });
    this.save(adv);
    if (adv.autonomous) setTimeout(() => this.runAutonomous(adv.id), 500);
    this.broadcastCampaign();
    return adv;
  }

  private isActive(id: string) {
    const a = this.store.adventures.get(id);
    return !!a && (a.status === "exploring" || a.status === "combat");
  }

  private drawRoadEvent(): string | undefined {
    const c = this.campaign();
    if (!c.roadDeck.length) c.roadDeck = new Rng().shuffle(Object.values(EVENTS).filter((e) => e.deck === "road").map((e) => e.id));
    for (let i = 0; i < c.roadDeck.length; i++) {
      const card = EVENTS[c.roadDeck[i]];
      if (card && (!card.season || card.season === c.season)) { c.roadDeck.splice(i, 1); return card.id; }
    }
    return c.roadDeck.shift();
  }

  async join(user: UserRecord, advId: string, characterId: string) {
    return this.withLock(advId, async () => {
      const adv = this.getAdventure(advId);
      if (!this.isActive(adv.id)) throw bad("That adventure is over.");
      if (adv.openSeats <= 0) throw bad("No open seats.");
      const s = this.store.characters.get(characterId);
      if (!s || s.ownerId !== user.id) throw bad("Choose one of your characters.");
      if (s.dead || s.retired) throw bad(`${s.name} can't adventure.`);
      if (s.activeAdventureId && this.isActive(s.activeAdventureId)) throw bad(`${s.name} is already on an adventure.`);
      if (adv.party.length >= this.campaign().settings.maxPartySize) throw bad("The party is full.");
      adv.party.push({ characterId, controller: { kind: "human", userId: user.id }, userId: user.id });
      adv.openSeats--;
      s.activeAdventureId = adv.id;
      adv.log.push(logEntry("system", `${s.name} (${user.name}) joins the party.`, s.id));
      if (adv.encounter) adv.log.push(logEntry("system", `${s.name} will join after this fight.`, s.id));
      this.push(adv);
      return adv;
    });
  }

  // ------------------------------------------------------------------------------------------
  // Actions

  async act(user: UserRecord, advId: string, characterId: string | undefined, action: AdventureAction): Promise<AdventureState> {
    return this.withLock(advId, async () => {
      const adv = this.getAdventure(advId);
      const ctx = this.ctx(adv);
      const member = characterId ? adv.party.find((p) => p.characterId === characterId) : undefined;
      const isDm = adv.dmMode === "human" && adv.dmUserId === user.id;
      const controls = (m?: PartyMember) => !!m && m.controller.kind === "human" && m.controller.userId === user.id;
      const inParty = adv.party.some((p) => p.userId === user.id);
      const prevNode = adv.nodeId;
      const prevStatus = adv.status;
      if (!this.isActive(adv.id) && !action.kind.startsWith("dm")) throw bad("This adventure is over.");
      if (this.thinking.has(adv.id) && (action.kind === "say" || action.kind === "choose")) throw bad("The DM is still speaking…");

      switch (action.kind) {
        case "event": {
          if (!adv.pendingEvent) throw bad("No event to resolve.");
          if (!inParty && !isDm) throw bad("Only party members can choose.");
          const card = EVENTS[adv.pendingEvent];
          const r = resolveEvent(adv, ctx, card, action.optionId, characterId);
          if (!r.ok) throw bad(r.error ?? "Can't do that.");
          await this.afterChange(adv, { prevNode: undefined, prevStatus, announceNode: true });
          break;
        }
        case "choose": {
          if (adv.pendingEvent) throw bad("Resolve the road event first.");
          if (!inParty && !isDm) throw bad("Only party members can choose.");
          if (adv.dmMode === "human" && !isDm) {
            // with a human DM, players propose; the DM resolves
            const s = characterId ? this.store.characters.get(characterId) : undefined;
            const opt = currentNode(adv, ctx).options.find((o) => o.id === action.optionId);
            adv.log.push(logEntry("dialogue", `${s?.name ?? user.name} wants to: ${opt?.label ?? action.optionId}`, characterId));
            break;
          }
          const r = chooseOption(adv, ctx, action.optionId, characterId);
          if (!r.ok) throw bad(r.error ?? "Can't do that.");
          await this.afterChange(adv, { prevNode, prevStatus });
          break;
        }
        case "say": {
          const text = action.text.trim().slice(0, 1500);
          if (!text) throw bad("Say something.");
          const s = characterId ? this.store.characters.get(characterId) : undefined;
          if (!s || !controls(member)) throw bad("Speak as one of your characters in this party.");
          adv.log.push(logEntry("dialogue", `${s.name}: ${text}`, s.id));
          if (adv.dmMode === "ai" && adv.status === "exploring" && !adv.pendingEvent) {
            this.thinking.add(adv.id);
            this.push(adv);
            try {
              const narration = await handlePlayerAction(adv, ctx, s, text);
              if (narration) logNarration(adv, narration);
            } catch (e) {
              adv.log.push(logEntry("system", `(The AI DM stumbled: ${(e as Error).message}. Pick an option or try again.)`));
            } finally {
              this.thinking.delete(adv.id);
            }
            await this.afterChange(adv, { prevNode, prevStatus });
          } else if (adv.dmMode === "scripted" && adv.status === "exploring") {
            adv.log.push(logEntry("system", "(Scripted DM: free-form actions are logged for flavour; choose an option to act.)"));
          }
          break;
        }
        case "combat": {
          const enc = adv.encounter;
          if (!enc) throw bad("Not in combat.");
          const cur = current(enc);
          const m = adv.party.find((p) => cur.characterId && p.characterId === cur.characterId);
          if (!(m && controls(m)) && !(isDm && cur.controller.kind === "monster")) throw bad(`It's ${cur.name}'s turn.`);
          const r = applyCommand(enc, cur.id, action.command);
          if (!r.ok) throw bad(r.error ?? "Illegal action.");
          this.afterCombatStep(adv);
          await this.afterChange(adv, { prevNode, prevStatus });
          setTimeout(() => this.kickAi(adv.id), 50);
          break;
        }
        case "autoTurn": {
          const enc = adv.encounter;
          if (!enc) throw bad("Not in combat.");
          const cur = current(enc);
          const m = adv.party.find((p) => cur.characterId && p.characterId === cur.characterId);
          if (!controls(m) && !isDm) throw bad("Not your turn.");
          autoPlayTurn(enc);
          this.afterCombatStep(adv);
          await this.afterChange(adv, { prevNode, prevStatus });
          setTimeout(() => this.kickAi(adv.id), 50);
          break;
        }
        case "takeOver": {
          const m = adv.party.find((p) => p.characterId === action.characterId);
          if (!m) throw bad("Not in this party.");
          if (m.controller.kind === "human" && m.controller.userId !== user.id) throw bad("Another player controls that character.");
          if (!inParty && adv.openSeats <= 0 && m.userId !== user.id) throw bad("Join the party first.");
          const s = this.store.characters.get(m.characterId)!;
          if (s.ownerId !== "ai" && s.ownerId !== user.id) throw bad("That character belongs to someone else.");
          m.controller = { kind: "human", userId: user.id };
          m.userId = user.id;
          const c = adv.encounter?.combatants.find((x) => x.characterId === m.characterId);
          if (c) c.controller = m.controller;
          adv.log.push(logEntry("system", `${user.name} takes control of ${s.name}.`));
          break;
        }
        case "release": {
          const m = adv.party.find((p) => p.characterId === action.characterId);
          if (!m || !controls(m)) throw bad("You don't control that character.");
          const s = this.store.characters.get(m.characterId)!;
          m.controller = { kind: "ai-player", persona: s.aiPersona };
          const c = adv.encounter?.combatants.find((x) => x.characterId === m.characterId);
          if (c) c.controller = m.controller;
          adv.log.push(logEntry("system", `${s.name} is now played by the AI.`));
          setTimeout(() => this.kickAi(adv.id), 50);
          break;
        }
        case "retreat": {
          if (adv.hostUserId !== user.id && !isDm) throw bad("Only the host can call a retreat.");
          if (adv.encounter) { adv.encounter.status = "fled"; adv.encounter = undefined; adv.status = "exploring"; }
          finish(adv, ctx, "retreat");
          await this.afterChange(adv, { prevNode, prevStatus });
          break;
        }
        // ----- human DM tools
        case "dmNarrate": {
          if (!isDm) throw bad("Only the DM can do that.");
          logNarration(adv, action.text.slice(0, 4000));
          const companions = adv.party.filter((p) => p.controller.kind === "ai-player").map((p) => this.store.characters.get(p.characterId)!).filter(Boolean);
          if (companions.length && aiAvailable()) {
            this.thinking.add(adv.id); this.push(adv);
            try {
              for (const r of await companionsReact(adv, ctx, companions, action.text)) {
                const s = this.store.characters.get(r.id)!;
                adv.log.push(logEntry("dialogue", `${s.name}: ${r.text}`, s.id));
              }
            } catch { /* companions stay quiet */ } finally { this.thinking.delete(adv.id); }
          }
          break;
        }
        case "dmGoto": {
          if (!isDm) throw bad("Only the DM can do that.");
          if (!ctx.scenario.nodes[action.nodeId]) throw bad("Unknown scene.");
          if (adv.encounter) throw bad("End the fight first.");
          enterNode(adv, ctx, action.nodeId);
          await this.afterChange(adv, { prevNode, prevStatus });
          break;
        }
        case "dmCheck": {
          if (!isDm) throw bad("Only the DM can do that.");
          const who = action.who === "group" ? "group" : action.who === "best" ? "best" : "actor";
          resolveCheck(adv, ctx, { skill: action.skill, ability: action.ability, dc: Math.max(5, Math.min(30, action.dc)), who }, who === "actor" ? action.who : undefined, action.reason);
          break;
        }
        case "dmAward": {
          if (!isDm) throw bad("Only the DM can do that.");
          const eff = [];
          if (action.gold) eff.push({ kind: "gold" as const, amount: Math.max(-1000, Math.min(1000, action.gold)) });
          if (action.xp) eff.push({ kind: "xp" as const, amount: Math.max(0, Math.min(5000, action.xp)) });
          if (action.itemId) eff.push({ kind: "item" as const, itemId: action.itemId });
          applyEffects(adv, ctx, eff, action.characterId);
          break;
        }
        case "dmChooseFor": {
          if (!isDm) throw bad("Only the DM can do that.");
          const r = chooseOption(adv, ctx, action.optionId, action.characterId);
          if (!r.ok) throw bad(r.error ?? "Can't.");
          await this.afterChange(adv, { prevNode, prevStatus });
          break;
        }
        case "dmSpawn": {
          if (!isDm) throw bad("Only the DM can do that.");
          const enc = adv.encounter;
          const md = MONSTERS[action.monsterId];
          if (!enc || !md) throw bad("Spawn monsters during a fight.");
          const c = monsterCombatant(md, newId("m"), action.at, new Rng());
          c.initiative = 0;
          enc.combatants.push(c);
          enc.order.push(c.id);
          enc.xpPool += md.xp;
          enc.log.push(logEntry("system", `A ${md.name} joins the fray!`));
          break;
        }
        case "dmEnd": {
          if (!isDm) throw bad("Only the DM can do that.");
          if (adv.encounter) { adv.encounter = undefined; adv.status = "exploring"; }
          finish(adv, ctx, action.outcome);
          await this.afterChange(adv, { prevNode, prevStatus });
          break;
        }
        default:
          throw bad("Unknown action.");
      }
      this.push(adv);
      return adv;
    });
  }

  private afterCombatStep(adv: AdventureState) {
    const enc = adv.encounter;
    if (!enc) return;
    checkEnd(enc);
    if (enc.status !== "active") settleEncounter(adv, this.ctx(adv));
  }

  /** Narrate new scenes, kick off AI turns, and finalise ended scenarios. */
  private async afterChange(adv: AdventureState, o: { prevNode?: string; prevStatus: AdventureState["status"]; announceNode?: boolean }) {
    const ctx = this.ctx(adv);
    const nodeChanged = o.announceNode || (o.prevNode !== undefined && o.prevNode !== adv.nodeId);
    if (nodeChanged && !adv.pendingEvent) {
      const node = currentNode(adv, ctx);
      if (adv.dmMode === "ai" && !adv.narration[node.id]) {
        this.thinking.add(adv.id);
        this.broadcast(adv.id, (uid) => this.view(adv, uid));
        try {
          const text = await narrateScene(adv, ctx, node);
          adv.narration[node.id] = text;
          logNarration(adv, text, node.id);
        } catch (e) {
          adv.log.push(logEntry("narration", node.text, undefined, { authored: true, nodeId: node.id }));
          adv.log.push(logEntry("system", `(AI narration unavailable: ${(e as Error).message})`));
        } finally {
          this.thinking.delete(adv.id);
        }
      } else if (!adv.narration[node.id] || adv.dmMode !== "ai") {
        adv.log.push(logEntry("narration", node.text, undefined, { authored: true, nodeId: node.id }));
      }
    }
    if (adv.status === "combat") setTimeout(() => this.kickAi(adv.id), 300);
    if ((adv.status === "complete" || adv.status === "failed" || adv.status === "retreated") && o.prevStatus !== adv.status) await this.finalize(adv);
  }

  private async finalize(adv: AdventureState) {
    const c = this.campaign();
    for (const p of adv.party) {
      const s = this.store.characters.get(p.characterId);
      if (!s) continue;
      s.activeAdventureId = undefined;
      if (s.dead && s.diedWeek === undefined) s.diedWeek = c.week;
      // tavern companions belong to no one: they recover and train between jobs
      if (s.ownerId === "ai" && !s.dead) {
        longRest(s);
        while (canLevelUp(s)) { const notes = levelUp(s); adv.log.push(logEntry("level", `⬆ ${notes[0]}`, s.id)); }
      }
      this.checkQuest(s, adv);
      this.store.saveCharacter(s);
    }
    if (adv.autonomous && aiAvailable()) {
      try {
        const tale = await chronicle(adv, this.ctx(adv));
        if (tale) { c.chronicle.push({ week: c.week, text: tale }); adv.log.push(logEntry("narration", `📖 ${tale}`)); }
      } catch { /* optional */ }
    }
    this.store.saveCampaign(c);
    this.broadcastCampaign();
  }

  checkQuest(s: CharacterSheet, adv?: AdventureState) {
    const pq = s.personalQuest;
    if (!pq || pq.complete) return;
    const q = PERSONAL_QUESTS[pq.questId];
    if (!q) return;
    pq.counters.goldEarned = s.stats.goldEarned;
    const done = Object.entries(q.goals).every(([k, v]) => (pq.counters[k] ?? 0) >= v);
    if (done) {
      pq.complete = true;
      adv?.log.push(logEntry("level", `🌟 ${s.name} has fulfilled their personal quest "${q.name}"! They may retire at the tavern.`, s.id));
    }
  }

  // ------------------------------------------------------------------------------------------
  // AI-driven turns

  async kickAi(advId: string) {
    if (this.aiRunners.has(advId)) return;
    this.aiRunners.add(advId);
    try {
      for (let guard = 0; guard < 200; guard++) {
        const done = await this.withLock(advId, async () => {
          const adv = this.store.adventures.get(advId);
          const enc = adv?.encounter;
          if (!adv || !enc || enc.status !== "active") return true;
          if (!isAiTurn(enc)) return true;
          const cur = current(enc);
          // a human DM may run monsters manually; give them the turn
          if (adv.dmMode === "human" && cur.controller.kind === "monster" && adv.dmUserId && !adv.autonomous && process.env.HUMAN_DM_AUTOMONSTERS === "0") return true;
          const prevStatus = adv.status;
          const prevNode = adv.nodeId;
          autoPlayTurn(enc);
          this.afterCombatStep(adv);
          await this.afterChange(adv, { prevNode, prevStatus });
          this.push(adv);
          return !adv.encounter;
        });
        if (done) break;
        await new Promise((r) => setTimeout(r, 700));
      }
    } finally {
      this.aiRunners.delete(advId);
    }
  }

  /** AI-only parties play the whole scenario by themselves. */
  async runAutonomous(advId: string) {
    const key = `auto:${advId}`;
    if (this.aiRunners.has(key)) return;
    this.aiRunners.add(key);
    try {
      for (let step = 0; step < 80; step++) {
        const adv = this.store.adventures.get(advId);
        if (!adv || !this.isActive(advId)) break;
        if (adv.status === "combat") { await this.kickAi(advId); await sleep(500); continue; }
        await this.withLock(advId, async () => {
          const ctx = this.ctx(adv);
          const prevNode = adv.nodeId, prevStatus = adv.status;
          if (adv.pendingEvent) {
            const card = EVENTS[adv.pendingEvent];
            const pick = this.heuristicOption(adv, ctx, card.options);
            resolveEvent(adv, ctx, card, pick?.id ?? card.options[0].id);
            await this.afterChange(adv, { prevNode: undefined, prevStatus, announceNode: true });
          } else {
            const companions = adv.party.map((p) => this.store.characters.get(p.characterId)!).filter((s) => s && !s.dead);
            const speaker = companions[step % Math.max(1, companions.length)];
            let optionId: string | undefined;
            if (aiAvailable() && speaker) {
              try {
                const d = await companionDecide(adv, ctx, speaker);
                if (d.say) adv.log.push(logEntry("dialogue", `${speaker.name}: ${d.say}`, speaker.id));
                optionId = d.optionId;
              } catch { /* fall back to heuristic */ }
            }
            const node = currentNode(adv, ctx);
            if (!optionId) optionId = this.heuristicOption(adv, ctx, node.options)?.id;
            if (!optionId) { finish(adv, ctx, "retreat"); }
            else {
              const actor = speaker && node.options.find((o) => o.id === optionId)?.check ? bestRoller(adv, ctx, node.options.find((o) => o.id === optionId)!.check!)?.id : speaker?.id;
              chooseOption(adv, ctx, optionId, actor);
            }
            await this.afterChange(adv, { prevNode, prevStatus });
          }
          this.push(adv);
        });
        await sleep(aiAvailable() ? 1200 : 600);
      }
    } finally {
      this.aiRunners.delete(key);
    }
  }

  private heuristicOption(adv: AdventureState, ctx: AdventureContext, options: SceneOption[]): SceneOption | undefined {
    const avail = options.filter((o) => !o.hidden && optionAvailable(adv, ctx, o).ok);
    const usedCount = (o: SceneOption) => adv.usedOptions.filter((u) => u === `${adv.nodeId}:${o.id}`).length;
    const score = (o: SceneOption) => {
      let s = -usedCount(o) * 10;
      if (o.check) {
        const who = bestRoller(adv, ctx, o.check);
        const bonus = who ? Math.floor(((o.check.skill ? who.abilities[skillAbility(o.check.skill)] : who.abilities[o.check.ability ?? "str"]) - 10) / 2) + (o.check.skill && who.skillProficiencies.includes(o.check.skill) ? 2 : 0) : 0;
        s += (bonus + 10.5 - o.check.dc) * 0.5;
      } else s += 1;
      if (o.success.goto) s += 0.5;
      return s + Math.random() * 0.5;
    };
    return avail.sort((a, b) => score(b) - score(a))[0];
  }
}

import { SKILL_ABILITY } from "@tavern/engine";
const skillAbility = (s: keyof typeof SKILL_ABILITY) => SKILL_ABILITY[s];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type { EventCard };
export { CLASSES, BACKGROUNDS };
