// Death and coming back: shared rules for the temple, the Phoenix Feather and the marks death leaves.
import type { CharacterSheet } from "../types.js";

/** Raise Dead must happen within this many real days of death (the 2024 spell's 10 days, generously). */
export const RAISE_DEAD_DAYS = 14;
export const MAX_GRAVE_MARKS = 3;

/** "Returned from the Grave": −1 to death saving throws per time this hero has come back (max −3). */
export function graveMarks(s: Pick<CharacterSheet, "deathCount">): number {
  return Math.min(MAX_GRAVE_MARKS, Math.max(0, s.deathCount ?? 0));
}

/** The temple charges more each time the gods are asked for the same soul. */
export function raiseDeadCost(s: Pick<CharacterSheet, "deathCount">): number { return 500 + 250 * Math.max(0, s.deathCount ?? 0); }
export function resurrectionCost(s: Pick<CharacterSheet, "deathCount">): number { return 1000 + 500 * Math.max(0, s.deathCount ?? 0); }

export function daysDead(s: Pick<CharacterSheet, "diedAt">, now = Date.now()): number {
  return s.diedAt ? (now - s.diedAt) / 86_400_000 : 0;
}

export interface DeathRuleContext { hardcore: boolean; difficulty?: string }

/** Phoenix Feather: once per hero, never on Hard/Brutal or in Hardcore. */
export function phoenixAllowed(ctx: DeathRuleContext, s: CharacterSheet): { ok: boolean; reason?: string } {
  if (!s.dead) return { ok: false, reason: `${s.name} isn't dead.` };
  if (ctx.hardcore || s.hardcore) return { ok: false, reason: "Hardcore: death is final." };
  if (ctx.difficulty === "hard" || ctx.difficulty === "brutal") return { ok: false, reason: `Phoenix Feathers don't work on ${ctx.difficulty} difficulty.` };
  if (s.phoenixUsed) return { ok: false, reason: `${s.name} has already been saved by a Phoenix Feather once.` };
  return { ok: true };
}

/** Bring a hero back. Every return leaves a mark (deathCount → death-save penalty). */
export function reviveSheet(s: CharacterSheet, opts: { exhaustion: number; fullHp?: boolean }) {
  s.dead = false;
  s.hp = opts.fullHp ? s.maxHp : 1;
  s.deathCount = (s.deathCount ?? 0) + 1;
  s.exhaustion = Math.min(6, (s.exhaustion ?? 0) + opts.exhaustion);
  s.diedWeek = undefined;
  s.diedAt = undefined;
  s.activeAdventureId = undefined;
}

/** Hiring a new tavern regular: a level 1 newcomer is free; seasoned hands cost 75 gp per level above 1. */
export function hireCost(level: number): number { return 75 * Math.max(0, Math.floor(level) - 1); }
/** Most living regulars the tavern can hold at once. */
export const MAX_REGULARS = 12;
