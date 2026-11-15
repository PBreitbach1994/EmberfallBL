// Town of Emberfall: buildings, shops and services, plus character management between adventures.
import {
  ARMOR, CLASSES, GEAR, WEAPONS, canLevelUp, createCharacter, itemCost, itemName, levelUp, longRest, quickBuild,
  recalcDerived, shortRest, Rng, rollAbilityScores, SPELLS, logEntry,
  type CampaignView, type CharacterSheet, type ClassId, type CreateCharacterRequest, type ShopItem, type LevelUpRequest,
} from "@tavern/engine";
import { BUILDINGS, PERSONAL_QUESTS, SCENARIOS, WORLD } from "@tavern/engine/content";
import { scenarioAvailable, EMBER_RULES, RAISE_DEAD_DAYS, daysDead, graveMarks, raiseDeadCost, resurrectionCost, reviveSheet } from "@tavern/engine";
import { HttpError, type Game } from "./game.js";
import { aiAvailable } from "./dm.js";
import { publicCampaign, roleIn } from "./campaigns.js";
import { newId, type UserRecord } from "./store.js";
import crypto from "node:crypto";

const bad = (m: string) => new HttpError(400, m);

export class Town {
  private rollTokens = new Map<string, { userId: string; scores: number[]; at: number }>();
  constructor(private game: Game) {}

  private get store() { return this.game.store; }
  private get campaign() { return this.game.campaign(); }

  services(): string[] {
    const out: string[] = [];
    for (const [id, lvl] of Object.entries(this.campaign.buildings)) {
      const def = BUILDINGS[id];
      if (!def) continue;
      for (let i = 0; i < lvl && i < def.levels.length; i++) out.push(...def.levels[i].unlocks);
    }
    return out;
  }

  maxCompanions(): number {
    return (this.campaign.buildings.tavern ?? 1) + 2;
  }

  shop(): ShopItem[] {
    const sv = new Set(this.services());
    const items: ShopItem[] = [];
    const add = (itemId: string, kind: string, description: string, requires?: string) =>
      items.push({ itemId, name: itemName(itemId), price: itemCost(itemId), kind, description, requires });
    for (const id of ["torch", "rope", "rations", "arrows", "bolts", "healersKit", "potionHealing", "thievesTools", "holySymbol", "arcaneFocus", "spellbook"])
      add(id, "gear", GEAR[id].description);
    if (sv.has("shop:weapons1")) for (const w of Object.values(WEAPONS)) add(w.id, "weapon", `${w.category} ${w.kind}, ${w.damage} ${w.damageType}${w.properties.length ? `, ${w.properties.join(", ")}` : ""}; mastery: ${w.mastery}`);
    for (const a of Object.values(ARMOR)) {
      const tier2 = a.category === "heavy" || a.baseAc >= 15;
      if ((sv.has("shop:armor1") && !tier2) || (sv.has("shop:armor2") && tier2))
        add(a.id, "armor", `${a.category} armor, AC ${a.baseAc}${a.category === "shield" ? " bonus" : ""}${a.dexCap === undefined ? " + Dex" : a.dexCap ? ` + Dex (max ${a.dexCap})` : ""}${a.strReq ? `, Str ${a.strReq}` : ""}`);
    }
    if (sv.has("shop:potions")) for (const id of ["antitoxin", "alchemistsFire", "holyWater"]) add(id, "consumable", GEAR[id].description);
    if (sv.has("shop:greaterPotions")) add("potionGreaterHealing", "consumable", GEAR.potionGreaterHealing.description);
    if (sv.has("service:raiseDead")) { add("diamond300", "treasure", GEAR.diamond300.description); add("diamond500", "treasure", GEAR.diamond500.description); }
    // World Workshop items marked "for sale" in this campaign (or everywhere)
    for (const r of this.game.content.forCampaign(this.campaign)) if (r.kind === "item" && r.forSale) items.push({ itemId: r.id, name: r.name, price: Number(r.data.cost) || 0, kind: String(r.data.kind ?? "gear"), description: String(r.data.description ?? "") });
    return items;
  }

