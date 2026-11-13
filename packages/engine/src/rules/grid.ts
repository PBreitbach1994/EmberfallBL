// Grid geometry: distance, line of sight, pathfinding and area templates.
// 2024 rules: every square (including diagonals) costs 5 ft, so distance is Chebyshev.
import type { Combatant, EncounterState, GridMap, Point } from "../types.js";

export const FT = 5;

export const dist = (a: Point, b: Point) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * FT;
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function inBounds(map: GridMap, p: Point): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height;
}

export function tileAt(map: GridMap, p: Point) {
  return inBounds(map, p) ? map.tiles[p.y][p.x] : "wall";
}

export function passable(map: GridMap, p: Point): boolean {
  const t = tileAt(map, p);
  return t !== "wall" && t !== "pit";
}

export function moveCost(map: GridMap, p: Point): number {
  const t = tileAt(map, p);
  return t === "difficult" || t === "water" ? 10 : 5;
}

/** Bresenham line between two points (inclusive). */
export function line(a: Point, b: Point): Point[] {
  const pts: Point[] = [];
  let x0 = a.x, y0 = a.y;
  const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

export function hasLineOfSight(map: GridMap, a: Point, b: Point): boolean {
  const pts = line(a, b);
  for (let i = 1; i < pts.length - 1; i++) if (tileAt(map, pts[i]) === "wall") return false;
  return true;
}

/** +2 AC (half cover) if a cover tile or another creature lies between attacker and target. */
export function coverBonus(enc: EncounterState, from: Point, to: Point, ignoreIds: string[] = []): number {
  const pts = line(from, to);
  let bonus = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    if (tileAt(enc.map, p) === "cover") bonus = Math.max(bonus, 2);
    const blocker = enc.combatants.find((c) => !c.dead && !c.fled && samePoint(c.pos, p) && !ignoreIds.includes(c.id));
    if (blocker) bonus = Math.max(bonus, 2);
  }
  return bonus;
}

export function occupant(enc: EncounterState, p: Point): Combatant | undefined {
  return enc.combatants.find((c) => !c.dead && !c.fled && samePoint(c.pos, p));
}

const DIRS: Point[] = [
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 },
];

export interface PathResult { path: Point[]; cost: number }

/**
 * Cheapest path for `mover` to `to` (Dijkstra). Hostile creatures block movement; allies can be passed
 * through but not ended on. Returns null if unreachable.
 */
export function findPath(enc: EncounterState, mover: Combatant, to: Point, maxCost = Infinity): PathResult | null {
  const { map } = enc;
  if (!inBounds(map, to) || !passable(map, to)) return null;
  const end = occupant(enc, to);
  if (end && end.id !== mover.id) return null;
  const key = (p: Point) => p.y * map.width + p.x;
  const best = new Map<number, number>();
  const prev = new Map<number, Point>();
  const start = mover.pos;
  best.set(key(start), 0);
  const queue: { p: Point; c: number }[] = [{ p: start, c: 0 }];
  while (queue.length) {
    queue.sort((a, b) => a.c - b.c);
    const { p, c } = queue.shift()!;
    if (samePoint(p, to)) break;
    if (c > (best.get(key(p)) ?? Infinity)) continue;
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (!inBounds(map, n) || !passable(map, n)) continue;
      // no corner cutting through two walls
      if (d.x !== 0 && d.y !== 0 && !passable(map, { x: p.x + d.x, y: p.y }) && !passable(map, { x: p.x, y: p.y + d.y })) continue;
      const occ = occupant(enc, n);
      if (occ && occ.id !== mover.id && occ.side !== mover.side && !occ.conditions.includes("unconscious") && occ.hp > 0) continue;
      const nc = c + moveCost(map, n);
      if (nc > maxCost) continue;
      if (nc < (best.get(key(n)) ?? Infinity)) {
        best.set(key(n), nc);
        prev.set(key(n), p);
        queue.push({ p: n, c: nc });
      }
    }
  }
  const total = best.get(key(to));
  if (total === undefined) return null;
  const path: Point[] = [to];
  let cur = to;
  while (!samePoint(cur, start)) {
    const pp = prev.get(key(cur));
    if (!pp) return null;
    path.unshift(pp);
    cur = pp;
  }
  return { path, cost: total };
}

