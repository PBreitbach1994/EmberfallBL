// Cloudflare Access authentication.
//
// When AUTH_MODE=access, Cloudflare (with Google as the identity provider) authenticates every
// request before it reaches us and attaches a signed JWT (`Cf-Access-Jwt-Assertion` header, also
// the `CF_Authorization` cookie). We verify that JWT against the team's public keys and use the
// verified email as the player's identity. Nothing else is trusted.
import crypto from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

export interface AccessConfig {
  teamDomain: string;   // e.g. "pbreitbach.cloudflareaccess.com"
  audience: string;     // the Access application's AUD tag
  certsUrl: string;
}

export function accessConfigFromEnv(): AccessConfig | null {
  if ((process.env.AUTH_MODE ?? "invite") !== "access") return null;
  const team = (process.env.CF_ACCESS_TEAM_DOMAIN ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const aud = process.env.CF_ACCESS_AUD ?? "";
  if (!team || !aud) throw new Error("AUTH_MODE=access requires CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD");
  return { teamDomain: team, audience: aud, certsUrl: process.env.CF_ACCESS_CERTS_URL || `https://${team}/cdn-cgi/access/certs` };
}

interface Jwk { kid: string; kty: string; n: string; e: string; alg?: string }
let keyCache: { at: number; keys: Map<string, crypto.KeyObject> } | null = null;

async function keys(cfg: AccessConfig, force = false): Promise<Map<string, crypto.KeyObject>> {
  if (!force && keyCache && Date.now() - keyCache.at < 60 * 60 * 1000) return keyCache.keys;
  const res = await fetch(cfg.certsUrl);
  if (!res.ok) throw new Error(`Could not fetch Cloudflare Access certs (${res.status})`);
  const body = (await res.json()) as { keys: Jwk[] };
  const map = new Map<string, crypto.KeyObject>();
  for (const k of body.keys ?? []) if (k.kty === "RSA") map.set(k.kid, crypto.createPublicKey({ key: k as unknown as crypto.JsonWebKey, format: "jwk" }));
  keyCache = { at: Date.now(), keys: map };
  return map;
}

const b64 = (s: string) => Buffer.from(s, "base64url");

export interface AccessIdentity { email: string; name?: string }

/** Verify a Cloudflare Access JWT. Returns the identity or null (never throws on bad tokens). */
export async function verifyAccessJwt(cfg: AccessConfig, token: string | undefined): Promise<AccessIdentity | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(b64(parts[0]).toString("utf8")) as { alg?: string; kid?: string };
    const payload = JSON.parse(b64(parts[1]).toString("utf8")) as { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string; identity_nonce?: string; custom?: { name?: string } };
    if (header.alg !== "RS256" || !header.kid) return null;
    let key = (await keys(cfg)).get(header.kid);
    if (!key) key = (await keys(cfg, true)).get(header.kid); // key rotation
    if (!key) return null;
    const ok = crypto.verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, b64(parts[2]));
    if (!ok) return null;
    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(cfg.audience)) return null;
    if (payload.iss !== `https://${cfg.teamDomain}`) return null;
    if (!payload.exp || payload.exp < now - 30) return null;
    if (payload.nbf && payload.nbf > now + 30) return null;
    if (!payload.email) return null;
    return { email: payload.email.toLowerCase(), name: payload.custom?.name };
  } catch {
    return null;
  }
}

/** Pull the Access JWT from a request: the header Cloudflare injects, or the CF_Authorization cookie. */
export function accessTokenFrom(headers: IncomingHttpHeaders): string | undefined {
  const h = headers["cf-access-jwt-assertion"];
  if (typeof h === "string" && h) return h;
  const cookie = headers.cookie ?? "";
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

export const adminEmails = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