  view(viewer?: UserRecord): CampaignView {
    const c = this.campaign;
    return {
      campaign: publicCampaign(c),
      scenarios: Object.values(SCENARIOS).filter((s) => this.game.content.visibleId(s.id, c) && (c.unlockedScenarios.includes(s.id) || (s.requires?.scenarios ?? []).some((x) => c.completedScenarios.includes(x)))).map((s) => {
        const a = scenarioAvailable(c, s);
        return { id: s.id, name: s.name, hook: s.hook, summary: s.summary, location: s.location, recommendedLevel: s.recommendedLevel, available: a.ok, reason: a.reason, completed: c.completedScenarios.includes(s.id), mapPosition: s.mapPosition, arc: s.arc };
      }),
      buildings: Object.values(BUILDINGS).map((def) => {
        const level = c.buildings[def.id] ?? 0;
        const next = def.levels[level];
        return { def, level, canUpgrade: !!next && this.affordable(next.cost), nextCost: next?.cost };
      }),
      shop: this.shop(),
      services: this.services(),
      adventures: this.game.summaries(),
      world: { name: WORLD.name, tavern: WORLD.tavern.name, overview: WORLD.overview.join("\n\n"), keeper: { name: WORLD.proprietor.name, description: WORLD.proprietor.personality } },
      aiAvailable: aiAvailable(c),
      role: viewer ? roleIn(c, viewer) ?? undefined : undefined,
    };
  }

  private affordable(cost: { gold: number; timber?: number; iron?: number; herbs?: number; relic?: number }) {
    const c = this.campaign;
    return c.treasury >= cost.gold && (["timber", "iron", "herbs", "relic"] as const).every((k) => (c.materials[k] ?? 0) >= (cost[k] ?? 0));
  }

  build(buildingId: string): string {
    const c = this.campaign;
    const def = BUILDINGS[buildingId];
    if (!def) throw bad("Unknown building.");
    const level = c.buildings[buildingId] ?? 0;
    const next = def.levels[level];
    if (!next) throw bad(`${def.name} is fully upgraded.`);
    if (!this.affordable(next.cost)) throw bad(`Not enough in the town treasury and stores (need ${next.cost.gold} gp${(["timber", "iron", "herbs", "relic"] as const).filter((k) => next.cost[k]).map((k) => `, ${next.cost[k]} ${k}`).join("")}). Donate gold at the tavern to fill the treasury.`);
    c.treasury -= next.cost.gold;
    for (const k of ["timber", "iron", "herbs", "relic"] as const) c.materials[k] -= next.cost[k] ?? 0;
    c.buildings[buildingId] = level + 1;
    c.prosperity += 1;
    const msg = `${def.name} ${level === 0 ? "is built" : `is upgraded to level ${level + 1}`}: ${next.description}`;
    c.chronicle.push({ week: c.week, text: msg });
    this.store.saveCampaign(c);
    return msg;
  }

  private mine(user: UserRecord, characterId: string): CharacterSheet {
    const s = this.store.characters.get(characterId);
    if (!s) throw new HttpError(404, "No such character.");
    if (s.ownerId !== user.id && !(s.ownerId === "ai" && user.isAdmin)) throw new HttpError(403, "That isn't your character.");
    if (s.activeAdventureId && this.isActive(s.activeAdventureId)) throw bad(`${s.name} is away on an adventure.`);
    return s;
  }
  private isActive(id: string) {
    const a = this.store.adventures.get(id);
    return !!a && (a.status === "exploring" || a.status === "combat");
  }

  buy(user: UserRecord, characterId: string, itemId: string): string {
    const s = this.mine(user, characterId);
    const item = this.shop().find((i) => i.itemId === itemId);
    if (!item) throw bad("Not for sale in Emberfall (yet).");
    if (s.gold < item.price) throw bad(`${s.name} can't afford ${item.name} (${item.price} gp).`);
    s.gold = Math.round((s.gold - item.price) * 100) / 100;
    const inv = s.inventory.find((i) => i.itemId === itemId);
    if (inv) inv.qty++; else s.inventory.push({ itemId, qty: 1 });
    this.store.saveCharacter(s);
    return `${s.name} buys ${item.name} for ${item.price} gp.`;
  }

  sell(user: UserRecord, characterId: string, itemId: string): string {
    const s = this.mine(user, characterId);
    const inv = s.inventory.find((i) => i.itemId === itemId && i.qty > 0);
    if (!inv) throw bad("Not in inventory.");
    const price = Math.floor(itemCost(itemId) / 2 * 100) / 100;
    inv.qty--;
    if (inv.qty <= 0) s.inventory = s.inventory.filter((i) => i !== inv);
    s.gold += price;
    this.store.saveCharacter(s);
    return `${s.name} sells ${itemName(itemId)} for ${price} gp.`;
  }

