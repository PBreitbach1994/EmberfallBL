import { Portrait } from "../components/art/Portrait";
import { useEffect, useState } from "react";
import type { CharacterSheet, RosterHero } from "@tavern/engine";
import { BACKGROUNDS, CLASSES, MAX_REGULARS, SPECIES, hireCost } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, toast } from "../api";
import { CLASS_ICON, HpBar, Modal, Pill, XpBar, classLabel, questProgress } from "../components/ui";

export function Characters({ ctx }: { ctx: AppCtx }) {
  const [quick, setQuick] = useState(false);
  const [hiring, setHiring] = useState(false);
  const livingRegulars = ctx.companions.filter((c) => c.ownerId === "ai" && !c.dead);
  const fallenRegulars = ctx.companions.filter((c) => c.ownerId === "ai" && c.dead);
  const active = ctx.characters.filter((c) => !c.retired);
  const retired = ctx.characters.filter((c) => c.retired);
  return (
    <div className="stack">
      <section className="panel">
        <div className="row spread">
          <h1>Your Company</h1>
          <div className="row">
            <button onClick={() => setQuick(true)}>Quick build</button>
            <button className="primary" onClick={() => ctx.go({ name: "create" })}>Create a character</button>
          </div>
        </div>
        {!active.length && <p className="muted">No one has signed the company ledger under your name yet.</p>}
        <div className="cards">
          {active.map((c) => <CharCard key={c.id} c={c} onOpen={() => ctx.go({ name: "sheet", id: c.id })} />)}
        </div>
      </section>
      {retired.length > 0 && (
        <section className="panel">
          <h2>Retired</h2>
          <div className="cards">{retired.map((c) => <CharCard key={c.id} c={c} onOpen={() => ctx.go({ name: "sheet", id: c.id })} />)}</div>
        </section>
      )}
      <CompanyRoster ctx={ctx} />
      <section className="panel">
        <div className="row spread">
          <h2>Tavern regulars (AI companions)</h2>
          {ctx.campaign && <button className="primary" disabled={livingRegulars.length >= MAX_REGULARS} title={livingRegulars.length >= MAX_REGULARS ? `The tavern holds ${MAX_REGULARS} regulars at most` : ""} onClick={() => setHiring(true)}>📜 Post a hiring notice</button>}
        </div>
        <p className="small muted">Anyone can recruit these for an adventure. Lost one? Hire a newcomer here, or bring the fallen back at the Temple (Tavern → Emberfall Town).</p>
        <div className="cards">
          {[...livingRegulars, ...ctx.companions.filter((c) => c.ownerId !== "ai" && !c.dead)].map((c) => <CharCard key={c.id} c={c} onOpen={() => ctx.go({ name: "sheet", id: c.id })} />)}
        </div>
        {fallenRegulars.length > 0 && (
          <>
            <h3>Fallen regulars</h3>
            <div className="cards">{fallenRegulars.map((c) => <CharCard key={c.id} c={c} onOpen={() => ctx.go({ name: "sheet", id: c.id })} />)}</div>
          </>
        )}
      </section>
      {quick && <QuickBuild ctx={ctx} onClose={() => setQuick(false)} />}
      {hiring && <HireRegular ctx={ctx} onClose={() => setHiring(false)} />}
    </div>
  );
}

function CharCard({ c, onOpen }: { c: CharacterSheet; onOpen: () => void }) {
  return (
    <button className={`charcard ${c.dead ? "dead" : ""}`} onClick={onOpen}>
      <div className="charcard-head">
        <Portrait seed={c.id} species={c.species} classId={c.classId} size={58} dead={c.dead} />
        <div>
          <strong>{c.name}</strong>
          <div className="small muted">{classLabel(c)}</div>
        </div>
      </div>
      <HpBar hp={c.hp} max={c.maxHp} temp={c.tempHp} />
      <XpBar sheet={c} />
      <div className="small">{c.gold} gp · {questProgress(c)}</div>
      <div className="row">
        {c.dead && <Pill kind="bad">Dead</Pill>}
        {c.retired && <Pill kind="muted">Retired</Pill>}
        {c.hardcore && <Pill kind="bad">Hardcore</Pill>}
        {c.prestige > 0 && <Pill kind="good">{"★".repeat(c.prestige)}</Pill>}
        {c.ownerId === "ai" && <Pill>AI</Pill>}
      </div>
    </button>
  );
}

