// SVG tactical board: textured terrain, standee tokens, overlays and animations.
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { Combatant, EncounterState, GridMap, Point } from "@tavern/engine";
import { MONSTERS, describeCombatant } from "@tavern/engine";
import { CONDITION_GLYPH, classColor, classEmblem, monsterEmblem } from "./art/emblems";
import { hash, shade } from "./art/Portrait";
import { playHit, playWhoosh } from "../sound";

export const ELEMENT_COLOR: Record<string, string> = {
  fire: "#ff7a2a", cold: "#7fd0ff", lightning: "#c9b8ff", radiant: "#ffe58a", necrotic: "#9a6ad0", thunder: "#9ad0e0",
  poison: "#7cc04a", force: "#d38bff", acid: "#a8e05a", psychic: "#ff8ad8", default: "#e0782e",
};

const reducedMotion = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

export interface BoardProps {
  enc: EncounterState;
  tilePx: number;
  activeId: string;
  reach: Map<string, number>;
  preview: Set<string>;
  previewColor?: string;
  isTargetable: (c: Combatant) => boolean;
  spellTargets: string[];
  onTile: (p: Point) => void;
  onHover: (p: Point | null) => void;
  hover: Point | null;
}

export function Board(props: BoardProps) {
  const { enc, tilePx: T, activeId, reach, preview, previewColor, isTargetable, spellTargets, onTile, onHover, hover } = props;
  const W = enc.map.width, H = enc.map.height;
  const svgRef = useRef<SVGSVGElement>(null);
  const fx = useBoardEffects(enc);

  const toTile = (e: { clientX: number; clientY: number }): Point | null => {
    const el = svgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return { x, y };
  };

  const visible = enc.combatants.filter((c) => !c.fled);
  // draw the dead first, then the living, active last
  const order = [...visible].sort((a, b) => Number(!a.dead) - Number(!b.dead) || Number(a.id === activeId) - Number(b.id === activeId));

  return (
    <svg
      ref={svgRef}
      className="battleboard"
      width={W * T}
      height={H * T}
      viewBox={`0 0 ${W * T} ${H * T}`}
      style={{ minWidth: W * 26, maxWidth: W * T }}
      onClick={(e) => { const p = toTile(e); if (p) onTile(p); }}
      onMouseMove={(e) => { const p = toTile(e); if (!p || !hover || p.x !== hover.x || p.y !== hover.y) onHover(p); }}
      onMouseLeave={() => onHover(null)}
      role="grid"
      aria-label={`Battle map, ${W} by ${H} squares`}
    >
      <BoardDefs />
      <Terrain map={enc.map} T={T} />

      {/* reachable squares */}
      <g className="ov-reach">
        {[...reach.keys()].map((k) => {
          const [x, y] = k.split(",").map(Number);
          if (visible.some((c) => !c.dead && c.pos.x === x && c.pos.y === y)) return null;
          return <rect key={k} x={x * T + 2} y={y * T + 2} width={T - 4} height={T - 4} rx={T * 0.15} />;
        })}
      </g>
      {/* spell / breath preview */}
      {preview.size > 0 && (
        <g className="ov-area" style={{ color: previewColor ?? ELEMENT_COLOR.default }}>
          {[...preview].map((k) => { const [x, y] = k.split(",").map(Number); return <rect key={k} x={x * T} y={y * T} width={T} height={T} />; })}
        </g>
      )}
      {/* resolved area bursts */}
      {fx.bursts.map((b) => (
        <g key={b.key} className="burst" style={{ color: b.color }}>
          {b.tiles.map((p, i) => <rect key={i} x={p.x * T} y={p.y * T} width={T} height={T} />)}
        </g>
      ))}
      {hover && <rect className="ov-hover" x={hover.x * T + 1} y={hover.y * T + 1} width={T - 2} height={T - 2} rx={T * 0.12} pointerEvents="none" />}

      {order.map((c) => {
        const p = fx.pos.get(c.id) ?? c.pos;
        return (
          <Token
            key={c.id}
            c={c}
            T={T}
            x={p.x}
            y={p.y}
            active={c.id === activeId && enc.status === "active"}
            targetable={isTargetable(c)}
            targetedTimes={spellTargets.filter((t) => t === c.id).length}
            lunge={fx.lunge?.id === c.id ? fx.lunge : undefined}
            flash={fx.flash.has(c.id)}
          />
        );
      })}

      {fx.floaters.map((f) => {
        const p = fx.pos.get(f.id);
        if (!p) return null;
        return <text key={f.key} className={`floater ${f.kind}`} x={(p.x + 0.5) * T} y={p.y * T + T * 0.2} fontSize={Math.max(12, T * 0.42)} textAnchor="middle">{f.text}</text>;
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Shared gradients & patterns

function BoardDefs() {
  return (
    <defs>
      <radialGradient id="tokWood" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#5a4330" />
        <stop offset="100%" stopColor="#2a1d14" />
      </radialGradient>
      <radialGradient id="tokParty" cx="40%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#2f4a66" />
        <stop offset="100%" stopColor="#141f2c" />
      </radialGradient>
      <radialGradient id="tokEnemy" cx="40%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#5e2a22" />
        <stop offset="100%" stopColor="#24110d" />
      </radialGradient>
      <radialGradient id="pitGrad" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stopColor="#000" />
        <stop offset="80%" stopColor="#0b0806" />
        <stop offset="100%" stopColor="#2b2219" />
      </radialGradient>
      <linearGradient id="waterGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#24465f" />
        <stop offset="100%" stopColor="#1a3346" />
      </linearGradient>
      <filter id="tokShadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" floodColor="#000" floodOpacity="0.7" />
      </filter>
    </defs>
  );
}

// ---------------------------------------------------------------------------------------------
// Terrain (memoised: only re-renders when the map changes)

const FLOOR = ["#4d4135", "#4a3e33", "#51443a", "#473b30", "#4f4237"];

const Terrain = memo(function Terrain({ map, T }: { map: GridMap; T: number }) {
  const out: JSX.Element[] = [];
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= map.width || y >= map.height ? "wall" : map.tiles[y][x]);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y][x];
      const h = hash(`${x},${y}`);
      const X = x * T, Y = y * T, k = `${x},${y}`;
      const r = (n: number) => ((h >>> (n * 3)) % 1000) / 1000;
      if (t === "wall") {
        const openBelow = at(x, y + 1) !== "wall";
        out.push(
          <g key={k}>
            <rect x={X} y={Y} width={T} height={T} fill="#1c1612" />
            <rect x={X + 1} y={Y + 1} width={T - 2} height={openBelow ? T * 0.62 : T - 2} fill={shade("#3a2f27", Math.round(r(1) * 14 - 7))} />
            <path d={`M${X + 1} ${Y + T * 0.33} H${X + T - 1} M${X + T * (0.3 + r(2) * 0.4)} ${Y + 1} V${Y + T * 0.33} M${X + T * (0.15 + r(3) * 0.3)} ${Y + T * 0.33} V${Y + T * 0.62}`} stroke="#241c16" strokeWidth={1} />
            {openBelow && <rect x={X} y={Y + T * 0.62} width={T} height={T * 0.38} fill="#120d0a" />}
          </g>,
        );
        continue;
      }
      // every non-wall square gets a stone floor base
      out.push(<rect key={k + "f"} x={X} y={Y} width={T} height={T} fill={FLOOR[h % FLOOR.length]} />);
      if (r(4) > 0.55) out.push(<path key={k + "c"} d={`M${X + T * r(5)} ${Y + T * 0.2} l${T * 0.15} ${T * 0.18} l${-T * 0.06} ${T * 0.2}`} stroke="#3a3027" strokeWidth={0.8} fill="none" />);
      out.push(<rect key={k + "g"} x={X + 0.5} y={Y + 0.5} width={T - 1} height={T - 1} fill="none" stroke="#2c241c" strokeWidth={0.8} />);
      if (t === "difficult") {
        for (let i = 0; i < 5; i++) {
          const cx = X + T * (0.15 + r(i + 1) * 0.7), cy = Y + T * (0.15 + r(i + 5) * 0.7);
          out.push(<ellipse key={`${k}r${i}`} cx={cx} cy={cy} rx={T * (0.06 + r(i + 2) * 0.07)} ry={T * (0.05 + r(i + 3) * 0.05)} fill={i % 2 ? "#6e5a42" : "#5c4a36"} stroke="#2e241b" strokeWidth={0.6} />);
        }
      } else if (t === "water") {
        out.push(
          <g key={k + "w"}>
            <rect x={X} y={Y} width={T} height={T} fill="url(#waterGrad)" />
            <g className="ripple" style={{ animationDelay: `${-r(6) * 3}s` }}>
              <path d={`M${X + T * 0.1} ${Y + T * 0.35} q${T * 0.1} ${-T * 0.08} ${T * 0.2} 0 t${T * 0.2} 0`} />
              <path d={`M${X + T * 0.45} ${Y + T * 0.7} q${T * 0.1} ${-T * 0.08} ${T * 0.2} 0 t${T * 0.2} 0`} />
            </g>
          </g>,
        );
      } else if (t === "pit") {
        out.push(<rect key={k + "p"} x={X + 1} y={Y + 1} width={T - 2} height={T - 2} rx={T * 0.2} fill="url(#pitGrad)" />);
      } else if (t === "door") {
        out.push(
          <g key={k + "d"}>
            <rect x={X + T * 0.08} y={Y + T * 0.08} width={T * 0.84} height={T * 0.84} rx={T * 0.08} fill="#6b4522" stroke="#2b1a0c" strokeWidth={1.2} />
            <path d={`M${X + T * 0.36} ${Y + T * 0.1} V${Y + T * 0.9} M${X + T * 0.64} ${Y + T * 0.1} V${Y + T * 0.9}`} stroke="#4a2f16" strokeWidth={1} />
            <circle cx={X + T * 0.76} cy={Y + T * 0.52} r={T * 0.05} fill="#d9b45a" />
          </g>,
        );
      } else if (t === "cover") {
        if (h % 2 === 0) {
          // crate
          out.push(
            <g key={k + "x"} filter="url(#tokShadow)">
              <rect x={X + T * 0.14} y={Y + T * 0.14} width={T * 0.72} height={T * 0.72} fill="#7a5530" stroke="#3a2512" strokeWidth={1.2} />
              <path d={`M${X + T * 0.14} ${Y + T * 0.14} L${X + T * 0.86} ${Y + T * 0.86} M${X + T * 0.86} ${Y + T * 0.14} L${X + T * 0.14} ${Y + T * 0.86}`} stroke="#4f3519" strokeWidth={1.4} />
            </g>,
          );
        } else {
          // broken pillar
          out.push(
            <g key={k + "x"} filter="url(#tokShadow)">
              <circle cx={X + T / 2} cy={Y + T / 2} r={T * 0.34} fill="#7d7468" stroke="#3b352e" strokeWidth={1.2} />
              <circle cx={X + T / 2} cy={Y + T / 2} r={T * 0.22} fill="none" stroke="#615a50" strokeWidth={1} />
              <path d={`M${X + T * 0.3} ${Y + T * 0.38} l${T * 0.16} ${T * 0.1} l${T * 0.08} ${-T * 0.06}`} stroke="#4a443c" strokeWidth={0.8} fill="none" />
            </g>,
          );
        }
      }
    }
  }
  return <g className="terrain">{out}</g>;
}, (a, b) => a.T === b.T && a.map.width === b.map.width && a.map.height === b.map.height && a.map.tiles.every((row, y) => row.join() === b.map.tiles[y].join()));

// ---------------------------------------------------------------------------------------------
// Tokens

function Token({ c, T, x, y, active, targetable, targetedTimes, lunge, flash }: {
  c: Combatant; T: number; x: number; y: number; active: boolean; targetable: boolean; targetedTimes: number;
  lunge?: { dx: number; dy: number; key: number }; flash: boolean;
}) {
  const R = T * 0.42;
  const md = c.monsterId ? MONSTERS[c.monsterId] : undefined;
  const sideColor = c.side === "party" ? "#5aa0e6" : c.side === "enemy" ? "#d65a48" : "#a89a82";
  const emblemColor = c.side === "party" ? classColor(c.classId) : "#e9c79a";
  const pct = c.maxHp > 0 ? Math.max(0, Math.min(1, c.hp / c.maxHp)) : 0;
  const hpColor = pct > 0.6 ? "#7cc35e" : pct > 0.25 ? "#e0b041" : "#e0503c";
  const circ = 2 * Math.PI * (R + T * 0.05);
  const down = c.hp <= 0 && !c.dead;
  const big = c.size === "large" || c.size === "huge" || c.size === "gargantuan";
  const scale = big ? 1.12 : c.size === "small" || c.size === "tiny" ? 0.86 : 1;
  const conds = [...c.conditions, ...(c.concentratingOn ? ["concentration"] : [])].slice(0, 4);
  const lx = lunge ? lunge.dx * T * 0.28 : 0, ly = lunge ? lunge.dy * T * 0.28 : 0;
  return (
    <g className={`tok ${c.dead ? "dead" : ""} ${down ? "down" : ""}`} style={{ transform: `translate(${(x + 0.5) * T}px, ${(y + 0.5) * T}px)` }}>
      <title>{describeCombatant(c)}</title>
      <g className={lunge ? "lunging" : ""} style={{ transform: `translate(${lx}px, ${ly}px) scale(${scale})` }} key={lunge?.key}>
        {active && <circle className="active-glow" r={R + T * 0.12} />}
        <ellipse cx={0} cy={R * 0.9} rx={R * 0.95} ry={R * 0.3} fill="#000" opacity={0.45} />
        <circle r={R} fill={c.side === "party" ? "url(#tokParty)" : c.side === "enemy" ? "url(#tokEnemy)" : "url(#tokWood)"} stroke="#0d0907" strokeWidth={1.5} />
        <circle r={R - T * 0.03} fill="none" stroke={sideColor} strokeWidth={T * 0.06} opacity={0.95} strokeDasharray={down ? `${T * 0.12} ${T * 0.08}` : undefined} />
        {/* HP arc */}
        {!c.dead && (
          <circle
            r={R + T * 0.05}
            fill="none"
            stroke={hpColor}
            strokeWidth={T * 0.055}
            strokeDasharray={`${circ * pct} ${circ}`}
            transform="rotate(-90)"
            strokeLinecap="round"
            className="hp-arc"
          />
        )}
        <g transform={`translate(0 ${-T * 0.04}) scale(${(R * 0.62) / 12})`} style={{ color: emblemColor }}>
          {md ? monsterEmblem(md.type) : classEmblem(c.classId)}
        </g>
        <text y={R * 0.82} textAnchor="middle" fontSize={Math.max(8, T * 0.22)} className="tok-label">{initials(c.name)}</text>
        {flash && <circle r={R} className="hit-flash" />}
        {targetable && <circle r={R + T * 0.1} className="target-ring" />}
        {targetedTimes > 0 && (
          <g transform={`translate(${R * 0.8} ${-R * 0.8})`}>
            <circle r={T * 0.16} fill="#d9b45a" stroke="#120c09" />
            <text textAnchor="middle" dy="0.35em" fontSize={T * 0.2} fill="#120c09" fontWeight="bold">{targetedTimes > 1 ? `×${targetedTimes}` : "✓"}</text>
          </g>
        )}
        {conds.map((cd, i) => (
          <g key={cd} transform={`translate(${-R * 0.95 + i * T * 0.2} ${-R * 0.95})`}>
            <circle r={T * 0.11} fill={cd === "concentration" ? "#5b6fd1" : "#3a2618"} stroke="#e0b041" strokeWidth={0.8} />
            <text textAnchor="middle" dy="0.35em" fontSize={T * 0.14} fill="#f6ead2">{cd === "concentration" ? "◎" : CONDITION_GLYPH[cd] ?? cd[0]}</text>
            <title>{cd}</title>
          </g>
        ))}
        {c.dead && <path d={`M${-R * 0.5} ${-R * 0.5} L${R * 0.5} ${R * 0.5} M${R * 0.5} ${-R * 0.5} L${-R * 0.5} ${R * 0.5}`} stroke="#c8503f" strokeWidth={T * 0.07} strokeLinecap="round" opacity={0.8} />}
      </g>
    </g>
  );
}

export function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const num = parts.find((p) => /^\d+$/.test(p));
  const base = parts.filter((p) => !/^\d+$/.test(p) && /^[A-Za-z]/.test(p)).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return num ? `${base[0] ?? "?"}${num}` : base;
}

