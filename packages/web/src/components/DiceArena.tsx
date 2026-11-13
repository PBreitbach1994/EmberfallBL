// The dice arena: real polyhedral dice tumble onto a felt tray and land on the numbers the engine
// rolled. Attack/check d20s are followed by the damage dice that came with them.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LogEntry } from "@tavern/engine";
import { playDice } from "../sound";
import { DiceTray } from "./DiceTray";

// ---------------------------------------------------------------------------------------------
// Display mode (Full / Compact / Off), remembered per browser

export type DiceMode = "full" | "compact" | "off";
const KEY = "tavern.dice";
const listeners = new Set<(m: DiceMode) => void>();
function readMode(): DiceMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "full" || v === "compact" || v === "off") return v;
  } catch { /* ignore */ }
  try { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "compact"; } catch { /* ignore */ }
  return "full";
}
export function useDiceMode(): [DiceMode, (m: DiceMode) => void] {
  const [mode, setMode] = useState<DiceMode>(readMode);
  useEffect(() => { listeners.add(setMode); return () => { listeners.delete(setMode); }; }, []);
  return [mode, (m) => { try { localStorage.setItem(KEY, m); } catch { /* ignore */ } listeners.forEach((l) => l(m)); }];
}
export function DiceModeToggle() {
  const [mode, set] = useDiceMode();
  const next: Record<DiceMode, DiceMode> = { full: "compact", compact: "off", off: "full" };
  const label: Record<DiceMode, string> = { full: "Dice: full throw", compact: "Dice: compact", off: "Dice: off" };
  return (
    <button className="linkbtn dice-toggle" onClick={() => set(next[mode])} title={`${label[mode]} (click to change)`} aria-label={label[mode]}>
      🎲<small>{mode === "full" ? "" : mode === "compact" ? "·" : "✕"}</small>
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Turning log entries into throws

interface ThrowDie { id: number; sides: number; value: number; kind: "d20" | "damage" | "heal"; dropped?: boolean; crit?: boolean; fumble?: boolean; x: number; y: number; rot: number; delay: number }
interface Throw { id: number; title: string; detail?: string; outcome?: "hit" | "miss" | "crit" | "success" | "failure" | "fumble"; dice: ThrowDie[]; long: boolean }

let seq = 1;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function d20Dice(e: LogEntry, delay: number): ThrowDie[] {
  const d = e.data as { natural: number; rolls?: number[] };
  const rolls = d.rolls?.length ? d.rolls : [d.natural];
  let keptUsed = false;
  return rolls.map((v) => {
    const kept = !keptUsed && v === d.natural;
    if (kept) keptUsed = true;
    return { id: seq++, sides: 20, value: v, kind: "d20" as const, dropped: rolls.length > 1 && !kept, crit: kept && v === 20, fumble: kept && v === 1, x: 0, y: 0, rot: 0, delay };
  });
}

function outcomeOf(text: string): Throw["outcome"] {
  if (/CRITICAL|natural 20/i.test(text)) return "crit";
  if (/natural 1!/i.test(text)) return "fumble";
  if (/— hit|\bhit\b/.test(text) && !/miss/.test(text)) return "hit";
  if (/— miss|\bmiss\b/.test(text)) return "miss";
  if (/SUCCESS|— success|: success/i.test(text)) return "success";
  if (/FAILURE|— failure|: failure/i.test(text)) return "failure";
  return undefined;
}

function titleOf(text: string): string {
  return text.replace(/^🎲\s*/, "").split(/:\s|\s—\s/)[0].slice(0, 60);
}

/** Lay dice out across the tray without overlapping. */
function scatter(dice: ThrowDie[]) {
  const n = dice.length;
  const cols = Math.min(n, 6);
  dice.forEach((d, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    d.x = (col + 0.5) / cols * 100 + rand(-4, 4);
    d.y = 38 + row * 34 + rand(-6, 6);
    d.rot = rand(-25, 25);
  });
}

function buildThrows(entries: LogEntry[]): Throw[] {
  const throws: Throw[] = [];
  let init: Throw | null = null;
  for (const e of entries) {
    const data = e.data as { natural?: number; dice?: { sides: number; value: number }[] } | undefined;
    if ((e.kind === "roll" || e.kind === "check") && typeof data?.natural === "number") {
      if (/rolls initiative/.test(e.text)) {
        if (!init) { init = { id: seq++, title: "Roll for initiative!", dice: [], long: false }; throws.push(init); }
        if (init.dice.length < 12) init.dice.push(...d20Dice(e, init.dice.length * 0.06).slice(0, 1));
        continue;
      }
      const total = /=\s*(\d+)/.exec(e.text)?.[1];
      const vs = /vs (AC|DC) (\d+)/.exec(e.text);
      throws.push({ id: seq++, title: titleOf(e.text), detail: total ? `${total}${vs ? ` vs ${vs[1]} ${vs[2]}` : ""}` : undefined, outcome: outcomeOf(e.text), dice: d20Dice(e, 0), long: false });
      continue;
    }
    if (e.kind === "combat" && data?.dice?.length) {
      const heal = /regains/.test(e.text);
      const dice: ThrowDie[] = data.dice.slice(0, 14).map((d, i) => ({ id: seq++, sides: d.sides, value: d.value, kind: heal ? "heal" : "damage", x: 0, y: 0, rot: 0, delay: 0.9 + i * 0.05 }));
      const amount = /(takes|regains) (\d+)/.exec(e.text)?.[2];
      const last = throws[throws.length - 1];
      if (last && last.dice.every((d) => d.kind === "d20") && last !== init && (last.outcome === "hit" || last.outcome === "crit")) {
        last.dice.push(...dice);
        last.detail = `${last.detail ?? ""} · ${amount ?? "?"} ${heal ? "healed" : "damage"}`.replace(/^ · /, "");
        last.long = true;
      } else {
        dice.forEach((d) => (d.delay -= 0.85));
        throws.push({ id: seq++, title: e.text.replace(/^[^\p{L}]+/u, "").split(/[.(]/)[0].slice(0, 60), detail: amount ? `${amount} ${heal ? "healed" : "damage"}` : undefined, dice, long: false });
      }
    }
  }
  for (const t of throws) scatter(t.dice);
  return throws;
}

// ---------------------------------------------------------------------------------------------
// Rendering

function DieShape({ sides }: { sides: number }) {
  switch (sides) {
    case 4: return <polygon points="0,-24 22,16 -22,16" />;
    case 6: return <rect x={-19} y={-19} width={38} height={38} rx={6} />;
    case 8: return <><polygon points="0,-24 22,0 0,24 -22,0" /><path className="die-edge" d="M-22 0 H22" /></>;
    case 10: return <><polygon points="0,-24 21,-4 12,20 -12,20 -21,-4" /><path className="die-edge" d="M0 -24 L0 6 M-21 -4 L0 6 L21 -4" /></>;
    case 12: return <><polygon points="0,-23 22,-7 14,19 -14,19 -22,-7" /><polygon className="die-inner" points="0,-12 11,-3 7,11 -7,11 -11,-3" /></>;
    case 20: return <><polygon points="0,-24 21,-12 21,12 0,24 -21,12 -21,-12" /><polygon className="die-inner" points="0,-14 12,7 -12,7" /><path className="die-edge" d="M0 -24 L0 -14 M21 -12 L12 7 M21 12 L12 7 M0 24 L12 7 M0 24 L-12 7 M-21 12 L-12 7 M-21 -12 L-12 7 M-21 -12 L0 -14 M21 -12 L0 -14" /></>;
    default: return <circle r={22} />;
  }
}

function Die({ d, speed }: { d: ThrowDie; speed: number }) {
  const [shown, setShown] = useState<number>(() => 1 + Math.floor(Math.random() * d.sides));
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    let alive = true;
    const start = window.setTimeout(() => {
      const spin = window.setInterval(() => alive && setShown(1 + Math.floor(Math.random() * d.sides)), 70);
      window.setTimeout(() => { clearInterval(spin); if (alive) { setShown(d.value); setLanded(true); } }, 650 * speed);
    }, Math.max(0, d.delay) * 1000 * speed);
    return () => { alive = false; clearTimeout(start); };
  }, [d, speed]);
  const cls = ["adie", `d${d.sides}`, d.kind, landed ? "landed" : "rolling", d.dropped && landed ? "dropped" : "", d.crit && landed ? "crit" : "", d.fumble && landed ? "fumble" : ""].join(" ");
  return (
    <div className={cls} style={{ left: `${d.x}%`, top: `${d.y}%`, ["--rot" as string]: `${d.rot}deg`, ["--delay" as string]: `${Math.max(0, d.delay) * speed}s`, ["--dur" as string]: `${0.75 * speed}s`, ["--from-x" as string]: `${rand(-260, -120)}px`, ["--from-y" as string]: `${rand(-90, 40)}px` }}>
      <svg viewBox="-26 -26 52 52" width="52" height="52" aria-hidden="true">
        <g className="die-body"><DieShape sides={d.sides} /></g>
        <text className="die-num" textAnchor="middle" dy="0.36em" y={d.sides === 4 ? 5 : 0}>{shown}</text>
      </svg>
      <span className="die-label">d{d.sides}</span>
    </div>
  );
}

function Arena({ t, speed, onDone }: { t: Throw; speed: number; onDone: () => void }) {
  useEffect(() => {
    playDice();
    const ms = (t.long ? 2600 : 1900) * speed + 400;
    const h = window.setTimeout(onDone, ms);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(); };
    window.addEventListener("keydown", esc);
    return () => { clearTimeout(h); window.removeEventListener("keydown", esc); };
  }, [t, speed, onDone]);
  return (
    <div className="dice-arena" role="status" aria-live="polite">
      <div className="dice-felt">
        {t.dice.map((d) => <Die key={d.id} d={d} speed={speed} />)}
      </div>
      <div className={`dice-caption ${t.outcome ?? ""}`} onClick={onDone} title="Click (or press Esc) to skip" style={{ ["--delay" as string]: `${(t.long ? 1.6 : 0.75) * speed}s` }}>
        <strong>{t.title}</strong>
        {t.detail && <span>{t.detail}</span>}
        {t.outcome && <em>{t.outcome === "crit" ? "Critical!" : t.outcome === "fumble" ? "Natural 1!" : t.outcome}</em>}
        <span className="dice-skip">skip ✕</span>
      </div>
    </div>
  );
}

