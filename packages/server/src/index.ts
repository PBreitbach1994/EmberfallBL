// HTTP + WebSocket server for Emberfall.
import express, { type NextFunction, type Request, type Response } from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { NewAdventureRequest, ServerMessage, AdventureView, ClassId } from "@tavern/engine";
import { CLASSES, CONTENT_TEMPLATES, GEAR, MONSTERS, SKILL_ABILITY, type CampaignState } from "@tavern/engine";
import { nameOf, type ContentRecord } from "./content.js";
import { aiAvailable, draftContent } from "./dm.js";
import { BUILDINGS, SCENARIOS } from "@tavern/engine/content";
import { Store, newId, newToken, type UserRecord } from "./store.js";
import { Game, HttpError, LEGACY_CAMPAIGN_ID } from "./game.js";
import { Town } from "./town.js";
import { AccessPolicySync } from "./cloudflare.js";
import Anthropic from "@anthropic-ai/sdk";
import {
  addMember, campaignsFor, canManage, encrypt, initSecret, manageView, newJoinCode, publicCampaign, roleIn, runInCampaign,
  siteKeyConfigured, summaryOf,
} from "./campaigns.js";
import { accessConfigFromEnv, accessTokenFrom, adminEmails, verifyAccessJwt } from "./auth.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.resolve(here, "../../../data");
const INVITE_CODE = process.env.INVITE_CODE || "emberfall";
const WEB_DIST = process.env.WEB_DIST || path.resolve(here, "../../web/dist");

const store = new Store(path.join(DATA_DIR, "emberfall.db"));
initSecret(DATA_DIR);
const game = new Game(store);
const town = new Town(game);

const app = express();
app.use(express.json({ limit: "256kb" }));

type AuthedRequest = Request & { user: UserRecord; accessEmail?: string };

const ACCESS = accessConfigFromEnv();
const ALLOW_INVITE_LOGIN = !ACCESS || process.env.ALLOW_INVITE_LOGIN === "true";
const publicUser = (u: UserRecord) => ({ id: u.id, name: u.name, isAdmin: u.isAdmin, email: u.email, altEmails: u.altEmails, revoked: !!u.revoked, canCreateCampaigns: !!(u.canCreateCampaigns || u.isAdmin) });
const accessList = new AccessPolicySync();

/** Resolve the caller. In Access mode the verified Cloudflare identity wins; tokens are only a fallback
 *  when invite login is explicitly allowed (e.g. LAN access while Cloudflare is down). */
async function resolveUser(headers: Request["headers"], token: string): Promise<{ user?: UserRecord; email?: string }> {
  if (ACCESS) {
    const id = await verifyAccessJwt(ACCESS, accessTokenFrom(headers));
    if (id) return { user: store.userByEmail(id.email), email: id.email };
    if (!ALLOW_INVITE_LOGIN) return {};
  }
  return { user: token ? store.userByToken(token) : undefined };
}

async function auth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.header("authorization") ?? "";
    const r = await resolveUser(req.headers, h.startsWith("Bearer ") ? h.slice(7) : "");
    if (!r.user) {
      if (r.email) return next(new HttpError(409, "Finish setting up your account."));
      return next(new HttpError(401, ACCESS ? "Please sign in." : "Please sign in."));
    }
    if (r.user.revoked) return next(new HttpError(403, "Your access to this tavern has been removed. Ask the campaign owner."));
    (req as AuthedRequest).user = r.user;
    if (!r.user.lastSeen || Date.now() - r.user.lastSeen > 5 * 60_000) { r.user.lastSeen = Date.now(); store.saveUser(r.user); }
    next();
  } catch (e) { next(e); }
}
const wrap = (fn: (req: AuthedRequest, res: Response) => unknown) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req as AuthedRequest, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) { next(e); }
};

// ---- auth
/** Tells the client how to sign in; in Access mode it also signs the player straight in. */
app.get("/api/auth/config", wrap(async (req) => {
  if (!ACCESS) return { mode: "invite" };
  const id = await verifyAccessJwt(ACCESS, accessTokenFrom(req.headers));
  if (!id) return { mode: "access", allowInvite: ALLOW_INVITE_LOGIN, signedIn: false };
  let user = store.userByEmail(id.email);
  // the campaign owner's email auto-links to the existing owner account the first time
  if (!user && adminEmails().includes(id.email)) {
    const owners = [...store.users.values()].filter((u) => u.isAdmin && !u.email);
    if (owners.length === 1) { user = owners[0]; user.email = id.email; }
  }
  if (!user) return { mode: "access", signedIn: true, email: id.email, needsProfile: true, suggestedName: id.name ?? id.email.split("@")[0] };
  if (user.revoked) throw new HttpError(403, "Your access to this tavern has been removed. Ask the campaign owner.");
  if (!user.token) user.token = newToken();
  if (adminEmails().includes(id.email)) user.isAdmin = true;
  user.lastSeen = Date.now();
  store.saveUser(user);
  return { mode: "access", signedIn: true, email: id.email, user: publicUser(user), token: user.token };
}));

/** First Google sign-in: create a new player, or claim an account made before Google sign-in existed. */
app.post("/api/auth/profile", wrap(async (req) => {
  if (!ACCESS) throw new HttpError(400, "Cloudflare sign-in isn't enabled.");
  const id = await verifyAccessJwt(ACCESS, accessTokenFrom(req.headers));
  if (!id) throw new HttpError(401, "Please sign in.");
  if (store.userByEmail(id.email)) throw new HttpError(400, "This email is already linked to a player.");
  let user: UserRecord;
  if (req.body?.claimName) {
    const name = String(req.body.claimName).trim().toLowerCase();
    const old = [...store.users.values()].find((u) => u.name.toLowerCase() === name);
    if (!old) throw new HttpError(404, "No adventurer by that name has signed the ledger.");
    if (old.email) throw new HttpError(400, "That name is already linked to another email. Ask the campaign owner to fix it.");
    if (String(req.body.inviteCode ?? "") !== INVITE_CODE) throw new HttpError(403, "That invite code isn't right — it proves the old name is yours.");
    user = old;
  } else {
    const name = String(req.body?.displayName ?? "").trim().slice(0, 32);
    if (!name) throw new HttpError(400, "Choose a name.");
    if ([...store.users.values()].some((u) => u.name.toLowerCase() === name.toLowerCase())) throw new HttpError(400, "That name is taken. If it's your old account, claim it instead.");
    user = { id: newId("usr"), name, token: "", isAdmin: store.users.size === 0, createdAt: Date.now(), prestigePerks: [] };
  }
  user.email = id.email;
  user.token = newToken();
  if (adminEmails().includes(id.email)) user.isAdmin = true;
  user.lastSeen = Date.now();
  store.saveUser(user);
  game.adoptLegacy();
  // someone added to the guest list directly (not through a campaign invite) lands in the original campaign
  if (!campaignsFor(store, user).length) {
    const legacy = store.campaigns.get(LEGACY_CAMPAIGN_ID);
    if (legacy) { addMember(legacy, user.id); store.saveCampaign(legacy); }
  }
  return { user: publicUser(user), token: user.token };
}));

