// Procedural scene vignettes: a layered silhouette banner chosen from location keywords.
import { hash } from "./Portrait";

type Motif = "cellar" | "forest" | "chapel" | "keep" | "mountain" | "town" | "road";

export function motifFor(text: string): Motif {
  const t = text.toLowerCase();
  if (/snow|frost|winter|mountain|pass|peak|ice|glacier/.test(t)) return "mountain";
  if (/cellar|tunnel|sewer|cave|warren|burrow|underground|grate/.test(t)) return "cellar";
  if (/chapel|mere|drown|lake|shore|nave|water|river|flood|sluice/.test(t)) return "chapel";
  if (/keep|crypt|tomb|throne|king|gate|ritual|crown|ruin/.test(t)) return "keep";
  if (/ashwood|forest|wood|grove|tree|edge|hill/.test(t)) return "forest";
  if (/tavern|town|emberfall|lantern|market|drinks|home/.test(t)) return "town";
  return "road";
}

const PAL: Record<Motif, { sky: [string, string]; far: string; mid: string; near: string; accent: string }> = {
  cellar: { sky: ["#1b130e", "#2e2016"], far: "#2a1f17", mid: "#1d1510", near: "#120c08", accent: "#e0782e" },
  forest: { sky: ["#1d2a24", "#3a3a2a"], far: "#22332a", mid: "#17251d", near: "#0d1611", accent: "#d9b45a" },
  chapel: { sky: ["#1b2633", "#2f3c48"], far: "#26323d", mid: "#1a242e", near: "#0e151c", accent: "#9fd0f0" },
  keep: { sky: ["#1e1824", "#3a2a35"], far: "#2a2230", mid: "#1c1622", near: "#110c14", accent: "#b48ad8" },
  mountain: { sky: ["#2a3644", "#9fb2c4"], far: "#5d6d7d", mid: "#3a4756", near: "#1f2833", accent: "#ffffff" },
  town: { sky: ["#25160e", "#5a2e16"], far: "#3a2418", mid: "#2a1a11", near: "#170e09", accent: "#f2a25b" },
  road: { sky: ["#241c18", "#4a3524"], far: "#3a2c20", mid: "#2a2018", near: "#16100c", accent: "#d9b45a" },
};

