// Arc 2: "The Frostbound Pass" (levels 3-5). Original content for the Emberfall Marches.
// The Hollow King has fallen (or been bargained back to sleep) — and the other half of Valdren's
// ancient bargain comes due. Winter arrives in high summer, and it is coming down the mountain.
// Maps: '#' wall, '.' floor, ':' difficult, '~' water/ice, 'O' pit, '+' door, '%' cover. Coordinates are [x, y].
import type { ClassId } from "../../types.js";
import type { Scenario } from "../types.js";

const ARC = "The Frostbound Pass";
/** Classes added by the rules expansion; typed loosely so content compiles independently. */
const cls = (id: string) => id as ClassId;

// ---------------------------------------------------------------------------------------------
// 1. Frostfall (level 3)

const HIGHCAIRN_MAP = [
  "################",
  "#..............#",
  "#.%%....::.....#",
  "#.%%....::..%..#",
  "#..............#",
  "#....####......#",
  "#....#..#..::..#",
  "#....#..#..::..#",
  "#..............#",
  "#..%........%..#",
  "################",
];
const HIGHCAIRN_PARTY: [number, number][] = [[1, 8], [2, 8], [3, 8], [1, 9], [2, 9], [1, 7]];

export const frostfall: Scenario = {
  id: "frostfall",
  name: "Frostfall",
  hook: "\"Snow in high summer, and the Highcairn folk at our gate with frost in their beards. Someone go up the pass and find out why.\" — Captain Sabine Roe",
  summary: "The morning after the Hollow Crown falls silent, Emberfall wakes to snow. Refugees from the shepherd village of Highcairn, at the foot of the Frostbound Pass, speak of neighbours frozen where they stood and great white wolves that talk.",
  location: "Highcairn, at the foot of the Frostbound Pass",
  recommendedLevel: [3, 3],
  arc: ARC,
  mapPosition: [44, 5],
  start: "firstFrost",
  rewards: {
    xp: 400, gold: 80,
    effects: [
      { kind: "flag", flag: "earlyWinter" },
      { kind: "unlockClass", classId: cls("monk") },
      { kind: "material", id: "timber", qty: 2 }, { kind: "material", id: "herbs", qty: 2 },
      { kind: "questCounter", counter: "frostbound", amount: 1 },
    ],
    unlocks: ["greyHounds", "pellsLedger", "festival"],
  },
  nodes: {
    firstFrost: {
      id: "firstFrost",
      title: "Snow in High Summer",
      text: "You wake to silence — the deep, padded silence of snow. It lies a hand deep on the Broken Lantern's sill in the middle of summer, and the ink in Marta's ledger has frozen in its pot. At the town gate a ragged column of shepherds from Highcairn huddles around a brazier, beards white with rime. Captain Sabine Roe stands among them looking as though she hasn't slept.",
      dmNotes: "The Hollow King's bargain had two halves: Aldric traded his kingdom's life to Death, and his queen, Ysmay, traded its warmth to Winter so that she could follow him. With the King silenced, the Winter half of the bargain has slipped its leash. Queen Ysmay — now the Rime Queen — wakes in her palace atop the Frostbound Pass and sends her Rime Knights and winter wolves south to find the Hollow Crown, which she believes will let her rejoin her husband. Grandmother Ottilie Brask saw a knight of blue ice speak to the wolves. The Grey Hounds mercenary company has already ridden north.",
      npcs: [
        { id: "ottilie", name: "Grandmother Ottilie Brask", role: "Eldest of Highcairn's shepherds", personality: "Tough as old leather, grieving, furious that no one believed her warnings about the 'cold that walks'.", voice: "Mountain burr, short sentences, spits after naming the Queen.", attitude: "friendly", secrets: ["Her grandmother's lullaby is about 'the Queen who went up the mountain to wait'. She still remembers the words."] },
        { id: "sabine", name: "Captain Sabine Roe", role: "Captain of the Emberfall watch", personality: "Hard, tired, honest.", voice: "Clipped, military.", attitude: "friendly" },
      ],
      improv: { maxGold: 10, allowedItems: ["potionHealing", "rations", "torch"], maxDc: 15 },
      options: [
        {
          id: "question", label: "Question the refugees about what they saw",
          check: { skill: "insight", dc: 12, who: "best" },
          success: { text: "Grandmother Ottilie looks you up and down, then talks. 'A knight made of ice, sat on a wolf the size of a cart-horse. It spoke to the wolves like a man speaks to hounds. And everywhere it rode, folk just... stopped.' She hums a few bars of an old lullaby, then stops herself. 'The Queen who went up the mountain to wait.'", goto: "road", effects: [{ kind: "flag", flag: "rimeKnightsKnown" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
          failure: { text: "The shepherds are too frozen and frightened to make much sense — something about wolves, something about a knight. You set out with more questions than answers.", goto: "road" },
        },
        {
          id: "tend", label: "Tend to the frostbitten before you go",
          check: { skill: "medicine", dc: 12, who: "best" },
          success: { text: "You warm hands and splint fingers until the worst of them can stand. Sabine watches, then nods once. 'Highcairn's at the head of the Kettle Road. Bring them back something better than this.'", goto: "road", effects: [{ kind: "reputation", amount: 1 }] },
          failure: { text: "You do what you can, but two of the old shepherds don't wake. It's a heavy start to the road.", goto: "road" },
        },
        { id: "go", label: "Set out for Highcairn at once", success: { text: "There's no time for talk. You buy what furs you can and take the Kettle Road north into the white.", goto: "road" } },
      ],
    },
    road: {
      id: "road",
      title: "The Kettle Road",
      text: "The Kettle Road climbs out of the Ashwood into bare hills, and the snow climbs with it — ankle, then knee, then thigh-deep in the drifts. The wind comes straight off the mountains and finds every gap in your cloaks. Twice you pass shapes by the roadside that you take for snowmen, until you see their faces.",
      dmNotes: "The frozen roadside figures are travellers caught by the Rime Knight. They are not dead — merely held, as if time stopped. A successful Arcana check can confirm this (hidden option).",
      improv: { maxGold: 10, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        {
          id: "push", label: "Push hard through the drifts",
          check: { skill: "survival", dc: 13, who: "group" },
          success: { text: "You find the old cairn-markers under the snow and follow them true. Highcairn's rooftops appear below the pass by late afternoon.", goto: "highcairn" },
          failure: { text: "You lose the road twice in the whiteout and arrive at dusk, numb to the bone.", goto: "highcairn", effects: [{ kind: "condition", condition: "exhaustion", who: "chooser" }] },
        },
        {
          id: "goatTrack", label: "Take Grandmother Ottilie's goat track", requires: { flag: "rimeKnightsKnown" },
          success: { text: "Ottilie's directions take you up a narrow goat track sheltered from the wind. You reach Highcairn with daylight to spare and the feeling back in your fingers.", goto: "highcairn" },
        },
        {
          id: "studyFrozen", label: "Study one of the frozen travellers", hidden: true, once: true,
          check: { skill: "arcana", dc: 13, who: "best" },
          success: { text: "Under the ice, the traveller's heart is still beating — once a minute, slow as a glacier. This isn't death. It's a held breath. Whatever froze them could thaw them.", goto: "highcairn", effects: [{ kind: "flag", flag: "frozenAlive" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
          failure: { text: "The ice is cold enough to burn. You learn nothing but the shape of your own fear.", goto: "highcairn", effects: [{ kind: "damage", dice: "1d4", type: "cold", who: "chooser" }] },
        },
      ],
    },
    highcairn: {
      id: "highcairn",
      title: "Highcairn",
      text: "Highcairn is a dozen stone crofts under the shoulder of the mountain, and it is full of statues. A woman frozen mid-stride with a bucket. A boy with his hand out to a dog that is frozen too. Enormous paw-prints circle the green. Above the village a bell tolls from a squat stone chapel — and between tolls, you hear children.",
      dmNotes: "Brother Yun of the Silent Cairn monastery came down to warn the village and was too late; he has barricaded the surviving children in the chapel. The winter wolves return every dusk.",
      improv: { maxGold: 15, allowedItems: ["potionHealing", "rations"], maxDc: 15 },
      options: [
        { id: "bell", label: "Follow the bell to the chapel", success: { text: "You climb to the chapel. The door is barred from inside, and a calm voice asks who you are.", goto: "monkHold" } },
        {
          id: "tracks", label: "Read the tracks on the green first",
          check: { skill: "survival", dc: 13, who: "best" },
          success: { text: "Three wolves — one enormous, its prints frosted at the edges as though it breathes winter. They come down from the pass at dusk and circle the chapel. Dusk is two hours away.", goto: "monkHold", effects: [{ kind: "flag", flag: "wolvesRead" }] },
          failure: { text: "The prints overlap into a muddle of claws. You climb to the chapel no wiser.", goto: "monkHold" },
        },
      ],
    },
    monkHold: {
      id: "monkHold",
      title: "The Bell-Keeper",
      text: "The door opens on a candle-lit chapel full of frightened children and one barefoot man in a grey robe who seems not to feel the cold at all. Brother Yun of the Silent Cairn bows. 'They come back at sunset,' he says quietly. 'I have rung the bell for three days so the little ones would know someone was still awake. I would be grateful to stop ringing it.'",
      dmNotes: "Yun is a monk from the Silent Cairn, the monastery high in the pass (now taken by the Rime Queen). He can fight, but won't leave the children. Fortifying the chapel weakens the wolves' assault (one fewer wolf). Luring the pack lets the party strike first.",
      npcs: [
        { id: "yun", name: "Brother Yun", role: "Monk of the Silent Cairn", personality: "Serene, gently funny, utterly steady. Hides deep grief: every one of his brothers was frozen when the Queen took the monastery.", voice: "Slow, warm, answers questions with small questions.", attitude: "friendly", secrets: ["The Silent Cairn was built to watch the Queen's tomb under the summit. The monks failed.", "He knows a hidden stair into the monastery."] },
      ],
      improv: { maxGold: 10, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        {
          id: "fortify", label: "Fortify the chapel yard before dusk",
          check: { skill: "athletics", dc: 13, who: "best" },
          success: { text: "You drag carts and hay-bales into a ring and soak them in lamp oil. When the wolves come at sunset, the biggest of them balks at the firelight and its packmate goes yelping off into the dark.", goto: "wolfFightFortified" },
          failure: { text: "The ground is frozen too hard to dig and the carts too heavy. The sun touches the peaks before you're half done.", goto: "wolfFight" },
        },
        {
          id: "lure", label: "Lure the pack into the open with the village's last sheep",
          check: { skill: "stealth", dc: 13, who: "group" },
          success: { text: "The sheep bleats on the green. The wolves come for it — and find you waiting in the drifts.", goto: "wolfFightAmbush" },
          failure: { text: "The great wolf smells you before it smells the sheep. It laughs — a horrible, human sound — and the pack comes straight for you.", goto: "wolfFight" },
        },
        { id: "wait", label: "Wait with Brother Yun and meet them at the door", success: { text: "You wait. The light goes amber, then blue, then gone. Out of the snow comes a sound like a man laughing through a wolf's throat.", goto: "wolfFight" } },
      ],
    },
    wolfFight: {
      id: "wolfFight",
      title: "Wolves at Dusk",
      text: "A winter wolf the size of a cart-horse pads out of the snow, breath smoking blue, two grey wolves at its flanks. 'More warm ones,' it says in a voice like cracking ice. 'The Queen will be pleased.'",
      options: [],
      encounter: {
        id: "frostfallWolves", name: "Wolves at Dusk", map: HIGHCAIRN_MAP, partyStart: HIGHCAIRN_PARTY,
        monsters: [
          { monsterId: "winterWolf", at: [10, 1], name: "Hrimfang" },
          { monsterId: "wolf", at: [12, 2] },
          { monsterId: "wolf", at: [13, 4] },
          { monsterId: "wolf", at: [14, 1] },
        ],
        objective: "Drive off the winter wolves.",
        scaling: { perExtraHero: "wolf", perMissingHero: "wolf" },
        onVictory: { text: "Hrimfang falls, and as it dies the blue light in its eyes goes out like a snuffed lamp. Across the village, the frozen statues creak — but do not move.", goto: "aftermath", effects: [{ kind: "material", id: "herbs", qty: 1 }] },
        onDefeat: { text: "The wolves drive you back into the chapel. Brother Yun holds the door while you drag the children out the back and down the mountain in the dark.", goto: "retreat" },
      },
    },
    wolfFightFortified: {
      id: "wolfFightFortified",
      title: "Fire and Frost",
      text: "The ring of burning carts keeps the night at bay. Only the winter wolf and a single grey wolf dare cross the flames, snarling, their fur steaming.",
      options: [],
      encounter: {
        id: "frostfallFortified", name: "Fire and Frost", map: HIGHCAIRN_MAP, partyStart: HIGHCAIRN_PARTY,
        monsters: [
          { monsterId: "winterWolf", at: [10, 1], name: "Hrimfang" },
          { monsterId: "wolf", at: [12, 2] },
        ],
        objective: "Hold the chapel yard.",
        scaling: { perExtraHero: "wolf" },
        onVictory: { text: "The great wolf dies in the firelight, hissing as its blood steams on the snow.", goto: "aftermath" },
        onDefeat: { text: "The fire gutters. You fall back into the chapel and flee with the children by the back way.", goto: "retreat" },
      },
    },
    wolfFightAmbush: {
      id: "wolfFightAmbush",
      title: "The Bait",
      text: "The pack falls on the sheep — and you fall on the pack.",
      options: [],
      encounter: {
        id: "frostfallAmbush", name: "The Bait", map: HIGHCAIRN_MAP, partyStart: HIGHCAIRN_PARTY, surprise: "enemy",
        monsters: [
          { monsterId: "winterWolf", at: [10, 1], name: "Hrimfang" },
          { monsterId: "wolf", at: [12, 2] },
          { monsterId: "wolf", at: [13, 4] },
          { monsterId: "wolf", at: [14, 1] },
        ],
        objective: "Kill the winter wolf before it rallies the pack.",
        scaling: { perExtraHero: "wolf", perMissingHero: "wolf" },
        onVictory: { text: "Caught off guard, the pack never recovers. Hrimfang dies with a curse on its tongue — and a name: 'Ysmay'.", goto: "aftermath", effects: [{ kind: "flag", flag: "queenNamed" }] },
        onDefeat: { text: "Even surprised, the winter wolf is too much. You flee with the children by moonlight.", goto: "retreat" },
      },
    },
    aftermath: {
      id: "aftermath",
      title: "Riders in the Snow",
      text: "As the children creep out of the chapel, hoofbeats crunch up the road: a dozen riders in grey wolf-pelts under a banner of a running hound. Their captain, a scarred man with a broken nose and a kind smile, looks at the dead wolves and whistles. 'Captain Varro Kade, the Grey Hounds. That's our bounty you've just skinned, friends. The Lord-Warden's man pays by the head.'",
      dmNotes: "The Grey Hounds were hired by Corvin Hask, the Lord-Warden's tax collector, to 'secure the pass'. Kade is pragmatic, not cruel; how the party treats him here sets up the next scenario. Persuasion earns houndsRespect.",
      npcs: [
        { id: "kade", name: "Captain Varro Kade", role: "Captain of the Grey Hounds mercenary company", personality: "Charming, practical, honest about being for hire. Protective of his people. Has no love for the man paying him.", voice: "Easy southern drawl, calls everyone 'friend', jokes when angry.", attitude: "indifferent", secrets: ["His client Corvin Hask is buying Valdren relics through a halfling middleman in Emberfall — Pell."] },
      ],
      improv: { maxGold: 15, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        {
          id: "share", label: "Offer to share the credit — and the danger",
          check: { skill: "persuasion", dc: 13, who: "best" },
          success: { text: "Kade laughs and clasps your arm. 'Fair's fair. You did the bleeding.' He tosses you a purse. 'Ride with us sometime. Or against us. Either way, I'll remember you.'", goto: "homeward", effects: [{ kind: "flag", flag: "houndsRespect" }, { kind: "gold", amount: 20 }, { kind: "questCounter", counter: "parley", amount: 1 }] },
          failure: { text: "Kade's smile doesn't reach his eyes. 'Generous of you, friend, to offer me what's already mine.' His riders take the wolf pelts and go.", goto: "homeward" },
        },
        {
          id: "warn", label: "Tell him to go back to Emberfall",
          check: { skill: "intimidation", dc: 14, who: "best" },
          success: { text: "Kade looks at the wolves, then at you, and decides this isn't the hill to die on. 'Keep the pelts, then.' The Hounds ride on up the pass.", goto: "homeward", effects: [{ kind: "flag", flag: "houndsRivals" }, { kind: "gold", amount: 15 }] },
          failure: { text: "Kade grins. 'Big words for tired folk.' The Hounds take the pelts anyway, and they'll remember the insult.", goto: "homeward", effects: [{ kind: "flag", flag: "houndsRivals" }] },
        },
        { id: "ignore", label: "Ignore them and see to the children", success: { text: "You turn your back on the Hounds and start counting children. Kade watches a moment, then tips his hat to Brother Yun and rides on north.", goto: "homeward" } },
      ],
    },
    homeward: {
      id: "homeward",
      title: "The Bell Falls Silent",
      text: "You lead the children of Highcairn down the Kettle Road to Emberfall, and Brother Yun comes with you. That night he sits by the Broken Lantern's fire and, for the first time in three days, sleeps. In the morning he asks Marta for a corner of the yard. 'Winter has come down the mountain,' he says. 'Someone should teach these people how to stand in it.'",
      dmNotes: "Success. Brother Yun opens a training circle in Emberfall: the Monk class is unlocked. The Grey Hounds and Pell's Ledger scenarios are revealed, along with the Long Night Festival side job.",
      options: [],
      end: "success",
    },
    retreat: {
      id: "retreat",
      title: "Down the Mountain in the Dark",
      text: "You reach Emberfall at dawn with the children and not much else. Behind you, Highcairn is lost to the snow. The bell has stopped ringing.",
      options: [],
      end: "retreat",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// 2. The Grey Hounds (levels 3-4)

const WAYSTATION_MAP = [
  "################",
  "#......#.......#",
  "#.%....#....%..#",
  "#......+.......#",
  "#......#.......#",
  "####.#####.#####",
  "#..............#",
  "#.::.......::..#",
  "#.::...%...::..#",
  "#..............#",
  "#..............#",
  "################",
];
const WAYSTATION_PARTY: [number, number][] = [[1, 9], [2, 9], [3, 9], [1, 10], [2, 10], [3, 10]];

export const greyHounds: Scenario = {
  id: "greyHounds",
  name: "The Grey Hounds",
  hook: "\"Whoever holds the Icebound Waystation holds the pass. The Lord-Warden's man has bought himself a company. Get there first.\" — Captain Sabine Roe",
  summary: "The only shelter on the Frostbound Pass is the old Icebound Waystation. Corvin Hask, the Lord-Warden's tax collector, has hired the Grey Hounds to seize it. A race up the mountain — and a chance to learn who's really paying.",
  location: "The Icebound Waystation, Frostbound Pass",
  recommendedLevel: [3, 4],
  arc: ARC,
  mapPosition: [60, 7],
  requires: { scenarios: ["frostfall"] },
  start: "contract",
  rewards: {
    xp: 450, gold: 90,
    effects: [
      { kind: "unlockClass", classId: cls("sorcerer") },
      { kind: "material", id: "iron", qty: 2 }, { kind: "material", id: "timber", qty: 1 },
      { kind: "questCounter", counter: "frostbound", amount: 1 },
    ],
    unlocks: ["glassMonastery"],
  },
  nodes: {
    contract: {
      id: "contract",
      title: "The Tax-Man's Company",
      text: "Captain Sabine spreads a map on the Broken Lantern's bar. 'Corvin Hask — the Lord-Warden's collector — has hired the Grey Hounds to take the Icebound Waystation. Officially to protect the pass. Unofficially?' She taps the map. 'Every relic hunter going north has to shelter there. Whoever holds it, taxes them. I want it in Emberfall's hands, not his.'",
      dmNotes: "Pell Quickwhistle will offer the party a shortcut for coin — ironically, he's also selling information to Hask's client. Forged orders from the Lord-Warden (hidden) would let the party arrive with authority.",
      npcs: [
        { id: "pell", name: "Pell Quickwhistle", role: "Halfling fence and rumour-broker", personality: "Cheerful, mercenary, nervous lately.", voice: "Fast patter, whistles between sentences.", attitude: "friendly", secrets: ["He sold the Hounds the same shortcut an hour ago."] },
      ],
      improv: { maxGold: 10, allowedItems: ["potionHealing", "rope"], maxDc: 15 },
      options: [
        {
          id: "race", label: "Race the Hounds up the pass",
          check: { skill: "athletics", dc: 13, who: "group" },
          success: { text: "You climb through the night and reach the Waystation an hour ahead of the Hounds' horses.", goto: "waystationFirst" },
          failure: { text: "The snow is deep and the Hounds are mounted. By the time you crest the ridge, their banner already flies over the Waystation.", goto: "waystationSecond" },
        },
        {
          id: "pell", label: "Pay Pell for a shortcut (10 gp)", requires: { gold: 10 },
          success: { text: "Pell pockets your coin with a whistle and sketches a smugglers' path. It's a good path. When you arrive, you notice fresh hoof-prints already on it.", goto: "waystationSecond", effects: [{ kind: "gold", amount: -10 }, { kind: "flag", flag: "pellDoubleSold" }] },
        },
        {
          id: "forge", label: "Forge orders from the Lord-Warden", hidden: true,
          check: { skill: "deception", dc: 15, who: "best" },
          success: { text: "With Sabine's seal and a little creative penmanship, you ride north carrying the Lord-Warden's 'authority'. You reach the Waystation first.", goto: "waystationFirst", effects: [{ kind: "flag", flag: "forgedOrders" }] },
          failure: { text: "The ink smudges in the cold. You set out anyway, late and with a worthless scrap of paper.", goto: "waystationSecond" },
        },
      ],
    },
    waystationFirst: {
      id: "waystationFirst",
      title: "First to the Waystation",
      text: "The Icebound Waystation is a squat stone hall half-buried in snow, its hearth long cold. Inside you find a dozen refugees — and a girl of perhaps fourteen sitting apart, sparks crawling between her fingers. You've barely lit the fire when the Grey Hounds ride up and find you holding the door.",
      dmNotes: "Arriving first means the Hounds must negotiate from outside. The girl is Ilka, a refugee whose draconic sorcery is awakening (see the 'storm' node).",
      onEnter: [{ kind: "flag", flag: "heldWaystation" }],
      options: [{ id: "face", label: "Step out to face Captain Kade", success: { text: "You step into the snow. Kade dismounts, smiling as if you were old friends.", goto: "standoff" } }],
    },
    waystationSecond: {
      id: "waystationSecond",
      title: "The Hounds' Banner",
      text: "The running-hound banner snaps over the Icebound Waystation. Grey Hounds man the walls with crossbows; refugees huddle in the yard, made to pay a silver each to come inside. Captain Kade strolls out to meet you, chewing a strip of dried beef.",
      options: [{ id: "face", label: "Hear what the captain has to say", success: { text: "'Friends,' says Kade. 'Come to bleed for a stone barn? Let's talk first.'", goto: "standoff" } }],
    },
    standoff: {
      id: "standoff",
      title: "Terms in the Snow",
      text: "Kade lays it out plainly. 'Hask pays us to hold this place. I don't love Hask — man would tax his mother's funeral. But a contract's a contract.' Behind him a grizzled lieutenant fingers a greatsword, and you notice a fat leather satchel of letters on his saddle.",
      dmNotes: "Paths: parley (easier with houndsRespect), Kade's challenge (a duel by Athletics), outright battle, or the hidden option to lift the letter-satchel while talking. The letters prove Hask is buying relics through Pell for a client who pays in old Valdren coin — the Rime Queen's agents.",
      npcs: [
        { id: "kade", name: "Captain Varro Kade", role: "Captain of the Grey Hounds", personality: "Charming, practical, honest about being for hire.", voice: "Easy drawl, 'friend'.", attitude: "indifferent", secrets: ["He's been unpaid for a month and suspects Hask is cheating him."] },
      ],
      improv: { maxGold: 15, allowedItems: ["potionHealing"], maxDc: 16 },
      options: [
        {
          id: "parley", label: "Convince Kade the Waystation should serve the refugees",
          check: { skill: "persuasion", dc: 15, who: "best" },
          success: { text: "Kade looks at the refugees for a long moment. 'Hask hasn't paid us in a month,' he admits. 'And I've a sister in Highcairn.'", goto: "pact" },
          failure: { text: "'Pretty speech,' says Kade. 'Doesn't pay my lads.' His lieutenant draws steel.", goto: "brawl" },
        },
        {
          id: "parleyRespect", label: "Remind Kade of Highcairn", requires: { flag: "houndsRespect" },
          check: { skill: "persuasion", dc: 11, who: "best" },
          success: { text: "Kade grins ruefully. 'You did the bleeding then, too. All right. Let's talk like people.'", goto: "pact" },
          failure: { text: "'Old debts don't pay new bills,' Kade sighs, and steps back to let his lieutenant forward.", goto: "brawl" },
        },
        {
          id: "duel", label: "Accept Kade's challenge: one champion each, first to yield",
          check: { skill: "athletics", dc: 15, who: "best" },
          success: { text: "You put Kade's lieutenant in a snowbank and hold a blade to his throat. The Hounds cheer — mercenaries love a good fight. Kade laughs and offers his hand.", goto: "pact", effects: [{ kind: "flag", flag: "duelWon" }] },
          failure: { text: "The lieutenant knocks your champion flat. 'Yield?' he asks. Your companions answer by drawing steel.", goto: "brawl", effects: [{ kind: "damage", dice: "2d4", type: "bludgeoning", who: "chooser" }] },
        },
        { id: "attack", label: "Attack", success: { text: "Talk is over. The Hounds draw steel with professional calm.", goto: "brawl" } },
        {
          id: "letters", label: "Lift the satchel of letters while Kade talks", hidden: true, once: true,
          check: { skill: "sleightOfHand", dc: 14, who: "best" },
          success: { text: "While Kade talks, you lift the satchel and riffle through it. Receipts — Hask buying Valdren relics through Pell Quickwhistle, paid in coins minted three hundred years ago.", goto: "lettersRead" },
          failure: { text: "The lieutenant catches your wrist. 'Thief!' Steel rings.", goto: "brawl" },
        },
      ],
    },
    lettersRead: {
      id: "lettersRead",
      title: "Old Coin",
      text: "The last letter is unsigned and written in frost-pale ink: 'Find the empty crown. The Lady pays in the coin of her kingdom.' Tucked inside is a single silver piece stamped with Queen Ysmay's face.",
      onEnter: [{ kind: "flag", flag: "pellExposed" }, { kind: "item", itemId: "relic", qty: 1 }, { kind: "questCounter", counter: "secretsFound", amount: 1 }],
      options: [
        { id: "show", label: "Show Kade the letters — his employer is working for the enemy", success: { text: "Kade reads them and goes very quiet. 'I don't fight for ghosts,' he says at last, and tears the Hask contract in two.", goto: "pact" } },
        { id: "fight", label: "Keep quiet and take the Waystation by force", success: { text: "You pocket the letters and draw steel.", goto: "brawl" } },
      ],
    },
    brawl: {
      id: "brawl",
      title: "Steel at the Waystation",
      text: "The Grey Hounds fight like professionals: crossbows on the wall, a veteran lieutenant with a greatsword in front, and Kade himself directing from the steps.",
      options: [],
      encounter: {
        id: "houndsBrawl", name: "Steel at the Waystation", map: WAYSTATION_MAP, partyStart: WAYSTATION_PARTY,
        monsters: [
          { monsterId: "warriorVeteran", at: [9, 3], name: "Lieutenant Brask Holloway" },
          { monsterId: "scout", at: [3, 1], name: "Hound Archer" },
          { monsterId: "scout", at: [12, 1], name: "Hound Archer" },
          { monsterId: "thug", at: [7, 7], name: "Hound Brawler" },
          { monsterId: "thug", at: [12, 6], name: "Hound Brawler" },
        ],
        objective: "Break the Grey Hounds' hold on the Waystation.",
        scaling: { perExtraHero: "scout", perMissingHero: "thug" },
        onVictory: { text: "Kade calls the retreat, dragging his wounded lieutenant into the snow. 'Enjoy the barn, friends,' he shouts. 'Hope it's worth it.' In the lieutenant's dropped satchel you find a bundle of letters.", goto: "spoils" },
        onDefeat: { text: "The Hounds throw you out into the snow and bar the door. Kade, at least, sends your gear out after you.", goto: "driven" },
      },
    },
    spoils: {
      id: "spoils",
      title: "The Satchel",
      text: "The letters are receipts — Corvin Hask buying Valdren relics through Pell Quickwhistle of Emberfall, paid in silver stamped with a queen three hundred years dead. The last, in frost-pale ink, reads: 'Find the empty crown.'",
      onEnter: [{ kind: "flag", flag: "pellExposed" }, { kind: "flag", flag: "houndsRivals" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }],
      options: [{ id: "on", label: "See to the refugees", success: { text: "You open the Waystation's doors to the shivering refugees.", goto: "storm" } }],
    },
    pact: {
      id: "pact",
      title: "A Contract Torn",
      text: "Kade and his Hounds throw in with you. The Waystation's doors open to the refugees, and the Hounds' lieutenant grudgingly hands over a satchel of letters: receipts for Valdren relics bought through Pell Quickwhistle, paid in the silver of a dead queen.",
      onEnter: [{ kind: "flag", flag: "houndsAllied" }, { kind: "flag", flag: "pellExposed" }, { kind: "questCounter", counter: "parley", amount: 1 }],
      options: [{ id: "on", label: "Settle in for the night", success: { text: "The Hounds share their brandy. Outside, the wind rises to a scream.", goto: "storm" } }],
    },
    storm: {
      id: "storm",
      title: "The Girl Who Holds the Storm",
      text: "In the deep of the night the blizzard comes down on the Waystation like a fist — and inside, the girl who sat apart begins to glow. Lightning crawls over her skin and arcs into the rafters. 'Make it stop,' she sobs. 'It always gets worse when it's cold.' The refugees scramble away from her.",
      dmNotes: "Ilka Stormborn: a refugee with a dragon's blood in her line, her sorcery waking under stress. Calming her (Insight, Persuasion, or Arcana via hidden option) unlocks the Sorcerer class either way — failure just hurts more.",
      npcs: [{ id: "ilka", name: "Ilka Stormborn", role: "Refugee girl with awakening draconic sorcery", personality: "Proud, frightened, fiercely protective of the younger refugees.", voice: "Fast, defiant, then very small.", attitude: "friendly", secrets: ["Her grandmother claimed a bronze dragon as an ancestor. Ilka thought it was a story."] }],
      improv: { maxGold: 5, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        {
          id: "calm", label: "Kneel beside her and talk her through it",
          check: { skill: "insight", dc: 13, who: "best" },
          success: { text: "You breathe with her, slow, until the lightning settles into her palms like a sleeping cat. She stares at her hands in wonder. 'I'm not cursed?' No. Just powerful.", goto: "end" },
          failure: { text: "The storm in her breaks loose before she can hold it — lightning lashes the hall — and then, exhausted, she slumps into your arms, the sparks gone quiet.", goto: "end", effects: [{ kind: "damage", dice: "1d6", type: "fire", who: "random" }] },
        },
        {
          id: "arcane", label: "Teach her to ground the power", hidden: true,
          check: { skill: "arcana", dc: 13, who: "best" },
          success: { text: "You show her how to let the charge run down into the stone. The Waystation's frozen hearth bursts into flame, and the refugees cheer.", goto: "end", effects: [{ kind: "questCounter", counter: "secretsFound", amount: 1 }] },
          failure: { text: "The lesson goes wrong in a flash and a bang that leaves everyone's ears ringing. But she's calmer, after.", goto: "end", effects: [{ kind: "damage", dice: "1d4", type: "fire", who: "chooser" }] },
        },
      ],
    },
    end: {
      id: "end",
      title: "The Waystation Holds",
      text: "By morning the blizzard has blown itself out and the Icebound Waystation is warm for the first time in a century. Ilka insists on coming back to Emberfall with you. 'If I'm going to be dangerous,' she says, 'I want to be dangerous on purpose.' And in your pack, the letters with Pell's name burn colder than the snow.",
      dmNotes: "Success: Sorcerer unlocked. Flags: houndsAllied or houndsRivals, pellExposed. The Glass Monastery is revealed once Pell's Ledger is also done.",
      options: [],
      end: "success",
    },
    driven: {
      id: "driven",
      title: "Out in the Cold",
      text: "You stumble back down the pass with frostbitten fingers. The Grey Hounds' banner flies over the Waystation, and Corvin Hask will be collecting his taxes by the week's end.",
      onEnter: [{ kind: "flag", flag: "c:houndsHoldPass" }],
      options: [],
      end: "retreat",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// 3. Pell's Ledger (level 4) — the betrayal

const TEMPLE_MAP = [
  "################",
  "#..............#",
  "#.%%..%..%..%%.#",
  "#..............#",
  "#.....::::.....#",
  "#.....::::.....#",
  "#..............#",
  "#.%..%....%..%.#",
  "#..............#",
  "#..............#",
  "################",
];
const TEMPLE_PARTY: [number, number][] = [[6, 9], [7, 9], [8, 9], [9, 9], [7, 8], [8, 8]];

export const pellsLedger: Scenario = {
  id: "pellsLedger",
  name: "Pell's Ledger",
  hook: "\"Midwinter feast tonight, in the middle of summer. Everyone will be at the square. Somebody ought to stay sober.\" — Old Wren",
  summary: "Emberfall holds a midwinter feast in a summer gone mad. But someone in town has been selling Valdren's secrets — and the empty Hollow Crown, kept in the Temple of the Dawnfather, has a buyer.",
  location: "Emberfall",
  recommendedLevel: [4, 4],
  arc: ARC,
  mapPosition: [52, 48],
  requires: { scenarios: ["frostfall"] },
  start: "feast",
  rewards: {
    xp: 500, gold: 60,
    effects: [
      { kind: "unlockClass", classId: cls("warlock") },
      { kind: "material", id: "relic", qty: 1 }, { kind: "material", id: "iron", qty: 1 },
      { kind: "questCounter", counter: "frostbound", amount: 1 },
    ],
    unlocks: ["glassMonastery"],
  },
  nodes: {
    feast: {
      id: "feast",
      title: "Midwinter in Summer",
      text: "Emberfall has decided that if winter insists on coming in summer, it can have a feast. Lanterns hang from every eave, the square smells of roast chestnuts, and a fiddler plays too fast to dance to. Old Wren catches your sleeve at the tavern door. 'Pell's shop is dark tonight,' she murmurs. 'Pell has never once missed a feast with free food.'",
      dmNotes: "Pell Quickwhistle has sold the Rime Queen's agents the location of the Hollow Crown (in the temple's reliquary) and the watch rotation. His motive: the 'Pale Lady' promised to return his sister, lost to the fog years ago. Tonight a Rime Knight and ice mephits strike the temple. Pell is there, trying at the last moment to steal the crown back.",
      npcs: [{ id: "wren", name: "Old Wren", role: "Hermit lore-keeper", personality: "Ancient, sharp, riddling.", voice: "'Once, long ago...'", attitude: "friendly", secrets: ["She can feel the Queen waking. It makes her bones ache."] }],
      improv: { maxGold: 10, allowedItems: ["potionHealing", "torch"], maxDc: 15 },
      options: [
        { id: "confront", label: "Go straight to Pell's shop — you've seen the letters", requires: { flag: "pellExposed" }, success: { text: "You leave the music behind and head for Pell's shop with the letters in your fist.", goto: "pellShop" } },
        {
          id: "investigate", label: "Slip away and look around Pell's shop",
          check: { skill: "investigation", dc: 14, who: "best" },
          success: { text: "The lock has been picked from the inside — Pell left in a hurry. Inside you find his ledger, and it is not a ledger of trade.", goto: "pellShop" },
          failure: { text: "You find the shop and nothing in it but dust — until a scream from the temple tears through the feast music.", goto: "templeRaid" },
        },
        { id: "temple", label: "Keep watch on the temple", success: { text: "You settle in on the temple steps with a cup of mulled wine. You're halfway down it when the temperature drops twenty degrees in a breath.", goto: "templeRaid" } },
      ],
    },
    pellShop: {
      id: "pellShop",
      title: "The Ledger",
      text: "Pell's ledger lists every relic he ever sold — and, on the last pages, payments to 'the Pale Lady': the temple's patrol hours, the reliquary key, the Hollow Crown. Pressed between the pages is a contract on skin-thin vellum, signed in Pell's blood. When you touch it, a voice like a warm coal whispers your name and offers you a better deal.",
      dmNotes: "The vellum is a fiendish contract: Pell bargained for help from a fiend to find his sister, and the fiend introduced him to the Queen's agents. The contract offers to bargain with the reader too — this is how the Warlock class enters the campaign. Accepting has no mechanical cost here (narrative); refusing and burning it is equally fine.",
      onEnter: [{ kind: "flag", flag: "ledgerFound" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }],
      improv: { maxGold: 20, allowedItems: ["potionHealing", "antitoxin"], maxDc: 15 },
      options: [
        { id: "burn", label: "Burn the contract and run for the temple", success: { text: "The vellum screams as it burns. Somewhere far away, something laughs. Then the temple bell begins to ring wildly.", goto: "templeRaid" } },
        { id: "keep", label: "Pocket the contract — it might be useful — and run for the temple", success: { text: "The vellum is warm in your pocket, like a hand. The temple bell begins to ring wildly.", goto: "templeRaid", effects: [{ kind: "flag", flag: "contractKept" }] } },
      ],
    },
    templeRaid: {
      id: "templeRaid",
      title: "Ice in the Sanctuary",
      text: "Frost races across the temple floor. The braziers gutter blue. Through the shattered windows pour snarling ice mephits, and behind them strides a knight in armour of solid blue ice, a sword of rime in his hand. Brother Oswin lies bleeding by the altar — and crouched behind the reliquary, clutching the empty Hollow Crown to his chest, is Pell Quickwhistle, white with terror.",
      npcs: [
        { id: "haldric", name: "Sir Haldric", role: "Rime Knight of the Queen", personality: "Courtly, cold, sorrowful; still bound by oaths three hundred years old.", voice: "Formal old Valdren, addresses everyone as 'subject'.", attitude: "hostile" },
        { id: "pell", name: "Pell Quickwhistle", role: "Halfling fence and traitor", personality: "Desperate, ashamed, still trying to make it right.", voice: "Babbling, no whistle now.", attitude: "friendly" },
      ],
      improv: { maxGold: 5, allowedItems: ["potionHealing"], maxDc: 15 },
      options: [
        { id: "defend", label: "Defend the temple", success: { text: "You put yourselves between the knight and the reliquary.", goto: "raidFight" } },
        {
          id: "oswin", label: "Get to Brother Oswin before he bleeds out",
          check: { skill: "medicine", dc: 13, who: "best" },
          success: { text: "You bind Oswin's wound in a few heartbeats. He presses his holy symbol into your hand. 'The Dawnfather is with you,' he gasps — and warmth floods through you.", goto: "raidFight", effects: [{ kind: "heal", dice: "2d4", who: "all" }, { kind: "flag", flag: "oswinSaved" }] },
          failure: { text: "You can't stop the bleeding in time. Oswin's eyes flutter closed — breathing, barely. You turn to fight with his blood on your hands.", goto: "raidFight" },
        },
      ],
    },
    raidFight: {
      id: "raidFight",
      title: "The Rime Knight",
      text: "Sir Haldric raises his sword in a frozen salute. 'The crown belongs to my Queen, subjects. Stand aside or stand forever.'",
      options: [],
      encounter: {
        id: "templeRaid", name: "The Rime Knight", map: TEMPLE_MAP, partyStart: TEMPLE_PARTY,
        monsters: [
          { monsterId: "rimeKnight", at: [8, 1], name: "Sir Haldric" },
          { monsterId: "iceMephit", at: [3, 1] },
          { monsterId: "iceMephit", at: [12, 1] },
          { monsterId: "iceMephit", at: [5, 3] },
          { monsterId: "iceMephit", at: [11, 3] },
          { monsterId: "iceMephit", at: [14, 4] },
        ],
        objective: "Destroy the Rime Knight and save the Hollow Crown.",
        scaling: { perExtraHero: "iceMephit", perMissingHero: "iceMephit" },
        onVictory: { text: "Sir Haldric falls to one knee, his armour cracking like a frozen lake. 'Tell her,' he whispers, 'that I kept faith.' Then he is only meltwater. The Hollow Crown is still in Pell's shaking hands.", goto: "pellsFate", effects: [{ kind: "item", itemId: "potionGreaterHealing", qty: 1 }] },
        onDefeat: { text: "The frost takes you. When you wake, the reliquary is empty, and so is the place where Pell was hiding.", goto: "crownLost" },
      },
    },
    pellsFate: {
      id: "pellsFate",
      title: "Pell's Confession",
      text: "Pell holds out the crown with both hands. 'She said she'd give my sister back,' he whispers. 'Mira. The fog took her eleven years ago. The Pale Lady said the fog was hers — that she could open her hand and give her back.' Captain Sabine arrives with the watch, sword drawn. 'He sold this town to a dead woman,' she says. 'It's your call. You bled for it.'",
      dmNotes: "The moral choice of the arc. Turning Pell (if trusted) opens a secret route in the finale (flag pellTurned). Handing him to Sabine is justice (pellJailed). Exile is mercy (pellExiled). Failed trust means Pell flees north to the Queen (pellFled) — he may reappear.",
      improv: { maxGold: 0, allowedItems: [], maxDc: 16 },
      options: [
        { id: "jail", label: "Hand Pell to Captain Sabine", success: { text: "Pell doesn't fight. Sabine's watchmen take him away, and he doesn't look back. The town will talk about this for years.", goto: "dawn", effects: [{ kind: "flag", flag: "pellJailed" }, { kind: "reputation", amount: 1 }] } },
        {
          id: "turn", label: "Spare him — on condition he feeds the Queen's agents lies",
          check: { skill: "insight", dc: 14, who: "best" },
          success: { text: "You read him true: the shame is real. 'Anything,' Pell says. 'Anything to make it right.' Sabine spits, but sheathes her sword. Pell knows the route the Queen's agents use to reach her palace — and now so do you.", goto: "dawn", effects: [{ kind: "flag", flag: "pellTurned" }, { kind: "questCounter", counter: "parley", amount: 1 }] },
          failure: { text: "You let him go. By morning he's gone north with the snow — to the Queen, or to his sister, or to nothing at all.", goto: "dawn", effects: [{ kind: "flag", flag: "pellFled" }] },
        },
        { id: "exile", label: "Exile him from Emberfall", success: { text: "'Go,' you tell him. 'Don't come back.' Pell nods, and walks south into the dark with nothing but the clothes on his back.", goto: "dawn", effects: [{ kind: "flag", flag: "pellExiled" }] } },
      ],
    },
    dawn: {
      id: "dawn",
      title: "Cold Dawn",
      text: "Dawn comes grey over the temple. Brother Oswin lives, or doesn't. The Hollow Crown goes back into the reliquary under triple guard. And somewhere on the mountain, a queen three hundred years dead learns that her knight has fallen — and that the warm ones of Emberfall will not give her what she wants without a fight.",
      dmNotes: "Success: Warlock unlocked (the fiend's contract has found other readers in Emberfall). The Glass Monastery is revealed once The Grey Hounds is also complete.",
      options: [],
      end: "success",
    },
    crownLost: {
      id: "crownLost",
      title: "The Empty Reliquary",
      text: "The Hollow Crown is gone north. Pell is gone with it. Brother Oswin, pale and bandaged, rings the temple bell for the dead — and the snow keeps falling.",
      onEnter: [{ kind: "flag", flag: "c:crownTaken" }],
      options: [],
      end: "failure",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// 4. The Glass Monastery (levels 4-5) — the moral choice

const MONASTERY_MAP = [
  "#################",
  "#...............#",
  "#.%..~~~...%....#",
  "#....~~~........#",
  "#...............#",
  "#..::......::...#",
  "#..::......::...#",
  "#.......%.......#",
  "#...............#",
  "#.%...........%.#",
  "#...............#",
  "#################",
];
const MONASTERY_PARTY: [number, number][] = [[6, 10], [7, 10], [8, 10], [9, 10], [7, 9], [8, 9]];

export const glassMonastery: Scenario = {
  id: "glassMonastery",
  name: "The Glass Monastery",
  hook: "\"The Silent Cairn watched the Queen's tomb for three hundred years. Now it is hers. Under it lies the thing that keeps Valdren's dead warm. Help me take it back.\" — Brother Yun",
  summary: "High on the Frostbound Pass, the monastery of the Silent Cairn has been sealed in ice. Beneath it lies the Ember Heart — the hearthstone of Valdren, where the spirits of the kingdom's dead shelter. The Rime Queen has frozen it. What you do with it will shape the end of winter.",
  location: "The Silent Cairn, high on the Frostbound Pass",
  recommendedLevel: [4, 5],
  arc: ARC,
  mapPosition: [52, 3],
  requires: { scenarios: ["greyHounds", "pellsLedger"] },
  start: "ascent",
  rewards: {
    xp: 550, gold: 120,
    effects: [
      { kind: "material", id: "relic", qty: 1 }, { kind: "material", id: "herbs", qty: 2 }, { kind: "material", id: "iron", qty: 1 },
      { kind: "questCounter", counter: "frostbound", amount: 1 },
    ],
    unlocks: ["rimeQueen"],
  },
  nodes: {
    ascent: {
      id: "ascent",
      title: "The High Road",
      text: "Above the Icebound Waystation the pass narrows to a ledge between a cliff and nothing. The wind sings in the rocks. Ahead, the Silent Cairn clings to the mountain like a swallow's nest — and it glitters, every stone of it sheathed in ice as clear as glass.",
      dmNotes: "The Grey Hounds (if allied) know a sheltered route. Brother Yun knows a hidden stair (requires asking him — hidden option). The cliff path is dangerous; the ice caves are slower but safe.",
      npcs: [{ id: "yun", name: "Brother Yun", role: "Monk of the Silent Cairn", personality: "Serene, gently funny, grieving.", voice: "Slow, warm.", attitude: "friendly", secrets: ["A hidden stair runs up through the rock to the monastery's well-house."] }],
      improv: { maxGold: 10, allowedItems: ["potionHealing", "rope"], maxDc: 16 },
      options: [
        {
          id: "cliff", label: "Climb the cliff path",
          check: { skill: "athletics", dc: 14, who: "group" },
          success: { text: "Hand over hand along the ledge, roped together, you reach the monastery gate before the sun crests the peaks.", goto: "gate" },
          failure: { text: "A shelf of ice gives way. Someone falls — and the rope holds, barely. You reach the gate battered and late.", goto: "gate", effects: [{ kind: "damage", dice: "2d4", type: "bludgeoning", who: "random" }] },
        },
        {
          id: "hounds", label: "Let the Grey Hounds guide you", requires: { flag: "houndsAllied" },
          success: { text: "Kade's scouts know a sheltered gully the wind can't reach. 'Least we can do, friends,' he says, and presses a flask of something fiery into your hands.", goto: "gate", effects: [{ kind: "item", itemId: "potionHealing", qty: 1 }] },
        },
        {
          id: "stair", label: "Ask Brother Yun if there's another way in", hidden: true,
          success: { text: "Yun smiles for the first time in days. 'There is a stair. It comes up in the well-house. Novices used it to sneak down to the village for honey cakes.' You emerge inside the walls, unseen.", goto: "courtyardAmbush", effects: [{ kind: "questCounter", counter: "secretsFound", amount: 1 }] },
        },
      ],
    },
    gate: {
      id: "gate",
      title: "The Glass Gate",
      text: "The monastery gate is a sheet of ice a foot thick. Through it, distorted like a dream, you see the courtyard: monks frozen mid-prayer, ice mephits darting between them like bats, and two great white shapes — rimebacks — asleep in the snow.",
      improv: { maxGold: 10, allowedItems: ["potionHealing"], maxDc: 16 },
      options: [
        {
          id: "sneak", label: "Find a gap in the ice and slip in",
          check: { skill: "stealth", dc: 14, who: "group" },
          success: { text: "You squeeze through a crack in the ice where a window used to be. The rimebacks never stir until you're on them.", goto: "courtyardAmbush" },
          failure: { text: "Someone's boot cracks the ice like a gunshot. The rimebacks wake, roaring.", goto: "courtyard" },
        },
        { id: "break", label: "Smash through the gate", success: { text: "The gate shatters in a storm of glittering shards. Every creature in the courtyard turns toward you.", goto: "courtyard" } },
      ],
    },
    courtyard: {
      id: "courtyard",
      title: "The Frozen Courtyard",
      text: "The rimebacks charge across the courtyard between the frozen monks, and the ice mephits shriek down from the eaves.",
      options: [],
      encounter: {
        id: "monasteryCourtyard", name: "The Frozen Courtyard", map: MONASTERY_MAP, partyStart: MONASTERY_PARTY,
        monsters: [
          { monsterId: "rimeback", at: [4, 2] },
          { monsterId: "rimeback", at: [13, 3] },
          { monsterId: "iceMephit", at: [9, 1] },
          { monsterId: "iceMephit", at: [2, 4] },
          { monsterId: "iceMephit", at: [14, 5] },
        ],
        objective: "Clear the courtyard.",
        scaling: { perExtraHero: "iceMephit", perMissingHero: "iceMephit" },
        onVictory: { text: "The last rimeback crashes into the snow. In the silence, you hear something under the monastery: a slow, enormous heartbeat, muffled by ice.", goto: "heartChamber" },
        onDefeat: { text: "The rimebacks drive you off the mountain. You slide and tumble halfway to the Waystation before the slope lets you stop.", goto: "retreatCold" },
      },
    },
    courtyardAmbush: {
      id: "courtyardAmbush",
      title: "Strike in the Snow",
      text: "You come at the sleeping beasts out of the snow.",
      options: [],
      encounter: {
        id: "monasteryAmbush", name: "Strike in the Snow", map: MONASTERY_MAP, partyStart: MONASTERY_PARTY, surprise: "enemy",
        monsters: [
          { monsterId: "rimeback", at: [4, 2] },
          { monsterId: "rimeback", at: [13, 3] },
          { monsterId: "iceMephit", at: [9, 1] },
          { monsterId: "iceMephit", at: [2, 4] },
          { monsterId: "iceMephit", at: [14, 5] },
        ],
        objective: "Clear the courtyard before the beasts recover.",
        scaling: { perExtraHero: "iceMephit", perMissingHero: "iceMephit" },
        onVictory: { text: "The courtyard is yours. Beneath your feet, something vast and slow is beating.", goto: "heartChamber" },
        onDefeat: { text: "The ambush turns against you. You flee down the hidden stair.", goto: "retreatCold" },
      },
    },
    heartChamber: {
      id: "heartChamber",
      title: "The Ember Heart",
      text: "Under the monastery, in a vault carved with the crowned bells of Valdren, sits a stone the size of a hearth — and it is burning, deep inside the ice that encases it, with a dim and stubborn red. Around it, in the ice, are faces. Hundreds. The dead of Valdren, sheltering in the last warmth of their kingdom. Brother Yun kneels. 'If the Heart goes out,' he says softly, 'they go with it. If it burns free... I do not know what the Queen will do.'",
      dmNotes: "THE MORAL CHOICE (lasting flags). Shatter: ends the Queen's grip on the pass quickly (finale is easier to reach) but scatters the spirits forever (heartShattered). Carry it south: the spirits are saved and the Heart can be turned on the Queen in the finale (heartCarried). Hidden: rekindle it here with fire magic or prayer — the best outcome (heartRekindled), but hard.",
      npcs: [{ id: "yun", name: "Brother Yun", role: "Monk of the Silent Cairn", personality: "Serene, grieving.", voice: "Slow, warm.", attitude: "friendly" }],
      improv: { maxGold: 20, allowedItems: ["potionHealing"], maxDc: 18 },
      options: [
        {
          id: "shatter", label: "Shatter the Heart — break the Queen's hold now",
          success: { text: "You bring the stone down on the ice. The Heart breaks with a sound like every bell in Valdren ringing at once, and the faces in the ice scatter like sparks up a chimney — free, or gone, you will never know. On the mountain, the wind falters. The Queen screams.", goto: "descent", effects: [{ kind: "flag", flag: "heartShattered" }, { kind: "prosperity", amount: 1 }] },
        },
        {
          id: "carry", label: "Carry the Heart south, spirits and all",
          check: { skill: "athletics", dc: 14, who: "best" },
          success: { text: "You cut the Heart free and lash it to a sledge. It's warm through the ice — warm enough to keep your hands from freezing all the way down. The faces watch you, and some of them, you'd swear, are smiling.", goto: "descent", effects: [{ kind: "flag", flag: "heartCarried" }] },
          failure: { text: "The Heart is heavier than any stone should be, and the cold that surrounds it bites to the bone. You get it free in the end, at a price.", goto: "descent", effects: [{ kind: "flag", flag: "heartCarried" }, { kind: "damage", dice: "2d6", type: "cold", who: "all" }] },
        },
        {
          id: "rekindle", label: "Rekindle the Heart where it lies", hidden: true, once: true,
          check: { skill: "religion", dc: 16, who: "best" },
          success: { text: "You pour warmth into the stone — prayer, fire, or plain stubbornness — and the ice around the Heart turns to steam. The faces sigh. The Silent Cairn's frozen monks blink, gasp, and fall to their knees, alive. Brother Yun weeps openly.", goto: "descent", effects: [{ kind: "flag", flag: "heartRekindled" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }, { kind: "reputation", amount: 2 }] },
          failure: { text: "The Heart flickers, but the ice is stronger. You will have to choose another way.", goto: "heartChamber", effects: [{ kind: "damage", dice: "1d6", type: "cold", who: "chooser" }] },
        },
      ],
    },
    descent: {
      id: "descent",
      title: "The Way Down",
      text: "You leave the Silent Cairn as the sun sets. Above you, on the summit, a palace of ice catches the last of the light, and from it a voice carries on the wind — a woman's voice, singing the lullaby Grandmother Ottilie hummed. The Queen knows you are coming.",
      dmNotes: "Success. The finale, The Queen Beneath the Ice, is revealed.",
      options: [],
      end: "success",
    },
    retreatCold: {
      id: "retreatCold",
      title: "Driven From the Heights",
      text: "Bruised and half-frozen, you shelter at the Waystation and watch the monastery glitter mockingly above. You will have to try again.",
      options: [],
      end: "retreat",
    },
  },
};

// ---------------------------------------------------------------------------------------------
// 5. The Queen Beneath the Ice (level 5) — finale

const THRONE_ICE_MAP = [
  "##################",
  "#................#",
  "#..%..........%..#",
  "#................#",
  "#.....~~~~~~.....#",
  "#.....~....~.....#",
  "#.....~~~~~~.....#",
  "#................#",
  "#..::........::..#",
  "#................#",
  "#................#",
  "##################",
];
const THRONE_ICE_PARTY: [number, number][] = [[6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10]];

export const rimeQueen: Scenario = {
  id: "rimeQueen",
  name: "The Queen Beneath the Ice",
  hook: "\"She went up the mountain to wait for him. She has waited long enough.\" — Grandmother Ottilie Brask",
  summary: "Queen Ysmay of Valdren, the Rime Queen, holds court in a palace of ice on the summit of the Frostbound Pass. End her winter — by the sword, by the Ember Heart, or by giving a three-hundred-year-old widow the one thing she wants.",
  location: "The Rime Palace, summit of the Frostbound Pass",
  recommendedLevel: [5, 5],
  arc: ARC,
  mapPosition: [48, 1],
  requires: { scenarios: ["glassMonastery"] },
  start: "summit",
  rewards: {
    xp: 900, gold: 250,
    effects: [
      { kind: "flag", flag: "frostboundEnded" },
      { kind: "material", id: "relic", qty: 2 }, { kind: "material", id: "iron", qty: 3 }, { kind: "material", id: "timber", qty: 3 },
      { kind: "prosperity", amount: 3 },
      { kind: "questCounter", counter: "frostbound", amount: 1 },
    ],
    unlocks: [],
  },
  nodes: {
    summit: {
      id: "summit",
      title: "The Rime Palace",
      text: "The palace grows out of the summit like frost on a window: spires of blue ice, halls you can see through, and at its heart a throne room where something sits very still. The snow here doesn't fall; it hangs in the air, waiting. The only sound is the lullaby, sung over and over by a voice that has forgotten every other song.",
      dmNotes: "Routes in: the main stair (Rime Knights stand aside — the Queen wants to see who comes), the Grey Hounds' charge (houndsAllied), or Pell's route (pellTurned). The Queen will talk before she fights. What she wants: the Hollow Crown, to lie beside Aldric. If the crown was stolen (c:crownTaken) she already wears it and can't be bargained with this way.",
      npcs: [{ id: "ysmay", name: "Queen Ysmay, the Rime Queen", role: "Undead queen of Valdren, Aldric's widow", personality: "Regal, lonely, terrifyingly patient. She is not cruel so much as finished with warmth. Loves her husband still; hates that he chose Death over her.", voice: "Soft, formal, sings when she isn't speaking. Says 'we' like Aldric did.", attitude: "hostile", secrets: ["She bargained Valdren's warmth to Winter so she could outlast death and wait for Aldric. He never came.", "With the Hollow Crown she could lie down beside him — and her winter would end."] }],
      improv: { maxGold: 20, allowedItems: ["potionHealing"], maxDc: 17 },
      options: [
        { id: "stair", label: "Climb the great stair", success: { text: "The Rime Knights on the stair step aside as you pass, lowering their frozen swords. The Queen wishes to see you.", goto: "hall" } },
        { id: "hounds", label: "Signal the Grey Hounds to storm the gate", requires: { flag: "houndsAllied" }, success: { text: "Kade's horn sounds below. The Hounds hurl themselves at the palace gate, and every Rime Knight on the mountain turns to meet them. The throne room will be lightly guarded.", goto: "hall", effects: [{ kind: "flag", flag: "houndsCharge" }] } },
        { id: "pell", label: "Take Pell's secret route", requires: { flag: "pellTurned" }, success: { text: "Pell's route takes you through a servants' passage cut by the Queen's own agents. You find a forgotten storeroom — and the Queen's guards facing the wrong way.", goto: "hall", effects: [{ kind: "flag", flag: "pellRoute" }, { kind: "item", itemId: "potionGreaterHealing", qty: 1 }] } },
      ],
    },
    hall: {
      id: "hall",
      title: "The Throne of Winter",
      text: "Queen Ysmay rises from a throne of ice. She is beautiful the way a frozen lake is beautiful, and her eyes are the colour of deep crevasses. 'Warm ones,' she says. 'You broke my husband's sleep and slew my knight. Have you come to bring me what I asked for, or to join my court?' Behind her, a last Rime Knight lowers its visor.",
      dmNotes: "Endings: (1) fight — full encounter; (2) Hounds' charge draws off the knight — reduced encounter; (3) turn the Ember Heart on her (heartCarried or heartRekindled) — she fights alone, weakened; (4) offer the Hollow Crown so she may rest beside Aldric (requires the crown not stolen) — peaceful ending, no fight; (5) hidden: sing the lullaby back to her (requires rimeKnightsKnown) — opens the crown offer at a lower DC.",
      improv: { maxGold: 0, allowedItems: [], maxDc: 18 },
      options: [
        { id: "attack", label: "Draw steel", success: { text: "The Queen sighs like snow sliding from a roof. 'So be it.' Frost explodes across the floor.", goto: "queenFight" } },
        { id: "charge", label: "Strike while the Hounds hold her knights", requires: { flag: "houndsCharge" }, success: { text: "Her last knight hears the battle at the gate and hesitates — and you strike.", goto: "queenFightAllied" } },
        {
          id: "heart", label: "Turn the Ember Heart against her", requires: { flag: "heartCarried" },
          check: { skill: "religion", dc: 15, who: "best" },
          success: { text: "You unveil the Ember Heart. Its warmth floods the hall, and the spirits of Valdren pour out of it and wrap around their queen — and around her knight, which melts away screaming. Ysmay staggers, diminished.", goto: "queenWeakened" },
          failure: { text: "The Heart flares and dies back. The Queen laughs. 'My people never could keep a fire lit.'", goto: "queenFight" },
        },
        { id: "heartBright", label: "Call on the rekindled Heart's spirits", requires: { flag: "heartRekindled" }, success: { text: "The spirits you saved at the Silent Cairn come when you call, a warm wind smelling of summer, and they hold her knight fast while you face their queen.", goto: "queenWeakened" } },
        {
          id: "crown", label: "Offer her the Hollow Crown, so she may rest beside Aldric", requires: { notFlag: "c:crownTaken" },
          check: { skill: "persuasion", dc: 17, who: "best" },
          success: { text: "For a long moment she doesn't move. Then she reaches out and touches the empty crown with one blue finger. 'He wore it,' she whispers, 'the day we were wed.'", goto: "restEnding" },
          failure: { text: "'You mock us,' she breathes, and the temperature plummets.", goto: "queenFight" },
        },
        {
          id: "lullaby", label: "Sing her lullaby back to her", hidden: true, requires: { flag: "rimeKnightsKnown" },
          check: { skill: "performance", dc: 13, who: "best" },
          success: { text: "You sing the words Grandmother Ottilie taught you. The Queen falters mid-step, and for a moment she is only a tired woman far from home. 'Who taught you that?' she asks. 'Our nurse sang that.' And she listens when you speak of the crown.", goto: "restEnding" },
          failure: { text: "Your voice cracks on the high note. The spell breaks. The Queen's face hardens.", goto: "queenFight" },
        },
      ],
    },
    queenFight: {
      id: "queenFight",
      title: "The Rime Queen",
      text: "Queen Ysmay raises her frozen scepter, and her last knight moves to her side.",
      options: [],
      encounter: {
        id: "rimeQueenFull", name: "The Rime Queen", map: THRONE_ICE_MAP, partyStart: THRONE_ICE_PARTY,
        monsters: [
          { monsterId: "rimeQueen", at: [8, 2], name: "Queen Ysmay" },
          { monsterId: "rimeKnight", at: [4, 3], name: "Sir Aldwen, Last of the Rime" },
          { monsterId: "iceMephit", at: [12, 2] },
          { monsterId: "iceMephit", at: [5, 1] },
        ],
        objective: "Break the Rime Queen.",
        scaling: { perExtraHero: "iceMephit", perMissingHero: "iceMephit" },
        onVictory: { text: "The Queen falls, and as she does her palace begins to weep — every spire dripping, every hall running with meltwater. 'Aldric,' she says, once, to no one. Then she is gone, and somewhere far below, the sun comes out over Emberfall.", goto: "thaw", effects: [{ kind: "item", itemId: "diamond500", qty: 1 }, { kind: "item", itemId: "potionGreaterHealing", qty: 1 }] },
        onDefeat: { text: "The cold closes over you like deep water.", goto: "eternalWinter" },
      },
    },
    queenFightAllied: {
      id: "queenFightAllied",
      title: "The Queen Alone",
      text: "With her knights fighting the Hounds at the gate, the Queen faces you with only her mephits.",
      options: [],
      encounter: {
        id: "rimeQueenAllied", name: "The Queen Alone", map: THRONE_ICE_MAP, partyStart: THRONE_ICE_PARTY,
        monsters: [
          { monsterId: "rimeQueen", at: [8, 2], name: "Queen Ysmay" },
          { monsterId: "iceMephit", at: [12, 2] },
          { monsterId: "iceMephit", at: [5, 1] },
        ],
        objective: "Break the Rime Queen before her knights return.",
        scaling: { perExtraHero: "iceMephit" },
        onVictory: { text: "The Queen falls, and the palace begins to melt around you. From the gate, the Grey Hounds' cheer rises over the roar of the thaw.", goto: "thaw", effects: [{ kind: "item", itemId: "diamond500", qty: 1 }, { kind: "questCounter", counter: "parley", amount: 1 }] },
        onDefeat: { text: "The cold closes over you like deep water.", goto: "eternalWinter" },
      },
    },
    queenWeakened: {
      id: "queenWeakened",
      title: "Winter's Last Stand",
      text: "Wrapped in the ghosts of her own people, diminished and alone, the Queen still fights.",
      options: [],
      encounter: {
        id: "rimeQueenWeakened", name: "Winter's Last Stand", map: THRONE_ICE_MAP, partyStart: THRONE_ICE_PARTY,
        monsters: [{ monsterId: "rimeQueen", at: [8, 2], name: "Queen Ysmay" }],
        objective: "End the Rime Queen.",
        scaling: { perExtraHero: "iceMephit" },
        onVictory: { text: "The spirits of Valdren close around their queen like a warm cloak, and carry her away. The ice palace slumps into slush. The Ember Heart, its work done, burns down to a gentle glow.", goto: "thaw", effects: [{ kind: "item", itemId: "diamond500", qty: 1 }, { kind: "flag", flag: "spiritsAtPeace" }] },
        onDefeat: { text: "The cold closes over you like deep water.", goto: "eternalWinter" },
      },
    },
    thaw: {
      id: "thaw",
      title: "The Thaw",
      text: "You come down the mountain in a world of running water. Every stream in the Marches is in flood; every eave in Emberfall is dripping. The statues of Highcairn wake mid-step and finish crossing the green. And when you push open the door of the Broken Lantern, Marta Ironbell is standing on a ladder, lighting the lantern over the door. This time she doesn't look surprised when it stays lit.",
      dmNotes: "Success ending (the sword): winter is broken. Sets winterBroken.",
      onEnter: [{ kind: "flag", flag: "winterBroken" }],
      options: [],
      end: "success",
    },
    restEnding: {
      id: "restEnding",
      title: "The Queen Who Went Up the Mountain",
      text: "You carry Queen Ysmay down the mountain on a bier of ice that does not melt, the Hollow Crown in her hands. The Grey Hounds, the monks of the Silent Cairn and half of Emberfall follow you to the old keep, where she lies down in the crypt beside the dust of her husband. She sings the lullaby one last time, very quietly. Then the snow stops falling — everywhere, all at once — and the first warm rain in a month begins.",
      dmNotes: "Success ending (the mercy): the Queen rests. Sets queenAtRest. Future arcs may find the royal crypt a holy place — or a door.",
      onEnter: [{ kind: "flag", flag: "queenAtRest" }, { kind: "flag", flag: "winterBroken" }, { kind: "reputation", amount: 3 }, { kind: "questCounter", counter: "parley", amount: 1 }],
      options: [],
      end: "success",
    },
    eternalWinter: {
      id: "eternalWinter",
      title: "The Long Winter",
      text: "You wake at the Icebound Waystation, carried there by Grey Hounds or monks or simple luck. Above you, the Rime Palace glitters. The snow keeps falling. In Emberfall, Marta stops trying to light the lantern.",
      dmNotes: "Failure. The scenario can be attempted again; winter tightens its grip on the Marches.",
      onEnter: [{ kind: "flag", flag: "c:eternalWinter" }],
      options: [],
      end: "failure",
    },
  },
};

export const ARC2_SCENARIOS: Record<string, Scenario> = { frostfall, greyHounds, pellsLedger, glassMonastery, rimeQueen };