app.post("/api/auth/join", wrap((req) => {
  if (!ALLOW_INVITE_LOGIN) throw new HttpError(403, "This tavern uses Cloudflare sign-in.");
  const name = String(req.body?.name ?? "").trim().slice(0, 32);
  const code = String(req.body?.inviteCode ?? "");
  if (!name) throw new HttpError(400, "Enter a name.");
  if (code !== INVITE_CODE) throw new HttpError(403, "That invite code isn't right.");
  // returning player with the same name gets a fresh token on the same account
  let user = [...store.users.values()].find((u) => u.name.toLowerCase() === name.toLowerCase());
  if (!user) user = { id: newId("usr"), name, token: "", isAdmin: store.users.size === 0, createdAt: Date.now(), prestigePerks: [] };
  user.token = newToken();
  store.saveUser(user);
  game.adoptLegacy();
  // the site invite code has always meant "join the original campaign"
  const legacy = store.campaigns.get(LEGACY_CAMPAIGN_ID);
  if (legacy && !legacy.members?.some((m) => m.userId === user!.id)) { addMember(legacy, user.id); store.saveCampaign(legacy); }
  return { user: publicUser(user), token: user.token };
}));
app.get("/api/health", (_req, res) => { res.json({ ok: true, ai: siteKeyConfigured(), version: process.env.APP_VERSION || "dev" }); });

app.use("/api", auth);

/** Every request runs "inside" a campaign: the one named by the X-Campaign header, else the player's first. */
app.use("/api", (req, _res, next) => {
  const u = (req as AuthedRequest).user;
  const asked = req.header("x-campaign") || (typeof req.query.campaign === "string" ? req.query.campaign : "");
  let id: string | undefined;
  if (asked) {
    const c = store.campaigns.get(asked);
    if (c && roleIn(c, u)) id = c.id;
  }
  if (!id) id = campaignsFor(store, u).sort((a, b) => a.createdAt - b.createdAt)[0]?.id;
  if (!id && u.isAdmin) id = [...store.campaigns.values()][0]?.id;
  runInCampaign(id, () => next());
});
const requireManage = (req: AuthedRequest) => {
  const c = game.campaign();
  if (!canManage(c, req.user)) throw new HttpError(403, "Only this campaign's owner can do that.");
  return c;
};
const requireMemberOf = (req: AuthedRequest, campaignId: string) => {
  const c = store.campaigns.get(campaignId);
  if (!c || !roleIn(c, req.user)) throw new HttpError(403, "You're not part of that campaign.");
  return c;
};

app.get("/api/me", wrap((req) => ({ user: publicUser(req.user) })));

// ---- Embers & the Curio Shop
app.get("/api/rewards", wrap((req) => game.rewards.view(req.user)));
app.post("/api/rewards/buy", wrap((req) => ({ message: game.rewards.buy(req.user, String(req.body?.itemId)), rewards: game.rewards.view(req.user) })));
app.post("/api/rewards/equip", wrap((req) => ({ message: game.rewards.equip(req.user, String(req.body?.itemId)), rewards: game.rewards.view(req.user) })));
app.post("/api/rewards/use", wrap(async (req) => {
  const c = game.campaign();
  const message = await game.rewards.use(req.user, String(req.body?.itemId), String(req.body?.characterId), req.body?.text, c, { hardcore: c.settings.hardcore, difficulty: c.settings.difficulty });
  store.saveCampaign(c);
  game.broadcastCampaign();
  return { message, rewards: game.rewards.view(req.user) };
}));

// ---- campaigns
app.get("/api/campaigns", wrap((req) => {
  const mine = campaignsFor(store, req.user);
  const list = req.user.isAdmin ? [...store.campaigns.values()] : mine;
  return { campaigns: list.sort((a, b) => a.createdAt - b.createdAt).map((c) => summaryOf(store, c, req.user)), canCreate: !!(req.user.canCreateCampaigns || req.user.isAdmin) };
}));

app.post("/api/campaigns", wrap((req) => {
  if (!req.user.canCreateCampaigns && !req.user.isAdmin) throw new HttpError(403, "Ask the site owner to let you start campaigns.");
  const owned = [...store.campaigns.values()].filter((c) => c.ownerUserId === req.user.id).length;
  if (!req.user.isAdmin && owned >= 5) throw new HttpError(400, "You already run 5 campaigns.");
  const name = String(req.body?.name ?? "").trim();
  if (name.length < 3) throw new HttpError(400, "Give your campaign a name.");
  const c = game.createCampaign(name, req.user);
  return { campaign: summaryOf(store, c, req.user) };
}));

app.post("/api/campaigns/join", wrap((req) => {
  const code = String(req.body?.code ?? "").trim().toLowerCase();
  const c = [...store.campaigns.values()].find((x) => x.joinCode && x.joinCode.toLowerCase() === code);
  if (!c) throw new HttpError(404, "No campaign uses that code.");
  addMember(c, req.user.id);
  store.saveCampaign(c);
  game.broadcastCampaign();
  return { campaign: summaryOf(store, c, req.user) };
}));

app.get("/api/campaign/manage", wrap((req) => manageView(store, requireManage(req))));