export function Dice({ log: storyLog, combatLog }: { log: LogEntry[]; combatLog?: LogEntry[] }) {
  // checks live in the story log, attacks/damage/initiative in the fight's own log: watch both
  const log = useMemo(() => (combatLog?.length ? [...storyLog, ...combatLog].sort((a, b) => a.t - b.t) : storyLog), [storyLog, combatLog]);
  const [mode] = useDiceMode();
  const [queue, setQueue] = useState<Throw[]>([]);
  const lastT = useRef<number>(log.length ? log[log.length - 1].t : 0);
  const done = useCallback(() => setQueue((q) => q.slice(1)), []);
  useEffect(() => {
    const fresh = log.filter((l) => l.t > lastT.current);
    if (log.length) lastT.current = Math.max(lastT.current, log[log.length - 1].t);
    if (!fresh.length || mode !== "full") return;
    const ts = buildThrows(fresh);
    if (ts.length) setQueue((q) => [...q, ...ts].slice(-8));
  }, [log, mode]);
  if (mode === "off") return null;
  if (mode === "compact") return <DiceTray log={log} />;
  const cur = queue[0];
  if (!cur) return null;
  // speed up when a burst of AI turns has queued many throws
  const speed = queue.length > 4 ? 0.45 : queue.length > 2 ? 0.7 : 1;
  return <Arena key={cur.id} t={cur} speed={speed} onDone={done} />;
}
