// Road and town event cards, drawn between scenarios (Frosthaven-style).
import type { EventCard } from "../types.js";

const road = (x: Omit<EventCard, "deck">): EventCard => ({ deck: "road", ...x });
const town = (x: Omit<EventCard, "deck">): EventCard => ({ deck: "town", ...x });

export const EVENTS: Record<string, EventCard> = Object.fromEntries([
  // ------------------------------------------------------------------------- Road
  road({
    id: "road-overturned-cart", title: "The Overturned Cart",
    text: "A merchant's cart lies on its side in the ditch, one wheel still turning. The merchant is pinned beneath it, groaning; his mule grazes placidly nearby. Crates of goods are scattered across the road.",
    options: [
      { id: "lift", label: "Lift the cart and free him", check: { skill: "athletics", dc: 12, who: "best" },
        success: { text: "You heave the cart upright. The grateful merchant presses a pouch of coin and a sack of iron nails into your hands.", effects: [{ kind: "gold", amount: 8 }, { kind: "material", id: "iron", qty: 1 }, { kind: "reputation", amount: 1 }] },
        failure: { text: "The cart slips and lands on someone's foot before you finally get him free. He thanks you anyway.", effects: [{ kind: "damage", dice: "1d4", type: "bludgeoning", who: "chooser" }, { kind: "gold", amount: 4 }] } },
      { id: "loot", label: "Help yourselves to the scattered goods",
        success: { text: "You fill your packs while the merchant curses you. Word of this will travel.", effects: [{ kind: "gold", amount: 15 }, { kind: "reputation", amount: -2 }] } },
    ],
  }),
  road({
    id: "road-wolves", title: "Eyes in the Treeline", season: "winter",
    text: "The snow is deep and the light is failing when you notice the wolves pacing you through the trees: lean, silent, hungry.",
    options: [
      { id: "fire", label: "Make camp and keep a big fire burning", check: { skill: "survival", dc: 12, who: "best" },
        success: { text: "The wolves circle all night but never come within the firelight. You march on at dawn, cold but whole." },
        failure: { text: "Your fire gutters out in the small hours. The wolves dart in, snapping, before you drive them off.", effects: [{ kind: "damage", dice: "1d6", type: "piercing", who: "random" }] } },
      { id: "scare", label: "Make yourselves big and loud", check: { skill: "intimidation", dc: 13, who: "best" },
        success: { text: "Your bellowing echoes through the trees, and the pack melts away into the snow." },
        failure: { text: "The wolves are unimpressed. You march through the night with them at your heels and arrive exhausted.", effects: [{ kind: "condition", condition: "exhaustion", who: "chooser" }] } },
    ],
  }),
  road({
    id: "road-shrine", title: "The Wayside Shrine",
    text: "A moss-grown shrine to the Dawnfather stands where two roads cross. A few coins glint in its offering bowl, and a carved inscription promises blessing to the generous.",
    options: [
      { id: "donate", label: "Leave an offering (5 gold)", requires: { gold: 5 },
        success: { text: "A warm breeze stirs as your coins clink into the bowl. You feel lighter, and your wounds ache less.", effects: [{ kind: "gold", amount: -5 }, { kind: "heal", dice: "1d8", who: "all" }, { kind: "questCounter", counter: "donated", amount: 5 }] } },
      { id: "pray", label: "Pray for guidance", check: { skill: "religion", dc: 11, who: "best" },
        success: { text: "In the stillness after your prayer, you notice a loose stone at the shrine's base — and a pilgrim's cache of herbs behind it.", effects: [{ kind: "material", id: "herbs", qty: 2 }] },
        failure: { text: "You kneel, you pray, and the road goes on." } },
      { id: "rob", label: "Take the coins from the bowl", success: { text: "You pocket the coins. The wind turns cold, and for the rest of the day your boots feel heavy.", effects: [{ kind: "gold", amount: 6 }, { kind: "damage", dice: "1d4", type: "psychic", who: "chooser" }] } },
    ],
  }),
  road({
    id: "road-toll", title: "The Toll Bridge",
    text: "Three armed men have strung a chain across the old bridge over the Cinder River. 'Lord-Warden's toll,' says their leader, though none of them wear the Warden's colours. 'Two gold a head.'",
    options: [
      { id: "pay", label: "Pay the toll (8 gold)", requires: { gold: 8 }, success: { text: "They lower the chain with a mocking bow.", effects: [{ kind: "gold", amount: -8 }] } },
      { id: "bluff", label: "Claim to be on Watch business", check: { skill: "deception", dc: 13, who: "best" },
        success: { text: "At the mention of Captain Roe, the 'tollmen' exchange a nervous look and wave you through.", effects: [] },
        failure: { text: "'Watch business? Then the toll's doubled.' You pay — and they laugh as you go.", effects: [{ kind: "gold", amount: -10 }] } },
      { id: "scare", label: "Put a hand on your weapon and stare them down", check: { skill: "intimidation", dc: 12, who: "best" },
        success: { text: "The bandits suddenly remember urgent business elsewhere. You find a purse they left behind.", effects: [{ kind: "gold", amount: 6 }, { kind: "reputation", amount: 1 }] },
        failure: { text: "A brief, ugly scuffle on the bridge. You win — but not cleanly.", effects: [{ kind: "damage", dice: "1d6", type: "slashing", who: "random" }] } },
    ],
  }),
  road({
    id: "road-lost-child", title: "The Lost Child",
    text: "A small girl in a muddy shawl sits crying at the roadside. She says she was picking berries and lost her way home — a hamlet 'past the burnt oak'.",
    options: [
      { id: "escort", label: "Take her home", check: { skill: "survival", dc: 11, who: "best" },
        success: { text: "Her family weeps with relief and insists you take a jar of honey, a bundle of herbs, and their blessing.", effects: [{ kind: "material", id: "herbs", qty: 1 }, { kind: "reputation", amount: 2 }] },
        failure: { text: "It takes most of the day to find the hamlet, but you get her home safe. Her family has little to give but gratitude.", effects: [{ kind: "reputation", amount: 1 }] } },
      { id: "insight", label: "Something's off about her...", check: { skill: "insight", dc: 14, who: "best" },
        success: { text: "Her feet leave no prints in the mud. You back away slowly; the 'child' smiles with too many teeth and fades into mist. Somehow you know you've dodged something terrible.", effects: [{ kind: "questCounter", counter: "secretsFound", amount: 1 }, { kind: "xp", amount: 25 }] },
        failure: { text: "She seems a perfectly ordinary lost child. You take her home, and she skips into a cottage you could swear wasn't there before.", effects: [{ kind: "reputation", amount: 1 }] } },
    ],
  }),
  road({
    id: "road-ruin", title: "Valdren Waystone",
    text: "Half-buried beside the road is a toppled waystone of the old kingdom, carved with the Hollow Crown and an inscription worn almost smooth.",
    options: [
      { id: "read", label: "Read the inscription", check: { skill: "history", dc: 13, who: "best" },
        success: { text: "'Here the King's peace ends; here the King's bargain begins.' Beneath it, a hidden hollow holds a relic of the old court.", effects: [{ kind: "material", id: "relic", qty: 1 }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
        failure: { text: "Whatever it said, the rain has long since erased it." } },
      { id: "haul", label: "Haul the stone back to sell to Pell", check: { skill: "athletics", dc: 14, who: "group" },
        success: { text: "Backs aching, you drag the waystone to Emberfall. Pell pays handsomely and asks no questions.", effects: [{ kind: "gold", amount: 12 }] },
        failure: { text: "You get it halfway before giving up, with strained backs to show for it.", effects: [{ kind: "damage", dice: "1d4", type: "bludgeoning", who: "all" }] } },
    ],
  }),
  road({
    id: "road-storm", title: "Summer Storm", season: "summer",
    text: "Black clouds boil up out of a clear sky, and the heavens open. Lightning splits a tree not fifty paces away.",
    options: [
      { id: "shelter", label: "Find shelter", check: { skill: "survival", dc: 11, who: "best" },
        success: { text: "You find a dry cave and wait out the storm in comfort. Someone has left a stash of rations here.", effects: [{ kind: "item", itemId: "rations", qty: 2 }, { kind: "rest", type: "short" }] },
        failure: { text: "You spend the night soaked and shivering under a dripping ledge.", effects: [{ kind: "condition", condition: "exhaustion", who: "all" }] } },
      { id: "push", label: "Push on through the storm", check: { ability: "con", save: true, dc: 12, who: "group" },
        success: { text: "You arrive drenched but on time." },
        failure: { text: "Battered by wind and hail, you arrive bruised and miserable.", effects: [{ kind: "damage", dice: "1d4", type: "bludgeoning", who: "all" }] } },
    ],
  }),
  road({
    id: "road-deserter", title: "The Deserter",
    text: "A young man in a torn Watch tabard bolts from the undergrowth, sees you, and freezes. 'Please,' he says. 'Don't take me back. I saw what's in the keep. I saw what took the others.'",
    options: [
      { id: "listen", label: "Hear him out", check: { skill: "persuasion", dc: 10, who: "best" },
        success: { text: "He tells you of red candles and walking dead near the old keep, and of three watchmen dragged into the dark. He gives you his healer's kit and vanishes south.", effects: [{ kind: "item", itemId: "healersKit", qty: 1 }, { kind: "flag", flag: "deserterWarning" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
        failure: { text: "He babbles about candles and the dead, then runs before you can make sense of it." } },
      { id: "arrest", label: "Bring him back to Captain Roe", success: { text: "Captain Roe pays a small reward and stares at the deserter's terrified face for a long time.", effects: [{ kind: "gold", amount: 5 }, { kind: "reputation", amount: 1 }] } },
    ],
  }),
  road({
    id: "road-spider-web", title: "Webs Across the Path",
    text: "Thick grey webs stretch across the forest path, glistening with dew. Something has wrapped a deer here — and recently.",
    options: [
      { id: "burn", label: "Burn a way through", check: { skill: "survival", dc: 10, who: "best" },
        success: { text: "The webs shrivel and the path clears. Something large scuttles away into the canopy." },
        failure: { text: "The fire spreads faster than you'd like, singeing everyone.", effects: [{ kind: "damage", dice: "1d4", type: "fire", who: "all" }] } },
      { id: "around", label: "Take the long way around", success: { text: "The detour costs you a day of rations but no blood.", effects: [{ kind: "removeItem", itemId: "rations", qty: 1 }] } },
      { id: "loot", label: "Search the wrapped bundles", check: { skill: "stealth", dc: 13, who: "best" },
        success: { text: "Among the cocoons you find a dead adventurer's purse and a potion. You slip away before the owner of the webs returns.", effects: [{ kind: "gold", amount: 10 }, { kind: "item", itemId: "potionHealing", qty: 1 }] },
        failure: { text: "A giant spider drops from above! You escape, but not before it bites.", effects: [{ kind: "damage", dice: "2d6", type: "poison", who: "chooser" }] } },
    ],
  }),
  road({
    id: "road-peddler", title: "The Smiling Peddler",
    text: "A peddler with a cart full of bottles hails you from the roadside. 'Cures for what ails you! Potions, poultices, perfumes! Special price for heroes!'",
    options: [
      { id: "buy", label: "Buy a potion (30 gold)", requires: { gold: 30 }, success: { text: "The potion looks genuine. It even is.", effects: [{ kind: "gold", amount: -30 }, { kind: "item", itemId: "potionHealing", qty: 1 }] } },
      { id: "check", label: "Inspect his wares", check: { skill: "medicine", dc: 12, who: "best" },
        success: { text: "Most of it is coloured water — but one bottle is real antitoxin, and you embarrass him into selling it cheap.", effects: [{ kind: "gold", amount: -5 }, { kind: "item", itemId: "antitoxin", qty: 1 }] },
        failure: { text: "Everything looks convincing. You decide not to risk it." } },
    ],
  }),

  // ------------------------------------------------------------------------- Town
  town({
    id: "town-brawl", title: "Brawl at the Lantern",
    text: "A caravan guard has called your company 'gutter-sweepers' and a friend of yours has answered with a chair. The common room is about to erupt.",
    options: [
      { id: "join", label: "Join the fight", check: { skill: "athletics", dc: 12, who: "group" },
        success: { text: "Your company wins the brawl and the caravan's grudging respect. Marta makes the losers pay for the chairs.", effects: [{ kind: "reputation", amount: 1 }, { kind: "gold", amount: 5 }] },
        failure: { text: "You lose, gloriously. Marta makes you pay for the chairs.", effects: [{ kind: "gold", amount: -5 }, { kind: "damage", dice: "1d4", type: "bludgeoning", who: "all" }] } },
      { id: "calm", label: "Defuse it with a round of drinks", check: { skill: "persuasion", dc: 12, who: "best" },
        success: { text: "By the end of the night the caravan guards are singing your company's praises — literally, and badly.", effects: [{ kind: "gold", amount: -3 }, { kind: "reputation", amount: 2 }] },
        failure: { text: "They take your drinks and the fight happens anyway.", effects: [{ kind: "gold", amount: -3 }, { kind: "damage", dice: "1d4", type: "bludgeoning", who: "chooser" }] } },
    ],
  }),
  town({
    id: "town-temple-roof", title: "The Leaking Roof",
    text: "Brother Oswin is on a ladder in the rain, trying to patch the temple roof with a borrowed tablecloth. 'It's fine!' he calls down. 'It's... mostly fine!'",
    options: [
      { id: "help", label: "Help with the repairs (1 timber)", success: { text: "With proper timber and a few strong arms, the roof is sound by nightfall. Oswin blesses you all twice.", effects: [{ kind: "material", id: "timber", qty: -1 }, { kind: "prosperity", amount: 1 }, { kind: "heal", dice: "1d8", who: "all" }] } },
      { id: "donate", label: "Donate to the temple fund (10 gold)", requires: { gold: 10 }, success: { text: "Oswin's eyes fill with tears. 'This will buy medicine for the whole winter.'", effects: [{ kind: "gold", amount: -10 }, { kind: "questCounter", counter: "donated", amount: 10 }, { kind: "reputation", amount: 1 }] } },
      { id: "leave", label: "Wish him luck", success: { text: "He waves cheerfully. Then slips. Then waves again, from the mud." } },
    ],
  }),
  town({
    id: "town-pell-deal", title: "Pell's Proposition",
    text: "Pell Quickwhistle slides onto the bench beside you with a wink. 'Got a buyer for Valdren relics. Pays in old royal coin. Real old. No questions asked — I especially don't ask 'em.'",
    options: [
      { id: "sell", label: "Sell a relic to Pell's buyer", requires: { item: "relic" },
        success: { text: "The coins Pell brings back are heavy, cold, and stamped with the Hollow Crown. They spend just fine.", effects: [{ kind: "removeItem", itemId: "relic", qty: 1 }, { kind: "gold", amount: 25 }, { kind: "flag", flag: "soldToCollector" }] } },
      { id: "probe", label: "Ask who the buyer really is", check: { skill: "insight", dc: 13, who: "best" },
        success: { text: "Pell's whistle falters. 'Lady in red,' he admits. 'Smells like candle-wax. Gives me the creeps.' You've learned something important.", effects: [{ kind: "flag", flag: "knowsCollector" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
        failure: { text: "'A collector,' Pell says breezily. 'Collects things.'" } },
    ],
  }),
  town({
    id: "town-harvest", title: "Harvest Fair", season: "summer",
    text: "Emberfall's harvest fair fills the square with music, pies, and a strongman contest offering a purse to anyone who can lift the Iron Calf — a lump of pig iron the size of a barrel.",
    options: [
      { id: "lift", label: "Try to lift the Iron Calf", check: { skill: "athletics", dc: 15, who: "best" },
        success: { text: "The crowd roars as you hoist the Iron Calf overhead. The purse is yours — and so is the Iron Calf, which Hesk offers to melt down for the smithy.", effects: [{ kind: "gold", amount: 15 }, { kind: "material", id: "iron", qty: 2 }, { kind: "reputation", amount: 1 }] },
        failure: { text: "You strain, you grunt, you pull something. The crowd is sympathetic.", effects: [{ kind: "damage", dice: "1d4", type: "bludgeoning", who: "chooser" }] } },
      { id: "perform", label: "Entertain the crowd", check: { skill: "performance", dc: 12, who: "best" },
        success: { text: "Coins rain into your hat. The town will be humming your tune for weeks.", effects: [{ kind: "gold", amount: 8 }, { kind: "prosperity", amount: 1 }] },
        failure: { text: "Someone throws a pie. It's a good pie, at least." } },
    ],
  }),
  town({
    id: "town-midwinter", title: "The Midwinter Ledger", season: "winter",
    text: "On midwinter night Marta stands by the fire with her ledger of the fallen and reads every name aloud. The common room is silent. When she's finished, she looks at your company and waits.",
    options: [
      { id: "toast", label: "Raise a toast to the fallen", success: { text: "Glasses lift all around the room. Marta nods once, and something in the hall is mended.", effects: [{ kind: "reputation", amount: 1 }, { kind: "heal", dice: "1d6", who: "all" }] } },
      { id: "ask", label: "Ask Marta about the Iron Bells", check: { skill: "persuasion", dc: 14, who: "best" },
        success: { text: "Late that night, Marta tells you about her old company, the night in the keep, and the lieutenant she trusted — Cendra — who never came out. 'Or that's what I thought,' she says, and won't say more.", effects: [{ kind: "flag", flag: "knowsIronBells" }, { kind: "questCounter", counter: "secretsFound", amount: 1 }] },
        failure: { text: "'Not tonight, pup.' She closes the ledger." } },
    ],
  }),
  town({
    id: "town-refugees", title: "Refugees at the Gate",
    text: "A dozen farmers from the hill country huddle at Emberfall's gate with their carts and children, fleeing 'lights in the fog'. Captain Roe wants to turn them away; the town has barely enough for itself.",
    options: [
      { id: "plead", label: "Speak for the refugees", check: { skill: "persuasion", dc: 13, who: "best" },
        success: { text: "Roe relents. The newcomers set to work at once, and Emberfall is stronger for it.", effects: [{ kind: "prosperity", amount: 2 }, { kind: "reputation", amount: 1 }] },
        failure: { text: "Roe won't budge. You help them make camp outside the walls instead.", effects: [{ kind: "reputation", amount: 1 }] } },
      { id: "fund", label: "Pay for their lodging yourselves (15 gold)", requires: { gold: 15 }, success: { text: "Marta puts them up in the stables at cost. The farmers pay you back in timber and labour.", effects: [{ kind: "gold", amount: -15 }, { kind: "material", id: "timber", qty: 2 }, { kind: "prosperity", amount: 1 }, { kind: "questCounter", counter: "donated", amount: 15 }] } },
      { id: "away", label: "Stay out of it", success: { text: "The refugees move on. Nobody looks at you quite the same way afterwards.", effects: [{ kind: "reputation", amount: -1 }] } },
    ],
  }),
].map((e) => [e.id, e]));