app.post("/api/campaign/manage", wrap((req) => {
  const c = requireManage(req);
  const b = req.body ?? {};
  if (typeof b.name === "string" && b.name.trim().length >= 3) c.name = b.name.trim().slice(0, 48);
  if (b.newJoinCode) c.joinCode = newJoinCode();
  if (typeof b.transferTo === "string") {
    if (!c.members?.some((m) => m.userId === b.transferTo)) throw new HttpError(400, "They need to be a member first.");
    for (const m of c.members ?? []) if (m.role === "owner") m.role = "player";
    addMember(c, b.transferTo, "owner");
    c.ownerUserId = b.transferTo;
  }
  store.saveCampaign(c);
  game.broadcastCampaign();
  return manageView(store, c);
}));

/** The owner's own Anthropic key pays for this campaign's AI DM. It's checked, then stored encrypted. */
app.post("/api/campaign/ai-key", wrap(async (req) => {
  const c = requireManage(req);
  c.ai = c.ai ?? {};
  const key = String(req.body?.apiKey ?? "").trim();
  if (!key) { delete c.ai.keyEnc; delete c.ai.keyHint; store.saveCampaign(c); return manageView(store, c); }
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) throw new HttpError(400, "That doesn't look like an Anthropic API key (it starts with sk-ant-).");
  try { await new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20_000 }).models.list({ limit: 1 }); }
  catch (e) { throw new HttpError(400, `Anthropic didn't accept that key: ${(e as Error).message.slice(0, 160)}`); }
  c.ai.keyEnc = encrypt(key);
  c.ai.keyHint = key.slice(-4);
  store.saveCampaign(c);
  return manageView(store, c);
}));

/** Campaign editor: change the state of a campaign (owner or site admin). Every change is chronicled. */
app.post("/api/campaign/edit", wrap((req) => {
  const c = requireManage(req);
  const b = req.body ?? {};
  const notes: string[] = [];
  const num = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); if (!Number.isFinite(n)) throw new HttpError(400, "Numbers only."); return Math.max(lo, Math.min(hi, n)); };
  if (b.scenario) {
    const { id, state } = b.scenario as { id: string; state: string };
    if (!SCENARIOS[id]) throw new HttpError(400, "Unknown scenario.");
    const drop = (arr: string[]) => arr.filter((x) => x !== id);
    if (state === "locked") { c.unlockedScenarios = drop(c.unlockedScenarios); c.completedScenarios = drop(c.completedScenarios); }
    else if (state === "available") { if (!c.unlockedScenarios.includes(id)) c.unlockedScenarios.push(id); c.completedScenarios = drop(c.completedScenarios); c.failedScenarios = drop(c.failedScenarios); }
    else if (state === "completed") {
      if (!c.unlockedScenarios.includes(id)) c.unlockedScenarios.push(id);
      if (!c.completedScenarios.includes(id)) c.completedScenarios.push(id);
      for (const u of SCENARIOS[id].rewards.unlocks ?? []) if (!c.unlockedScenarios.includes(u)) c.unlockedScenarios.push(u);
    } else throw new HttpError(400, "State must be locked, available or completed.");
    notes.push(`${SCENARIOS[id].name} → ${state}`);
  }
  if (b.classId) {
    const id = String(b.classId) as ClassId;
    if (!CLASSES[id]) throw new HttpError(400, "Unknown class.");
    if (b.unlocked) { if (!c.unlockedClasses.includes(id)) c.unlockedClasses.push(id); }
    else c.unlockedClasses = c.unlockedClasses.filter((x) => x !== id);
    notes.push(`${CLASSES[id].name} ${b.unlocked ? "unlocked" : "locked"}`);
  }
  if (b.building) {
    const { id, level } = b.building as { id: string; level: number };
    const def = BUILDINGS[id];
    if (!def) throw new HttpError(400, "Unknown building.");
    c.buildings[id] = num(level, 0, def.levels.length);
    notes.push(`${def.name} → level ${c.buildings[id]}`);
  }
  for (const k of ["treasury", "prosperity", "reputation", "week"] as const) if (b[k] !== undefined) { c[k] = num(b[k], k === "week" ? 1 : k === "treasury" ? 0 : -99, 1_000_000); notes.push(`${k} → ${c[k]}`); }
  if (b.materials) for (const k of ["timber", "iron", "herbs", "relic"] as const) if (b.materials[k] !== undefined) { c.materials[k] = num(b.materials[k], 0, 100_000); notes.push(`${k} → ${c.materials[k]}`); }
  if (b.season === "summer" || b.season === "winter") { c.season = b.season; notes.push(`season → ${b.season}`); }
  if (typeof b.addFlag === "string" && b.addFlag.trim()) { const f = b.addFlag.trim().slice(0, 60); if (!c.flags.includes(f)) c.flags.push(f); notes.push(`flag +${f}`); }
  if (typeof b.removeFlag === "string") { c.flags = c.flags.filter((f) => f !== b.removeFlag); notes.push(`flag −${b.removeFlag}`); }
  if (typeof b.chronicle === "string" && b.chronicle.trim()) c.chronicle.push({ week: c.week, text: b.chronicle.trim().slice(0, 2000) });
  if (typeof b.removeChronicle === "number") c.chronicle.splice(Math.max(0, Math.floor(b.removeChronicle)), 1);
  store.saveCampaign(c);
  game.broadcastCampaign();
  return { ok: true, message: notes.length ? `Changed: ${notes.join(", ")}.` : "Saved." };
}));

/** Start the campaign over (town, story, unlocks, chronicle). Members, owner, join code and AI settings stay. */
app.post("/api/campaign/reset", wrap((req) => {
  const c = requireManage(req);
  if (String(req.body?.confirmName ?? "") !== c.name) throw new HttpError(400, `Type the campaign's name (${c.name}) to confirm.`);
  for (const a of store.adventures.values()) if (a.campaignId === c.id && (a.status === "exploring" || a.status === "combat")) { a.status = "retreated"; a.encounter = undefined; for (const p of a.party) { const s = store.characters.get(p.characterId); if (s) { s.activeAdventureId = undefined; store.saveCharacter(s); } } store.saveAdventure(a); }
  const fresh = game.createCampaign(c.name, undefined, c.id);
  Object.assign(fresh, { ownerUserId: c.ownerUserId, members: c.members, joinCode: c.joinCode, ai: c.ai, settings: c.settings, createdAt: c.createdAt });
  fresh.chronicle = [{ week: 1, text: "The company's tale begins again. The Broken Lantern's doors open on a new chapter." }];
  store.saveCampaign(fresh);
  game.broadcastCampaign();
  return { ok: true, message: `${c.name} has been reset to week 1.` };
}));

