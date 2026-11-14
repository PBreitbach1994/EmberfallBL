import { useEffect, useRef, useState } from "react";
import type { AdventureView, ServerMessage, UserInfo } from "@tavern/engine";

const TOKEN_KEY = "tavern.token";
const USER_KEY = "tavern.user";

function safeGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k: string, v: string | null) {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ }
}

export function getToken(): string | null { return safeGet(TOKEN_KEY); }
const CAMPAIGN_KEY = "tavern.campaign";
/** The campaign this browser is looking at; sent with every request. */
export function getCampaignId(): string | null { return safeGet(CAMPAIGN_KEY); }
export function setCampaignId(id: string | null) { safeSet(CAMPAIGN_KEY, id); }
export function getStoredUser(): UserInfo | null {
  const raw = safeGet(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as UserInfo; } catch { return null; }
}
export function storeAuth(user: UserInfo | null, token: string | null) {
  safeSet(USER_KEY, user ? JSON.stringify(user) : null);
  safeSet(TOKEN_KEY, token);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export function onUnauthorized(fn: Listener) { unauthorizedListeners.add(fn); return () => { unauthorizedListeners.delete(fn); }; }

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const cid = getCampaignId();
  if (cid) headers["X-Campaign"] = cid;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = { error: text }; } }
  if (res.status === 401) {
    unauthorizedListeners.forEach((l) => l());
    throw new ApiError(401, data?.error ?? "Please log in again.");
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

// ---------------------------------------------------------------------------
// Toasts

export interface Toast { id: number; text: string; kind: "error" | "info" }
const toastListeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
let toastId = 0;
export function toast(text: string, kind: Toast["kind"] = "info") {
  const t = { id: ++toastId, text, kind };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l(toasts));
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); toastListeners.forEach((l) => l(toasts)); }, kind === "error" ? 6000 : 3500);
}
export function useToasts(): Toast[] {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => { toastListeners.add(setList); return () => { toastListeners.delete(setList); }; }, []);
  return list;
}
export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
/** Run an async call and toast any error. Returns undefined on failure. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try { return await fn(); } catch (e) { toast(errText(e), "error"); return undefined; }
}

// ---------------------------------------------------------------------------
// WebSocket

type MsgListener = (m: ServerMessage) => void;
let socket: WebSocket | null = null;
let socketToken: string | null = null;
const msgListeners = new Set<MsgListener>();
const subscriptions = new Set<string>();
let reconnectTimer: number | undefined;

function connect() {
  const token = getToken();
  if (!token) return;
  if (socket && socketToken === token && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  socketToken = token;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
  socket = ws;
  ws.onopen = () => { for (const id of subscriptions) ws.send(JSON.stringify({ type: "subscribe", adventureId: id })); };
  ws.onmessage = (ev) => {
    try { const m = JSON.parse(ev.data) as ServerMessage; msgListeners.forEach((l) => l(m)); } catch { /* ignore */ }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(() => { if (msgListeners.size) connect(); }, 2000);
  };
  ws.onerror = () => ws.close();
}

export function useServerMessages(fn: MsgListener) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const l: MsgListener = (m) => ref.current(m);
    msgListeners.add(l);
    connect();
    return () => { msgListeners.delete(l); };
  }, []);
}

export function subscribeAdventure(id: string) {
  subscriptions.add(id);
  connect();
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "subscribe", adventureId: id }));
  return () => { subscriptions.delete(id); };
}

/** Live view of one adventure: initial fetch + websocket pushes. */
export function useAdventure(id: string) {
  const [view, setView] = useState<AdventureView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setView(null);
    api<{ view: AdventureView }>(`/adventures/${id}`).then((r) => { if (alive) setView(r.view); }).catch((e) => { if (alive) setError(errText(e)); });
    const unsub = subscribeAdventure(id);
    return () => { alive = false; unsub(); };
  }, [id]);
  useServerMessages((m) => {
    if (m.type === "adventure" && m.view.id === id) setView(m.view);
    if (m.type === "error") toast(m.message, "error");
  });
  return { view, setView, error };
}
