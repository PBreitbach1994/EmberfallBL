// Keeps the Cloudflare Access "Players" policy in sync with the game's player list, so the campaign
// owner can invite or remove players from the Admin page instead of the Cloudflare dashboard.
//
// Needs: CF_API_TOKEN (Account → Access: Apps and Policies → Edit), CF_ACCOUNT_ID, and CF_ACCESS_AUD
// (to find the application). The policy is discovered automatically (the app's first Allow policy),
// or set explicitly with CF_ACCESS_POLICY_ID.

const API = process.env.CF_API_BASE || "https://api.cloudflare.com/client/v4";

type Rule = Record<string, unknown>;
interface Policy {
  id: string;
  name: string;
  decision: string;
  include: Rule[];
  exclude?: Rule[];
  require?: Rule[];
  [k: string]: unknown;
}

// fields a policy PUT accepts; everything else from GET (ids, timestamps, app counts) is dropped
const WRITABLE = ["name", "decision", "include", "exclude", "require", "session_duration", "approval_required", "approval_groups",
  "isolation_required", "purpose_justification_required", "purpose_justification_prompt", "mfa_config", "connection_rules", "precedence"];

export interface AccessListStatus { configured: boolean; policyName?: string; emails: string[]; error?: string }

export class AccessPolicySync {
  private token = process.env.CF_API_TOKEN ?? "";
  private account = process.env.CF_ACCOUNT_ID ?? "";
  private aud = process.env.CF_ACCESS_AUD ?? "";
  private policyId = process.env.CF_ACCESS_POLICY_ID ?? "";
  private appId = "";
  private scope: "reusable" | "app" = "reusable";

  get configured() { return !!(this.token && this.account && (this.aud || this.policyId)); }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; result?: T; errors?: { message: string; code?: number }[] };
    if (!res.ok || json.success === false) {
      const msg = json.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
      const err = new Error(`Cloudflare API: ${msg}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return json.result as T;
  }

  /** Find the application (by AUD) and its Allow policy. */
  private async discover(): Promise<void> {
    if (this.policyId && (this.appId || this.scope === "reusable")) return;
    if (!this.appId) {
      const apps = await this.call<{ id: string; aud: string; name: string }[]>("GET", `/accounts/${this.account}/access/apps?per_page=100`);
      const app = apps.find((a) => a.aud === this.aud);
      if (!app) throw new Error("Couldn't find the Access application whose AUD matches CF_ACCESS_AUD.");
      this.appId = app.id;
    }
    if (!this.policyId) {
      const pols = await this.call<(Policy & { reusable?: boolean })[]>("GET", `/accounts/${this.account}/access/apps/${this.appId}/policies`);
      const allow = pols.filter((p) => p.decision === "allow");
      const pick = allow.find((p) => p.include?.some((r) => "email" in r)) ?? allow[0];
      if (!pick) throw new Error("The Access application has no Allow policy to manage.");
      this.policyId = pick.id;
      this.scope = pick.reusable === false ? "app" : "reusable";
    }
  }

  private policyPath() {
    return this.scope === "reusable"
      ? `/accounts/${this.account}/access/policies/${this.policyId}`
      : `/accounts/${this.account}/access/apps/${this.appId}/policies/${this.policyId}`;
  }

  private async getPolicy(): Promise<Policy> {
    await this.discover();
    try {
      return await this.call<Policy>("GET", this.policyPath());
    } catch (e) {
      // a legacy app-scoped policy isn't reachable on the reusable endpoint (and vice versa)
      if ((e as { status?: number }).status === 404 && this.appId) {
        this.scope = this.scope === "reusable" ? "app" : "reusable";
        return await this.call<Policy>("GET", this.policyPath());
      }
      throw e;
    }
  }

  private async putPolicy(p: Policy): Promise<void> {
    const body: Record<string, unknown> = {};
    for (const k of WRITABLE) if (p[k] !== undefined && p[k] !== null) body[k] = p[k];
    await this.call("PUT", this.policyPath(), body);
  }

  private static emailsOf(p: Policy): string[] {
    return (p.include ?? []).map((r) => (r.email as { email?: string } | undefined)?.email?.toLowerCase()).filter((e): e is string => !!e);
  }

  async status(): Promise<AccessListStatus> {
    if (!this.configured) return { configured: false, emails: [] };
    try {
      const p = await this.getPolicy();
      return { configured: true, policyName: p.name, emails: AccessPolicySync.emailsOf(p) };
    } catch (e) {
      return { configured: true, emails: [], error: (e as Error).message };
    }
  }

  /** Add an email to the Allow list. Returns true if it was added (false if already present). */
  async add(email: string): Promise<boolean> {
    const e = email.toLowerCase();
    const p = await this.getPolicy();
    if (AccessPolicySync.emailsOf(p).includes(e)) return false;
    p.include = [...(p.include ?? []), { email: { email: e } }];
    await this.putPolicy(p);
    return true;
  }

  /** Remove an email from the Allow list and end their current Cloudflare sessions. */
  async remove(email: string): Promise<boolean> {
    const e = email.toLowerCase();
    const p = await this.getPolicy();
    const before = p.include?.length ?? 0;
    p.include = (p.include ?? []).filter((r) => (r.email as { email?: string } | undefined)?.email?.toLowerCase() !== e);
    if (p.include.length === before) return false;
    if (!p.include.length) throw new Error("Refusing to empty the policy — that would lock everyone out.");
    await this.putPolicy(p);
    try { await this.call("POST", `/accounts/${this.account}/access/organizations/revoke_user`, { email: e }); } catch { /* best effort */ }
    return true;
  }
}