/** Delete a campaign. Heroes, Embers and adventures' history stay with their players. */
app.post("/api/campaign/delete", wrap((req) => {
  const c = requireManage(req);
  if (String(req.body?.confirmName ?? "") !== c.name) throw new HttpError(400, `Type the campaign's name (${c.name}) to confirm.`);
  if (c.id === LEGACY_CAMPAIGN_ID && store.campaigns.size === 1) throw new HttpError(400, "That's the only campaign on the server.");
  for (const a of store.adventures.values()) if (a.campaignId === c.id) { for (const p of a.party) { const s = store.characters.get(p.characterId); if (s && s.activeAdventureId === a.id) { s.activeAdventureId = undefined; store.saveCharacter(s); } } store.deleteAdventure(a.id); }
  store.deleteCampaign(c.id);
  game.broadcastCampaign();
  return { ok: true, message: `${c.name} was deleted.` };
}));

// ---- World Workshop: custom content
const CONTENT_KINDS = ["monster", "item", "event", "scenario", "lore"] as const;
type Kind = typeof CONTENT_KINDS[number];
const asKind = (k: unknown): Kind => { if (!CONTENT_KINDS.includes(k as Kind)) throw new HttpError(400, "Unknown content kind."); return k as Kind; };
const canEditRecord = (u: UserRecord, r: ContentRecord) => u.isAdmin || (r.scope !== "global" && !!store.campaigns.get(r.scope) && canManage(store.campaigns.get(r.scope)!, u));

app.get("/api/content", wrap((req) => {
  let c: CampaignState | undefined;
  try { c = game.campaign(); } catch { c = undefined; }
  const manager = !!c && canManage(c, req.user);
  const records = [...store.contents.values()].filter((r) => {
    if (req.user.isAdmin) return true;                       // the site owner sees everything
    if (r.scope === "global") return r.enabled;               // shared content, if switched on
    return !!c && r.scope === c.id && (r.enabled || manager); // this campaign's own (owners also see hidden)
  });
  return { records: records.map((r) => ({ ...r, scopeName: r.scope === "global" ? "Everywhere" : store.campaigns.get(r.scope)?.name ?? "?", canEdit: canEditRecord(req.user, r) })), canGlobal: req.user.isAdmin, canCreate: manager || req.user.isAdmin };
}));

app.post("/api/content/validate", wrap((req) => ({ errors: game.content.validate(asKind(req.body?.kind), req.body?.data) })));

app.post("/api/content", wrap((req) => {
  const kind = asKind(req.body?.kind);
  const global = req.body?.scope === "global";
  if (global && !req.user.isAdmin) throw new HttpError(403, "Only the site owner can add content for every campaign.");
  const c = global ? undefined : requireManage(req);
  const errors = game.content.validate(kind, req.body?.data);
  if (errors.length) throw new HttpError(400, `Fix these first: ${errors.slice(0, 6).join(" · ")}${errors.length > 6 ? ` (+${errors.length - 6} more)` : ""}`);
  const data = req.body.data as Record<string, unknown>;
  const name = nameOf(kind, data);
  const r: ContentRecord = { id: game.content.newId(kind, name), kind, scope: global ? "global" : c!.id, name, data, enabled: true, forSale: kind === "item" ? !!req.body?.forSale : undefined, createdBy: req.user.id, createdAt: Date.now(), updatedAt: Date.now() };
  store.saveContent(r);
  game.content.register(r);
  game.content.placeInCampaigns(r, !!req.body?.startUnlocked);
  game.broadcastCampaign();
  return { ok: true, record: r, message: `${name} added to ${global ? "every campaign" : c!.name}.` };
}));

app.put("/api/content/:id", wrap((req) => {
  const r = store.contents.get(req.params.id);
  if (!r) throw new HttpError(404, "Not found.");
  if (!canEditRecord(req.user, r)) throw new HttpError(403, "You can't edit that.");
  if (req.body?.data !== undefined) {
    const errors = game.content.validate(r.kind, req.body.data);
    if (errors.length) throw new HttpError(400, `Fix these first: ${errors.slice(0, 6).join(" · ")}`);
    r.data = req.body.data;
    r.name = nameOf(r.kind, r.data);
  }
  if (typeof req.body?.enabled === "boolean") r.enabled = req.body.enabled;
  if (typeof req.body?.forSale === "boolean" && r.kind === "item") r.forSale = req.body.forSale;
  r.updatedAt = Date.now();
  store.saveContent(r);
  game.content.register(r);
  if (req.body?.startUnlocked) game.content.placeInCampaigns(r, true);
  game.broadcastCampaign();
  return { ok: true, record: r, message: `${r.name} saved${typeof req.body?.enabled === "boolean" ? (r.enabled ? " and enabled" : " and hidden") : ""}.` };
}));

app.delete("/api/content/:id", wrap((req) => {
  const r = store.contents.get(req.params.id);
  if (!r) throw new HttpError(404, "Not found.");
  if (!canEditRecord(req.user, r)) throw new HttpError(403, "You can't delete that.");
  const inUse = [...store.adventures.values()].some((a) => (a.status === "exploring" || a.status === "combat") && (a.scenarioId === r.id || a.pendingEvent === r.id || JSON.stringify(a.encounter ?? "").includes(`"${r.id}"`)));
  if (inUse) throw new HttpError(400, "An adventure in progress is using it. Hide it instead, and delete it once that adventure ends.");
  store.deleteContent(r.id);
  game.content.removeFromCampaigns(r);
  if (r.kind === "lore" || r.kind === "event" || r.kind === "scenario") game.content.unregister(r);
  game.broadcastCampaign();
  return { ok: true, message: `${r.name} deleted.` };
}));

