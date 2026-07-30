#!/usr/bin/env node
/**
 * Safia dashboard driver — zero-dependency agent harness (no npm install).
 *
 * Two surfaces:
 *   API   — authenticated calls to FastAPI. Every /api/* call needs BOTH
 *           `Authorization: Bearer <jwt>` AND `X-Telegram-Init-Data: __dev__`
 *           (app/security.py re-verifies initData on EVERY request, not just
 *           at login). The `__dev__` bypass needs DEV_AUTH=1 in backend/.env.
 *   PAGES — real PNG screenshots of SPA routes on the vite dev server, driven
 *           over raw CDP against the chrome-headless-shell binary already in
 *           puppeteer's cache. Node's global WebSocket/fetch do the rest.
 *
 * Commands
 *   doctor                      preflight: env keys, chrome, which ports must be up
 *   login                       exchange __dev__ for a JWT (cached in /tmp)
 *   api <METHOD> <path> [json]  one authenticated API call
 *   smoke                       hit the core endpoints, non-zero exit on failure
 *   shot <route> [flags]        screenshot a page (see flags below)
 *   routes                      list the SPA routes
 *
 * shot flags
 *   --out <file>     default $TMPDIR/safia-shots/<route>.png
 *   --click <sel>    click before capturing; CSS, or "text=Запросы" (repeatable)
 *   --js '<expr>'    evaluate in the page before capturing
 *   --theme dark|light        --lang uz|uz_cyrl|ru|en
 *   --wait <ms>      settle time after load (default 4500; charts need it)
 *   --size WxH       viewport, default 1440x900        --full  full-page capture
 *   --console        dump console output (errors are always summarised)
 */

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// .claude/skills/run-safia-project/driver.mjs → repo root
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The dev bundle's API base. frontend/.env.development.local (gitignored,
 *  per-machine) can pin VITE_API_URL to an absolute origin, which bypasses the
 *  vite /api proxy entirely — the UI then talks to THAT port, not :8000. */
function webApiBase() {
  for (const f of ["frontend/.env.development.local", "frontend/.env.local", "frontend/.env"]) {
    const p = path.join(REPO, f);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^VITE_API_URL=(.+)$/m);
    if (m && m[1].trim()) return { base: m[1].trim(), from: f };
  }
  return { base: "http://localhost:8000", from: "vite /api proxy (no VITE_API_URL)" };
}

const WEB_API = webApiBase();
const API = process.env.SAFIA_API || WEB_API.base;          // talk to the SAME backend the UI does
const WEB = process.env.SAFIA_WEB || "http://localhost:5173";
const SHOT_DIR = process.env.SAFIA_SHOTS || path.join(tmpdir(), "safia-shots");
const TOKEN_CACHE = path.join(tmpdir(), "safia-dev-token.txt");

// Which launch.json config serves the port the UI calls.
const LAUNCH_FOR_PORT = { "8000": "backend", "8001": "backend-alt", "8002": "backend-b" };
const apiPort = new URL(API).port || "80";
const apiLaunch = LAUNCH_FOR_PORT[apiPort] || `a backend on :${apiPort}`;

const CHROME_CANDIDATES = [
  process.env.SAFIA_CHROME,
  ...(existsSync(`${process.env.HOME}/.cache/puppeteer/chrome-headless-shell`)
    ? readdirSafe(`${process.env.HOME}/.cache/puppeteer/chrome-headless-shell`).map(
        (v) => `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/${v}/chrome-headless-shell-mac-arm64/chrome-headless-shell`)
    : []),
  ...(existsSync(`${process.env.HOME}/.cache/puppeteer/chrome`)
    ? readdirSafe(`${process.env.HOME}/.cache/puppeteer/chrome`).map(
        (v) => `${process.env.HOME}/.cache/puppeteer/chrome/${v}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`)
    : []),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].filter(Boolean);

function readdirSafe(d) { try { return readdirSync(d); } catch { return []; } }

const ROUTES = [
  "/", "/zagruzka", "/leaderboard", "/workers", "/plan", "/downtime", "/staff",
  "/daily", "/production", "/trudoyomkost", "/leaders", "/cells", "/kaizen",
  "/quality", "/concerns", "/tasks", "/activity", "/setup-times", "/idle-cell",
  "/admin/upload",
];

