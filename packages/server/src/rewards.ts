// Embers wallet and the Curio Shop: earning, buying, equipping and using rewards.
import {
  phoenixAllowed, reviveSheet, graveMarks, type DeathRuleContext,
  CLASSES, DEFAULT_BACKDROP, DEFAULT_DICE, EMBER_RULES, REWARD_BY_ID, SPECIES, logEntry,
  type AdventureState, type CharacterSheet, type RewardsView,
} from "@tavern/engine";
import { HttpError } from "./game.js";
import type { Store, UserRecord } from "./store.js";
import { aiAvailable, writeBallad } from "./dm.js";

export interface Wallet {
  embers: number;
  lifetime: number;
  owned: string[];
  equipped: { dice: string; backdrop: string };
  consumables: Record<string, number>;
  ledger: { t: number; amount: number; reason: string }[];
  lastDailyBonus?: string; // YYYY-MM-DD
}

const bad = (m: string) => new HttpError(400, m);
const today = () => new Date().toISOString().slice(0, 10);

export class Rewards {
  constructor(private store: Store) {}

  wallet(u: UserRecord): Wallet {
    if (!u.wallet) {
      u.wallet = {
        embers: EMBER_RULES.welcome, lifetime: EMBER_RULES.welcome, owned: [DEFAULT_DICE, DEFAULT_BACKDROP],
        equipped: { dice: DEFAULT_DICE, backdrop: DEFAULT_BACKDROP }, consumables: {},
        ledger: [{ t: Date.now(), amount: EMBER_RULES.welcome, reason: "Welcome to the Broken Lantern" }],
      };
      this.store.saveUser(u);
    }
    return u.wallet;
  }

  view(u: UserRecord): RewardsView {
    const w = this.wallet(u);
    return { embers: w.embers, lifetime: w.lifetime, owned: w.owned, equipped: w.equipped, consumables: w.consumables, ledger: w.ledger.slice(-40).reverse() };
  }

  award(u: UserRecord | undefined, amount: number, reason: string): number {
    if (!u || amount === 0) return 0;
    const w = this.wallet(u);
    const n = Math.round(amount);
    w.embers = Math.max(0, w.embers + n);
    if (n > 0) w.lifetime += n;
    w.ledger.push({ t: Date.now(), amount: n, reason });
    if (w.ledger.length > 200) w.ledger = w.ledger.slice(-200);
    this.store.saveUser(u);
    return n;
  }

  /** Pay out a finished adventure to each human player who took part. */
  awardAdventure(adv: AdventureState, difficulty: string): Record<string, number> {
    const mult = EMBER_RULES.difficulty[difficulty] ?? 1;
    const players = new Set(adv.party.filter((p) => p.controller.kind === "human" || (p.userId !== "ai" && p.userId)).map((p) => p.userId).filter((id) => id && id !== "ai"));
    const out: Record<string, number> = {};
    for (const uid of players) {
      const u = this.store.users.get(uid);
      if (!u) continue;
      let total = 0;
      const title = `“${adv.title}”`;
      if (adv.status === "complete") total += this.award(u, EMBER_RULES.complete * mult, `Completed ${title}${mult !== 1 ? ` (${difficulty})` : ""}`);
      else total += this.award(u, EMBER_RULES.attempt, `Braved ${title}`);
      const kills = adv.party.filter((p) => p.userId === uid).reduce((s, p) => s + (adv.kills[p.characterId] ?? 0), 0);
      if (kills) total += this.award(u, Math.min(8, kills) * EMBER_RULES.perKill, `${kills} foe${kills === 1 ? "" : "s"} felled`);
      const w = this.wallet(u);
      if (w.lastDailyBonus !== today()) { w.lastDailyBonus = today(); total += this.award(u, EMBER_RULES.dailyFirst, "First adventure of the day"); }
      out[uid] = total;
    }
    adv.embersAwarded = out;
    return out;
  }

  buy(u: UserRecord, itemId: string): string {
    const item = REWARD_BY_ID[itemId];
    if (!item) throw bad("That isn't sold here.");
    const w = this.wallet(u);
    if (!item.consumable && item.kind !== "story" && w.owned.includes(item.id)) throw bad(`You already own ${item.name}.`);
    if (item.consumable && (w.consumables[item.id] ?? 0) >= (item.max ?? 99)) throw bad(`You can carry at most ${item.max} of those.`);
    if (item.kind === "story" && !item.consumable) throw bad(`${item.name} is used on a hero directly — choose “Use” instead.`);
    if (w.embers < item.price) throw bad(`You need ${item.price - w.embers} more Embers.`);
    this.award(u, -item.price, `Bought ${item.name}`);
    if (item.consumable) w.consumables[item.id] = (w.consumables[item.id] ?? 0) + 1;
    else { w.owned.push(item.id); if (item.kind === "dice") w.equipped.dice = item.id; if (item.kind === "backdrop") w.equipped.backdrop = item.id; }
    this.store.saveUser(u);
    return `${item.name} is yours${item.kind === "dice" || item.kind === "backdrop" ? " — and equipped" : ""}.`;
  }

  equip(u: UserRecord, itemId: string): string {
    const item = REWARD_BY_ID[itemId];
    const w = this.wallet(u);
    if (!item || (item.kind !== "dice" && item.kind !== "backdrop")) throw bad("You can only equip dice and backdrops.");
    if (!w.owned.includes(item.id)) throw bad("You don't own that yet.");
    w.equipped[item.kind] = item.id;
    this.store.saveUser(u);
    return `${item.name} equipped.`;
  }