/** Ask the AI DM to draft content from a one-line idea (uses the campaign's AI key). Not saved until you save it. */
app.post("/api/content/draft", wrap(async (req) => {
  const kind = asKind(req.body?.kind);
  const c = requireManage(req);
  if (!aiAvailable(c)) throw new HttpError(400, "This campaign has no AI configured — add a key on the Campaign page (or write it by hand).");
  const idea = String(req.body?.idea ?? "").trim();
  if (idea.length < 5) throw new HttpError(400, "Describe what you want in a sentence.");
  const monsters = Object.values(MONSTERS).filter((m) => game.content.visibleId(m.id, c)).map((m) => `${m.id} (${m.name}, CR ${m.cr}, ${m.type})`).join("; ");
  const items = [...Object.keys(GEAR)].filter((id) => game.content.visibleId(id, c)).join(", ");
  const catalog = `Valid monster ids for encounters: ${monsters}\nValid item ids for item effects: ${items}\nValid skills: ${Object.keys(SKILL_ABILITY).join(", ")}\nMap legend: # wall, . floor, : difficult, ~ water, % cover. Coordinates are [x (column), y (row)], 0-based, and every creature must stand on . or :. Scenario node ids must match their keys.`;
  const parse = (txt: string) => { const a = txt.indexOf("{"), b = txt.lastIndexOf("}"); if (a < 0 || b < a) return null; try { return JSON.parse(txt.slice(a, b + 1)); } catch { return null; } };
  let raw = await draftContent(c, kind, idea, CONTENT_TEMPLATES[kind], catalog);
  let data = parse(raw);
  let errors = data ? game.content.validate(kind, data) : ["The draft wasn't valid JSON."];
  if (errors.length) {
    raw = await draftContent(c, kind, idea, CONTENT_TEMPLATES[kind], catalog, { previous: raw, errors });
    const fixed = parse(raw);
    if (fixed) { data = fixed; errors = game.content.validate(kind, fixed); }
  }
  store.saveCampaign(c); // AI usage was recorded on the campaign
  return { data, errors };
}));

app.post("/api/campaign/members/:userId/remove", wrap(async (req) => {
  const c = game.campaign();
  const self = req.params.userId === req.user.id;
  if (!self && !canManage(c, req.user)) throw new HttpError(403, "Only the owner can remove players.");
  const m = c.members?.find((x) => x.userId === req.params.userId);
  if (!m) throw new HttpError(404, "Not a member.");
  if (m.role === "owner") throw new HttpError(400, self ? "Hand the campaign to someone else before leaving." : "You can't remove the owner.");
  c.members = (c.members ?? []).filter((x) => x !== m);
  store.saveCampaign(c);
  // if they're no longer in any campaign, take them off the Cloudflare guest list too
  const u = store.users.get(req.params.userId);
  let note = "";
  if (u && !u.isAdmin && !campaignsFor(store, u).length && accessList.configured) {
    for (const e of emailsOfUser(u)) { try { if (await accessList.remove(e)) note = " They're no longer in any campaign, so their email was removed from the guest list."; } catch { /* best effort */ } }
  }
  game.broadcastCampaign();
  return { ok: true, message: `${u?.name ?? "Player"} ${self ? "left" : "was removed from"} ${c.name}.${note}` };
}));

// ---- the company: everyone can see who's adventuring
app.get("/api/roster", wrap(() => {
  const owners = store.users;
  const members = new Set((game.campaign().members ?? []).map((m) => m.userId));
  return {
    heroes: [...store.characters.values()].filter((c) => c.ownerId !== "ai" && members.has(c.ownerId)).map((c) => ({
      id: c.id, name: c.name, classId: c.classId, species: c.species, level: c.level, dead: c.dead, retired: c.retired, prestige: c.prestige,
      player: owners.get(c.ownerId)?.name ?? "?", onAdventure: !!c.activeAdventureId,
    })),
  };
}));

// ---- campaign owner tools
function requireAdmin(req: AuthedRequest) { if (!req.user.isAdmin) throw new HttpError(403, "Only the campaign owner can do that."); }

app.get("/api/admin/overview", wrap((req) => {
  requireAdmin(req);
  const chars = [...store.characters.values()];
  return {
    authMode: ACCESS ? "access" : "invite",
    campaigns: [...store.campaigns.values()].map((c) => {
      const v = manageView(store, c);
      return { id: c.id, name: c.name, ownerName: store.users.get(c.ownerUserId ?? "")?.name ?? "—", members: v.members.length, week: c.week, aiMode: v.ai.mode,
        useSiteKey: v.ai.useSiteKey, siteMonthlyCapUsd: v.ai.siteMonthlyCapUsd, siteUsd: v.ai.usage.siteUsd, ownUsd: v.ai.usage.ownUsd, month: v.ai.usage.month };
    }),
    users: [...store.users.values()].map((u) => ({ ...publicUser(u), createdAt: u.createdAt, lastSeen: u.lastSeen, characters: chars.filter((c) => c.ownerId === u.id).length, embers: game.rewards.wallet(u).embers })),
    characters: chars,
    adventures: [...store.adventures.values()].sort((a, b) => b.updatedAt - a.updatedAt).map((a) => ({
      id: a.id, title: a.title, status: a.status, dmMode: a.dmMode, startedAt: a.startedAt, updatedAt: a.updatedAt,
      host: store.users.get(a.hostUserId)?.name ?? "?", autonomous: !!a.autonomous,
      party: a.party.map((p) => ({ name: store.characters.get(p.characterId)?.name ?? "?", player: p.userId === "ai" ? "AI" : store.users.get(p.userId)?.name ?? "?" })),
    })),
  };
}));

app.post("/api/admin/users/:id", wrap(async (req) => {
  requireAdmin(req);
  let note = "";
  const u = store.users.get(req.params.id);
  if (!u) throw new HttpError(404, "No such player.");
  const b = req.body ?? {};
  if (b.email !== undefined) {
    const email = b.email ? String(b.email).trim().toLowerCase() : undefined;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "That doesn't look like an email address.");
    const other = email ? store.userByEmail(email) : undefined;
    if (other && other.id !== u.id) throw new HttpError(400, `${email} is already linked to ${other.name}. Merge the accounts instead.`);
    u.email = email;
    if (email && accessList.configured) {
      try { if (await accessList.add(email)) note = ` ${email} was added to the Cloudflare guest list.`; }
      catch (e) { note = ` (Couldn't update Cloudflare: ${(e as Error).message})`; }
    }
  }
  if (typeof b.name === "string" && b.name.trim()) u.name = b.name.trim().slice(0, 32);
  if (typeof b.canCreateCampaigns === "boolean") u.canCreateCampaigns = b.canCreateCampaigns;
  if (typeof b.isAdmin === "boolean") {
    if (!b.isAdmin && u.isAdmin && [...store.users.values()].filter((x) => x.isAdmin).length <= 1) throw new HttpError(400, "The campaign needs at least one owner.");
    u.isAdmin = b.isAdmin;
  }
  store.saveUser(u);
  return { user: publicUser(u), message: note ? `Saved.${note}` : undefined };
}));

