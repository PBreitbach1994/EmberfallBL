import { useMemo, useState } from "react";
import type { AdventureSummary, AdventureView, CharacterSheet, NewAdventureRequest, ScenarioSummary } from "@tavern/engine";
import { CLASSES, itemName } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, toast } from "../api";
import { CLASS_ICON, HpBar, Modal, Pill, classLabel } from "../components/ui";

export function Tavern({ ctx }: { ctx: AppCtx }) {
  const { campaign } = ctx;
  const [starting, setStarting] = useState<ScenarioSummary | null>(null);
  const [joining, setJoining] = useState<AdventureSummary | null>(null);
  const [tab, setTab] = useState<"board" | "town">("board");

  if (!campaign) return <div className="panel">Lighting the lanterns…</div>;
  const c = campaign.campaign;

  return (
    <div className="tavern">
      <section className="panel hero">
        <h1>{campaign.world.tavern}</h1>
        <p className="prose">{campaign.world.overview}</p>
        <p className="muted">Behind the bar: <strong>{campaign.world.keeper.name}</strong> — {campaign.world.keeper.description}</p>
        <div className="stats-row">
          <Pill>Week {c.week}</Pill>
          <Pill kind={c.season === "winter" ? "cold" : "warm"}>{c.season === "winter" ? "❄ Winter" : "☀ Summer"}</Pill>
          <Pill>Prosperity {c.prosperity}</Pill>
          <Pill>Reputation {c.reputation}</Pill>
          {c.settings.hardcore && <Pill kind="bad">Hardcore</Pill>}
          {!campaign.aiAvailable && <Pill kind="warn">AI DM offline (scripted mode)</Pill>}
        </div>
      </section>

      <div className="tabs">
        <button className={tab === "board" ? "active" : ""} onClick={() => setTab("board")}>Job Board &amp; Map</button>
        <button className={tab === "town" ? "active" : ""} onClick={() => setTab("town")}>Emberfall Town</button>
      </div>

      {tab === "board" && (
        <div className="grid2">
          <section className="panel">
            <h2>The Job Board</h2>
            <div className="board">
              {campaign.scenarios.map((s) => (
                <div key={s.id} className={`job ${s.available ? "" : "locked"} ${s.completed ? "done" : ""}`}>
                  <div className="job-head">
                    <strong>{s.name}</strong>
                    <span className="muted small">Lv {s.recommendedLevel[0]}–{s.recommendedLevel[1]}</span>
                  </div>
                  <div className="small muted">{s.location} · {s.arc}</div>
                  <p className="hook">“{s.hook}”</p>
                  {s.available && <p className="small">{s.summary}</p>}
                  <div className="row">
                    {s.completed && <Pill kind="good">Completed</Pill>}
                    {!s.available && <Pill kind="muted">{s.reason ?? "Locked"}</Pill>}
                    {s.available && <button className="primary" onClick={() => setStarting(s)}>{s.completed ? "Replay" : "Take the job"}</button>}
                  </div>
                </div>
              ))}
              {!campaign.scenarios.length && <p className="muted">The board is empty. Strange, for a frontier town.</p>}
            </div>
          </section>
          <div className="stack">
            <section className="panel">
              <h2>Campaign Map</h2>
              <CampaignMap scenarios={campaign.scenarios} onPick={(s) => s.available && setStarting(s)} />
            </section>
            <AdventuresPanel ctx={ctx} onJoin={setJoining} />
            <section className="panel">
              <h2>Chronicle</h2>
              <ul className="chronicle">
                {[...c.chronicle].reverse().slice(0, 15).map((e, i) => <li key={i}><span className="muted small">Week {e.week}</span> {e.text}</li>)}
                {!c.chronicle.length && <li className="muted">No tales told yet. Yours could be the first.</li>}
              </ul>
              {c.retired.length > 0 && (
                <>
                  <h3>The Wall of Lanterns (retired heroes)</h3>
                  <ul className="chronicle">
                    {c.retired.map((r) => <li key={r.characterId}>{CLASS_ICON[r.classId]} {r.name}{r.prestige ? " ★" : ""} <span className="muted small">week {r.week}</span></li>)}
                  </ul>
                </>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === "town" && <TownPanel ctx={ctx} />}

      {starting && <StartAdventure ctx={ctx} scenario={starting} onClose={() => setStarting(null)} />}
      {joining && <JoinAdventure ctx={ctx} adv={joining} onClose={() => setJoining(null)} />}
    </div>
  );
}

function CampaignMap({ scenarios, onPick }: { scenarios: ScenarioSummary[]; onPick: (s: ScenarioSummary) => void }) {
  return (
    <div className="campmap" role="img" aria-label="Campaign map">
      <div className="campmap-town" style={{ left: "50%", top: "50%" }}>🏮<span>Emberfall</span></div>
      {scenarios.map((s) => (
        <button
          key={s.id}
          className={`pin ${s.available ? "avail" : "locked"} ${s.completed ? "done" : ""}`}
          style={{ left: `${s.mapPosition[0]}%`, top: `${s.mapPosition[1]}%` }}
          onClick={() => onPick(s)}
          title={`${s.name}${s.available ? "" : ` (${s.reason ?? "locked"})`}`}
        >
          <span className="pin-dot">{s.completed ? "✓" : s.available ? "!" : "?"}</span>
          <span className="pin-label">{s.available || s.completed ? s.name : "???"}</span>
        </button>
      ))}
    </div>
  );
}

function AdventuresPanel({ ctx, onJoin }: { ctx: AppCtx; onJoin: (a: AdventureSummary) => void }) {
  const list = ctx.campaign?.adventures ?? [];
  const active = list.filter((a) => a.status === "exploring" || a.status === "combat");
  const recent = list.filter((a) => !(a.status === "exploring" || a.status === "combat")).slice(0, 5);
  return (
    <section className="panel">
      <h2>Tables in Session</h2>
      {!active.length && <p className="muted">No parties are out right now.</p>}
      <ul className="advlist">
        {active.map((a) => (
          <li key={a.id}>
            <div>
              <strong>{a.title}</strong> {a.autonomous && <Pill kind="muted">AI party</Pill>} <Pill>{a.dmMode === "ai" ? "AI DM" : a.dmMode === "human" ? "Human DM" : "Scripted"}</Pill>
              <div className="small muted">Host {a.hostName} · {a.party.map((p) => `${CLASS_ICON[p.classId] ?? ""}${p.name}${p.controller === "ai-player" ? " (AI)" : ""}`).join(", ")}</div>
            </div>
            <div className="row">
              {a.openSeats > 0 && <button onClick={() => onJoin(a)}>Join ({a.openSeats})</button>}
              <button className="primary" onClick={() => ctx.go({ name: "adventure", id: a.id })}>Open</button>
            </div>
          </li>
        ))}
      </ul>
      {recent.length > 0 && (
        <>
          <h3>Recently returned</h3>
          <ul className="advlist">
            {recent.map((a) => (
              <li key={a.id}>
                <span>{a.title} <Pill kind={a.status === "complete" ? "good" : "bad"}>{a.status}</Pill></span>
                <button className="linkbtn" onClick={() => ctx.go({ name: "adventure", id: a.id })}>Read the tale</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function charLine(s: CharacterSheet) {
  return `${CLASS_ICON[s.classId] ?? ""} ${s.name} — ${classLabel(s)} (${s.hp}/${s.maxHp} HP)`;
}

function StartAdventure({ ctx, scenario, onClose }: { ctx: AppCtx; scenario: ScenarioSummary; onClose: () => void }) {
  const mine = ctx.characters.filter((c) => !c.dead && !c.retired);
  const companionPool = useMemo(() => {
    const ids = new Set<string>();
    const out: CharacterSheet[] = [];
    for (const c of [...ctx.companions, ...mine]) if (!ids.has(c.id) && !c.dead && !c.retired) { ids.add(c.id); out.push(c); }
    return out;
  }, [ctx.companions, mine]);
  const [heroes, setHeroes] = useState<string[]>(mine.slice(0, 1).map((c) => c.id));
  const [comps, setComps] = useState<string[]>([]);
  const [dmMode, setDmMode] = useState<NewAdventureRequest["dmMode"]>(ctx.campaign?.aiAvailable ? "ai" : "scripted");
  const [seats, setSeats] = useState(0);
  const [autonomous, setAutonomous] = useState(false);
  const [busy, setBusy] = useState(false);
  const max = ctx.campaign?.campaign.settings.maxPartySize ?? 6;
  const total = (autonomous ? 0 : heroes.length) + comps.length + seats;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const start = async () => {
    setBusy(true);
    const body: NewAdventureRequest = {
      scenarioId: scenario.id,
      characterIds: autonomous ? [] : heroes,
      companionIds: comps.filter((id) => autonomous || !heroes.includes(id)),
      dmMode: dmMode === "human" && autonomous ? "scripted" : dmMode,
      openSeats: autonomous ? 0 : seats,
      autonomous,
    };
    const r = await attempt(() => api<{ view: AdventureView }>("/adventures", { body }));
    setBusy(false);
    if (r) { onClose(); ctx.refreshCampaign(); ctx.go({ name: "adventure", id: r.view.id }); }
  };

  return (
    <Modal title={`Take the job: ${scenario.name}`} onClose={onClose} wide>
      <p className="hook">“{scenario.hook}”</p>
      <p>{scenario.summary}</p>
      <label className="check"><input type="checkbox" checked={autonomous} onChange={(e) => setAutonomous(e.target.checked)} /> Send an autonomous AI party (they play it out on their own; read the tale later)</label>
      {!autonomous && (
        <>
          <h3>Your heroes (you control)</h3>
          {!mine.length && <p className="muted">You have no characters yet. <button className="linkbtn" onClick={() => { onClose(); ctx.go({ name: "create" }); }}>Create one</button></p>}
          <div className="picklist">
            {mine.map((c) => (
              <label key={c.id} className="check"><input type="checkbox" checked={heroes.includes(c.id)} onChange={() => { toggle(heroes, setHeroes, c.id); setComps(comps.filter((x) => x !== c.id)); }} /> {charLine(c)}</label>
            ))}
          </div>
        </>
      )}
      <h3>AI companions</h3>
      <p className="small muted">Recruit tavern regulars, or hand one of your own characters to the AI.</p>
      <div className="picklist">
        {companionPool.filter((c) => autonomous || !heroes.includes(c.id)).map((c) => (
          <label key={c.id} className="check"><input type="checkbox" checked={comps.includes(c.id)} onChange={() => toggle(comps, setComps, c.id)} /> {charLine(c)}{c.ownerId === ctx.user.id ? " · yours" : ""}</label>
        ))}
        {!companionPool.length && <p className="muted small">No companions in the tavern. Create a character with “AI companion” ticked.</p>}
      </div>
      <h3>Dungeon Master</h3>
      <div className="radio-row">
        <label className="check"><input type="radio" checked={dmMode === "ai"} disabled={!ctx.campaign?.aiAvailable} onChange={() => setDmMode("ai")} /> AI DM (Claude){!ctx.campaign?.aiAvailable && <span className="muted small"> — needs an API key on the server</span>}</label>
        <label className="check"><input type="radio" checked={dmMode === "scripted"} onChange={() => setDmMode("scripted")} /> Scripted DM (authored text only)</label>
        {!autonomous && <label className="check"><input type="radio" checked={dmMode === "human"} onChange={() => setDmMode("human")} /> I'll be the DM</label>}
      </div>
      {!autonomous && (
        <label>Open seats for friends: <input type="number" min={0} max={4} value={seats} onChange={(e) => setSeats(Math.max(0, Math.min(4, Number(e.target.value) || 0)))} style={{ width: 60 }} /></label>
      )}
      <p className={total > max ? "error" : "muted small"}>Party size {total} / {max}{total < 1 ? " — bring at least one hero" : ""}</p>
      <div className="row end">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || total < 1 || total > max || (!autonomous && dmMode !== "human" && heroes.length + comps.length < 1)} onClick={start}>{busy ? "Setting out…" : "Set out"}</button>
      </div>
    </Modal>
  );
}

function JoinAdventure({ ctx, adv, onClose }: { ctx: AppCtx; adv: AdventureSummary; onClose: () => void }) {
  const mine = ctx.characters.filter((c) => !c.dead && !c.retired);
  const [pick, setPick] = useState(mine[0]?.id ?? "");
  const join = async () => {
    const r = await attempt(() => api<{ view: AdventureView }>(`/adventures/${adv.id}/join`, { body: { characterId: pick } }));
    if (r) { onClose(); ctx.go({ name: "adventure", id: adv.id }); }
  };
  return (
    <Modal title={`Join ${adv.title}`} onClose={onClose}>
      {!mine.length ? <p className="muted">You need a character first.</p> : (
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          {mine.map((c) => <option key={c.id} value={c.id}>{charLine(c)}</option>)}
        </select>
      )}
      <div className="row end">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!pick} onClick={join}>Join the party</button>
      </div>
    </Modal>
  );
}

function costText(cost: Record<string, number | undefined> | undefined) {
  if (!cost) return "";
  return Object.entries(cost).filter(([, v]) => v).map(([k, v]) => (k === "gold" ? `${v} gp` : `${v} ${k}`)).join(", ");
}

function TownPanel({ ctx }: { ctx: AppCtx }) {
  const campaign = ctx.campaign!;
  const c = campaign.campaign;
  const mine = ctx.characters.filter((x) => !x.retired);
  const [who, setWho] = useState(mine.find((x) => !x.dead)?.id ?? "");
  const [donation, setDonation] = useState(10);
  const char = mine.find((x) => x.id === who);
  const dead = mine.filter((x) => x.dead);

  const post = async (path: string, body: unknown) => {
    const r = await attempt(() => api<{ ok: boolean; message?: string }>(path, { body }));
    if (r) { if (r.message) toast(r.message); await Promise.all([ctx.refreshCampaign(), ctx.refreshCharacters()]); }
  };

  return (
    <div className="grid2">
      <section className="panel">
        <h2>Buildings</h2>
        <div className="stats-row">
          <Pill>Treasury {c.treasury} gp</Pill>
          {Object.entries(c.materials).map(([k, v]) => <Pill key={k}>{k}: {v}</Pill>)}
        </div>
        <p className="small muted">Upgrades are paid from the town treasury and stores (donations and scenario rewards fill them).</p>
        <ul className="buildings">
          {campaign.buildings.map((b) => (
            <li key={b.def.id}>
              <div>
                <strong>{b.def.name}</strong> <Pill>{b.level === 0 ? "Unbuilt" : `Level ${b.level}`}</Pill>
                <div className="small muted">{b.def.description}</div>
                {b.level > 0 && <div className="small">{b.def.levels[b.level - 1]?.description}</div>}
                {b.nextCost && <div className="small">Next: {b.def.levels[b.level]?.description} <span className="muted">({costText(b.nextCost)})</span></div>}
              </div>
              {b.nextCost && <button disabled={!b.canUpgrade} onClick={() => post("/town/build", { buildingId: b.def.id })}>{b.level === 0 ? "Build" : "Upgrade"}</button>}
            </li>
          ))}
        </ul>
      </section>
      <div className="stack">
        <section className="panel">
          <h2>Market &amp; Services</h2>
          {!mine.length ? <p className="muted">Create a character to trade.</p> : (
            <label>Shopping as{" "}
              <select value={who} onChange={(e) => setWho(e.target.value)}>
                {mine.map((x) => <option key={x.id} value={x.id}>{x.name}{x.dead ? " (dead)" : ""} — {x.gold} gp</option>)}
              </select>
            </label>
          )}
          <h3>For sale</h3>
          <ul className="shop">
            {campaign.shop.map((it) => (
              <li key={it.itemId}>
                <span><strong>{it.name}</strong> <span className="muted small">{it.kind}</span><div className="small muted">{it.description}</div></span>
                <button disabled={!char || char.dead || char.gold < it.price} onClick={() => post("/town/buy", { characterId: who, itemId: it.itemId })}>{it.price} gp</button>
              </li>
            ))}
            {!campaign.shop.length && <li className="muted">The stalls are bare.</li>}
          </ul>
          {char && char.inventory.length > 0 && (
            <>
              <h3>Sell from {char.name}'s pack</h3>
              <ul className="shop">
                {char.inventory.map((i) => (
                  <li key={i.itemId}>
                    <span>{itemName(i.itemId)} ×{i.qty}{i.equipped ? " (equipped)" : ""}</span>
                    <button onClick={() => post("/town/sell", { characterId: who, itemId: i.itemId })}>Sell</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="panel">
          <h2>Temple of the Dawn</h2>
          <p className="small muted">Services: {campaign.services.join(", ") || "none yet"}.</p>
          <div className="row">
            <input type="number" min={1} value={donation} onChange={(e) => setDonation(Math.max(1, Number(e.target.value) || 1))} style={{ width: 80 }} />
            <button disabled={!char || char.gold < donation} onClick={() => post("/town/donate", { characterId: who, amount: donation })}>Donate to the town</button>
          </div>
          {dead.length > 0 && (
            <>
              <h3>The fallen</h3>
              <ul className="shop">
                {dead.map((d) => (
                  <li key={d.id}>
                    <span>💀 {d.name} — {CLASSES[d.classId].name} {d.level}{d.hardcore || c.settings.hardcore ? " (hardcore: cannot return)" : ""}</span>
                    <button disabled={d.hardcore || c.settings.hardcore || !campaign.services.includes("service:raiseDead")} onClick={() => post("/town/raise", { characterId: d.id })}>Raise Dead</button>
                  </li>
                ))}
              </ul>
              {!campaign.services.includes("service:raiseDead") && <p className="small muted">The temple must be upgraded before it can perform Raise Dead (needs a 500 gp diamond).</p>}
            </>
          )}
        </section>
        <section className="panel">
          <h2>Who's in the common room</h2>
          <ul className="chronicle">
            {ctx.companions.map((p) => (
              <li key={p.id}>{CLASS_ICON[p.classId]} <strong>{p.name}</strong> <span className="small muted">{classLabel(p)}</span> <HpBar hp={p.hp} max={p.maxHp} small /></li>
            ))}
            {!ctx.companions.length && <li className="muted">Just you and the barkeep.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
