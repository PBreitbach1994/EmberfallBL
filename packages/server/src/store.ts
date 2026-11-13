// Persistence: a tiny JSON document store on top of Node's built-in SQLite.
// Everything is held in memory and written through on change; the process is the source of truth.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { AdventureState, CampaignState, CharacterSheet } from "@tavern/engine";

export interface UserRecord {
  id: string;
  name: string;
  token: string;
  isAdmin: boolean;
  createdAt: number;
  prestigePerks: string[];
}

type Kind = "user" | "character" | "campaign" | "adventure" | "meta";

export class Store {
  private db: DatabaseSync;
  users = new Map<string, UserRecord>();
  characters = new Map<string, CharacterSheet>();
  campaigns = new Map<string, CampaignState>();
  adventures = new Map<string, AdventureState>();
  meta = new Map<string, unknown>();

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS docs (kind TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (kind, id));`);
    const rows = this.db.prepare("SELECT kind, id, json FROM docs").all() as { kind: Kind; id: string; json: string }[];
    for (const r of rows) {
      const v = JSON.parse(r.json);
      if (r.kind === "user") this.users.set(r.id, v);
      else if (r.kind === "character") this.characters.set(r.id, v);
      else if (r.kind === "campaign") this.campaigns.set(r.id, v);
      else if (r.kind === "adventure") this.adventures.set(r.id, v);
      else this.meta.set(r.id, v);
    }
  }

  private write(kind: Kind, id: string, value: unknown) {
    this.db.prepare("INSERT INTO docs (kind, id, json, updated) VALUES (?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET json = excluded.json, updated = excluded.updated")
      .run(kind, id, JSON.stringify(value), Date.now());
  }
  private remove(kind: Kind, id: string) {
    this.db.prepare("DELETE FROM docs WHERE kind = ? AND id = ?").run(kind, id);
  }

  saveUser(u: UserRecord) { this.users.set(u.id, u); this.write("user", u.id, u); }
  saveCharacter(c: CharacterSheet) { this.characters.set(c.id, c); this.write("character", c.id, c); }
  deleteCharacter(id: string) { this.characters.delete(id); this.remove("character", id); }
  saveCampaign(c: CampaignState) { this.campaigns.set(c.id, c); this.write("campaign", c.id, c); }
  saveAdventure(a: AdventureState) {
    // keep the persisted log bounded
    if (a.log.length > 1500) a.log = a.log.slice(-1200);
    this.adventures.set(a.id, a);
    this.write("adventure", a.id, a);
  }
  saveMeta(id: string, v: unknown) { this.meta.set(id, v); this.write("meta", id, v); }

  /** Consistent online backup (safe while the game is running), keeping the newest `keep` files. */
  backup(dir: string, keep = 14): string {
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = path.join(dir, `emberfall-${stamp}.db`);
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = fs.readdirSync(dir).filter((f) => /^emberfall-.*\.db$/.test(f)).sort();
    for (const f of old.slice(0, Math.max(0, old.length - keep))) fs.unlinkSync(path.join(dir, f));
    return file;
  }

  userByToken(token: string): UserRecord | undefined {
    for (const u of this.users.values()) if (u.token === token) return u;
    return undefined;
  }
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
export const newToken = () => crypto.randomBytes(24).toString("base64url");
