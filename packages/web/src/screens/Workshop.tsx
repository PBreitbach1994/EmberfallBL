// World Workshop: create monsters, items, events, scenarios and lore for a campaign (or the whole server).
import { useCallback, useEffect, useMemo, useState } from "react";
import { CONTENT_TEMPLATES, validateContent, type ContentKind } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, errText, toast } from "../api";
import { Modal, Pill } from "../components/ui";

export interface ContentRec {
  id: string; kind: ContentKind; scope: string; scopeName: string; name: string; data: Record<string, unknown>;
  enabled: boolean; forSale?: boolean; canEdit: boolean; updatedAt: number;
}

const KINDS: { id: ContentKind; label: string; help: string }[] = [
  { id: "scenario", label: "Scenarios", help: "Whole adventures: scenes, choices with skill checks, encounters on a grid map, and endings. They appear on the job board." },
  { id: "monster", label: "Monsters", help: "Stat blocks the rules engine can fight with. Use them in your scenarios' encounters." },
  { id: "item", label: "Items", help: "Potions, trinkets, treasure and quest items. Give them as rewards, or put them up for sale in the town shop." },
  { id: "event", label: "Events", help: "Road events (on the way to a job) and town events, Frosthaven-style: a short scene with a choice." },
  { id: "lore", label: "Lore", help: "Facts about your world — places, factions, rumours, NPCs. The AI Dungeon Master reads these and uses them in narration." },
];

export function Workshop({ ctx, onContentChanged }: { ctx: AppCtx; onContentChanged: () => void }) {
  const [kind, setKind] = useState<ContentKind>("scenario");
  const [recs, setRecs] = useState<ContentRec[]>([]);
  const [canGlobal, setCanGlobal] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [editing, setEditing] = useState<{ rec?: ContentRec; kind: ContentKind } | null>(null);
  const load = useCallback(async () => {
    const r = await attempt(() => api<{ records: ContentRec[]; canGlobal: boolean; canCreate: boolean }>("/content"));
    if (r) { setRecs(r.records); setCanGlobal(r.canGlobal); setCanCreate(r.canCreate); }
  }, []);
  useEffect(() => { load(); }, [load, ctx.campaignId]);
  const changed = async () => { await load(); onContentChanged(); await ctx.refreshCampaign(); };
  const info = KINDS.find((k) => k.id === kind)!;
  const list = recs.filter((r) => r.kind === kind);
  return (
    <div className="stack workshop">
      <section className="panel">
        <h1>World Workshop</h1>
        <p className="muted">Add your own pieces to the world of {ctx.campaign?.campaign.name ?? "this campaign"}. Everything is checked before it's saved, so a broken scenario can't reach your players.</p>
        <div className="tabs">{KINDS.map((k) => <button key={k.id} className={kind === k.id ? "active" : ""} onClick={() => setKind(k.id)}>{k.label} ({recs.filter((r) => r.kind === k.id).length})</button>)}</div>
        <p className="small muted">{info.help}</p>
        {canCreate && <button className="primary" onClick={() => setEditing({ kind })}>＋ New {info.label.toLowerCase().replace(/s$/, "")}</button>}
      </section>
      <section className="panel">
        {!list.length ? <p className="muted">Nothing here yet.</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Where</th><th>Status</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong>{r.forSale && <> <Pill>for sale</Pill></>}</td>
                    <td className="small">{r.scopeName}</td>
                    <td>{r.enabled ? <Pill>live</Pill> : <Pill kind="warn">hidden</Pill>}</td>
                    <td className="small">{new Date(r.updatedAt).toLocaleDateString()}</td>
                    <td>
                      {r.canEdit && <>
                        <button className="linkbtn" onClick={() => setEditing({ rec: r, kind: r.kind })}>Edit</button>
                        <button className="linkbtn" onClick={async () => { const x = await attempt(() => api<{ message: string }>(`/content/${r.id}`, { method: "PUT", body: { enabled: !r.enabled } })); if (x) { toast(x.message, "info"); changed(); } }}>{r.enabled ? "Hide" : "Show"}</button>
                        <button className="linkbtn" onClick={async () => { if (!confirm(`Delete ${r.name}?`)) return; const x = await attempt(() => api<{ message: string }>(`/content/${r.id}`, { method: "DELETE" })); if (x) { toast(x.message, "info"); changed(); } }}>Delete</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <Editor ctx={ctx} kind={editing.kind} rec={editing.rec} canGlobal={canGlobal} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(); }} />}
    </div>
  );
}

