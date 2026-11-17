import { useEffect, useMemo, useState } from "react";
import type { Ability, AbilityScores, BackgroundId, CharacterSheet, ClassId, CreateCharacterRequest, FeatId, RollResponse, Skill, SpeciesId } from "@tavern/engine";
import {
  ABILITIES, ABILITY_NAMES, BACKGROUNDS, CLASSES, FEATS, POINT_BUY_BUDGET, POINT_BUY_COST, SKILL_ABILITY, SKILL_NAMES, SPECIES, SPELLS,
  STANDARD_ARRAY, WEAPONS, armorClass, createCharacter, fmtMod, mod, skillBonus,
} from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, errText } from "../api";

interface QuestOption { id: string; name: string; description: string; goals: Record<string, number>; unlockText: string }

const ALL_SKILLS = Object.keys(SKILL_NAMES) as Skill[];
const ORIGIN_FEATS: FeatId[] = ["alert", "magicInitiateCleric", "magicInitiateWizard", "savageAttacker", "skilled", "tough"];
const EMPTY: AbilityScores = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };

export function CharacterCreate({ ctx }: { ctx: AppCtx }) {
  const unlocked = ctx.campaign?.campaign.unlockedClasses ?? ["fighter", "rogue", "cleric", "wizard"];
  const [name, setName] = useState("");
  const [species, setSpecies] = useState<SpeciesId>("human");
  const [classId, setClassId] = useState<ClassId>((unlocked[0] as ClassId) ?? "fighter");
  const [background, setBackground] = useState<BackgroundId>("soldier");
  const [method, setMethod] = useState<"standard" | "pointBuy" | "rolled">("standard");
  const [base, setBase] = useState<AbilityScores>({ ...CLASSES[classId].suggestedAbilities });
  const [rolled, setRolled] = useState<RollResponse | null>(null);
  const [bonusMode, setBonusMode] = useState<"21" | "111">("21");
  const [plus2, setPlus2] = useState<Ability>(BACKGROUNDS.soldier.abilityOptions[0]);
  const [plus1, setPlus1] = useState<Ability>(BACKGROUNDS.soldier.abilityOptions[2]);
  const [classSkills, setClassSkills] = useState<Skill[]>([]);
  const [extraSkills, setExtraSkills] = useState<Skill[]>([]);
  const [expertise, setExpertise] = useState<Skill[]>([]);
  const [pkg, setPkg] = useState("A");
  const [cantrips, setCantrips] = useState<string[]>([]);
  const [spells, setSpells] = useState<string[]>([]);
  const [masteries, setMasteries] = useState<string[]>([]);
  const [fightingStyle, setFightingStyle] = useState<CharacterSheet["fightingStyle"]>("defense");
  const [humanFeat, setHumanFeat] = useState<FeatId>("skilled");
  const [traits, setTraits] = useState(""); const [ideal, setIdeal] = useState(""); const [bond, setBond] = useState(""); const [flaw, setFlaw] = useState("");
  const [backstory, setBackstory] = useState("");
  const [quests, setQuests] = useState<QuestOption[]>([]);
  const [questId, setQuestId] = useState<string>("");
  const [hardcore, setHardcore] = useState(ctx.campaign?.campaign.settings.hardcore ?? false);
  const [asCompanion, setAsCompanion] = useState(false);
  const [busy, setBusy] = useState(false);

  const cls = CLASSES[classId];
  const bg = BACKGROUNDS[background];
  const sp = SPECIES[species];

  useEffect(() => {
    api<{ options: QuestOption[] }>("/quests/draw").then((r) => { setQuests(r.options); setQuestId(r.options[0]?.id ?? ""); }).catch(() => { /* optional */ });
  }, []);

  // reset dependent choices when class / background changes
  useEffect(() => {
    setClassSkills([]); setExpertise([]); setPkg(cls.equipment[0].id); setCantrips([]); setSpells([]); setMasteries([]);
    if (method === "standard") setBase({ ...cls.suggestedAbilities });
  }, [classId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPlus2(bg.abilityOptions[0]); setPlus1(bg.abilityOptions[1]);
    setClassSkills((s) => s.filter((x) => !bg.skills.includes(x)));
  }, [background]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeMethod = (m: typeof method) => {
    setMethod(m);
    if (m === "standard") setBase({ ...cls.suggestedAbilities });
    if (m === "pointBuy") setBase({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    if (m === "rolled") setBase({ ...EMPTY });
  };

  const doRoll = async () => {
    const r = await attempt(() => api<RollResponse>("/characters/roll", { body: {} }));
    if (r) { setRolled(r); setBase({ ...EMPTY }); }
  };

  const bonuses: Partial<AbilityScores> = bonusMode === "111"
    ? Object.fromEntries(bg.abilityOptions.map((a) => [a, 1]))
    : plus2 === plus1 ? { [plus2]: 2 } : { [plus2]: 2, [plus1]: 1 };

  const extraCount = (sp.bonusSkills ?? 0) + (sp.skillChoice ? 1 : 0) + (species === "human" && humanFeat === "skilled" ? 3 : 0);
  const extraPool = sp.skillChoice && !(sp.bonusSkills) ? sp.skillChoice : ALL_SKILLS;
  const classPool = cls.skillOptions.filter((s) => !bg.skills.includes(s));
  const allChosen = [...new Set([...bg.skills, ...classSkills, ...extraSkills])];

  const weaponPool = Object.values(WEAPONS).filter((w) => cls.weapons === "martial" || w.category === "simple" || (cls.weapons === "rogue" && (w.properties.includes("finesse") || w.properties.includes("light"))) || (cls.weapons === "monk" && w.kind === "melee" && w.properties.includes("light")));
  const casterSpells = cls.spellcasting ? Object.values(SPELLS).filter((s) => s.classes.includes(classId)) : [];
  const nCantrips = cls.spellcasting?.cantrips[1] ?? 0;
  const nSpells = cls.spellcasting?.prepared[1] ?? 0;

  const request: CreateCharacterRequest = {
    name: name.trim(), species, classId, background, abilityMethod: method, baseAbilities: base, abilityBonuses: bonuses,
    skills: [...classSkills, ...extraSkills], expertise: classId === "rogue" ? expertise : undefined, equipmentPackage: pkg,
    cantrips, spells, weaponMasteries: masteries, fightingStyle: classId === "fighter" ? fightingStyle : undefined,
    humanFeat: species === "human" ? humanFeat : undefined,
    personality: { traits, ideal, bond, flaw }, backstory, hardcore, rollToken: rolled?.rollToken, personalQuestId: questId || undefined, asCompanion,
  };

  const preview = useMemo(() => {
    try {
      const sheet = createCharacter({ ...request, name: request.name || "Preview", ownerId: "me", trustedRoll: true }, "preview");
      return { sheet, error: null as string | null };
    } catch (e) { return { sheet: null, error: errText(e) }; }
  }, [JSON.stringify(request)]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    const r = await attempt(() => api<{ character: CharacterSheet }>("/characters", { body: request }));
    setBusy(false);
    if (r) { await ctx.refreshCharacters(); ctx.go({ name: "sheet", id: r.character.id }); }
  };

  const toggleIn = (list: string[], set: (v: any) => void, id: string, max: number) => {
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else if (list.length < max) set([...list, id]);
  };

  // ability assignment for standard / rolled
  const pool = method === "standard" ? STANDARD_ARRAY : rolled?.scores ?? [];
  const assignValue = (a: Ability, v: number) => setBase({ ...base, [a]: v });
  const usedCounts = (v: number, except: Ability) => ABILITIES.filter((x) => x !== except && base[x] === v).length;
  const availableFor = (a: Ability) => {
    const counts = new Map<number, number>();
    for (const v of pool) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...new Set(pool)].filter((v) => usedCounts(v, a) < (counts.get(v) ?? 0));
  };
  const pbSpent = ABILITIES.reduce((s, a) => s + (POINT_BUY_COST[base[a]] ?? 99), 0);

  return (
    <div className="create">
      <div className="create-form stack">
        <section className="panel">
          <h1>Sign the Company Ledger</h1>
          <label>Name <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="What do they call you?" /></label>
        </section>

        <section className="panel">
          <h2>1. Species</h2>
          <div className="choice-grid">
            {Object.values(SPECIES).map((s) => (
              <button key={s.id} className={`choice ${species === s.id ? "sel" : ""}`} onClick={() => { setSpecies(s.id); setExtraSkills([]); }}>
                <strong>{s.name}</strong><span className="small muted">{s.description}</span>
              </button>
            ))}
          </div>
          <ul className="small traits">{sp.traits.map((t) => <li key={t.key}><strong>{t.name}.</strong> {t.description}</li>)}
            <li>Speed {sp.speed} ft{sp.darkvision ? `, Darkvision ${sp.darkvision} ft` : ""}, size {sp.size}.</li></ul>
          {species === "human" && (
            <label>Versatile — origin feat
              <select value={humanFeat} onChange={(e) => { setHumanFeat(e.target.value as FeatId); setExtraSkills([]); }}>
                {ORIGIN_FEATS.map((f) => <option key={f} value={f}>{FEATS[f].name}</option>)}
              </select>
              <span className="small muted">{FEATS[humanFeat].description}</span>
            </label>
          )}
        </section>

        <section className="panel">
          <h2>2. Class</h2>
          <div className="choice-grid">
            {Object.values(CLASSES).map((c) => {
              const locked = !unlocked.includes(c.id);
              return (
                <button key={c.id} disabled={locked} className={`choice ${classId === c.id ? "sel" : ""} ${locked ? "locked" : ""}`} onClick={() => setClassId(c.id)}>
                  <strong>{c.name}{locked ? " 🔒" : ""}</strong>
                  <span className="small muted">{locked ? "Unlocked when a hero retires with the right personal quest." : c.description}</span>
                  <span className="small">d{c.hitDie} · {c.primary.map((a) => a.toUpperCase()).join("/")}</span>
                </button>
              );
            })}
          </div>
          <ul className="small traits">{cls.features.filter((f) => f.level === 1).map((f) => <li key={f.key}><strong>{f.name}.</strong> {f.description}</li>)}</ul>
          {classId === "fighter" && (
            <label>Fighting style
              <select value={fightingStyle} onChange={(e) => setFightingStyle(e.target.value as CharacterSheet["fightingStyle"])}>
                <option value="defense">Defense (+1 AC in armor)</option>
                <option value="dueling">Dueling (+2 damage one-handed)</option>
                <option value="archery">Archery (+2 to ranged attacks)</option>
                <option value="greatWeapon">Great Weapon Fighting (treat 1-2 as 3)</option>
              </select>
            </label>
          )}
        </section>

        <section className="panel">
          <h2>3. Background</h2>
          <div className="choice-grid">
            {Object.values(BACKGROUNDS).map((b) => (
              <button key={b.id} className={`choice ${background === b.id ? "sel" : ""}`} onClick={() => setBackground(b.id)}>
                <strong>{b.name}</strong><span className="small muted">{b.description}</span>
                <span className="small">{b.abilityOptions.map((a) => a.toUpperCase()).join("/")} · {FEATS[b.feat].name} · {b.skills.map((s) => SKILL_NAMES[s]).join(", ")}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>4. Ability Scores</h2>
          <div className="radio-row">
            <label className="check"><input type="radio" checked={method === "standard"} onChange={() => changeMethod("standard")} /> Standard array</label>
            <label className="check"><input type="radio" checked={method === "pointBuy"} onChange={() => changeMethod("pointBuy")} /> Point buy ({POINT_BUY_BUDGET})</label>
            <label className="check"><input type="radio" checked={method === "rolled"} onChange={() => changeMethod("rolled")} /> Roll 4d6 (drop lowest)</label>
          </div>
          {method === "rolled" && (
            <div className="row">
              <button onClick={doRoll}>{rolled ? "Roll again" : "Roll the dice"}</button>
              {rolled && <span>Rolled: <strong>{rolled.scores.join(", ")}</strong></span>}
            </div>
          )}
          {method === "pointBuy" && <p className={pbSpent > POINT_BUY_BUDGET ? "error" : "small muted"}>Points spent: {pbSpent} / {POINT_BUY_BUDGET}</p>}
          <table className="abil-table">
            <thead><tr><th>Ability</th><th>Base</th><th>Bonus</th><th>Final</th></tr></thead>
            <tbody>
              {ABILITIES.map((a) => {
                const fin = Math.min(20, (base[a] || 0) + (bonuses[a] ?? 0));
                return (
                  <tr key={a}>
                    <td>{ABILITY_NAMES[a]}{cls.primary.includes(a) ? " ★" : ""}</td>
                    <td>
                      {method === "pointBuy" ? (
                        <span className="row nowrap">
                          <button className="tiny" disabled={base[a] <= 8} onClick={() => assignValue(a, base[a] - 1)}>−</button>
                          <strong>{base[a]}</strong>
                          <button className="tiny" disabled={base[a] >= 15 || pbSpent - POINT_BUY_COST[base[a]] + POINT_BUY_COST[base[a] + 1] > POINT_BUY_BUDGET} onClick={() => assignValue(a, base[a] + 1)}>+</button>
                        </span>
                      ) : (
                        <select value={base[a] || ""} onChange={(e) => assignValue(a, Number(e.target.value))} disabled={!pool.length}>
                          <option value="">—</option>
                          {availableFor(a).concat(base[a] && !availableFor(a).includes(base[a]) ? [base[a]] : []).sort((x, y) => y - x).map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      )}
                    </td>
                    <td>{bonuses[a] ? `+${bonuses[a]}` : ""}</td>
                    <td><strong>{base[a] ? fin : "—"}</strong> {base[a] ? <span className="muted">({fmtMod(mod(fin))})</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <h3>Background bonus ({bg.name}: {bg.abilityOptions.map((a) => a.toUpperCase()).join(", ")})</h3>
          <div className="radio-row">
            <label className="check"><input type="radio" checked={bonusMode === "21"} onChange={() => setBonusMode("21")} /> +2 / +1</label>
            <label className="check"><input type="radio" checked={bonusMode === "111"} onChange={() => setBonusMode("111")} /> +1 / +1 / +1</label>
          </div>
          {bonusMode === "21" && (
            <div className="row">
              <label>+2 <select value={plus2} onChange={(e) => setPlus2(e.target.value as Ability)}>{bg.abilityOptions.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}</option>)}</select></label>
              <label>+1 <select value={plus1} onChange={(e) => setPlus1(e.target.value as Ability)}>{bg.abilityOptions.filter((a) => a !== plus2).map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}</option>)}</select></label>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>5. Skills</h2>
          <p className="small muted">From your background: {bg.skills.map((s) => SKILL_NAMES[s]).join(", ")}.</p>
          <h3>Class skills — choose {cls.skillCount} ({classSkills.length}/{cls.skillCount})</h3>
          <div className="chips">
            {classPool.map((s) => (
              <button key={s} className={`chip ${classSkills.includes(s) ? "sel" : ""}`} onClick={() => { toggleIn(classSkills, setClassSkills, s, cls.skillCount); setExtraSkills(extraSkills.filter((x) => x !== s)); }}>
                {SKILL_NAMES[s]} <span className="muted">{SKILL_ABILITY[s].toUpperCase()}</span>
              </button>
            ))}
          </div>
          {extraCount > 0 && (
            <>
              <h3>{species === "elf" ? "Keen Senses" : "Extra skills"} — choose {extraCount} ({extraSkills.length}/{extraCount})</h3>
              <div className="chips">
                {extraPool.filter((s) => !bg.skills.includes(s) && !classSkills.includes(s)).map((s) => (
                  <button key={s} className={`chip ${extraSkills.includes(s) ? "sel" : ""}`} onClick={() => toggleIn(extraSkills, setExtraSkills, s, extraCount)}>{SKILL_NAMES[s]}</button>
                ))}
              </div>
            </>
          )}
          {classId === "rogue" && (
            <>
              <h3>Expertise — choose 2 ({expertise.length}/2)</h3>
              <div className="chips">
                {allChosen.map((s) => <button key={s} className={`chip ${expertise.includes(s) ? "sel" : ""}`} onClick={() => toggleIn(expertise, setExpertise, s, 2)}>{SKILL_NAMES[s]}</button>)}
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>6. Equipment</h2>
          {cls.equipment.map((p) => (
            <label key={p.id} className="check"><input type="radio" checked={pkg === p.id} onChange={() => setPkg(p.id)} /> {p.label} <span className="muted small">+ {p.gold} gp</span></label>
          ))}
          <p className="small muted">Your background adds: {bg.equipment.map((e) => `${e.qty > 1 ? `${e.qty}× ` : ""}${e.itemId}`).join(", ") || "nothing"} and {bg.gold} gp.</p>
          {cls.masteryCount > 0 && (
            <>
              <h3>Weapon masteries — choose {cls.masteryCount} ({masteries.length}/{cls.masteryCount})</h3>
              <p className="small muted">Leave empty to default to your starting weapons.</p>
              <div className="chips">
                {weaponPool.map((w) => (
                  <button key={w.id} className={`chip ${masteries.includes(w.id) ? "sel" : ""}`} onClick={() => toggleIn(masteries, setMasteries, w.id, cls.masteryCount)} title={`${w.damage} ${w.damageType}, ${w.properties.join(", ")}`}>
                    {w.name} <span className="muted">{w.mastery}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {cls.spellcasting && (
          <section className="panel">
            <h2>7. Spells</h2>
            <p className="small muted">Leave blank and sensible defaults will be chosen. {{
              cleric: "Clerics can re-prepare any cleric spells between adventures, so nothing here is permanent.",
              druid: "Druids can re-prepare any druid spells between adventures, so nothing here is permanent.",
              wizard: "These go into your spellbook along with two more; you prepare from the book and can change them between adventures.",
              paladin: "Paladins can swap one prepared spell after each long rest.",
              ranger: "Rangers can swap one prepared spell after each long rest.",
              bard: "Bards can swap one spell each time they gain a level.",
              sorcerer: "Sorcerers can swap one spell each time they gain a level.",
              warlock: "Warlocks can swap one spell each time they gain a level.",
            }[classId as string] ?? ""} Open “❔ How spells work” on the character sheet for the full walkthrough.</p>
            {nCantrips > 0 && (
              <>
                <h3>Cantrips ({cantrips.length}/{nCantrips})</h3>
                <div className="chips">
                  {casterSpells.filter((s) => s.level === 0).map((s) => <button key={s.id} title={s.description} className={`chip ${cantrips.includes(s.id) ? "sel" : ""}`} onClick={() => toggleIn(cantrips, setCantrips, s.id, nCantrips)}>{s.name}</button>)}
                </div>
              </>
            )}
            <h3>1st-level spells prepared ({spells.length}/{nSpells})</h3>
            <div className="chips">
              {casterSpells.filter((s) => s.level === 1).map((s) => <button key={s.id} title={s.description} className={`chip ${spells.includes(s.id) ? "sel" : ""}`} onClick={() => toggleIn(spells, setSpells, s.id, nSpells)}>{s.name}</button>)}
            </div>
            <ul className="small traits">
              {[...cantrips, ...spells].map((id) => <li key={id}><strong>{SPELLS[id]?.name}.</strong> {SPELLS[id]?.description}</li>)}
            </ul>
          </section>
        )}

        <section className="panel">
          <h2>8. Personality &amp; Story</h2>
          <p className="small muted">The AI DM and companions read these to roleplay with (and against) you.</p>
          <label>Traits <input value={traits} onChange={(e) => setTraits(e.target.value)} /></label>
          <label>Ideal <input value={ideal} onChange={(e) => setIdeal(e.target.value)} /></label>
          <label>Bond <input value={bond} onChange={(e) => setBond(e.target.value)} /></label>
          <label>Flaw <input value={flaw} onChange={(e) => setFlaw(e.target.value)} /></label>
          <label>Backstory <textarea rows={4} value={backstory} onChange={(e) => setBackstory(e.target.value)} /></label>
        </section>

        <section className="panel">
          <h2>9. Personal Quest</h2>
          <p className="small muted">Every mercenary has a reason. Fulfil it and your hero retires — unlocking something new for the whole company.</p>
          {!quests.length && <p className="muted">No quests drawn (the server will assign one).</p>}
          {quests.map((q) => (
            <label key={q.id} className={`choice wide ${questId === q.id ? "sel" : ""}`}>
              <input type="radio" checked={questId === q.id} onChange={() => setQuestId(q.id)} />
              <span><strong>{q.name}</strong> — {q.description}<br /><span className="small muted">Goal: {Object.entries(q.goals).map(([k, v]) => `${v} ${k}`).join(", ")} · Unlocks: {q.unlockText}</span></span>
            </label>
          ))}
          <label className="check"><input type="checkbox" checked={hardcore} onChange={(e) => setHardcore(e.target.checked)} /> Hardcore (death is permanent — no resurrection)</label>
          <label className="check"><input type="checkbox" checked={asCompanion} onChange={(e) => setAsCompanion(e.target.checked)} /> Make this an AI companion (a tavern regular anyone can recruit)</label>
        </section>
      </div>

      <aside className="create-preview panel">
        <h2>{name || "Unnamed"}</h2>
        <div className="small muted">{sp.name} {cls.name} · {bg.name}</div>
        {preview.sheet ? <PreviewSheet sheet={preview.sheet} /> : <p className="error small">{preview.error}</p>}
        <button className="primary block" disabled={busy || !name.trim() || !preview.sheet || (method === "rolled" && !rolled)} onClick={submit}>{busy ? "Signing…" : "Sign the ledger"}</button>
        {!name.trim() && <p className="small muted">Give your hero a name.</p>}
      </aside>
    </div>
  );
}

function PreviewSheet({ sheet }: { sheet: CharacterSheet }) {
  return (
    <div className="preview">
      <div className="stats-row">
        <div className="statbox"><span>HP</span><strong>{sheet.maxHp}</strong></div>
        <div className="statbox"><span>AC</span><strong>{armorClass(sheet)}</strong></div>
        <div className="statbox"><span>Speed</span><strong>{SPECIES[sheet.species].speed}</strong></div>
        <div className="statbox"><span>Gold</span><strong>{sheet.gold}</strong></div>
      </div>
      <div className="abil-mini">
        {ABILITIES.map((a) => <div key={a}><span>{a.toUpperCase()}</span><strong>{sheet.abilities[a]}</strong><small>{fmtMod(mod(sheet.abilities[a]))}</small></div>)}
      </div>
      <div className="small"><strong>Skills:</strong> {sheet.skillProficiencies.map((s) => `${SKILL_NAMES[s]} ${fmtMod(skillBonus(sheet, s))}${sheet.expertise.includes(s) ? "*" : ""}`).join(", ")}</div>
      <div className="small"><strong>Feats:</strong> {sheet.feats.map((f) => FEATS[f].name).join(", ")}</div>
      {sheet.weaponMasteries.length > 0 && <div className="small"><strong>Masteries:</strong> {sheet.weaponMasteries.map((w) => `${WEAPONS[w]?.name} (${WEAPONS[w]?.mastery})`).join(", ")}</div>}
      {(sheet.cantrips.length > 0 || sheet.spellsKnown.length > 0) && <div className="small"><strong>Spells:</strong> {[...sheet.cantrips, ...sheet.spellsKnown].map((s) => SPELLS[s]?.name ?? s).join(", ")}</div>}
    </div>
  );
}
