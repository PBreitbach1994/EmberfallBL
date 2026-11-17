// How casters grow and change their spells (2024 rules, simplified for the campaign game):
//  - Cleric & Druid: prepare any spells from the whole class list, changed freely between adventures.
//  - Wizard: prepare from your spellbook. The book grows by 2 spells a level, and by copying spell scrolls.
//  - Paladin & Ranger: swap one prepared spell after each long rest.
//  - Bard, Sorcerer & Warlock: swap one spell each time you gain a level.
//  - Every caster may swap one cantrip each time they gain a level.
//  - The Training Yard (service:retrain) sells extra swaps between adventures.
import { CLASSES, FULL_CASTER_SLOTS, HALF_CASTER_SLOTS, PACT_SLOTS } from "../data/classes.js";
import { GEAR } from "../data/equipment.js";
import { SPELLS } from "../data/spells.js";
import type { CharacterSheet, ClassId, SpellDef } from "../types.js";
import { ALWAYS_PREPARED, isCombatSpell } from "./character.js";

export type PrepMode = "list" | "book" | "swapOnRest" | "swapOnLevel";

export const PREP_MODE: Partial<Record<ClassId, PrepMode>> = {
  cleric: "list", druid: "list", wizard: "book", paladin: "swapOnRest", ranger: "swapOnRest",
  bard: "swapOnLevel", sorcerer: "swapOnLevel", warlock: "swapOnLevel",
};

/** Gold for a Training Yard swap: 10 gp for a cantrip, 20 gp per spell level otherwise. */
export function retrainCost(spellLevel: number): number { return spellLevel <= 0 ? 10 : 20 * spellLevel; }
/** Copying a scroll into a spellbook: 50 gp per spell level (2024). */
export function copyCost(spellLevel: number): number { return 50 * Math.max(1, spellLevel); }
/** Scroll prices in the Library. */
export function scrollPrice(spellLevel: number): number { return [0, 60, 150, 300][spellLevel] ?? 300; }
/** Spellbook size for a wizard of this level: 6 at level 1, +2 each level. */
export function spellbookSize(level: number): number { return 6 + 2 * Math.max(0, level - 1); }

export function maxSpellLevel(sheet: Pick<CharacterSheet, "spellSlots">): number { return Math.max(0, sheet.spellSlots.length - 1); }

/** The highest spell level a class can cast at a given character level (for previews). */
export function maxSpellLevelAt(classId: ClassId, level: number): number {
  const sc = CLASSES[classId]?.spellcasting;
  if (!sc) return 0;
  const table = sc.kind === "half" ? HALF_CASTER_SLOTS : sc.kind === "pact" ? PACT_SLOTS : FULL_CASTER_SLOTS;
  return Math.max(0, (table[level]?.length ?? 1) - 1);
}

const classList = (classId: ClassId) => Object.values(SPELLS).filter((s) => s.classes.includes(classId));

/** Spells you always have prepared that don't count against your limit (subclass, feats, class features). */
export function lockedSpells(sheet: CharacterSheet): string[] {
  const out = new Set<string>();
  for (const [lvl, ids] of Object.entries(ALWAYS_PREPARED[sheet.classId] ?? {})) if (sheet.level >= Number(lvl)) for (const id of ids) if (SPELLS[id]?.level) out.add(id);
  if (sheet.classId === "ranger") out.add("huntersMark");          // Favored Enemy
  if (sheet.classId === "paladin" && sheet.level >= 2) out.add("divineSmite");
  // spells from feats or species (not on your class list)
  for (const id of sheet.spellsKnown) if (SPELLS[id] && !SPELLS[id].classes.includes(sheet.classId)) out.add(id);
  return [...out];
}

/** Your own choices: prepared spells that aren't locked. */
export function chosenSpells(sheet: CharacterSheet): string[] {
  const locked = new Set(lockedSpells(sheet));
  return sheet.spellsKnown.filter((id) => !locked.has(id) && SPELLS[id]?.level);
}

/** How many spells you choose (always-prepared spells come on top). */
export function preparedLimit(sheet: CharacterSheet): number {
  return CLASSES[sheet.classId]?.spellcasting?.prepared[sheet.level] ?? 0;
}

export function cantripLimit(sheet: CharacterSheet): number {
  return CLASSES[sheet.classId]?.spellcasting?.cantrips[sheet.level] ?? 0;
}

