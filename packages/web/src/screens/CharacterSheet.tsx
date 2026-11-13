import { Portrait } from "../components/art/Portrait";
import { useState } from "react";
import type { Ability, AbilityScores, CharacterSheet } from "@tavern/engine";
import {
  ABILITIES, ABILITY_NAMES, ARMOR, BACKGROUNDS, CLASSES, FEATS, FULL_CASTER_SLOTS, GEAR, HALF_CASTER_SLOTS, PACT_SLOTS, SKILL_ABILITY, SKILL_NAMES, SPECIES, SPELLS, WEAPONS,
  armorClass, canLevelUp, fmtMod, itemName, mod, profBonus, resourcesRemaining, saveBonus, skillBonus, spellSaveDc, weaponAttacks,
} from "@tavern/engine";
import type { Skill } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, toast } from "../api";
import { HpBar, Modal, Pill, XpBar, classLabel, humanize } from "../components/ui";

export function CharacterSheetView({ ctx, id }: { ctx: AppCtx; id: string }) {
  const sheet = [...ctx.characters, ...ctx.companions, ...ctx.others].find((c) => c.id === id);
  const [levelOpen, setLevelOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "retire" | "prestige" | "delete">(null);
  if (!sheet) return <div className="panel">Character not found. <button className="linkbtn" onClick={() => ctx.go({ name: "characters" })}>Back</button></div>;
  const mine = sheet.ownerId === ctx.user.id;
  const cls = CLASSES[sheet.classId];
  const pb = profBonus(sheet);
  const attacks = weaponAttacks(sheet);
  const res = resourcesRemaining(sheet);
  const spellAb = cls.spellcasting?.ability;

  const post = async (path: string, body: unknown = {}) => {
    const r = await attempt(() => api<{ character?: CharacterSheet; notes?: string[]; unlockText?: string; message?: string }>(`/characters/${sheet.id}${path}`, { body }));
    if (r) {
      for (const n of r.notes ?? []) toast(n);
      if (r.unlockText) toast(r.unlockText);
      if (r.message) toast(r.message);
      await ctx.refreshCharacters();
      await ctx.refreshCampaign();
    }
    return r;
  };
  const doDelete = async () => {
    const r = await attempt(() => api(`/characters/${sheet.id}`, { method: "DELETE" }));
    if (r !== undefined) { await ctx.refreshCharacters(); ctx.go({ name: "characters" }); }
  };

  return (
    <div className="sheet stack printed">
      <section className="panel">
        <div className="row spread">
          <div className="sheet-title">
            <Portrait seed={sheet.id} species={sheet.species} classId={sheet.classId} size={96} dead={sheet.dead} />
            <div>
            <h1>{sheet.name} {sheet.prestige > 0 && <span className="prestige">{"★".repeat(sheet.prestige)}</span>}</h1>
            <div className="muted">{classLabel(sheet)}{sheet.subclass ? ` (${cls.subclass.name})` : ""} · {BACKGROUNDS[sheet.background].name}</div>
            <div className="row">
              {sheet.dead && <Pill kind="bad">Dead</Pill>}
              {sheet.retired && <Pill kind="muted">Retired</Pill>}
              {sheet.hardcore && <Pill kind="bad">Hardcore</Pill>}
              {sheet.heroicInspiration && <Pill kind="good">Heroic Inspiration</Pill>}
              {sheet.exhaustion > 0 && <Pill kind="warn">Exhaustion {sheet.exhaustion}</Pill>}
              {sheet.conditions.map((c) => <Pill key={c} kind="warn">{c}</Pill>)}
            </div>
            </div>
          </div>
          <button onClick={() => ctx.go({ name: "characters" })}>← Roster</button>
        </div>
        <div className="stats-row">
          <div className="statbox"><span>AC</span><strong>{armorClass(sheet)}</strong></div>
          <div className="statbox"><span>Speed</span><strong>{SPECIES[sheet.species].speed}</strong></div>
          <div className="statbox"><span>Prof.</span><strong>{fmtMod(pb)}</strong></div>
          <div className="statbox"><span>Init.</span><strong>{fmtMod(mod(sheet.abilities.dex) + (sheet.feats.includes("alert") ? pb : 0))}</strong></div>
          <div className="statbox"><span>Hit Dice</span><strong>{sheet.hitDice}/{sheet.level}d{cls.hitDie}</strong></div>
          <div className="statbox"><span>Gold</span><strong>{sheet.gold}</strong></div>
        </div>
        <HpBar hp={sheet.hp} max={sheet.maxHp} temp={sheet.tempHp} />
        <XpBar sheet={sheet} />
        {mine && !sheet.retired && (
          <div className="row">
            {canLevelUp(sheet) && <button className="primary" onClick={() => setLevelOpen(true)}>⬆ Level up</button>}
            <button disabled={sheet.dead || sheet.hitDice <= 0 || sheet.hp >= sheet.maxHp} onClick={() => post("/rest", { type: "short", hitDice: Math.min(sheet.hitDice, Math.max(1, Math.ceil((sheet.maxHp - sheet.hp) / (cls.hitDie / 2 + 1)))) })}>Short rest</button>
            <button disabled={sheet.dead || sheet.gold < 2} onClick={() => post("/rest", { type: "long" })}>Long rest at the inn (2 gp)</button>
            {sheet.personalQuest?.complete && <button className="primary" onClick={() => setConfirm("retire")}>Retire</button>}
            {sheet.level >= 5 && <button onClick={() => setConfirm("prestige")}>Prestige</button>}
            <button className="danger" onClick={() => setConfirm("delete")}>Delete</button>
          </div>
        )}
      </section>

      <div className="grid3">
        <section className="panel">
          <h2>Abilities</h2>
          <div className="abil-mini big">
            {ABILITIES.map((a) => <div key={a}><span>{a.toUpperCase()}</span><strong>{sheet.abilities[a]}</strong><small>{fmtMod(mod(sheet.abilities[a]))}</small></div>)}
          </div>
          <h3>Saving throws</h3>
          <ul className="kv">
            {ABILITIES.map((a) => <li key={a}><span>{sheet.saveProficiencies.includes(a) ? "●" : "○"} {ABILITY_NAMES[a]}</span><strong>{fmtMod(saveBonus(sheet, a))}</strong></li>)}
          </ul>
          <h3>Skills</h3>
          <ul className="kv">
            {(Object.keys(SKILL_NAMES) as Skill[]).map((s) => (
              <li key={s} className={sheet.skillProficiencies.includes(s) ? "prof" : ""}>
                <span>{sheet.expertise.includes(s) ? "◆" : sheet.skillProficiencies.includes(s) ? "●" : "○"} {SKILL_NAMES[s]} <span className="muted small">{SKILL_ABILITY[s]}</span></span>
                <strong>{fmtMod(skillBonus(sheet, s))}</strong>
              </li>
            ))}
          </ul>
          <p className="small muted">Passive Perception {10 + skillBonus(sheet, "perception")}</p>
        </section>

        <section className="panel">
          <h2>Attacks</h2>
          <ul className="kv">
            {attacks.map((a) => (
              <li key={a.id}><span>{a.name} {a.mastery && <Pill kind="muted">{a.mastery}</Pill>}<div className="small muted">{a.kind}{a.range ? ` ${a.range[0]}/${a.range[1]} ft` : a.reach > 5 ? ` reach ${a.reach}` : ""}</div></span>
                <strong>{fmtMod(a.toHit)} · {a.damage}{a.damageBonus ? fmtMod(a.damageBonus) : ""} {a.damageType}</strong></li>
            ))}
          </ul>
          {cls.spellcasting && spellAb && (
            <>
              <h2>Spellcasting</h2>
              <p className="small">Ability {ABILITY_NAMES[spellAb]} · Save DC {spellSaveDc(sheet, spellAb)} · Attack {fmtMod(pb + mod(sheet.abilities[spellAb]))}</p>
              <div className="row">
                {sheet.spellSlots.map((n, lvl) => lvl > 0 && n > 0 ? <Pill key={lvl}>L{lvl}: {n - (sheet.spellSlotsUsed[lvl] ?? 0)}/{n}</Pill> : null)}
              </div>
            </>
          )}
          {(sheet.cantrips.length > 0 || sheet.spellsKnown.length > 0) && (
            <ul className="spells">
              {[...sheet.cantrips, ...sheet.spellsKnown].map((s) => SPELLS[s]).filter(Boolean).sort((a, b) => a.level - b.level).map((s) => (
                <li key={s.id}><strong>{s.name}</strong> <span className="muted small">{s.level === 0 ? "cantrip" : `level ${s.level}`} · {s.castingTime}{s.concentration ? " · conc." : ""}</span><div className="small">{s.description}</div></li>
              ))}
            </ul>
          )}
          <h2>Resources</h2>
          <ul className="kv">
            {Object.entries(res).map(([k, v]) => <li key={k}><span>{humanize(k)}</span><strong>{v}</strong></li>)}
            {!Object.keys(res).length && <li className="muted">None</li>}
          </ul>
        </section>

        <section className="panel">
          <h2>Features &amp; Traits</h2>
          <ul className="traits small">
            {cls.features.filter((f) => f.level <= sheet.level).map((f) => <li key={f.key + f.level}><strong>{f.name}</strong> <span className="muted">(L{f.level})</span>. {f.description}</li>)}
            {SPECIES[sheet.species].traits.map((t) => <li key={t.key}><strong>{t.name}</strong>. {t.description}</li>)}
            {sheet.feats.map((f) => <li key={f}><strong>{FEATS[f].name}</strong>. {FEATS[f].description}</li>)}
            {sheet.fightingStyle && <li><strong>Fighting Style:</strong> {humanize(sheet.fightingStyle)}</li>}
            {sheet.weaponMasteries.length > 0 && <li><strong>Weapon Mastery:</strong> {sheet.weaponMasteries.map((w) => `${WEAPONS[w]?.name} (${WEAPONS[w]?.mastery})`).join(", ")}</li>}
          </ul>
          <h2>Inventory</h2>
          <ul className="kv">
            {sheet.inventory.map((i) => {
              const equippable = !!(WEAPONS[i.itemId] || ARMOR[i.itemId]);
              return (
                <li key={i.itemId}>
                  <span>{itemName(i.itemId)}{i.qty > 1 ? ` ×${i.qty}` : ""}<div className="small muted">{GEAR[i.itemId]?.description ?? ""}</div></span>
                  {equippable && mine ? (
                    <button className={`tiny ${i.equipped ? "on" : ""}`} onClick={() => post("/equip", { itemId: i.itemId, equipped: !i.equipped })}>{i.equipped ? "Equipped" : "Equip"}</button>
                  ) : i.equipped ? <Pill>equipped</Pill> : null}
                </li>
              );
            })}
          </ul>
          <h2>Personal Quest</h2>
          {sheet.personalQuest ? (
            <div>
              <strong>{humanize(sheet.personalQuest.questId)}</strong> {sheet.personalQuest.complete && <Pill kind="good">Complete</Pill>}
              <ul className="kv">{Object.entries(sheet.personalQuest.counters).map(([k, v]) => <li key={k}><span>{humanize(k)}</span><strong>{Math.floor(v)}</strong></li>)}</ul>
            </div>
          ) : <p className="muted">None.</p>}
          <h2>Record</h2>
          <ul className="kv small">
            <li><span>Scenarios completed</span><strong>{sheet.stats.scenariosCompleted.length}</strong></li>
            <li><span>Gold earned</span><strong>{sheet.stats.goldEarned}</strong></li>
            <li><span>Critical hits</span><strong>{sheet.stats.criticals}</strong></li>
            <li><span>Times knocked out</span><strong>{sheet.stats.knockouts}</strong></li>
            {Object.entries(sheet.stats.kills).map(([k, v]) => <li key={k}><span>{humanize(k)}</span><strong>{Math.floor(v)}</strong></li>)}
          </ul>
          {sheet.personality && (sheet.personality.traits || sheet.personality.ideal) && (
            <>
              <h2>Personality</h2>
              <p className="small"><strong>Traits:</strong> {sheet.personality.traits}<br /><strong>Ideal:</strong> {sheet.personality.ideal}<br /><strong>Bond:</strong> {sheet.personality.bond}<br /><strong>Flaw:</strong> {sheet.personality.flaw}</p>
            </>
          )}
          {sheet.backstory && <><h2>Backstory</h2><p className="small prose">{sheet.backstory}</p></>}
        </section>
      </div>

      {levelOpen && <LevelUpDialog sheet={sheet} onClose={() => setLevelOpen(false)} onSubmit={async (body) => { const r = await post("/levelup", body); if (r) setLevelOpen(false); }} />}
      {confirm && (
        <Modal title={confirm === "retire" ? "Retire this hero?" : confirm === "prestige" ? "Take Prestige?" : "Delete character?"} onClose={() => setConfirm(null)}>
          <p>
            {confirm === "retire" && "Your hero hangs up their sword at the Broken Lantern. Their lantern joins the wall, and their personal quest's unlock becomes available to the whole company."}
            {confirm === "prestige" && "Your hero returns to level 1 with their items, gaining a prestige star and its permanent boon."}
            {confirm === "delete" && "This permanently removes the character. This can't be undone."}
          </p>
          <div className="row end">
            <button onClick={() => setConfirm(null)}>Cancel</button>
            <button className={confirm === "delete" ? "danger" : "primary"} onClick={async () => {
              const c = confirm; setConfirm(null);
              if (c === "delete") await doDelete(); else await post(`/${c}`);
            }}>Confirm</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function LevelUpDialog({ sheet, onClose, onSubmit }: { sheet: CharacterSheet; onClose: () => void; onSubmit: (b: { asi?: Partial<AbilityScores>; newSpells?: string[]; newCantrips?: string[]; fightingStyle?: CharacterSheet["fightingStyle"]; expertise?: Skill[] }) => void }) {
  const cls = CLASSES[sheet.classId];
  const next = sheet.level + 1;
  const [asiMode, setAsiMode] = useState<"2" | "11">("2");
  const [a1, setA1] = useState<Ability>(cls.primary[0]);
  const [a2, setA2] = useState<Ability>("con");
  const [spells, setSpells] = useState<string[]>([]);
  const [cantrips, setCantrips] = useState<string[]>([]);
  const table = cls.spellcasting?.kind === "half" ? HALF_CASTER_SLOTS : cls.spellcasting?.kind === "pact" ? PACT_SLOTS : FULL_CASTER_SLOTS;
  const [style, setStyle] = useState<CharacterSheet["fightingStyle"]>("defense");
  const [expertise, setExpertise] = useState<Skill[]>([]);
  const wantsStyle = next === 2 && (sheet.classId === "paladin" || sheet.classId === "ranger");
  const wantsExpertise = next === 2 && sheet.classId === "bard";
  const maxSpellLevel = cls.spellcasting ? (table[next]?.length ?? 1) - 1 : 0;
  const prepNow = sheet.spellsKnown.filter((s) => SPELLS[s]?.classes.includes(sheet.classId)).length;
  const prepWant = cls.spellcasting?.prepared[next] ?? 0;
  const newSpellCount = Math.max(0, prepWant - prepNow);
  const cantNow = sheet.cantrips.filter((s) => SPELLS[s]?.classes.includes(sheet.classId)).length;
  const newCantripCount = Math.max(0, (cls.spellcasting?.cantrips[next] ?? 0) - cantNow);
  const pool = Object.values(SPELLS).filter((s) => s.classes.includes(sheet.classId) && s.level >= 1 && s.level <= maxSpellLevel && !sheet.spellsKnown.includes(s.id));
  const cpool = Object.values(SPELLS).filter((s) => s.classes.includes(sheet.classId) && s.level === 0 && !sheet.cantrips.includes(s.id));
  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) => set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);
  const feats = cls.features.filter((f) => f.level === next);
  return (
    <Modal title={`${sheet.name} reaches level ${next}`} onClose={onClose}>
      <p>HP increases by {cls.hitDie / 2 + 1 + mod(sheet.abilities.con)}{sheet.species === "dwarf" ? " +1 (Dwarven Toughness)" : ""}.</p>
      <ul className="traits small">{feats.map((f) => <li key={f.key}><strong>{f.name}.</strong> {f.description}</li>)}</ul>
      {next === 4 && (
        <>
          <h3>Ability Score Improvement</h3>
          <div className="radio-row">
            <label className="check"><input type="radio" checked={asiMode === "2"} onChange={() => setAsiMode("2")} /> +2 to one</label>
            <label className="check"><input type="radio" checked={asiMode === "11"} onChange={() => setAsiMode("11")} /> +1 to two</label>
          </div>
          <div className="row">
            <select value={a1} onChange={(e) => setA1(e.target.value as Ability)}>{ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]} ({sheet.abilities[a]})</option>)}</select>
            {asiMode === "11" && <select value={a2} onChange={(e) => setA2(e.target.value as Ability)}>{ABILITIES.filter((a) => a !== a1).map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]} ({sheet.abilities[a]})</option>)}</select>}
          </div>
        </>
      )}
      {wantsStyle && (
        <>
          <h3>Fighting Style</h3>
          <select value={style} onChange={(e) => setStyle(e.target.value as CharacterSheet["fightingStyle"])}>
            <option value="defense">Defense (+1 AC in armor)</option>
            <option value="dueling">Dueling (+2 damage, one-handed)</option>
            <option value="greatWeapon">Great Weapon Fighting</option>
            <option value="archery">Archery (+2 ranged attack)</option>
          </select>
        </>
      )}
      {wantsExpertise && (
        <>
          <h3>Expertise ({expertise.length}/2)</h3>
          <div className="chips">{sheet.skillProficiencies.filter((k) => !sheet.expertise.includes(k)).map((k) => (
            <button key={k} className={`chip ${expertise.includes(k) ? "sel" : ""}`} onClick={() => setExpertise(expertise.includes(k) ? expertise.filter((x) => x !== k) : expertise.length < 2 ? [...expertise, k] : expertise)}>{SKILL_NAMES[k]}</button>
          ))}</div>
        </>
      )}
      {newCantripCount > 0 && (
        <>
          <h3>New cantrip ({cantrips.length}/{newCantripCount})</h3>
          <div className="chips">{cpool.map((s) => <button key={s.id} className={`chip ${cantrips.includes(s.id) ? "sel" : ""}`} title={s.description} onClick={() => toggle(cantrips, setCantrips, s.id, newCantripCount)}>{s.name}</button>)}</div>
        </>
      )}
      {newSpellCount > 0 && (
        <>
          <h3>New prepared spells ({spells.length}/{newSpellCount}) — up to level {maxSpellLevel}</h3>
          <p className="small muted">Unchosen picks are filled automatically.</p>
          <div className="chips">{pool.map((s) => <button key={s.id} className={`chip ${spells.includes(s.id) ? "sel" : ""}`} title={s.description} onClick={() => toggle(spells, setSpells, s.id, newSpellCount)}>{s.name} <span className="muted">L{s.level}</span></button>)}</div>
        </>
      )}
      <div className="row end">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => onSubmit({
          asi: next === 4 ? (asiMode === "2" ? { [a1]: 2 } : { [a1]: 1, [a2]: 1 }) : undefined,
          newSpells: spells.length ? spells : undefined,
          newCantrips: cantrips.length ? cantrips : undefined,
          fightingStyle: wantsStyle ? style : undefined,
          expertise: wantsExpertise && expertise.length ? expertise : undefined,
        })}>Level up</button>
      </div>
    </Modal>
  );
}
