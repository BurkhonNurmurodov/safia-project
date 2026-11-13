// The motion harness's runner (README.md). It bundles page.jsx — the REAL ui
// templates on the app's own stylesheet — into one static html file, opens it
// in a headless Chrome and presses everything, asserting what an eye cannot
// see: that a closed dialog is gone and focus is back in the same task, that
// exactly one lifeless copy plays the exit and is removed, that the toggle's
// pill lands on its segment, that reduced motion switches it all off.
//
//   node frontend/tools/motion/run.mjs                 every scenario
//   node frontend/tools/motion/run.mjs desktop phone   some of them
//   node frontend/tools/motion/run.mjs --no-build      reuse the last bundle
//
// Scenarios: desktop · slow · phone · reduced · strict · light.
// Exit code 1 when a check fails. Nothing is written into the repo: the
// bundles and the screenshots go to $MOTION_OUT (default: <tmp>/safia-motion).
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { launch, openPage, sleep } from "./cdp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(HERE, "../..");
const OUT = process.env.MOTION_OUT || path.join(os.tmpdir(), "safia-motion");
const FILES = { production: path.join(OUT, "harness.html"), development: path.join(OUT, "harness-dev.html") };
const URL_PROD = "file://" + FILES.production;
const URL_DEV = "file://" + FILES.development;
const SHOTS = path.join(OUT, "shots");
mkdirSync(SHOTS, { recursive: true });

// The one module the page cannot take as it is: the language provider needs
// the session and the API. Swapped by its RESOLVED path, so every importer —
// however it spells the path — gets the stub.
function swapLang() {
  const real = path.join(FRONT, "src", "context", "LangContext.jsx");
  const stub = path.join(HERE, "lang-stub.js");
  return {
    name: "motion-harness-lang",
    enforce: "pre",
    async resolveId(source, importer, opts) {
      if (!importer) return null;
      const r = await this.resolve(source, importer, { ...opts, skipSelf: true });
      return r && r.id === real ? stub : null;
    },
  };
}

