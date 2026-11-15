import { useCallback, useEffect, useState } from "react";
import type { CampaignSummary, CampaignView, CharacterSheet, RewardsView, UserInfo } from "@tavern/engine";
import { CampaignPage, CampaignSwitcher, Welcome } from "./screens/Campaigns";
import { DEFAULT_BACKDROP, REWARD_BY_ID } from "@tavern/engine";
import { Shop } from "./screens/Shop";
import { Workshop, type ContentRec } from "./screens/Workshop";
import { GEAR, MONSTERS, type EventCard, type ItemDef, type MonsterDef, type Scenario } from "@tavern/engine";
import { EVENTS, SCENARIOS } from "@tavern/engine/content";
import { ApiError, api, attempt, getCampaignId, getStoredUser, getToken, onUnauthorized, setCampaignId, storeAuth, useServerMessages, useToasts } from "./api";
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
  | { name: "shop" }
  | { name: "welcome" }
  | { name: "campaign" }
  | { name: "workshop" };

export interface AppCtx {
  user: UserInfo;
  campaign: CampaignView | null;
  characters: CharacterSheet[];
  companions: CharacterSheet[];
  /** other players' characters (campaign owner only, read-only) */
  others: CharacterSheet[];
  rewards: RewardsView | null;
  campaigns: CampaignSummary[] | null;
  campaignId: string | null;
  canCreate: boolean;
  switchCampaign: (id: string) => void;
  refreshCampaigns: () => Promise<void>;
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
    if (n === "characters" || n === "create" || n === "admin" || n === "shop" || n === "welcome" || n === "campaign" || n === "workshop") return { name: n };
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

  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [campaignId, setCid] = useState<string | null>(getCampaignId());
  const [canCreate, setCanCreate] = useState(false);
  const refreshCampaign = useCallback(async () => {
    try { setCampaign(await api<CampaignView>("/campaign")); }
    catch (e) { if (e instanceof ApiError && e.status === 409) setCampaign(null); else attempt(() => Promise.reject(e)); }
  }, []);
  const refreshCampaigns = useCallback(async () => {
    const r = await attempt(() => api<{ campaigns: CampaignSummary[]; canCreate: boolean }>("/campaigns"));
    if (!r) return;
    setCampaigns(r.campaigns);
    setCanCreate(r.canCreate);
    const cur = getCampaignId();
    const mine = r.campaigns.filter((c) => c.role !== "site-admin");
    if (!cur || !r.campaigns.some((c) => c.id === cur)) {
      const pick = (mine[0] ?? r.campaigns[0])?.id ?? null;
      setCampaignId(pick); setCid(pick);
    }
  }, []);
  const switchCampaign = useCallback((id: string) => {
    setCampaignId(id); setCid(id);
    setScreen({ name: "tavern" });
    try { location.hash = "tavern"; } catch { /* ignore */ }
  }, []);
  useEffect(() => { if (user) refreshCampaign(); }, [campaignId, user, refreshCampaign]);
  // World Workshop content: put custom monsters/items/events/scenarios into the browser's rule registries
  const loadContent = useCallback(async () => {
    const r = await attempt(() => api<{ records: ContentRec[] }>("/content"));
    if (!r) return;
    for (const rec of r.records) {
      const d = { ...rec.data, id: rec.id };
      if (rec.kind === "monster") MONSTERS[rec.id] = d as unknown as MonsterDef;
      if (rec.kind === "item") GEAR[rec.id] = d as unknown as ItemDef;
      if (rec.kind === "event") EVENTS[rec.id] = d as unknown as EventCard;
      if (rec.kind === "scenario") SCENARIOS[rec.id] = d as unknown as Scenario;
    }
  }, []);
  useEffect(() => { if (user) loadContent(); }, [campaignId, user, loadContent]);
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
    refreshCampaigns();
    refreshCharacters();
    refreshRewards();
  }, [user, refreshCampaigns, refreshCharacters, refreshRewards]);

  useServerMessages((m) => {
    if (m.type === "campaign") { refreshCampaigns(); refreshCampaign(); refreshCharacters(); refreshRewards(); }
  });

  if (!user) {
    return (
      <>
        <Login onLogin={login} />
        <ToastHost />
      </>
    );
  }

  const ctx: AppCtx = { user, campaign, characters, companions, others, rewards, setRewards, refreshRewards, campaigns, campaignId, canCreate, switchCampaign, refreshCampaigns, refreshCampaign, refreshCharacters, go };
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
          {(campaign?.role === "owner" || campaign?.role === "site-admin") && nav({ name: "campaign" }, "Campaign")}
          {(campaign?.role === "owner" || campaign?.role === "site-admin") && nav({ name: "workshop" }, "Workshop")}
          {user.isAdmin && nav({ name: "admin" }, "Admin")}
        </nav>
        <div className="userbox">
          <CampaignSwitcher ctx={ctx} />
          {rewards && <button className="linkbtn embers-btn" onClick={() => go({ name: "shop" })} title="Embers — spend them in the Curio Shop">🔥 {rewards.embers}</button>}
          <DiceModeToggle />
          <SoundToggle />
          <span>{user.name}</span>
          <button className="linkbtn" onClick={logout}>Leave</button>
        </div>
      </header>
      <main className="content">
        {campaigns !== null && campaigns.length === 0 && !["characters", "create", "sheet", "shop"].includes(screen.name) && <Welcome ctx={ctx} />}
        {screen.name === "welcome" && campaigns !== null && campaigns.length > 0 && <Welcome ctx={ctx} />}
        {screen.name === "campaign" && <CampaignPage ctx={ctx} />}
        {screen.name === "tavern" && campaigns !== null && campaigns.length > 0 && <Tavern ctx={ctx} />}
        {screen.name === "characters" && <Characters ctx={ctx} />}
        {screen.name === "create" && <CharacterCreate ctx={ctx} />}
        {screen.name === "sheet" && <CharacterSheetView ctx={ctx} id={screen.id} />}
        {screen.name === "adventure" && <Adventure ctx={ctx} id={screen.id} />}
        {screen.name === "admin" && <Admin ctx={ctx} />}
        {screen.name === "shop" && <Shop ctx={ctx} />}
        {screen.name === "workshop" && <Workshop ctx={ctx} onContentChanged={loadContent} />}
      </main>
      <ToastHost />
    </div>
  );
}
