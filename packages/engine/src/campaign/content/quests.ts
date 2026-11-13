// Personal quests: each hero draws one at creation. Completing it lets the hero retire with honour
// and unlocks new content for the whole campaign (Gloomhaven-style).
import type { PersonalQuest } from "../types.js";

export const PERSONAL_QUESTS: Record<string, PersonalQuest> = {
  settleScore: {
    id: "settleScore", name: "Settle the Score",
    description: "Goblinkin burned your home when you were young. You will not rest until the debt is paid in full. Defeat 15 goblinoids.",
    goals: { killGoblinoid: 15 }, unlock: { kind: "class", classId: "barbarian" },
    unlockText: "A towering stranger from the northern clans arrives at the Broken Lantern, drawn by tales of your fury. The Barbarian class is now available.",
  },
  layDead: {
    id: "layDead", name: "Lay the Dead to Rest",
    description: "The dead of Valdren do not sleep, and you have sworn they will. Destroy 12 undead.",
    goals: { killUndead: 12 }, unlock: { kind: "class", classId: "ranger" },
    unlockText: "A grey-cloaked warden of the Ashwood seeks out the one who quieted the restless dead. The Ranger class is now available.",
  },
  fortune: {
    id: "fortune", name: "A Fortune Made",
    description: "You came to the Marches poor. You mean to leave rich. Earn 300 gold over your career.",
    goals: { goldEarned: 300 }, unlock: { kind: "building", buildingId: "bank" },
    unlockText: "Your fortune seeds the Emberfall Counting-House. The Bank can now be built.",
  },
  cartographer: {
    id: "cartographer", name: "Map the Unknown",
    description: "Every blank space on the map is an insult. Complete 4 different scenarios.",
    goals: { scenarioDone: 4 }, unlock: { kind: "building", buildingId: "watchtower" },
    unlockText: "Your maps hang in the common room, and the town raises a watchtower to guard the roads you charted. The Watchtower can now be built.",
  },
  faith: {
    id: "faith", name: "The Price of Faith",
    description: "The Dawnfather spared you once. Repay the debt: donate 100 gold to the temple and the needy.",
    goals: { donated: 100 }, unlock: { kind: "building", buildingId: "temple" },
    unlockText: "Your generosity rebuilds the temple's sanctuary. The Temple can now be upgraded beyond its current level.",
  },
  survivor: {
    id: "survivor", name: "Too Stubborn to Die",
    description: "Death has come for you before and left disappointed. Be knocked to 0 hit points 3 times and live.",
    goals: { knockedOut: 3 }, unlock: { kind: "prestige", perk: "stubbornBlood" },
    unlockText: "Your legend grows: future heroes of your line begin play with an extra Potion of Healing and the will to keep fighting (Prestige perk: Stubborn Blood).",
  },
  blademaster: {
    id: "blademaster", name: "Master of the Blade",
    description: "You seek perfection in a single, flawless strike. Score 6 critical hits.",
    goals: { criticals: 6 }, unlock: { kind: "building", buildingId: "trainingYard" },
    unlockText: "You open a training yard behind the Broken Lantern to teach the next generation. The Training Yard can now be built.",
  },
  secretsKeeper: {
    id: "secretsKeeper", name: "Keeper of Secrets",
    description: "The fall of Valdren was no accident, and you mean to learn the truth. Uncover 5 secrets.",
    goals: { secretsFound: 5 }, unlock: { kind: "prestige", perk: "loremaster" },
    unlockText: "Your journals become the foundation of Emberfall's library, and future heroes of your line start with a lore secret (Prestige perk: Loremaster). The Library can now be built.",
  },
  // ---- Arc 2: The Frostbound Pass
  winterBreaker: {
    id: "winterBreaker", name: "Break the Winter",
    description: "The cold took your village, your family's flock, or your nerve. You will not see another summer stolen. Complete 5 jobs in the Frostbound Pass.",
    goals: { frostbound: 5 }, unlock: { kind: "building", buildingId: "watchtower" },
    unlockText: "You raise a watchtower over the Kettle Road so Emberfall will never again be surprised by the snow. The Watchtower can now be built.",
  },
  warmHearth: {
    id: "warmHearth", name: "A Warm Hearth",
    description: "Every refugee who walks out of the snow deserves a fire. Donate 200 gold to Emberfall.",
    goals: { donated: 200 }, unlock: { kind: "prestige", perk: "potion" },
    unlockText: "The refugees you housed never forget it: future heroes of your line start with an extra Potion of Healing (Prestige perk).",
  },
  houndsOath: {
    id: "houndsOath", name: "The Hounds' Oath",
    description: "Steel is cheap; trust is not. Win four allies or truces with words instead of blades.",
    goals: { parley: 4 }, unlock: { kind: "prestige", perk: "gold" },
    unlockText: "Captain Kade names you a sworn friend of the Grey Hounds; future heroes of your line start with 25 extra gold (Prestige perk).",
  },
  rimeHunter: {
    id: "rimeHunter", name: "Rime Hunter",
    description: "Wolves that talk, beasts of the high snow, things of living ice. Slay 12 creatures that are neither undead, beast, nor goblinkin.",
    goals: { killOther: 12 }, unlock: { kind: "building", buildingId: "alchemist" },
    unlockText: "Your trophies — frost-glands, rime-hearts, winter-wolf bile — set up an alchemist in business. The Copper Still can now be built.",
  },
};
