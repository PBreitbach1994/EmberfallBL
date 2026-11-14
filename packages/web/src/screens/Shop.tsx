import { useState } from "react";
import { REWARDS, type RewardItem, type RewardsView } from "@tavern/engine";
import type { AppCtx } from "../App";
import { api, attempt, toast } from "../api";
import { Modal, Pill } from "../components/ui";
import { DieFace } from "../components/DiceArena";

export function Shop({ ctx }: { ctx: AppCtx }) {
  const [tab, setTab] = useState<"dice" | "backdrop" | "story">("dice");
  const [using, setUsing] = useState<RewardItem | null>(null);
  const r = ctx.rewards;
  if (!r) return <div className="panel">Opening the Curio Shop…</div>;

  const act = async (path: string, body: unknown) => {
    const res = await attempt(() => api<{ message: string; rewards: RewardsView }>(path, { body }));
    if (res) { toast(res.message, "info"); ctx.setRewards(res.rewards); }
    return res;
  };

  return (
    <div className="stack shop">
      <section className="panel shop-head">
        <div className="row spread">
          <div>
            <h1>The Curio Shop</h1>
            <p className="muted">Old Ysolde's cluttered stall by the tavern door. She only takes Embers — earned by finishing adventures, felling foes, levelling up and fulfilling personal quests.</p>
          </div>
          <div className="ember-balance" title={`${r.lifetime} earned all-time`}>🔥 <strong>{r.embers}</strong><small>Embers</small></div>
        </div>
        <div className="tabs">
          <button className={tab === "dice" ? "active" : ""} onClick={() => setTab("dice")}>Dice</button>
          <button className={tab === "backdrop" ? "active" : ""} onClick={() => setTab("backdrop")}>Backgrounds</button>
          <button className={tab === "story" ? "active" : ""} onClick={() => setTab("story")}>Story</button>
        </div>
      </section>

      <section className="shop-grid">
        {REWARDS.filter((i) => i.kind === tab).map((item) => {
          const owned = r.owned.includes(item.id);
          const equipped = r.equipped.dice === item.id || r.equipped.backdrop === item.id;
          const count = r.consumables[item.id] ?? 0;
          const afford = r.embers >= item.price;
          return (
            <div key={item.id} className={`panel shop-card ${equipped ? "equipped" : ""}`}>
              <Preview item={item} />
              <h3>{item.name}</h3>
              <p className="small muted">{item.description}</p>
              <div className="row spread shop-actions">
                <span className="price">{item.price ? <>🔥 {item.price}</> : "Free"}</span>
                {item.kind !== "story" ? (
                  equipped ? <Pill>Equipped</Pill>
                    : owned ? <button onClick={() => act("/rewards/equip", { itemId: item.id })}>Equip</button>
                    : <button className="primary" disabled={!afford} onClick={() => act("/rewards/buy", { itemId: item.id })}>Buy</button>
                ) : item.consumable && item.id === "story:map" ? (
                  <span className="row">{count > 0 && <Pill>{count} owned</Pill>}<button className="primary" disabled={!afford || count >= (item.max ?? 99)} onClick={() => act("/rewards/buy", { itemId: item.id })}>Buy</button></span>
                ) : (
                  <span className="row">{count > 0 && <Pill>{count} owned</Pill>}
                    {item.consumable && <button disabled={!afford || count >= (item.max ?? 99)} onClick={() => act("/rewards/buy", { itemId: item.id })}>Buy</button>}
                    <button className="primary" disabled={!ctx.characters.length || (!count && !afford)} onClick={() => setUsing(item)}>Use on a hero</button>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel">
        <h2>Ember ledger</h2>
        <ul className="ledger">
          {r.ledger.map((l, i) => (
            <li key={i}><span className={l.amount > 0 ? "plus" : l.amount < 0 ? "minus" : ""}>{l.amount > 0 ? `+${l.amount}` : l.amount || "·"}</span> {l.reason} <small className="muted">{new Date(l.t).toLocaleDateString()}</small></li>
          ))}
        </ul>
      </section>

      {using && <UseDialog ctx={ctx} item={using} onClose={() => setUsing(null)} onUse={async (characterId, text) => { const res = await act("/rewards/use", { itemId: using.id, characterId, text }); if (res) setUsing(null); }} />}
    </div>
  );
}

function Preview({ item }: { item: RewardItem }) {
  if (item.dice) {
    return (
      <div className="shop-preview dice-preview" style={{ ["--felt" as string]: "#1f5a3a" }}>
        <DieFace sides={20} value={20} palette={item.dice.d20} glow={item.dice.glow} />
        <DieFace sides={6} value={6} palette={item.dice.damage} />
        <DieFace sides={8} value={7} palette={item.dice.heal} />
      </div>
    );
  }
  if (item.backdrop) {
    return (
      <div className="shop-preview" style={{ background: item.backdrop.page }}>
        <div className="mini-felt" style={{ background: item.backdrop.felt }} />
        <span className="mini-accent" style={{ background: item.backdrop.accent }} />
      </div>
    );
  }
  const icon: Record<string, string> = { "story:map": "🗺", "story:inspiration": "✨", "story:epithet": "🏷", "story:ballad": "🎻" };
  return <div className="shop-preview story-preview">{icon[item.id] ?? "📜"}</div>;
}

function UseDialog({ ctx, item, onClose, onUse }: { ctx: AppCtx; item: RewardItem; onClose: () => void; onUse: (characterId: string, text?: string) => void }) {
  const heroes = ctx.characters.filter((c) => !c.retired && !c.dead);
  const [who, setWho] = useState(heroes[0]?.id ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={item.name} onClose={onClose}>
      <p className="muted">{item.description}</p>
      <label>Hero
        <select value={who} onChange={(e) => setWho(e.target.value)}>
          {heroes.map((c) => <option key={c.id} value={c.id}>{c.name}{c.epithet ? ` ${c.epithet}` : ""}</option>)}
        </select>
      </label>
      {item.needsText && (
        <label>Epithet
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={32} placeholder="the Unbroken" autoFocus />
        </label>
      )}
      {item.id === "story:ballad" && <p className="small muted">The bard writes it from your hero's real deeds; it's added to their backstory and the campaign chronicle.</p>}
      <div className="row">
        <button className="primary" disabled={!who || busy || (item.needsText && text.trim().length < 3)} onClick={async () => { setBusy(true); await onUse(who, text); setBusy(false); }}>
          {busy ? "Working…" : `Use (${item.price} Embers${item.consumable ? " if you don't own one" : ""})`}
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