  donate(user: UserRecord, characterId: string, amount: number): string {
    const s = this.mine(user, characterId);
    const amt = Math.floor(amount);
    if (!(amt > 0) || amt > s.gold) throw bad("Invalid amount.");
    s.gold -= amt;
    this.campaign.treasury += amt;
    if (s.personalQuest && !s.personalQuest.complete) s.personalQuest.counters.donated = (s.personalQuest.counters.donated ?? 0) + amt;
    this.game.checkQuest(s);
    this.store.saveCharacter(s);
    this.store.saveCampaign(this.campaign);
    return `${s.name} donates ${amt} gp to the Emberfall treasury.`;
  }

  /** Temple services for the dead: Raise Dead (temple 2, 14-day window) or Resurrection (temple 3, no limit). */
  raiseDead(user: UserRecord, characterId: string, rite: "raise" | "resurrect" = "raise"): string {
    const s = this.store.characters.get(characterId);
    if (!s) throw new HttpError(404, "No such character.");
    if (s.ownerId !== user.id && s.ownerId !== "ai") throw new HttpError(403, "Not your character.");
    if (!s.dead) throw bad(`${s.name} isn't dead.`);
    if (this.campaign.settings.hardcore || s.hardcore) throw bad("Hardcore mode: death is final. Honour them on the tavern wall.");
    if (!s.diedAt) { s.diedAt = Date.now(); this.store.saveCharacter(s); } // heroes who died before the window was tracked get a fresh one
    const resurrect = rite === "resurrect";
    if (resurrect && !this.services().includes("service:resurrection")) throw bad("Only a level 3 temple can perform Resurrection.");
    if (!resurrect && !this.services().includes("service:raiseDead")) throw bad("The temple must be upgraded to perform Raise Dead.");
    if (!resurrect && daysDead(s) > RAISE_DEAD_DAYS) throw bad(`${s.name} has been dead more than ${RAISE_DEAD_DAYS} days — only Resurrection (temple level 3) can bring them back now.`);
    const cost = resurrect ? resurrectionCost(s) : raiseDeadCost(s);
    // payment: the character's own gold, then the player's other living heroes
    const payers = [s, ...[...this.store.characters.values()].filter((x) => x.ownerId === user.id && x.id !== s.id && !x.dead)];
    const total = payers.reduce((n, p) => n + p.gold, 0);
    const why = s.deathCount ? ` (${resurrect ? 1000 : 500} gp, +${resurrect ? 500 : 250} for each of ${s.name}'s ${s.deathCount} earlier death${s.deathCount === 1 ? "" : "s"})` : "";
    if (total < cost) throw bad(`${resurrect ? "Resurrection" : "Raise Dead"} costs ${cost} gp${why}. Your heroes have ${Math.floor(total)} gp between them.`);
    let owed = cost;
    for (const p of payers) { const pay = Math.min(p.gold, owed); p.gold -= pay; owed -= pay; this.store.saveCharacter(p); if (!owed) break; }
    reviveSheet(s, resurrect ? { exhaustion: 0, fullHp: true } : { exhaustion: 2 });
    this.store.saveCharacter(s);
    this.campaign.chronicle.push({ week: this.campaign.week, text: `${s.name} was ${resurrect ? "resurrected" : "raised from death"} at the Temple of the Dawnfather${s.deathCount > 1 ? ` — their ${ordinal(s.deathCount)} return from the grave` : ""}.` });
    this.store.saveCampaign(this.campaign);
    const mark = ` They carry the mark of the grave: −${graveMarks(s)} to death saving throws.`;
    return resurrect
      ? `${s.name} rises whole and hale, light pouring from their eyes. (Full HP.)${mark}`
      : `${s.name} draws a ragged breath and opens their eyes. (1 HP, 2 levels of exhaustion that fade with long rests.)${mark}`;
  }

  // ------------------------------------------------------------------------------------------
  // Characters

  rollScores(user: UserRecord) {
    const scores = rollAbilityScores(new Rng(crypto.randomInt(2 ** 31)));
    const rollToken = crypto.randomBytes(12).toString("hex");
    this.rollTokens.set(rollToken, { userId: user.id, scores, at: Date.now() });
    return { scores, rollToken };
  }

  drawQuests() {
    const ids = new Rng(crypto.randomInt(2 ** 31)).shuffle(Object.keys(PERSONAL_QUESTS)).slice(0, 2);
    return ids.map((id) => ({ ...PERSONAL_QUESTS[id], id }));
  }