// The local zagruzka_db only holds real attendance for this window.
export const DATA_START = "2026-05-08";
export const DATA_END = "2026-05-20";

// NOTE the param names: date_from / date_to. Wrong names (start/end) still
// answer 200 — with every metric zeroed — so each row asserts on the payload.
const RANGE = `date_from=${DATA_START}&date_to=${DATA_END}`;
const SMOKE = [
  ["GET", "/api/translations", (j) => Object.keys(j || {}).length > 0],
  ["GET", `/api/summary?${RANGE}`, (j) => j?.total_brigadirs > 0],
  ["GET", `/api/brigadirs?${RANGE}`, (j) => Array.isArray(j) && j.length > 0],
  ["GET", `/api/heatmap?${RANGE}`, (j) => j?.dates?.length > 0],
  ["GET", `/api/downtime?${RANGE}&kpi_only=1`, (j) => j?.dates?.length > 0],
  ["GET", "/api/profiles/mine", (j) => !!j],
];

const say = (...a) => console.log(...a);
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findChrome = () => CHROME_CANDIDATES.find((c) => existsSync(c)) || null;

// ── auth ──────────────────────────────────────────────────────────────────
async function login({ quiet = false } = {}) {
  let r;
  try {
    r = await fetch(`${API}/api/auth/webapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: "__dev__" }),
    });
  } catch {
    die(`backend unreachable at ${API}\n  start it:  preview_start {"name":"${apiLaunch}"}`);
  }
  const body = await r.json().catch(() => ({}));
  if (r.status === 401) die(`401 from /api/auth/webapp — DEV_AUTH is off. Set DEV_AUTH=1 in backend/.env and restart the backend.`);
  if (!r.ok) die(`login ${r.status}: ${JSON.stringify(body)}`);
  if (body.status === "not_registered")
    die("no rows in `admins` — the __dev__ bypass returns the FIRST admin row.\n" +
        '  fix:  psql zagruzka_db -c "insert into admins (telegram_id) values (1);"');
  if (!body.token) die(`login gave no token: ${JSON.stringify(body)}`);
  writeFileSync(TOKEN_CACHE, body.token);
  if (!quiet) say(`✓ ${API} — logged in as ${body.full_name} (${body.role}, tg=${body.telegram_id})`);
  return body.token;
}

async function token() {
  if (existsSync(TOKEN_CACHE)) {
    const t = readFileSync(TOKEN_CACHE, "utf8").trim();
    if (t) return t;
  }
  return login({ quiet: true });
}

async function apiCall(method, urlPath, body, { retry = true } = {}) {
  const jwt = await token();
  const res = await fetch(`${API}${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Telegram-Init-Data": "__dev__",          // required on EVERY /api call
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
  if (res.status === 401 && retry) {              // stale cached JWT
    await login({ quiet: true });
    return apiCall(method, urlPath, body, { retry: false });
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  // An /api path with no matching route falls through to the SPA catch-all and
  // answers 200 + index.html — a typo'd endpoint looks like success. Flag it.
  const spa = json === null && text.startsWith("<!doctype html");
  return { status: res.status, json, text, spa };
}

// ── CDP ───────────────────────────────────────────────────────────────────
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); this.sessionId = null;
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method) {
        (this.handlers.get(msg.method) || []).forEach((h) => h(msg.params));
      }
    });
  }
  static connect(url) {
    return new Promise((res, rej) => {
      const ws = new WebSocket(url);
      ws.addEventListener("open", () => res(new CDP(ws)));
      ws.addEventListener("error", rej);
    });
  }
  on(method, fn) { this.handlers.set(method, [...(this.handlers.get(method) || []), fn]); }
  send(method, params = {}) {
    const msg = { id: ++this.id, method, params };
    // Target./Browser. domains ride the browser session; everything else needs
    // the flat page sessionId or it silently answers for the wrong target.
    if (this.sessionId && !/^(Target|Browser)\./.test(method)) msg.sessionId = this.sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((res, rej) => this.pending.set(msg.id, { res, rej }));
  }
  async evaluate(expression, awaitPromise = false) {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  close() { try { this.ws.close(); } catch {} }
}