// ---- guest list (Cloudflare Access policy) management
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const emailsOfUser = (u: UserRecord) => [u.email, ...(u.altEmails ?? [])].filter((e): e is string => !!e);

app.get("/api/admin/access", wrap(async (req) => {
  requireAdmin(req);
  const st = await accessList.status();
  const linked = new Set([...store.users.values()].flatMap(emailsOfUser));
  return { ...st, unlinked: st.emails.filter((e) => !linked.has(e)) };
}));

/** Invite a player by email: creates (or re-enables) their player and adds them to the Cloudflare guest list. */
app.post("/api/admin/invite", wrap(async (req) => {
  const camp = requireManage(req);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  let user = store.userByEmail(email);
  let created = false;
  if (!user) {
    let name = String(req.body?.name ?? "").trim().slice(0, 32) || email.split("@")[0];
    const taken = (n: string) => [...store.users.values()].some((u) => u.name.toLowerCase() === n.toLowerCase());
    if (taken(name)) {
      if (req.body?.name) throw new HttpError(400, `There's already a player called ${name}. Link the email to them in the table instead, or pick another name.`);
      let i = 2; while (taken(`${name}${i}`)) i++; name = `${name}${i}`;
    }
    user = { id: newId("usr"), name, token: "", isAdmin: false, createdAt: Date.now(), prestigePerks: [], email };
    created = true;
  }
  user.revoked = false;
  store.saveUser(user);
  addMember(camp, user.id);
  store.saveCampaign(camp);
  let cf = "";
  if (accessList.configured) {
    try { cf = (await accessList.add(email)) ? " and added to the Cloudflare guest list" : " (already on the Cloudflare guest list)"; }
    catch (e) { cf = `, but Cloudflare couldn't be updated: ${(e as Error).message}. Add the email to the Access policy by hand.`; }
  } else cf = ". Cloudflare sync isn't set up, so also add this email to the Access policy by hand";
  game.broadcastCampaign();
  return { ok: true, message: `${user.name} (${email}) ${created ? "invited to" : "added to"} ${camp.name}${cf}.` };
}));

/** Grant or remove a player's access. Removing keeps their characters; re-granting restores everything. */
app.post("/api/admin/users/:id/access", wrap(async (req) => {
  requireAdmin(req);
  const u = store.users.get(req.params.id);
  if (!u) throw new HttpError(404, "No such player.");
  const grant = !!req.body?.grant;
  const emails = emailsOfUser(u);
  if (!grant) {
    if (u.id === req.user.id) throw new HttpError(400, "You can't remove your own access.");
    if (emails.some((e) => adminEmails().includes(e))) throw new HttpError(400, "That email is listed in ADMIN_EMAILS.");
  }
  u.revoked = !grant;
  store.saveUser(u);
  const notes: string[] = [];
  if (accessList.configured) {
    for (const e of emails) {
      try { if (grant ? await accessList.add(e) : await accessList.remove(e)) notes.push(e); }
      catch (err) { notes.push(`${e} (Cloudflare error: ${(err as Error).message})`); }
    }
  }
  const cf = !accessList.configured ? " Cloudflare sync isn't set up — update the Access policy by hand." : notes.length ? ` Cloudflare guest list updated: ${notes.join(", ")}.` : "";
  return { ok: true, message: `${u.name} ${grant ? "can enter the tavern again" : "can no longer enter the tavern (characters are kept)"}.${cf}` };
}));

/** Remove an email from the Cloudflare guest list that isn't linked to any player. */
app.post("/api/admin/access/remove-email", wrap(async (req) => {
  requireAdmin(req);
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!accessList.configured) throw new HttpError(400, "Cloudflare sync isn't set up.");
  if (adminEmails().includes(email) || emailsOfUser(req.user).includes(email)) throw new HttpError(400, "That would lock you out.");
  const removed = await accessList.remove(email);
  return { ok: true, message: removed ? `${email} removed from the Cloudflare guest list.` : `${email} wasn't on the list.` };
}));

/** Move everything from one player to another (e.g. someone made a second account), then remove the empty one. */
app.post("/api/admin/users/:id/merge", wrap((req) => {
  requireAdmin(req);
  const from = store.users.get(req.params.id);
  const into = store.users.get(String(req.body?.intoUserId ?? ""));
  if (!from || !into || from.id === into.id) throw new HttpError(400, "Pick two different players.");
  let moved = 0;
  for (const c of store.characters.values()) if (c.ownerId === from.id) { c.ownerId = into.id; store.saveCharacter(c); moved++; }
  for (const a of store.adventures.values()) {
    let changed = false;
    if (a.hostUserId === from.id) { a.hostUserId = into.id; changed = true; }
    if (a.dmUserId === from.id) { a.dmUserId = into.id; changed = true; }
    for (const p of a.party) {
      if (p.userId === from.id) { p.userId = into.id; changed = true; }
      if (p.controller.kind === "human" && p.controller.userId === from.id) { p.controller = { kind: "human", userId: into.id }; changed = true; }
    }
    if (a.encounter) for (const c of a.encounter.combatants) if (c.controller.kind === "human" && c.controller.userId === from.id) c.controller = { kind: "human", userId: into.id };
    if (changed) store.saveAdventure(a);
  }
  into.prestigePerks = [...new Set([...(into.prestigePerks ?? []), ...(from.prestigePerks ?? [])])];
  // keep every login working: the merged account's emails also sign in to the target
  const emails = [from.email, ...(from.altEmails ?? [])].filter((e): e is string => !!e);
  for (const e of emails) {
    if (!into.email) into.email = e;
    else if (e !== into.email && !(into.altEmails ?? []).includes(e)) into.altEmails = [...(into.altEmails ?? []), e];
  }
  into.isAdmin = into.isAdmin || from.isAdmin;
  store.saveUser(into);
  store.deleteUser(from.id);
  game.broadcastCampaign();
  return { ok: true, message: `Moved ${moved} character(s) from ${from.name} to ${into.name}.` };
}));

