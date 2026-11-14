// Multi-campaign support: membership and roles, join codes, the "current campaign" of a request,
// and per-campaign AI billing (the owner's own key, or the site key with a monthly cap).
import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { CampaignAi, CampaignManageView, CampaignState, CampaignSummary } from "@tavern/engine";
import type { Store, UserRecord } from "./store.js";

// ---------------------------------------------------------------------------------------------
// Request-scoped campaign

const scope = new AsyncLocalStorage<{ campaignId?: string }>();
export const runInCampaign = <T>(campaignId: string | undefined, fn: () => T): T => scope.run({ campaignId }, fn);
export const currentCampaignId = (): string | undefined => scope.getStore()?.campaignId;

// ---------------------------------------------------------------------------------------------
// Secrets: owner API keys are encrypted with a server secret (APP_SECRET or DATA_DIR/secret.key)

let secret: Buffer | null = null;
export function initSecret(dataDir: string) {
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv) { secret = crypto.createHash("sha256").update(fromEnv).digest(); return; }
  const file = path.join(dataDir, "secret.key");
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString("base64"), { mode: 0o600 });
  secret = crypto.createHash("sha256").update(fs.readFileSync(file, "utf8").trim()).digest();
}
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secret!, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function decrypt(blob: string): string | null {
  try {
    const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", secret!, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return null; }
}

// ---------------------------------------------------------------------------------------------
// Membership & roles

export type Role = "owner" | "player" | "site-admin";

export function roleIn(c: CampaignState, u: UserRecord): Role | null {
  const m = c.members?.find((x) => x.userId === u.id);
  if (m) return m.role;
  if (u.isAdmin) return "site-admin";
  return null;
}
export const canManage = (c: CampaignState, u: UserRecord) => { const r = roleIn(c, u); return r === "owner" || r === "site-admin"; };

export const newJoinCode = () => {
  const words = ["ember", "lantern", "ashwood", "frost", "crown", "raven", "anvil", "hearth", "wyrm", "candle", "thorn", "barrow"];
  return `${words[crypto.randomInt(words.length)]}-${words[crypto.randomInt(words.length)]}-${crypto.randomInt(100, 1000)}`;
};

export function addMember(c: CampaignState, userId: string, role: "owner" | "player" = "player") {
  c.members = c.members ?? [];
  const m = c.members.find((x) => x.userId === userId);
  if (m) { if (role === "owner") m.role = "owner"; return; }
  c.members.push({ userId, role, joinedAt: Date.now() });
}

export function campaignsFor(store: Store, u: UserRecord): CampaignState[] {
  const all = [...store.campaigns.values()];
  return all.filter((c) => c.members?.some((m) => m.userId === u.id));
}

// ---------------------------------------------------------------------------------------------
// AI billing

const month = () => new Date().toISOString().slice(0, 7);
export const siteKeyConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

function usage(ai: CampaignAi) {
  if (!ai.usage || ai.usage.month !== month()) ai.usage = { month: month(), siteUsd: 0, ownUsd: 0 };
  return ai.usage;
}

export type AiMode = "own-key" | "site-key" | "none";

/** Which key (if any) pays for this campaign's AI right now. */
export function aiMode(c: CampaignState | undefined): AiMode {
  if (!c) return siteKeyConfigured() ? "site-key" : "none";
  const ai = c.ai ?? {};
  if (ai.keyEnc && decrypt(ai.keyEnc)) return "own-key";
  if (ai.useSiteKey && siteKeyConfigured()) {
    const u = usage(ai);
    if (ai.siteMonthlyCapUsd === undefined || u.siteUsd < ai.siteMonthlyCapUsd) return "site-key";
  }
  return "none";
}

export function ownKey(c: CampaignState): string | null {
  return c.ai?.keyEnc ? decrypt(c.ai.keyEnc) : null;
}

/** Rough cost of a Messages API response (Claude Opus 5.5 list prices, USD per million tokens). */
export function costUsd(u: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null }): number {
  const M = 1_000_000;
  return ((u.input_tokens ?? 0) * 4 + (u.output_tokens ?? 0) * 20 + (u.cache_creation_input_tokens ?? 0) * 5 + (u.cache_read_input_tokens ?? 0) * 0.2) / M;
}

export function recordUsage(c: CampaignState, mode: AiMode, usd: number) {
  c.ai = c.ai ?? {};
  const u = usage(c.ai);
  if (mode === "site-key") u.siteUsd = Math.round((u.siteUsd + usd) * 10000) / 10000;
  if (mode === "own-key") u.ownUsd = Math.round((u.ownUsd + usd) * 10000) / 10000;
}

// ---------------------------------------------------------------------------------------------
// Views

export function summaryOf(store: Store, c: CampaignState, viewer: UserRecord): CampaignSummary {
  return {
    id: c.id, name: c.name, role: roleIn(c, viewer) ?? "player",
    ownerName: store.users.get(c.ownerUserId ?? "")?.name ?? "?",
    members: c.members?.length ?? 0, week: c.week, completed: c.completedScenarios.length, aiMode: aiMode(c),
  };
}

export function manageView(store: Store, c: CampaignState): CampaignManageView {
  const chars = [...store.characters.values()];
  const ai = c.ai ?? {};
  return {
    id: c.id, name: c.name, joinCode: c.joinCode ?? "", ownerUserId: c.ownerUserId ?? "",
    members: (c.members ?? []).map((m) => {
      const u = store.users.get(m.userId);
      return { userId: m.userId, name: u?.name ?? "?", email: u?.email, role: m.role, joinedAt: m.joinedAt, lastSeen: u?.lastSeen, heroes: chars.filter((x) => x.ownerId === m.userId && !x.retired).length };
    }),
    ai: { mode: aiMode(c), ownKeyHint: ai.keyHint, useSiteKey: !!ai.useSiteKey, siteMonthlyCapUsd: ai.siteMonthlyCapUsd, usage: usage(ai), siteKeyConfigured: siteKeyConfigured() },
    settings: c.settings,
  };
}

/** Never send secrets to clients. */
export function publicCampaign(c: CampaignState): CampaignState {
  const { ai, ...rest } = c;
  return { ...rest, ai: ai ? { useSiteKey: ai.useSiteKey, siteMonthlyCapUsd: ai.siteMonthlyCapUsd, keyHint: ai.keyHint } : undefined } as CampaignState;
}
