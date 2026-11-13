// HTTP + WebSocket server for Emberfall.
import express, { type NextFunction, type Request, type Response } from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { NewAdventureRequest, ServerMessage, AdventureView } from "@tavern/engine";
import { Store, newId, newToken, type UserRecord } from "./store.js";
import { Game, HttpError } from "./game.js";
import { Town } from "./town.js";
import { aiAvailable } from "./dm.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.resolve(here, "../../../data");
const INVITE_CODE = process.env.INVITE_CODE || "emberfall";
const WEB_DIST = process.env.WEB_DIST || path.resolve(here, "../../web/dist");

const store = new Store(path.join(DATA_DIR, "emberfall.db"));
const game = new Game(store);
const town = new Town(game);

const app = express();
app.use(express.json({ limit: "256kb" }));

type AuthedRequest = Request & { user: UserRecord };

function auth(req: Request, _res: Response, next: NextFunction) {
  const h = req.header("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const user = token ? store.userByToken(token) : undefined;
  if (!user) return next(new HttpError(401, "Please sign in."));
  (req as AuthedRequest).user = user;
  next();
}
const wrap = (fn: (req: AuthedRequest, res: Response) => unknown) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    const out = await fn(req as AuthedRequest, res);
    if (!res.headersSent) res.json(out ?? { ok: true });
  } catch (e) { next(e); }
};

// ---- auth
app.post("/api/auth/join", wrap((req) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 32);
  const code = String(req.body?.inviteCode ?? "");
  if (!name) throw new HttpError(400, "Enter a name.");
  if (code !== INVITE_CODE) throw new HttpError(403, "That invite code isn't right.");
  // returning player with the same name gets a fresh token on the same account
  let user = [...store.users.values()].find((u) => u.name.toLowerCase() === name.toLowerCase());
  if (!user) user = { id: newId("usr"), name, token: "", isAdmin: store.users.size === 0, createdAt: Date.now(), prestigePerks: [] };
  user.token = newToken();
  store.saveUser(user);
  return { user: { id: user.id, name: user.name, isAdmin: user.isAdmin }, token: user.token };
}));
app.get("/api/health", (_req, res) => { res.json({ ok: true, ai: aiAvailable() }); });

app.use("/api", auth);
app.get("/api/me", wrap((req) => ({ user: { id: req.user.id, name: req.user.name, isAdmin: req.user.isAdmin } })));

// ---- characters
app.get("/api/characters", wrap((req) => {
  const all = [...store.characters.values()];
  return { characters: all.filter((c) => c.ownerId === req.user.id), companions: all.filter((c) => c.ownerId === "ai" && !c.retired) };
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
app.get("/api/campaign", wrap(() => town.view()));
const townOp = (fn: (req: AuthedRequest) => string) => wrap((req) => { const message = fn(req); game.broadcastCampaign(); return { ok: true, message }; });
app.post("/api/town/build", townOp((req) => town.build(String(req.body?.buildingId))));
app.post("/api/town/buy", townOp((req) => town.buy(req.user, String(req.body?.characterId), String(req.body?.itemId))));
app.post("/api/town/sell", townOp((req) => town.sell(req.user, String(req.body?.characterId), String(req.body?.itemId))));
app.post("/api/town/donate", townOp((req) => town.donate(req.user, String(req.body?.characterId), Number(req.body?.amount))));
app.post("/api/town/raise", townOp((req) => town.raiseDead(req.user, String(req.body?.characterId))));
app.post("/api/campaign/settings", wrap((req) => {
  if (!req.user.isAdmin) throw new HttpError(403, "Only the campaign owner can change settings.");
  const c = game.campaign();
  const s = req.body ?? {};
  for (const k of ["hardcore", "aiDm", "aiCompanionBanter", "autoReactions", "allowAutonomousParties", "flanking"] as const) if (typeof s[k] === "boolean") c.settings[k] = s[k];
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
app.get("/api/adventures/:id", wrap((req) => ({ view: game.view(game.getAdventure(req.params.id), req.user.id) })));
app.post("/api/adventures/:id/join", wrap(async (req) => ({ view: game.view(await game.join(req.user, req.params.id, String(req.body?.characterId)), req.user.id) })));
app.post("/api/adventures/:id/act", wrap(async (req) => {
  const adv = await game.act(req.user, req.params.id, req.body?.characterId, req.body?.action);
  return { view: game.view(adv, req.user.id) };
}));

const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 14);
app.post("/api/admin/backup", wrap((req) => {
  if (!req.user.isAdmin) throw new HttpError(403, "Only the campaign owner can do that.");
  return { file: path.basename(store.backup(path.join(DATA_DIR, "backups"), BACKUP_KEEP)) };
}));

app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found" }); });

// ---- static web client
if (fs.existsSync(WEB_DIST)) {
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

wss.on("connection", (ws, req) => {
  const token = new URL(req.url ?? "", "http://x").searchParams.get("token") ?? "";
  const user = store.userByToken(token);
  if (!user) { ws.close(4001, "unauthorized"); return; }
  const client: Client = { ws, user };
  clients.add(client);
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg?.type === "subscribe" && typeof msg.adventureId === "string") {
        client.adventureId = msg.adventureId;
        const adv = store.adventures.get(msg.adventureId);
        if (adv) send(client, { type: "adventure", view: game.view(adv, user.id) });
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
  console.log(`🏮 Emberfall is open on http://localhost:${PORT}  (AI DM: ${aiAvailable() ? "enabled" : "disabled — set ANTHROPIC_API_KEY"}; invite code: ${INVITE_CODE === "emberfall" ? "emberfall (default — set INVITE_CODE!)" : "set"})`);
});
