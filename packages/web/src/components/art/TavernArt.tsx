// Original illustrations for the tavern hub: the Broken Lantern header, the campaign map and town buildings.
import type { ScenarioSummary } from "@tavern/engine";
import { hash } from "./Portrait";

// ---------------------------------------------------------------------------------------------
// Header: the Broken Lantern at dusk

export function TavernScene({ winter }: { winter?: boolean }) {
  const W = 1000, H = 260;
  return (
    <svg className="tavern-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="tsSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={winter ? "#1a2533" : "#1a1420"} />
          <stop offset="70%" stopColor={winter ? "#3d4c5c" : "#5a2e1e"} />
          <stop offset="100%" stopColor={winter ? "#6b7a88" : "#a2501f"} />
        </linearGradient>
        <radialGradient id="tsGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffb35a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ff7a2a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tsWood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a2618" />
          <stop offset="100%" stopColor="#1d130c" />
        </linearGradient>
        <linearGradient id="tsFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="75%" stopColor="#15110e" stopOpacity="0" />
          <stop offset="100%" stopColor="#15110e" stopOpacity="1" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill="url(#tsSky)" />
      {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 137) % W} cy={(i * 53) % 110} r={i % 4 === 0 ? 1.4 : 0.8} fill="#fff4d8" opacity={0.5} className="twinkle" style={{ animationDelay: `${(i % 7) * 0.6}s` }} />)}
      <circle cx={820} cy={60} r={26} fill="#f3e6c4" opacity={0.85} />
      <circle cx={830} cy={54} r={24} fill={winter ? "#2a3644" : "#2a1a1e"} opacity={0.9} />
      {/* distant hills & keep */}
      <path d={`M0 190 Q150 150 300 175 T620 165 T${W} 170 V${H} H0 Z`} fill="#2a1c16" />
      <g fill="#1f1511" transform="translate(150 118)">
        <rect x={0} y={20} width={20} height={45} /><rect x={22} y={34} width={40} height={31} /><rect x={64} y={10} width={14} height={55} />
        <path d="M-2 20 h4 v-5 h4 v5 h4 v-5 h4 v5 h4 v-5 h4 v5" />
      </g>
      {/* palisade */}
      {Array.from({ length: 40 }, (_, i) => <path key={i} d={`M${i * 26} 220 V${180 - (i % 3) * 5} l6 -8 l6 8 V220 Z`} fill="#24180f" stroke="#120b07" />)}
      {/* the tavern */}
      <g transform="translate(330 95)">
        <rect x={0} y={60} width={360} height={110} fill="url(#tsWood)" stroke="#0f0905" strokeWidth={2} />
        {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${i * 40 + 20} 60 V170`} stroke="#160e08" strokeWidth={2} />)}
        <path d="M-20 64 L60 0 H300 L380 64 Z" fill="#2e1d12" stroke="#0f0905" strokeWidth={2} />
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${-10 + i * 32} 60 L${50 + i * 21} 6`} stroke="#22150c" strokeWidth={1.5} />)}
        {/* chimney + smoke */}
        <rect x={250} y={-18} width={26} height={44} fill="#3a2a22" stroke="#0f0905" />
        <g className="smoke"><circle cx={263} cy={-26} r={10} /><circle cx={272} cy={-46} r={13} /><circle cx={262} cy={-70} r={16} /></g>
        {/* windows */}
        {[30, 110, 250, 310].map((x) => (
          <g key={x}>
            <rect x={x} y={90} width={34} height={30} fill="#f2a25b" className="window" />
            <path d={`M${x + 17} 90 V120 M${x} 105 H${x + 34}`} stroke="#3a2412" strokeWidth={3} />
            <rect x={x} y={90} width={34} height={30} fill="none" stroke="#120b07" strokeWidth={3} />
          </g>
        ))}
        {/* door */}
        <path d="M160 170 V110 Q180 92 200 110 V170 Z" fill="#4a2c16" stroke="#120b07" strokeWidth={3} />
        <circle cx={192} cy={142} r={2.5} fill="#d9b45a" />
        {/* sign + cracked lantern */}
        <path d="M150 74 H210" stroke="#120b07" strokeWidth={3} />
        <path d="M180 74 V84" stroke="#120b07" strokeWidth={2} />
        <circle cx={180} cy={96} r={30} fill="url(#tsGlow)" className="lantern-glow" />
        <g transform="translate(180 96)">
          <path d="M-8 -12 H8 L10 10 H-10 Z" fill="#5a4630" stroke="#120b07" strokeWidth={2} />
          <path d="M-6 -8 H6 L7 7 H-7 Z" fill="#ffcf7a" opacity={0.9} className="lantern-flame" />
          <path d="M-2 -8 L1 -1 L-2 3 L2 7" stroke="#120b07" strokeWidth={1.4} fill="none" />
          <path d="M-10 10 H10 M-6 -12 L0 -17 L6 -12" stroke="#120b07" strokeWidth={2} fill="none" />
        </g>
        <rect x={60} y={20} width={240} height={26} rx={4} fill="#1a0f08" stroke="#5a3a1c" strokeWidth={2} />
        <text x={180} y={38} textAnchor="middle" fontFamily="Cinzel, Georgia, serif" fontSize={15} fill="#d9b45a" letterSpacing={2}>THE BROKEN LANTERN</text>
      </g>
      {winter && <g className="v-snow">{Array.from({ length: 60 }, (_, i) => <circle key={i} cx={(i * 83) % W} cy={(i * 29) % H} r={1 + (i % 3) * 0.5} fill="#fff" opacity={0.7} />)}</g>}
      {/* ground */}
      <path d={`M0 220 H${W} V${H} H0 Z`} fill={winter ? "#c9d2da" : "#1a120c"} opacity={winter ? 0.25 : 1} />
      <rect width={W} height={H} fill="url(#tsFade)" />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Campaign map