export function Vignette({ text, seed, height = 120 }: { text: string; seed: string; height?: number }) {
  const m = motifFor(text);
  const p = PAL[m];
  const h = hash(seed + m);
  const r = (i: number) => ((h >>> (i % 24)) % 997) / 997;
  const id = `vg${h.toString(36)}`;
  const W = 800, H = 160;
  return (
    <svg className={`vignette v-${m}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.sky[0]} />
          <stop offset="100%" stopColor={p.sky[1]} />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor={p.accent} stopOpacity={0.35} />
          <stop offset="100%" stopColor={p.accent} stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${id}fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="60%" stopColor="#000" stopOpacity={0} />
          <stop offset="100%" stopColor="#120d0a" stopOpacity={0.9} />
        </linearGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}s)`} />
      {m === "cellar" && (
        <g>
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M${i * 200 - 60} ${H} V70 Q${i * 200 + 40} -10 ${i * 200 + 140} 70 V${H}`} fill="none" stroke={p.far} strokeWidth={26} />
          ))}
          <ellipse cx={W * (0.3 + r(1) * 0.4)} cy={110} rx={160} ry={60} fill={`url(#${id}g)`} />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i} transform={`translate(${40 + i * 140 + r(i) * 40} ${110 + r(i + 3) * 10})`}>
              <ellipse cx={0} cy={0} rx={24} ry={30} fill={p.mid} stroke={p.near} strokeWidth={3} />
              <path d="M-22 -10 H22 M-22 10 H22" stroke={p.near} strokeWidth={3} />
            </g>
          ))}
        </g>
      )}
      {m === "forest" && (
        <g>
          <circle cx={W * (0.2 + r(2) * 0.6)} cy={40} r={18} fill={p.accent} opacity={0.5} />
          {Array.from({ length: 14 }, (_, i) => tree(i * 62 + r(i) * 30 - 20, 120 - r(i + 2) * 20, 50 + r(i + 4) * 30, p.far, i))}
          {Array.from({ length: 10 }, (_, i) => tree(i * 90 + r(i + 7) * 40 - 30, 165, 80 + r(i + 1) * 40, p.near, i + 20))}
        </g>
      )}
      {m === "chapel" && (
        <g>
          <path d={`M0 95 Q${W / 2} 88 ${W} 95 V${H} H0 Z`} fill={p.mid} />
          <g transform={`translate(${W * (0.35 + r(3) * 0.3)} 0)`}>
            <path d="M-70 95 V40 L0 8 L70 40 V95 Z" fill={p.far} />
            <path d="M-20 95 V55 Q0 35 20 55 V95 Z" fill={p.near} />
            <path d="M-4 8 V-8 M-10 -2 H2" stroke={p.far} strokeWidth={4} />
            <path d="M-70 98 V140 L0 168 L70 140 V98 Z" fill={p.far} opacity={0.25} />
          </g>
          {Array.from({ length: 8 }, (_, i) => <path key={i} className="v-ripple" d={`M${i * 110 + r(i) * 30} ${115 + (i % 3) * 14} q20 -5 40 0`} stroke={p.accent} strokeOpacity={0.35} fill="none" strokeWidth={2} />)}
        </g>
      )}
      {m === "keep" && (
        <g>
          <circle cx={W * (0.65 + r(5) * 0.2)} cy={38} r={22} fill="#e8e0d0" opacity={0.75} />
          <path d={`M0 120 Q200 100 400 112 T${W} 108 V${H} H0 Z`} fill={p.far} />
          <g transform={`translate(${W * 0.4} 0)`} fill={p.mid}>
            <rect x={-40} y={30} width={50} height={100} />
            <path d="M-44 30 h8 v-10 h8 v10 h8 v-10 h8 v10 h8 v-10 h8 v10 h8" />
            <rect x={10} y={60} width={120} height={70} />
            <rect x={120} y={20} width={36} height={110} />
            <rect x={-30} y={60} width={8} height={14} fill={p.accent} opacity={0.7} />
          </g>
          {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M${60 + i * 105 + r(i) * 30} ${H} v-28 q10 -12 20 0 v28 Z`} fill={p.near} />)}
        </g>
      )}
      {m === "mountain" && (
        <g>
          {Array.from({ length: 6 }, (_, i) => {
            const x = i * 160 - 40 + r(i) * 40, peak = 20 + r(i + 1) * 40;
            return (
              <g key={i}>
                <path d={`M${x - 140} 140 L${x} ${peak} L${x + 140} 140 Z`} fill={p.far} />
                <path d={`M${x - 34} ${peak + 30} L${x} ${peak} L${x + 34} ${peak + 30} L${x + 14} ${peak + 22} L${x} ${peak + 34} L${x - 12} ${peak + 22} Z`} fill="#eef3f8" />
              </g>
            );
          })}
          <path d={`M0 130 Q${W / 3} 110 ${W / 2} 125 T${W} 118 V${H} H0 Z`} fill={p.mid} />
          {Array.from({ length: 9 }, (_, i) => tree(i * 95 + r(i + 9) * 30, 168, 60, p.near, i + 40))}
          <g className="v-snow">
            {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 97 + r(i) * 50) % W} cy={(i * 41) % H} r={1 + (i % 3) * 0.6} fill="#fff" opacity={0.75} />)}
          </g>
        </g>
      )}
      {(m === "town" || m === "road") && (
        <g>
          <path d={`M0 115 Q${W / 4} 95 ${W / 2} 110 T${W} 100 V${H} H0 Z`} fill={p.far} />
          {m === "town" && Array.from({ length: 9 }, (_, i) => {
            const x = i * 90 + r(i) * 30, w = 50 + r(i + 1) * 30, hh = 30 + r(i + 2) * 30;
            return (
              <g key={i} fill={p.mid}>
                <rect x={x} y={140 - hh} width={w} height={hh + 20} />
                <path d={`M${x - 6} ${140 - hh} L${x + w / 2} ${115 - hh} L${x + w + 6} ${140 - hh} Z`} />
                <rect x={x + w * 0.3} y={150 - hh} width={8} height={10} fill={p.accent} opacity={0.75} />
              </g>
            );
          })}
          {m === "road" && <path d={`M${W / 2 - 20} ${H} Q${W / 2} 120 ${W / 2 + 140} 100`} stroke={p.mid} strokeWidth={30} fill="none" />}
          <path d={`M0 150 H${W}`} stroke={p.near} strokeWidth={22} />
        </g>
      )}
      <rect width={W} height={H} fill={`url(#${id}fade)`} />
    </svg>
  );
}

function tree(x: number, base: number, h: number, fill: string, key: number) {
  return (
    <g key={key} fill={fill}>
      <path d={`M${x} ${base - h} L${x + h * 0.32} ${base - h * 0.35} L${x + h * 0.14} ${base - h * 0.38} L${x + h * 0.4} ${base} L${x - h * 0.4} ${base} L${x - h * 0.14} ${base - h * 0.38} L${x - h * 0.32} ${base - h * 0.35} Z`} />
    </g>
  );
}
