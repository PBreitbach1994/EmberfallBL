// Side jobs: short standalone scenarios that appear on the job board as the campaign unfolds.
// They pay out mostly in materials for building up Emberfall.
// Maps: '#' wall, '.' floor, ':' difficult, '~' water, 'O' pit, '+' door, '%' cover. Coordinates are [x, y].
import type { ClassId } from "../../types.js";
import type { Scenario } from "../types.js";

const ARC = "Side Jobs";
const cls = (id: string) => id as ClassId;

// ---------------------------------------------------------------------------------------------
// The Salt Road (levels 2-3) — unlocked by The Goblin Warren

const SALT_MAP = [
  "################",
  "#.:....%....:..#",
  "#.::...........#",
  "#.....%%%%.....#",
  "#..............#",
  "#.....%%%%.....#",
  "#..............#",
  "#::.........%..#",
  "#::............#",
  "################",
];
const SALT_PARTY: [number, number][] = [[5, 4], [10, 4], [5, 6], [10, 6], [4, 5], [11, 5]];
const SALT_BANDITS = [
  { monsterId: "banditCaptain", at: [14, 1] as [number, number], name: "Redcap Jory" },
  { monsterId: "bandit", at: [1, 1] as [number, number] },
  { monsterId: "bandit", at: [1, 8] as [number, number] },
  { monsterId: "scout", at: [14, 8] as [number, number], name: "Bandit Lookout" },
];