async function launchChrome() {
  const bin = findChrome();
  if (!bin) die("no chrome binary found. Either set SAFIA_CHROME=/path/to/chrome, or:\n" +
                "  npx @puppeteer/browsers install chrome-headless-shell@stable");
  const profile = mkdtempSync(path.join(tmpdir(), "safia-chrome-"));
  const proc = spawn(bin, [
    "--remote-debugging-port=0",       // port 0 → chrome picks one, printed on stderr
    `--user-data-dir=${profile}`,
    "--headless=new",                  // ignored by chrome-headless-shell, needed by full Chrome
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  const wsUrl = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("chrome printed no DevTools URL in 15s")), 15000);
    let buf = "";
    proc.stderr.on("data", (d) => {
      buf += d.toString();
      const m = buf.match(/ws:\/\/\S+/);
      if (m) { clearTimeout(t); res(m[0]); }
    });
    proc.on("exit", (c) => { clearTimeout(t); rej(new Error(`chrome exited early (${c}): ${buf.slice(-400)}`)); });
  });

  return {
    wsUrl,
    async kill() {
      try { proc.kill("SIGKILL"); } catch {}
      await sleep(150);   // chrome keeps writing Default/Cache for a beat → ENOTEMPTY
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
    },
  };
}

const CLICK_JS = (sel) => sel.startsWith("text=")
  ? `(() => { const t = ${JSON.stringify(sel.slice(5))};
       const el = [...document.querySelectorAll('button,a,[role="tab"],[role="button"],label,li,td,th,div,span')]
         .filter(e => (e.textContent || '').trim().includes(t) && e.offsetParent !== null)
         .sort((a, b) => (a.textContent.length - b.textContent.length))[0];
       if (!el) throw new Error('no visible element with text ' + t);
       el.click(); return el.tagName + ':' + el.textContent.trim().slice(0, 40); })()`
  : `(() => { const el = document.querySelector(${JSON.stringify(sel)});
       if (!el) throw new Error('no element matching ${sel}');
       el.click(); return el.tagName; })()`;

async function shot(route, opts) {
  const [w, h] = (opts.size || "1440x900").split("x").map(Number);
  const chrome = await launchChrome();
  let out;
  try {
    const cdp = await CDP.connect(chrome.wsUrl);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    cdp.sessionId = sessionId;

    const logs = [];
    cdp.on("Runtime.consoleAPICalled", (p) =>
      logs.push(`[${p.type}] ` + (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ")));
    cdp.on("Runtime.exceptionThrown", (p) =>
      logs.push(`[pageerror] ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`));

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: false });

    // 1st nav gets an origin so the localStorage writes below stick.
    await cdp.send("Page.navigate", { url: `${WEB}/login` });
    await sleep(900);
    await cdp.evaluate(`localStorage.setItem('theme', ${JSON.stringify(opts.theme || "dark")});
                        localStorage.setItem('lang', ${JSON.stringify(opts.lang || "ru")});`);

    // 2nd nav: the route under test. The DEV bundle auto-logs-in with __dev__.
    const url = `${WEB}${route}`;
    await cdp.send("Page.navigate", { url });
    await sleep(Number(opts.wait || 4500));

    for (const sel of opts.click) {
      say(`  click ${sel} → ${await cdp.evaluate(CLICK_JS(sel))}`);
      await sleep(1200);
    }
    if (opts.js) say(`  js → ${JSON.stringify(await cdp.evaluate(opts.js))}`);

    const title = await cdp.evaluate("document.title");
    const heading = await cdp.evaluate("((document.querySelector('h1,h2')||{}).textContent||'').trim()");

    const cap = { format: "png" };
    if (opts.full) {
      const { cssContentSize } = await cdp.send("Page.getLayoutMetrics");
      cap.captureBeyondViewport = true;
      cap.clip = { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 };
    }
    const { data } = await cdp.send("Page.captureScreenshot", cap);

    out = opts.out || path.join(SHOT_DIR, (route === "/" ? "root" : route.replace(/\W+/g, "-").replace(/^-|-$/g, "")) + ".png");
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, Buffer.from(data, "base64"));

    say(`✓ ${url}\n  → ${out}\n  title="${title}"  h1/h2="${heading.slice(0, 70)}"`);
    const errs = logs.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
    if (opts.console) { say("  ── console ──"); logs.forEach((l) => say("  " + l.slice(0, 200))); }
    else if (errs.length) { say(`  ⚠ ${errs.length} console error(s):`); errs.slice(0, 5).forEach((l) => say("  " + l.slice(0, 200))); }
    cdp.close();
  } finally {
    await chrome.kill();
  }
  return out;
}

