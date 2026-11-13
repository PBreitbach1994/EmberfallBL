import { useState } from "react";
import type { UserInfo } from "@tavern/engine";
import { api, errText } from "../api";

export function Login({ onLogin }: { onLogin: (u: UserInfo, token: string) => void }) {
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
    <div className="login">
      <form className="panel login-card" onSubmit={submit}>
        <div className="login-lantern">🏮</div>
        <h1>The Broken Lantern</h1>
        <p className="muted">A frontier tavern in Emberfall, at the edge of the Ashwood. Mercenaries welcome. Bring your own sword.</p>
        <label>Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} required autoFocus />
        </label>
        <label>Invite code
          <input value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="primary" disabled={busy || !name.trim()}>{busy ? "Opening the door…" : "Enter the tavern"}</button>
      </form>
    </div>
  );
}
