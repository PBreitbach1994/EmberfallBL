// Animated d20 tray driven by new roll/check log entries.
import { useEffect, useRef, useState } from "react";
import type { LogEntry } from "@tavern/engine";
import { playDice } from "../sound";

interface Die { key: number; natural: number; rolls: number[]; label: string; total?: string; crit: boolean; fumble: boolean; success?: boolean }
let k = 1;

function toDie(e: LogEntry): Die | null {
  const d = e.data as { natural?: number; rolls?: number[]; total?: number; success?: boolean; label?: string } | undefined;
  if (!d || typeof d.natural !== "number") return null;
  const who = e.text.replace(/^🎲\s*/, "").split(/[—:]/)[0].trim();
  const total = /= (\d+)/.exec(e.text)?.[1];
  const success = d.success ?? (/\b(hit|CRITICAL|SUCCESS|success)\b/.test(e.text) ? true : /\b(miss|FAILURE|failure)\b/.test(e.text) ? false : undefined);
  return { key: k++, natural: d.natural, rolls: d.rolls ?? [d.natural], label: who.slice(0, 40), total, crit: d.natural === 20, fumble: d.natural === 1, success };
}

export function DiceTray({ log }: { log: LogEntry[] }) {
  const [dice, setDice] = useState<Die[]>([]);
  const lastT = useRef<number>(log.length ? log[log.length - 1].t : 0);
  useEffect(() => {
    const fresh = log.filter((l) => l.t > lastT.current && (l.kind === "roll" || l.kind === "check"));
    if (log.length) lastT.current = Math.max(lastT.current, log[log.length - 1].t);
    const ds = fresh.map(toDie).filter((x): x is Die => !!x).slice(-3);
    if (!ds.length) return;
    playDice();
    setDice((cur) => [...cur, ...ds].slice(-3));
    const t = window.setTimeout(() => setDice((cur) => cur.filter((x) => !ds.includes(x))), 3200);
    return () => clearTimeout(t);
  }, [log]);
  if (!dice.length) return null;
  return (
    <div className="dicetray" aria-live="polite">
      {dice.map((d) => (
        <div key={d.key} className={`die ${d.crit ? "crit" : ""} ${d.fumble ? "fumble" : ""} ${d.success === true ? "ok" : d.success === false ? "fail" : ""}`}>
          <D20 value={d.natural} />
          <div className="die-text">
            <strong>{d.label}</strong>
            <span>{d.rolls.length > 1 ? `${d.rolls.join(" / ")} → ` : ""}{d.total ? `total ${d.total}` : ""}{d.crit ? " · CRIT!" : d.fumble ? " · fumble" : ""}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function D20({ value, size = 46 }: { value: number; size?: number }) {
  return (
    <svg className="d20" width={size} height={size} viewBox="-24 -24 48 48" aria-label={`d20: ${value}`}>
      <g className="d20-spin">
        <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" className="d20-body" />
        <polygon points="0,-13 11,6 -11,6" className="d20-face" />
        <path d="M0 -22 L0 -13 M19 -11 L11 6 M19 11 L11 6 M0 22 L11 6 M0 22 L-11 6 M-19 11 L-11 6 M-19 -11 L-11 6 M-19 -11 L0 -13 M19 -11 L0 -13" className="d20-edge" />
      </g>
      <text className="d20-num" textAnchor="middle" dy="0.35em" y={1}>{value}</text>
    </svg>
  );
}
