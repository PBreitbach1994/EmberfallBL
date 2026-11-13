# Emberfall — The Broken Lantern

A persistent, Gloomhaven/Frosthaven-flavoured **D&D 5th Edition (2024 rules)** campaign game that runs in the browser.
Gather at the Broken Lantern tavern, take jobs off the board, and play them with friends, with **AI companions**, under an
**AI Dungeon Master** (Claude), under a **human DM** with AI players, or send an **AI-only party** off on its own.
The town of Emberfall grows with every job: buildings, shops, temple services, personal quests, retirements and unlocks.

> Rules, story and gameplay first — graphics are intentionally simple for now.

## Quick start (Proxmox / any Docker host)

```bash
git clone <your repo> emberfall && cd emberfall
cp .env.example .env        # set INVITE_CODE and (optionally) ANTHROPIC_API_KEY
docker compose up -d --build
```

Open `http://<host>:3000`, enter a name and the invite code. The **first person to join is the campaign owner** (admin).
Data lives in `./data/emberfall.db` (SQLite) — back that file up.

**Full walkthrough — Proxmox VM, Docker, Cloudflare Tunnel, backups, updates: [docs/DEPLOY.md](docs/DEPLOY.md).**
With a tunnel token in `.env`: `docker compose --profile tunnel up -d --build`. Update later with `./scripts/update.sh`.

Without an API key the game runs with the **Scripted DM** (authored narration, option-driven play). With a key the
**AI DM** narrates scenes, voices NPCs and adjudicates free-form actions.

## Development

```bash
npm install
npm run build          # engine → web → server
npm test               # engine rules tests (simulated fights, validation)
npm run dev            # server on :3000 (serves the built web client)
npm run dev:web        # Vite dev server on :5173 with hot reload (proxies /api and /ws to :3000)
```

Environment: `PORT` (3000), `DATA_DIR` (`./data`), `INVITE_CODE` (`emberfall` — change it), `ANTHROPIC_API_KEY`,
`CLAUDE_MODEL` (default `claude-opus-5-5`).

## How it plays

- **The Tavern hub** — job board and campaign map, active adventures (join open seats or spectate), the chronicle,
  and the town: buildings, shop, temple, donations.
- **Characters** — full 2024 creation (species, class, background with +2/+1 or +1/+1/+1, standard array / point buy /
  server-rolled 4d6, skills, expertise, equipment packages, spells, weapon masteries, fighting style, origin feats),
  or quick-build. Each hero draws a **personal quest**; completing it lets them **retire**, which unlocks content for the
  whole campaign (new classes, buildings, perks). At the level cap a hero can take **Prestige** instead.
- **Scenarios** — authored scene graphs with skill checks (individual, best-suited, group), hidden options for clever
  play, NPCs with secrets, and branching outcomes. Failure complicates; it never dead-ends.
- **Road events** — Frosthaven-style event cards drawn on the way to each job.
- **Tactical combat** — grid combat with initiative, action/bonus/reaction/movement budgets, opportunity attacks, cover,
  difficult terrain, conditions, concentration, death saves, and fixed monster behaviour profiles.
- **Mix and match** — any mixture of humans and AI companions; hand your character to the AI mid-fight or take an AI
  companion over; let the AI play one turn ("Auto"); be the DM yourself with DM tools (narrate, call checks, award loot,
  jump scenes, spawn monsters) while AI players react to your narration; or launch an autonomous AI party and read
  the tale in the chronicle afterwards.
- **Hardcore** — campaign-wide or per character: no resurrection. Otherwise *Revivify* (in combat, within a minute,
  300 gp diamond) and the temple's *Raise Dead* (temple level 2, 500 gp, within two campaign weeks) bring heroes back.

## The AI DM harness

Claude narrates and improvises; **the rules engine owns every number**. The model acts only through four tools, and
the server re-validates every call:

| Tool | What the engine enforces |
|---|---|
| `choose_option` | Only options that exist in the current scene and are available; once per player action. Scene changes happen only here. |
| `ability_check` | Real skills/abilities only; DC clamped to the scene's cap; the engine rolls. |
| `grant_reward` | One improvised reward per scene, gold capped and items limited to the scene's allow-list. |
| `narrative_damage` | Fixed small dice only; can never kill. |

Monster tactics and AI-companion combat decisions are **deterministic code** (`packages/engine/src/rules/tactics.ts`),
not the LLM, so fights are fair, fast and cheap. The LLM is used for narration, NPC voices, interpreting free-text
actions, AI players' in-character choices, and chronicle write-ups. Requests use adaptive thinking at low/medium effort,
a cached system prompt, and server-side refusal fallback (`fallbacks: "default"`).

## Repository layout

```
packages/engine   Pure TypeScript rules engine (runs in Node and the browser)
  src/data/         SRD 5.2.1 data: classes, species, backgrounds, feats, spells, weapons, armor, monsters
  src/rules/        character building, grid geometry, combat, monster/companion tactics, ability checks
  src/campaign/     adventure runner + content formats; content/ holds the world, scenarios, events, quests, buildings
  src/api.ts        shared server/client contract
packages/server   Express + WebSocket server, SQLite persistence, AI DM harness (dm.ts), town & game services
packages/web      React client (tavern, characters, adventure, combat grid, DM panel)
```

## Implemented rules (v0.1)

- **Classes (levels 1–5):** Fighter (Champion), Rogue (Thief), Cleric (Life), Wizard (Evoker) are unlocked at the
  start; Barbarian (Berserker) and Ranger (Hunter) unlock through retirements.
- **Species:** Human, Elf, Dwarf, Halfling, Dragonborn (fire), Gnome, Goliath (stone), Orc, Tiefling (infernal).
- **Backgrounds:** Acolyte, Criminal, Sage, Soldier, with their origin feats (Alert, Magic Initiate, Savage Attacker, Skilled; plus Tough).
- **2024 specifics:** weapon mastery (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex), Heroic Inspiration, exhaustion
  as −2 per level, background ability scores, light-weapon extra attack, bonus-action spell rule, potions as a bonus action,
  surprise as disadvantage on initiative.
- **Spells:** ~40 that the engine fully adjudicates, cantrips through 3rd level (Fireball, Spirit Guardians, Revivify…).
- **Monsters:** 20 stat blocks adapted from the SRD (giant rat to wight), each with a behaviour profile.

## Adding content as the game grows

Everything is plain data. To add a spell, monster, item, class feature or scenario, add an entry to the matching file in
`packages/engine/src/data/` or `packages/engine/src/campaign/content/` and run `npm test`. Scenario authoring:
see `campaign/types.ts`: a scenario is a graph of `SceneNode`s with `options` (checks, requirements, outcomes, effects)
and optional `encounter`s drawn as ASCII maps. Personal quests, events and buildings follow the same pattern.

## Legal

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC,
available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0
International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

The setting (Emberfall, the Broken Lantern, the Hollow Crown and its characters) is original to this project.
Content from the non-SRD rulebooks is not included and should not be added to the repository.
