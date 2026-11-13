import { useMemo, useState } from "react";
import type { AdventureAction, AdventureView, CombatCommand, Combatant, EncounterState, Point, SpellDef } from "@tavern/engine";
import { SPELLS, areaTiles, current, describeCombatant, dist, hasLineOfSight, reachable, slotsRemaining } from "@tavern/engine";
import { HpBar, Pill } from "../components/ui";
import { Log } from "../components/Log";

type Mode =
  | { kind: "none" }
  | { kind: "attack"; attackId: string }
  | { kind: "spell"; spellId: string; slot: number; targets: string[] }
  | { kind: "point"; spellId?: string; slot?: number; breath?: boolean }
  | { kind: "target"; what: "help" | "stabilize" | "divineSpark" | "potion" };

const TILE_CLASS: Record<string, string> = { floor: "t-floor", wall: "t-wall", difficult: "t-diff", water: "t-water", pit: "t-pit", door: "t-door", cover: "t-cover" };

export function Combat({ view, me, act, mapClickOverride }: {
  view: AdventureView;
  me: string;
  act: (a: AdventureAction, characterId?: string) => Promise<void>;
  mapClickOverride?: (p: Point) => void;
}) {
  const enc = view.encounter as EncounterState;
  const actor = current(enc);
  const mine = actor.controller.kind === "human" && actor.controller.userId === me && enc.status === "active";
  const [mode, setMode] = useState<Mode>({ kind: "none" });
  const [hover, setHover] = useState<Point | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const b = enc.budget;

  const reach = useMemo(() => {
    if (!mine || mode.kind !== "none" || b.movement <= 0 || actor.conditions.includes("prone")) return new Map<string, number>();
    return reachable(enc, actor, b.movement);
  }, [enc, mine, mode.kind, b.movement, actor]);

  const send = async (command: CombatCommand) => {
    setMode({ kind: "none" });
    await act({ kind: "combat", command }, actor.characterId);
  };

  const at = (p: Point) => enc.combatants.find((c) => !c.fled && c.pos.x === p.x && c.pos.y === p.y && !(c.dead && c.side === "enemy"));

  // area preview
  const preview = useMemo(() => {
    if (!hover || mode.kind !== "point") return new Set<string>();
    let tiles: Point[] = [];
    if (mode.breath) tiles = areaTiles(enc.map, "cone", 15, actor.pos, hover);
    else if (mode.spellId) {
      const sp = SPELLS[mode.spellId];
      if (sp.targeting.kind === "area") tiles = areaTiles(enc.map, sp.targeting.shape, sp.targeting.size, actor.pos, hover);
      else tiles = [hover];
    }
    return new Set(tiles.map((t) => `${t.x},${t.y}`));
  }, [hover, mode, enc.map, actor.pos]);

  const spellTargets = mode.kind === "spell" ? mode.targets : [];

  const clickTile = (p: Point) => {
    if (mapClickOverride) { mapClickOverride(p); return; }
    const occ = at(p);
    if (!mine) { if (occ) setInspect(occ.id); return; }
    switch (mode.kind) {
      case "none":
        if (occ) { setInspect(occ.id); return; }
        if (reach.has(`${p.x},${p.y}`)) send({ type: "move", to: p });
        return;
      case "attack":
        if (occ && occ.id !== actor.id) send({ type: "attack", attackId: mode.attackId, targetId: occ.id });
        return;
      case "target":
        if (!occ) return;
        if (mode.what === "help") send({ type: "help", targetId: occ.id });
        if (mode.what === "stabilize") send({ type: "stabilize", targetId: occ.id });
        if (mode.what === "divineSpark") send({ type: "channelDivinity", mode: "divineSpark", targetId: occ.id });
        if (mode.what === "potion") send({ type: "useItem", itemId: "potionHealing", targetId: occ.id });
        return;
      case "point":
        if (mode.breath) send({ type: "breathWeapon", point: p });
        else if (mode.spellId) send({ type: "cast", spellId: mode.spellId, slotLevel: mode.slot || undefined, point: p });
        return;
      case "spell": {
        if (!occ) return;
        const sp = SPELLS[mode.spellId];
        const max = maxTargets(sp, mode.slot);
        const repeat = sp.effect?.kind === "magicMissile" || sp.effect?.kind === "scorchingRay";
        let t = mode.targets;
        if (!repeat && t.includes(occ.id)) t = t.filter((x) => x !== occ.id);
        else if (t.length < max) t = [...t, occ.id];
        if (max === 1 && t.length === 1) { send({ type: "cast", spellId: sp.id, slotLevel: mode.slot || undefined, targetIds: t }); return; }
        setMode({ ...mode, targets: t });
        return;
      }
    }
  };

  const tilePx = Math.max(22, Math.min(40, Math.floor(720 / enc.map.width)));
  const inspected = inspect ? enc.combatants.find((c) => c.id === inspect) : null;
  const order = enc.order.map((id) => enc.combatants.find((c) => c.id === id)!).filter(Boolean);

  return (
    <div className="combat">
      <div className="combat-head">
        <h2>⚔ {enc.name} <span className="muted small">Round {enc.round}</span></h2>
        {enc.objective && <div className="small">Objective: {enc.objective}</div>}
      </div>
      <div className="turnorder">
        {order.map((c) => (
          <button key={c.id} className={`turn ${c.id === actor.id ? "now" : ""} side-${c.side} ${c.dead || c.fled ? "gone" : ""}`} onClick={() => setInspect(c.id)} title={describeCombatant(c)}>
            <span>{initials(c.name)}</span>
            <HpBar hp={c.hp} max={c.maxHp} small />
          </button>
        ))}
      </div>
      <div className="combat-body">
        <div className="gridwrap">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${enc.map.width}, ${tilePx}px)`, gridAutoRows: `${tilePx}px` }} onMouseLeave={() => setHover(null)}>
            {enc.map.tiles.flatMap((row, y) => row.map((t, x) => {
              const key = `${x},${y}`;
              const occ = at({ x, y });
              const isReach = reach.has(key) && !occ;
              const inArea = preview.has(key);
              const targeted = occ && spellTargets.includes(occ.id);
              const targetable = occ && (mode.kind === "attack" || mode.kind === "spell" || mode.kind === "target") && occ.id !== actor.id && validTarget(enc, actor, occ, mode);
              return (
                <div
                  key={key}
                  className={`tile ${TILE_CLASS[t] ?? "t-floor"} ${isReach ? "reach" : ""} ${inArea ? "area" : ""} ${targetable ? "targetable" : ""}`}
                  onClick={() => clickTile({ x, y })}
                  onMouseEnter={() => setHover({ x, y })}
                  title={occ ? describeCombatant(occ) : isReach ? `Move here (${reach.get(key)} ft)` : t}
                >
                  {occ && (
                    <div className={`token side-${occ.side} ${occ.id === actor.id ? "active" : ""} ${occ.dead ? "dead" : ""} ${occ.hp <= 0 && !occ.dead ? "down" : ""} ${targeted ? "targeted" : ""}`}>
                      <span>{initials(occ.name)}</span>
                      <div className="token-hp"><div style={{ width: `${Math.max(0, (occ.hp / occ.maxHp) * 100)}%` }} /></div>
                      {targeted && spellTargets.filter((x) => x === occ.id).length > 1 && <em>×{spellTargets.filter((x) => x === occ.id).length}</em>}
                    </div>
                  )}
                </div>
              );
            }))}
          </div>
          <div className="legend small muted">
            <span><i className="sw t-wall" /> wall</span><span><i className="sw t-diff" /> difficult</span><span><i className="sw t-water" /> water</span>
            <span><i className="sw t-cover" /> cover</span><span><i className="sw t-pit" /> pit</span><span><i className="sw t-door" /> door</span>
          </div>
          {inspected && <Inspect c={inspected} onClose={() => setInspect(null)} />}
        </div>
        <div className="combat-side">
          <div className="whoseturn">
            {enc.status !== "active" ? <strong>Battle over: {enc.status}</strong> : mine ? <strong>Your turn: {actor.name}</strong> : <span>{actor.name}'s turn{actor.controller.kind !== "human" ? " (AI)" : ""}…</span>}
          </div>
          {mine && <ActionBar actor={actor} enc={enc} mode={mode} setMode={setMode} send={send} act={act} />}
          <Log entries={enc.log} compact />
        </div>
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const num = parts.find((p) => /^\d+$/.test(p));
  const base = parts.filter((p) => !/^\d+$/.test(p)).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return num ? `${base[0] ?? "?"}${num}` : base;
}

function maxTargets(sp: SpellDef, slot: number) {
  if (sp.targeting.kind !== "creature") return 0;
  const up = Math.max(0, slot - sp.level);
  if (sp.effect?.kind === "magicMissile") return sp.effect.darts + up;
  if (sp.effect?.kind === "scorchingRay") return sp.effect.rays + up;
  return (sp.targeting.count ?? 1) + (sp.id === "bless" || sp.id === "aid" ? up : 0);
}

function validTarget(enc: EncounterState, actor: Combatant, t: Combatant, mode: Mode): boolean {
  const d = dist(actor.pos, t.pos);
  if (!hasLineOfSight(enc.map, actor.pos, t.pos)) return false;
  if (mode.kind === "attack") {
    const a = actor.attacks.find((x) => x.id === mode.attackId);
    if (!a || t.side === actor.side) return false;
    return d <= a.reach || (!!a.range && d <= a.range[1]);
  }
  if (mode.kind === "spell") {
    const sp = SPELLS[mode.spellId];
    return sp.targeting.kind === "creature" && d <= sp.targeting.range;
  }
  if (mode.kind === "target") {
    if (mode.what === "help") return d <= 5;
    if (mode.what === "stabilize") return d <= 5 && t.hp <= 0 && !t.dead;
    if (mode.what === "divineSpark") return d <= 30;
    if (mode.what === "potion") return d <= 5 && t.side === actor.side;
  }
  return false;
}

function Inspect({ c, onClose }: { c: Combatant; onClose: () => void }) {
  return (
    <div className="inspect panel">
      <div className="row spread"><strong>{c.name}</strong><button className="linkbtn" onClick={onClose}>✕</button></div>
      <div className="small">{describeCombatant(c)}</div>
      <HpBar hp={c.hp} max={c.maxHp} temp={c.tempHp} />
      <div className="small">Speed {c.speed} ft · Init {Math.floor(c.initiative)}</div>
      {c.attacks.length > 0 && <div className="small">Attacks: {c.attacks.map((a) => a.name).join(", ")}</div>}
      {c.monsterActions && <div className="small">Actions: {c.monsterActions.map((a) => a.name).join(", ")}</div>}
      {c.side === "party" && c.hp <= 0 && !c.dead && <div className="small">Death saves: {c.deathSaves.successes}✓ {c.deathSaves.failures}✗{c.stable ? " (stable)" : ""}</div>}
      {c.resistances.length > 0 && <div className="small">Resists: {c.resistances.join(", ")}</div>}
      {c.vulnerabilities.length > 0 && <div className="small">Vulnerable: {c.vulnerabilities.join(", ")}</div>}
      {c.immunities.length > 0 && <div className="small">Immune: {c.immunities.join(", ")}</div>}
    </div>
  );
}

function ActionBar({ actor, enc, mode, setMode, send, act }: {
  actor: Combatant; enc: EncounterState; mode: Mode; setMode: (m: Mode) => void; send: (c: CombatCommand) => void;
  act: (a: AdventureAction, characterId?: string) => Promise<void>;
}) {
  const b = enc.budget;
  const f = (k: string) => actor.features.includes(k);
  const r = (k: string) => actor.resources[k] ?? 0;
  const slots = slotsRemaining(actor);
  const canAttack = (b.action && b.attacksLeft > 0) || (b.lightAttackMade && (b.bonusAction || !b.nickUsed));
  const spells = actor.spells.map((id) => SPELLS[id]).filter((s): s is SpellDef => !!s && s.castingTime !== "reaction").sort((a, c) => a.level - c.level);
  const raging = actor.effects.some((e) => e.kind === "rage");

  const startSpell = (sp: SpellDef) => {
    const minSlot = slots.findIndex((n, i) => i >= sp.level && n > 0);
    const slot = sp.level === 0 ? 0 : minSlot > 0 ? minSlot : sp.level;
    if (sp.effect?.kind === "mistyStep" || sp.targeting.kind === "area") { setMode({ kind: "point", spellId: sp.id, slot }); return; }
    if (sp.targeting.kind === "self") { send({ type: "cast", spellId: sp.id, slotLevel: slot || undefined }); return; }
    setMode({ kind: "spell", spellId: sp.id, slot, targets: [] });
  };
  const spellUsable = (sp: SpellDef) => {
    if (raging) return false;
    if (sp.castingTime === "action" && !b.action) return false;
    if (sp.castingTime === "bonus" && !b.bonusAction) return false;
    if (sp.level === 0) return true;
    if (b.bonusSpellCast && !(sp.id === "spiritualWeapon" && actor.effects.some((e) => e.kind === "spiritualWeapon"))) return false;
    if (sp.id === "huntersMark" && r("favoredEnemy") > 0) return true;
    if (sp.id === "spiritualWeapon" && actor.effects.some((e) => e.kind === "spiritualWeapon")) return true;
    return slots.some((n, i) => i >= sp.level && n > 0) || (sp.level === 1 && r("magicInitiate") > 0);
  };

  return (
    <div className="actionbar">
      <div className="budget">
        <Pill kind={b.action ? "good" : "muted"}>Action</Pill>
        <Pill kind={b.bonusAction ? "good" : "muted"}>Bonus</Pill>
        <Pill kind={b.reaction ? "good" : "muted"}>Reaction</Pill>
        <Pill>{b.movement} ft</Pill>
        {f("extraAttack") && <Pill>{b.attacksLeft} attacks</Pill>}
        {slots.some((n) => n > 0) && <Pill>Slots {slots.map((n, i) => (i > 0 && actor.spellSlots[i] ? `L${i}:${n}` : "")).filter(Boolean).join(" ")}</Pill>}
      </div>

      {mode.kind !== "none" && (
        <div className="modebar">
          {mode.kind === "attack" && <span>Choose a target for {actor.attacks.find((a) => a.id === mode.attackId)?.name}.</span>}
          {mode.kind === "point" && <span>Click a square to aim {mode.breath ? "your breath weapon" : SPELLS[mode.spellId!]?.name}.</span>}
          {mode.kind === "target" && <span>Choose a creature ({mode.what}).</span>}
          {mode.kind === "spell" && (
            <span>
              {SPELLS[mode.spellId].name}: pick up to {maxTargets(SPELLS[mode.spellId], mode.slot)} target(s) ({mode.targets.length} chosen).
              {SPELLS[mode.spellId].level > 0 && (
                <select value={mode.slot} onChange={(e) => setMode({ ...mode, slot: Number(e.target.value) })}>
                  {slots.map((n, i) => (i >= SPELLS[mode.spellId].level && n > 0 ? <option key={i} value={i}>Slot L{i} ({n})</option> : null))}
                </select>
              )}
              <button className="primary tiny" disabled={!mode.targets.length} onClick={() => send({ type: "cast", spellId: mode.spellId, slotLevel: mode.slot || undefined, targetIds: mode.targets })}>Cast</button>
            </span>
          )}
          {mode.kind === "point" && mode.spellId && SPELLS[mode.spellId].level > 0 && (
            <select value={mode.slot} onChange={(e) => setMode({ ...mode, slot: Number(e.target.value) })}>
              {slots.map((n, i) => (i >= SPELLS[mode.spellId!].level && n > 0 ? <option key={i} value={i}>Slot L{i} ({n})</option> : null))}
            </select>
          )}
          <button className="tiny" onClick={() => setMode({ kind: "none" })}>Cancel</button>
        </div>
      )}

      <h4>Attack</h4>
      <div className="btns">
        {actor.attacks.map((a) => (
          <button key={a.id} disabled={!canAttack} className={mode.kind === "attack" && mode.attackId === a.id ? "sel" : ""} onClick={() => setMode({ kind: "attack", attackId: a.id })} title={`${a.toHit >= 0 ? "+" : ""}${a.toHit} to hit, ${a.damage}${a.damageBonus ? (a.damageBonus > 0 ? "+" : "") + a.damageBonus : ""} ${a.damageType}${a.mastery ? `, mastery: ${a.mastery}` : ""}`}>
            {a.name}{a.mastery ? " ◆" : ""}
          </button>
        ))}
        {f("breathWeapon") && <button disabled={!canAttack || r("breathWeapon") <= 0} onClick={() => setMode({ kind: "point", breath: true })}>Breath Weapon ({r("breathWeapon")})</button>}
      </div>

      {spells.length > 0 && (
        <>
          <h4>Spells</h4>
          <div className="btns">
            {spells.map((sp) => (
              <button key={sp.id} disabled={!spellUsable(sp)} onClick={() => startSpell(sp)} title={sp.description}>
                {sp.name} <small>{sp.level === 0 ? "" : `L${sp.level}`}{sp.castingTime === "bonus" ? " (B)" : ""}</small>
              </button>
            ))}
          </div>
        </>
      )}

      <h4>Features</h4>
      <div className="btns">
        {f("secondWind") && <button disabled={!b.bonusAction || r("secondWind") <= 0} onClick={() => send({ type: "secondWind" })}>Second Wind ({r("secondWind")})</button>}
        {f("actionSurge") && <button disabled={r("actionSurge") <= 0 || !!b.actionSurgeActive} onClick={() => send({ type: "actionSurge" })}>Action Surge ({r("actionSurge")})</button>}
        {f("rage") && <button disabled={!b.bonusAction || raging || r("rage") <= 0} onClick={() => send({ type: "rage" })}>Rage ({r("rage")})</button>}
        {f("recklessAttack") && <button disabled={actor.effects.some((e) => e.kind === "recklessAttack")} onClick={() => send({ type: "reckless" })}>Reckless Attack</button>}
        {f("cunningAction") && (
          <>
            <button disabled={!b.bonusAction} onClick={() => send({ type: "cunningAction", mode: "dash" })}>Cunning: Dash</button>
            <button disabled={!b.bonusAction} onClick={() => send({ type: "cunningAction", mode: "disengage" })}>Cunning: Disengage</button>
            <button disabled={!b.bonusAction} onClick={() => send({ type: "cunningAction", mode: "hide" })}>Cunning: Hide</button>
          </>
        )}
        {f("channelDivinity") && (
          <>
            <button disabled={!b.action || r("channelDivinity") <= 0} onClick={() => send({ type: "channelDivinity", mode: "turnUndead" })}>Turn Undead ({r("channelDivinity")})</button>
            <button disabled={!b.action || r("channelDivinity") <= 0} onClick={() => setMode({ kind: "target", what: "divineSpark" })}>Divine Spark</button>
            {f("preserveLife") && <button disabled={!b.action || r("channelDivinity") <= 0} onClick={() => send({ type: "channelDivinity", mode: "preserveLife" })}>Preserve Life</button>}
          </>
        )}
        {r("item:potionHealing") > 0 && <button disabled={!b.bonusAction} onClick={() => setMode({ kind: "target", what: "potion" })}>Potion of Healing ({r("item:potionHealing")})</button>}
      </div>

      <h4>Actions</h4>
      <div className="btns">
        <button disabled={!b.action} onClick={() => send({ type: "dash" })}>Dash</button>
        <button disabled={!b.action} onClick={() => send({ type: "disengage" })}>Disengage</button>
        <button disabled={!b.action} onClick={() => send({ type: "dodge" })}>Dodge</button>
        <button disabled={!b.action} onClick={() => setMode({ kind: "target", what: "help" })}>Help</button>
        <button disabled={!b.action} onClick={() => send({ type: "hide" })}>Hide</button>
        <button disabled={!b.action} onClick={() => setMode({ kind: "target", what: "stabilize" })}>Stabilize</button>
        {actor.conditions.includes("prone") && <button onClick={() => send({ type: "standUp" })}>Stand Up</button>}
      </div>
      <div className="row end">
        <button onClick={() => act({ kind: "autoTurn" }, actor.characterId)} title="Let the tactical AI play this turn">Auto</button>
        <button className="primary" onClick={() => send({ type: "endTurn" })}>End Turn</button>
      </div>
    </div>
  );
}
