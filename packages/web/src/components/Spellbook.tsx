// Spells on the character sheet: what you have, how it grows, and a step-by-step tutorial.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CharacterSheet, SpellDef } from "@tavern/engine";
import {
  ABILITY_NAMES, CLASSES, PREP_MODE, SPELLS, cantripLimit, cantripPool, chosenSpells, copyCost, fmtMod, lockedSpells,
  maxSpellLevel, maxSpellLevelAt, mod, preparablePool, preparedLimit, profBonus, retrainCost, scrollPrice, spellOfScroll,
  spellSaveDc, spellbookSize, type PrepMode,
} from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, errText, toast } from "../api";
import { Modal, Pill } from "./ui";

const TUTORIAL_KEY = "tavern.spellTutorialSeen";
const seen = (classId: string) => { try { return (JSON.parse(localStorage.getItem(TUTORIAL_KEY) ?? "[]") as string[]).includes(classId); } catch { return true; } };
const markSeen = (classId: string) => { try { const s = new Set(JSON.parse(localStorage.getItem(TUTORIAL_KEY) ?? "[]") as string[]); s.add(classId); localStorage.setItem(TUTORIAL_KEY, JSON.stringify([...s])); } catch { /* private window */ } };

const MODE_TEXT: Record<PrepMode, { short: string; long: string }> = {
  list: {
    short: "You can change your prepared spells freely between adventures.",
    long: "You pray (or commune) for your spells. Between adventures you may prepare any spells from your whole class list, as long as you have slots of that level. Change them as often as you like while in town — pick healing for a dungeon full of traps, firepower for a goblin warband.",
  },
  book: {
    short: "You prepare from your spellbook, and can change them freely between adventures.",
    long: "Your magic lives in your spellbook. Each level you write two new spells into it for free, and you can copy more from spell scrolls (found as treasure, or bought at Wren's Library). Between adventures you choose which spells from the book to prepare. The bigger your book, the more options you have.",
  },
  swapOnRest: {
    short: "You can swap one prepared spell after each long rest.",
    long: "Your spells come from your oath (or your bond with the wild). You prepare a fixed number from your class list, and after each long rest you may swap one of them for another. Sleep at the Broken Lantern to earn the swap. Need more changes? The Training Yard retrains spells for gold.",
  },
  swapOnLevel: {
    short: "You can swap one spell each time you gain a level.",
    long: "Your spells are part of you — learned, inherited or granted by a patron. Each time you gain a level you learn new ones, and you may also swap one spell you already know for another. Outside that, the Training Yard can retrain a spell for gold.",
  },
};