  create(user: UserRecord, req: CreateCharacterRequest): CharacterSheet {
    if (!this.campaign.unlockedClasses.includes(req.classId)) throw bad(`${CLASSES[req.classId]?.name ?? req.classId} hasn't been unlocked in this campaign yet. Retire heroes to unlock new classes.`);
    let trusted = false;
    if (req.abilityMethod === "rolled") {
      const t = req.rollToken ? this.rollTokens.get(req.rollToken) : undefined;
      if (!t || t.userId !== user.id) throw bad("Roll your ability scores first.");
      const given = Object.values(req.baseAbilities).sort((a, b) => a - b).join(",");
      if (given !== [...t.scores].sort((a, b) => a - b).join(",")) throw bad("Assign exactly the scores you rolled.");
      trusted = true;
      this.rollTokens.delete(req.rollToken!);
    }
    const owner = req.asCompanion ? "ai" : user.id;
    let s: CharacterSheet;
    try {
      s = createCharacter({ ...req, ownerId: owner, trustedRoll: trusted }, newId("chr"));
    } catch (e) { throw bad((e as Error).message); }
    const qid = req.personalQuestId && PERSONAL_QUESTS[req.personalQuestId] ? req.personalQuestId : this.drawQuests()[0].id;
    s.personalQuest = { questId: qid, counters: {}, complete: false };
    if (this.campaign.settings.hardcore) s.hardcore = true;
    if (req.asCompanion) s.aiPersona = req.personality?.traits ? `${req.personality.traits}. ${req.backstory ?? ""}`.slice(0, 400) : undefined;
    this.applyPrestigePerks(user, s);
    this.store.saveCharacter(s);
    return s;
  }

  quick(user: UserRecord, body: { name?: string; classId: ClassId; species: CharacterSheet["species"]; background: CharacterSheet["background"]; asCompanion?: boolean; personality?: string }): CharacterSheet {
    if (!this.campaign.unlockedClasses.includes(body.classId)) throw bad("That class is still locked.");
    const name = (body.name || randomName()).slice(0, 40);
    let s: CharacterSheet;
    try { s = quickBuild(name, body.asCompanion ? "ai" : user.id, body.classId, body.species, body.background, newId("chr")); } catch (e) { throw bad((e as Error).message); }
    s.personalQuest = { questId: this.drawQuests()[0].id, counters: {}, complete: false };
    if (body.asCompanion) s.aiPersona = body.personality?.slice(0, 400) || `A ${CLASSES[s.classId].name.toLowerCase()} for hire, eager to prove themselves.`;
    if (this.campaign.settings.hardcore) s.hardcore = true;
    this.applyPrestigePerks(user, s);
    this.store.saveCharacter(s);
    return s;
  }

  private applyPrestigePerks(user: UserRecord, s: CharacterSheet) {
    for (const perk of user.prestigePerks ?? []) {
      if (perk === "potion") s.inventory.push({ itemId: "potionHealing", qty: 1 });
      if (perk === "gold") s.gold += 25;
    }
  }

  levelUp(user: UserRecord, id: string, req: LevelUpRequest) {
    const s = this.mine(user, id);
    if (!canLevelUp(s)) throw bad(`${s.name} needs more XP.`);
    try {
      const notes = levelUp(s, req);
      this.store.saveCharacter(s);
      this.game.rewards.award(user, EMBER_RULES.levelUp, `${s.name} reached level ${s.level}`);
      return { character: s, notes };
    } catch (e) { throw bad((e as Error).message); }
  }

  rest(user: UserRecord, id: string, type: "short" | "long", hitDice = 1) {
    const s = this.mine(user, id);
    if (s.dead) throw bad("The dead don't rest. Visit the temple.");
    const notes: string[] = [];
    if (type === "long") {
      const free = this.services().includes("privateRooms");
      const price = free ? 0 : 2;
      if (s.gold < price) throw bad("A room at the Broken Lantern costs 2 gp.");
      s.gold -= price;
      longRest(s);
      notes.push(`${s.name} sleeps at the Broken Lantern${price ? " (2 gp)" : ""} and wakes fully restored.`);
    } else {
      notes.push(...shortRest(s, new Rng(crypto.randomInt(2 ** 31)), Math.max(0, Math.min(s.hitDice, hitDice))));
      if (!notes.length) notes.push(`${s.name} rests for an hour.`);
    }
    this.store.saveCharacter(s);
    return { character: s, notes };
  }

