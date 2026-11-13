// Procedural portraits: deterministic from a seed (character id) plus species and class.
import { classColor, classEmblem } from "./emblems";

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}
const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];

const SKIN: Record<string, string[]> = {
  human: ["#f1c9a5", "#d9a47a", "#b77b52", "#8a5634", "#5e3a22", "#e8b996"],
  elf: ["#f3dcc2", "#e5c7a2", "#c9a07a", "#d8c6b0"],
  dwarf: ["#e3a982", "#c98a62", "#a8684a", "#d99a77"],
  halfling: ["#f0c6a0", "#d8a57c", "#b9835a"],
  gnome: ["#f2c9a8", "#dbb08b", "#c7946c"],
  dragonborn: ["#a8432f", "#b7862e", "#3f6e8f", "#4f7d3f", "#8a8f99"],
  goliath: ["#9ea4a8", "#8a9094", "#b3b0a7"],
  orc: ["#7f9a6a", "#6d8a5c", "#93a07a", "#7a8f86"],
  tiefling: ["#b8483f", "#8f3f6e", "#c06a5a", "#6f4a8a"],
};
const HAIR = ["#1d1410", "#3b2416", "#6b3f1f", "#a5652e", "#d7b26a", "#e9e2d0", "#7a1f1f", "#2c2c38"];
const BG = ["#2a1f18", "#22262a", "#2b2220", "#1f2a24", "#2a2030"];

