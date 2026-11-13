// CDP plumbing for the motion harness (README.md): a headless Chrome, driven
// over the raw DevTools protocol with Node's own WebSocket. No dependencies.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The same search the run-safia-project skill does: this repo is worked on
// from a mac laptop and from Ubuntu cloud sessions, so no single path is right.
function readdirSafe(d) { try { return readdirSync(d); } catch { return []; } }
function puppeteerBins(root, kind, suffixes) {
  const dir = `${root}/${kind}`;
  return readdirSafe(dir).flatMap((v) => suffixes.map((s) => `${dir}/${v}/${s}`));
}
const CACHES = [`${process.env.HOME}/.cache/puppeteer`, "/opt/safia/chrome"];
const CHROME_CANDIDATES = [
  process.env.SAFIA_CHROME,
  "/opt/safia/chrome-headless-shell",
  ...CACHES.flatMap((root) => [
    ...puppeteerBins(root, "chrome-headless-shell", [
      "chrome-headless-shell-mac-arm64/chrome-headless-shell",
      "chrome-headless-shell-linux64/chrome-headless-shell",
    ]),
    ...puppeteerBins(root, "chrome", [
      "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      "chrome-linux64/chrome",
    ]),
  ]),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export const findChrome = () => CHROME_CANDIDATES.find((c) => existsSync(c)) || null;

// A protocol call that never answers must fail the run, not hang it: one
// emulation call did exactly that while this harness was being written.
const CALL_TIMEOUT_MS = 30_000;

export async function launch() {
  const bin = findChrome();
  if (!bin) {
    throw new Error("no Chrome found — set SAFIA_CHROME to a Chrome / chrome-headless-shell binary, " +
      "or: npx @puppeteer/browsers install chrome-headless-shell@stable");
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), "safia-motion-chrome-"));
  const proc = spawn(bin, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${dir}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--allow-file-access-from-files",
    ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    proc.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) res(m[1]);
    });
    proc.on("exit", (code) => rej(new Error(`chrome exited (${code}):\n${buf.slice(-800)}`)));
    setTimeout(() => rej(new Error("chrome did not start:\n" + buf.slice(-800))), 20000);
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("could not reach chrome's debugging port")); });
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej, timer } = pending.get(msg.id);
      clearTimeout(timer);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message} ${msg.error.data || ""}`)); else res(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const raw = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      rej(new Error(`${method} did not answer in ${CALL_TIMEOUT_MS / 1000}s`));
    }, CALL_TIMEOUT_MS);
    pending.set(id, { res, rej, timer });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const close = async () => {
    try { await Promise.race([raw("Browser.close"), sleep(2000)]); } catch { /* already gone */ }
    try { proc.kill("SIGKILL"); } catch { /* already gone */ }
    await sleep(300);
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* chrome still letting go */ }
  };
  return { raw, listeners, close, bin };
}

/** One page (target) with the helpers the scenarios need. */
export async function openPage(browser, url, { width = 1280, height = 900, mobile = false } = {}) {
  const { targetId } = await browser.raw("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.raw("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => browser.raw(method, params, sessionId);
  const problems = [];
  browser.listeners.push((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      problems.push("exception: " + (d.exception?.description || d.text));
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      problems.push("console.error: " + msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400));
    }
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Animation.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url });
  let mounted = false;
  for (let i = 0; i < 100 && !mounted; i++) {
    const r = await send("Runtime.evaluate", { expression: "!!document.querySelector('#root > *')", returnByValue: true });
    mounted = !!r.result.value;
    if (!mounted) await sleep(100);
  }
  if (!mounted) throw new Error("the harness page never mounted: " + url + "\n" + problems.join("\n"));
  await sleep(400);

  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + "\n  in: " + expression.slice(0, 200));
    }
    return r.result.value;
  };
  // Centre of the LAST visible match: FilterPanel keeps a hidden measuring copy
  // of its triggers first in the DOM. Scrolls the element into view — so set
  // any scroll position a check depends on AFTER the last click.
  const centre = async (sel) => {
    const p = await ev(`(() => {
      const all = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => {
        const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden";
      });
      const el = all[all.length - 1];
      if (!el) return null;
      el.scrollIntoView({ block: "center", inline: "nearest" });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!p) throw new Error("no visible element for " + sel);
    return p;
  };
  const mouse = (type, p) => send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  const moveTo = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
  const move = async (sel) => { const p = await centre(sel); await moveTo(p.x, p.y); return p; };
  const down = async (sel) => { const p = await move(sel); await mouse("mousePressed", p); return p; };
  const up = (p) => mouse("mouseReleased", p);
  const click = async (sel) => { const p = await down(sel); await up(p); return p; };
  const clickAt = async (x, y) => { await moveTo(x, y); await mouse("mousePressed", { x, y }); await mouse("mouseReleased", { x, y }); };
  const key = async (k, code = k, vk = 0) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk });
  };
  // A real tap, through Chrome's own gesture recogniser. Raw touch events
  // injected with Input.dispatchTouchEvent skip it, and `:active` hangs off
  // the recogniser's TapDown — so they can never show a press.
  const tap = (p, duration = 60) => Promise.race([
    send("Input.synthesizeTapGesture", { x: p.x, y: p.y, duration, tapCount: 1, gestureSourceType: "touch" }),
    sleep(duration + 4000),
  ]);
  const shot = async (file, clip) => {
    const r = await send("Page.captureScreenshot", { format: "png", ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
    writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  };
  // Slow motion: CSS animations/transitions AND timers stretch by the same k,
  // so a frame can be caught mid-flight (and a copy's lifetime, which is a
  // timer, stays in step with the animation it is waiting for).
  const slowmo = async (k) => {
    await send("Animation.setPlaybackRate", { playbackRate: 1 / k });
    await ev(`(() => { window.__st = window.__st || window.setTimeout.bind(window);
      window.setTimeout = ${k} === 1 ? window.__st : (f, ms, ...a) => window.__st(f, (ms || 0) * ${k}, ...a); })()`);
  };
  const media = (features) => send("Emulation.setEmulatedMedia", { features });
  return { send, ev, centre, move, moveTo, down, up, click, clickAt, key, tap, shot, slowmo, media, problems };
}
