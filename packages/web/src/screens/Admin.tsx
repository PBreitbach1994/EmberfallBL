import { useCallback, useEffect, useState } from "react";
import type { AccessListView, AdminOverview } from "@tavern/engine";
import { CLASSES, SPECIES } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, toast } from "../api";
import { Pill } from "../components/ui";

const when = (t?: number) => (t ? new Date(t).toLocaleString() : "never");

export function Admin({ ctx }: { ctx: AppCtx }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [tab, setTab] = useState<"players" | "campaigns" | "characters" | "adventures">("players");
  const [filter, setFilter] = useState("");
  const [access, setAccess] = useState<AccessListView | null>(null);
  const load = useCallback(async () => {
    const r = await attempt(() => api<AdminOverview>("/admin/overview"));
    if (r) setData(r);
    const a = await attempt(() => api<AccessListView>("/admin/access"));
    if (a) setAccess(a);
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
        <p className="muted">Everything on this server: every player, campaign, character and adventure. Sign-in mode: <strong>{data.authMode === "access" ? "Cloudflare Access (email)" : "invite code"}</strong>.</p>
        <div className="tabs">
          <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}>Players ({data.users.length})</button>
          <button className={tab === "campaigns" ? "active" : ""} onClick={() => setTab("campaigns")}>Campaigns ({data.campaigns.length})</button>
          <button className={tab === "characters" ? "active" : ""} onClick={() => setTab("characters")}>Characters ({data.characters.length})</button>
          <button className={tab === "adventures" ? "active" : ""} onClick={() => setTab("adventures")}>Adventures ({data.adventures.length})</button>
        </div>
        <input placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </section>

      {tab === "players" && <InvitePanel access={access} onInvite={(email, name) => post("/admin/invite", { email, name })} onRemoveEmail={(email) => { if (confirm(`Remove ${email} from the Cloudflare guest list?`)) post("/admin/access/remove-email", { email }); }} />}

      {tab === "players" && (
        <section className="panel">
          <p className="muted">Link each player's sign-in email so they land on their existing account when they sign in. If someone made a second account by accident, merge it into the right one — characters and adventures move with it.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Sign-in email</th><th>Access</th><th title="May start their own campaigns">Can start campaigns</th><th>🔥 Embers</th><th>Chars</th><th>Last seen</th><th>Owner</th><th>Merge into…</th></tr></thead>
              <tbody>
                {data.users.filter((u) => !f || u.name.toLowerCase().includes(f) || (u.email ?? "").includes(f)).map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong>{u.id === ctx.user.id && <> <Pill>you</Pill></>}</td>
                    <td><EmailCell email={u.email} onSave={(email) => post(`/admin/users/${u.id}`, { email })} />{u.altEmails?.length ? <div className="small muted">also: {u.altEmails.join(", ")}</div> : null}</td>
                    <td>
                      {u.revoked ? <Pill kind="bad">removed</Pill> : access?.configured && u.email && !access.error ? (access.emails.includes(u.email) ? <Pill>on guest list</Pill> : <Pill kind="warn">not on list</Pill>) : null}
                      {u.id !== ctx.user.id && (u.revoked
                        ? <button className="linkbtn" onClick={() => post(`/admin/users/${u.id}/access`, { grant: true })}>Restore</button>
                        : <button className="linkbtn" onClick={() => { if (confirm(`Remove ${u.name}'s access? Their characters are kept and you can restore them later.`)) post(`/admin/users/${u.id}/access`, { grant: false }); }}>Remove</button>)}
                      {!u.revoked && u.email && access?.configured && !access.error && !access.emails.includes(u.email) && <button className="linkbtn" onClick={() => post(`/admin/users/${u.id}/access`, { grant: true })}>Add to list</button>}
                    </td>
                    <td><input type="checkbox" checked={!!u.canCreateCampaigns} disabled={u.isAdmin} onChange={(e) => post(`/admin/users/${u.id}`, { canCreateCampaigns: e.target.checked })} /></td>
                    <td>
                      {u.embers ?? 0}{" "}
                      <button className="linkbtn" onClick={() => { const v = prompt(`Give ${u.name} how many Embers? (negative to take)`, "25"); const n = Number(v); if (v && n) post(`/admin/users/${u.id}/embers`, { amount: n }); }}>Gift</button>
                    </td>
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

      {tab === "campaigns" && (
        <section className="panel">
          <p className="muted">Every campaign on this server. Owners can bring their own Anthropic key; you can also lend a campaign the server's key with a monthly cap (estimated from token counts). When a cap is reached that campaign falls back to the Scripted DM until next month.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Campaign</th><th>Owner</th><th>Members</th><th>Week</th><th>AI</th><th>Lend my key</th><th>Monthly cap ($)</th><th>This month</th><th></th></tr></thead>
              <tbody>
                {data.campaigns.filter((c) => !f || c.name.toLowerCase().includes(f) || c.ownerName.toLowerCase().includes(f)).map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td>{c.ownerName}</td>
                    <td>{c.members}</td>
                    <td>{c.week}</td>
                    <td>{c.aiMode === "own-key" ? <Pill>own key</Pill> : c.aiMode === "site-key" ? <Pill>your key</Pill> : <Pill kind="warn">off</Pill>}</td>
                    <td><input type="checkbox" checked={c.useSiteKey} onChange={(e) => post(`/admin/campaigns/${c.id}/ai`, { useSiteKey: e.target.checked })} /></td>
                    <td><CapCell cap={c.siteMonthlyCapUsd} onSave={(v) => post(`/admin/campaigns/${c.id}/ai`, { siteMonthlyCapUsd: v })} /></td>
                    <td className="small">your key ${c.siteUsd.toFixed(2)} · theirs ${c.ownUsd.toFixed(2)}</td>
                    <td><button className="linkbtn" onClick={() => ctx.switchCampaign(c.id)}>Open</button></td>
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

function InvitePanel({ access, onInvite, onRemoveEmail }: { access: AccessListView | null; onInvite: (email: string, name: string) => void; onRemoveEmail: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  return (
    <section className="panel">
      <h2>Invite a player</h2>
      <form className="row" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-end" }} onSubmit={(e) => { e.preventDefault(); if (email.trim()) { onInvite(email.trim(), name.trim()); setEmail(""); setName(""); } }}>
        <label>Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" /></label>
        <label>Name in the tavern (optional)<input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="defaults to the email name" /></label>
        <button className="primary">Invite</button>
      </form>
      <p className="small muted">
        {!access ? "Checking the Cloudflare guest list…"
          : !access.configured ? "Cloudflare sync isn't set up: invites create the player here, but you'll also need to add their email to the Access policy in Cloudflare. (Set CF_API_TOKEN and CF_ACCOUNT_ID to automate this.)"
          : access.error ? `Cloudflare guest list unavailable: ${access.error}`
          : `Invites are added to the Cloudflare policy “${access.policyName}” automatically (${access.emails.length} email${access.emails.length === 1 ? "" : "s"} on it).`}
      </p>
      {access?.unlinked?.length ? (
        <div className="small">
          On the guest list but not linked to a player (they'll be asked to pick a name or claim an account on first visit):
          <ul className="roster">{access.unlinked.map((e) => <li key={e}>{e} <button className="linkbtn" onClick={() => onRemoveEmail(e)}>Remove from list</button></li>)}</ul>
        </div>
      ) : null}
    </section>
  );
}

function CapCell({ cap, onSave }: { cap?: number; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(cap === undefined ? "" : String(cap));
  useEffect(() => setV(cap === undefined ? "" : String(cap)), [cap]);
  const dirty = v !== (cap === undefined ? "" : String(cap));
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <input type="number" min={0} step={1} placeholder="no cap" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 90 }} />
      {dirty && <button onClick={() => onSave(v === "" ? null : Number(v))}>Save</button>}
    </span>
  );
}
