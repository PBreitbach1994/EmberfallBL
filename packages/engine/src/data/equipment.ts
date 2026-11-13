// Weapons, armor and gear from the SRD 5.2.1 (2024 rules), CC-BY-4.0.
import type { ArmorDef, ItemDef, WeaponDef } from "../types.js";

const w = (
  id: string, name: string, category: WeaponDef["category"], kind: WeaponDef["kind"], damage: string,
  damageType: WeaponDef["damageType"], properties: WeaponDef["properties"], mastery: WeaponDef["mastery"],
  cost: number, weight: number, extra: Partial<WeaponDef> = {},
): WeaponDef => ({ id, name, category, kind, damage, damageType, properties, mastery, cost, weight, ...extra });

export const WEAPONS: Record<string, WeaponDef> = Object.fromEntries([
  // Simple melee
  w("club", "Club", "simple", "melee", "1d4", "bludgeoning", ["light"], "slow", 0.1, 2),
  w("dagger", "Dagger", "simple", "melee", "1d4", "piercing", ["finesse", "light", "thrown"], "nick", 2, 1, { range: [20, 60] }),
  w("greatclub", "Greatclub", "simple", "melee", "1d8", "bludgeoning", ["twoHanded"], "push", 0.2, 10),
  w("handaxe", "Handaxe", "simple", "melee", "1d6", "slashing", ["light", "thrown"], "vex", 5, 2, { range: [20, 60] }),
  w("javelin", "Javelin", "simple", "melee", "1d6", "piercing", ["thrown"], "slow", 0.5, 2, { range: [30, 120] }),
  w("lightHammer", "Light Hammer", "simple", "melee", "1d4", "bludgeoning", ["light", "thrown"], "nick", 2, 2, { range: [20, 60] }),
  w("mace", "Mace", "simple", "melee", "1d6", "bludgeoning", [], "sap", 5, 4),
  w("quarterstaff", "Quarterstaff", "simple", "melee", "1d6", "bludgeoning", ["versatile"], "topple", 0.2, 4, { versatileDamage: "1d8" }),
  w("sickle", "Sickle", "simple", "melee", "1d4", "slashing", ["light"], "nick", 1, 2),
  w("spear", "Spear", "simple", "melee", "1d6", "piercing", ["thrown", "versatile"], "sap", 1, 3, { range: [20, 60], versatileDamage: "1d8" }),
  // Simple ranged
  w("lightCrossbow", "Light Crossbow", "simple", "ranged", "1d8", "piercing", ["ammunition", "loading", "twoHanded"], "slow", 25, 5, { range: [80, 320] }),
  w("shortbow", "Shortbow", "simple", "ranged", "1d6", "piercing", ["ammunition", "twoHanded"], "vex", 25, 2, { range: [80, 320] }),
  w("sling", "Sling", "simple", "ranged", "1d4", "bludgeoning", ["ammunition"], "slow", 0.1, 0, { range: [30, 120] }),
  // Martial melee
  w("battleaxe", "Battleaxe", "martial", "melee", "1d8", "slashing", ["versatile"], "topple", 10, 4, { versatileDamage: "1d10" }),
  w("flail", "Flail", "martial", "melee", "1d8", "bludgeoning", [], "sap", 10, 2),
  w("glaive", "Glaive", "martial", "melee", "1d10", "slashing", ["heavy", "reach", "twoHanded"], "graze", 20, 6),
  w("greataxe", "Greataxe", "martial", "melee", "1d12", "slashing", ["heavy", "twoHanded"], "cleave", 30, 7),
  w("greatsword", "Greatsword", "martial", "melee", "2d6", "slashing", ["heavy", "twoHanded"], "graze", 50, 6),
  w("halberd", "Halberd", "martial", "melee", "1d10", "slashing", ["heavy", "reach", "twoHanded"], "cleave", 20, 6),
  w("longsword", "Longsword", "martial", "melee", "1d8", "slashing", ["versatile"], "sap", 15, 3, { versatileDamage: "1d10" }),
  w("maul", "Maul", "martial", "melee", "2d6", "bludgeoning", ["heavy", "twoHanded"], "topple", 10, 10),
  w("morningstar", "Morningstar", "martial", "melee", "1d8", "piercing", [], "sap", 15, 4),
  w("pike", "Pike", "martial", "melee", "1d10", "piercing", ["heavy", "reach", "twoHanded"], "push", 5, 18),
  w("rapier", "Rapier", "martial", "melee", "1d8", "piercing", ["finesse"], "vex", 25, 2),
  w("scimitar", "Scimitar", "martial", "melee", "1d6", "slashing", ["finesse", "light"], "nick", 25, 3),
  w("shortsword", "Shortsword", "martial", "melee", "1d6", "piercing", ["finesse", "light"], "vex", 10, 2),
  w("trident", "Trident", "martial", "melee", "1d8", "piercing", ["thrown", "versatile"], "topple", 5, 4, { range: [20, 60], versatileDamage: "1d10" }),
  w("warPick", "War Pick", "martial", "melee", "1d8", "piercing", ["versatile"], "sap", 5, 2, { versatileDamage: "1d10" }),
  w("warhammer", "Warhammer", "martial", "melee", "1d8", "bludgeoning", ["versatile"], "push", 15, 5, { versatileDamage: "1d10" }),
  w("whip", "Whip", "martial", "melee", "1d4", "slashing", ["finesse", "reach"], "slow", 2, 3),
  // Martial ranged
  w("handCrossbow", "Hand Crossbow", "martial", "ranged", "1d6", "piercing", ["ammunition", "light", "loading"], "vex", 75, 3, { range: [30, 120] }),
  w("heavyCrossbow", "Heavy Crossbow", "martial", "ranged", "1d10", "piercing", ["ammunition", "heavy", "loading", "twoHanded"], "push", 50, 18, { range: [100, 400] }),
  w("longbow", "Longbow", "martial", "ranged", "1d8", "piercing", ["ammunition", "heavy", "twoHanded"], "slow", 50, 2, { range: [150, 600] }),
].map((x) => [x.id, x]));

