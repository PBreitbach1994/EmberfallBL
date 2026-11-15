// Multi-campaign screens: the switcher, the welcome page for players with no campaign yet,
// and the owner's Campaign page (members, invites, join code, AI key and usage).
import { useCallback, useEffect, useState } from "react";
import type { CampaignManageView, CampaignSummary, ClassId } from "@tavern/engine";
import { CLASSES } from "@tavern/engine";
import { BUILDINGS, SCENARIOS } from "@tavern/engine/content";
import type { AppCtx } from "../App";
import { api, attempt, errText, toast } from "../api";
import { Pill } from "../components/ui";

export function CampaignSwitcher({ ctx }: { ctx: AppCtx }) {
  if (!ctx.campaigns || ctx.campaigns.length < 1) return null;
  return (
    <select className="campaign-switcher" value={ctx.campaignId ?? ""} onChange={(e) => {
      if (e.target.value === "__new") { ctx.go({ name: "welcome" }); return; }
      ctx.switchCampaign(e.target.value);
    }} title="Switch campaign">
      {ctx.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role === "owner" ? " ★" : c.role === "site-admin" ? " (admin view)" : ""}</option>)}
      <option value="__new">＋ Join or start a campaign…</option>
    </select>
  );
}

/** Join with a code, or start a new campaign (approved creators). */
export function Welcome({ ctx }: { ctx: AppCtx }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const none = !ctx.campaigns?.length;
  const run = async (fn: () => Promise<{ campaign: CampaignSummary }>) => {
    setBusy(true);
    try { const r = await fn(); await ctx.refreshCampaigns(); ctx.switchCampaign(r.campaign.id); toast(`Welcome to ${r.campaign.name}!`, "info"); }
    catch (e) { toast(errText(e), "error"); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack welcome">
      <section className="panel">
        <h1>{none ? "Welcome to the Broken Lantern" : "Join or start a campaign"}</h1>
        <p className="muted">{none
          ? "You're signed in, but you haven't joined a company yet. Every campaign is its own Emberfall: its own town, story and chronicle. Your heroes, Embers and Curio Shop treasures travel with you between campaigns."
          : "Your heroes, Embers and cosmetics come with you to every campaign you join."}</p>
      </section>
      <section className="panel">
        <h2>Join with a code</h2>
        <p className="small muted">Ask a campaign owner for their join code — it looks like <code>ember-lantern-123</code>.</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (code.trim()) run(() => api("/campaigns/join", { body: { code: code.trim() } })); }}>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ember-lantern-123" />
          <button className="primary" disabled={busy || !code.trim()}>Join</button>
        </form>
      </section>
      <section className="panel">
        <h2>Start your own campaign</h2>
        {ctx.canCreate ? (
          <>
            <p className="small muted">You'll be its owner: invite friends, set the difficulty, and choose how the AI Dungeon Master is paid for.</p>
            <form className="row" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 3) run(() => api("/campaigns", { body: { name: name.trim() } })); }}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={48} placeholder="The Iron Company" />
              <button className="primary" disabled={busy || name.trim().length < 3}>Start campaign</button>
            </form>
          </>
        ) : <p className="small muted">Starting campaigns is by approval — ask the site owner to enable it for you.</p>}
      </section>
    </div>
  );
}