  equip(user: UserRecord, id: string, itemId: string, equipped: boolean) {
    const s = this.mine(user, id);
    const inv = s.inventory.find((i) => i.itemId === itemId);
    if (!inv) throw bad("Not carried.");
    const armor = ARMOR[itemId];
    if (equipped && armor) {
      const cls = CLASSES[s.classId];
      const protector = s.classId === "cleric" && armor.category === "heavy";
      if (!cls.armor.includes(armor.category) && !protector) throw bad(`${cls.name}s aren't trained with ${armor.category} armor.`);
      if (armor.strReq && s.abilities.str < armor.strReq) throw bad(`${armor.name} needs Strength ${armor.strReq}.`);
      // only one body armor / one shield
      for (const o of s.inventory) if (o !== inv && ARMOR[o.itemId] && (ARMOR[o.itemId].category === "shield") === (armor.category === "shield")) o.equipped = false;
    }
    inv.equipped = equipped;
    recalcDerived(s);
    this.store.saveCharacter(s);
    return s;
  }

  retire(user: UserRecord, id: string) {
    const s = this.mine(user, id);
    if (!s.personalQuest?.complete) throw bad(`${s.name} hasn't completed their personal quest yet.`);
    const q = PERSONAL_QUESTS[s.personalQuest.questId];
    const c = this.campaign;
    s.retired = true;
    c.retired.push({ characterId: s.id, name: s.name, classId: s.classId, questId: q.id, week: c.week });
    const u = q.unlock;
    if (u.kind === "class" && !c.unlockedClasses.includes(u.classId)) c.unlockedClasses.push(u.classId);
    if (u.kind === "building") c.buildings[u.buildingId] = Math.max(1, c.buildings[u.buildingId] ?? 0);
    if (u.kind === "scenario" && !c.unlockedScenarios.includes(u.scenarioId)) c.unlockedScenarios.push(u.scenarioId);
    if (u.kind === "prestige") { user.prestigePerks = [...(user.prestigePerks ?? []), u.perk]; this.store.saveUser(user); }
    c.prosperity += 1;
    this.game.rewards.award(user, EMBER_RULES.retire, `${s.name} retired a legend`);
    c.chronicle.push({ week: c.week, text: `${s.name} retires from adventuring, their quest "${q.name}" fulfilled. ${q.unlockText}` });
    this.store.saveCharacter(s);
    this.store.saveCampaign(c);
    return { character: s, unlockText: q.unlockText };
  }

  prestige(user: UserRecord, id: string) {
    const s = this.mine(user, id);
    if (s.level < 5) throw bad("Prestige is available at level 5 (the current level cap).");
    const cls = CLASSES[s.classId];
    s.prestige += 1;
    s.level = 1;
    s.xp = 0;
    s.subclass = undefined;
    const primary = cls.primary[0];
    s.abilities[primary] = Math.min(20, s.abilities[primary] + 1);
    s.spellsKnown = s.spellsKnown.filter((sp) => (SPELLS[sp]?.level ?? 1) <= 1);
    s.resources = {};
    recalcDerived(s);
    s.hp = s.maxHp;
    s.hitDice = 1;
    this.campaign.chronicle.push({ week: this.campaign.week, text: `${s.name} takes up the Prestige path (★${s.prestige}), beginning anew with hard-won wisdom.` });
    this.store.saveCharacter(s);
    this.store.saveCampaign(this.campaign);
    return s;
  }

  remove(user: UserRecord, id: string) {
    const s = this.mine(user, id);
    this.store.deleteCharacter(s.id);
  }
}

const NAMES = ["Corwin", "Mira", "Tobias", "Sela", "Dagny", "Oren", "Ysolde", "Bram", "Kesh", "Lirael", "Faro", "Tamsin", "Hollis", "Venna", "Garrick", "Ione"];
const SURNAMES = ["Ashdown", "Reedwater", "Coldbrook", "Thorne", "Vale", "Marsh", "Underhill", "Greaves", "Holloway", "Pike"];
function randomName() {
  return `${NAMES[crypto.randomInt(NAMES.length)]} ${SURNAMES[crypto.randomInt(SURNAMES.length)]}`;
}

export { logEntry, type ShopItem };

function ordinal(n: number) { return n === 2 ? "second" : n === 3 ? "third" : `${n}th`; }