/** The site owner lends the server's AI key to a campaign, optionally with a monthly cap. */
app.post("/api/admin/campaigns/:id/ai", wrap((req) => {
  requireAdmin(req);
  const c = store.campaigns.get(req.params.id);
  if (!c) throw new HttpError(404, "No such campaign.");
  c.ai = c.ai ?? {};
  if (typeof req.body?.useSiteKey === "boolean") c.ai.useSiteKey = req.body.useSiteKey;
  if (req.body?.siteMonthlyCapUsd === null || req.body?.siteMonthlyCapUsd === "") delete c.ai.siteMonthlyCapUsd;
  else if (req.body?.siteMonthlyCapUsd !== undefined) {
    const cap = Number(req.body.siteMonthlyCapUsd);
    if (!Number.isFinite(cap) || cap < 0 || cap > 10000) throw new HttpError(400, "Cap must be between 0 and 10000 USD.");
    c.ai.siteMonthlyCapUsd = cap;
  }
  store.saveCampaign(c);
  return { ok: true, message: `${c.name}: ${c.ai.useSiteKey ? `uses your key${c.ai.siteMonthlyCapUsd !== undefined ? ` up to $${c.ai.siteMonthlyCapUsd}/month` : " (no cap)"}` : "doesn't use your key"}.` };
}));

app.post("/api/admin/users/:id/embers", wrap((req) => {
  requireAdmin(req);
  const u = store.users.get(req.params.id);
  if (!u) throw new HttpError(404, "No such player.");
  const amount = Math.round(Number(req.body?.amount));
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10000) throw new HttpError(400, "Enter an amount between -10000 and 10000.");
  const reason = String(req.body?.reason ?? "").trim().slice(0, 80) || (amount > 0 ? `A gift from ${req.user.name}` : `Adjusted by ${req.user.name}`);
  game.rewards.award(u, amount, reason);
  return { ok: true, message: `${amount > 0 ? "Gave" : "Took"} ${Math.abs(amount)} Embers ${amount > 0 ? "to" : "from"} ${u.name}.` };
}));

app.post("/api/admin/characters/:id/owner", wrap((req) => {
  requireAdmin(req);
  const c = store.characters.get(req.params.id);
  if (!c) throw new HttpError(404, "No such character.");
  const ownerId = String(req.body?.ownerId ?? "");
  if (ownerId !== "ai" && !store.users.has(ownerId)) throw new HttpError(400, "Unknown player.");
  c.ownerId = ownerId;
  store.saveCharacter(c);
  game.broadcastCampaign();
  return { ok: true, message: `${c.name} now belongs to ${ownerId === "ai" ? "the tavern (AI companion)" : store.users.get(ownerId)!.name}.` };
}));

// ---- characters
app.get("/api/characters", wrap((req) => {
  const all = [...store.characters.values()];
  return {
    characters: all.filter((c) => c.ownerId === req.user.id),
    companions: all.filter((c) => c.ownerId === "ai" && !c.retired),
    // the campaign owner can open anyone's sheet (read-only)
    others: req.user.isAdmin ? all.filter((c) => c.ownerId !== req.user.id && c.ownerId !== "ai") : [],
  };
}));
app.get("/api/quests/draw", wrap(() => ({ options: town.drawQuests() })));
app.post("/api/characters/roll", wrap((req) => town.rollScores(req.user)));
app.post("/api/characters", wrap((req) => ({ character: town.create(req.user, req.body) })));
app.post("/api/characters/quick", wrap((req) => ({ character: town.quick(req.user, req.body) })));
app.post("/api/characters/:id/levelup", wrap((req) => town.levelUp(req.user, req.params.id, req.body ?? {})));
app.post("/api/characters/:id/rest", wrap((req) => town.rest(req.user, req.params.id, req.body?.type === "long" ? "long" : "short", Number(req.body?.hitDice ?? 1))));
app.post("/api/characters/:id/equip", wrap((req) => ({ character: town.equip(req.user, req.params.id, String(req.body?.itemId), !!req.body?.equipped) })));
app.post("/api/characters/:id/retire", wrap((req) => { const r = town.retire(req.user, req.params.id); game.broadcastCampaign(); return r; }));
app.post("/api/characters/:id/prestige", wrap((req) => ({ character: town.prestige(req.user, req.params.id) })));
app.delete("/api/characters/:id", wrap((req) => { town.remove(req.user, req.params.id); return { ok: true }; }));

// ---- campaign & town
app.get("/api/campaign", wrap((req) => town.view(req.user)));
const townOp = (fn: (req: AuthedRequest) => string) => wrap((req) => { const message = fn(req); game.broadcastCampaign(); return { ok: true, message }; });
app.post("/api/town/build", townOp((req) => town.build(String(req.body?.buildingId))));
app.post("/api/town/buy", townOp((req) => town.buy(req.user, String(req.body?.characterId), String(req.body?.itemId))));
app.post("/api/town/sell", townOp((req) => town.sell(req.user, String(req.body?.characterId), String(req.body?.itemId))));
app.post("/api/town/donate", townOp((req) => town.donate(req.user, String(req.body?.characterId), Number(req.body?.amount))));
app.post("/api/town/raise", townOp((req) => town.raiseDead(req.user, String(req.body?.characterId), req.body?.rite === "resurrect" ? "resurrect" : "raise")));
app.post("/api/campaign/settings", wrap((req) => {
  const c = requireManage(req);
  const s = req.body ?? {};
  for (const k of ["hardcore", "aiDm", "aiCompanionBanter", "autoReactions", "allowAutonomousParties", "flanking"] as const) if (typeof s[k] === "boolean") c.settings[k] = s[k];
  if (["story", "normal", "hard", "brutal"].includes(s.difficulty)) {
    c.settings.difficulty = s.difficulty;
    c.chronicle.push({ week: c.week, text: `The campaign difficulty is now ${s.difficulty}.` });
  }
  if (typeof s.maxPartySize === "number") c.settings.maxPartySize = Math.max(1, Math.min(8, s.maxPartySize));
  store.saveCampaign(c);
  game.broadcastCampaign();
  return { settings: c.settings };
}));