export const caravan: Scenario = {
  id: "caravan",
  name: "The Salt Road",
  hook: "\"Three wagons of salt and iron to the river-forts. Bandits on the road. Good pay, hot meals, no questions.\" — Dorna Vell, merchant",
  summary: "A merchant needs escorts for a salt caravan through bandit country. The pay is good — and the wagons are carrying more than salt.",
  location: "The Salt Road, east of Emberfall",
  recommendedLevel: [2, 3],
  arc: ARC,
  mapPosition: [80, 55],
  start: "muster",
  rewards: {
    xp: 250, gold: 60,
    effects: [{ kind: "material", id: "timber", qty: 2 }, { kind: "material", id: "iron", qty: 2 }, { kind: "prosperity", amount: 1 }],
    unlocks: [],
  },
  nodes: {
    muster: {
      id: "muster",
      title: "Three Wagons",
      text: "Dorna Vell is a broad, sunburnt woman with a merchant's smile and a soldier's eyes. Her three wagons are loaded with sacks of grey salt and bundled iron bar, and she counts your heads twice before she nods. 'Two days to the river-forts. Bandits have taken four caravans this season. I'd like not to be the fifth.'",
      dmNotes: "Under the salt, the third wagon carries crossbows for the river-forts — sold without the Lord-Warden's tax. Not evil, just smuggling. The bandit chief Redcap Jory knows about the crossbows; that's why he's coming.",
      npcs: [{ id: "dorna", name: "Dorna Vell", role: "Salt merchant and part-time smuggler", personality: "Brisk, generous, unapologetic.", voice: "Loud, practical, haggles even over compliments.", attitude: "friendly", secrets: ["Wagon three carries untaxed crossbows for the river-forts."] }],
      improv: { maxGold: 10, allowedItems: ["potionHealing", "rations", "rope"], maxDc: 14 },
      options: [
        {
          id: "inspect", label: "Inspect the wagons before you sign on",
          check: { skill: "investigation", dc: 12, who: "best" },
          success: { text: "Under the salt sacks in the third wagon: crates of crossbows, no tax seal. Dorna sees you see. 'River-forts need them more than the Lord-Warden needs the coin,' she says. 'Your call.'", goto: "road", effects: [{ kind: "flag", flag: "contraband" }] },
          failure: { text: "Salt, iron, salt. It all looks in order. You climb aboard.", goto: "road" },
        },
        { id: "go", label: "Sign on and roll out", success: { text: "The wagons creak out of Emberfall's east gate at dawn.", goto: "road" } },
      ],
    },
    road: {
      id: "road",
      title: "The Narrows",
      text: "On the second day the road threads between steep wooded banks — the Narrows, where the bandits struck last time. A felled tree lies across the road ahead. The birds have gone quiet.",
      improv: { maxGold: 10, allowedItems: ["potionHealing"], maxDc: 14 },
      options: [
        {
          id: "scan", label: "Scan the treeline before you approach",
          check: { skill: "perception", dc: 13, who: "group" },
          success: { text: "You spot the glint of a crossbow in the trees and circle the wagons before the ambush can spring.", goto: "ambushReady" },
          failure: { text: "The first crossbow bolt thunks into the lead wagon before you see a single bandit.", goto: "ambush" },
        },
        {
          id: "bluff", label: "Shout that the wagons carry plague-salt", hidden: true,
          check: { skill: "deception", dc: 14, who: "best" },
          success: { text: "Half the bandits melt away into the trees. Only Redcap Jory and his most stubborn followers stay to fight.", goto: "ambushReady", effects: [{ kind: "questCounter", counter: "secretsFound", amount: 1 }] },
          failure: { text: "'Nice try!' calls a voice from the trees. Bolts fly.", goto: "ambush" },
        },
      ],
    },
    ambushReady: {
      id: "ambushReady",
      title: "Circle the Wagons",
      text: "Redcap Jory steps out from the trees with a scarlet cap and a scimitar. 'Just the third wagon,' he calls. 'Keep the salt.'",
      options: [],
      encounter: {
        id: "saltReady", name: "Circle the Wagons", map: SALT_MAP, partyStart: SALT_PARTY, surprise: "enemy", monsters: SALT_BANDITS,
        objective: "Defend the caravan.", scaling: { perExtraHero: "bandit", perMissingHero: "bandit" },
        onVictory: { text: "Redcap Jory's cap lies in the mud. The survivors flee into the trees.", goto: "delivery", effects: [{ kind: "gold", amount: 15 }] },
        onDefeat: { text: "The bandits drive you off and take the third wagon.", goto: "lostCargo" },
      },
    },
    ambush: {
      id: "ambush",
      title: "Ambush in the Narrows",
      text: "Bandits pour out of the trees on both sides of the road.",
      options: [],
      encounter: {
        id: "saltAmbush", name: "Ambush in the Narrows", map: SALT_MAP, partyStart: SALT_PARTY, surprise: "party", monsters: SALT_BANDITS,
        objective: "Defend the caravan.", scaling: { perExtraHero: "bandit", perMissingHero: "bandit" },
        onVictory: { text: "The last bandit flees, and Dorna climbs out from under a wagon swearing magnificently.", goto: "delivery", effects: [{ kind: "gold", amount: 15 }] },
        onDefeat: { text: "The bandits drive you off and take the third wagon.", goto: "lostCargo" },
      },
    },
    delivery: {
      id: "delivery",
      title: "The River-Forts",
      text: "The river-fort's commander signs for the salt and iron, and Dorna pays you in good silver. Her eyes flick to the third wagon.",
      improv: { maxGold: 10, allowedItems: [], maxDc: 14 },
      options: [
        { id: "report", label: "Report the untaxed crossbows to the fort's tax-clerk", requires: { flag: "contraband" }, success: { text: "Dorna loses the crossbows and her temper. The Lord-Warden's clerk gives you a finder's fee and a cold smile.", goto: "paid", effects: [{ kind: "gold", amount: 25 }, { kind: "reputation", amount: -1 }] } },
        { id: "cut", label: "Ask Dorna for a cut of the crossbow money", requires: { flag: "contraband" }, success: { text: "Dorna laughs and pays up. 'Knew I liked you.' She'll call on you again.", goto: "paid", effects: [{ kind: "gold", amount: 30 }, { kind: "flag", flag: "dornaFriend" }] } },
        { id: "quiet", label: "Deliver everything and say nothing", success: { text: "The commander thanks you warmly. The river-forts will hold a little better this winter.", goto: "paid", effects: [{ kind: "reputation", amount: 1 }, { kind: "material", id: "iron", qty: 1 }] } },
      ],
    },
    paid: { id: "paid", title: "Back to Emberfall", text: "You ride back to Emberfall on an empty wagon, purses heavy. Dorna's iron goes to Hesk's forge.", options: [], end: "success" },
    lostCargo: { id: "lostCargo", title: "An Empty Road", text: "You limp back to Emberfall with two wagons out of three. Dorna pays you half, and isn't happy about it.", onEnter: [{ kind: "gold", amount: 10 }], options: [], end: "retreat" },
  },
};

// ---------------------------------------------------------------------------------------------
// The Weeping Mill (levels 3-4) — unlocked by The Drowned Chapel. Unlocks the Druid.

const MILL_MAP = [
  "################",
  "#~~~~..........#",
  "#~~~~..%...%...#",
  "#~~~...........#",
  "#~~..####+###..#",
  "#~...#......#..#",
  "#~...#..::..#..#",
  "#~...#......#..#",
  "#~...###..###..#",
  "#..............#",
  "################",
];
const MILL_PARTY: [number, number][] = [[6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9]];