const a = (id: string, name: string, category: ArmorDef["category"], baseAc: number, cost: number, weight: number, extra: Partial<ArmorDef> = {}): ArmorDef =>
  ({ id, name, category, baseAc, cost, weight, ...extra });

export const ARMOR: Record<string, ArmorDef> = Object.fromEntries([
  a("padded", "Padded Armor", "light", 11, 5, 8, { stealthDisadvantage: true }),
  a("leather", "Leather Armor", "light", 11, 10, 10),
  a("studdedLeather", "Studded Leather Armor", "light", 12, 45, 13),
  a("hide", "Hide Armor", "medium", 12, 10, 12, { dexCap: 2 }),
  a("chainShirt", "Chain Shirt", "medium", 13, 50, 20, { dexCap: 2 }),
  a("scaleMail", "Scale Mail", "medium", 14, 50, 45, { dexCap: 2, stealthDisadvantage: true }),
  a("breastplate", "Breastplate", "medium", 14, 400, 20, { dexCap: 2 }),
  a("halfPlate", "Half Plate Armor", "medium", 15, 750, 40, { dexCap: 2, stealthDisadvantage: true }),
  a("ringMail", "Ring Mail", "heavy", 14, 30, 40, { dexCap: 0, stealthDisadvantage: true }),
  a("chainMail", "Chain Mail", "heavy", 16, 75, 55, { dexCap: 0, strReq: 13, stealthDisadvantage: true }),
  a("splint", "Splint Armor", "heavy", 17, 200, 60, { dexCap: 0, strReq: 15, stealthDisadvantage: true }),
  a("plate", "Plate Armor", "heavy", 18, 1500, 65, { dexCap: 0, strReq: 15, stealthDisadvantage: true }),
  a("shield", "Shield", "shield", 2, 10, 6),
].map((x) => [x.id, x]));

const g = (id: string, name: string, kind: ItemDef["kind"], cost: number, description: string, extra: Partial<ItemDef> = {}): ItemDef =>
  ({ id, name, kind, cost, description, ...extra });

export const GEAR: Record<string, ItemDef> = Object.fromEntries([
  g("potionHealing", "Potion of Healing", "consumable", 50, "Drink (bonus action) or administer to regain 2d4+2 HP.", { use: { heal: "2d4+2" } }),
  g("potionGreaterHealing", "Potion of Greater Healing", "consumable", 150, "Regain 4d4+4 HP.", { use: { heal: "4d4+4" } }),
  g("healersKit", "Healer's Kit", "gear", 5, "Ten uses. Stabilize a creature at 0 HP without a Medicine check.", {}),
  g("antitoxin", "Antitoxin", "consumable", 50, "Advantage on saves against poison for 1 hour.", { use: { effect: "antitoxin" } }),
  g("alchemistsFire", "Alchemist's Fire", "consumable", 50, "Throw (20 ft). Dex save DC 13 or 1d4 fire at the start of each turn until extinguished.", { use: { effect: "alchemistsFire" } }),
  g("holyWater", "Holy Water", "consumable", 25, "Throw (20 ft). Dex save DC 13 or 2d8 radiant to a fiend or undead.", { use: { effect: "holyWater" } }),
  g("torch", "Torch", "gear", 0.01, "Bright light 20 ft, dim 20 ft more, for 1 hour."),
  g("rope", "Rope (50 ft)", "gear", 1, "Hempen rope."),
  g("thievesTools", "Thieves' Tools", "gear", 25, "Pick locks and disarm traps."),
  g("rations", "Rations (1 day)", "gear", 0.5, "Trail food."),
  g("arrows", "Arrows (20)", "gear", 1, "Ammunition."),
  g("bolts", "Crossbow Bolts (20)", "gear", 1, "Ammunition."),
  g("holySymbol", "Holy Symbol", "gear", 5, "A spellcasting focus for clerics."),
  g("spellbook", "Spellbook", "gear", 50, "A wizard's book of spells."),
  g("arcaneFocus", "Arcane Focus (Crystal)", "gear", 10, "A spellcasting focus for wizards."),
  g("diamond300", "Diamond (300 gp)", "treasure", 300, "A flawless diamond. Material component for Revivify."),
  g("diamond500", "Diamond (500 gp)", "treasure", 500, "Material component for Raise Dead."),
  // Town materials (for building upgrades)
  g("timber", "Timber", "material", 1, "Building material for town upgrades."),
  g("iron", "Iron Ingots", "material", 5, "Building material for town upgrades."),
  g("herbs", "Herbs", "material", 2, "Medicinal herbs for the alchemist."),
  g("relic", "Old Relic", "material", 10, "Fragments of the old kingdom. Scholars and priests pay well."),
].map((x) => [x.id, x]));

/** A unified item lookup for inventory display */
export function itemName(itemId: string): string {
  return WEAPONS[itemId]?.name ?? ARMOR[itemId]?.name ?? GEAR[itemId]?.name ?? itemId;
}
export function itemCost(itemId: string): number {
  return WEAPONS[itemId]?.cost ?? ARMOR[itemId]?.cost ?? GEAR[itemId]?.cost ?? 0;
}
export function itemExists(itemId: string): boolean {
  return !!(WEAPONS[itemId] || ARMOR[itemId] || GEAR[itemId]);
}
