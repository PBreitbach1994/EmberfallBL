// Town buildings of Emberfall. Upgrades cost gold and materials brought back from scenarios.
import type { BuildingDef } from "../types.js";

export const BUILDINGS: Record<string, BuildingDef> = {
  tavern: {
    id: "tavern", name: "The Broken Lantern",
    description: "Hiring hall, infirmary and home for the companies of Emberfall. Bigger halls attract more companions.",
    startingLevel: 1,
    levels: [
      { cost: { gold: 0 }, description: "A smoky common room and a notice board. Recruit one AI companion per party.", unlocks: ["companions1"] },
      { cost: { gold: 80, timber: 3 }, description: "A new wing of bunks. Recruit up to two AI companions.", unlocks: ["companions2"] },
      { cost: { gold: 150, timber: 4, iron: 2 }, description: "A proper hall with private rooms: long rests restore an extra Hit Die, up to three companions.", unlocks: ["companions3", "privateRooms"] },
    ],
  },
  smithy: {
    id: "smithy", name: "Hesk's Smithy",
    description: "Hesk Tallowmere forges and mends arms and armour.",
    startingLevel: 1,
    levels: [
      { cost: { gold: 0 }, description: "Simple and martial weapons, light and medium armour for sale.", unlocks: ["shop:weapons1", "shop:armor1"] },
      { cost: { gold: 100, iron: 3, timber: 1 }, description: "A second forge: heavy armour and shields of good steel.", unlocks: ["shop:armor2"] },
    ],
  },
  temple: {
    id: "temple", name: "Temple of the Dawnfather",
    description: "Brother Oswin's leaking temple: healing, blessings, and — rarely — a second chance.",
    startingLevel: 1,
    levels: [
      { cost: { gold: 0 }, description: "Healing services for coin.", unlocks: ["service:heal"] },
      { cost: { gold: 120, timber: 2, relic: 1 }, description: "A consecrated sanctuary. Raise Dead may be performed (500 gp diamond; not in Hardcore mode).", unlocks: ["service:raiseDead"] },
      { cost: { gold: 200, iron: 2, relic: 2 }, description: "Restoration rites cure curses, poisons and exhaustion.", unlocks: ["service:restoration"] },
    ],
  },
  alchemist: {
    id: "alchemist", name: "The Copper Still",
    description: "An alchemist's shop to brew healing potions and antitoxins.",
    startingLevel: 0,
    levels: [
      { cost: { gold: 60, timber: 2, herbs: 2 }, description: "Potions of Healing, antitoxin and alchemist's fire for sale.", unlocks: ["shop:potions"] },
      { cost: { gold: 140, iron: 1, herbs: 4 }, description: "Greater Potions of Healing for sale.", unlocks: ["shop:greaterPotions"] },
    ],
  },
  trainingYard: {
    id: "trainingYard", name: "Training Yard",
    description: "Sparring rings and practice dummies behind the tavern.",
    startingLevel: 0,
    levels: [
      { cost: { gold: 70, timber: 3 }, description: "Retrain a skill, cantrip, spell or weapon mastery between scenarios.", unlocks: ["service:retrain"] },
      { cost: { gold: 150, timber: 2, iron: 2 }, description: "Heroes earn 10% more XP from scenarios.", unlocks: ["xpBonus"] },
    ],
  },
  watchtower: {
    id: "watchtower", name: "Watchtower",
    description: "A tower on the palisade watching the roads.",
    startingLevel: 0,
    levels: [
      { cost: { gold: 90, timber: 3, iron: 1 }, description: "Draw two road events and choose which one to resolve.", unlocks: ["roadEvents:choose2"] },
    ],
  },
  library: {
    id: "library", name: "Wren's Library",
    description: "Old Wren's collection of Valdren lore, finally given a home.",
    startingLevel: 0,
    levels: [
      { cost: { gold: 80, timber: 2, relic: 1 }, description: "Consult the lore: learn a hint or secret about an unlocked scenario.", unlocks: ["service:lore"] },
      { cost: { gold: 160, relic: 2 }, description: "Spell scrolls for sale; wizards may copy new spells.", unlocks: ["shop:scrolls"] },
    ],
  },
  bank: {
    id: "bank", name: "Emberfall Counting-House",
    description: "A strongroom and a ledger. Gold left here grows.",
    startingLevel: 0,
    levels: [
      { cost: { gold: 150, iron: 2 }, description: "The town treasury earns 5% interest each week.", unlocks: ["service:interest"] },
    ],
  },
};
