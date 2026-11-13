// Original SVG emblems for classes, monster types and conditions.
// All shapes are drawn in a 24×24 box centred on (0,0) → coordinates -12..12.
import type { ReactNode } from "react";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const F = { fill: "currentColor", stroke: "none" };

const CLASS_PATHS: Record<string, ReactNode> = {
  fighter: (
    <g {...S}>
      <path d="M-8 -8 L7 7 M8 -8 L-7 7" />
      <path d="M-9 -5 L-5 -9 M5 -9 L9 -5" />
      <path d="M4 4 L8 8 M-4 4 L-8 8" strokeWidth={2.6} />
    </g>
  ),
  rogue: (
    <g {...S}>
      <path d="M0 -10 L3 2 L0 4 L-3 2 Z" {...F} />
      <path d="M-6 4 H6 M0 4 V10" />
      <circle cx={0} cy={10.5} r={1.4} {...F} />
    </g>
  ),
  cleric: (
    <g {...S}>
      <circle cx={0} cy={0} r={4.2} {...F} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return <path key={i} d={`M${Math.cos(a) * 6.5} ${Math.sin(a) * 6.5} L${Math.cos(a) * 10} ${Math.sin(a) * 10}`} />;
      })}
    </g>
  ),
  wizard: <path d={star(5, 10, 4.2)} {...F} />,
  barbarian: (
    <g {...S}>
      <path d="M-7 10 L5 -6" strokeWidth={2.4} />
      <path d="M2 -10 C10 -9 11 -1 7 3 L1 -3 Z" {...F} />
    </g>
  ),
  ranger: (
    <g {...S}>
      <path d="M-4 -10 C6 -6 6 6 -4 10" />
      <path d="M-4 -10 L-4 10" strokeWidth={1} />
      <path d="M-9 0 H9 M6 -3 L9 0 L6 3" />
    </g>
  ),
  paladin: (
    <g {...S}>
      <path d="M0 -10 L8 -7 V0 C8 6 4 9 0 11 C-4 9 -8 6 -8 0 V-7 Z" />
      <path d="M0 -5 V6 M-4 0 H4" />
    </g>
  ),
  monk: (
    <g {...S}>
      <circle cx={0} cy={0} r={9} />
      <path d="M0 -9 C-5 -9 -5 0 0 0 C5 0 5 9 0 9" />
      <circle cx={0} cy={-4.5} r={1.4} {...F} />
      <circle cx={0} cy={4.5} r={1.4} />
    </g>
  ),
  bard: (
    <g {...S}>
      <ellipse cx={-3} cy={4} rx={5.5} ry={6} />
      <circle cx={-3} cy={4} r={1.5} {...F} />
      <path d="M1 -1 L8 -10 M6 -11 L10 -7" />
    </g>
  ),
  druid: (
    <g {...S}>
      <path d="M-8 9 C-9 -3 0 -10 9 -9 C9 1 2 9 -8 9 Z" />
      <path d="M-8 9 L4 -4" />
    </g>
  ),
  sorcerer: <path d="M0 -11 C5 -5 8 -1 6 5 C5 9 2 11 0 11 C-4 11 -7 8 -7 4 C-7 0 -4 -2 -3 -6 C-1 -3 0 -1 1 0 C2 -4 1 -8 0 -11 Z" {...F} />,
  warlock: (
    <g {...S}>
      <path d="M-10 0 C-5 -7 5 -7 10 0 C5 7 -5 7 -10 0 Z" />
      <circle cx={0} cy={0} r={3} {...F} />
      <path d="M0 -10 V-7 M0 7 V10" />
    </g>
  ),
};