// ---- adventures
app.get("/api/adventures", wrap(() => ({ adventures: game.summaries() })));
app.post("/api/adventures", wrap(async (req) => {
  const body = req.body as NewAdventureRequest;
  const companions = (body.companionIds ?? []).filter((id) => !(body.characterIds ?? []).includes(id));
  const aiCount = body.autonomous ? 0 : companions.length;
  if (aiCount > town.maxCompanions()) throw new HttpError(400, `The Broken Lantern can only supply ${town.maxCompanions()} AI companions per party right now. Upgrade the tavern for more.`);
  const adv = await game.createAdventure(req.user, body);
  return { view: game.view(adv, req.user.id) };
}));
app.get("/api/adventures/:id", wrap((req) => { const a = game.getAdventure(req.params.id); requireMemberOf(req, a.campaignId); return { view: game.view(a, req.user.id) }; }));
app.post("/api/adventures/:id/join", wrap(async (req) => { requireMemberOf(req, game.getAdventure(req.params.id).campaignId); return { view: game.view(await game.join(req.user, req.params.id, String(req.body?.characterId)), req.user.id) }; }));
app.post("/api/adventures/:id/act", wrap(async (req) => {
  requireMemberOf(req, game.getAdventure(req.params.id).campaignId);
  const adv = await game.act(req.user, req.params.id, req.body?.characterId, req.body?.action);
  return { view: game.view(adv, req.user.id) };
}));

// ---- server management: version and in-game updates (via the updater container)
const STARTED_AT = Date.now();
const APP_VERSION = process.env.APP_VERSION || "dev";
const UPDATER_URL = process.env.UPDATER_URL || "";
const UPDATER_SECRET = process.env.UPDATER_SECRET || "";
async function updater<T>(method: "GET" | "POST", p: string): Promise<T> {
  if (!UPDATER_URL || UPDATER_SECRET.length < 16) throw new HttpError(503, "In-game updates aren't set up yet. Run ./scripts/update.sh once on the server to enable them.");
  let res: globalThis.Response;
  try { res = await fetch(`${UPDATER_URL}${p}`, { method, headers: { "x-updater-secret": UPDATER_SECRET }, signal: AbortSignal.timeout(60_000) }); }
  catch { throw new HttpError(503, "The updater container isn't reachable. Run ./scripts/update.sh once on the server to start it."); }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HttpError(res.status === 409 ? 409 : 502, body.error ?? `Updater error (${res.status})`);
  return body;
}
app.get("/api/admin/server", wrap(async (req) => {
  requireAdmin(req);
  const base = { version: APP_VERSION, startedAt: STARTED_AT, node: process.version, campaigns: store.campaigns.size, users: store.users.size, adventures: store.adventures.size };
  try { return { ...base, updater: { ok: true, ...(await updater<Record<string, unknown>>("GET", "/status")) } }; }
  catch (e) { return { ...base, updater: { ok: false, error: (e as Error).message } }; }
}));
app.post("/api/admin/server/update", wrap(async (req) => {
  requireAdmin(req);
  const st = await updater<{ job?: { running?: boolean } }>("GET", "/status");
  if (st.job?.running) throw new HttpError(409, "An update is already running.");
  const backup = path.basename(store.backup(path.join(DATA_DIR, "backups"), BACKUP_KEEP + 1));
  await updater("POST", "/update");
  return { ok: true, message: `Backed up (${backup}) and started the update. The game will restart in a few minutes.` };
}));

const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 14);
app.post("/api/admin/backup", wrap((req) => {
  if (!req.user.isAdmin) throw new HttpError(403, "Only the campaign owner can do that.");
  return { file: path.basename(store.backup(path.join(DATA_DIR, "backups"), BACKUP_KEEP)) };
}));

app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found" }); });

// ---- static web client
if (fs.existsSync(WEB_DIST)) {
  // browsers ask for /favicon.ico regardless of <link> tags; answer with the lantern
  app.get("/favicon.ico", (_req, res) => res.type("image/png").sendFile(path.join(WEB_DIST, "favicon-32.png")));
  app.use(express.static(WEB_DIST));
  app.get("*", (_req, res) => res.sendFile(path.join(WEB_DIST, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err instanceof Error ? err.message : "Server error" });
});

// ---- websocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
interface Client { ws: WebSocket; user: UserRecord; adventureId?: string }
const clients = new Set<Client>();

wss.on("connection", async (ws, req) => {
  const token = new URL(req.url ?? "", "http://x").searchParams.get("token") ?? "";
  const { user } = await resolveUser(req.headers, token);
  if (!user || user.revoked) { ws.close(4001, "unauthorized"); return; }
  const client: Client = { ws, user };
  clients.add(client);
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg?.type === "subscribe" && typeof msg.adventureId === "string") {
        const adv = store.adventures.get(msg.adventureId);
        const c = adv ? store.campaigns.get(adv.campaignId) : undefined;
        if (!adv || !c || !roleIn(c, user)) return; // only members may watch
        client.adventureId = msg.adventureId;
        send(client, { type: "adventure", view: game.view(adv, user.id) });
      }
    } catch { /* ignore */ }
  });
  ws.on("close", () => clients.delete(client));
});

function send(c: Client, m: ServerMessage) {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(m));
}
game.broadcast = (adventureId: string, view: (userId: string) => AdventureView) => {
  for (const c of clients) if (c.adventureId === adventureId) send(c, { type: "adventure", view: view(c.user.id) });
};
game.broadcastCampaign = () => { for (const c of clients) send(c, { type: "campaign" }); };

// ---- nightly backups into DATA_DIR/backups (BACKUP_HOURS=0 disables)
const BACKUP_HOURS = Number(process.env.BACKUP_HOURS ?? 24);
if (BACKUP_HOURS > 0) {
  const run = () => { try { console.log(`Backup written: ${store.backup(path.join(DATA_DIR, "backups"), BACKUP_KEEP)}`); } catch (e) { console.error("Backup failed:", e); } };
  setTimeout(run, 60_000).unref();
  setInterval(run, BACKUP_HOURS * 3600_000).unref();
}

server.listen(PORT, () => {
  console.log(`🏮 Emberfall is open on http://localhost:${PORT}  (site AI key: ${siteKeyConfigured() ? "configured" : "not set — campaigns can bring their own"}; ${ACCESS ? `sign-in: Cloudflare Access (${ACCESS.teamDomain})${ALLOW_INVITE_LOGIN ? " + invite code" : ""}` : `invite code: ${INVITE_CODE === "emberfall" ? "emberfall (default — set INVITE_CODE!)" : "set"}`})`);
});