const TOWN = { x: 50, y: 52 };

export function CampaignMapArt({ scenarios, onPick, completedIds }: { scenarios: ScenarioSummary[]; onPick: (s: ScenarioSummary) => void; completedIds?: string[] }) {
  const W = 400, H = 300;
  const town = { x: (TOWN.x / 100) * W, y: (TOWN.y / 100) * H };
  // scenarios set in Emberfall itself sit just beside the town marker
  const px = (p: [number, number]) => {
    const q = { x: (p[0] / 100) * W, y: (p[1] / 100) * H };
    return Math.hypot(q.x - town.x, q.y - town.y) < 26 ? { x: town.x + 34, y: town.y - 26 } : q;
  };
  void completedIds;
  return (
    <svg className="campmap-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Campaign map of the Emberfall Marches">
      <defs>
        <radialGradient id="cmParch" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#d9c39a" />
          <stop offset="75%" stopColor="#b99d6c" />
          <stop offset="100%" stopColor="#7a6040" />
        </radialGradient>
        <filter id="cmRough"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" /><feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.18  0 0 0 0 0.1  0 0 0 0.18 0" /><feComposite in2="SourceGraphic" operator="in" /></filter>
      </defs>
      <rect width={W} height={H} fill="url(#cmParch)" />
      <rect width={W} height={H} fill="#000" filter="url(#cmRough)" />
      {/* mountains (north) */}
      <g fill="#8a7454" stroke="#4a3a26" strokeWidth={1}>
        {Array.from({ length: 11 }, (_, i) => {
          const x = 20 + i * 36 + (i % 2) * 8, y = 42 + (i % 3) * 8;
          return (
            <g key={i}>
              <path d={`M${x - 22} ${y + 26} L${x} ${y - 6} L${x + 22} ${y + 26} Z`} />
              <path d={`M${x - 7} ${y + 4} L${x} ${y - 6} L${x + 7} ${y + 4} L${x + 2} ${y + 1} L${x - 2} ${y + 5} Z`} fill="#f2ede2" stroke="none" />
            </g>
          );
        })}
      </g>
      <text x={W / 2} y={22} textAnchor="middle" className="cm-label">The Frostbound Peaks</text>
      {/* the Ashwood (west) */}
      <g fill="#4f6a3a" stroke="#2c3d20" strokeWidth={0.8}>
        {Array.from({ length: 28 }, (_, i) => {
          const x = 18 + (i % 7) * 17 + ((i * 7) % 5), y = 110 + Math.floor(i / 7) * 22 + ((i * 3) % 7);
          return <path key={i} d={`M${x} ${y - 12} L${x + 7} ${y + 3} L${x - 7} ${y + 3} Z`} />;
        })}
      </g>
      <text x={78} y={205} textAnchor="middle" className="cm-label">The Ashwood</text>
      {/* river */}
      <path d={`M${W} 95 C330 120 300 110 270 150 S220 200 210 240 S170 280 150 ${H}`} fill="none" stroke="#5b86a6" strokeWidth={5} opacity={0.8} />
      <path d={`M${W} 95 C330 120 300 110 270 150 S220 200 210 240 S170 280 150 ${H}`} fill="none" stroke="#a9c8dc" strokeWidth={1.2} opacity={0.7} />
      {/* hills (south-east) */}
      <g fill="none" stroke="#6a5436" strokeWidth={1.2}>
        {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${270 + (i % 4) * 30} ${235 + Math.floor(i / 4) * 20} q12 -12 24 0`} />)}
      </g>
      {/* the old keep (east) */}
      <g transform="translate(330 150)" fill="#5a4630" stroke="#2a1f14">
        <rect x={-10} y={-10} width={8} height={18} /><rect x={0} y={-4} width={14} height={12} /><rect x={14} y={-14} width={6} height={22} />
      </g>
      <text x={335} y={178} textAnchor="middle" className="cm-label small">the old keep</text>
      {/* travel lines */}
      {scenarios.map((s) => {
        const p = px(s.mapPosition);
        return <path key={s.id} d={`M${town.x} ${town.y} Q${(town.x + p.x) / 2 + 12} ${(town.y + p.y) / 2 - 18} ${p.x} ${p.y}`} className={`cm-route ${s.available || s.completed ? "" : "locked"}`} />;
      })}
      {/* Emberfall */}
      <g transform={`translate(${town.x} ${town.y})`}>
        <circle r={14} fill="#3a2418" stroke="#1a0f08" strokeWidth={2} />
        <path d="M-8 4 V-3 L-4 -7 L0 -3 V4 Z M1 4 V-5 L5 -9 L9 -5 V4 Z" fill="#d9b45a" />
        <circle cy={-1} r={18} fill="none" stroke="#e0782e" strokeOpacity={0.5} className="cm-pulse" />
        <text y={28} textAnchor="middle" className="cm-label town">Emberfall</text>
      </g>
      {/* scenario seals */}
      {scenarios.map((s) => {
        const p = px(s.mapPosition);
        const state = s.completed ? "done" : s.available ? "avail" : "locked";
        const seed = hash(s.id);
        return (
          <g key={s.id} transform={`translate(${p.x} ${p.y})`} className={`cm-pin ${state}`} onClick={() => onPick(s)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") onPick(s); }}>
            <title>{s.available || s.completed ? `${s.name} — ${s.location}` : `Unknown (${s.reason ?? "locked"})`}</title>
            <path d={sealPath(seed)} className="seal" />
            <text textAnchor="middle" dy="0.36em" className="seal-mark">{s.completed ? "✓" : s.available ? "!" : "?"}</text>
            <text y={22} textAnchor="middle" className="cm-label pin-name">{s.available || s.completed ? s.name : "???"}</text>
          </g>
        );
      })}
      <g transform={`translate(${W - 30} ${H - 30})`} className="compass">
        <circle r={16} fill="none" stroke="#4a3a26" />
        <path d="M0 -14 L4 0 L0 14 L-4 0 Z" fill="#4a3a26" />
        <text y={-18} textAnchor="middle" className="cm-label small">N</text>
      </g>
    </svg>
  );
}

function sealPath(seed: number) {
  const pts: string[] = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 11 + ((seed >>> i) & 3) * 0.6;
    pts.push(`${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join(" L")} Z`;
}

// ---------------------------------------------------------------------------------------------
// Buildings (illustration grows with level 0-3)

const ROOF: Record<string, string> = {
  tavern: "#7a3a1e", smithy: "#4a4a52", temple: "#c9b27a", alchemist: "#3f6a4a", trainingYard: "#7a5a2e", watchtower: "#5a4a3a", library: "#4a3a6a", bank: "#6a5a2a",
};
const SIGN: Record<string, string> = {
  tavern: "M-4 -3 H4 L3 4 H-3 Z", smithy: "M-5 1 H5 L3 4 H-3 Z M-2 -4 H2 V1 H-2 Z", temple: "M0 -5 V5 M-4 -1 H4",
  alchemist: "M-2 -5 H2 V-1 L4 4 H-4 L-2 -1 Z", trainingYard: "M-5 5 L5 -5 M5 5 L-5 -5", watchtower: "M-3 5 L0 -5 L3 5",
  library: "M-5 -4 H-1 V4 H-5 Z M1 -4 H5 V4 H1 Z", bank: "M0 -5 A5 5 0 1 0 0.1 -5 Z",
};

export function BuildingArt({ id, level, max }: { id: string; level: number; max: number }) {
  const roof = ROOF[id] ?? "#6a4a2a";
  const tower = id === "watchtower" || id === "temple";
  return (
    <svg className={`building-art lvl-${level}`} viewBox="0 0 120 80" aria-hidden="true">
      <rect width={120} height={80} fill="#1a130e" />
      <path d="M0 66 H120 V80 H0 Z" fill="#2a2018" />
      {level === 0 ? (
        <g stroke="#7a6448" strokeDasharray="3 3" fill="none">
          <rect x={30} y={36} width={60} height={30} />
          <path d="M26 36 L60 16 L94 36" />
          {[30, 50, 70, 90].map((x) => <path key={x} d={`M${x} 66 v6`} strokeDasharray="none" stroke="#5a4a36" strokeWidth={2} />)}
          <text x={60} y={56} textAnchor="middle" fill="#7a6448" stroke="none" fontSize={9} fontFamily="Cinzel, serif">empty plot</text>
        </g>
      ) : (
        <g>
          {level >= 2 && <g><rect x={78} y={42} width={30} height={24} fill="#3a2a1c" stroke="#120b07" /><path d="M74 42 L93 28 L112 42 Z" fill={roof} stroke="#120b07" /><rect x={88} y={50} width={8} height={8} fill="#f2a25b" opacity={0.8} /></g>}
          {level >= 3 && <g><rect x={14} y={24} width={18} height={42} fill="#3a2a1c" stroke="#120b07" /><path d="M11 24 L23 8 L35 24 Z" fill={roof} stroke="#120b07" /><path d="M23 8 V0" stroke="#d9b45a" /><path d="M23 1 L32 4 L23 7 Z" fill="#c8503f" /></g>}
          <rect x={32} y={34} width={52} height={32} fill="#4a3220" stroke="#120b07" strokeWidth={1.5} />
          <path d={`M28 34 L58 ${tower ? 8 : 16} L88 34 Z`} fill={roof} stroke="#120b07" strokeWidth={1.5} />
          <path d="M54 66 V52 Q58 47 62 52 V66 Z" fill="#2a1a0e" />
          <rect x={38} y={42} width={9} height={9} fill="#f2a25b" opacity={0.85} className="window" />
          <rect x={70} y={42} width={9} height={9} fill="#f2a25b" opacity={0.85} className="window" />
          <g transform="translate(58 26)"><circle r={6} fill="#1a0f08" stroke="#d9b45a" strokeWidth={0.8} /><path d={SIGN[id] ?? "M-3 -3 H3 V3 H-3 Z"} fill="none" stroke="#d9b45a" strokeWidth={1.2} /></g>
          {id === "smithy" && <g className="smoke"><circle cx={80} cy={30} r={4} /><circle cx={84} cy={22} r={5} /></g>}
        </g>
      )}
      <g transform="translate(6 74)">
        {Array.from({ length: Math.max(1, max) }, (_, i) => <circle key={i} cx={i * 7} cy={0} r={2.4} fill={i < level ? "#d9b45a" : "#3a2e24"} stroke="#120b07" strokeWidth={0.6} />)}
      </g>
    </svg>
  );
}
