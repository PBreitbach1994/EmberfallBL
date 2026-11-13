// The original setting for the starter campaign: Emberfall and the Broken Lantern.
import type { NpcDef } from "../types.js";

export const WORLD = {
  name: "The Emberfall Marches",
  overview: [
    "Three hundred years ago the Kingdom of Valdren ruled these hills from the Ember Throne. Then its last king, Aldric the Unyielding, made a bargain to outlive his own death, and the kingdom died in his place: its towns emptied, its chapels flooded, and the great forest now called the Ashwood swallowed its roads. Nobody remembers the bargain's terms. Everybody remembers to lock their doors when the fog comes down from the old keep.",
    "Emberfall is a frontier town built on Valdren's bones — a market, a palisade, a temple with a leaking roof, and more mercenaries than honest work. Caravans pass through on the way to richer places; prospectors come for the relics buried in the ruins; and the desperate come because the Marches ask no questions. The Lord-Warden in the distant capital sends tax collectors, not soldiers.",
    "That is why the Broken Lantern exists. The tavern at the edge of town serves as hiring hall, infirmary, and home for the companies of sellswords who take the jobs nobody else will. Its notice board is the beating heart of Emberfall: bounties, escorts, missing children, strange lights in the Ashwood. Every company that drinks here leaves a mark on the walls — and the town grows or withers by what they bring back.",
  ],
  tavern: {
    name: "The Broken Lantern",
    description:
      "A long, low hall of smoke-black timber leaning against the town palisade. Over the door hangs the namesake lantern — iron, cracked, never lit — that the founder swore she'd fix when Emberfall was safe. The common room holds a fire pit, a notice board bristling with nails, a wall of carved company sigils, and a bar made from a single door of the old royal keep.",
  },
  proprietor: {
    id: "marta",
    name: "Marta Ironbell",
    role: "Proprietor of the Broken Lantern, retired mercenary captain",
    personality:
      "Sixty winters, one good eye, a voice that can stop a brawl from across the room. Gruff to strangers, fiercely protective of 'her' companies once they've bled for Emberfall. Keeps a ledger of every hero who never came back and reads it aloud on midwinter night. Hates cowardice, waste, and anyone who mistreats the serving staff. Secretly sentimental; pretends otherwise.",
    voice: "Short sentences. Calls everyone 'pup' until they've earned a name. Dry, clipped humour. Swears by 'the Lantern's crack'.",
    secrets: [
      "Her old company, the Iron Bells, went into the old keep twenty years ago. Only she came out. She does not know what she saw down there — her memory of that night is simply gone.",
      "The bar-top door came from the keep's crypt. Sometimes, at night, she hears it knock.",
    ],
    attitude: "friendly",
  } satisfies NpcDef,
  npcs: [
    {
      id: "brother-oswin",
      name: "Brother Oswin",
      role: "Priest of the Dawnfather, keeper of Emberfall's leaking temple",
      personality: "Young, earnest, overworked, and braver than he looks. Treats every wounded mercenary as a sacred duty. Terrible at haggling.",
      voice: "Soft-spoken, quotes scripture then apologises for it.",
      secrets: ["He has been receiving dreams of a drowned bell ringing beneath the hills.", "The temple's coffers are nearly empty; he has been paying for medicine out of his own stipend."],
      attitude: "friendly",
    },
    {
      id: "hesk",
      name: "Hesk Tallowmere",
      role: "Smith and farrier",
      personality: "Enormous, quiet, patient. Takes pride in work that keeps people alive. Silently judges anyone who neglects their gear.",
      voice: "Grunts, then a single precise sentence. Counts in hammer-strikes.",
      secrets: ["Was once a soldier of the Lord-Warden and deserted rather than burn a village.", "Has a cache of old Valdren steel he won't sell — yet."],
      attitude: "indifferent",
    },
    {
      id: "pell",
      name: "Pell Quickwhistle",
      role: "Halfling fence, rumour-broker, and part-time alchemist's apprentice",
      personality: "Cheerful, mercenary, impossible to dislike for long. Knows everyone's business. Loyal to whoever paid last — and to children, always.",
      voice: "Fast patter, nicknames for everyone, a whistle between sentences.",
      secrets: ["Is buying Valdren relics for a mysterious client who pays in old royal coin.", "Lost a sister to the fog years ago."],
      attitude: "friendly",
    },
    {
      id: "warden-sabine",
      name: "Captain Sabine Roe",
      role: "Captain of Emberfall's under-strength town watch",
      personality: "Hard, tired, honest. Resents mercenaries for doing the job her watch can't afford to. Respects results.",
      voice: "Formal, clipped, military; warms slightly after a drink.",
      secrets: ["Three of her watchmen have deserted in the last month — or so she tells people. In truth they vanished on patrol near the old keep."],
      attitude: "indifferent",
    },
    {
      id: "old-wren",
      name: "Old Wren",
      role: "Hermit lore-keeper who lives in the tavern's back room in exchange for stories",
      personality: "Ancient, half-blind, sharp as a tack. Speaks of Valdren as though she remembers it. Possibly does.",
      voice: "Riddling, rhythmic, fond of 'once, long ago'. Laughs at her own jokes before she tells them.",
      secrets: ["Was a lady-in-waiting at the Ember Court and has been kept alive by a sliver of the same bargain that binds the Hollow King.", "Knows the words of the bargain but fears speaking them aloud."],
      attitude: "friendly",
    },
  ] satisfies NpcDef[],
};

export const DM_STYLE_GUIDE = `You are the Dungeon Master for a D&D 5th Edition (2024 rules) campaign set in the Emberfall Marches.

TONE: Gritty-but-warm frontier fantasy. Think of a mercenary company's campaign book: hard jobs, real costs, wounds that matter, and a tavern fire waiting at the end of the road. Danger is real and the world doesn't bend to the heroes, but kindness, loyalty and courage are rewarded. Humour comes from character, not from winking at the audience.

CONTENT: The table owner has opened all content for play. By default keep things at a PG-13 level (violence and horror described with weight but not lingered on; romance implied rather than explicit). Escalate intensity only when the players clearly steer that way, and always keep it in service of the story.

STYLE:
- Narrate in second person plural ("you") to the party, present tense, 2-5 vivid sentences per beat. Engage at least two senses.
- Give NPCs distinct voices from their notes. Let them want things.
- End most narration with a clear prompt or a choice so players know they can act.
- Reward clever ideas: when a player's free-text action is plausible, call for a check rather than saying no.
- Never decide what player characters think, feel, or say.
- Keep secrets until they are earned. DM notes are for you, not the players.
- Failure moves the story forward with a cost — never a dead end.
- The engine resolves all dice, damage, and rules. Describe outcomes; never invent numbers.`;
