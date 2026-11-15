// Emberfall updater service (runs inside the "updater" container).
//   GET  /status  -> current version, new commits on GitHub, last update result
//   POST /update  -> git pull + rebuild/restart the game container (one at a time)
// Every request needs header X-Updater-Secret matching UPDATER_SECRET.
import http from "node:http";
import crypto from "node:crypto";
import { spawn, execFile } from "node:child_process";

const SECRET = process.env.UPDATER_SECRET || "";
const REPO = process.env.HOST_REPO_DIR || process.cwd();
const PORT = Number(process.env.PORT || 8080);
const SERVICE = process.env.GAME_SERVICE || "emberfall";

const run = (cmd, args, opts = {}) => new Promise((resolve) => {
  execFile(cmd, args, { cwd: REPO, timeout: opts.timeout ?? 60_000, maxBuffer: 4 << 20, env: { ...process.env, ...opts.env } }, (err, stdout, stderr) =>
    resolve({ ok: !err, out: String(stdout).trim(), err: String(stderr).trim() || (err ? err.message : "") }));
});

// git commands must never overlap (a status check's fetch racing an update's merge breaks both)
let gitLock = Promise.resolve();
const withGit = (fn) => { const next = gitLock.then(fn, fn); gitLock = next.catch(() => {}); return next; };

let job = { running: false, startedAt: 0, finishedAt: 0, ok: null, log: [] };
const say = (line) => { job.log.push(`[${new Date().toISOString().slice(11, 19)}] ${line}`); if (job.log.length > 400) job.log.shift(); console.log(line); };

async function status() {
  return withGit(statusUnlocked);
}
async function statusUnlocked() {
  const fetched = job.running ? { ok: true, err: "" } : await run("git", ["fetch", "--quiet", "origin"], { timeout: 45_000 });
  const head = await run("git", ["rev-parse", "--short", "HEAD"]);
  const branch = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const headDate = await run("git", ["log", "-1", "--format=%cI|%s"]);
  const behind = await run("git", ["log", "--format=%h|%cI|%s", "HEAD..@{u}", "-n", "40"]);
  const dirty = await run("git", ["status", "--porcelain", "--untracked-files=no"]);
  const [date, ...subject] = headDate.out.split("|");
  return {
    repo: REPO, branch: branch.out, current: { commit: head.out, date, subject: subject.join("|") },
    fetchOk: fetched.ok, fetchError: fetched.ok ? undefined : fetched.err.slice(0, 300),
    newCommits: behind.out ? behind.out.split("\n").map((l) => { const [commit, d, ...s] = l.split("|"); return { commit, date: d, subject: s.join("|") }; }) : [],
    localChanges: dirty.out ? dirty.out.split("\n").slice(0, 20) : [],
    job: { running: job.running, startedAt: job.startedAt, finishedAt: job.finishedAt, ok: job.ok, log: job.log.slice(-200) },
  };
}

function step(label, cmd, args, env) {
  return new Promise((resolve) => {
    say(`→ ${label}`);
    const p = spawn(cmd, args, { cwd: REPO, env: { ...process.env, ...env } });
    const pipe = (b) => String(b).split(/\r?\n/).filter(Boolean).forEach((l) => say(`  ${l}`));
    p.stdout.on("data", pipe); p.stderr.on("data", pipe);
    p.on("close", (code) => { if (code !== 0) say(`✗ ${label} failed (exit ${code})`); resolve(code === 0); });
  });
}

async function update() {
  job = { running: true, startedAt: Date.now(), finishedAt: 0, ok: null, log: [] };
  try {
    let ok = await withGit(async () =>
      (await step("Fetching the latest code from GitHub", "git", ["fetch", "origin"])) &&
      (await step("Fast-forwarding to it", "git", ["merge", "--ff-only", "@{u}"])));
    if (ok) {
      const ver = (await withGit(() => run("git", ["rev-parse", "--short", "HEAD"]))).out;
      ok = await step(`Rebuilding and restarting the game (version ${ver}) — this takes a few minutes`, "docker", ["compose", "up", "-d", "--build", "--no-deps", SERVICE], { APP_VERSION: ver });
      if (ok) await step("Cleaning up old images", "docker", ["image", "prune", "-f"]);
    }
    job.ok = ok;
    say(ok ? "✓ Update complete. The game restarts on its own; reload the page in a minute." : "✗ Update stopped. Nothing was changed after the failing step.");
  } catch (e) {
    job.ok = false; say(`✗ ${e.message}`);
  } finally {
    job.running = false; job.finishedAt = Date.now();
  }
}

const authed = (req) => {
  const got = Buffer.from(String(req.headers["x-updater-secret"] || ""));
  const want = Buffer.from(SECRET);
  return SECRET.length >= 16 && got.length === want.length && crypto.timingSafeEqual(got, want);
};

http.createServer(async (req, res) => {
  const send = (code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (!authed(req)) return send(401, { error: SECRET.length < 16 ? "UPDATER_SECRET is not set (16+ characters) — run scripts/update.sh once on the server." : "Bad updater secret." });
  try {
    if (req.method === "GET" && req.url === "/status") return send(200, await status());
    if (req.method === "POST" && req.url === "/update") {
      if (job.running) return send(409, { error: "An update is already running." });
      job.running = true; // claim it synchronously so a second request can't sneak in
      update();
      return send(202, { ok: true });
    }
    send(404, { error: "Not found" });
  } catch (e) { send(500, { error: e.message }); }
}).listen(PORT, () => console.log(`Emberfall updater listening on :${PORT} (repo ${REPO})`));