/** Spells you could prepare right now. */
export function preparablePool(sheet: CharacterSheet): SpellDef[] {
  const max = maxSpellLevel(sheet);
  const locked = new Set(lockedSpells(sheet));
  const pool = PREP_MODE[sheet.classId] === "book"
    ? (sheet.spellbook ?? []).map((id) => SPELLS[id]).filter((s): s is SpellDef => !!s)
    : classList(sheet.classId);
  return pool.filter((s) => s.level >= 1 && s.level <= max && !locked.has(s.id)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export function cantripPool(sheet: CharacterSheet): SpellDef[] {
  return classList(sheet.classId).filter((s) => s.level === 0).sort((a, b) => a.name.localeCompare(b.name));
}

/** Give a wizard a spellbook if they don't have one (older characters), filled to the right size. */
export function ensureSpellbook(sheet: CharacterSheet, noFill = false): boolean {
  if (sheet.classId !== "wizard") return false;
  const before = JSON.stringify(sheet.spellbook ?? null);
  const book = new Set(sheet.spellbook ?? []);
  for (const id of sheet.spellsKnown) if (SPELLS[id]?.classes.includes("wizard") && SPELLS[id].level >= 1) book.add(id);
  const max = maxSpellLevel(sheet);
  const extra = classList("wizard").filter((s) => s.level >= 1 && s.level <= max && !book.has(s.id))
    .sort((a, b) => Number(isCombatSpell(b)) - Number(isCombatSpell(a)) || b.level - a.level || a.name.localeCompare(b.name));
  while (!noFill && book.size < spellbookSize(sheet.level) && extra.length) book.add(extra.shift()!.id);
  sheet.spellbook = [...book];
  return JSON.stringify(sheet.spellbook) !== before;
}

export interface PrepareRequest { spells?: string[]; cantrips?: string[]; retrain?: boolean }
export interface PrepareResult { notes: string[]; spellSwapsUsed: number; cantripSwapsUsed: number; changedSpells: number; changedCantrips: number; paidSpells: number; paidCantrips: number; cost: number }

/** Work out what a change to the prepared list costs, without applying it. Throws with a readable message if it isn't allowed. */
export function planPrepare(sheet: CharacterSheet, req: PrepareRequest): PrepareResult & { nextSpells: string[]; nextCantrips: string[] } {
  const mode = PREP_MODE[sheet.classId];
  if (!mode) throw new Error(`${CLASSES[sheet.classId].name}s don't cast spells.`);
  const notes: string[] = [];
  const locked = lockedSpells(sheet);
  const current = chosenSpells(sheet);
  let nextSpells = [...sheet.spellsKnown];
  let changedSpells = 0;
  if (req.spells) {
    const want = [...new Set(req.spells)];
    const pool = new Set(preparablePool(sheet).map((s) => s.id));
    for (const id of want) if (!pool.has(id)) throw new Error(`${SPELLS[id]?.name ?? id} isn't one you can prepare${mode === "book" ? " — it's not in your spellbook" : ""}.`);
    const limit = preparedLimit(sheet);
    if (want.length > limit) throw new Error(`You can prepare ${limit} spell${limit === 1 ? "" : "s"} of your choice (plus any that are always prepared).`);
    changedSpells = current.filter((id) => !want.includes(id)).length;   // spells given up
    nextSpells = [...locked, ...want];
  }
  let nextCantrips = [...sheet.cantrips];
  let changedCantrips = 0;
  if (req.cantrips) {
    const want = [...new Set(req.cantrips)];
    const pool = new Set(cantripPool(sheet).map((s) => s.id));
    const mineClass = sheet.cantrips.filter((id) => SPELLS[id]?.classes.includes(sheet.classId));
    const other = sheet.cantrips.filter((id) => !SPELLS[id]?.classes.includes(sheet.classId));
    for (const id of want) if (!pool.has(id)) throw new Error(`${SPELLS[id]?.name ?? id} isn't a ${CLASSES[sheet.classId].name.toLowerCase()} cantrip.`);
    if (want.length > Math.max(cantripLimit(sheet), mineClass.length)) throw new Error(`You know ${cantripLimit(sheet)} cantrips.`);
    changedCantrips = mineClass.filter((id) => !want.includes(id)).length;
    nextCantrips = [...other, ...want];
  }
  // what does it cost? Free swaps are used first; anything beyond needs the Training Yard (retrain).
  const swapMode = mode === "swapOnRest" || mode === "swapOnLevel";
  const spellSwapsUsed = swapMode ? Math.min(changedSpells, sheet.spellSwaps ?? 0) : 0;
  const cantripSwapsUsed = Math.min(changedCantrips, sheet.cantripSwaps ?? 0);
  const paidSpells = swapMode ? changedSpells - spellSwapsUsed : 0;
  const paidCantrips = changedCantrips - cantripSwapsUsed;
  // the Training Yard charges for the cheapest of the new picks (your free swaps cover the priciest)
  const addedSpells = (req.spells ?? []).filter((id) => !current.includes(id)).map((id) => SPELLS[id].level).sort((a, b) => a - b);
  const cost = addedSpells.slice(0, paidSpells).reduce((n, l) => n + retrainCost(l), 0) + paidCantrips * retrainCost(0);
  if (!req.retrain && paidSpells > 0) {
    throw new Error(mode === "swapOnRest"
      ? `${CLASSES[sheet.classId].name}s swap one prepared spell after each long rest${sheet.spellSwaps ? "" : " — you've used yours"}. The Training Yard can retrain more for gold.`
      : `${CLASSES[sheet.classId].name}s swap one spell each time they gain a level${sheet.spellSwaps ? "" : " — you've used yours"}. The Training Yard can retrain more for gold.`);
  }
  if (!req.retrain && paidCantrips > 0) throw new Error(`You can swap a cantrip once each time you gain a level${sheet.cantripSwaps ? "" : " — you've used it"}. The Training Yard can retrain more for gold.`);
  if (changedSpells) notes.push(`${changedSpells} spell${changedSpells === 1 ? "" : "s"} changed.`);
  if (changedCantrips) notes.push(`${changedCantrips} cantrip${changedCantrips === 1 ? "" : "s"} changed.`);
  return { notes, spellSwapsUsed, cantripSwapsUsed, changedSpells, changedCantrips, paidSpells, paidCantrips, cost, nextSpells: [...new Set(nextSpells)], nextCantrips: [...new Set(nextCantrips)] };
}

export function applyPrepare(sheet: CharacterSheet, req: PrepareRequest): PrepareResult {
  const plan = planPrepare(sheet, req);
  sheet.spellsKnown = plan.nextSpells;
  sheet.cantrips = plan.nextCantrips;
  sheet.spellSwaps = Math.max(0, (sheet.spellSwaps ?? 0) - plan.spellSwapsUsed);
  sheet.cantripSwaps = Math.max(0, (sheet.cantripSwaps ?? 0) - plan.cantripSwapsUsed);
  return plan;
}

/** Called after a long rest: paladins and rangers get their one swap back. */
export function refreshSwapsOnRest(sheet: CharacterSheet) {
  if (PREP_MODE[sheet.classId] === "swapOnRest") sheet.spellSwaps = Math.max(sheet.spellSwaps ?? 0, 1);
}
/** Called on level-up: one cantrip swap for every caster; one spell swap for bards, sorcerers and warlocks. */
export function grantSwapsOnLevel(sheet: CharacterSheet) {
  const mode = PREP_MODE[sheet.classId];
  if (!mode) return;
  if (cantripLimit(sheet) > 0) sheet.cantripSwaps = (sheet.cantripSwaps ?? 0) + 1;
  if (mode === "swapOnLevel") sheet.spellSwaps = (sheet.spellSwaps ?? 0) + 1;
}

// ---------------------------------------------------------------------------------------------
// Spell scrolls: a wizard can copy them into a spellbook.

export const scrollId = (spellId: string) => `scroll_${spellId}`;
export function spellOfScroll(itemId: string): SpellDef | undefined {
  return itemId.startsWith("scroll_") ? SPELLS[itemId.slice("scroll_".length)] : undefined;
}
/** Wizard spells that come as scrolls (levels 1–3). */
export function scrollSpells(): SpellDef[] {
  return classList("wizard").filter((s) => s.level >= 1 && s.level <= 3).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
/** Register scroll items so shops, loot and inventories understand them. Safe to call again after new spells appear. */
export function registerScrolls() {
  for (const s of scrollSpells()) {
    GEAR[scrollId(s.id)] = {
      id: scrollId(s.id), name: `Spell Scroll: ${s.name}`, kind: "gear", cost: scrollPrice(s.level),
      description: `A level ${s.level} wizard spell written out in full. A wizard can copy it into their spellbook (${copyCost(s.level)} gp of inks); the scroll is used up.`,
    };
  }
}
registerScrolls();

/** Copy a scroll in the wizard's pack into their spellbook. */
export function copyScroll(sheet: CharacterSheet, itemId: string): string {
  const sp = spellOfScroll(itemId);
  if (!sp) throw new Error("That isn't a spell scroll.");
  if (sheet.classId !== "wizard") throw new Error("Only wizards keep a spellbook.");
  ensureSpellbook(sheet);
  if (sheet.spellbook!.includes(sp.id)) throw new Error(`${sp.name} is already in your spellbook.`);
  if (sp.level > maxSpellLevel(sheet)) throw new Error(`${sp.name} is a level ${sp.level} spell — you can copy it once you have level ${sp.level} spell slots.`);
  const inv = sheet.inventory.find((i) => i.itemId === itemId && i.qty > 0);
  if (!inv) throw new Error(`${sheet.name} doesn't have that scroll.`);
  const cost = copyCost(sp.level);
  if (sheet.gold < cost) throw new Error(`Copying ${sp.name} takes ${cost} gp of rare inks; ${sheet.name} has ${sheet.gold} gp.`);
  sheet.gold -= cost;
  inv.qty -= 1;
  sheet.inventory = sheet.inventory.filter((i) => i.qty > 0);
  sheet.spellbook!.push(sp.id);
  return `${sheet.name} copies ${sp.name} into their spellbook (${cost} gp). Prepare it from the Spells tab.`;
}