export function SpellsPanel({ ctx, sheet, mine }: { ctx: AppCtx; sheet: CharacterSheet; mine: boolean }) {
  const cls = CLASSES[sheet.classId];
  const sc = cls.spellcasting;
  const mode = PREP_MODE[sheet.classId];
  const [prep, setPrep] = useState(false);
  const [tour, setTour] = useState(false);
  useEffect(() => { if (sc && mine && !seen(sheet.classId)) setTour(true); }, [sc, mine, sheet.classId]);
  if (!sc || !mode) return null;
  const pb = profBonus(sheet);
  const locked = new Set(lockedSpells(sheet));
  const chosen = chosenSpells(sheet);
  const prepared = sheet.spellsKnown.map((id) => SPELLS[id]).filter((s): s is SpellDef => !!s && s.level > 0).sort(byLevel);
  const cantrips = sheet.cantrips.map((id) => SPELLS[id]).filter((s): s is SpellDef => !!s).sort(byLevel);
  const book = (sheet.spellbook ?? []).map((id) => SPELLS[id]).filter((s): s is SpellDef => !!s).sort(byLevel);
  const scrolls = sheet.inventory.map((i) => ({ i, sp: spellOfScroll(i.itemId) })).filter((x): x is { i: typeof x.i; sp: SpellDef } => !!x.sp);
  const services = ctx.campaign?.services ?? [];
  const copy = async (itemId: string) => {
    const r = await attempt(() => api<{ message: string }>(`/characters/${sheet.id}/copy-scroll`, { body: { itemId } }));
    if (r) { toast(r.message); await ctx.refreshCharacters(); }
  };
  return (
    <section className="panel spells-panel" data-tour="spells">
      <div className="row spread">
        <h2>Spellcasting</h2>
        <div className="row">
          <button className="tiny" onClick={() => setTour(true)}>❔ How spells work</button>
          {mine && !sheet.retired && !sheet.dead && <button className="tiny primary" data-tour="change" onClick={() => setPrep(true)}>✎ Change spells</button>}
        </div>
      </div>
      <div className="row" data-tour="slots">
        <Pill>{ABILITY_NAMES[sc.ability]}</Pill>
        <Pill>Save DC {spellSaveDc(sheet, sc.ability)}</Pill>
        <Pill>Spell attack {fmtMod(pb + mod(sheet.abilities[sc.ability]))}</Pill>
        {sheet.spellSlots.map((n, lvl) => lvl > 0 && n > 0 ? <Pill key={lvl} kind="good">Level {lvl} slots: {n - (sheet.spellSlotsUsed[lvl] ?? 0)}/{n}</Pill> : null)}
      </div>
      <p className="small muted">{MODE_TEXT[mode].short}{(sheet.spellSwaps ?? 0) > 0 && mode.startsWith("swap") ? ` Free spell swaps ready: ${sheet.spellSwaps}.` : ""}{(sheet.cantripSwaps ?? 0) > 0 ? ` Free cantrip swaps ready: ${sheet.cantripSwaps}.` : ""}</p>
      <div className="spell-cols">
        <div data-tour="cantrips">
          <h3>Cantrips <span className="muted small">({cantrips.length}) · cast at will, no slot</span></h3>
          <SpellList spells={cantrips} />
        </div>
        <div data-tour="prepared">
          <h3>{mode === "swapOnLevel" ? "Spells known" : "Prepared spells"} <span className="muted small">({chosen.length}/{preparedLimit(sheet)} chosen{locked.size ? ` + ${[...locked].filter((id) => sheet.spellsKnown.includes(id)).length} always prepared` : ""})</span></h3>
          <SpellList spells={prepared} badge={(s) => locked.has(s.id) ? "always prepared" : undefined} />
        </div>
        {mode === "book" && (
          <div data-tour="book">
            <h3>Spellbook <span className="muted small">({book.length} spells · {spellbookSize(sheet.level)} from levelling)</span></h3>
            <SpellList spells={book} dim={(s) => !sheet.spellsKnown.includes(s.id)} badge={(s) => sheet.spellsKnown.includes(s.id) ? "prepared" : undefined} />
            {scrolls.length > 0 && (
              <>
                <h3>Scrolls in your pack</h3>
                <ul className="kv">
                  {scrolls.map(({ i, sp }) => {
                    const inBook = book.some((b) => b.id === sp.id);
                    const tooHigh = sp.level > maxSpellLevel(sheet);
                    return (
                      <li key={i.itemId}><span>📜 {sp.name} <span className="muted small">level {sp.level}</span></span>
                        {mine && <button className="tiny" disabled={inBook || tooHigh || sheet.gold < copyCost(sp.level)} title={inBook ? "Already in your book" : tooHigh ? `Needs level ${sp.level} spell slots` : ""} onClick={() => copy(i.itemId)}>{inBook ? "In your book" : `Copy · ${copyCost(sp.level)} gp`}</button>}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
      <p className="small muted" data-tour="town">
        {services.includes("service:retrain") ? "The Training Yard is open: extra spell changes cost 10 gp per cantrip and 20 gp per spell level." : "Build the Training Yard to retrain spells for gold between adventures."}{" "}
        {sheet.classId === "wizard" && (services.includes("shop:scrolls") ? "Wren's Library sells spell scrolls." : "Upgrade Wren's Library to level 2 to buy spell scrolls.")}
      </p>
      {prep && <PrepareDialog ctx={ctx} sheet={sheet} onClose={() => setPrep(false)} />}
      {tour && <SpellTutorial ctx={ctx} sheet={sheet} onClose={() => { markSeen(sheet.classId); setTour(false); }} onChange={mine ? () => { markSeen(sheet.classId); setTour(false); setPrep(true); } : undefined} />}
    </section>
  );
}

const byLevel = (a: SpellDef, b: SpellDef) => a.level - b.level || a.name.localeCompare(b.name);

function SpellList({ spells, badge, dim }: { spells: SpellDef[]; badge?: (s: SpellDef) => string | undefined; dim?: (s: SpellDef) => boolean }) {
  if (!spells.length) return <p className="muted small">None yet.</p>;
  return (
    <ul className="spells">
      {spells.map((s) => (
        <li key={s.id} className={dim?.(s) ? "dim" : ""}>
          <strong>{s.name}</strong> <span className="muted small">{s.level === 0 ? "cantrip" : `level ${s.level}`} · {s.castingTime === "bonus" ? "bonus action" : s.castingTime}{s.concentration ? " · concentration" : ""}{s.ritual ? " · ritual" : ""}</span>
          {badge?.(s) && <> <Pill kind="muted">{badge(s)}</Pill></>}
          <div className="small">{s.description}</div>
        </li>
      ))}
    </ul>
  );
}

interface Quote { ok: boolean; cost: number; changedSpells: number; changedCantrips: number; freeSpellSwapsUsed: number; freeCantripSwapsUsed: number; reason?: string }

/** Pick prepared spells and cantrips; the server quotes what it costs before you commit. */
export function PrepareDialog({ ctx, sheet, onClose }: { ctx: AppCtx; sheet: CharacterSheet; onClose: () => void }) {
  const mode = PREP_MODE[sheet.classId]!;
  const locked = useMemo(() => new Set(lockedSpells(sheet)), [sheet]);
  const pool = useMemo(() => preparablePool(sheet), [sheet]);
  const cpool = useMemo(() => cantripPool(sheet), [sheet]);
  const limit = preparedLimit(sheet);
  const cLimit = Math.max(cantripLimit(sheet), sheet.cantrips.filter((id) => SPELLS[id]?.classes.includes(sheet.classId)).length);
  const [spells, setSpells] = useState<string[]>(chosenSpells(sheet));
  const [cantrips, setCantrips] = useState<string[]>(sheet.cantrips.filter((id) => SPELLS[id]?.classes.includes(sheet.classId)));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      try { setQuote(await api<Quote>(`/characters/${sheet.id}/spells/quote`, { body: { spells, cantrips } })); } catch { setQuote(null); }
    }, 250);
    return () => clearTimeout(t);
  }, [spells, cantrips, sheet.id]);
  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ message: string }>(`/characters/${sheet.id}/spells`, { body: { spells, cantrips } });
      toast(r.message); await ctx.refreshCharacters(); onClose();
    } catch (e) { toast(errText(e), "error"); }
    setBusy(false);
  };
  const levels = [...new Set(pool.map((s) => s.level))].sort();
  const changes = (quote?.changedSpells ?? 0) + (quote?.changedCantrips ?? 0);
  return (
    <Modal wide title={`${sheet.name}'s spells`} onClose={onClose}>
      <p className="small">{MODE_TEXT[mode].long}</p>
      <h3>Cantrips ({cantrips.length}/{cLimit})</h3>
      <div className="chips">{cpool.map((s) => <SpellChip key={s.id} s={s} on={cantrips.includes(s.id)} onClick={() => toggle(cantrips, setCantrips, s.id, cLimit)} />)}</div>
      <h3>{mode === "swapOnLevel" ? "Spells known" : "Prepared spells"} ({spells.length}/{limit}){mode === "book" && <span className="muted small"> — from your spellbook</span>}</h3>
      {locked.size > 0 && <p className="small muted">Always prepared (free): {[...locked].map((id) => SPELLS[id]?.name).filter(Boolean).join(", ")}</p>}
      {levels.map((l) => (
        <div key={l}>
          <div className="small muted">Level {l}</div>
          <div className="chips">{pool.filter((s) => s.level === l).map((s) => <SpellChip key={s.id} s={s} on={spells.includes(s.id)} onClick={() => toggle(spells, setSpells, s.id, limit)} />)}</div>
        </div>
      ))}
      <div className={`quote ${quote && !quote.ok ? "error" : ""} small`}>
        {!quote ? "Checking…" : !changes ? "No changes yet. Click spells to add or remove them." : (
          <>
            {quote.changedSpells > 0 && <div>{quote.changedSpells} spell{quote.changedSpells === 1 ? "" : "s"} changed{quote.freeSpellSwapsUsed ? ` (${quote.freeSpellSwapsUsed} free swap${quote.freeSpellSwapsUsed === 1 ? "" : "s"})` : mode === "list" || mode === "book" ? " (free)" : ""}.</div>}
            {quote.changedCantrips > 0 && <div>{quote.changedCantrips} cantrip{quote.changedCantrips === 1 ? "" : "s"} changed{quote.freeCantripSwapsUsed ? ` (${quote.freeCantripSwapsUsed} free swap${quote.freeCantripSwapsUsed === 1 ? "" : "s"})` : ""}.</div>}
            {quote.cost > 0 && <div><strong>Training Yard fee: {quote.cost} gp</strong> (from {sheet.name}'s {sheet.gold} gp)</div>}
            {quote.reason && <div><strong>{quote.reason}</strong></div>}
          </>
        )}
      </div>
      <div className="row end">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || !quote?.ok || !changes} onClick={save}>{busy ? "Studying…" : quote?.cost ? `Retrain · ${quote.cost} gp` : "Save spells"}</button>
      </div>
    </Modal>
  );
}

function SpellChip({ s, on, onClick }: { s: SpellDef; on: boolean; onClick: () => void }) {
  return <button className={`chip ${on ? "sel" : ""}`} title={s.description} onClick={onClick}>{s.name}{s.concentration ? " ◷" : ""}</button>;
}

/** A step-by-step walkthrough of how spells work for this hero, highlighting each part of the sheet. */
export function SpellTutorial({ ctx, sheet, onClose, onChange }: { ctx: AppCtx; sheet: CharacterSheet; onClose: () => void; onChange?: () => void }) {
  const cls = CLASSES[sheet.classId];
  const sc = cls.spellcasting!;
  const mode = PREP_MODE[sheet.classId]!;
  const services = ctx.campaign?.services ?? [];
  const next = Math.min(5, sheet.level + 1);
  const nextMax = maxSpellLevelAt(sheet.classId, next);
  const steps: { title: string; target?: string; body: ReactNode }[] = [
    {
      title: `${sheet.name}'s magic`, body: <>
        <p>{cls.name}s cast spells using <strong>{ABILITY_NAMES[sc.ability]}</strong>. That score sets how hard your spells are to resist (<strong>save DC {spellSaveDc(sheet, sc.ability)}</strong>) and how well your spell attacks hit (<strong>{fmtMod(profBonus(sheet) + mod(sheet.abilities[sc.ability]))}</strong>).</p>
        <p>This walkthrough covers your spell slots, cantrips, your {mode === "swapOnLevel" ? "known spells" : "prepared spells"}, how to change them, and how your magic grows. Use <em>Next</em> to step through it.</p>
      </>,
    },
    {
      title: "Spell slots: your magical fuel", target: "slots", body: <>
        <p>Every spell of level 1 or higher uses up a <strong>spell slot</strong>. Your slots are shown as “Level 1 slots: 2/2” and so on. You can cast a spell using a higher slot than it needs to make it stronger (that's called <em>upcasting</em>; most damage and healing spells grow by a die).</p>
        <p>{sc.kind === "pact" ? "As a warlock your Pact Magic slots come back on a short rest as well as a long rest — so use them freely." : "Slots come back when you take a long rest (sleep at the Broken Lantern for 2 gp, or after an adventure)."}</p>
      </>,
    },
    {
      title: "Cantrips: magic at will", target: "cantrips", body: <>
        <p><strong>Cantrips</strong> cost no slot — cast them every turn if you like. Damage cantrips get stronger at level 5. You know {cantripLimit(sheet)} right now{sheet.classId === "paladin" || sheet.classId === "ranger" ? " (paladins and rangers don't get cantrips)" : ""}.</p>
        <p>Each time you gain a level you can swap one cantrip for another.</p>
      </>,
    },
    {
      title: mode === "swapOnLevel" ? "Spells known" : "Prepared spells", target: "prepared", body: <>
        <p>These are the spells you can cast today: <strong>{preparedLimit(sheet)}</strong> of your choice{lockedSpells(sheet).length ? <>, plus some that are <em>always prepared</em> by your subclass or class features (they don't count against the limit)</> : null}. They can be up to level <strong>{maxSpellLevel(sheet)}</strong> — the highest level of slot you have.</p>
        <p>Spells marked ◷ need <strong>concentration</strong>: you can only keep one going at a time, and taking damage can break it (a Constitution save).</p>
      </>,
    },
    ...(mode === "book" ? [{
      title: "Your spellbook", target: "book", body: <>
        <p>A wizard's power is the book. You have <strong>{sheet.spellbook?.length ?? 0}</strong> spells written in it, and you prepare {preparedLimit(sheet)} of them at a time. Greyed-out spells are in the book but not prepared.</p>
        <p>The book grows two ways: <strong>2 free spells each level</strong>, and <strong>copying spell scrolls</strong> — found as treasure or bought at Wren's Library (level 2). Copying costs 50 gp of inks per spell level (a level 1 scroll sells for {scrollPrice(1)} gp, so a new spell costs about {scrollPrice(1) + copyCost(1)} gp in all).</p>
      </>,
    }] : []),
    {
      title: "Changing your spells", target: "change", body: <>
        <p>{MODE_TEXT[mode].long}</p>
        <p>Use <strong>✎ Change spells</strong>. It shows what the change costs before you confirm. You can't change spells while out on an adventure.</p>
      </>,
    },
    {
      title: "Growing your magic", body: <>
        <ul>
          <li><strong>Level up</strong> — {sheet.level >= 5 ? "you're at the level cap (5). Prestige to start a new path." : <>at level {next} you'll {cantripLimit({ ...sheet, level: next }) > cantripLimit(sheet) ? "learn a new cantrip, " : ""}{mode === "book" ? "write 2 spells into your book" : "learn new spells"}{nextMax > maxSpellLevel(sheet) ? <> and unlock <strong>level {nextMax} spells</strong></> : ""}.</>}</li>
          {mode === "book" && <li><strong>Scrolls</strong> — copy them into your book (Spells panel → Scrolls in your pack).</li>}
          <li><strong>Training Yard</strong> — {services.includes("service:retrain") ? "open now" : "build it in town"}: retrain spells beyond your free swaps (10 gp a cantrip, {retrainCost(1)} gp per spell level).</li>
          {mode === "swapOnRest" && <li><strong>Long rest</strong> — earns your one free swap.</li>}
        </ul>
      </>,
    },
    {
      title: "Casting in a fight", body: <>
        <p>On your turn the combat panel lists your spells. Click one, then click the targets (or click a square to aim an area spell like a cone or sphere), pick which slot to spend, and press <strong>Cast</strong>.</p>
        <p>Most spells take your <strong>action</strong>; some take a <strong>bonus action</strong>. You can only cast one spell that uses a slot per turn. Narrative spells (marked “Narrative”) are for the Dungeon Master: use them in the story by describing what you do.</p>
        {sheet.classId === "paladin" && <p>Smite spells are different: hit with a melee attack first, then use <strong>Smite</strong>.</p>}
      </>,
    },
  ];
  const [i, setI] = useState(0);
  const step = steps[i];
  useEffect(() => {
    document.querySelectorAll(".tour-hl").forEach((e) => e.classList.remove("tour-hl"));
    if (!step.target) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (el) { el.classList.add("tour-hl"); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
    return () => { el?.classList.remove("tour-hl"); };
  }, [step.target]);
  return (
    <div className="tour-card" role="dialog" aria-label="Spell tutorial">
      <div className="row spread"><strong>✨ {step.title}</strong><span className="muted small">{i + 1}/{steps.length}</span></div>
      <div className="small tour-body">{step.body}</div>
      <div className="row end">
        <button className="tiny" onClick={onClose}>{i === steps.length - 1 ? "Close" : "Skip"}</button>
        {i > 0 && <button className="tiny" onClick={() => setI(i - 1)}>Back</button>}
        {i < steps.length - 1 ? <button className="tiny primary" onClick={() => setI(i + 1)}>Next</button>
          : onChange ? <button className="tiny primary" onClick={onChange}>Change my spells</button> : null}
      </div>
    </div>
  );
}
