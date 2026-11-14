import { useCallback, useEffect, useState } from "react";
import type { CampaignView, CharacterSheet, RewardsView, UserInfo } from "@tavern/engine";
import { DEFAULT_BACKDROP, REWARD_BY_ID } from "@tavern/engine";
import { Shop } from "./screens/Shop";
import { api, attempt, getStoredUser, getToken, onUnauthorized, storeAuth, useServerMessages, useToasts } from "./api";
import { Login } from "./screens/Login";
import { Tavern } from "./screens/Tavern";
import { Characters } from "./screens/Characters";
import { CharacterCreate } from "./screens/CharacterCreate";
import { CharacterSheetView } from "./screens/CharacterSheet";
import { Adventure } from "./screens/Adventure";
import { Admin } from "./screens/Admin";
import { DiceModeToggle } from "./components/DiceArena";
import { useSound } from "./sound";
import { LanternIcon } from "./components/art/LanternIcon";

export type Screen =
  | { name: "tavern" }
  | { name: "characters" }
  | { name: "create" }
  | { name: "sheet"; id: string }
  | { name: "adventure"; id: string }
  | { name: "admin" }
  | { name: "shop" };

export interface AppCtx {
  user: UserInfo;
  campaign: CampaignView | null;
  characters: CharacterSheet[];
  companions: CharacterSheet[];
  /** other players' characters (campaign owner only, read-only) */
  others: CharacterSheet[];
  rewards: RewardsView | null;
  setRewards: (r: RewardsView) => void;
  refreshRewards: () => Promise<void>;
  refreshCampaign: () => Promise<void>;
  refreshCharacters: () => Promise<void>;
  go: (s: Screen) => void;
}

function ToastHost() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

function screenFromHash(): Screen {
  try {
    const h = location.hash.slice(1);
    const [n, id] = h.split("/");
    if (n === "adventure" && id) return { name: "adventure", id };
    if (n === "sheet" && id) return { name: "sheet", id };
    if (n === "characters" || n === "create" || n === "admin" || n === "shop") return { name: n };
  } catch { /* ignore */ }
  return { name: "tavern" };
}

function SoundToggle() {
  const [on, set] = useSound();
  return <button className="linkbtn sound-toggle" onClick={() => set(!on)} aria-pressed={on} title="Sound effects">{on ? "🔊" : "🔇"}</button>;
}

export function App() {
  const [user, setUser] = useState<UserInfo | null>(() => (getToken() ? getStoredUser() : null));
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  // follow back/forward and pasted links
  useEffect(() => {
    const on = () => setScreen((cur) => { const n = screenFromHash(); return JSON.stringify(n) === JSON.stringify(cur) ? cur : n; });
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [characters, setCharacters] = useState<CharacterSheet[]>([]);
  const [companions, setCompanions] = useState<CharacterSheet[]>([]);
  const [others, setOthers] = useState<CharacterSheet[]>([]);
  const [rewards, setRewards] = useState<RewardsView | null>(null);
  const refreshRewards = useCallback(async () => {
    const r = await attempt(() => api<RewardsView>("/rewards"));
    if (r) setRewards(r);
  }, []);
  // the equipped backdrop re-skins the whole page and the dice tray
  useEffect(() => {
    const b = REWARD_BY_ID[rewards?.equipped.backdrop ?? DEFAULT_BACKDROP]?.backdrop;
    const custom = rewards && rewards.equipped.backdrop !== DEFAULT_BACKDROP && b;
    document.body.style.background = custom ? `repeating-linear-gradient(92deg, rgba(0,0,0,0.05) 0 3px, transparent 3px 11px), ${b.page}` : "";
    document.body.style.backgroundAttachment = custom ? "fixed" : "";
    document.documentElement.style.setProperty("--felt", b?.felt ?? "#1f5a3a");
  }, [rewards]);
  const login = useCallback((u: UserInfo, t: string) => { storeAuth(u, t); setUser(u); }, []);
  const logout = useCallback(() => {
    storeAuth(null, null);
    setUser(null);
    // with Google sign-in, also end the Cloudflare Access session
    if (user?.email) location.href = "/cdn-cgi/access/logout";
  }, [user]);

  useEffect(() => onUnauthorized(() => { storeAuth(null, null); setUser(null); }), []);

  const go = useCallback((s: Screen) => {
    setScreen(s);
    try { location.hash = "id" in s ? `${s.name}/${s.id}` : s.name; } catch { /* ignore */ }
    window.scrollTo(0, 0);
  }, []);

  const refreshCampaign = useCallback(async () => {
    const r = await attempt(() => api<CampaignView>("/campaign"));
    if (r) setCampaign(r);
  }, []);
  const refreshCharacters = useCallback(async () => {
    const r = await attempt(() => api<{ characters: CharacterSheet[]; companions: CharacterSheet[]; others?: CharacterSheet[] }>("/characters"));
    if (r) { setCharacters(r.characters); setCompanions(r.companions); setOthers(r.others ?? []); }
  }, []);

  useEffect(() => {
    if (!user) return;
    // refresh who we are (name/admin/email may have changed, e.g. after linking Google)
    attempt(() => api<{ user: UserInfo }>("/me")).then((r) => {
      if (r && JSON.stringify(r.user) !== JSON.stringify(user)) { storeAuth(r.user, getToken()); setUser(r.user); }
    });
    refreshCampaign();
    refreshCharacters();
    refreshRewards();
  }, [user, refreshCampaign, refreshCharacters, refreshRewards]);

  useServerMessages((m) => {
    if (m.type === "campaign") { refreshCampaign(); refreshCharacters(); refreshRewards(); }
  });

  if (!user) {
    return (
      <>
        <Login onLogin={login} />
        <ToastHost />
      </>
    );
  }

  const ctx: AppCtx = { user, campaign, characters, companions, others, rewards, setRewards, refreshRewards, refreshCampaign, refreshCharacters, go };
  const nav = (s: Screen, label: string) => (
    <button className={`navbtn ${screen.name === s.name ? "active" : ""}`} onClick={() => go(s)}>{label}</button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => go({ name: "tavern" })}>
          <LanternIcon />
          <span>
            <strong>{campaign?.world.tavern ?? "The Broken Lantern"}</strong>
            <small>{campaign?.world.name ?? "Emberfall"}</small>
          </span>
        </div>
        <nav>
          {nav({ name: "tavern" }, "Tavern")}
          {nav({ name: "characters" }, "Characters")}
          {nav({ name: "shop" }, "Curio Shop")}
          {user.isAdmin && nav({ name: "admin" }, "Admin")}
        </nav>
        <div className="userbox">
          {rewards && <button className="linkbtn embers-btn" onClick={() => go({ name: "shop" })} title="Embers — spend them in the Curio Shop">🔥 {rewards.embers}</button>}
          <DiceModeToggle />
          <SoundToggle />
          <span>{user.name}</span>
          <button className="linkbtn" onClick={logout}>Leave</button>
        </div>
      </header>
      <main className="content">
        {screen.name === "tavern" && <Tavern ctx={ctx} />}
        {screen.name === "characters" && <Characters ctx={ctx} />}
        {screen.name === "create" && <CharacterCreate ctx={ctx} />}
        {screen.name === "sheet" && <CharacterSheetView ctx={ctx} id={screen.id} />}
        {screen.name === "adventure" && <Adventure ctx={ctx} id={screen.id} />}
        {screen.name === "admin" && <Admin ctx={ctx} />}
        {screen.name === "shop" && <Shop ctx={ctx} />}
      </main>
      <ToastHost />
    </div>
  );
}
