import type { ReactNode } from "react";
import { CLASSES, XP_THRESHOLDS, MAX_LEVEL, SPECIES } from "@tavern/engine";
import type { CharacterSheet } from "@tavern/engine";

export function HpBar({ hp, max, temp = 0, small }: { hp: number; max: number; temp?: number; small?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const cls = pct > 60 ? "good" : pct > 25 ? "warn" : "bad";
  return (
    <div className={`hpbar ${small ? "small" : ""}`} title={`${hp}/${max} HP${temp ? ` (+${temp} temp)` : ""}`}>
      <div className={`hpfill ${cls}`} style={{ width: `${pct}%` }} />
      {!small && <span className="hptext">{hp}/{max}{temp ? ` +${temp}` : ""}</span>}
    </div>
  );
}

export function XpBar({ sheet }: { sheet: CharacterSheet }) {
  if (sheet.level >= MAX_LEVEL) return <div className="xpbar"><div className="xpfill" style={{ width: "100%" }} /><span className="hptext">Max level · {sheet.xp} XP</span></div>;
  const lo = XP_THRESHOLDS[sheet.level] ?? 0;
  const hi = XP_THRESHOLDS[sheet.level + 1] ?? lo + 1;
  const pct = Math.max(0, Math.min(100, ((sheet.xp - lo) / (hi - lo)) * 100));
  return (
    <div className="xpbar" title={`${sheet.xp}/${hi} XP`}>
      <div className="xpfill" style={{ width: `${pct}%` }} />
      <span className="hptext">{sheet.xp} / {hi} XP{sheet.xp >= hi ? " — level up!" : ""}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={`modal panel ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="linkbtn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function classLabel(s: { classId: string; species: string; level: number }) {
  const cls = CLASSES[s.classId as keyof typeof CLASSES]?.name ?? s.classId;
  const sp = SPECIES[s.species as keyof typeof SPECIES]?.name ?? s.species;
  return `Level ${s.level} ${sp} ${cls}`;
}

export const CLASS_ICON: Record<string, string> = { fighter: "⚔", rogue: "🗡", cleric: "✚", wizard: "✦", barbarian: "🪓", ranger: "🏹" };

export function questProgress(sheet: CharacterSheet, goals?: Record<string, number>): string {
  const q = sheet.personalQuest;
  if (!q) return "No personal quest";
  if (q.complete) return "Complete — ready to retire";
  if (!goals) return Object.entries(q.counters).map(([k, v]) => `${k}: ${Math.floor(v)}`).join(", ") || "Just begun";
  return Object.entries(goals).map(([k, v]) => `${Math.floor(q.counters[k] ?? 0)}/${v} ${humanize(k)}`).join(", ");
}

export function humanize(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export function Pill({ children, kind }: { children: ReactNode; kind?: string }) {
  return <span className={`pill ${kind ?? ""}`}>{children}</span>;
}
