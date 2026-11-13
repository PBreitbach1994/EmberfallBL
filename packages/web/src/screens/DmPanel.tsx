import { useState } from "react";
import type { Ability, AdventureAction, AdventureView, Point, Skill } from "@tavern/engine";
import { ABILITIES, ABILITY_NAMES, GEAR, MONSTERS, SKILL_NAMES, WEAPONS, ARMOR } from "@tavern/engine";

export function DmPanel({ view, act, spawning, setSpawning }: {
  view: AdventureView;
  act: (a: AdventureAction, characterId?: string) => Promise<void>;
  spawning: string | null;
  setSpawning: (monsterId: string | null) => void;
}) {
  const info = view.dmInfo!;
  const [text, setText] = useState("");
  const [goto, setGoto] = useState(info.nodes[0]?.id ?? "");
  const [skill, setSkill] = useState<string>("perception");
  const [dc, setDc] = useState(12);
  const [who, setWho] = useState("best");
  const [reason, setReason] = useState("");
  const [gold, setGold] = useState(0);
  const [xp, setXp] = useState(0);
  const [item, setItem] = useState("");
  const [awardTo, setAwardTo] = useState("");
  const [monster, setMonster] = useState(Object.keys(MONSTERS)[0]);
  const allOptions = [...(view.node?.options ?? []), ...info.hiddenOptions];
  const items = [...Object.values(GEAR), ...Object.values(WEAPONS), ...Object.values(ARMOR)];

  const isAbility = (ABILITIES as string[]).includes(skill);

  return (
    <section className="panel dmpanel">
      <h2>🎭 Dungeon Master's Screen</h2>
      {info.dmNotes && <div className="dmnotes"><strong>Secret notes:</strong> {info.dmNotes}</div>}
      {info.npcs.length > 0 && (
        <details open>
          <summary>NPCs</summary>
          <ul className="small">
            {info.npcs.map((n) => <li key={n.name}><strong>{n.name}</strong> ({n.role}) — {n.personality}{n.secrets?.length ? <div className="muted">Secrets: {n.secrets.join(" · ")}</div> : null}</li>)}
          </ul>
        </details>
      )}

      <h3>Narrate</h3>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe what happens, speak as an NPC…" />
      <div className="row end"><button className="primary" disabled={!text.trim()} onClick={async () => { await act({ kind: "dmNarrate", text: text.trim() }); setText(""); }}>Narrate</button></div>

      <h3>Resolve an option for the party</h3>
      <div className="btns">
        {allOptions.map((o) => <button key={o.id} onClick={() => act({ kind: "dmChooseFor", optionId: o.id })} title={o.check}>{o.label}{info.hiddenOptions.some((h) => h.id === o.id) ? " (hidden)" : ""}</button>)}
        {!allOptions.length && <span className="muted small">No options at this node.</span>}
      </div>

      <h3>Call for a check</h3>
      <div className="row wrap">
        <select value={skill} onChange={(e) => setSkill(e.target.value)}>
          <optgroup label="Skills">{Object.entries(SKILL_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>
          <optgroup label="Abilities">{ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}</option>)}</optgroup>
        </select>
        <label>DC <input type="number" min={5} max={30} value={dc} onChange={(e) => setDc(Number(e.target.value) || 10)} style={{ width: 60 }} /></label>
        <select value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="best">Best suited</option>
          <option value="group">Whole party (group)</option>
          {view.party.map((p) => <option key={p.characterId} value={p.characterId}>{p.name}</option>)}
        </select>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why?" />
        <button onClick={() => act({ kind: "dmCheck", skill: isAbility ? undefined : (skill as Skill), ability: isAbility ? (skill as Ability) : undefined, dc, who, reason: reason || "DM's call" })}>Roll</button>
      </div>

      <h3>Award</h3>
      <div className="row wrap">
        <label>Gold <input type="number" min={0} value={gold} onChange={(e) => setGold(Number(e.target.value) || 0)} style={{ width: 70 }} /></label>
        <label>XP <input type="number" min={0} value={xp} onChange={(e) => setXp(Number(e.target.value) || 0)} style={{ width: 70 }} /></label>
        <select value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">(no item)</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select value={awardTo} onChange={(e) => setAwardTo(e.target.value)}>
          <option value="">Party</option>
          {view.party.map((p) => <option key={p.characterId} value={p.characterId}>{p.name}</option>)}
        </select>
        <button onClick={() => act({ kind: "dmAward", gold: gold || undefined, xp: xp || undefined, itemId: item || undefined, characterId: awardTo || undefined })}>Give</button>
      </div>

      <h3>Move the story</h3>
      <div className="row wrap">
        <select value={goto} onChange={(e) => setGoto(e.target.value)}>
          {info.nodes.map((n) => <option key={n.id} value={n.id}>{n.title}{view.node?.id === n.id ? " (current)" : ""}</option>)}
        </select>
        <button onClick={() => act({ kind: "dmGoto", nodeId: goto })}>Go to scene</button>
      </div>

      {view.encounter && (
        <>
          <h3>Spawn a monster</h3>
          <div className="row wrap">
            <select value={monster} onChange={(e) => setMonster(e.target.value)}>
              {Object.values(MONSTERS).map((m) => <option key={m.id} value={m.id}>{m.name} (CR {m.cr})</option>)}
            </select>
            <button className={spawning ? "sel" : ""} onClick={() => setSpawning(spawning ? null : monster)}>{spawning ? "Click the map… (cancel)" : "Place on map"}</button>
          </div>
        </>
      )}

      <h3>End the scenario</h3>
      <div className="row wrap">
        <button className="primary" onClick={() => act({ kind: "dmEnd", outcome: "success" })}>Success</button>
        <button onClick={() => act({ kind: "dmEnd", outcome: "retreat" })}>Retreat</button>
        <button className="danger" onClick={() => act({ kind: "dmEnd", outcome: "failure" })}>Failure</button>
      </div>
    </section>
  );
}

export function spawnAction(monsterId: string, at: Point): AdventureAction {
  return { kind: "dmSpawn", monsterId, at };
}