/** The campaign owner's control room. */
export function CampaignPage({ ctx }: { ctx: AppCtx }) {
  const [v, setV] = useState<CampaignManageView | null>(null);
  const [email, setEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [key, setKey] = useState("");
  const [rename, setRename] = useState("");
  const load = useCallback(async () => { const r = await attempt(() => api<CampaignManageView>("/campaign/manage")); if (r) { setV(r); setRename(r.name); } }, []);
  useEffect(() => { load(); }, [load, ctx.campaignId]);
  if (!v) return <div className="panel">Opening the company ledger…</div>;
  const post = async (path: string, body: unknown, msg?: string) => {
    const r = await attempt(() => api<CampaignManageView & { message?: string }>(path, { body }));
    if (r) { toast(r.message ?? msg ?? "Saved.", "info"); await load(); await ctx.refreshCampaigns(); await ctx.refreshCampaign(); }
    return r;
  };
  const usage = v.ai.usage;
  return (
    <div className="stack campaign-page">
      <section className="panel">
        <h1>{v.name}</h1>
        <form className="row" onSubmit={(e) => { e.preventDefault(); post("/campaign/manage", { name: rename }, "Renamed."); }}>
          <input value={rename} onChange={(e) => setRename(e.target.value)} maxLength={48} />
          <button disabled={rename.trim() === v.name || rename.trim().length < 3}>Rename</button>
        </form>
        <h3>Join code</h3>
        <div className="row">
          <code className="join-code">{v.joinCode}</code>
          <button onClick={() => { navigator.clipboard?.writeText(v.joinCode); toast("Copied.", "info"); }}>Copy</button>
          <button onClick={() => { if (confirm("Make a new code? The old one stops working.")) post("/campaign/manage", { newJoinCode: true }, "New join code made."); }}>New code</button>
        </div>
        <p className="small muted">Anyone who can already sign in to the tavern can join with this code. To bring in someone new, invite them by email below — that also lets them through the sign-in page.</p>
      </section>

      <section className="panel">
        <h2>Invite a player</h2>
        <form className="row" style={{ flexWrap: "wrap" }} onSubmit={async (e) => { e.preventDefault(); const r = await post("/admin/invite", { email: email.trim(), name: inviteName.trim() }); if (r) { setEmail(""); setInviteName(""); } }}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
          <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} maxLength={32} placeholder="Name in the tavern (optional)" />
          <button className="primary">Invite</button>
        </form>
        <h3>Members ({v.members.length})</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Player</th><th>Email</th><th>Role</th><th>Heroes</th><th>Last seen</th><th></th></tr></thead>
            <tbody>
              {v.members.map((m) => (
                <tr key={m.userId}>
                  <td><strong>{m.name}</strong></td>
                  <td className="small">{m.email ?? "—"}</td>
                  <td>{m.role === "owner" ? <Pill>owner</Pill> : "player"}</td>
                  <td>{m.heroes}</td>
                  <td className="small">{m.lastSeen ? new Date(m.lastSeen).toLocaleDateString() : "never"}</td>
                  <td>
                    {m.role !== "owner" && <button className="linkbtn" onClick={() => { if (confirm(`Remove ${m.name} from ${v.name}? Their heroes stay theirs.`)) post(`/campaign/members/${m.userId}/remove`, {}); }}>Remove</button>}
                    {m.role !== "owner" && <button className="linkbtn" onClick={() => { if (confirm(`Hand ${v.name} over to ${m.name}? You'll become a player.`)) post("/campaign/manage", { transferTo: m.userId }, "Ownership handed over."); }}>Make owner</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>AI Dungeon Master</h2>
        <p>
          Status: {v.ai.mode === "own-key" ? <Pill>Your own Anthropic key (…{v.ai.ownKeyHint})</Pill>
            : v.ai.mode === "site-key" ? <Pill>The site owner's key{v.ai.siteMonthlyCapUsd !== undefined ? ` — up to $${v.ai.siteMonthlyCapUsd}/month` : ""}</Pill>
            : <Pill kind="warn">Off — adventures use the Scripted DM</Pill>}
        </p>
        <p className="small muted">This month ({usage.month}): ${usage.ownUsd.toFixed(2)} on your key, ${usage.siteUsd.toFixed(2)} on the site key. (Estimated from token counts.)</p>
        <h3>Use your own Anthropic key</h3>
        <p className="small muted">Create one at console.anthropic.com → Settings → API Keys, and set a monthly spend limit there. It's checked with Anthropic, then stored encrypted on the server; nobody (including you) can read it back from the game.</p>
        <form className="row" style={{ flexWrap: "wrap" }} onSubmit={async (e) => { e.preventDefault(); const r = await post("/campaign/ai-key", { apiKey: key.trim() }, "Key saved — the AI DM is ready."); if (r) setKey(""); }}>
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" style={{ minWidth: 260 }} />
          <button className="primary" disabled={!key.trim().startsWith("sk-ant-")}>Save key</button>
          {v.ai.ownKeyHint && <button type="button" onClick={() => { if (confirm("Remove your key?")) post("/campaign/ai-key", { apiKey: "" }, "Key removed."); }}>Remove key</button>}
        </form>
        {!v.ai.ownKeyHint && v.ai.siteKeyConfigured && !v.ai.useSiteKey && <p className="small muted">No key? Ask the site owner — they can lend this campaign the server's key with a monthly cap.</p>}
      </section>

      <CampaignEditor ctx={ctx} />
    </div>
  );
}

/** Change a campaign's state: story progress, unlocks, town, calendar, flags and chronicle. */
function CampaignEditor({ ctx }: { ctx: AppCtx }) {
  const c = ctx.campaign?.campaign;
  const [flag, setFlag] = useState("");
  const [entry, setEntry] = useState("");
  const [confirmName, setConfirmName] = useState("");
  if (!c) return null;
  const edit = async (body: Record<string, unknown>) => {
    const r = await attempt(() => api<{ message: string }>("/campaign/edit", { body }));
    if (r) { toast(r.message, "info"); await ctx.refreshCampaign(); }
  };
  const danger = async (path: string, what: string) => {
    if (!confirm(`${what} “${c.name}”? This can't be undone.`)) return;
    const r = await attempt(() => api<{ message: string }>(path, { body: { confirmName } }));
    if (r) { toast(r.message, "info"); setConfirmName(""); await ctx.refreshCampaigns(); await ctx.refreshCampaign(); if (path.endsWith("delete")) ctx.go({ name: "tavern" }); }
  };
  const stateOf = (id: string) => c.completedScenarios.includes(id) ? "completed" : c.unlockedScenarios.includes(id) ? "available" : "locked";
  const NumField = ({ label, value, onSave }: { label: string; value: number; onSave: (n: number) => void }) => (
    <label className="num-field">{label}
      <input type="number" defaultValue={value} key={value} onBlur={(e) => { const n = Number(e.target.value); if (n !== value) onSave(n); }} />
    </label>
  );
  return (
    <section className="panel campaign-editor">
      <h2>Campaign editor</h2>
      <p className="small muted">Changes apply immediately and everyone in the campaign sees them. Numbers save when you click away from the box.</p>

      <h3>Story</h3>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Scenario</th><th>Arc</th><th>Levels</th><th>State</th></tr></thead>
          <tbody>
            {Object.values(SCENARIOS).map((sc) => (
              <tr key={sc.id}>
                <td><strong>{sc.name}</strong></td>
                <td className="small">{sc.arc}</td>
                <td className="small">{sc.recommendedLevel.join("–")}</td>
                <td>
                  <select value={stateOf(sc.id)} onChange={(e) => edit({ scenario: { id: sc.id, state: e.target.value } })}>
                    <option value="locked">Locked</option>
                    <option value="available">Available</option>
                    <option value="completed">Completed</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Classes</h3>
      <div className="chip-row">
        {(Object.keys(CLASSES) as ClassId[]).map((id) => (
          <label key={id} className="check chip">
            <input type="checkbox" checked={c.unlockedClasses.includes(id)} onChange={(e) => edit({ classId: id, unlocked: e.target.checked })} /> {CLASSES[id].name}
          </label>
        ))}
      </div>

      <h3>Town</h3>
      <div className="chip-row">
        {Object.values(BUILDINGS).map((b) => (
          <label key={b.id} className="num-field">{b.name}
            <select value={c.buildings[b.id] ?? 0} onChange={(e) => edit({ building: { id: b.id, level: Number(e.target.value) } })}>
              {Array.from({ length: b.levels.length + 1 }, (_, i) => <option key={i} value={i}>{i === 0 ? "not built" : `level ${i}`}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="chip-row">
        <NumField label="Treasury (gp)" value={c.treasury} onSave={(n) => edit({ treasury: n })} />
        {(["timber", "iron", "herbs", "relic"] as const).map((m) => <NumField key={m} label={m} value={c.materials[m] ?? 0} onSave={(n) => edit({ materials: { [m]: n } })} />)}
        <NumField label="Prosperity" value={c.prosperity} onSave={(n) => edit({ prosperity: n })} />
        <NumField label="Reputation" value={c.reputation} onSave={(n) => edit({ reputation: n })} />
      </div>

      <h3>Calendar</h3>
      <div className="chip-row">
        <NumField label="Week" value={c.week} onSave={(n) => edit({ week: n })} />
        <label className="num-field">Season
          <select value={c.season} onChange={(e) => edit({ season: e.target.value })}><option value="summer">Summer</option><option value="winter">Winter</option></select>
        </label>
      </div>

      <h3>Story flags</h3>
      <p className="small muted">Flags remember choices (allied goblins, a spared NPC…) and open or close options in later scenes.</p>
      <div className="chip-row">
        {c.flags.length ? c.flags.map((f) => <span key={f} className="pill">{f} <button className="linkbtn" title="Remove" onClick={() => edit({ removeFlag: f })}>✕</button></span>) : <span className="muted small">none yet</span>}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (flag.trim()) { edit({ addFlag: flag.trim() }); setFlag(""); } }}>
        <input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="goblinAllies" />
        <button>Add flag</button>
      </form>

      <h3>Chronicle</h3>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (entry.trim()) { edit({ chronicle: entry.trim() }); setEntry(""); } }}>
        <textarea value={entry} onChange={(e) => setEntry(e.target.value)} rows={3} placeholder="Write an entry for the campaign's chronicle — news, a recap, a rumour…" />
        <div><button>Add to chronicle</button></div>
      </form>
      <ul className="ledger">
        {c.chronicle.map((ch, i) => ({ ch, i })).reverse().slice(0, 15).map(({ ch, i }) => (
          <li key={i}><small className="muted">Week {ch.week}</small> {ch.text.slice(0, 180)}{ch.text.length > 180 ? "…" : ""} <button className="linkbtn" title="Delete entry" onClick={() => { if (confirm("Delete this chronicle entry?")) edit({ removeChronicle: i }); }}>✕</button></li>
        ))}
      </ul>

      <h3 className="danger-title">Danger zone</h3>
      <p className="small muted">Type the campaign's name to unlock. Resetting starts the story and town over (members, join code and AI settings stay). Deleting removes the campaign; players keep their heroes and Embers.</p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={c.name} />
        <button disabled={confirmName !== c.name} onClick={() => danger("/campaign/reset", "Reset")}>Reset campaign</button>
        <button className="danger" disabled={confirmName !== c.name} onClick={() => danger("/campaign/delete", "Delete")}>Delete campaign</button>
      </div>
    </section>
  );
}
