import { useState } from "react";
import type { CharacterSheet } from "@tavern/engine";
import { BACKGROUNDS, CLASSES, SPECIES } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt } from "../api";
import { CLASS_ICON, HpBar, Modal, Pill, XpBar, classLabel, questProgress } from "../components/ui";

export function Characters({ ctx }: { ctx: AppCtx }) {
  const [quick, setQuick] = useState(false);
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
      <section className="panel">
        <h2>Tavern regulars (AI companions)</h2>
        <p className="small muted">Anyone can recruit these for an adventure.</p>
        <div className="cards">
          {ctx.companions.map((c) => <CharCard key={c.id} c={c} onOpen={() => ctx.go({ name: "sheet", id: c.id })} />)}
        </div>
      </section>
      {quick && <QuickBuild ctx={ctx} onClose={() => setQuick(false)} />}
    </div>
  );
}

function CharCard({ c, onOpen }: { c: CharacterSheet; onOpen: () => void }) {
  return (
    <button className={`charcard ${c.dead ? "dead" : ""}`} onClick={onOpen}>
      <div className="charcard-head">
        <span className="classicon">{CLASS_ICON[c.classId]}</span>
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