/** All tiles reachable with the given movement budget, with their cost. */
export function reachable(enc: EncounterState, mover: Combatant, budget: number): Map<string, number> {
  const { map } = enc;
  const out = new Map<string, number>();
  const k = (p: Point) => `${p.x},${p.y}`;
  const queue: { p: Point; c: number }[] = [{ p: mover.pos, c: 0 }];
  out.set(k(mover.pos), 0);
  while (queue.length) {
    queue.sort((a, b) => a.c - b.c);
    const { p, c } = queue.shift()!;
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (!inBounds(map, n) || !passable(map, n)) continue;
      if (d.x !== 0 && d.y !== 0 && !passable(map, { x: p.x + d.x, y: p.y }) && !passable(map, { x: p.x, y: p.y + d.y })) continue;
      const occ = occupant(enc, n);
      if (occ && occ.id !== mover.id && occ.side !== mover.side && occ.hp > 0) continue;
      const nc = c + moveCost(map, n);
      if (nc > budget) continue;
      if (nc < (out.get(k(n)) ?? Infinity)) { out.set(k(n), nc); queue.push({ p: n, c: nc }); }
    }
  }
  // can't end on an occupied tile
  for (const key of [...out.keys()]) {
    const [x, y] = key.split(",").map(Number);
    const occ = occupant(enc, { x, y });
    if (occ && occ.id !== mover.id) out.delete(key);
  }
  return out;
}

/** Tiles covered by an area of effect. Origin is the caster for cone/line/cube(self), or the target point for spheres. */
export function areaTiles(map: GridMap, shape: "cone" | "cube" | "sphere" | "line", sizeFt: number, caster: Point, point: Point): Point[] {
  const out: Point[] = [];
  const n = Math.round(sizeFt / FT);
  if (shape === "sphere") {
    for (let y = point.y - n; y <= point.y + n; y++) for (let x = point.x - n; x <= point.x + n; x++) {
      const p = { x, y };
      if (inBounds(map, p) && dist(p, point) <= sizeFt && hasLineOfSight(map, point, p)) out.push(p);
    }
    return out;
  }
  const dx = point.x - caster.x, dy = point.y - caster.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  if (shape === "line") {
    const far = { x: Math.round(caster.x + ux * n), y: Math.round(caster.y + uy * n) };
    for (const p of line(caster, far).slice(1)) {
      if (!inBounds(map, p) || tileAt(map, p) === "wall") break;
      out.push(p);
    }
    return out;
  }
  if (shape === "cube") {
    // cube of side n adjacent to the caster in the chosen direction
    const sx = Math.abs(ux) < 0.38 ? 0 : Math.sign(ux);
    const sy = Math.abs(uy) < 0.38 ? 0 : Math.sign(uy);
    const half = Math.floor(n / 2);
    const cx = caster.x + sx * (half + 1), cy = caster.y + sy * (half + 1);
    for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) {
      const p = { x, y };
      if (inBounds(map, p) && !samePoint(p, caster) && tileAt(map, p) !== "wall") out.push(p);
    }
    return out;
  }
  // cone: within n squares, within ~53 degrees of the aim direction
  for (let y = caster.y - n; y <= caster.y + n; y++) for (let x = caster.x - n; x <= caster.x + n; x++) {
    const p = { x, y };
    if (!inBounds(map, p) || samePoint(p, caster)) continue;
    const vx = x - caster.x, vy = y - caster.y;
    const d = Math.hypot(vx, vy);
    if (d > n + 0.5) continue;
    const cos = (vx * ux + vy * uy) / d;
    if (cos >= 0.85 || (d <= 1.5 && cos >= 0.7)) if (hasLineOfSight(map, caster, p)) out.push(p);
  }
  return out;
}

export function adjacentFree(enc: EncounterState, p: Point): Point[] {
  return DIRS.map((d) => ({ x: p.x + d.x, y: p.y + d.y })).filter((n) => inBounds(enc.map, n) && passable(enc.map, n) && !occupant(enc, n));
}

/** ASCII rendering for AI prompts and debugging. */
export function renderAscii(enc: EncounterState): string {
  const glyph: Record<string, string> = { floor: ".", wall: "#", difficult: ":", water: "~", pit: "O", door: "+", cover: "%" };
  const rows: string[] = [];
  const header = "   " + Array.from({ length: enc.map.width }, (_, x) => String(x % 10)).join("");
  rows.push(header);
  for (let y = 0; y < enc.map.height; y++) {
    let row = String(y).padStart(2, " ") + " ";
    for (let x = 0; x < enc.map.width; x++) {
      const c = occupant(enc, { x, y });
      if (c) {
        const idx = enc.combatants.filter((k) => k.side === c.side).indexOf(c);
        row += c.side === "party" ? String.fromCharCode(65 + idx) : String.fromCharCode(97 + (idx % 26));
      } else row += glyph[enc.map.tiles[y][x]] ?? "?";
    }
    rows.push(row);
  }
  return rows.join("\n");
}

/** Build a GridMap from rows of characters: '#' wall, '.' floor, ':' difficult, '~' water, 'O' pit, '+' door, '%' cover */
export function mapFromAscii(rows: string[]): GridMap {
  const t: Record<string, GridMap["tiles"][number][number]> = { "#": "wall", ".": "floor", ":": "difficult", "~": "water", O: "pit", "+": "door", "%": "cover" };
  const width = Math.max(...rows.map((r) => r.length));
  return {
    width, height: rows.length,
    tiles: rows.map((r) => Array.from({ length: width }, (_, x) => t[r[x] ?? "#"] ?? "floor")),
  };
}
