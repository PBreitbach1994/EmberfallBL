import { useCallback, useEffect, useState } from "react";
import type { AdminOverview } from "@tavern/engine";
import { CLASSES, SPECIES } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, toast } from "../api";
import { Pill } from "../components/ui";

const when = (t?: number) => (t ? new Date(t).toLocaleString() : "never");

export function Admin({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<"players" | "characters" | "adventures">("players");
  const [filter, setFilter] = useState("");
  const load = useCallback(async () => {
    const r = await attempt(() => api<AdminOverview>("/admin/overview"));
    if (r) setData(r);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!ctx.user.isAdmin) return <div className="panel">Only the campaign owner can see this page.</div>;
  if (!data) return <div className="panel">Opening the ledger…</div>;

  const post = async (path: string, body: unknown) => {
    const r = await attempt(() => api<{ message?: string }>(path, { body }));
    if (r) { if (r.message) toast(r.message, "info"); await load(); await ctx.refreshCharacters(); }
  };
  const userName = (id: string) => (id === "ai" ? "Tavern (AI companion)" : data.users.find((u) => u.id === id)?.name ?? "?");
  const f = filter.toLowerCase();

  return (
    <div className="admin">
      <section className="panel">
        <h1>The Ledger</h1>
        <p className="muted">Everything in the campaign: players, every character, and every adventure. Sign-in mode: <strong>{data.authMode === "access" ? "Google (Cloudflare Access)" : "invite code"}</strong>.</p>
        <div className="tabs">
          <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}>Players ({data.users.length})</button>
          <button className={tab === "characters" ? "active" : ""} onClick={() => setTab("characters")}>Characters ({data.characters.length})</button>
          <button className={tab === "adventures" ? "active" : ""} onClick={() => setTab("adventures")}>Adventures ({data.adventures.length})</button>
        </div>
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </section>

      {tab === "players" && (
        <section className="panel">
          <p className="muted">Link each player's Google email so they land on their existing account when they sign in. If someone made a second account by accident, merge it into the right one — characters and adventures move with it.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Google email</th><th>Chars</th><th>Last seen</th><th>Owner</th><th>Merge into…</th></tr></thead>
              <tbody>
                {data.users.filter((u) => !f || u.name.toLowerCase().includes(f) || (u.email ?? "").includes(f)).map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong>{u.id === ctx.user.id && <> <Pill>you</Pill></>}</td>
                    <td><EmailCell email={u.email} onSave={(email) => post(`/admin/users/${u.id}`, { email })} />{u.altEmails?.length ? <div className="small muted">also: {u.altEmails.join(", ")}</div> : null}</td>
                    <td>{u.characters}</td>
                    <td className="small">{when(u.lastSeen)}</td>
                    <td><input type="checkbox" checked={u.isAdmin} onChange={(e) => post(`/admin/users/${u.id}`, { isAdmin: e.target.checked })} /></td>
                    <td>
                      <select value="" onChange={(e) => { const into = e.target.value; if (into && confirm(`Move everything from ${u.name} into ${userName(into)} and remove ${u.name}?`)) post(`/admin/users/${u.id}/merge`, { intoUserId: into }); }}>
                        <option value="">—</option>
                        {data.users.filter((x) => x.id !== u.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "characters" && (
        <section className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Character</th><th>Class</th><th>Lvl / XP</th><th>HP</th><th>Gold</th><th>Status</th><th>Belongs to</th><th></th></tr></thead>
              <tbody>
                {data.characters
                  .filter((c) => !f || c.name.toLowerCase().includes(f) || userName(c.ownerId).toLowerCase().includes(f))
                  .sort((a, b) => userName(a.ownerId).localeCompare(userName(b.ownerId)) || a.name.localeCompare(b.name))
                  .map((c) => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong>{c.prestige ? ` ★${c.prestige}` : ""}</td>
                      <td>{SPECIES[c.species]?.name} {CLASSES[c.classId]?.name}</td>
                      <td>{c.level} / {c.xp}</td>
                      <td>{c.hp}/{c.maxHp}</td>
                      <td>{Math.floor(c.gold)}</td>
                      <td>{c.dead ? <Pill kind="bad">dead</Pill> : c.retired ? <Pill>retired</Pill> : c.activeAdventureId ? <Pill kind="warn">adventuring</Pill> : <Pill>in town</Pill>}</td>
                      <td>
                        <select value={c.ownerId} onChange={(e) => post(`/admin/characters/${c.id}/owner`, { ownerId: e.target.value })}>
                          <option value="ai">Tavern (AI companion)</option>
                          {data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      </td>
                      <td><button className="linkbtn" onClick={() => ctx.go({ name: "sheet", id: c.id })}>Sheet</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "adventures" && (
        <section className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Scenario</th><th>Status</th><th>Host</th><th>Party</th><th>DM</th><th>Last activity</th><th></th></tr></thead>
              <tbody>
                {data.adventures.filter((a) => !f || a.title.toLowerCase().includes(f) || a.host.toLowerCase().includes(f)).map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.title}</strong>{a.autonomous && <> <Pill>AI party</Pill></>}</td>
                    <td>{a.status}</td>
                    <td>{a.host}</td>
                    <td className="small">{a.party.map((p) => `${p.name} (${p.player})`).join(", ")}</td>
                    <td>{a.dmMode}</td>
                    <td className="small">{when(a.updatedAt)}</td>
                    <td><button className="linkbtn" onClick={() => ctx.go({ name: "adventure", id: a.id })}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function EmailCell({ email, onSave }: { email?: string; onSave: (email: string | null) => void }) {
  const [v, setV] = useState(email ?? "");
  useEffect(() => setV(email ?? ""), [email]);
  const dirty = v.trim().toLowerCase() !== (email ?? "");
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <input type="email" placeholder="not linked" value={v} onChange={(e) => setV(e.target.value)} style={{ minWidth: 180 }} />
      {dirty && <button onClick={() => onSave(v.trim() ? v.trim() : null)}>Save</button>}
    </span>
  );
}