export const mill: Scenario = {
  id: "mill",
  name: "The Weeping Mill",
  hook: "\"Ashford Mill's wheel turns at night with no water in the race. Miller's family's gone. River smells of graves.\" — notice signed by a druid, Hollin Fernsong",
  summary: "The mill on the Ash River turns by itself at night, and the river below it runs sick. A wandering druid believes the dead of the drowned chapel have found a new home — and are poisoning the water.",
  location: "Ashford Mill, on the Ash River",
  recommendedLevel: [3, 4],
  arc: ARC,
  mapPosition: [18, 42],
  start: "riverbank",
  rewards: {
    xp: 350, gold: 50,
    effects: [{ kind: "unlockClass", classId: cls("druid") }, { kind: "material", id: "timber", qty: 3 }, { kind: "material", id: "herbs", qty: 2 }],
    unlocks: [],
  },
  nodes: {
    riverbank: {
      id: "riverbank",
      title: "The Sick River",
      text: "The Ash River runs grey and sluggish past Ashford Mill, and dead fish line its banks. The mill wheel turns slowly, dry, groaning — though the millrace is empty. A woman with moss in her braids and a heron on her shoulder waits on the bank. 'Hollin Fernsong,' she says. 'The river asked for help. I suppose it asked you, too.'",
      dmNotes: "Undead from the drowned chapel's flooding drifted downriver and took the mill: ghouls and zombies inside, shadows in the loft. The miller's family hid in the cellar (alive). Hollin will help cleanse the river if trusted — this introduces the Druid class to Emberfall.",
      npcs: [{ id: "hollin", name: "Hollin Fernsong", role: "Wandering druid of the Ashwood", personality: "Patient, prickly with townsfolk, tender with every living thing that isn't a person. Slowly warms.", voice: "Speaks in short observations, often to the heron.", attitude: "indifferent", secrets: ["She is the last of an old circle that tended the Ashwood before Valdren fell."] }],
      improv: { maxGold: 10, allowedItems: ["potionHealing", "antitoxin"], maxDc: 15 },
      options: [
        {
          id: "talk", label: "Ask Hollin what the river told her",
          check: { skill: "nature", dc: 12, who: "best" },
          success: { text: "You speak her language — mud, current, the way fish face upstream when they're dying. Hollin softens. 'Dead things in the mill. And living ones under it, I think. Quietly.'", goto: "millDoor", effects: [{ kind: "flag", flag: "druidTrust" }] },
          failure: { text: "Hollin looks at you the way the heron looks at a frog. 'Go see for yourselves, then.'", goto: "millDoor" },
        },
        {
          id: "wheel", label: "Examine the dry-turning wheel",
          check: { skill: "investigation", dc: 13, who: "best" },
          success: { text: "Scratches on the paddles — fingernails. Something has been climbing the wheel and riding it round, over and over, like a child on a swing. And a faint knocking from below the floor: someone alive.", goto: "millDoor", effects: [{ kind: "flag", flag: "familyHeard" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
          failure: { text: "The wheel groans. You learn only that it's very old and very creepy.", goto: "millDoor" },
        },
      ],
    },
    millDoor: {
      id: "millDoor",
      title: "The Mill Door",
      text: "The mill door hangs open on darkness that smells of river mud and rot. Inside, something is chewing.",
      options: [
        { id: "in", label: "Go in", success: { text: "You step into the dark.", goto: "millFight" } },
        {
          id: "lure", label: "Lure them out into the daylight", hidden: true,
          check: { skill: "performance", dc: 13, who: "best" },
          success: { text: "You make a racket outside the door. The shadows stay in the loft — daylight is no friend to them — and the rest come shambling out half-blind.", goto: "millFight", effects: [{ kind: "flag", flag: "lured" }] },
          failure: { text: "Nothing comes out. You'll have to go in.", goto: "millFight" },
        },
      ],
    },
    millFight: {
      id: "millFight",
      title: "Grist for the Dead",
      text: "Ghouls hunch over the millstones; drowned dead sway in the corners; and in the loft, shadows peel away from the rafters.",
      options: [],
      encounter: {
        id: "millUndead", name: "Grist for the Dead", map: MILL_MAP, partyStart: MILL_PARTY,
        monsters: [
          { monsterId: "ghoul", at: [7, 5] },
          { monsterId: "ghoul", at: [10, 5] },
          { monsterId: "shadow", at: [6, 2] },
          { monsterId: "shadow", at: [13, 1] },
          { monsterId: "zombie", at: [2, 5] },
          { monsterId: "zombie", at: [4, 3] },
        ],
        objective: "Clear the mill of the dead.",
        scaling: { perExtraHero: "zombie", perMissingHero: "shadow" },
        onVictory: { text: "The last ghoul collapses into the millrace. Below the floor, a child begins to cry — the good kind of crying.", goto: "cleanse", effects: [{ kind: "item", itemId: "potionHealing", qty: 1 }] },
        onDefeat: { text: "The dead drive you out into the river. You crawl ashore downstream, half-drowned.", goto: "fled" },
      },
    },
    cleanse: {
      id: "cleanse",
      title: "Cleansing the River",
      text: "You pry up the floorboards and lift out the miller, his wife, and three children, filthy and alive. The river still runs grey. Hollin kneels at the millrace with her hands in the water.",
      improv: { maxGold: 15, allowedItems: ["potionHealing", "antitoxin"], maxDc: 15 },
      options: [
        { id: "rite", label: "Help Hollin perform the river's rite", requires: { flag: "druidTrust" }, success: { text: "You hold the herbs and speak the words she gives you. The grey drains out of the water like ink from a cloth, and the heron cries. 'Emberfall,' Hollin says thoughtfully. 'Perhaps it needs a druid.'", goto: "done", effects: [{ kind: "material", id: "herbs", qty: 2 }, { kind: "flag", flag: "riverCleansed" }] } },
        {
          id: "purify", label: "Purify the millrace yourselves",
          check: { skill: "religion", dc: 13, who: "best" },
          success: { text: "Prayer and salt and stubbornness. The river clears by evening. Hollin raises an eyebrow, impressed despite herself.", goto: "done", effects: [{ kind: "flag", flag: "riverCleansed" }] },
          failure: { text: "The water clears a little, then less. Hollin sighs and finishes the job herself. 'Watch,' she says. 'Next time you'll know.'", goto: "done" },
        },
      ],
    },
    done: { id: "done", title: "The Wheel Stops", text: "The mill wheel stops turning. The miller's family weep and feed you bread. Hollin Fernsong walks back to Emberfall with you, the heron flapping behind — she has decided to stay a while and teach.", options: [], end: "success" },
    fled: { id: "fled", title: "Downriver", text: "You drag yourselves back to Emberfall smelling of grave-water. The mill wheel is still turning.", options: [], end: "retreat" },
  },
};

// ---------------------------------------------------------------------------------------------
// The Long Night Festival (levels 4-5) — unlocked by Frostfall

const FESTIVAL_MAP = [
  "#################",
  "#...............#",
  "#.%...%...%...%.#",
  "#...............#",
  "#.....:::::.....#",
  "#.....:::::.....#",
  "#...............#",
  "#.%...%...%...%.#",
  "#...............#",
  "#...............#",
  "#################",
];
const FESTIVAL_PARTY: [number, number][] = [[7, 8], [8, 8], [9, 8], [7, 9], [8, 9], [9, 9]];
const FESTIVAL_FOES = [
  { monsterId: "cultFanatic", at: [8, 1] as [number, number], name: "The Frost-Speaker" },
  { monsterId: "rimeback", at: [3, 4] as [number, number] },
  { monsterId: "iceMephit", at: [1, 6] as [number, number] },
  { monsterId: "iceMephit", at: [15, 6] as [number, number] },
  { monsterId: "iceMephit", at: [12, 1] as [number, number] },
  { monsterId: "iceMephit", at: [4, 1] as [number, number] },
];

export const festival: Scenario = {
  id: "festival",
  name: "The Long Night Festival",
  hook: "\"Ice sculptures, hot cider, lanterns on the river — the Long Night comes early this year, so we'll celebrate early. Volunteers wanted to keep the peace.\" — Emberfall Council",
  summary: "Emberfall holds its Long Night lantern festival weeks early, in defiance of the unnatural winter. But one of the sculptors has been carving more than ice.",
  location: "Emberfall market square",
  recommendedLevel: [4, 5],
  arc: ARC,
  mapPosition: [56, 60],
  start: "square",
  rewards: {
    xp: 450, gold: 80,
    effects: [{ kind: "material", id: "relic", qty: 1 }, { kind: "material", id: "timber", qty: 2 }, { kind: "prosperity", amount: 2 }, { kind: "questCounter", counter: "frostbound", amount: 1 }],
    unlocks: [],
  },
  nodes: {
    square: {
      id: "square",
      title: "Lanterns in the Snow",
      text: "Emberfall's market square glows with a hundred paper lanterns. Children skate on the frozen fountain; Pell's old stall sells cider now; and down the middle of the square stands a row of magnificent ice sculptures — a dragon, a bear, a crowned woman — carved by a hooded stranger who calls himself the Frost-Speaker.",
      dmNotes: "The Frost-Speaker is a fanatic of the Rime Queen. Ice mephits hide inside the sculptures, and a rimeback is chained in the crowned-woman statue's shadow. At the lighting of the great lantern they will attack the crowd. Evacuating the square (hidden) protects reputation.",
      npcs: [{ id: "frostSpeaker", name: "The Frost-Speaker", role: "Hooded sculptor, secretly a fanatic of the Rime Queen", personality: "Soft-spoken, rapturous about 'the stillness'.", voice: "Whispers, as if not to wake something.", attitude: "hostile", secrets: ["He believes the Queen will 'preserve' Emberfall forever, unchanging, like his sculptures."] }],
      improv: { maxGold: 15, allowedItems: ["potionHealing"], maxDc: 16 },
      options: [
        {
          id: "inspect", label: "Take a closer look at the ice sculptures",
          check: { skill: "arcana", dc: 14, who: "best" },
          success: { text: "Deep inside the ice dragon, something blinks. The sculptures are hollow — and full. You have a moment before the Frost-Speaker realises you know.", goto: "fightWarned" },
          failure: { text: "Beautiful work. You move on to the cider. Then the great lantern is lit, and the sculptures burst apart.", goto: "fightAmbush" },
        },
        {
          id: "enjoy", label: "Enjoy the festival and keep an eye out",
          check: { skill: "perception", dc: 15, who: "group" },
          success: { text: "Between cups of cider you notice the Frost-Speaker hasn't touched a drop — and is counting down under his breath.", goto: "fightWarned" },
          failure: { text: "The cider is excellent. The ambush is better.", goto: "fightAmbush" },
        },
        {
          id: "evacuate", label: "Quietly clear the crowd from around the sculptures", hidden: true,
          check: { skill: "persuasion", dc: 14, who: "best" },
          success: { text: "With a word here and a coin there you draw the crowd toward the river lanterns. When the sculptures burst, no townsfolk are in reach.", goto: "fightWarned", effects: [{ kind: "reputation", amount: 2 }, { kind: "flag", flag: "festivalSaved" }] },
          failure: { text: "Nobody wants to leave the best spot. When the sculptures burst, the screaming starts.", goto: "fightAmbush" },
        },
      ],
    },
    fightWarned: {
      id: "fightWarned",
      title: "The Sculptures Wake",
      text: "The Frost-Speaker throws back his hood. 'Be still,' he breathes — and the sculptures shatter, loosing ice mephits and a roaring rimeback.",
      options: [],
      encounter: {
        id: "festivalWarned", name: "The Sculptures Wake", map: FESTIVAL_MAP, partyStart: FESTIVAL_PARTY, surprise: "enemy", monsters: FESTIVAL_FOES,
        objective: "Stop the Frost-Speaker.", scaling: { perExtraHero: "iceMephit", perMissingHero: "iceMephit" },
        onVictory: { text: "The Frost-Speaker falls among the shards of his own work, still whispering 'be still'.", goto: "lanternsLit" },
        onDefeat: { text: "Ice and screaming. The festival is ruined.", goto: "ruined" },
      },
    },
    fightAmbush: {
      id: "fightAmbush",
      title: "Ice and Screaming",
      text: "The great lantern flares — and the sculptures explode outward in a storm of ice.",
      options: [],
      encounter: {
        id: "festivalAmbush", name: "Ice and Screaming", map: FESTIVAL_MAP, partyStart: FESTIVAL_PARTY, surprise: "party", monsters: FESTIVAL_FOES,
        objective: "Stop the Frost-Speaker.", scaling: { perExtraHero: "iceMephit", perMissingHero: "iceMephit" },
        onVictory: { text: "The square is a wreck of ice and lantern paper, but the Frost-Speaker is down.", goto: "lanternsLit", effects: [{ kind: "reputation", amount: -1 }] },
        onDefeat: { text: "Ice and screaming. The festival is ruined.", goto: "ruined" },
      },
    },
    lanternsLit: {
      id: "lanternsLit",
      title: "The Long Night",
      text: "When the shards are swept away, Emberfall lights its lanterns anyway. Someone starts to sing, and then everyone does. Among the Frost-Speaker's tools you find an old Valdren reliquary box — and a map of the pass with the Silent Cairn circled.",
      options: [],
      end: "success",
    },
    ruined: { id: "ruined", title: "Broken Lanterns", text: "The festival ends in a stampede. By morning the square is quiet, and the Frost-Speaker is gone.", onEnter: [{ kind: "reputation", amount: -1 }], options: [], end: "failure" },
  },
};

export const SIDE_JOBS: Record<string, Scenario> = { caravan, mill, festival };