function QuickBuild({ ctx, onClose }: { ctx: AppCtx; onClose: () => void }) {
  const unlocked = ctx.campaign?.campaign.unlockedClasses ?? ["fighter", "rogue", "cleric", "wizard"];
  const [name, setName] = useState("");
  const [classId, setClassId] = useState<string>(unlocked[0]);
  const [species, setSpecies] = useState("human");
  const [background, setBackground] = useState("soldier");
  const [asCompanion, setAsCompanion] = useState(false);
  const [personality, setPersonality] = useState("");
  const go = async () => {
    const r = await attempt(() => api<{ character: CharacterSheet }>("/characters/quick", { body: { name: name.trim() || undefined, classId, species, background, asCompanion, personality: personality || undefined } }));
    if (r) { await ctx.refreshCharacters(); onClose(); ctx.go({ name: "sheet", id: r.character.id }); }
  };
  return (
    <Modal title="Quick build" onClose={onClose}>
      <label>Name (blank for a random one) <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
      <label>Class
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          {Object.values(CLASSES).map((c) => <option key={c.id} value={c.id} disabled={!unlocked.includes(c.id)}>{c.name}{unlocked.includes(c.id) ? "" : " (locked)"}</option>)}
        </select>
      </label>
      <label>Species
        <select value={species} onChange={(e) => setSpecies(e.target.value)}>
          {Object.values(SPECIES).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>Background
        <select value={background} onChange={(e) => setBackground(e.target.value)}>
          {Object.values(BACKGROUNDS).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={asCompanion} onChange={(e) => setAsCompanion(e.target.checked)} /> Make an AI companion (a tavern regular anyone can recruit)</label>
      {asCompanion && <label>Personality for the AI to play <textarea value={personality} onChange={(e) => setPersonality(e.target.value)} rows={2} placeholder="e.g. a dour dwarf who counts every coin but never abandons a friend" /></label>}
      <div className="row end">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={go}>Build</button>
      </div>
    </Modal>
  );
}

/** Every player's heroes, so the company can see who's who. The campaign owner can open full sheets. */
function CompanyRoster({ ctx }: { ctx: AppCtx }) {
  const [heroes, setHeroes] = useState<RosterHero[] | null>(null);
  useEffect(() => { attempt(() => api<{ heroes: RosterHero[] }>("/roster")).then((r) => r && setHeroes(r.heroes)); }, [ctx.characters.length]);
  if (!heroes) return null;
  const others = heroes.filter((h) => !ctx.characters.some((c) => c.id === h.id));
  if (!others.length) return null;
  const byPlayer = new Map<string, RosterHero[]>();
  for (const h of others) byPlayer.set(h.player, [...(byPlayer.get(h.player) ?? []), h]);
  return (
    <section className="panel">
      <h2>The Company</h2>
      <p className="small muted">Heroes other players have brought to the Broken Lantern.</p>
      {[...byPlayer.entries()].map(([player, list]) => (
        <div key={player} className="roster-group">
          <h3>{player}</h3>
          <ul className="roster">
            {list.map((h) => (
              <li key={h.id}>
                <strong>{h.name}</strong>{h.prestige ? ` ★${h.prestige}` : ""} — {SPECIES[h.species as keyof typeof SPECIES]?.name} {CLASSES[h.classId]?.name} {h.level}
                {h.dead && <> <Pill kind="bad">dead</Pill></>}{h.retired && <> <Pill>retired</Pill></>}{h.onAdventure && <> <Pill kind="warn">adventuring</Pill></>}
                {ctx.user.isAdmin && <> <button className="linkbtn" onClick={() => ctx.go({ name: "sheet", id: h.id })}>Sheet</button></>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Post a notice at the Broken Lantern: a new AI regular signs on, up to the level of your best living hero. */
function HireRegular({ ctx, onClose }: { ctx: AppCtx; onClose: () => void }) {
  const unlocked = ctx.campaign?.campaign.unlockedClasses ?? [];
  const living = ctx.characters.filter((c) => !c.dead && !c.retired);
  const maxLevel = Math.max(1, ...living.map((c) => c.level));
  const purse = living.reduce((n, c) => n + c.gold, 0);
  const fallenLevels = ctx.companions.filter((c) => c.ownerId === "ai" && c.dead).map((c) => c.level);
  const [classId, setClassId] = useState("");
  const [species, setSpecies] = useState("");
  const [background, setBackground] = useState("");
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [level, setLevel] = useState(Math.min(maxLevel, Math.max(1, ...fallenLevels.map((l) => l - 1), 1)));
  const [busy, setBusy] = useState(false);
  const cost = hireCost(level);
  const go = async () => {
    setBusy(true);
    const r = await attempt(() => api<{ character: CharacterSheet; message: string }>("/regulars/hire", { body: { classId: classId || undefined, species: species || undefined, background: background || undefined, name: name.trim() || undefined, persona: persona.trim() || undefined, level } }));
    setBusy(false);
    if (r) { toast(r.message, "info"); await ctx.refreshCharacters(); onClose(); }
  };
  return (
    <Modal title="Post a hiring notice" onClose={onClose}>
      <p className="small muted">Pin a notice to the Broken Lantern's board and a new regular turns up looking for work. Leave anything on “surprise me” and the tavern decides. They'll be an AI companion anyone in the company can recruit.</p>
      <label>Class
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">Surprise me</option>
          {Object.values(CLASSES).filter((c) => unlocked.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>Species
        <select value={species} onChange={(e) => setSpecies(e.target.value)}>
          <option value="">Surprise me</option>
          {Object.values(SPECIES).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label>Background
        <select value={background} onChange={(e) => setBackground(e.target.value)}>
          <option value="">Surprise me</option>
          {Object.values(BACKGROUNDS).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>Name (blank for a random one) <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} /></label>
      <label>Personality for the AI to play (blank to roll one) <textarea value={persona} onChange={(e) => setPersona(e.target.value)} rows={2} maxLength={400} placeholder="e.g. a retired sailor who sings shanties in every fight" /></label>
      <label className="num-field">Experience
        <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
          {Array.from({ length: maxLevel }, (_, i) => i + 1).map((l) => <option key={l} value={l}>Level {l}{hireCost(l) ? ` — ${hireCost(l)} gp` : " — free"}</option>)}
        </select>
      </label>
      <p className="small muted">Seasoned hands want pay up front (75 gp per level above 1), taken from your heroes' purses ({Math.floor(purse)} gp between them). You can hire up to the level of your best living hero (level {maxLevel}).</p>
      <div className="row end">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || purse < cost} onClick={go}>{busy ? "Hiring…" : `Hire${cost ? ` · ${cost} gp` : ""}`}</button>
      </div>
    </Modal>
  );
}
