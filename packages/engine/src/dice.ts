// Seeded, serialisable dice. All randomness in the engine flows through an Rng so
// encounters can be saved mid-fight and replayed deterministically for tests.

export class Rng {
  state: number;
  constructor(seed: number = Date.now() >>> 0) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }
  /** mulberry32 */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  die(sides: number): number {
    return this.int(1, sides);
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}

export interface DiceTerm { count: number; sides: number }
export interface ParsedDice { terms: DiceTerm[]; bonus: number }

/** Parse "2d6+3", "1d8", "4", "1d4+1d6-1" */
export function parseDice(expr: string): ParsedDice {
  const clean = expr.replace(/\s+/g, "");
  const parts = clean.match(/[+-]?[^+-]+/g) ?? [];
  const terms: DiceTerm[] = [];
  let bonus = 0;
  for (const raw of parts) {
    const sign = raw.startsWith("-") ? -1 : 1;
    const p = raw.replace(/^[+-]/, "");
    const m = p.match(/^(\d*)d(\d+)$/i);
    if (m) {
      const count = (m[1] ? parseInt(m[1], 10) : 1) * sign;
      terms.push({ count, sides: parseInt(m[2], 10) });
    } else if (/^\d+$/.test(p)) {
      bonus += sign * parseInt(p, 10);
    } else {
      throw new Error(`Bad dice expression: ${expr}`);
    }
  }
  return { terms, bonus };
}

export interface RollResult { total: number; rolls: number[]; expr: string }

export function roll(rng: Rng, expr: string, opts: { crit?: boolean; rerollBelow?: number } = {}): RollResult {
  const { terms, bonus } = parseDice(expr);
  const rolls: number[] = [];
  let total = bonus;
  for (const t of terms) {
    const n = Math.abs(t.count) * (opts.crit ? 2 : 1);
    for (let i = 0; i < n; i++) {
      let r = rng.die(t.sides);
      // Great Weapon Fighting (2024): treat 1s and 2s as 3s
      if (opts.rerollBelow && r < opts.rerollBelow) r = opts.rerollBelow;
      rolls.push(r);
      total += Math.sign(t.count) * r;
    }
  }
  return { total: Math.max(0, total), rolls, expr };
}

export function averageDice(expr: string): number {
  const { terms, bonus } = parseDice(expr);
  return Math.floor(terms.reduce((s, t) => s + t.count * (t.sides + 1) / 2, bonus));
}

export interface D20Result { natural: number; rolls: number[]; total: number; mode: "normal" | "advantage" | "disadvantage" }

export function rollD20(rng: Rng, bonus: number, adv: number, opts: { halflingLuck?: boolean } = {}): D20Result {
  const mode: D20Result["mode"] = adv > 0 ? "advantage" : adv < 0 ? "disadvantage" : "normal";
  const one = () => {
    let r = rng.die(20);
    if (opts.halflingLuck && r === 1) r = rng.die(20);
    return r;
  };
  const a = one();
  const rolls = [a];
  let natural = a;
  if (mode !== "normal") {
    const b = one();
    rolls.push(b);
    natural = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
  }
  return { natural, rolls, total: natural + bonus, mode };
}

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const fmtMod = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
export const profForLevel = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
