import { Vignette } from "../components/art/Vignette";
import { Portrait } from "../components/art/Portrait";
import { DiceTray } from "../components/DiceTray";
import { SPECIES } from "@tavern/engine";
const speciesId = (name: string) => Object.values(SPECIES).find((s) => s.name === name)?.id ?? "human";
import { useState } from "react";
import type { AdventureAction, AdventureView } from "@tavern/engine";
import { CLASSES } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, useAdventure } from "../api";
import { CLASS_ICON, HpBar, Pill } from "../components/ui";
import { Log } from "../components/Log";
import { Combat } from "./Combat";
import { DmPanel, spawnAction } from "./DmPanel";

export function Adventure({ ctx, id }: { ctx: AppCtx; id: string }) {
  const { view, setView, error } = useAdventure(id);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [actorId, setActorId] = useState<string>("");
  const [spawning, setSpawning] = useState<string | null>(null);
  const me = ctx.user.id;

  if (error) return <div className="panel error">{error} <button onClick={() => ctx.go({ name: "tavern" })}>Back to the tavern</button></div>;
  if (!view) return <div className="panel">Unrolling the map…</div>;

  const myMembers = view.party.filter((p) => p.userId === me && p.controller === "human" && !p.dead);
  const isDm = view.dmUserId === me;
  const inParty = view.party.some((p) => p.userId === me) || isDm || view.hostUserId === me;
  const actingId = myMembers.find((p) => p.characterId === actorId)?.characterId ?? myMembers[0]?.characterId;
  const over = view.status === "complete" || view.status === "failed" || view.status === "retreated";

  const act = async (action: AdventureAction, characterId?: string) => {
    setBusy(true);
    const r = await attempt(() => api<{ view: AdventureView }>(`/adventures/${view.id}/act`, { body: { characterId: characterId ?? actingId, action } }));
    setBusy(false);
    if (r) setView(r.view);
  };

  const say = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    await act({ kind: "say", text: t }, actingId);
  };

  const narrationLog = view.log;

  return (
    <div className="adventure">
      <DiceTray log={view.log} />
      <div className="adv-head panel">
        <div>
          <h1>{view.title}</h1>
          <div className="row">
            <Pill>{view.dmMode === "ai" ? "AI DM" : view.dmMode === "human" ? "Human DM" : "Scripted DM"}</Pill>
            <Pill kind={view.status === "complete" ? "good" : view.status === "failed" ? "bad" : view.status === "combat" ? "warn" : ""}>{view.status}</Pill>
            {view.autonomous && <Pill kind="muted">Autonomous AI party</Pill>}
            {!inParty && <Pill kind="muted">Spectating</Pill>}
            {view.thinking && <span className="thinking">The DM is thinking<span className="dots">…</span></span>}
          </div>
        </div>
        <div className="row">
          {inParty && !over && view.hostUserId === me && <button onClick={() => { if (confirm("Retreat to Emberfall? The scenario will count as a retreat.")) act({ kind: "retreat" }); }}>Retreat</button>}
          <button onClick={() => { ctx.refreshCampaign(); ctx.refreshCharacters(); ctx.go({ name: "tavern" }); }}>← Tavern</button>
        </div>
      </div>

      {over && (
        <section className="panel summary">
          <h2>{view.status === "complete" ? "🏆 Victory" : view.status === "retreated" ? "🏳 Retreat" : "☠ Defeat"}</h2>
          {view.summary && <p>{view.summary.outcome}</p>}
          {view.summary && <div className="row"><Pill>{view.summary.xp} XP</Pill><Pill>{view.summary.gold} gp</Pill></div>}
          <button className="primary" onClick={() => { ctx.refreshCampaign(); ctx.refreshCharacters(); ctx.go({ name: "tavern" }); }}>Return to the tavern</button>
        </section>
      )}

      <div className="adv-body">
        <div className="adv-main">
          {view.encounter ? (
            <Combat view={view} me={me} act={act} mapClickOverride={isDm && spawning ? (p) => { act(spawnAction(spawning, p)); setSpawning(null); } : undefined} />
          ) : (
            <>
              <section className="panel story">
                <Log entries={narrationLog} filter={(e) => e.kind !== "roll"} />
              </section>
              {view.event && (
                <section className="panel eventcard">
                  <Vignette text={`road ${view.event.title} ${view.event.text.slice(0, 80)}`} seed={view.event.id} height={90} />
                  <div className="small muted">Event</div>
                  <h2>{view.event.title}</h2>
                  <p className="prose">{view.event.text}</p>
                  <div className="options">
                    {view.event.options.map((o) => (
                      <button key={o.id} disabled={!inParty || !o.available || busy} onClick={() => act({ kind: "event", optionId: o.id })} title={o.reason}>
                        {o.label}{o.check && <span className="checklabel">{o.check}</span>}{!o.available && o.reason && <span className="muted small"> — {o.reason}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {view.node && !view.event && (
                <section className="panel scene">
                  <Vignette text={`${view.scenarioId} ${view.title} ${view.node.title}`} seed={view.node.id} />
                  <h2>{view.node.title}</h2>
                  {view.node.narration && <p className="prose">{view.node.narration}</p>}
                  {view.node.npcs.length > 0 && <div className="small muted">Present: {view.node.npcs.map((n) => `${n.name} (${n.role})`).join(", ")}</div>}
                  {!over && (
                    <div className="options">
                      {view.node.options.map((o) => (
                        <button key={o.id} disabled={!inParty || !o.available || busy || isDm && !myMembers.length} onClick={() => act({ kind: "choose", optionId: o.id })} title={o.reason}>
                          {o.label}{o.check && <span className="checklabel">{o.check}</span>}{!o.available && o.reason && <span className="muted small"> — {o.reason}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {!over && myMembers.length > 0 && (
                    <div className="freetext">
                      {myMembers.length > 1 && (
                        <select value={actingId} onChange={(e) => setActorId(e.target.value)}>
                          {myMembers.map((p) => <option key={p.characterId} value={p.characterId}>{p.name}</option>)}
                        </select>
                      )}
                      <textarea
                        rows={2}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); say(); } }}
                        placeholder={view.dmMode === "scripted" ? "Speak in character (the scripted DM only resolves the options above)" : "What do you do? Speak, act, investigate…"}
                        disabled={busy}
                      />
                      <button className="primary" disabled={busy || !text.trim()} onClick={say}>Act</button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
          {isDm && view.dmInfo && <DmPanel view={view} act={act} spawning={spawning} setSpawning={setSpawning} />}
        </div>
        <aside className="adv-side">
          <section className="panel">
            <h2>The Party</h2>
            <ul className="partylist">
              {view.party.map((p) => {
                const myComp = p.userId === me;
                return (
                  <li key={p.characterId} className={p.dead ? "dead" : ""}>
                    <div className="row spread">
                      <span className="party-who"><Portrait seed={p.characterId} species={speciesId(p.species)} classId={p.classId} size={38} dead={p.dead} /> <strong>{p.name}</strong></span>
                      <span className="small muted">AC {p.ac}</span>
                    </div>
                    <div className="small muted">L{p.level} {CLASSES[p.classId]?.name} · {p.controller === "human" ? `🧑 ${p.userName ?? "player"}` : "🤖 AI"}</div>
                    <HpBar hp={p.hp} max={p.maxHp} />
                    {p.conditions.length > 0 && <div className="row">{p.conditions.map((c) => <Pill key={c} kind="warn">{c}</Pill>)}</div>}
                    {myComp && !over && !p.dead && (
                      p.controller === "ai-player"
                        ? <button className="tiny" onClick={() => act({ kind: "takeOver", characterId: p.characterId })}>Take over</button>
                        : <button className="tiny" onClick={() => act({ kind: "release", characterId: p.characterId })}>Hand to AI</button>
                    )}
                  </li>
                );
              })}
            </ul>
            {view.openSeats > 0 && <p className="small muted">{view.openSeats} open seat{view.openSeats > 1 ? "s" : ""} — friends can join from the tavern.</p>}
          </section>
          {view.encounter && (
            <section className="panel">
              <h2>Story so far</h2>
              <Log entries={view.log} compact filter={(e) => e.kind === "narration" || e.kind === "dialogue" || e.kind === "system"} />
            </section>
          )}
          {!view.encounter && (
            <section className="panel">
              <h2>Dice</h2>
              <Log entries={view.log} compact filter={(e) => e.kind === "roll" || e.kind === "check" || e.kind === "loot" || e.kind === "level"} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
