import { useCallback, useEffect, useState } from "react";
import type { CampaignView, CharacterSheet, UserInfo } from "@tavern/engine";
import { api, attempt, getStoredUser, getToken, onUnauthorized, storeAuth, useServerMessages, useToasts } from "./api";
import { Login } from "./screens/Login";
import { Tavern } from "./screens/Tavern";
import { Characters } from "./screens/Characters";
import { CharacterCreate } from "./screens/CharacterCreate";
import { CharacterSheetView } from "./screens/CharacterSheet";
import { Adventure } from "./screens/Adventure";

export type Screen =
  | { name: "tavern" }
  | { name: "characters" }
  | { name: "create" }
  | { name: "sheet"; id: string }
  | { name: "adventure"; id: string };

export interface AppCtx {
  user: UserInfo;
  campaign: CampaignView | null;
  characters: CharacterSheet[];
  companions: CharacterSheet[];
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

export function App() {
  const [user, setUser] = useState<UserInfo | null>(() => (getToken() ? getStoredUser() : null));
  const [screen, setScreen] = useState<Screen>(() => {
    try {
      const h = location.hash.slice(1);
      const [n, id] = h.split("/");
      if (n === "adventure" && id) return { name: "adventure", id };
      if (n === "sheet" && id) return { name: "sheet", id };
      if (n === "characters" || n === "create") return { name: n };
    } catch { /* ignore */ }
    return { name: "tavern" };
  });
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [characters, setCharacters] = useState<CharacterSheet[]>([]);
  const [companions, setCompanions] = useState<CharacterSheet[]>([]);

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
    const r = await attempt(() => api<{ characters: CharacterSheet[]; companions: CharacterSheet[] }>("/characters"));
    if (r) { setCharacters(r.characters); setCompanions(r.companions); }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshCampaign();
    refreshCharacters();
  }, [user, refreshCampaign, refreshCharacters]);

  useServerMessages((m) => {
    if (m.type === "campaign") { refreshCampaign(); refreshCharacters(); }
  });

  if (!user) {
    return (
      <>
        <Login onLogin={(u, t) => { storeAuth(u, t); setUser(u); }} />
        <ToastHost />
      </>
    );
  }

  const ctx: AppCtx = { user, campaign, characters, companions, refreshCampaign, refreshCharacters, go };
  const nav = (s: Screen, label: string) => (
    <button className={`navbtn ${screen.name === s.name ? "active" : ""}`} onClick={() => go(s)}>{label}</button>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={() => go({ name: "tavern" })}>
          <span className="lantern">🏮</span>
          <span>
            <strong>{campaign?.world.tavern ?? "The Broken Lantern"}</strong>
            <small>{campaign?.world.name ?? "Emberfall"}</small>
          </span>
        </div>
        <nav>
          {nav({ name: "tavern" }, "Tavern")}
          {nav({ name: "characters" }, "Characters")}
        </nav>
        <div className="userbox">
          <span>{user.name}</span>
          <button className="linkbtn" onClick={() => { storeAuth(null, null); setUser(null); }}>Leave</button>
        </div>
      </header>
      <main className="content">
        {screen.name === "tavern" && <Tavern ctx={ctx} />}
        {screen.name === "characters" && <Characters ctx={ctx} />}
        {screen.name === "create" && <CharacterCreate ctx={ctx} />}
        {screen.name === "sheet" && <CharacterSheetView ctx={ctx} id={screen.id} />}
        {screen.name === "adventure" && <Adventure ctx={ctx} id={screen.id} />}
      </main>
      <ToastHost />
    </div>
  );
}