// ── commands ──────────────────────────────────────────────────────────────
async function doctor() {
  let bad = 0;
  const envPath = path.join(REPO, "backend/.env");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const hints = {
    DEV_AUTH: "DEV_AUTH=1  — without it __dev__ is rejected",
    TELEGRAM_BOT_TOKEN: "TELEGRAM_BOT_TOKEN=123456:LOCAL_DEV_DUMMY  — telebot validates the FORMAT at import; empty crashes uvicorn",
    DATABASE_URL: "DATABASE_URL=postgresql://$USER@localhost:5432/zagruzka_db  — the default `postgres` role does not exist locally",
  };
  for (const [k, hint] of Object.entries(hints)) {
    const ok = new RegExp(`^${k}=.+`, "m").test(env);
    say(`${ok ? "✓" : "✗"} backend/.env ${k}${ok ? "" : `\n    add: ${hint}`}`);
    if (!ok) bad++;
  }
  const chrome = findChrome();
  say(`${chrome ? "✓" : "✗"} chrome: ${chrome || "not found — npx @puppeteer/browsers install chrome-headless-shell@stable"}`);
  if (!chrome) bad++;

  say(`· UI API base ${API}  (from ${WEB_API.from})`);
  for (const [label, url, hint] of [
    ["backend", `${API}/api/auth/bot-info`, `preview_start {"name":"${apiLaunch}"}`],
    ["frontend", WEB, `preview_start {"name":"frontend"}`],
  ]) {
    const ok = await fetch(url).then((r) => r.ok, () => false);
    say(`${ok ? "✓" : "✗"} ${label} ${label === "backend" ? API : WEB}${ok ? "" : `\n    start it: ${hint}`}`);
    if (!ok) bad++;
  }
  process.exit(bad ? 1 : 0);
}

async function smoke() {
  await login();
  let bad = 0;
  for (const [m, p, expect] of SMOKE) {
    const r = await apiCall(m, p);
    const size = r.json ? JSON.stringify(r.json).length : r.text.length;
    const hasData = r.status < 400 && (!expect || (() => { try { return expect(r.json); } catch { return false; } })());
    const ok = r.status < 400 && hasData;
    if (!ok) bad++;
    say(`${ok ? "✓" : "✗"} ${r.status} ${m} ${p.split("?")[0].padEnd(24)} ${String(size).padStart(7)}B` +
        (r.spa ? "   ← SPA index.html: no such route" :
         r.status < 400 && !hasData ? "   ← 200 but EMPTY (check the query params)" : ""));
    if (r.status >= 400) say(`    ${r.text.slice(0, 200)}`);
  }
  say(bad ? `\n${bad} endpoint(s) failed` : "\nall endpoints OK");
  process.exit(bad ? 1 : 0);
}

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return dflt;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
};
const flagAll = (name) => argv.reduce((acc, a, i) => (a === `--${name}` && argv[i + 1] ? [...acc, argv[i + 1]] : acc), []);

switch (argv[0]) {
  case "doctor": await doctor(); break;
  case "login": await login(); break;
  case "routes": ROUTES.forEach((r) => say(r)); break;
  case "smoke": await smoke(); break;
  case "api": {
    const [, method, p, body] = argv;
    if (!p) die("usage: driver.mjs api <METHOD> <path> [jsonBody]");
    const r = await apiCall(method.toUpperCase(), p, body);
    say(`${r.status} ${method.toUpperCase()} ${API}${p}`);
    say(r.json ? JSON.stringify(r.json, null, 2).slice(0, 4000) : r.text.slice(0, 2000));
    process.exit(r.status < 400 ? 0 : 1);
  }
  case "shot": {
    await shot(argv[1]?.startsWith("/") ? argv[1] : "/", {
      out: flag("out"), theme: flag("theme"), lang: flag("lang"), wait: flag("wait"),
      size: flag("size"), js: flag("js"), click: flagAll("click"),
      full: flag("full", false) === true, console: flag("console", false) === true,
    });
    break;
  }
  default:
    say(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*\*/, ""));
}
