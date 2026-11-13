// Starter arc: "The Hollow Crown". Original content for the Emberfall Marches.
// Maps: '#' wall, '.' floor, ':' difficult, '~' water, 'O' pit, '+' door, '%' cover. Coordinates are [x, y].
import type { ClassId } from "../../types.js";
import type { Scenario } from "../types.js";
import { ARC2_SCENARIOS } from "./arc2.js";
import { SIDE_JOBS } from "./sidejobs.js";

const ARC = "The Hollow Crown";

// ---------------------------------------------------------------------------------------------
// 1. The Cellar Below (tutorial)

const CELLAR_MAP = [
  "##############",
  "#............#",
  "#..%.....::..#",
  "#..%.....::..#",
  "#............#",
  "###..####..###",
  "#............#",
  "#.%......~~..#",
  "#........~~..#",
  "##############",
];
const CELLAR_PARTY: [number, number][] = [[1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]];
const CELLAR_RATS = [
  { monsterId: "giantRat", at: [5, 7] as [number, number] },
  { monsterId: "giantRat", at: [7, 8] as [number, number] },
  { monsterId: "giantRat", at: [11, 6] as [number, number] },
  { monsterId: "giantRat", at: [12, 8] as [number, number] },
];

export const cellar: Scenario = {
  id: "cellar",
  name: "The Cellar Below",
  hook: "\"Something's in my cellar. Something's eating my cellar. Deal with it and drink free tonight.\" — M. Ironbell",
  summary: "Strange noises and missing stores lead the company beneath the Broken Lantern, where an old tunnel has broken through from below — and where goblin sign and a royal seal hint at something much older.",
  location: "The Broken Lantern, Emberfall",
  recommendedLevel: [1, 1],
  arc: ARC,
  mapPosition: [50, 55],
  start: "summons",
  rewards: { xp: 150, gold: 10, effects: [{ kind: "material", id: "timber", qty: 2 }, { kind: "questCounter", counter: "scenarioDone", amount: 1 }], unlocks: ["warren", "chapel"] },
  nodes: {
    summons: {
      id: "summons",
      title: "Trouble Downstairs",
      text: "Marta Ironbell slaps a ring of iron keys on the bar hard enough to rattle the tankards. For three nights something has been chewing through her cellar stores, and last night her potboy came up white as milk, swearing the floor down there was breathing. The trapdoor behind the bar is shut, and from beneath it comes a faint, wet scratching.",
      dmNotes: "This is the tutorial. Encourage players to try skill checks and talk to NPCs. The cellar's back wall has collapsed into an old Valdren drainage tunnel. Giant rats have nested there, driven up from the deep tunnels by whatever is stirring in the old keep. A goblin scout named Snik followed the rats looking for food and is now pinned under rubble.",
      npcs: [
        { id: "marta", name: "Marta Ironbell", role: "Proprietor", personality: "Gruff, one-eyed retired mercenary captain; protective of her tavern.", voice: "Short sentences. Calls everyone 'pup'.", attitude: "friendly", secrets: ["She heard knocking from the old keep-door bar top last night too."] },
        { id: "tobin", name: "Tobin", role: "Terrified potboy, about twelve", personality: "Jumpy, eager to help, embarrassed to have run.", voice: "Talks too fast, stammers when scared.", attitude: "friendly" },
        { id: "old-wren", name: "Old Wren", role: "Ancient lore-keeper living in the back room", personality: "Riddling, sharp, amused.", voice: "Speaks in 'once, long ago'.", attitude: "friendly", secrets: ["The tavern was built over a Valdren drain that leads toward the old keep."] },
      ],
      improv: { maxGold: 5, allowedItems: ["torch", "rope"], maxDc: 15 },
      options: [
        {
          id: "inspect", label: "Examine the trapdoor and the floor around it",
          check: { skill: "investigation", dc: 10, who: "best" },
          success: { text: "Gouge marks on the underside of the trapdoor — teeth, and lots of them. Among them, a smeared print: small, clawed, wearing a crude boot. Not just rats, then.", goto: "descent", effects: [{ kind: "flag", flag: "cellarForewarned" }] },
          failure: { text: "Dust, scratches, and the smell of old ale. Whatever's down there, you'll have to meet it face to face.", goto: "descent" },
        },
        {
          id: "tobin", label: "Calm Tobin and get the full story",
          check: { skill: "persuasion", dc: 10, who: "best" },
          success: { text: "Once he stops shaking, Tobin tells you the cellar wall 'fell in' and there were eyes — dozens — and one pair 'higher up, and it talked'. He presses a stub of candle into your hand for luck.", goto: "descent", effects: [{ kind: "flag", flag: "cellarForewarned" }, { kind: "item", itemId: "torch", qty: 1 }] },
          failure: { text: "Tobin bursts into tears and flees to the kitchen. Marta glares at you. 'Well. Off you go, then.'", goto: "descent" },
        },
        {
          id: "wren", label: "Ask Old Wren what lies beneath the tavern",
          check: { skill: "history", dc: 12, who: "best" },
          success: { text: "Old Wren cackles. 'Once, long ago, kings washed their sins down drains like that one. Every drain in Valdren runs to the keep, pups. Every one.' She taps her nose. You have learned something few in Emberfall know.", goto: "descent", effects: [{ kind: "questCounter", counter: "secretsFound", amount: 1 }, { kind: "flag", flag: "knowsDrains" }] },
          failure: { text: "Old Wren answers in a rhyme about a king, a bell, and a door, then falls asleep mid-verse. Charming. Unhelpful.", goto: "descent" },
        },
        { id: "go", label: "Take the keys and go down", success: { text: "You haul the trapdoor open. Cold air breathes up at you, carrying the smell of earth, rot, and something animal.", goto: "descent" } },
      ],
    },
    descent: {
      id: "descent",
      title: "The Cellar",
      text: "The cellar is a low vault of barrels and hanging hams, half of them gnawed to the bone. The far wall has slumped inward, revealing a black, dripping tunnel of fitted stone far older than the tavern. Something shifts among the sacks — a ripple of fur and the glint of many small eyes.",
      dmNotes: "If the party is forewarned (flag cellarForewarned) describe them as ready. A successful Perception check means the party sees the rats first; failure means the rats ambush. Clever ideas (food lure via Animal Handling, fire to scare them) can be resolved with the hidden options.",
      improv: { maxGold: 5, allowedItems: ["torch"], maxDc: 15 },
      options: [
        {
          id: "spot", label: "Move carefully and watch the shadows",
          check: { skill: "perception", dc: 12, who: "best" },
          success: { text: "You spot the nest before it spots you: a heaving pile of giant rats behind the broken wall. You have the first move.", goto: "ratsFight" },
          failure: { text: "A sack bursts open beside you and the rats pour out in a squealing tide!", goto: "ratsAmbush" },
        },
        { id: "charge", label: "Light torches and charge in", success: { text: "You charge with fire held high. The rats scatter, then turn and swarm.", goto: "ratsFight" } },
        {
          id: "lure", label: "Lure the rats away with food", hidden: true,
          check: { skill: "animalHandling", dc: 13, who: "best" },
          success: { text: "A trail of salt pork and cheese draws the rats into a side vault, and you bar the door behind them. Marta will be furious about the cheese — but nobody got bitten.", goto: "tunnel", effects: [{ kind: "xp", amount: 25 }] },
          failure: { text: "The rats take the food — and decide you're the second course.", goto: "ratsAmbush" },
        },
      ],
    },
    ratsFight: {
      id: "ratsFight",
      title: "Rats in the Walls",
      text: "The giant rats boil out of the broken wall, yellow teeth bared, as big as hounds and twice as hungry.",
      dmNotes: "Tutorial fight. Remind players about movement, attacks, and that rats have Pack Tactics.",
      options: [],
      encounter: {
        id: "cellarRats", name: "Rats in the Walls", map: CELLAR_MAP, monsters: CELLAR_RATS, partyStart: CELLAR_PARTY,
        objective: "Defeat the giant rats.", surprise: "enemy",
        scaling: { perExtraHero: "giantRat" },
        onVictory: { text: "The last rat shrieks and goes still. In the sudden quiet you hear something else — a thin, whimpering voice from inside the tunnel.", goto: "tunnel", effects: [{ kind: "questCounter", counter: "killBeast", amount: 4 }] },
        onDefeat: { text: "Teeth, darkness, and then Marta's boots on the stairs.", goto: "dragged" },
      },
    },
    ratsAmbush: {
      id: "ratsAmbush",
      title: "Ambushed!",
      text: "The rats are on you before your eyes adjust — a squealing, biting carpet of fur pouring over the barrels.",
      options: [],
      encounter: {
        id: "cellarRatsAmbush", name: "Rat Ambush", map: CELLAR_MAP, monsters: CELLAR_RATS, partyStart: CELLAR_PARTY,
        objective: "Survive the ambush and kill the rats.", surprise: "party",
        scaling: { perExtraHero: "giantRat" },
        onVictory: { text: "Bleeding but victorious, you kick the last carcass aside. From inside the tunnel comes a thin, whimpering voice.", goto: "tunnel", effects: [{ kind: "questCounter", counter: "killBeast", amount: 4 }] },
        onDefeat: { text: "The world narrows to teeth and darkness — until a familiar bellow and the crash of a cleaver.", goto: "dragged" },
      },
    },
    tunnel: {
      id: "tunnel",
      title: "The Thing Under the Rubble",
      text: "A few paces into the old tunnel, a slab of fallen masonry has pinned a small, grey-green figure by the leg: a goblin, no older than a youth, clutching a sack of stolen onions. Crude chalk marks — goblin sign — cover the tunnel walls, all pointing the same way: away from the deep dark, toward the town. 'Don't stab! Don't stab!' it squeaks in broken Common. 'Snik just hungry! Snik run from the pale ones!'",
      dmNotes: "Snik is a goblin scout from the Ashwood warren. His clan is fleeing undead ('pale ones') and red-robed people ('candle men') who took their deep tunnels. If spared and treated kindly, Snik will vouch for the party when they visit the warren (flag snikSpared). The goblin sign reads 'DANGER BELOW — FOOD ABOVE'.",
      npcs: [{ id: "snik", name: "Snik", role: "Young goblin scout", personality: "Terrified, hungry, quick-witted, desperately polite once fed.", voice: "Third person, squeaky, mixes Goblin words into Common.", attitude: "indifferent", secrets: ["His whole clan is planning to flee the Ashwood.", "He saw red-robed humans carrying a body toward the old keep."] }],
      improv: { maxGold: 5, allowedItems: ["rope", "rations"], maxDc: 15 },
      options: [
        {
          id: "free", label: "Lift the slab and free the goblin",
          check: { skill: "athletics", dc: 12, who: "best" },
          success: { text: "You heave the stone aside. Snik scrambles free, stares at you in disbelief, then bows so low his nose touches the floor. Between mouthfuls of onion he tells you about the 'pale ones' that walk in the deep tunnels and the 'candle men' in red who command them.", goto: "seal", effects: [{ kind: "flag", flag: "snikSpared" }, { kind: "questCounter", counter: "parley", amount: 1 }] },
          failure: { text: "The slab shifts, then slams back down — Snik howls, and the ceiling groans ominously. You finally lever it free, bruised and dusty; the goblin limps off into the dark with a grateful squeak, promising to 'tell the Boss you good ones'.", goto: "seal", effects: [{ kind: "flag", flag: "snikSpared" }, { kind: "damage", dice: "1d4", type: "bludgeoning", who: "chooser" }] },
        },
        {
          id: "interrogate", label: "Leave him pinned and demand answers",
          check: { skill: "intimidation", dc: 10, who: "best" },
          success: { text: "Snik babbles everything: the pale ones, the candle men in red robes, the warren in the Ashwood packing to flee. When you're done, you leave him to wriggle free on his own.", goto: "seal", effects: [{ kind: "flag", flag: "snikTalked" }] },
          failure: { text: "Snik panics, wrenches his leg free with a sickening crack, and bolts into the dark, shrieking. You've learned nothing — and the warren will hear about the cruel big-folk.", goto: "seal", effects: [{ kind: "flag", flag: "snikFled" }] },
        },
        { id: "captive", label: "Haul him upstairs for Captain Roe's watch", success: { text: "You drag the goblin up to the watch. Captain Roe locks him up with grim thanks and a few coins for the bounty. Snik's wail follows you back down the stairs.", goto: "seal", effects: [{ kind: "gold", amount: 5 }, { kind: "flag", flag: "snikCaptured" }, { kind: "reputation", amount: 1 }] } },
      ],
    },
    seal: {
      id: "seal",
      title: "The Royal Seal",
      text: "Deeper in, the tunnel ends at a round iron grate set into the stone, rusted shut. Above it, half hidden by roots, is a carved crest: a crown with no head beneath it, ringed by a chain of bells. A cold draft breathes through the bars, carrying the faint, impossible sound of a bell tolling far away.",
      dmNotes: "The crest is the seal of Aldric, the last king of Valdren — the Hollow Crown. The grate leads toward the old keep (too far and too collapsed to follow now). The bell sound comes from the Drowned Chapel. This node seeds the whole arc: both the warren and the chapel are now worth investigating.",
      improv: { maxGold: 10, allowedItems: ["torch"], maxDc: 15 },
      options: [
        {
          id: "study", label: "Study the crest",
          check: { skill: "history", dc: 12, who: "best" },
          success: { text: "The Hollow Crown — the seal of Aldric the Unyielding, last king of Valdren, who 'bargained with death and won'. Legend says his tomb lies beneath the old keep, and that a drowned chapel in the hills once kept its key.", goto: "home", effects: [{ kind: "questCounter", counter: "secretsFound", amount: 1 }, { kind: "flag", flag: "knowsHollowCrown" }] },
          failure: { text: "Some dead king's mark, surely. Old Wren would know.", goto: "home" },
        },
        {
          id: "pry", label: "Pry loose the crest as a relic",
          check: { skill: "athletics", dc: 13, who: "best" },
          success: { text: "The carved stone comes away in your hands — heavy, cold, and certainly worth something to a collector. The bell sound stops the instant it leaves the wall.", goto: "home", effects: [{ kind: "material", id: "relic", qty: 1 }] },
          failure: { text: "The crest won't budge, and your fingers come away numb with cold.", goto: "home", effects: [{ kind: "damage", dice: "1d4", type: "cold", who: "chooser" }] },
        },
        { id: "brick", label: "Brick up the tunnel and report to Marta", success: { text: "You stack fallen masonry against the breach until the draft stops. It won't hold forever — but it'll hold tonight.", goto: "home" } },
      ],
    },
    home: {
      id: "home",
      title: "Free Drinks",
      text: "Marta listens to your report with her one good eye narrowed, then pours you each a drink from the good barrel — the one she keeps for funerals and victories. 'Goblins running scared and dead kings' seals in my cellar,' she mutters. 'Pups, I think you've found yourselves some real work.' Two new notices go up on the board before the night is out.",
      dmNotes: "Success ending. The warren and the chapel are now unlocked on the campaign map.",
      options: [],
      end: "success",
    },
    dragged: {
      id: "dragged",
      title: "Dragged Out",
      text: "You wake on the common-room floor with Marta stitching your scalp and Brother Oswin praying over the worst of the bites. 'Rats,' Marta says flatly. 'Beaten by rats.' She sends the potboy for a mason to wall up the cellar, and hangs your sigil on the wall upside down until you've earned it back.",
      dmNotes: "Retreat ending. The players can replay the scenario later.",
      options: [],
      end: "retreat",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// 2. The Goblin Warren

const WARREN_MAP = [
  "################",
  "#..............#",
  "#.%%....::.....#",
  "#.......::..%..#",
  "#..~~.......%..#",
  "#..~~..........#",
  "#......%%......#",
  "#..............#",
  "#.::......:::..#",
  "#..............#",
  "################",
];
const WARREN_PARTY: [number, number][] = [[1, 9], [2, 9], [3, 9], [4, 9], [1, 7], [2, 7]];
const WARREN_GOBLINS = [
  { monsterId: "goblinBoss", at: [13, 1] as [number, number], name: "Gritch Two-Knives" },
  { monsterId: "goblinWarrior", at: [10, 2] as [number, number] },
  { monsterId: "goblinWarrior", at: [11, 4] as [number, number] },
  { monsterId: "goblinWarrior", at: [6, 4] as [number, number] },
  { monsterId: "goblinWarrior", at: [14, 5] as [number, number] },
];

export const warren: Scenario = {
  id: "warren",
  name: "The Goblin Warren",
  hook: "BOUNTY: Goblin raiders on the Ashwood farms. 5 silver an ear, or 40 gold to end it. — Capt. S. Roe, Emberfall Watch",
  summary: "Goblins have been raiding the Ashwood farms for food. Captain Roe wants them gone. But the goblins aren't attacking — they're fleeing something in the deep tunnels.",
  location: "The Ashwood",
  recommendedLevel: [1, 2],
  arc: ARC,
  mapPosition: [25, 30],
  start: "edge",
  rewards: { xp: 250, gold: 40, effects: [{ kind: "material", id: "timber", qty: 3 }, { kind: "questCounter", counter: "scenarioDone", amount: 1 }], unlocks: ["hollowKing", "caravan"] },
  nodes: {
    edge: {
      id: "edge",
      title: "The Edge of the Ashwood",
      text: "The Ashwood earns its name: grey-barked trees, leaves the colour of cinders, and a hush that swallows birdsong. At the last farmstead before the trees, a widow named Hanne shows you her raided root cellar — and, oddly, the untouched chicken coop and the children asleep in the loft. 'They took food,' she says. 'Only food. Like they were packing for a journey.'",
      dmNotes: "The goblins of the Ashwood warren (led by Gritch Two-Knives) are packing to flee. Undead and red-robed cultists have seized their deep tunnels, which connect to the old keep. They've raided farms for food, never for blood. If the party reached Snik peacefully (flag snikSpared), the goblins will know and be willing to talk.",
      npcs: [{ id: "hanne", name: "Widow Hanne", role: "Farmer on the edge of the Ashwood", personality: "Practical, unafraid, more angry at the Watch than at the goblins.", voice: "Blunt farm-speak.", attitude: "friendly", secrets: ["She has been leaving out bread for the goblin children."] }],
      improv: { maxGold: 10, allowedItems: ["rations", "rope"], maxDc: 15 },
      options: [
        {
          id: "track", label: "Track the raiders into the wood",
          check: { skill: "survival", dc: 12, who: "best" },
          success: { text: "The trail is easy once you know what to look for: small boots, dragged sacks, and — strangely — the tracks of goblin children among the raiders. It leads to a hollow hill crowned with dead oaks.", goto: "approach" },
          failure: { text: "You lose the trail twice and blunder into a goblin snare — a whip-branch studded with thorns. By the time you find the hollow hill, you're scratched, bloody, and late.", goto: "approach", effects: [{ kind: "damage", dice: "1d6", type: "piercing", who: "random" }] },
        },
        {
          id: "hanne", label: "Ask Hanne what she really knows",
          check: { skill: "insight", dc: 12, who: "best" },
          success: { text: "Hanne sighs and admits it: she's been leaving bread out for the goblin young. 'Their leader came to my door one night. Scar across his face, two knives. Said \"thank you\" in Common, plain as day. Said the dead were walking in the deep places.' She points you to the hollow hill.", goto: "approach", effects: [{ kind: "flag", flag: "warrenTruth" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
          failure: { text: "Hanne shrugs and points vaguely toward the trees. 'That way. Mind the snares.'", goto: "approach" },
        },
        { id: "march", label: "March straight into the wood", success: { text: "You follow the obvious trail of spilled grain and broken branches to a hollow hill crowned with dead oaks.", goto: "approach" } },
      ],
    },
    approach: {
      id: "approach",
      title: "The Hollow Hill",
      text: "The warren's entrance is a root-choked tunnel mouth beneath dead oaks, hung with bone chimes and guarded by two goblins who look more nervous than fierce. Beyond, you hear the bustle of a camp being broken: bundles tied, pots clanging, a child crying and quickly hushed.",
      dmNotes: "Many ways forward. Sneaking in lets the party see the truth. Parley works best with the warrenTruth or snikSpared flags. A frontal assault leads to a fight in which the party gets the drop on the goblins.",
      improv: { maxGold: 10, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        {
          id: "sneak", label: "Slip past the sentries",
          check: { skill: "stealth", dc: 13, who: "group" },
          success: { text: "You ghost past the sentries and into the warren's great chamber unseen.", goto: "inner" },
          failure: { text: "A bone chime clatters. A sentry shrieks the alarm, and the warren erupts into chaos.", goto: "fight" },
        },
        {
          id: "snik", label: "Call out Snik's name", requires: { flag: "snikSpared" },
          success: { text: "At the name, the sentries freeze. A small figure pushes between them — Snik, limping but grinning. 'These the good ones! These the onion ones!' The goblins lower their spears and lead you inside.", goto: "council", effects: [{ kind: "questCounter", counter: "parley", amount: 1 }] },
        },
        {
          id: "parley", label: "Show empty hands and ask to parley",
          check: { skill: "persuasion", dc: 12, who: "best" },
          success: { text: "The sentries exchange a look, then one scurries inside. Minutes later you are led into the warren under a dozen wary spears.", goto: "council" },
          failure: { text: "An arrow thuds into the dirt at your feet. 'NO TALK!' screams a sentry. Then more arrows — the goblins are attacking!", goto: "fight" },
        },
        { id: "assault", label: "Rush the sentries", success: { text: "You burst from the trees and fall on the sentries before they can raise the alarm.", goto: "fightSurprise" } },
      ],
    },
    inner: {
      id: "inner",
      title: "The Great Chamber",
      text: "From the shadows you see the warren as it is: two dozen goblins, most of them old or young, packing their lives into sacks. At the centre a scarred goblin with a knife on each hip — Gritch Two-Knives — is arguing with his warriors. You catch the words in Common: '...not stay! Pale ones take deep tunnels. Candle-men take Nubb. Next is us!'",
      dmNotes: "The party can see the goblins are refugees, not raiders. Revealing themselves peacefully makes the council easier. Attacking from hiding gives surprise.",
      improv: { maxGold: 10, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        {
          id: "reveal", label: "Step out and speak with Gritch",
          check: { skill: "persuasion", dc: 10, who: "best" },
          success: { text: "Gasps and drawn knives — but Gritch raises a hand. 'Big-folk walk in quiet, then talk first. Clever. Maybe honest. Talk.'", goto: "council", effects: [{ kind: "flag", flag: "warrenTruth" }] },
          failure: { text: "A young warrior screams and hurls a spear before Gritch can stop him. The chamber erupts!", goto: "fight" },
        },
        { id: "strike", label: "Strike at Gritch while they're distracted", success: { text: "You burst from cover with steel drawn. The goblins scatter, shrieking.", goto: "fightSurprise" } },
      ],
    },
    council: {
      id: "council",
      title: "Gritch Two-Knives",
      text: "Gritch Two-Knives squats on a stolen milking stool and studies you with yellow eyes. 'Big-folk come for ears,' he says. 'Fine. But listen first. Deep tunnels go to old stone house on hill. Pale ones come out of the old stone. Men in red with candles lead them. They take Nubb, my sister-son. We go before they take more.' He spits. 'So. You kill us, or you help us, or you go.'",
      dmNotes: "Gritch is proud, pragmatic and grieving. An alliance with the goblins (flag goblinAllies) opens a secret tunnel route in the finale and allows them to help in the final fight. He will accept a payment of food or gold as a sign of good faith. If threatened well, the goblins leave the Ashwood (flag goblinsDriven).",
      npcs: [{ id: "gritch", name: "Gritch Two-Knives", role: "Goblin chieftain", personality: "Proud, practical, grieving his sister's son; respects courage and honesty, hates being talked down to.", voice: "Short broken Common, refers to humans as 'big-folk', ends deals with a spit.", attitude: "indifferent", secrets: ["Nubb was taken alive, toward the old keep.", "The goblin deep tunnels reach the keep's crypt."] }],
      improv: { maxGold: 20, allowedItems: ["potionHealing", "rations"], maxDc: 15 },
      options: [
        {
          id: "ally", label: "Offer an alliance against the pale ones",
          check: { skill: "persuasion", dc: 13, who: "best" },
          success: { text: "Gritch stares at you a long moment, then draws one of his knives and offers it hilt-first. 'Gritch knife for big-folk word. When you go to old stone house, we show you deep way. We fight with you.' The goblins cheer. Captain Roe won't love this — but Hanne will.", goto: "endAllied", effects: [{ kind: "flag", flag: "goblinAllies" }, { kind: "questCounter", counter: "parley", amount: 1 }, { kind: "item", itemId: "dagger", qty: 1 }] },
          failure: { text: "Gritch laughs bitterly. 'Big-folk words. Words is wind.' His warriors close in. 'Go now. Or stay — and die.'", goto: "fight" },
        },
        {
          id: "pay", label: "Offer 20 gold of supplies as good faith", requires: { gold: 20 },
          success: { text: "You hand over coin and promise of grain. Gritch weighs the purse, nods slowly, and offers his knife hilt-first. 'Deeds, not words. Good. We fight with you, big-folk.'", goto: "endAllied", effects: [{ kind: "gold", amount: -20 }, { kind: "flag", flag: "goblinAllies" }, { kind: "questCounter", counter: "parley", amount: 1 }] },
        },
        {
          id: "drive", label: "Order them to leave the Ashwood for good",
          check: { skill: "intimidation", dc: 12, who: "best" },
          success: { text: "Gritch's jaw tightens, but he nods. 'We go. We were going anyway.' By nightfall the warren is empty, and you have a sack of goblin trinkets as 'tribute'.", goto: "endCleared", effects: [{ kind: "flag", flag: "goblinsDriven" }, { kind: "gold", amount: 15 }] },
          failure: { text: "'You threaten Gritch in Gritch's house?' Two knives flash into his hands. 'Then we fight!'", goto: "fight" },
        },
        { id: "attack", label: "Attack", success: { text: "Steel answers steel. Gritch howls a war cry.", goto: "fight" } },
      ],
    },
    fight: {
      id: "fight",
      title: "Battle in the Warren",
      text: "Goblins pour out of side tunnels with scimitars and shortbows as Gritch Two-Knives leaps onto a root-shelf, shrieking orders.",
      options: [],
      encounter: {
        id: "warrenBattle", name: "Battle in the Warren", map: WARREN_MAP, monsters: WARREN_GOBLINS, partyStart: WARREN_PARTY,
        objective: "Defeat Gritch Two-Knives and his warriors.",
        scaling: { perExtraHero: "goblinWarrior" },
        onVictory: { text: "Gritch falls, and the last goblins flee into the deep tunnels with their young. In the silence you find their stores — and a crude map scratched on bark, showing the deep tunnels leading toward the old keep.", goto: "endCleared", effects: [{ kind: "questCounter", counter: "killGoblinoid", amount: 5 }, { kind: "gold", amount: 15 }, { kind: "item", itemId: "potionHealing", qty: 1 }] },
        onDefeat: { text: "You are beaten, stripped of your purses, and dumped at the forest's edge.", goto: "routed" },
      },
    },
    fightSurprise: {
      id: "fightSurprise",
      title: "Assault on the Warren",
      text: "You hit the goblins before they can form up. Gritch Two-Knives screams for his warriors as you charge.",
      options: [],
      encounter: {
        id: "warrenAssault", name: "Assault on the Warren", map: WARREN_MAP, monsters: WARREN_GOBLINS, partyStart: WARREN_PARTY,
        objective: "Defeat Gritch Two-Knives and his warriors.", surprise: "enemy",
        scaling: { perExtraHero: "goblinWarrior" },
        onVictory: { text: "The warren falls silent. Among the bundles you find stolen grain, a few coins, and a bark map of the deep tunnels leading toward the old keep. In a corner, a goblin child stares at you with huge eyes before vanishing into the dark.", goto: "endCleared", effects: [{ kind: "questCounter", counter: "killGoblinoid", amount: 5 }, { kind: "gold", amount: 15 }, { kind: "item", itemId: "potionHealing", qty: 1 }] },
        onDefeat: { text: "The goblins rally and drive you out with arrows at your backs.", goto: "routed" },
      },
    },
    endAllied: {
      id: "endAllied",
      title: "An Unlikely Alliance",
      text: "You return to Emberfall with no ears to show — only a goblin knife, a promise, and a story Captain Roe refuses to believe until the raids stop overnight. She pays the bounty through gritted teeth. Hanne, for her part, starts baking extra bread.",
      dmNotes: "Success ending. goblinAllies is set: the goblins will help in The Hollow King's Bargain.",
      options: [],
      end: "success",
    },
    endCleared: {
      id: "endCleared",
      title: "The Warren Cleared",
      text: "The raids are over. Captain Roe pays the bounty and nods once, which from her is practically a hug. But the goblins' words follow you back to the Broken Lantern: pale ones in the deep tunnels, men in red, and the old stone house on the hill.",
      dmNotes: "Success ending without alliance.",
      options: [],
      end: "success",
    },
    routed: {
      id: "routed",
      title: "Routed",
      text: "You limp back to Emberfall bruised and poorer. Marta takes one look at you and pours without being asked. 'Goblins,' she says. 'Happens to the best of us. Mostly to the worst of us.' The bounty notice stays on the board.",
      options: [],
      end: "retreat",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// 3. The Drowned Chapel

const CHAPEL_MAP = [
  "###############",
  "#.....~~~.....#",
  "#.%...~~~...%.#",
  "#.....~~~.....#",
  "#..:::...:::..#",
  "#.............#",
  "#.%.........%.#",
  "#....~...~....#",
  "#.............#",
  "#.............#",
  "###############",
];
const CHAPEL_PARTY: [number, number][] = [[5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [7, 8]];
const CHAPEL_DEAD = [
  { monsterId: "skeleton", at: [2, 1] as [number, number] },
  { monsterId: "skeleton", at: [12, 1] as [number, number] },
  { monsterId: "skeleton", at: [7, 4] as [number, number] },
  { monsterId: "zombie", at: [4, 3] as [number, number] },
  { monsterId: "zombie", at: [10, 3] as [number, number] },
  { monsterId: "ghoul", at: [5, 2] as [number, number], name: "Drowned Deacon" },
];

export const chapel: Scenario = {
  id: "chapel",
  name: "The Drowned Chapel",
  hook: "Brother Oswin seeks brave souls to recover sacred relics from the Chapel of the Bell, lost beneath the Weeping Mere. Payment in coin and blessing.",
  summary: "Brother Oswin dreams of a drowned bell. In the hills, a flooded chapel of old Valdren holds the key to the Hollow King's tomb — and the restless dead who guard it.",
  location: "The Weeping Mere",
  recommendedLevel: [1, 2],
  arc: ARC,
  mapPosition: [72, 25],
  start: "shore",
  rewards: { xp: 250, gold: 30, effects: [{ kind: "material", id: "herbs", qty: 2 }, { kind: "material", id: "iron", qty: 2 }, { kind: "questCounter", counter: "scenarioDone", amount: 1 }], unlocks: ["hollowKing", "mill"] },
  nodes: {
    shore: {
      id: "shore",
      title: "The Weeping Mere",
      text: "The chapel rises from a still, black mere like a drowning man: a bell tower canted at a sick angle, stained glass long since shattered, the nave half-sunk in water the colour of strong tea. Mist clings to the surface. Every so often, from somewhere beneath the water, comes a single, muffled toll.",
      dmNotes: "The Chapel of the Bell was sealed when Aldric struck his bargain; the chapel's priests drowned it rather than let the king use its relic — the Ember Key — to wake himself early. The ghost of Sister Ilse, the last priest, still haunts it. The dead here are those who drowned with the chapel, stirred by the cult's ritual.",
      improv: { maxGold: 10, allowedItems: ["rope", "torch"], maxDc: 15 },
      options: [
        {
          id: "wade", label: "Wade through the cold water to the doors",
          check: { skill: "athletics", dc: 10, who: "group" },
          success: { text: "Waist-deep and gasping at the cold, you push through the mere to the chapel's great doors and haul yourselves onto the steps.", goto: "nave" },
          failure: { text: "The mud sucks at your boots and someone goes under, coming up choking on black water. You reach the doors frozen to the marrow.", goto: "nave", effects: [{ kind: "damage", dice: "1d4", type: "cold", who: "all" }] },
        },
        {
          id: "route", label: "Search for a dry path along the ruined causeway",
          check: { skill: "investigation", dc: 12, who: "best" },
          success: { text: "Beneath the mist you find the old causeway, its stones just below the surface. Along it, half-buried in silt, is a drowned pilgrim's satchel — with a sealed flask of holy water still inside.", goto: "nave", effects: [{ kind: "item", itemId: "holyWater", qty: 1 }] },
          failure: { text: "The 'causeway' you find is a rotten jetty that collapses beneath you. Soaked and muddy, you reach the doors anyway.", goto: "nave", effects: [{ kind: "damage", dice: "1d4", type: "cold", who: "chooser" }] },
        },
        {
          id: "raft", label: "Lash together a raft from fallen timber", hidden: true,
          check: { skill: "survival", dc: 11, who: "best" },
          success: { text: "Your makeshift raft carries you dry-shod to the chapel steps, and the spare timber will fetch a price back in Emberfall.", goto: "nave", effects: [{ kind: "material", id: "timber", qty: 1 }] },
          failure: { text: "The raft comes apart halfway across. Everyone swims.", goto: "nave", effects: [{ kind: "damage", dice: "1d4", type: "cold", who: "all" }] },
        },
      ],
    },
    nave: {
      id: "nave",
      title: "The Sunken Nave",
      text: "Inside, the nave is a cathedral of dripping shadow, its pews rotted into islands. Shapes lie still beneath the water — too still. At the far end, before a great bronze sluice-gate, a pale woman in a priest's habit stands on the surface of the water. She does not look at you. 'You should not have come,' she says, in a voice like a bell heard underwater. 'He is waking. They will wake too.'",
      dmNotes: "Sister Ilse is a ghost (narrative NPC, not hostile). She guards the Ember Key behind the sluice-gate. She will help those who promise to keep the Key from the cult, but she hides a guilt: she was the one who sealed the chapel with her brothers and sisters still inside.",
      npcs: [{ id: "ilse", name: "Sister Ilse", role: "Ghost of the chapel's last priest", personality: "Grave, sorrowful, fiercely protective of the Ember Key, haunted by guilt.", voice: "Formal, archaic, every sentence like a toll.", attitude: "indifferent", secrets: ["She drowned the chapel to stop King Aldric — with her own order still inside.", "The Ember Key can bind the Hollow King back into sleep — or wake him fully.", "Ringing the drowned bell would let the drowned dead rest."] }],
      improv: { maxGold: 10, allowedItems: ["torch"], maxDc: 15 },
      options: [
        {
          id: "talk", label: "Speak with the ghost",
          check: { skill: "religion", dc: 10, who: "best" },
          success: { text: "You offer the old rite of greeting to the dead. Sister Ilse turns, and for the first time her eyes — two drowned lamps — see you.", goto: "ilse" },
          failure: { text: "Your words fall flat. The ghost flickers — but stays, watching you.", goto: "ilse" },
        },
        { id: "press", label: "Ignore her and wade toward the sluice-gate", success: { text: "As you splash forward, the still shapes beneath the water begin to move.", goto: "dead" } },
      ],
    },
    ilse: {
      id: "ilse",
      title: "Sister Ilse",
      text: "'I am Ilse, last keeper of the Bell,' the ghost says. 'Beyond the gate lies the Ember Key. Men in red have come twice for it. They will come again. With it they can wake the King who would not die.' Her gaze sharpens. 'Swear to me you will not let them have it.'",
      dmNotes: "Make the oath matter. If the party sees through her (Insight), she confesses her guilt and asks them to ring the bell so the drowned can rest — a secret.",
      improv: { maxGold: 10, allowedItems: [], maxDc: 15 },
      options: [
        { id: "swear", label: "Swear the oath", success: { text: "The water around you shivers. 'Then go to the gate,' says Ilse, 'and may the Dawnfather guide your hands.'", goto: "puzzle", effects: [{ kind: "flag", flag: "ilseOath" }] } },
        {
          id: "insight", label: "Ask what she isn't telling you",
          check: { skill: "insight", dc: 13, who: "best" },
          success: { text: "Ilse's light gutters. 'It was I who opened the floodgates,' she whispers. 'My brothers and sisters were still at prayer. I drowned them to keep the Key from the King. They have not forgiven me.' She bows her head. 'If you ring the Bell, they may finally rest.'", goto: "puzzle", effects: [{ kind: "flag", flag: "ilseOath" }, { kind: "flag", flag: "ilseConfessed" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
          failure: { text: "Ilse's face is unreadable as drowned marble. 'Swear, or go,' she says.", goto: "puzzle" },
        },
      ],
    },
    puzzle: {
      id: "puzzle",
      title: "The Sluice-Gate",
      text: "The great bronze gate is engraved with a procession of bells, each a different size, and a prayer in old Valdren script. Behind it you hear the slosh of trapped water. There is a lever, rusted in place; a row of bronze bell-plates that can be struck; and the old prayer, waiting to be read.",
      dmNotes: "Multiple solutions: Religion (sing the prayer of opening), History (strike the bell-plates in the order of Valdren's royal funeral peal), Investigation (find the hidden counterweight), Athletics (force the lever). Failure makes noise and wakes the drowned dead.",
      improv: { maxGold: 10, allowedItems: ["rope"], maxDc: 15 },
      options: [
        {
          id: "prayer", label: "Sing the prayer engraved on the gate",
          check: { skill: "religion", dc: 13, who: "best" },
          success: { text: "Your voice echoes across the water, and the bronze bells on the gate hum in answer. With a long, grinding sigh, the gate rises.", goto: "reliquary" },
          failure: { text: "You stumble over the archaic words. The bells on the gate clang discordantly — and all around you, the drowned rise.", goto: "dead" },
        },
        {
          id: "peal", label: "Strike the bell-plates in the right order",
          check: { skill: "history", dc: 13, who: "best" },
          success: { text: "You recognise the procession: the royal funeral peal of Valdren. Struck in order, the plates ring clear, and the gate swings open.", goto: "reliquary" },
          failure: { text: "Wrong note. The plates shriek, and the dead answer the call.", goto: "dead" },
        },
        {
          id: "mechanism", label: "Search for the hidden mechanism",
          check: { skill: "investigation", dc: 12, who: "best" },
          success: { text: "Behind a loose stone lies a chain and counterweight. A quiet tug, and the gate lifts on silent pulleys.", goto: "reliquary" },
          failure: { text: "You pull the wrong chain. A grate drops, a bell tolls, and the water begins to churn with rising bodies.", goto: "dead" },
        },
        {
          id: "force", label: "Force the rusted lever",
          check: { skill: "athletics", dc: 14, who: "best" },
          success: { text: "With a scream of tortured bronze, the lever gives and the gate grinds open.", goto: "reliquary" },
          failure: { text: "The lever snaps with a sound like a cannon shot. Every dead thing in the chapel hears it.", goto: "dead", effects: [{ kind: "damage", dice: "1d6", type: "bludgeoning", who: "chooser" }] },
        },
      ],
    },
    dead: {
      id: "dead",
      title: "The Drowned Rise",
      text: "Water streams from rotted vestments as the drowned congregation stands up out of the mere — skeletal choristers with rusted blades, bloated monks, and a hunched, long-clawed thing in a deacon's stole that grins with too many teeth.",
      options: [],
      encounter: {
        id: "chapelDead", name: "The Drowned Congregation", map: CHAPEL_MAP, monsters: CHAPEL_DEAD, partyStart: CHAPEL_PARTY,
        objective: "Lay the drowned dead to rest.",
        scaling: { perExtraHero: "skeleton", perMissingHero: "zombie" },
        onVictory: { text: "The last of the drowned sinks back beneath the water. In the sudden quiet, the sluice-gate stands open — the struggle has shaken loose its rusted bars.", goto: "reliquary", effects: [{ kind: "questCounter", counter: "killUndead", amount: 6 }, { kind: "gold", amount: 10 }] },
        onDefeat: { text: "Cold hands drag you down into the dark water.", goto: "lost" },
      },
    },
    reliquary: {
      id: "reliquary",
      title: "The Ember Key",
      text: "Beyond the gate lies a dry reliquary, untouched for three hundred years. On a stone altar rests a key of blackened iron with a single ember of red light trapped in its bow — still warm. Above you, hanging in the flooded tower, is the great bronze Bell, its rope trailing into the water.",
      dmNotes: "Taking the Ember Key sets the chapelKey flag — in the finale it opens the Drowned Door into the keep's crypt. Ringing the bell lets the drowned rest (and pleases Ilse if she confessed). The reliquary also holds old offerings worth gold and materials.",
      improv: { maxGold: 25, allowedItems: ["holyWater", "potionHealing"], maxDc: 15 },
      options: [
        {
          id: "ring", label: "Take the Key and ring the Bell",
          check: { skill: "athletics", dc: 11, who: "best" },
          success: { text: "You haul on the sodden rope. The Bell speaks — a deep, clean note that rolls across the mere and through your bones. Behind you, Sister Ilse closes her eyes, and the water goes perfectly still. 'Thank you,' she whispers, and is gone.", goto: "end", effects: [{ kind: "flag", flag: "chapelKey" }, { kind: "flag", flag: "bellRung" }, { kind: "item", itemId: "holyWater", qty: 2 }, { kind: "reputation", amount: 1 }] },
          failure: { text: "The rope tears free and the Bell stays silent. You take the Key and go, with the uneasy sense of a debt unpaid.", goto: "end", effects: [{ kind: "flag", flag: "chapelKey" }] },
        },
        { id: "take", label: "Take the Key and the offerings, and leave", success: { text: "You pocket the Ember Key and sweep the old offerings into a sack: tarnished silver, Valdren coins, and a reliquary box of good bronze.", goto: "end", effects: [{ kind: "flag", flag: "chapelKey" }, { kind: "gold", amount: 20 }, { kind: "material", id: "relic", qty: 1 }] } },
        {
          id: "donate", label: "Leave the offerings for the temple, untouched", hidden: true,
          success: { text: "You leave the offerings for Brother Oswin to collect with proper rites. When you tell him, he weeps openly.", goto: "end", effects: [{ kind: "flag", flag: "chapelKey" }, { kind: "questCounter", counter: "donated", amount: 25 }, { kind: "reputation", amount: 2 }] },
        },
      ],
    },
    end: {
      id: "end",
      title: "Return to Emberfall",
      text: "Brother Oswin holds the Ember Key in trembling hands, then presses it back into yours. 'It was given to you,' he says. 'I dreamed it would be.' That night, for the first time in weeks, the young priest sleeps without dreaming of bells. You are not so lucky.",
      dmNotes: "Success ending. chapelKey flag set.",
      options: [],
      end: "success",
    },
    lost: {
      id: "lost",
      title: "Pulled from the Mere",
      text: "You wake on the shore, coughing up black water, with no memory of how you escaped the chapel. Wet footprints — bare, small, a woman's — lead away from you and end at the water's edge.",
      dmNotes: "Retreat ending. Sister Ilse dragged them out.",
      options: [],
      end: "retreat",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// 4. The Hollow King's Bargain (finale)

const THRONE_MAP = [
  "##################",
  "#.....#....#.....#",
  "#.....#....#.....#",
  "#..%..........%..#",
  "#................#",
  "#...::......::...#",
  "#................#",
  "#..%..........%..#",
  "#................#",
  "#.....~~~~~~.....#",
  "#................#",
  "#................#",
  "##################",
];
const THRONE_PARTY: [number, number][] = [[6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [8, 10]];

export const hollowKing: Scenario = {
  id: "hollowKing",
  name: "The Hollow King's Bargain",
  hook: "\"They're going to wake him. Under the old keep. Tonight.\" — scrawled on the back of the bounty board in Old Wren's hand",
  summary: "The Candle Cult means to wake Aldric, the Hollow King, beneath the ruined keep. With what you've learned from the goblins and the drowned chapel, you have one night to stop them.",
  location: "The Old Keep of Valdren",
  recommendedLevel: [2, 3],
  arc: ARC,
  mapPosition: [48, 12],
  requires: { scenarios: ["warren", "chapel"] },
  start: "road",
  rewards: {
    xp: 500, gold: 100,
    effects: [
      { kind: "flag", flag: "hollowCrownEnded" },
      { kind: "material", id: "iron", qty: 3 }, { kind: "material", id: "timber", qty: 2 }, { kind: "material", id: "relic", qty: 2 },
      { kind: "prosperity", amount: 2 }, { kind: "questCounter", counter: "scenarioDone", amount: 1 },
      // the fall of the Hollow King draws a holy warrior and a wandering lore-singer to the Broken Lantern
      { kind: "unlockClass", classId: "paladin" as ClassId }, { kind: "unlockClass", classId: "bard" as ClassId },
    ],
    unlocks: ["frostfall"],
  },
  nodes: {
    road: {
      id: "road",
      title: "Fog on the Hill",
      text: "The fog comes down from the old keep like something poured. Through it you glimpse the ruin: a broken crown of towers on the hilltop, and in its heart a ring of candles burning red. A low chant drifts down the slope, and under it, so faint you feel it more than hear it, a heartbeat that is not a heartbeat.",
      dmNotes: "The Candle Cult, led by the fanatic Mother Cendra, is performing the waking rite in the throne-crypt beneath the keep. The Hollow King (a wight) is already half-awake. Routes in: the front gate (sentries), the goblins' deep tunnels (requires goblinAllies), or the Drowned Door opened by the Ember Key (requires chapelKey). Nubb the goblin is a prisoner of the cult.",
      npcs: [{ id: "cendra", name: "Mother Cendra", role: "Leader of the Candle Cult (Cult Fanatic)", personality: "Serene, devout, utterly convinced the Hollow King will bring an age of order without death. Kind to her followers; merciless to everyone else.", voice: "Gentle, maternal, calls enemies 'little candles' that will gutter out.", attitude: "hostile", secrets: ["She was Marta's lieutenant in the Iron Bells, and the reason only Marta came out of the keep twenty years ago."] }],
      improv: { maxGold: 15, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        {
          id: "scout", label: "Scout the keep under cover of fog",
          check: { skill: "stealth", dc: 13, who: "group" },
          success: { text: "You circle the keep unseen and spot both a sentry post at the gate and a half-flooded culvert on the north side, sealed by a door marked with a key-shaped hollow.", goto: "gate", effects: [{ kind: "flag", flag: "scoutedKeep" }] },
          failure: { text: "A sentry's lantern swings toward you; you freeze in the bracken and wait, heart pounding, until it passes. Precious time is lost.", goto: "gate" },
        },
        {
          id: "goblins", label: "Meet Gritch's goblins at the deep tunnel", requires: { flag: "goblinAllies" },
          success: { text: "Gritch is waiting at a root-hole in the hillside with a dozen warriors, faces painted with ash. 'Deep way,' he says. 'Under the old stone. Nubb is there. We go together.'", goto: "tunnels" },
        },
        { id: "front", label: "Approach the front gate", success: { text: "You climb the broken road toward the gatehouse, where two figures in red robes stand guard.", goto: "gate" } },
      ],
    },
    gate: {
      id: "gate",
      title: "The Gatehouse",
      text: "Two cultists in red robes guard the shattered gatehouse, candles fixed to their brows with wax. Beyond them a spiral stair descends into the hill, glowing red. Somewhere below, the chanting rises.",
      dmNotes: "The Ember Key opens the Drowned Door on the north side (chapelKey). Deception works well — the cultists expect pilgrims. Failure means a scuffle that costs blood but still gets the party inside.",
      improv: { maxGold: 15, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        {
          id: "key", label: "Open the Drowned Door with the Ember Key", requires: { flag: "chapelKey" },
          success: { text: "The Ember Key slides into the hollow and turns with a sigh. The Drowned Door opens onto a dripping passage that leads straight down to the crypt — unseen and unguarded.", goto: "crypt" },
        },
        {
          id: "bluff", label: "Pose as late-arriving pilgrims",
          check: { skill: "deception", dc: 13, who: "best" },
          success: { text: "'Late, late, the King wakes tonight!' the sentry scolds, and waves you through with a beatific smile.", goto: "crypt" },
          failure: { text: "'You're not of the Candle.' A cultist lunges with a ritual sickle before you silence them both. The struggle is quick, but bloody.", goto: "crypt", effects: [{ kind: "damage", dice: "1d6", type: "slashing", who: "random" }] },
        },
        {
          id: "overpower", label: "Rush the sentries before they can cry out",
          check: { skill: "athletics", dc: 12, who: "best" },
          success: { text: "You're on them before they can scream. Two red robes are bundled into the bracken.", goto: "crypt" },
          failure: { text: "One sentry gets out a cry before you bring him down. Below, the chanting falters — then resumes, faster.", goto: "crypt", effects: [{ kind: "damage", dice: "1d6", type: "slashing", who: "chooser" }] },
        },
      ],
    },
    tunnels: {
      id: "tunnels",
      title: "The Deep Way",
      text: "Gritch's warriors lead you through tunnels barely tall enough to crouch in, past goblin chalk-marks and the gnawed bones of things you don't ask about. They stop at a crack in fitted stone, red light bleeding through. 'Old stone house,' Gritch whispers. 'Below the candle-men. When you say, we make big noise up top. They look away. You strike.'",
      dmNotes: "The goblins will create a diversion, drawing off most of the cult. The party arrives at the crypt with the option to strike with the goblins' help (reduced encounter).",
      improv: { maxGold: 10, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        { id: "on", label: "Thank Gritch and slip through the crack", success: { text: "Gritch grips your arm, then vanishes back into the dark to rouse his warriors. You slide through the crack into the crypt.", goto: "crypt", effects: [{ kind: "flag", flag: "goblinDiversion" }] } },
      ],
    },
    crypt: {
      id: "crypt",
      title: "The Throne-Crypt",
      text: "The crypt is a hall of black stone, lit by a thousand red candles. On a throne of fused bone sits a gaunt figure in a rusted crown, its eyes two coals slowly brightening. Before it, a serene woman in red — Mother Cendra — raises her arms as her followers chant, and at her feet, bound and gagged, struggles a small goblin. The Hollow King's fingers twitch on the armrest.",
      dmNotes: "The ritual is not complete. Options: attack now (full fight), signal the goblins for a diversion (reduced fight, requires goblinDiversion), disrupt the binding circle with Arcana/Religion (success = reduced fight as the backlash kills cultists; failure = full fight plus necrotic backlash), or the hidden option of bargaining with the Hollow King himself (a dark ending). Mother Cendra will monologue if asked a question.",
      npcs: [
        { id: "cendra", name: "Mother Cendra", role: "Cult Fanatic", personality: "Serene, devout, merciless.", voice: "Gentle, maternal, 'little candles'.", attitude: "hostile", secrets: ["She betrayed the Iron Bells, Marta's old company, to the Hollow King twenty years ago."] },
        { id: "aldric", name: "Aldric, the Hollow King", role: "Undead last king of Valdren (Wight)", personality: "Cold, proud, patient; speaks as though addressing subjects; despises the cult that serves him.", voice: "Dry whisper, royal 'we', every word like a closing tomb.", attitude: "hostile", secrets: ["His bargain was with Death itself: his kingdom's life for his. He would trade again."] },
        { id: "nubb", name: "Nubb", role: "Captive goblin youth, Gritch's nephew", personality: "Brave, furious, gagged.", attitude: "friendly" },
      ],
      improv: { maxGold: 20, allowedItems: ["potionHealing"], maxDc: 16 },
      options: [
        { id: "attack", label: "Attack before the ritual completes", success: { text: "You charge out of the dark. Mother Cendra turns, smiling. 'More candles for the King.' The Hollow King rises from his throne.", goto: "ritual" } },
        {
          id: "signal", label: "Signal the goblins to strike", requires: { flag: "goblinDiversion" },
          success: { text: "A goblin war-shriek echoes from the stairs above, followed by crashing and screams. Half the cult breaks and runs toward the noise — and you strike at the rest.", goto: "ritualAllied", effects: [{ kind: "questCounter", counter: "parley", amount: 1 }] },
        },
        {
          id: "disrupt", label: "Disrupt the binding circle",
          check: { skill: "arcana", dc: 14, who: "best" },
          success: { text: "You scuff one sigil and snuff three candles in the wrong order. The ritual's power recoils: two cultists collapse, smoking, and the Hollow King rises only half-awake, staggering.", goto: "ritualAllied", effects: [{ kind: "questCounter", counter: "secretsFound", amount: 1 }] },
          failure: { text: "The circle flares. A wave of grave-cold energy slams through you — and the Hollow King's eyes blaze fully awake.", goto: "ritual", effects: [{ kind: "damage", dice: "1d6", type: "necrotic", who: "all" }] },
        },
        {
          id: "bargain", label: "Speak to the Hollow King and offer a bargain", hidden: true,
          check: { skill: "persuasion", dc: 15, who: "best" },
          success: { text: "The King raises one withered hand, and the chant dies. 'A bargain,' he whispers. 'We remember bargains.' He turns his burning gaze on Mother Cendra.", goto: "kingsBargain" },
          failure: { text: "'We do not bargain with candles,' the King whispers, and rises.", goto: "ritual" },
        },
      ],
    },
    ritual: {
      id: "ritual",
      title: "The Hollow King Wakes",
      text: "The Hollow King rises, drawing a black sword from the bones of his throne, as Mother Cendra and her cultists close in with ritual blades.",
      options: [],
      encounter: {
        id: "hollowKingFull", name: "The Hollow King Wakes", map: THRONE_MAP, partyStart: THRONE_PARTY,
        monsters: [
          { monsterId: "wight", at: [8, 2], name: "Aldric, the Hollow King" },
          { monsterId: "cultFanatic", at: [5, 3], name: "Mother Cendra" },
          { monsterId: "cultist", at: [12, 4] },
          { monsterId: "cultist", at: [4, 5] },
          { monsterId: "cultist", at: [10, 6] },
        ],
        objective: "Destroy the Hollow King and break the cult.",
        scaling: { perExtraHero: "cultist", perMissingHero: "cultist" },
        onVictory: { text: "The Hollow King crumbles, his crown clattering empty on the stones. The red candles gutter out one by one.", goto: "triumph", effects: [{ kind: "questCounter", counter: "killUndead", amount: 1 }, { kind: "item", itemId: "diamond300", qty: 1 }, { kind: "item", itemId: "potionHealing", qty: 2 }] },
        onDefeat: { text: "The red light swallows everything.", goto: "fallen" },
      },
    },
    ritualAllied: {
      id: "ritualAllied",
      title: "Strike in the Dark",
      text: "With half the cult scattered, you face the Hollow King and his last two defenders — Mother Cendra has fled up the stairs with a curse.",
      options: [],
      encounter: {
        id: "hollowKingAllied", name: "Strike in the Dark", map: THRONE_MAP, partyStart: THRONE_PARTY,
        monsters: [
          { monsterId: "wight", at: [8, 2], name: "Aldric, the Hollow King" },
          { monsterId: "cultist", at: [5, 3] },
          { monsterId: "cultist", at: [12, 4] },
        ],
        objective: "Destroy the Hollow King before the cult regroups.",
        scaling: { perExtraHero: "cultist" },
        onVictory: { text: "The Hollow King falls, and the crypt goes dark and silent. From the stairs comes the sound of goblins cheering.", goto: "triumph", effects: [{ kind: "questCounter", counter: "killUndead", amount: 1 }, { kind: "item", itemId: "diamond300", qty: 1 }, { kind: "item", itemId: "potionHealing", qty: 1 }] },
        onDefeat: { text: "Cold fingers close around your throat.", goto: "fallen" },
      },
    },
    triumph: {
      id: "triumph",
      title: "The Crown Is Empty",
      text: "You free Nubb from his bonds, and the little goblin weeps and bites you in the same breath. When you climb out of the keep, dawn is breaking — and for the first time in twenty years, there is no fog on the hill. In Emberfall, Marta Ironbell climbs a ladder and lights the Broken Lantern. It doesn't stay lit long. It doesn't need to.",
      dmNotes: "Main success ending. Rewards include materials for town building and the hollowCrownEnded flag. Mother Cendra may have escaped (she fled in the allied version) — a hook for future arcs.",
      options: [],
      end: "success",
    },
    kingsBargain: {
      id: "kingsBargain",
      title: "A New Bargain",
      text: "The Hollow King listens to your terms, and then he smiles. With a gesture he unmakes Mother Cendra where she stands; her followers flee screaming. 'Our sleep for her waking,' he whispers, settling back onto his throne. 'Until next time, little candles.' His eyes dim. You leave the keep with Nubb, your lives, and the terrible certainty that you have made a deal you don't fully understand.",
      dmNotes: "Dark success ending: sets flag kingsBargainStruck. Aldric sleeps, the cult is broken, but the King owes the party — and they owe him. Future arcs should collect on this.",
      onEnter: [{ kind: "flag", flag: "kingsBargainStruck" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }],
      options: [],
      end: "success",
    },
    fallen: {
      id: "fallen",
      title: "The Long Night",
      text: "You wake in the bracken at the foot of the hill, dragged there by unseen hands — goblin hands, or a drowned priest's, or something worse. Above, the old keep blazes red, and the fog rolls down over Emberfall thicker than ever. The Hollow King is awake. Marta reads your names into her ledger — and then, slowly, crosses them out. 'Not yet,' she says. 'Not yet.'",
      dmNotes: "Failure ending. The scenario can be attempted again; the world should feel worse for it (more undead events, colder winter).",
      onEnter: [{ kind: "flag", flag: "hollowKingAwake" }],
      options: [],
      end: "failure",
    },
  },
};

export const SCENARIOS: Record<string, Scenario> = { cellar, warren, chapel, hollowKing, ...ARC2_SCENARIOS, ...SIDE_JOBS };
