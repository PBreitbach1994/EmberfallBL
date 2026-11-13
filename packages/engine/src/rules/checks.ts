// Ability checks and saving throws outside of combat (exploration and social play).
import { SKILL_ABILITY, SKILL_NAMES, ABILITY_NAMES } from "../data/origins.js";
import { fmtMod, mod, Rng, rollD20 } from "../dice.js";
import type { Ability, CharacterSheet, Skill } from "../types.js";
import { saveBonus, skillBonus } from "./character.js";

export interface CheckRequest {
  characterId: string;
  skill?: Skill;
  ability?: Ability;
  save?: boolean;
  dc: number;
  advantage?: boolean;
  disadvantage?: boolean;
  reason?: string;
  /** a bonus die (Guidance d4, Bardic Inspiration...) */
  bonusDie?: number;
}

export interface CheckResult {
  characterId: string;
  name: string;
  label: string;
  dc: number;
  rolls: number[];
  natural: number;
  bonus: number;
  total: number;
  success: boolean;
  critical: "success" | "failure" | null;
  text: string;
  usedInspiration?: boolean;
}

export function rollCheck(rng: Rng, sheet: CharacterSheet, req: CheckRequest): CheckResult {
  let bonus: number;
  let label: string;
  if (req.save && req.ability) {
    bonus = saveBonus(sheet, req.ability);
    label = `${ABILITY_NAMES[req.ability]} saving throw`;
  } else if (req.skill) {
    bonus = skillBonus(sheet, req.skill);
    label = `${ABILITY_NAMES[SKILL_ABILITY[req.skill]]} (${SKILL_NAMES[req.skill]})`;
  } else {
    const a = req.ability ?? "str";
    bonus = mod(sheet.abilities[a]);
    label = `${ABILITY_NAMES[a]} check`;
  }
  let adv = (req.advantage ? 1 : 0) - (req.disadvantage ? 1 : 0);
  // Remarkable Athlete: advantage on Athletics
  if (req.skill === "athletics" && sheet.classId === "fighter" && sheet.level >= 3) adv = Math.max(adv, 1);
  // Gnomish Cunning on mental saves
  if (req.save && req.ability && ["int", "wis", "cha"].includes(req.ability) && sheet.species === "gnome") adv = Math.max(adv, 1);
  if (sheet.exhaustion > 0) bonus -= 2 * sheet.exhaustion; // 2024 exhaustion: -2 per level to d20 tests
  const r = rollD20(rng, bonus, Math.sign(adv), { halflingLuck: sheet.species === "halfling" });
  let total = r.total;
  let extra = "";
  if (req.bonusDie) { const d = rng.die(req.bonusDie); total += d; extra = ` +d${req.bonusDie}(${d})`; }
  let usedInspiration = false;
  // Heroic Inspiration: reroll a failed check automatically
  if (total < req.dc && sheet.heroicInspiration && req.dc - total <= 10) {
    const rr = rollD20(rng, bonus, 0);
    if (rr.total > total) { total = rr.total; extra += ` (Heroic Inspiration reroll: ${rr.natural})`; }
    sheet.heroicInspiration = false;
    usedInspiration = true;
  }
  const success = total >= req.dc;
  const critical = r.natural === 20 ? "success" : r.natural === 1 ? "failure" : null;
  const text = `${sheet.name} — ${label}: ${r.rolls.join("/")} ${fmtMod(bonus)}${extra} = ${total} vs DC ${req.dc} → ${success ? "SUCCESS" : "FAILURE"}${critical === "success" ? " (natural 20!)" : critical === "failure" ? " (natural 1!)" : ""}`;
  return { characterId: sheet.id, name: sheet.name, label, dc: req.dc, rolls: r.rolls, natural: r.natural, bonus, total, success, critical, text, usedInspiration };
}

/** Group check: succeeds if at least half the group succeeds (2024 rules). */
export function groupCheck(rng: Rng, sheets: CharacterSheet[], req: Omit<CheckRequest, "characterId">): { results: CheckResult[]; success: boolean } {
  const results = sheets.map((s) => rollCheck(rng, s, { ...req, characterId: s.id }));
  const passes = results.filter((r) => r.success).length;
  return { results, success: passes >= Math.ceil(sheets.length / 2) };
}

export const DC = { veryEasy: 5, easy: 10, medium: 15, hard: 20, veryHard: 25, nearlyImpossible: 30 } as const;