const MONSTER_PATHS: Record<string, ReactNode> = {
  beast: (
    <g {...F}>
      <ellipse cx={0} cy={4} rx={5} ry={4.2} />
      <ellipse cx={-6.5} cy={-2.5} rx={2} ry={2.6} />
      <ellipse cx={-2.4} cy={-6.5} rx={2} ry={2.6} />
      <ellipse cx={2.4} cy={-6.5} rx={2} ry={2.6} />
      <ellipse cx={6.5} cy={-2.5} rx={2} ry={2.6} />
    </g>
  ),
  undead: (
    <g>
      <path d="M0 -10 C7 -10 9 -5 9 -1 C9 3 6 4 6 6 V9 H-6 V6 C-6 4 -9 3 -9 -1 C-9 -5 -7 -10 0 -10 Z" {...F} />
      <circle cx={-3.4} cy={-1} r={2.3} fill="#120c09" />
      <circle cx={3.4} cy={-1} r={2.3} fill="#120c09" />
      <path d="M-2 9 V6 M0 9 V6 M2 9 V6" stroke="#120c09" strokeWidth={1} />
    </g>
  ),
  goblinoid: (
    <g>
      <path d="M-11 -6 L-5 -2 C-5 -8 5 -8 5 -2 L11 -6 L7 2 C6 8 3 10 0 10 C-3 10 -6 8 -7 2 Z" {...F} />
      <circle cx={-2.5} cy={0} r={1.4} fill="#ffd27a" />
      <circle cx={2.5} cy={0} r={1.4} fill="#ffd27a" />
      <path d="M-2 6 L-1 4 L0 6 L1 4 L2 6" stroke="#120c09" strokeWidth={0.9} fill="none" />
    </g>
  ),
  humanoid: (
    <g {...S}>
      <path d="M-8 4 C-8 -6 -4 -10 0 -10 C4 -10 8 -6 8 4 Z" {...F} />
      <path d="M-9 4 H9" />
      <path d="M-2 -3 H2 M0 -3 V3" stroke="#120c09" />
    </g>
  ),
  giant: (
    <g {...S}>
      <path d="M-8 10 L4 -4" strokeWidth={2.6} />
      <path d="M2 -6 C2 -11 10 -11 10 -5 C10 -1 6 1 4 -1 Z" {...F} />
    </g>
  ),
  fiend: (
    <g {...F}>
      <path d="M-9 -10 C-8 -4 -5 -3 -4 -3 L-5 2 C-4 8 4 8 5 2 L4 -3 C5 -3 8 -4 9 -10 C6 -6 3 -6 0 -6 C-3 -6 -6 -6 -9 -10 Z" />
    </g>
  ),
  dragon: <path d="M-10 6 C-6 -2 -2 -8 6 -10 C3 -6 3 -3 6 -2 C9 -1 10 3 8 6 C5 3 1 3 -2 6 Z" {...F} />,
  fey: <path d={star(4, 10, 3)} {...F} />,
  default: (
    <g {...S}>
      <path d="M-7 -9 C-3 -3 -3 3 -7 9 M0 -10 C3 -3 3 3 0 10 M7 -9 C10 -3 10 3 7 9" strokeWidth={2.2} />
    </g>
  ),
};

function star(points: number, outer: number, inner: number) {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    pts.push(`${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(" L")} Z`;
}

export function classEmblem(classId?: string): ReactNode {
  return CLASS_PATHS[classId ?? ""] ?? CLASS_PATHS.fighter;
}

export function monsterKind(type?: string): string {
  const t = (type ?? "").toLowerCase();
  if (t.includes("goblinoid")) return "goblinoid";
  if (t.includes("undead")) return "undead";
  if (t.includes("beast") || t.includes("monstrosity")) return "beast";
  if (t.includes("giant")) return "giant";
  if (t.includes("fiend")) return "fiend";
  if (t.includes("dragon")) return "dragon";
  if (t.includes("fey") || t.includes("elemental")) return "fey";
  if (t.includes("humanoid")) return "humanoid";
  return "default";
}

export function monsterEmblem(type?: string): ReactNode {
  return MONSTER_PATHS[monsterKind(type)];
}

export const CLASS_COLOR: Record<string, string> = {
  fighter: "#b8493a", rogue: "#5f6b78", cleric: "#e1c46a", wizard: "#5b6fd1", barbarian: "#c2662b", ranger: "#4f8a45",
  paladin: "#d8b45a", monk: "#3f9a8f", bard: "#b05aa8", druid: "#6a9a3a", sorcerer: "#d0482f", warlock: "#7a4aa8",
};
export const classColor = (id?: string) => CLASS_COLOR[id ?? ""] ?? "#9a8f7c";

/** Standalone emblem as a small inline SVG (for buttons, lists). */
export function Emblem({ classId, monsterType, size = 20, color }: { classId?: string; monsterType?: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" style={{ color: color ?? (classId ? classColor(classId) : "#e8c08a"), verticalAlign: "middle", flex: "none" }}>
      {monsterType !== undefined ? monsterEmblem(monsterType) : classEmblem(classId)}
    </svg>
  );
}

export const CONDITION_GLYPH: Record<string, string> = {
  prone: "↓", poisoned: "☠", paralyzed: "Ⅱ", stunned: "✶", unconscious: "z", restrained: "⛓", grappled: "✊", frightened: "!",
  blinded: "◌", invisible: "◍", incapacitated: "×", charmed: "♥", deafened: "◖", petrified: "▣", exhaustion: "E",
};