function Editor({ ctx, kind, rec, canGlobal, onClose, onSaved }: { ctx: AppCtx; kind: ContentKind; rec?: ContentRec; canGlobal: boolean; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(() => JSON.stringify(rec?.data ?? CONTENT_TEMPLATES[kind], null, 2));
  const [lore, setLore] = useState(() => (kind === "lore" ? (rec?.data ?? CONTENT_TEMPLATES.lore) as { title: string; text: string } : { title: "", text: "" }));
  const [scope, setScope] = useState<"campaign" | "global">(rec?.scope === "global" ? "global" : "campaign");
  const [startUnlocked, setStartUnlocked] = useState(true);
  const [forSale, setForSale] = useState(!!rec?.forSale);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState<null | "draft" | "save">(null);
  const data = useMemo(() => { if (kind === "lore") return lore; try { return JSON.parse(text); } catch { return undefined; } }, [text, lore, kind]);
  const errors = data === undefined ? ["That isn't valid JSON yet (check for a missing comma or quote)."] : validateContent(kind, data);
  const aiOk = !!ctx.campaign?.aiAvailable;

  const draft = async () => {
    setBusy("draft");
    try {
      const r = await api<{ data: unknown; errors: string[] }>("/content/draft", { body: { kind, idea } });
      if (r.data) { if (kind === "lore") setLore(r.data as { title: string; text: string }); else setText(JSON.stringify(r.data, null, 2)); }
      toast(r.errors.length ? `Draft ready, but it needs ${r.errors.length} fix${r.errors.length === 1 ? "" : "es"} — see below.` : "Draft ready. Read it over, then save.", r.errors.length ? "error" : "info");
    } catch (e) { toast(errText(e), "error"); }
    setBusy(null);
  };
  const save = async () => {
    setBusy("save");
    try {
      const r = rec
        ? await api<{ message: string }>(`/content/${rec.id}`, { method: "PUT", body: { data, forSale, startUnlocked: kind === "scenario" && startUnlocked } })
        : await api<{ message: string }>("/content", { body: { kind, data, scope, startUnlocked: kind === "scenario" && startUnlocked, forSale } });
      toast(r.message, "info");
      onSaved();
    } catch (e) { toast(errText(e), "error"); }
    setBusy(null);
  };

  return (
    <Modal wide title={`${rec ? "Edit" : "New"} ${kind}`} onClose={onClose}>
      <div className="stack">
        {!rec && (
          <div className="draft-box">
            <label>Describe it and let the AI draft it
              <textarea rows={2} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={kind === "scenario" ? "A haunted lighthouse on the Grey Cliffs; a drowned keeper wants his logbook found; skeletons and a ghostly fight at the top" : kind === "monster" ? "A peat-bog troll that's slow but hits hard and regrows" : kind === "item" ? "A lucky copper coin that heals a little when flipped" : kind === "event" ? "A travelling circus wagon stuck in the mud" : "The Grey Cliffs and the sunken navy of Valdren"} />
            </label>
            <button className="primary" disabled={!aiOk || busy !== null || idea.trim().length < 5} onClick={draft}>{busy === "draft" ? "Drafting… (up to a minute)" : "✨ Draft it"}</button>
            {!aiOk && <p className="small muted">AI drafting needs an AI key for this campaign (Campaign page). You can still write it by hand below.</p>}
          </div>
        )}
        {kind === "lore" ? (
          <>
            <label>Title<input value={lore.title} onChange={(e) => setLore({ ...lore, title: e.target.value })} maxLength={80} /></label>
            <label>What's true about it<textarea rows={8} value={lore.text} onChange={(e) => setLore({ ...lore, text: e.target.value })} maxLength={4000} /></label>
          </>
        ) : (
          <label>Definition (JSON) — start from the example and change what you like
            <textarea className="json-edit" rows={18} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        )}
        {errors.length ? (
          <div className="error small"><strong>{errors.length} thing{errors.length === 1 ? "" : "s"} to fix:</strong><ul>{errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}</ul>{errors.length > 12 && <p>…and {errors.length - 12} more.</p>}</div>
        ) : <p className="small">✓ Looks good.</p>}
        {!rec && canGlobal && (
          <label className="num-field">Who gets it
            <select value={scope} onChange={(e) => setScope(e.target.value as "campaign" | "global")}>
              <option value="campaign">This campaign only</option>
              <option value="global">Every campaign on the server</option>
            </select>
          </label>
        )}
        {kind === "scenario" && <label className="check"><input type="checkbox" checked={startUnlocked} onChange={(e) => setStartUnlocked(e.target.checked)} /> Put it on the job board now</label>}
        {kind === "item" && <label className="check"><input type="checkbox" checked={forSale} onChange={(e) => setForSale(e.target.checked)} /> Sell it in the town shop</label>}
        <div className="row">
          <button className="primary" disabled={errors.length > 0 || busy !== null} onClick={save}>{busy === "save" ? "Saving…" : "Save"}</button>
          <button onClick={() => { if (kind === "lore") setLore(CONTENT_TEMPLATES.lore as { title: string; text: string }); else setText(JSON.stringify(CONTENT_TEMPLATES[kind], null, 2)); }}>Reset to example</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