// ---------------------------------------------------------------------------------------------
// Effects derived from state changes and new log entries

interface Floater { key: number; id: string; text: string; kind: "dmg" | "heal" | "miss" | "crit" }
interface Burst { key: number; tiles: Point[]; color: string }

let fxKey = 1;

function useBoardEffects(enc: EncounterState) {
  const [pos, setPos] = useState<Map<string, Point>>(() => new Map(enc.combatants.map((c) => [c.id, c.pos])));
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [lunge, setLunge] = useState<{ id: string; dx: number; dy: number; key: number } | undefined>();
  const prevHp = useRef<Map<string, number>>(new Map(enc.combatants.map((c) => [c.id, c.hp])));
  const lastT = useRef<number>(enc.log.length ? enc.log[enc.log.length - 1].t : 0);
  const timers = useRef<number[]>([]);
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => () => { timers.current.forEach((t) => clearTimeout(t)); }, []);

  useEffect(() => {
    const motion = !reducedMotion();
    const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
    const fresh = enc.log.filter((l) => l.t > lastT.current);
    if (enc.log.length) lastT.current = Math.max(lastT.current, enc.log[enc.log.length - 1].t);

    // --- movement along logged paths
    const target = new Map(enc.combatants.map((c) => [c.id, c.pos]));
    const paths = new Map<string, Point[]>();
    for (const l of fresh) {
      const d = l.data as { path?: Point[] } | undefined;
      if (l.actorId && d?.path?.length) paths.set(l.actorId, [...(paths.get(l.actorId) ?? []), ...d.path]);
    }
    let delay = 0;
    const next = new Map(posRef.current);
    for (const c of enc.combatants) {
      const cur = posRef.current.get(c.id);
      const path = paths.get(c.id);
      if (motion && path && path.length > 1 && cur) {
        path.forEach((p, i) => later(() => setPos((m) => new Map(m).set(c.id, p)), delay + i * 110));
        delay += path.length * 110;
      } else next.set(c.id, c.pos);
    }
    setPos(next);
    later(() => setPos(target), delay + 20);

    // --- lunges and area bursts from new log entries
    const byName = (n: string) => enc.combatants.find((c) => c.name === n.trim());
    let spell = false;
    for (const l of fresh) {
      const m = /^(.+?) → (.+?): /.exec(l.text);
      if (m && motion) {
        const a = byName(m[1]), t = byName(m[2]);
        if (a && t) {
          const dx = Math.sign(t.pos.x - a.pos.x), dy = Math.sign(t.pos.y - a.pos.y);
          const key = fxKey++;
          later(() => setLunge({ id: a.id, dx, dy, key }), delay);
          later(() => setLunge((cur) => (cur?.key === key ? undefined : cur)), delay + 260);
        }
      }
      const d = l.data as { tiles?: Point[] } | undefined;
      if (d?.tiles?.length) {
        const dt = /fire|flame|burn/i.test(l.text) ? "fire" : /thunder/i.test(l.text) ? "thunder" : /lightning/i.test(l.text) ? "lightning" : /radiant|holy/i.test(l.text) ? "radiant" : /cold|frost|ice/i.test(l.text) ? "cold" : "default";
        const key = fxKey++;
        setBursts((b) => [...b, { key, tiles: d.tiles!, color: ELEMENT_COLOR[dt] }]);
        later(() => setBursts((b) => b.filter((x) => x.key !== key)), 900);
      }
      if (l.text.startsWith("✨") || l.text.startsWith("🐉")) spell = true;
    }
    if (spell) playWhoosh();

    // --- damage / healing numbers from HP changes
    const fl: Floater[] = [];
    const hit = new Set<string>();
    for (const c of enc.combatants) {
      const before = prevHp.current.get(c.id);
      if (before !== undefined && before !== c.hp) {
        const diff = c.hp - before;
        fl.push({ key: fxKey++, id: c.id, text: diff > 0 ? `+${diff}` : `${diff}`, kind: diff > 0 ? "heal" : "dmg" });
        if (diff < 0) hit.add(c.id);
      }
      prevHp.current.set(c.id, c.hp);
    }
    for (const l of fresh) {
      const m = /^(.+?) → (.+?): .*— miss/.exec(l.text);
      if (m) { const t = byName(m[2]); if (t) fl.push({ key: fxKey++, id: t.id, text: "miss", kind: "miss" }); }
    }
    if (fl.length) {
      later(() => setFloaters((f) => [...f, ...fl]), delay);
      later(() => setFloaters((f) => f.filter((x) => !fl.includes(x))), delay + 1400);
    }
    if (hit.size) {
      later(() => { setFlash(hit); playHit(); }, delay);
      later(() => setFlash(new Set()), delay + 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enc]);

  return { pos, floaters, bursts, flash, lunge };
}