  /** Consume one Pathfinder's Map (called when starting an adventure). */
  spendMap(u: UserRecord): boolean {
    const w = this.wallet(u);
    if ((w.consumables["story:map"] ?? 0) <= 0) return false;
    w.consumables["story:map"]--;
    w.ledger.push({ t: Date.now(), amount: 0, reason: "Used a Pathfinder's Map" });
    this.store.saveUser(u);
    return true;
  }

  /** Story perks applied to one of the player's heroes. */
  async use(u: UserRecord, itemId: string, characterId: string, text: string | undefined, campaign: { week: number; chronicle: { week: number; text: string }[] }, rules: DeathRuleContext = { hardcore: false }): Promise<string> {
    const item = REWARD_BY_ID[itemId];
    if (!item || item.kind !== "story" || itemId === "story:map") throw bad("That can't be used on a hero.");
    const s = this.store.characters.get(characterId);
    if (!s || s.ownerId !== u.id) throw bad("Choose one of your own heroes.");
    const w = this.wallet(u);
    const pay = () => {
      if (item.consumable) {
        if ((w.consumables[item.id] ?? 0) <= 0) {
          if (w.embers < item.price) throw bad(`You need ${item.price - w.embers} more Embers.`);
          this.award(u, -item.price, `Bought ${item.name}`);
        } else w.consumables[item.id]--;
      } else {
        if (w.embers < item.price) throw bad(`You need ${item.price - w.embers} more Embers.`);
        this.award(u, -item.price, `${item.name} for ${s.name}`);
      }
    };
    if (s.dead && itemId !== "story:phoenix" && itemId !== "story:ballad") throw bad(`${s.name} is dead. A Phoenix Feather or the temple might help.`);
    switch (itemId) {
      case "story:phoenix": {
        const ok = phoenixAllowed(rules, s);
        if (!ok.ok) throw bad(ok.reason!);
        pay();
        reviveSheet(s, { exhaustion: 2 });
        s.phoenixUsed = true;
        this.store.saveCharacter(s);
        this.store.saveUser(u);
        campaign.chronicle.push({ week: campaign.week, text: `A Phoenix Feather blazed over ${s.name}'s body — and they rose from the ashes.` });
        return `${s.name} rises in a burst of golden fire! (1 HP, 2 levels of exhaustion; −${graveMarks(s)} to death saves from now on.)`;
      }
      case "story:inspiration": {
        if (s.heroicInspiration) throw bad(`${s.name} already has Heroic Inspiration.`);
        pay();
        s.heroicInspiration = true;
        this.store.saveCharacter(s);
        this.store.saveUser(u);
        return `${s.name} feels inspired. Their next failed check will be rerolled.`;
      }
      case "story:epithet": {
        const ep = (text ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
        if (ep.length < 3) throw bad("Write the epithet, e.g. “the Unbroken”.");
        if (/[<>{}]/.test(ep)) throw bad("Keep it to words.");
        pay();
        s.epithet = ep;
        this.store.saveCharacter(s);
        campaign.chronicle.push({ week: campaign.week, text: `Word spreads through Emberfall: they call ${s.name} “${ep}” now.` });
        return `From now on the tavern knows them as ${s.name} ${ep}.`;
      }
      case "story:ballad": {
        pay();
        const ballad = await this.ballad(s);
        s.backstory = `${s.backstory ? s.backstory + "\n\n" : ""}— Ballad (week ${campaign.week}) —\n${ballad}`.slice(0, 6000);
        this.store.saveCharacter(s);
        campaign.chronicle.push({ week: campaign.week, text: `A bard sings of ${s.name}${s.epithet ? ` ${s.epithet}` : ""}:\n${ballad}` });
        return ballad;
      }
    }
    throw bad("Unknown perk.");
  }

  private async ballad(s: CharacterSheet): Promise<string> {
    const facts = {
      name: `${s.name}${s.epithet ? ` ${s.epithet}` : ""}`, species: SPECIES[s.species].name, cls: CLASSES[s.classId].name, level: s.level,
      kills: Object.values(s.stats.kills).reduce((a, b) => a + b, 0), scenarios: s.stats.scenariosCompleted.length, knockouts: s.stats.knockouts,
      crits: s.stats.criticals, deaths: s.deathCount, personality: s.personality, backstory: s.backstory?.slice(0, 600),
    };
    if (aiAvailable()) {
      try { const b = await writeBallad(facts); if (b) return b; } catch { /* fall back */ }
    }
    return [
      `Raise a cup to ${facts.name}, the ${facts.species.toLowerCase()} ${facts.cls.toLowerCase()},`,
      `who walked out of Emberfall with steel and nerve and little else.`,
      facts.scenarios ? `${facts.scenarios} roads they've walked and come back whole,` : `Their road is only beginning,`,
      facts.kills ? `and ${facts.kills} foes will trouble the Marches no more.` : `and the Marches have yet to learn their name.`,
      facts.knockouts ? `Knocked down ${facts.knockouts} time${facts.knockouts === 1 ? "" : "s"}, they rose every time —` : `Never once have they fallen —`,
      `so drink, and remember them, while the Lantern still burns.`,
    ].join("\n");
  }
}

export { logEntry };
