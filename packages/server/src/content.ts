// World Workshop: custom monsters, items, events, scenarios and lore, created from the web UI and merged
// into the live game. Each record belongs to one campaign or to the whole server ("global").
import crypto from "node:crypto";
import { GEAR, MONSTERS, validateContent, type CampaignState, type ContentKind, type ItemDef, type MonsterDef, type EventCard, type Scenario } from "@tavern/engine";
import { EVENTS, SCENARIOS } from "@tavern/engine/content";
import type { Store } from "./store.js";

export interface ContentRecord {
  id: string;
  kind: ContentKind;
  scope: "global" | string;   // "global" or a campaign id
  name: string;
  data: Record<string, unknown>;
  enabled: boolean;
  forSale?: boolean;           // items: sold in the town shop
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export const nameOf = (kind: ContentKind, data: Record<string, unknown>) => String(kind === "event" || kind === "lore" ? data.title : data.name ?? "Untitled").slice(0, 80);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "thing";

export class ContentService {
  constructor(private store: Store) {
    for (const r of store.contents.values()) this.register(r);
  }

  newId(kind: ContentKind, name: string) { return `x_${crypto.randomBytes(3).toString("hex")}_${slug(name)}${kind === "scenario" ? "" : ""}`; }

  visible(r: ContentRecord, c: CampaignState | undefined) { return r.enabled && (r.scope === "global" || (!!c && r.scope === c.id)); }

  /** Is this scenario/event id usable in this campaign? Built-in content always is. */
  visibleId(id: string, c: CampaignState): boolean {
    const r = this.store.contents.get(id);
    return !r || this.visible(r, c);
  }

  forCampaign(c: CampaignState | undefined) { return [...this.store.contents.values()].filter((r) => this.visible(r, c)); }

  /** Lore notes the AI DM should know for this campaign. */
  lore(c: CampaignState | undefined): string {
    return this.forCampaign(c).filter((r) => r.kind === "lore").map((r) => `- ${r.data.title}: ${r.data.text}`).join("\n").slice(0, 8000);
  }

  /** Put a record's definition into the engine's registries so the rules engine can use it. */
  register(r: ContentRecord) {
    const d = { ...r.data, id: r.id } as Record<string, unknown>;
    if (r.kind === "monster") MONSTERS[r.id] = d as unknown as MonsterDef;
    if (r.kind === "item") GEAR[r.id] = d as unknown as ItemDef;
    if (r.kind === "event") EVENTS[r.id] = d as unknown as EventCard;
    if (r.kind === "scenario") SCENARIOS[r.id] = d as unknown as Scenario;
  }
  unregister(r: ContentRecord) {
    if (r.kind === "monster") delete MONSTERS[r.id];
    if (r.kind === "item") delete GEAR[r.id];
    if (r.kind === "event") delete EVENTS[r.id];
    if (r.kind === "scenario") delete SCENARIOS[r.id];
  }

  validate(kind: ContentKind, data: unknown): string[] {
    if (!data || typeof data !== "object" || Array.isArray(data)) return ["Content must be a JSON object."];
    if (JSON.stringify(data).length > 200_000) return ["That's too big (200 KB max)."];
    return validateContent(kind, data);
  }

  /** Campaigns a record reaches: one campaign, or all of them. */
  campaignsFor(r: ContentRecord): CampaignState[] {
    return r.scope === "global" ? [...this.store.campaigns.values()] : [this.store.campaigns.get(r.scope)].filter((x): x is CampaignState => !!x);
  }

  /** New scenarios can go straight onto the job board; new events into the decks. */
  placeInCampaigns(r: ContentRecord, startUnlocked: boolean) {
    for (const c of this.campaignsFor(r)) {
      if (r.kind === "scenario" && startUnlocked && !c.unlockedScenarios.includes(r.id)) c.unlockedScenarios.push(r.id);
      if (r.kind === "event") {
        const deck = (r.data.deck === "town" ? c.townDeck : c.roadDeck);
        if (!deck.includes(r.id)) deck.splice(Math.floor(Math.random() * (deck.length + 1)), 0, r.id);
      }
      this.store.saveCampaign(c);
    }
  }

  removeFromCampaigns(r: ContentRecord) {
    for (const c of this.store.campaigns.values()) {
      const before = JSON.stringify([c.unlockedScenarios, c.roadDeck, c.townDeck]);
      c.unlockedScenarios = c.unlockedScenarios.filter((x) => x !== r.id);
      c.roadDeck = c.roadDeck.filter((x) => x !== r.id);
      c.townDeck = c.townDeck.filter((x) => x !== r.id);
      if (JSON.stringify([c.unlockedScenarios, c.roadDeck, c.townDeck]) !== before) this.store.saveCampaign(c);
    }
  }
}
