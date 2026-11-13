import { useEffect, useState } from "react";
import type { AuthConfig, UserInfo } from "@tavern/engine";
import { api, errText } from "../api";

type Done = (u: UserInfo, token: string) => void;

export function Login({ onLogin }: { onLogin: Done }) {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<AuthConfig>("/auth/config")
      .then((c) => {
        if (c.mode === "access" && c.signedIn && "user" in c) onLogin(c.user, c.token);
        else setCfg(c);
      })
      .catch((e) => { setErr(errText(e)); setCfg({ mode: "invite" }); });
  }, [onLogin]);

  return (
    <div className="login">
      <div className="panel login-card">
        <div className="login-lantern">🏮</div>
        <h1>The Broken Lantern</h1>
        <p className="muted">A frontier tavern in Emberfall, at the edge of the Ashwood. Mercenaries welcome. Bring your own sword.</p>
        {!cfg && <p className="muted">Checking the guest ledger…</p>}
        {cfg?.mode === "invite" && <InviteForm onLogin={onLogin} />}
        {cfg?.mode === "access" && !cfg.signedIn && (
          <>
            <p>This tavern signs guests in with Google.</p>
            <a className="primary button" href="/">Sign in with Google</a>
            {cfg.allowInvite && <details><summary className="muted">Use an invite code instead</summary><InviteForm onLogin={onLogin} /></details>}
          </>
        )}
        {cfg?.mode === "access" && cfg.signedIn && "needsProfile" in cfg && <FirstVisit cfg={cfg} onLogin={onLogin} />}
        {err && <div className="error">{err}</div>}
      </div>
    </div>
  );
}

function InviteForm({ onLogin }: { onLogin: Done }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<{ user: UserInfo; token: string }>("/auth/join", { body: { name: name.trim(), inviteCode: code.trim() } });
      onLogin(r.user, r.token);
    } catch (e2) { setErr(errText(e2)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <label>Your name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required autoFocus />
      </label>
      <label>Invite code
        <input value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      {err && <div className="error">{err}</div>}
      <button className="primary" disabled={busy || !name.trim()}>{busy ? "Opening the door…" : "Enter the tavern"}</button>
    </form>
  );
}

function FirstVisit({ cfg, onLogin }: { cfg: Extract<AuthConfig, { needsProfile: true }>; onLogin: Done }) {
  const [mode, setMode] = useState<"new" | "claim">("new");
  const [name, setName] = useState(cfg.suggestedName);
  const [claimName, setClaimName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = mode === "new" ? { displayName: name.trim() } : { claimName: claimName.trim(), inviteCode: code.trim() };
      const r = await api<{ user: UserInfo; token: string }>("/auth/profile", { body });
      onLogin(r.user, r.token);
    } catch (e2) { setErr(errText(e2)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <p>Welcome, <strong>{cfg.email}</strong>. Marta squints at you over the bar. “New face? Or have I seen you before?”</p>
      <div className="tabs">
        <button type="button" className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>I'm new here</button>
        <button type="button" className={mode === "claim" ? "active" : ""} onClick={() => setMode("claim")}>I played before Google sign-in</button>
      </div>
      {mode === "new" ? (
        <label>What should the tavern call you?
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required autoFocus />
        </label>
      ) : (
        <>
          <p className="muted">Link your old account (and all its characters) to this Google login. Enter the name you used and the invite code you joined with.</p>
          <label>Your old name
            <input value={claimName} onChange={(e) => setClaimName(e.target.value)} maxLength={30} required autoFocus />
          </label>
          <label>Invite code
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
        </>
      )}
      {err && <div className="error">{err}</div>}
      <button className="primary" disabled={busy}>{busy ? "Signing the ledger…" : mode === "new" ? "Enter the tavern" : "Claim my account"}</button>
      <p className="muted small">Can't remember? The campaign owner can link your Google email to your old account from the Admin page.</p>
    </form>
  );
}