// One self-contained html per mode (a module script will not load over
// file://, so the bundle is an IIFE inlined beside its stylesheet).
// `development` must really be React's development build — that is where
// StrictMode rehearses every mount — and React picks its build off NODE_ENV,
// which a Vite BUILD sets to production whatever the mode says.
async function bundle(mode) {
  const outDir = path.join(OUT, mode === "development" ? "dist-dev" : "dist");
  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = mode;
  try {
    await build({
      configFile: false,
      root: HERE,
      mode,
      logLevel: "silent",
      plugins: [swapLang(), react(), tailwindcss()],
      build: {
        outDir,
        emptyOutDir: true,
        minify: false,
        cssCodeSplit: false,
        assetsInlineLimit: 100_000_000,
        rollupOptions: {
          input: path.join(HERE, "main.jsx"),
          output: { format: "iife", entryFileNames: "app.js", assetFileNames: "[name][extname]" },
        },
      },
    });
  } finally {
    if (before === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before;
  }
  const js = readFileSync(path.join(outDir, "app.js"), "utf8");
  const css = readFileSync(path.join(outDir, readdirSync(outDir).find((f) => f.endsWith(".css"))), "utf8");
  // Concatenated, never String.replace: minified code is full of `$&` and
  // `$'`, which replace() reads as patterns.
  writeFileSync(FILES[mode],
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    "<title>motion harness</title><style>" + css + '</style></head><body><div id="root"></div><script>' +
    js.split("</script").join("<\\/script") + "</script></body></html>");
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail && !ok ? "  →  " + detail : ""}`);
};
const T = (id) => `[data-testid="${id}"]`;
const j = (v) => JSON.stringify(v);

// ── snippets evaluated in the page ─────────────────────────────────────────
const live = (sel) => `document.querySelectorAll(${j(sel)} + ":not([data-leaving])").length`;
const ghosts = `document.querySelectorAll("[data-leaving]").length`;
const css = (sel, prop) => `getComputedStyle(document.querySelector(${j(sel)})).${prop}`;
// Click from inside the page, then look after React's commit and the leave microtask.
const clickThen = (sel, expr) => `(async () => {
  const all = [...document.querySelectorAll(${j(sel)})].filter((e) => e.getBoundingClientRect().width > 0);
  const el = all[all.length - 1]; if (!el) throw new Error("no element: " + ${j(sel)});
  el.click();
  await new Promise((r) => (window.__st || setTimeout)(r, 0));
  return (${expr});
})()`;

const clickFirstThen = (sel, expr) => `(async () => {
  const el = document.querySelector(${j(sel)}); if (!el) throw new Error("no element: " + ${j(sel)});
  el.click();
  await new Promise((r) => (window.__st || setTimeout)(r, 0));
  return (${expr});
})()`;

async function desktop(browser) {
  console.log("\n── desktop 1280×900 ──");
  const p = await openPage(browser, URL_PROD);
  await p.shot(path.join(SHOTS, "01-overview-dark.png"));

  // ── press ────────────────────────────────────────────────────────────────
  let pt = await p.down(T("btn-primary"));
  await sleep(320);
  check("Button: held → scale .97", (await p.ev(css(T("btn-primary"), "scale"))) === "0.97", await p.ev(css(T("btn-primary"), "scale")));
  check("Button: held → wash (inset shadow)", /inset/.test(await p.ev(css(T("btn-primary"), "boxShadow"))), await p.ev(css(T("btn-primary"), "boxShadow")));
  await p.shot(path.join(SHOTS, "02-button-pressed.png"), { x: 0, y: 0, width: 1280, height: 150 });
  await p.up(pt);
  await sleep(320);
  check("Button: released → back to rest", ["none", "1"].includes(await p.ev(css(T("btn-primary"), "scale"))), await p.ev(css(T("btn-primary"), "scale")));

  await p.move(T("btn-secondary"));
  await sleep(250);
  check("Button: hover → wash", /inset/.test(await p.ev(css(T("btn-secondary"), "boxShadow"))), await p.ev(css(T("btn-secondary"), "boxShadow")));

  for (const [id, want] of [["raw-btn", "0.97"], ["raw-wide", "0.985"], ["raw-colors", "0.97"], ["cb", "0.9"]]) {
    pt = await p.down(T(id));
    await sleep(300);
    const got = await p.ev(css(T(id), "scale"));
    check(`press: ${id} → ${want}`, got === want, got);
    await p.up(pt);
    await sleep(60);
  }
  for (const id of ["raw-none", "btn-disabled", "btn-loading"]) {
    pt = await p.down(T(id));
    await sleep(250);
    const got = await p.ev(css(T(id), "scale"));
    check(`press: ${id} stays still`, got === "none" || got === "1", got);
    await p.up(pt);
  }
  check("transition-colors button also eases its dip", /scale/.test(await p.ev(css(T("raw-colors"), "transitionProperty"))), await p.ev(css(T("raw-colors"), "transitionProperty")));
  // the checkbox was toggled by the press above — put it back
  await p.ev(`document.querySelector(${j(T("cb"))}).click()`);

  // ── sliding pill ─────────────────────────────────────────────────────────
  const pillVsActive = (id) => `(() => {
    const root = document.querySelector(${j(T(id))});
    const ind = root.querySelector(".seg-ind");
    const btn = root.querySelector('[aria-pressed="true"], [aria-selected="true"]');
    if (!ind || !btn) return { ind: !!ind, btn: !!btn };
    const a = ind.getBoundingClientRect(), b = btn.getBoundingClientRect();
    return { ind: true, btn: true, dx: Math.abs(a.left - b.left), dy: Math.abs(a.top - b.top), dw: Math.abs(a.width - b.width), dh: Math.abs(a.height - b.height),
      bg: getComputedStyle(ind).backgroundColor, btnBg: getComputedStyle(btn).backgroundColor, transition: ind.style.transition, label: btn.textContent };
  })()`;
  const seated = (r) => r.ind && r.btn && r.dx < 0.6 && r.dy < 0.6 && r.dw < 0.6 && r.dh < 0.6;
  let r = await p.ev(pillVsActive("seg"));
  check("toggle: pill seated on the selected segment at mount", seated(r), j(r));
  check("toggle: pill mounts without gliding", r.transition === "none", r.transition);
  check("toggle: selected segment's own fill is off (the pill carries it)", r.btnBg === "rgba(0, 0, 0, 0)", r.btnBg);
  check("toggle: pill is brand gold", r.bg === "rgb(200, 151, 63)", r.bg);

  await p.ev(`[...document.querySelectorAll(${j(T("seg") + " button")})].find((b) => b.textContent.includes("Farq")).click()`);
  await sleep(40);
  const mid = await p.ev(pillVsActive("seg"));
  check("toggle: pill is travelling right after a pick (not teleported)", mid.dx > 1 && mid.transition !== "none", j(mid));
  await sleep(450);
  r = await p.ev(pillVsActive("seg"));
  check("toggle: pill arrives on the new segment", seated(r) && r.label.includes("Farq"), j(r));

  r = await p.ev(pillVsActive("seg-verdict"));
  check("toggle: nothing selected → no pill", r.ind === false, j(r));
  await p.ev(`[...document.querySelectorAll(${j(T("seg-verdict") + " button")})][0].click()`);
  await sleep(120);
  r = await p.ev(pillVsActive("seg-verdict"));
  check("toggle: verdict pill takes its own colour", seated(r) && r.bg === "rgb(21, 128, 61)", j(r));
  await p.ev(`[...document.querySelectorAll(${j(T("seg-verdict") + " button")})][1].click()`);
  await sleep(450);
  r = await p.ev(pillVsActive("seg-verdict"));
  check("toggle: verdict pill slides and recolours", seated(r) && r.bg === "rgb(185, 28, 28)", j(r));

  for (const label of ["Tungi smena", "Dam olish", "Hammasi"]) {
    await p.ev(`[...document.querySelectorAll(${j(T("seg-narrow") + " button")})].find((b) => b.textContent.includes(${j(label)})).click()`);
    await sleep(450);
    r = await p.ev(pillVsActive("seg-narrow"));
    const inView = await p.ev(`(() => { const root = document.querySelector(${j(T("seg-narrow"))}); const t = root.querySelector('[role="group"]').getBoundingClientRect();
      const i = root.querySelector(".seg-ind").getBoundingClientRect(); return i.left >= t.left - 1 && i.right <= t.right + 1; })()`);
    check(`toggle (scrolling track): pill seated on «${label}» and inside the track`, seated(r) && inView, j(r));
  }
  // mounted inside something hidden → its own fill; shown → the pill takes over, seated, no glide
  r = await p.ev(`(() => { const root = document.querySelector(${j(T("seg-hidden"))}); const b = root.querySelector('[aria-pressed="true"]');
    return { ind: !!root.querySelector(".seg-ind"), own: b.style.background }; })()`);
  check("toggle (hidden at mount): no pill yet, the segment keeps its own fill", r.ind === false && /brand/.test(r.own), j(r));
  await p.click(T("show-hidden"));
  await sleep(200);
  r = await p.ev(pillVsActive("seg-hidden"));
  check("toggle (hidden at mount): shown → pill seated without a glide", seated(r) && r.transition === "none" && r.btnBg === "rgba(0, 0, 0, 0)", j(r));
  // a label before the selected segment grows (a count arriving) → the pill follows, without gliding
  const before = await p.ev(pillVsActive("seg-grow"));
  await p.click(T("grow-label"));
  await sleep(200);
  r = await p.ev(pillVsActive("seg-grow"));
  check("toggle (a label grew): pill re-seated at once", seated(before) && seated(r) && r.transition === "none", j(r));

  await p.ev(`document.querySelector(${j(T("seg-fill") + ' [role="tab"][aria-selected="true"]')}).focus()`);
  await p.key("ArrowRight", "ArrowRight", 39);
  await sleep(450);
  r = await p.ev(pillVsActive("seg-fill"));
  check("toggle (tabs, fill): arrow key moves the pill", seated(r) && r.label.includes("So"), j(r));
  await p.shot(path.join(SHOTS, "03-toggles.png"));

  // ── Modal (conditionally rendered) ───────────────────────────────────────
  await p.click(T("open-modal"));
  await sleep(350);
  check("Modal: opens", (await p.ev(live(".modal-backdrop"))) === 1);
  check("Modal: nothing is leaving while it opens", (await p.ev(ghosts)) === 0);
  await p.click(T("modal-input"));
  await p.send("Input.insertText", { text: "salom" });
  await sleep(120);
  await p.key("Escape", "Escape", 27);
  await sleep(350);
  check("Modal: Escape with a draft asks first (2 live dialogs)", (await p.ev(live(".modal-backdrop"))) === 2, String(await p.ev(live(".modal-backdrop"))));
  await p.key("Escape", "Escape", 27);
  await sleep(30);
  const afterAsk = await p.ev(`({ live: ${live(".modal-backdrop")}, ghosts: ${ghosts} })`);
  check("Confirm over Modal: Escape closes only the question, which fades", afterAsk.live === 1 && afterAsk.ghosts === 1, j(afterAsk));
  await sleep(350);
  check("Confirm ghost is removed", (await p.ev(ghosts)) === 0);
  const scrolledTo = await p.ev(`(() => { const s = document.querySelector('[role="dialog"] .overflow-y-auto'); s.scrollTop = 260; return s.scrollTop; })()`);
  await sleep(150);

  const closed = await p.ev(clickThen('[role="dialog"] button[aria-label]', `(() => {
    const g = document.querySelector(".modal-backdrop[data-leaving]");
    return {
      live: ${live(".modal-backdrop")},
      ghost: !!g,
      inert: g?.hasAttribute("inert"), hidden: g?.getAttribute("aria-hidden"),
      scroll: g?.querySelector(".overflow-y-auto")?.scrollTop,
      typed: g?.querySelector('[data-testid="modal-input"]')?.value,
      ids: g ? [...g.querySelectorAll("[id]")].filter((e) => !(e instanceof SVGElement)).length : -1,
      anim: g ? getComputedStyle(g).animationName : "",
      cardAnim: g ? getComputedStyle(g.querySelector(".modal-card")).animationName : "",
      pointer: g ? getComputedStyle(g).pointerEvents : "",
      focus: document.activeElement?.getAttribute("data-testid"),
    };
  })()`));
  check("Modal: closing removes the real dialog at once", closed.live === 0, j(closed));
  check("Modal: a copy stays to play the exit", closed.ghost && closed.anim === "leaveFade" && closed.cardAnim === "modalPopOut", j(closed));
  check("Modal copy: inert, hidden, deaf to the pointer, no ids", closed.inert && closed.hidden === "true" && closed.pointer === "none" && closed.ids === 0, j(closed));
  check("Modal copy: keeps the scroll position", scrolledTo > 50 && Math.abs(closed.scroll - scrolledTo) < 2, `${closed.scroll} vs ${scrolledTo}`);
  check("Modal copy: keeps what was typed", closed.typed === "salom", String(closed.typed));
  check("Modal: focus is back on the opener immediately", closed.focus === "open-modal", String(closed.focus));
  await sleep(350);
  check("Modal copy is removed after its exit", (await p.ev(ghosts)) === 0);

  // ── Modal driven by `open` ───────────────────────────────────────────────
  await p.click(T("open-modal-prop"));
  await sleep(300);
  const viaProp = await p.ev(clickThen(T("modal-prop-close"), `({ live: ${live(".modal-backdrop")}, ghosts: ${ghosts} })`));
  check("Modal (open prop): leaves the same way", viaProp.live === 0 && viaProp.ghosts === 1, j(viaProp));
  await sleep(350);

  // ── ConfirmDialog ────────────────────────────────────────────────────────
  await p.click(T("open-confirm"));
  await sleep(300);
  check("ConfirmDialog: opens with the safe button focused", (await p.ev(`document.activeElement?.textContent`)) === (await p.ev(`document.querySelector('.modal-card .btn')?.textContent`)));
  await p.key("Escape", "Escape", 27);
  await sleep(30);
  check("ConfirmDialog: Escape → fades out", (await p.ev(`({ l: ${live(".modal-backdrop")}, g: ${ghosts} })`)).g === 1);
  await sleep(350);

  // ── Toast ────────────────────────────────────────────────────────────────
  await p.click(T("toast-ok"));
  await sleep(380);
  check("Toast: shown", (await p.ev(live(".toast-in"))) === 1);
  const t1 = await p.ev(clickThen(T("toast-hide"), `(() => { const g = document.querySelector(".toast-in[data-leaving]");
    return { live: ${live(".toast-in")}, ghost: !!g, role: g?.getAttribute("role"), liveAttr: g?.getAttribute("aria-live"), anim: g ? getComputedStyle(g).animationName : "" }; })()`));
  check("Toast: dismissed → eases out, and its copy is not a live region", t1.live === 0 && t1.ghost && t1.role === null && t1.liveAttr === null && t1.anim === "toastOut", j(t1));
  await sleep(350);
  await p.click(T("toast-ok"));
  await sleep(100);
  const t2 = await p.ev(clickThen(T("toast-err"), `({ live: ${live(".toast-in")}, ghosts: ${ghosts} })`));
  check("Toast: replaced → the old one leaves as the new one arrives", t2.live === 1 && t2.ghosts === 1, j(t2));
  await p.click(T("toast-bottom"));
  await sleep(120);
  check("Toast (bottom): rises into place", (await p.ev(css('.toast-in[data-pos="bottom"]', "animationName"))) === "toastInUp");
  await p.click(T("toast-hide"));
  await sleep(400);
  check("Toasts all gone", (await p.ev(`document.querySelectorAll(".toast-in").length`)) === 0);

  // ── ActionMenu ───────────────────────────────────────────────────────────
  await p.click(T("menu") + " button");
  await sleep(40);
  const m1 = await p.ev(`(() => { const m = document.querySelector('[role="menu"]'); const s = getComputedStyle(m);
    return { cls: m.classList.contains("pop"), anim: s.animationName, vis: s.visibility, side: m.dataset.side || "" }; })()`);
  check("ActionMenu: pops in under the ⋮", m1.cls && m1.anim === "popIn" && m1.vis === "visible" && m1.side === "", j(m1));
  await sleep(250);
  const m2 = await p.ev(clickFirstThen('[role="menuitem"]', `({ live: ${live('[role="menu"]')}, ghosts: ${ghosts}, picked: document.querySelector(${j(T("picked"))}).textContent,
    anim: getComputedStyle(document.querySelector(".pop[data-leaving]") || document.body).animationName, focus: document.activeElement?.getAttribute("aria-haspopup") })`));
  check("ActionMenu: a pick runs, the list eases out, focus returns to the ⋮", m2.live === 0 && m2.ghosts === 1 && m2.picked === "edit" && m2.anim === "popOut" && m2.focus === "menu", j(m2));
  await sleep(300);

  // ── StyledSelect ─────────────────────────────────────────────────────────
  await p.click(T("select") + " button");
  await sleep(250);
  check("StyledSelect: list pops in", (await p.ev(`(() => { const l = document.querySelector(".pop"); return !!l && getComputedStyle(l).position === "fixed"; })()`)));
  await p.ev(`(() => { const l = document.querySelector(".pop"); l.scrollTop = 420; })()`);
  await sleep(120);
  await p.shot(path.join(SHOTS, "04-select-open.png"));
  const s1 = await p.ev(`(async () => {
    const opt = [...document.querySelectorAll(".pop button")].find((b) => b.textContent.includes("9120"));
    opt.click();
    await new Promise((r) => setTimeout(r, 0));
    const g = document.querySelector(".pop[data-leaving]");
    return { live: ${live(".pop")}, ghost: !!g, scroll: g?.scrollTop, value: document.querySelector(${j(T("select") + " button")}).textContent };
  })()`);
  check("StyledSelect: pick closes it; the copy keeps the list's scroll", s1.live === 0 && s1.ghost && Math.abs(s1.scroll - 420) < 2 && s1.value.includes("9120"), j(s1));
  await sleep(300);

  // ── DateRangePicker (desktop popover) ────────────────────────────────────
  for (const id of ["range", "single", "month"]) {
    await p.click(T(id) + " button");
    await sleep(260);
    const d1 = await p.ev(`(() => { const e = document.querySelector("[data-popover-portal]"); return e ? { pop: e.classList.contains("pop"), vis: getComputedStyle(e).visibility, w: e.offsetWidth } : null; })()`);
    check(`DateRangePicker (${id}): popover pops in`, d1 && d1.pop && d1.vis === "visible" && d1.w > 200, j(d1));
    if (id === "range") await p.shot(path.join(SHOTS, "05-calendar-open.png"));
    await p.key("Escape", "Escape", 27);
    await sleep(30);
    const d2 = await p.ev(`({ live: ${live("[data-popover-portal]")}, ghosts: ${ghosts} })`);
    check(`DateRangePicker (${id}): Escape → eases out`, d2.live === 0 && d2.ghosts === 1, j(d2));
    await sleep(300);
  }

  // ── FilterPanel + ColumnsPicker (desktop dropdowns) ──────────────────────
  await p.ev(`[...document.querySelectorAll(${j(T("toolbar-row") + " button")})].filter((b) => b.getBoundingClientRect().width > 0 && /Filtr/.test(b.textContent)).pop().click()`);
  await sleep(260);
  check("FilterPanel: grouped dropdown pops in", (await p.ev(live(".pop"))) === 1);
  await p.ev(`[...document.querySelectorAll(".pop button")].find((b) => /Smena/.test(b.textContent)).click()`);
  await sleep(200);
  check("FilterPanel: a row unfolds with a reveal (brk-in)", (await p.ev(`document.querySelectorAll(".pop .brk-in").length`)) === 1);
  await p.shot(path.join(SHOTS, "06-filter-open.png"));
  await p.clickAt(640, 40);
  await sleep(30);
  const f1 = await p.ev(`({ live: ${live(".pop")}, ghosts: ${ghosts} })`);
  check("FilterPanel: outside press → eases out", f1.live === 0 && f1.ghosts === 1, j(f1));
  await sleep(300);
  await p.ev(`document.querySelector(${j(T("toolbar-row") + ' button[title]')}).click()`);
  await sleep(260);
  check("ColumnsPicker: panel pops in", (await p.ev(live(".pop"))) === 1);
  await p.clickAt(640, 40);
  await sleep(30);
  check("ColumnsPicker: outside press → eases out", (await p.ev(`({ live: ${live(".pop")}, ghosts: ${ghosts} })`)).ghosts === 1);
  await sleep(300);

  // ── Tooltip ──────────────────────────────────────────────────────────────
  await p.move(T("tip") + " [role=button]");
  await sleep(200);
  check("Tooltip: fades in on hover", (await p.ev(`(() => { const e = document.querySelector(".tip"); return !!e && getComputedStyle(e).visibility === "visible"; })()`)));
  await p.moveTo(640, 40);
  await sleep(20);
  const tp = await p.ev(`({ live: ${live(".tip")}, ghosts: ${ghosts} })`);
  check("Tooltip: fades out", tp.live === 0 && tp.ghosts === 1, j(tp));
  await sleep(250);

  // ── Lightbox, TimeWheelPicker, FormulaModal ──────────────────────────────
  await p.click(T("open-photo"));
  await sleep(320);
  check("Lightbox: opens like a dialog", (await p.ev(`!!document.querySelector(".modal-backdrop img.modal-card")`)));
  await p.shot(path.join(SHOTS, "07-lightbox.png"));
  await p.key("Escape", "Escape", 27);
  await sleep(30);
  check("Lightbox: Escape → eases out", (await p.ev(`({ live: ${live(".modal-backdrop")}, ghosts: ${ghosts} })`)).ghosts === 1);
  await sleep(320);

  await p.click(T("open-wheel"));
  await sleep(350);
  check("TimeWheelPicker: opens (card from sm up)", (await p.ev(css(".sheet-card", "animationName"))) === "modalPop", await p.ev(css(".sheet-card", "animationName")));
  await p.clickAt(40, 40);
  await sleep(30);
  const w1 = await p.ev(`({ live: ${live(".sheet-backdrop")}, ghosts: ${ghosts} })`);
  check("TimeWheelPicker: backdrop press → eases out", w1.live === 0 && w1.ghosts === 1, j(w1));
  await sleep(320);

  await p.click(T("open-formula"));
  await sleep(320);
  check("FormulaModal: opens like a dialog", (await p.ev(live(".modal-backdrop"))) === 1);
  await p.clickAt(40, 40);
  await sleep(30);
  check("FormulaModal: closes with a fade", (await p.ev(ghosts)) === 1);
  await sleep(320);

  // ── page-built shapes on the hook-less leaveRef ──────────────────────────
  const shape = async (openId, testid, enterAnim, exitAnim, closeSel, childSel, childExit) => {
    await p.click(T(openId));
    await sleep(40);
    const inAnim = await p.ev(`getComputedStyle(document.querySelector(${j(T(testid))} + ${j(childSel && !enterAnim.root ? " " + childSel : "")})).animationName`);
    await sleep(360);
    const out = await p.ev(clickThen(closeSel, `(() => { const g = document.querySelector(${j(T(testid))} + "[data-leaving]"); return {
      live: ${live(T(testid))}, ghost: !!g, anim: g ? getComputedStyle(g).animationName : "",
      child: g && ${j(childSel || "")} ? getComputedStyle(g.querySelector(${j(childSel || "*")})).animationName : "" }; })()`));
    check(`page-built ${testid}: enters with ${enterAnim.name}`, inAnim === enterAnim.name, inAnim);
    check(`page-built ${testid}: leaves with ${exitAnim}${childExit ? " + " + childExit : ""}`, out.live === 0 && out.ghost && out.anim === exitAnim && (!childExit || out.child === childExit), j(out));
    await sleep(380);
  };
  await shape("open-side", "side", { name: "sideIn", root: true }, "sideOut", T("open-side"));
  await shape("open-bar", "bar", { name: "toastInUp", root: true }, "leaveFade", T("open-bar"));
  await shape("open-zoom", "zoom", { name: "modalFade", root: true }, "leaveFade", T("zoom"), ".modal-card", "modalPopOut");
  await shape("open-catcher", "catcher", { name: "popIn" }, "leaveFade", T("catcher"), ".pop", "none");
  await shape("open-full", "full", { name: "modalFade", root: true }, "leaveFade", T("close-full"));
  await shape("open-pasted", "pasted", { name: "toastIn", root: true }, "toastOut", T("open-pasted"));
  await p.click(T("open-flow"));
  await sleep(150);
  const flowOut = await p.ev(clickThen(T("open-flow"), `({ live: ${live(T("flow-box"))}, ghosts: ${ghosts} })`));
  check("an in-flow element wearing leaveRef leaves NO copy (it would hold its space)", flowOut.live === 0 && flowOut.ghosts === 0, j(flowOut));

  // ── popovers that open upward ────────────────────────────────────────────
  await p.ev(`window.scrollTo(0, document.body.scrollHeight); document.querySelector("#bottom").scrollIntoView({ block: "end" })`);
  await sleep(150);
  await p.click(T("select-bottom") + " button");
  await sleep(200);
  check("StyledSelect near the bottom edge: opens upward (rises)", (await p.ev(`document.querySelector(".pop")?.dataset.side`)) === "top", String(await p.ev(`document.querySelector(".pop")?.dataset.side`)));
  await p.key("Escape", "Escape", 27);
  await sleep(300);

  check("no leftovers at the end", (await p.ev(ghosts)) === 0);
  check("no page errors (desktop)", p.problems.length === 0 && (await p.ev("window.__errors.length")) === 0, j(p.problems.concat(await p.ev("window.__errors"))));
}

async function slowShots(browser) {
  console.log("\n── slow-motion frames (×10) ──");
  const p = await openPage(browser, URL_PROD);
  const K = 10;
  await p.slowmo(K);
  // toggle mid-slide
  await p.ev(`[...document.querySelectorAll(${j(T("seg") + " button")})].find((b) => b.textContent.includes("Samara")).click()`);
  await sleep(0.45 * 260 * K);
  await p.shot(path.join(SHOTS, "10-toggle-mid-slide.png"), { x: 100, y: 240, width: 1000, height: 150 });
  await sleep(260 * K);
  // modal mid-enter
  await p.click(T("open-modal"));
  await sleep(0.3 * 200 * K);
  await p.shot(path.join(SHOTS, "11-modal-mid-enter.png"));
  await sleep(200 * K);
  await p.shot(path.join(SHOTS, "12-modal-open.png"));
  // modal mid-exit
  await p.ev(`document.querySelector('[role="dialog"] button[aria-label]').click()`);
  await sleep(0.5 * 150 * K);
  await p.shot(path.join(SHOTS, "13-modal-mid-exit.png"));
  await sleep(300 * K);
  // menu mid-enter / mid-exit
  await p.click(T("menu") + " button");
  await sleep(0.35 * 140 * K);
  await p.shot(path.join(SHOTS, "14-menu-mid-enter.png"));
  await sleep(200 * K);
  await p.key("Escape", "Escape", 27);
  await sleep(0.5 * 100 * K);
  await p.shot(path.join(SHOTS, "15-menu-mid-exit.png"));
  await sleep(300 * K);
  check("no page errors (slow motion)", p.problems.length === 0, j(p.problems));
}

async function phone(browser) {
  console.log("\n── phone 390×800, touch ──");
  const p = await openPage(browser, URL_PROD, { width: 390, height: 800, mobile: true });
  await p.shot(path.join(SHOTS, "20-phone-overview.png"));

  // a finger held on a button
  // A real tap, through Chrome's own gesture recogniser (raw touch events
  // injected over CDP skip it, and :active hangs off the recogniser's TapDown).
  // The page samples the button while the finger is down.
  const c = await p.centre(T("btn-primary"));
  await p.ev(`(() => { const b = document.querySelector(${j(T("btn-primary"))}); window.__dip = [];
    window.__dipTimer = setInterval(() => window.__dip.push(getComputedStyle(b).scale), 30); })()`);
  await p.tap(c, 450);
  await sleep(200);
  const held = await p.ev(`(() => { clearInterval(window.__dipTimer); return window.__dip.includes("0.97") ? "0.97" : (window.__dip.find((v) => v !== "none") || "none"); })()`);
  check("touch: a held button dips", held === "0.97", held);
  await sleep(300);
  check("touch: no hover wash left behind after the tap", !/inset/.test(await p.ev(css(T("btn-primary"), "boxShadow"))), await p.ev(css(T("btn-primary"), "boxShadow")));

  // calendar → bottom sheet
  await p.ev(`document.querySelector(${j(T("range") + " button")}).click()`);
  await sleep(60);
  const sh = await p.ev(`(() => { const b = document.querySelector(".sheet-backdrop"); const s = b?.querySelector(".sheet");
    return b && s ? { back: getComputedStyle(b).animationName, sheet: getComputedStyle(s).animationName } : null; })()`);
  check("phone calendar: dimmer fades, sheet rises", sh && sh.back === "modalFade" && sh.sheet === "sheetUp", j(sh));
  const handleDuring = await p.ev(`(() => { const s = document.querySelector(".sheet-backdrop .sheet"); const h = s.querySelector(".w-10.h-1"); return h.getBoundingClientRect().top - s.getBoundingClientRect().top; })()`);
  await sleep(400);
  const handleAfter = await p.ev(`(() => { const s = document.querySelector(".sheet-backdrop .sheet"); const h = s.querySelector(".w-10.h-1"); return h.getBoundingClientRect().top - s.getBoundingClientRect().top; })()`);
  check("phone calendar: the grab handle rides on the sheet and stays there", Math.abs(handleDuring - handleAfter) < 1 && handleAfter > 0 && handleAfter < 20, `${handleDuring} → ${handleAfter}`);
  await p.shot(path.join(SHOTS, "21-phone-calendar-sheet.png"));
  const shOut = await p.ev(clickThen(".sheet-backdrop button", `(() => { const g = document.querySelector(".sheet-backdrop[data-leaving]");
    return { live: ${live(".sheet-backdrop")}, ghost: !!g, sheet: g ? getComputedStyle(g.querySelector(".sheet")).animationName : "" }; })()`));
  check("phone calendar: the sheet rides back down", shOut.live === 0 && shOut.ghost && shOut.sheet === "sheetDown", j(shOut));
  await sleep(400);

  // filters → FilterSheet
  await p.ev(`[...document.querySelectorAll(${j(T("toolbar-row") + " button")})].filter((b) => b.getBoundingClientRect().width > 0)[0].click()`);
  await sleep(60);
  const fs = await p.ev(`(() => { const r = document.querySelector(".sheet-root"); if (!r) return null;
    return { dim: getComputedStyle(r.querySelector(".fade-in")).animationName, sheet: getComputedStyle(r.querySelector(".sheet")).animationName, root: getComputedStyle(r).animationName }; })()`);
  check("phone filters: dimmer fades in by itself, sheet rises, root still", fs && fs.dim === "modalFade" && fs.sheet === "sheetUp" && fs.root === "none", j(fs));
  await sleep(400);
  await p.shot(path.join(SHOTS, "22-phone-filter-sheet.png"));
  const fsOut = await p.ev(clickThen(".sheet-root .fade-in", `(() => { const g = document.querySelector(".sheet-root[data-leaving]"); if (!g) return { ghost: false, live: ${live(".sheet-root")} };
    return { live: ${live(".sheet-root")}, ghost: true, root: getComputedStyle(g).animationName, dim: getComputedStyle(g.querySelector(".fade-in")).animationName,
      sheet: getComputedStyle(g.querySelector(".sheet")).animationName, opacity: getComputedStyle(g).opacity }; })()`));
  check("phone filters: closes — dimmer fades, sheet drops, root only keeps time", fsOut.live === 0 && fsOut.ghost && fsOut.root === "leaveHold" && fsOut.dim === "leaveFade" && fsOut.sheet === "sheetDown" && fsOut.opacity === "1", j(fsOut));
  await sleep(450);
  check("phone filters: copy removed", (await p.ev(ghosts)) === 0);

  // time wheel → sheet on a phone
  await p.ev(`document.querySelector(${j(T("open-wheel"))}).click()`);
  await sleep(60);
  check("phone time wheel: rises as a sheet", (await p.ev(css(".sheet-card", "animationName"))) === "sheetUp");
  await sleep(400);
  await p.shot(path.join(SHOTS, "23-phone-wheel.png"));
  const tw = await p.ev(`(async () => { const b = document.querySelector(".sheet-backdrop"); b.click(); await new Promise((r) => setTimeout(r, 0));
    const g = document.querySelector(".sheet-backdrop[data-leaving]"); return { ghost: !!g, card: g ? getComputedStyle(g.querySelector(".sheet-card")).animationName : "" }; })()`);
  check("phone time wheel: drops back down", tw.ghost && tw.card === "sheetDown", j(tw));
  await sleep(400);

  // dialog on a phone
  await p.ev(`document.querySelector(${j(T("open-modal"))}).click()`);
  await sleep(350);
  await p.shot(path.join(SHOTS, "24-phone-modal.png"));
  await p.ev(`document.querySelector('[role="dialog"] button[aria-label]').click()`);
  await sleep(400);
  check("no leftovers (phone)", (await p.ev(ghosts)) === 0);
  check("no page errors (phone)", p.problems.length === 0 && (await p.ev("window.__errors.length")) === 0, j(p.problems));
}

async function reduced(browser) {
  console.log("\n── prefers-reduced-motion ──");
  const p = await openPage(browser, URL_PROD);
  await p.media([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await sleep(100);
  const pt = await p.down(T("btn-primary"));
  await sleep(200);
  const sc = await p.ev(css(T("btn-primary"), "scale"));
  const wash = await p.ev(css(T("btn-primary"), "boxShadow"));
  await p.up(pt);
  check("reduced motion: no dip, but the press wash stays (colour, not motion)", (sc === "none" || sc === "1") && /inset/.test(wash), sc + " / " + wash);
  await p.click(T("open-modal"));
  await sleep(150);
  check("reduced motion: dialog opens without animating", (await p.ev(css(".modal-card", "animationName"))) === "none");
  const out = await p.ev(clickThen('[role="dialog"] button[aria-label]', `({ live: ${live(".modal-backdrop")}, ghosts: ${ghosts} })`));
  check("reduced motion: dialog closes at once, no copy", out.live === 0 && out.ghosts === 0, j(out));
  await p.ev(`[...document.querySelectorAll(${j(T("seg") + " button")})].find((b) => b.textContent.includes("Fakt")).click()`);
  await sleep(60);
  const ind = await p.ev(`(() => { const root = document.querySelector(${j(T("seg"))}); const i = root.querySelector(".seg-ind").getBoundingClientRect();
    const b = root.querySelector('[aria-pressed="true"]').getBoundingClientRect(); return Math.max(Math.abs(i.left - b.left), Math.abs(i.width - b.width)); })()`);
  check("reduced motion: the pill is simply there, no travel", ind < 0.6, String(ind));
  await p.click(T("select") + " button");
  await sleep(60);
  check("reduced motion: dropdown opens without animating", (await p.ev(css(".pop", "animationName"))) === "none");
  await p.key("Escape", "Escape", 27);
  await sleep(40);
  check("reduced motion: dropdown closes at once", (await p.ev(ghosts)) === 0);
  check("no page errors (reduced motion)", p.problems.length === 0, j(p.problems));
}

async function strict(browser) {
  console.log("\n── development build under StrictMode ──");
  const p = await openPage(browser, URL_DEV + "#strict");
  // Without these two the scenario proves nothing: a production build never
  // rehearses a mount, and every check below would pass for the wrong reason.
  const kind = await p.ev(`({ dev: window.__dev, runs: window.__effectRuns })`);
  check("StrictMode: this IS React's development build", kind.dev === true, j(kind));
  check("StrictMode: React rehearsed the mount (the effect ran twice)", kind.runs === 2, j(kind));
  await p.click(T("open-modal"));
  await sleep(40);
  check("StrictMode: the mount rehearsal leaves no copy behind", (await p.ev(ghosts)) === 0, String(await p.ev(ghosts)));
  await sleep(300);
  check("StrictMode: one live dialog", (await p.ev(live(".modal-backdrop"))) === 1);
  const out = await p.ev(clickThen('[role="dialog"] button[aria-label]', `({ live: ${live(".modal-backdrop")}, ghosts: ${ghosts} })`));
  check("StrictMode: closing still leaves exactly one copy", out.live === 0 && out.ghosts === 1, j(out));
  await sleep(350);
  await p.click(T("menu") + " button");
  await sleep(250);
  check("StrictMode: menu opens once", (await p.ev(`document.querySelectorAll('[role="menu"]').length`)) === 1);
  await p.key("Escape", "Escape", 27);
  await sleep(300);
  check("StrictMode: nothing left", (await p.ev(ghosts)) === 0);
  const real = p.problems.filter((x) => !/Download the React DevTools/.test(x));
  check("no page errors or React warnings (StrictMode dev)", real.length === 0, j(real));
}

async function light(browser) {
  console.log("\n── light theme ──");
  const p = await openPage(browser, URL_PROD + "#light");
  await p.shot(path.join(SHOTS, "30-overview-light.png"));
  {
    const K = 10;
    await p.slowmo(K);
    await p.ev(`[...document.querySelectorAll(${j(T("seg") + " button")})].find((b) => b.textContent.includes("Samara")).click()`);
    for (const [n, f] of [["a", 0.3], ["b", 0.6], ["c", 0.85]]) {
      await sleep((n === "a" ? f : 0.27) * 260 * K);
      const ink = await p.ev(`(() => { const root = document.querySelector(${j(T("seg"))}); const b = root.querySelector('[aria-pressed="true"]');
        const i = root.querySelector(".seg-ind").getBoundingClientRect(), r = b.getBoundingClientRect();
        return { colour: getComputedStyle(b).color, overlap: Math.max(0, Math.min(i.right, r.right) - Math.max(i.left, r.left)) / r.width }; })()`);
      console.log(`     (light, ${Math.round(f * 100)}% of the slide: label ${ink.colour}, pill covers ${Math.round(ink.overlap * 100)}% of it)`);
      await p.shot(path.join(SHOTS, `33-light-toggle-${n}.png`), { x: 100, y: 240, width: 700, height: 100 });
    }
    await sleep(300 * K);
    await p.slowmo(1);
  }
  const pt = await p.down(T("btn-secondary"));
  await sleep(300);
  await p.shot(path.join(SHOTS, "31-light-pressed.png"), { x: 0, y: 0, width: 1280, height: 150 });
  await p.up(pt);
  await p.click(T("open-modal"));
  await sleep(350);
  await p.shot(path.join(SHOTS, "32-light-modal.png"));
  check("no page errors (light)", p.problems.length === 0, j(p.problems));
}

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith("--"));
const want = (n) => !only.length || only.includes(n);

// The whole run is bounded: a browser that stops answering fails it (each
// protocol call has its own limit in cdp.mjs), and so does anything else.
const watchdog = setTimeout(() => { console.error("\nmotion harness: timed out"); process.exit(2); }, 10 * 60_000);

if (args.includes("--no-build") && existsSync(FILES.production) && existsSync(FILES.development)) {
  console.log("reusing the bundles in " + OUT);
} else {
  process.stdout.write("bundling the harness … ");
  await bundle("production");
  await bundle("development");
  console.log("done");
}

const browser = await launch();
console.log("chrome: " + browser.bin);
try {
  if (want("desktop")) await desktop(browser);
  if (want("slow")) await slowShots(browser);
  if (want("phone")) await phone(browser);
  if (want("reduced")) await reduced(browser);
  if (want("strict")) await strict(browser);
  if (want("light")) await light(browser);
} catch (e) {
  check("driver ran to the end", false, String(e.stack || e));
} finally {
  await browser.close();
}
clearTimeout(watchdog);
const failed = results.filter((r) => !r.ok);
console.log("\nscreenshots: " + SHOTS);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
