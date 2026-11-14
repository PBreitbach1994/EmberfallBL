// Multi-campaign screens: the switcher, the welcome page for players with no campaign yet,
// and the owner's Campaign page (members, invites, join code, AI key and usage).
import { useCallback, useEffect, useState } from "react";
import type { CampaignManageView, CampaignSummary } from "@tavern/engine";
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
    </div>
  );
}