export function Portrait({ seed, species, classId, size = 56, dead }: { seed: string; species: string; classId: string; size?: number; dead?: boolean }) {
  const r = rng(hash(seed + species + classId));
  const skin = pick(r, SKIN[species] ?? SKIN.human);
  const hair = pick(r, HAIR);
  const bg = pick(r, BG);
  const frame = classColor(classId);
  const faceW = 15 + r() * 4 + (species === "dwarf" || species === "goliath" || species === "orc" ? 2 : 0) - (species === "elf" ? 1.5 : 0);
  const faceH = 19 + r() * 3 - (species === "halfling" || species === "gnome" ? 1.5 : 0) + (species === "elf" ? 1 : 0);
  const eyeY = -1 + r() * 2;
  const eyeGap = 5.5 + r() * 1.5;
  const style = Math.floor(r() * 4);
  const beard = species === "dwarf" || (species === "human" && r() < 0.3) || (species === "goliath" && r() < 0.2);
  const scaly = species === "dragonborn";
  const horns = species === "tiefling" || species === "dragonborn";
  const ears = species === "elf" ? "pointy" : species === "orc" || species === "gnome" || species === "halfling" ? "small-pointy" : "round";
  const eyeColor = species === "tiefling" ? "#f2c14e" : species === "dragonborn" ? "#f29b38" : pick(r, ["#3a2a1a", "#2d4f6e", "#3f6b3a", "#5a4630"]);
  const id = `p${hash(seed).toString(36)}`;
  return (
    <svg className={`portrait ${dead ? "dead" : ""}`} width={size} height={size} viewBox="-30 -30 60 60" role="img" aria-label="portrait">
      <defs>
        <radialGradient id={`${id}bg`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor={shade(bg, 30)} />
          <stop offset="100%" stopColor={bg} />
        </radialGradient>
        <clipPath id={`${id}clip`}><circle cx={0} cy={0} r={26} /></clipPath>
      </defs>
      <circle cx={0} cy={0} r={29} fill={frame} />
      <circle cx={0} cy={0} r={27} fill="#120c09" />
      <g clipPath={`url(#${id}clip)`}>
        <rect x={-30} y={-30} width={60} height={60} fill={`url(#${id}bg)`} />
        <g transform="translate(0 4) scale(1.32)">        {/* shoulders, coloured by class */}
        <path d={`M-26 30 C-24 16 -12 12 0 12 C12 12 24 16 26 30 Z`} fill={shade(frame, -35)} />
        <path d="M-6 12 L0 20 L6 12" fill="none" stroke={shade(frame, 20)} strokeWidth={1.4} />
        {/* neck */}
        <rect x={-4} y={6} width={8} height={9} fill={shade(skin, -18)} />
        {/* back hair */}
        {!scaly && style !== 3 && <ellipse cx={0} cy={-3} rx={faceW / 2 + 3} ry={faceH / 2 + 3} fill={hair} />}
        {/* ears */}
        {ears === "pointy" && <><path d={`M${-faceW / 2} -1 L${-faceW / 2 - 6} -8 L${-faceW / 2 + 1} 3 Z`} fill={skin} /><path d={`M${faceW / 2} -1 L${faceW / 2 + 6} -8 L${faceW / 2 - 1} 3 Z`} fill={skin} /></>}
        {ears === "small-pointy" && <><path d={`M${-faceW / 2} 0 L${-faceW / 2 - 3.5} -4 L${-faceW / 2 + 1} 3 Z`} fill={skin} /><path d={`M${faceW / 2} 0 L${faceW / 2 + 3.5} -4 L${faceW / 2 - 1} 3 Z`} fill={skin} /></>}
        {ears === "round" && !scaly && <><circle cx={-faceW / 2} cy={0} r={2.2} fill={skin} /><circle cx={faceW / 2} cy={0} r={2.2} fill={skin} /></>}
        {/* face */}
        {scaly
          ? <path d={`M${-faceW / 2} -8 C${-faceW / 2} -14 ${faceW / 2} -14 ${faceW / 2} -8 L${faceW / 2 + 2} 4 C${faceW / 2} 9 ${-faceW / 2} 9 ${-faceW / 2 - 2} 4 Z`} fill={skin} />
          : <ellipse cx={0} cy={-1} rx={faceW / 2} ry={faceH / 2} fill={skin} />}
        {scaly && <g stroke={shade(skin, -30)} strokeWidth={0.6} fill="none" opacity={0.7}><path d="M-5 -9 l2 2 l2 -2 l2 2 l2 -2" /><path d="M-6 -5 l2 2 l2 -2 l2 2 l2 -2 l2 2" /></g>}
        {species === "goliath" && <path d={`M${-faceW / 2 + 2} -6 l4 3 M${faceW / 2 - 3} 2 l-3 3`} stroke="#5d6064" strokeWidth={1} />}
        {/* horns */}
        {horns && <><path d={`M-5 ${-faceH / 2 + 1} C-9 -18 -12 -19 -13 -23 C-8 -21 -5 -17 -2 ${-faceH / 2 + 2} Z`} fill={species === "tiefling" ? "#3a2420" : shade(skin, -25)} /><path d={`M5 ${-faceH / 2 + 1} C9 -18 12 -19 13 -23 C8 -21 5 -17 2 ${-faceH / 2 + 2} Z`} fill={species === "tiefling" ? "#3a2420" : shade(skin, -25)} /></>}
        {/* front hair */}
        {!scaly && style === 0 && <path d={`M${-faceW / 2 - 1} -4 C${-faceW / 2} -14 ${faceW / 2} -14 ${faceW / 2 + 1} -4 C4 -9 -4 -9 ${-faceW / 2 - 1} -4 Z`} fill={hair} />}
        {!scaly && style === 1 && <path d={`M${-faceW / 2 - 1} -2 C${-faceW / 2 - 1} -14 ${faceW / 2 + 1} -14 ${faceW / 2 + 1} -2 L${faceW / 2 - 2} -7 L2 -6 L-1 -9 L-4 -6 Z`} fill={hair} />}
        {!scaly && style === 2 && <path d={`M${-faceW / 2} -5 C-4 -15 6 -14 ${faceW / 2} -5 C3 -8 -3 -7 ${-faceW / 2} -5 Z`} fill={hair} />}
        {!scaly && style === 3 && <path d={`M${-faceW / 2 + 1} -7 C-3 -13 3 -13 ${faceW / 2 - 1} -7`} fill="none" stroke={shade(skin, -20)} strokeWidth={0.8} />}
        {/* brows & eyes */}
        <path d={`M${-eyeGap - 2.5} ${eyeY - 3} l4 ${r() < 0.5 ? 0.6 : -0.4} M${eyeGap + 2.5} ${eyeY - 3} l-4 ${r() < 0.5 ? 0.6 : -0.4}`} stroke={scaly ? shade(skin, -40) : hair} strokeWidth={1.2} strokeLinecap="round" />
        <ellipse cx={-eyeGap} cy={eyeY} rx={1.9} ry={1.3} fill="#f4ede0" />
        <ellipse cx={eyeGap} cy={eyeY} rx={1.9} ry={1.3} fill="#f4ede0" />
        <circle cx={-eyeGap} cy={eyeY} r={0.95} fill={eyeColor} />
        <circle cx={eyeGap} cy={eyeY} r={0.95} fill={eyeColor} />
        {/* nose & mouth */}
        {scaly
          ? <><circle cx={-1.5} cy={4} r={0.6} fill="#2a1612" /><circle cx={1.5} cy={4} r={0.6} fill="#2a1612" /></>
          : <path d={`M0 ${eyeY + 1} L-1.3 ${eyeY + 5} L0.6 ${eyeY + 5.4}`} fill="none" stroke={shade(skin, -35)} strokeWidth={0.8} />}
        <path d={`M-3 ${6.5 + r()} Q0 ${7.5 + r() * 1.5} 3 ${6.5 + r()}`} fill="none" stroke={shade(skin, -50)} strokeWidth={0.9} strokeLinecap="round" />
        {species === "orc" && <><path d="M-3 8 l-0.6 -3 l1.4 0.4 Z" fill="#f0ead8" /><path d="M3 8 l0.6 -3 l-1.4 0.4 Z" fill="#f0ead8" /></>}
        {beard && <path d={`M${-faceW / 2 + 0.5} 1 C-6 14 6 14 ${faceW / 2 - 0.5} 1 C4 8 -4 8 ${-faceW / 2 + 0.5} 1 Z`} fill={hair} />}
        </g>
        {/* class badge */}
        <g transform="translate(18 18) scale(0.42)" style={{ color: "#f6ead2" }}>
          <circle cx={0} cy={0} r={13} fill={frame} stroke="#120c09" strokeWidth={2} />
          {classEmblem(classId)}
        </g>
      </g>
      {dead && <path d="M-18 -18 L18 18 M18 -18 L-18 18" stroke="#c8503f" strokeWidth={3} opacity={0.8} />}
    </svg>
  );
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, "0")}`;
}
