/*
 * Safia service worker — the SOURCE. The build writes dist/sw.js from it
 * (emitServiceWorker in vite.config.js) with the two placeholders below filled
 * in: the build stamp, and the same-origin paths to precache. It is registered
 * by utils/pwa.js in a BROWSER only — never inside Telegram (see bootPwa) —
 * and served no-store by serve_spa in backend/app/main.py.
 *
 * What it does, in the order the fetch handler decides:
 *   - non-GET and cross-origin requests are not touched at all (a font
 *     re-fetched from in here would be refused by the worker's own CSP
 *     connect-src, which is same-origin);
 *   - /api, /bot, /health, /docs, the backend's /admin routes, /build.json and
 *     /sw.js are never cached and never answered from cache;
 *   - a navigation to an SPA route is NETWORK FIRST with a timeout, then the
 *     cached shell — for offline, a slow origin AND an origin 5xx (nginx during
 *     the backend restart every deploy performs); a 4xx is never masked — then
 *     a plain offline page. So a reload still fetches the deployed index.html
 *     and UpdatePrompt's «reload» keeps its meaning;
 *   - a navigation whose path names a FILE (an export opened in a new tab) is
 *     left to the browser: the shell fallback must never answer a slow .xlsx;
 *   - /assets/* is CACHE FIRST — content-hashed and served immutable, so a
 *     cached copy can never be the wrong one;
 *   - everything else same-origin (icons, the manifest, the Telegram SDK copy)
 *     is network first with the cache as the fallback.
 *
 * ONE cache per build, named by the stamp: activating a new build's worker
 * drops every other build's cache, and skipWaiting + clients.claim make that
 * immediate. A tab still on the old build then 404s on its next lazy chunk
 * and lazyWithReload reloads it — exactly what happens today without a worker.
 */

const BUILD = "2026-10-19T12:59:02.454Z";
const PRECACHE = ["/","/assets/AdminPanel-BEIzZg1J.js","/assets/AnalysisBoard-DNLqQQiL.js","/assets/Arc-DoNipsfm.js","/assets/Assistant-BPSYZ3vX.js","/assets/BrigadirProfile-DU7aaQIK.js","/assets/BroadcastReceivers-CkDnbdKO.js","/assets/BroadcastRecord-BPEniQru.js","/assets/Button-1h2dZ4gb.js","/assets/CatLockNotice-eNCmcu8H.js","/assets/CategoryLegendModal--c-_eGGP.js","/assets/CellConcerns-DnspH0LR.js","/assets/CellDetails-yJW4ehCs.js","/assets/CellFormModal-CMBQuO0m.js","/assets/CellIdent-ClV7yLWr.js","/assets/CellLink-D_4tL7XA.js","/assets/Cells-lthEdd2J.js","/assets/ColumnFilter-g7NPU8Ir.js","/assets/ColumnsPicker-D8GbsxLu.js","/assets/CommentsModal-DShtbhMJ.js","/assets/ComparisonTable-BS0zal_2.js","/assets/Concerns-DUoPb3if.js","/assets/CountStepper-TjGTvKzL.js","/assets/Daily-T9xFYpQb.js","/assets/DataTable-Dc353OaK.js","/assets/DateRangePicker-DE_JajUb.js","/assets/DayReportView-C4jpwijX.js","/assets/DayStepper-CVtge_mu.js","/assets/DifferenceBreakdown-DGalaock.js","/assets/Downtime-D36SSn1E.js","/assets/Education-RmK_GdAa.js","/assets/EducationLesson-DJQ_wS7X.js","/assets/EmptyState-Cv-2VZMQ.js","/assets/Exam-DhaadEdc.js","/assets/FactorySelect-CWfK-Flx.js","/assets/Gamification-B9vfEcEs.js","/assets/GroupBadge-CUeKgenv.js","/assets/HeatmapChart-Du7yIWlJ.js","/assets/IdleCell-HnJEH0wX.js","/assets/KPICard-Dn9bhYJ3.js","/assets/Kaizen-BwZIbzcq.js","/assets/Kelish-CZ_f7EqE.js","/assets/KpiDeltaCard-BebxYLBK.js","/assets/LangTextInput-DdIIIFie.js","/assets/Layout-DLjRoOlo.js","/assets/LeaderAppeal-C2qtpU-b.js","/assets/LeaderDayReport-BJMg0gc_.js","/assets/LeaderUnitReport-DymSWZIi.js","/assets/Leaderboard-CNufvfO9.js","/assets/Leaders-A7TK-cHw.js","/assets/LeadersKpi-BRKOfC3s.js","/assets/Lightbox-DeYEKpFU.js","/assets/LiveOverview-CVhmFORx.js","/assets/Login-b0OxBaEf.js","/assets/NotFound-2oI26scP.js","/assets/Notifications-B9VEp7dw.js","/assets/Overview-QsW_TBXJ.js","/assets/Pagination-CgCTPVo-.js","/assets/PerenaladkaFactTable-DCyV64my.js","/assets/PersonCard-B5w0XSVb.js","/assets/PlanFulfillment-DAgPpI_a.js","/assets/Production-C5AbUile.js","/assets/Profile-CgLAUcjW.js","/assets/ProofCamera-DVnPx-Zz.js","/assets/ProofPhoto-VFCrV0n-.js","/assets/Quality-Byu4qPi1.js","/assets/RawRows-DyscchfI.js","/assets/RequestStateChip-OgiBAdej.js","/assets/RichTextEditor-CYp1iup6.js","/assets/SaveState-Dkgg2aKD.js","/assets/SearchInput-Di6Ly5xv.js","/assets/SeasonalityHeatmap-DOycqUgs.js","/assets/SegmentedToggle-BlGHryie.js","/assets/SetupTimes-DJU29JTC.js","/assets/ShiftDaily-Bj3EARAP.js","/assets/Staff-BB7VdjWR.js","/assets/StaffListAtCheck-DJSywVpr.js","/assets/StatusBadge-CgCw14lH.js","/assets/TargetGoal-0yYkLdyO.js","/assets/Targets-1j4bZZ0f.js","/assets/Tasks-B-eWbQrA.js","/assets/TimeWheelPicker-B0jNPi7b.js","/assets/Toast-CsEeNmre.js","/assets/Tooltip-D5pVASkA.js","/assets/TrendChart-J7rquYgM.js","/assets/TripleSpeedometer-Buu5HobR.js","/assets/Trudoyomkost-CRBxqv0f.js","/assets/UploadDropzone-DyPAGjSD.js","/assets/UsersActivity-DZpyTNgU.js","/assets/VerdictBlock-DSR4bsNs.js","/assets/VfxApiMap-B3l3Fvq3.js","/assets/VfxDictionaries-n6Cieetu.js","/assets/VfxEmployees-C5Ver7AS.js","/assets/VfxHrMoves-C_YqvI82.js","/assets/VfxJobs-W7kcbFDy.js","/assets/VfxPhoto-hOn90jEF.js","/assets/VfxShifts-De7fXcw2.js","/assets/VfxState-C0qcB9dv.js","/assets/VfxTimebooks-CwRQ2q6_.js","/assets/VfxTimesheet-BrEjR7fk.js","/assets/WatchProgress-6v75nrIi.js","/assets/WebLogin-DOTx7bzd.js","/assets/Workers-GGZ8BowQ.js","/assets/Zagruzka-CCwI-2oh.js","/assets/ZagruzkaCell-DzF4HNbY.js","/assets/api-zBBkmJtg.js","/assets/archive-B2l87KMu.js","/assets/archive-restore-71hw0mgi.js","/assets/arrow-down-dCCirtd-.js","/assets/arrow-down-right-Xq373gKW.js","/assets/arrow-down-wide-narrow-DnRg6t0d.js","/assets/arrow-up-narrow-wide-D_kpX3F9.js","/assets/ban-Cr9A92N0.js","/assets/boxes-LSehZ2Cl.js","/assets/braces-Do3oo7We.js","/assets/brigadirFilters-BjwOtkL1.js","/assets/broadcastTree-BfFR5URX.js","/assets/building-2-B5eMbPSS.js","/assets/calculator-BRSllWkA.js","/assets/calendar-CDBcqSqc.js","/assets/calendar-days-jKW1h6-c.js","/assets/camera-Cplu7-9I.js","/assets/categories-BfBb1YpO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CAvztBeQ.js","/assets/chart-line-DchpMVSv.js","/assets/chart-pie-MoxFECz3.js","/assets/chartRange-DbCWPEWi.js","/assets/check-check-DdKVFW6C.js","/assets/chevron-left-D_6c1b5S.js","/assets/chevrons-up-down-BUrQwvoS.js","/assets/circle-BEKJDrh2.js","/assets/circle-alert-Oa2yYp_C.js","/assets/circle-check-big-CsmSs4UN.js","/assets/circle-dashed-BmLkgK1V.js","/assets/circle-minus-C3_uOzoT.js","/assets/circle-question-mark-B-kyheQc.js","/assets/circle-slash-B9_v0OzN.js","/assets/circle-user-round-Bs1oQJm_.js","/assets/cloud-off-DfEu7U9r.js","/assets/cloud-upload-cyf-zL27.js","/assets/compass-CYvjBTpj.js","/assets/concernCategories-DLPsSVlB.js","/assets/corner-down-right-DOsAaRGE.js","/assets/createLucideIcon-CsD4_o4T.js","/assets/es-CVmxqk14.js","/assets/external-link-CQS-KwdG.js","/assets/file-clock-CM9WZrl5.js","/assets/file-exclamation-point-Bs4dIBOY.js","/assets/flag-CMaoHbfo.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BzfGr02n.js","/assets/funnel-D3YSLfak.js","/assets/hash-CcHV16Z4.js","/assets/hourglass-C8CloeLp.js","/assets/image-B4_3NLMy.js","/assets/image-off-Z8eUt4Hs.js","/assets/inbox-B41n5dIb.js","/assets/index-CfH6qadM.js","/assets/index-DemTQruw.css","/assets/keyboard-Chrij8xG.js","/assets/languages-D0V4hkzP.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-m5Mic8G-.js","/assets/lightbulb-DkZycm7w.js","/assets/link-2-BuBB_xuF.js","/assets/link-2-off-DBc_qJIV.js","/assets/list-ordered-NsnNlWAe.js","/assets/list-tree-_6vqBcOu.js","/assets/lock-open-BaUHtsKT.js","/assets/log-in-DW_P0qCL.js","/assets/marks-Btc4XG6t.js","/assets/minimize-2-Div8R4-d.js","/assets/package-check-11QTj86J.js","/assets/pencil-KjLEgusQ.js","/assets/percent-B2qGjl8p.js","/assets/pin-DiPQelfE.js","/assets/pin-off-C7GUUVF7.js","/assets/play-Bo-N_dKQ.js","/assets/plug-zap-B2FouNmt.js","/assets/prop-types-CM3WpXa7.js","/assets/radio-CDSxzsIz.js","/assets/react-apexcharts.esm-rbPpIOIF.js","/assets/registers-C08R5_RC.js","/assets/repeat-BH4IwXk3.js","/assets/save-D9QqiYY7.js","/assets/scopeLinks-B2N8DzxK.js","/assets/scroll-text-BIR9ZcIM.js","/assets/search-x-B46QspQf.js","/assets/segments-Dx4AtSXq.js","/assets/send-iFVb2MIc.js","/assets/settings-2-CAjb1rvd.js","/assets/shield-CqCvK7HV.js","/assets/shield-alert-Dam17ncE.js","/assets/shield-question-mark-DRL6CIbk.js","/assets/siren-BDL1IOSF.js","/assets/snowflake-BQ_S8fe6.js","/assets/split-2tjFjFaF.js","/assets/square-check-big-CM_0wd82.js","/assets/star-Jmq4AAnI.js","/assets/statusBands-Cfv67o1l.js","/assets/store-DUpoFQsE.js","/assets/table-2-C73_JbTT.js","/assets/table-properties-DBXREsQ2.js","/assets/tag-BP9kHADc.js","/assets/timer-off-Ct5YT8iq.js","/assets/trending-down-BjyPN_1x.js","/assets/trending-up-DATmBzFV.js","/assets/undo-2-B-bGWvRj.js","/assets/useChartTheme-C2LeuPNv.js","/assets/useElementWidth-BiJ_CYFJ.js","/assets/useIsMobile-D1ScZr8u.js","/assets/useOpenParam-DXonOT2O.js","/assets/useStatusBands-Ths7jb1J.js","/assets/useUrlScope-2qlId8XN.js","/assets/user-CHPJk2AS.js","/assets/user-cog-BjPPuPVz.js","/assets/user-minus-BL5zVxef.js","/assets/users-CVuTYH80.js","/assets/vfx-CZpPvByr.js","/assets/video-xW4TwBH9.js","/assets/wallet-DicWcJQJ.js","/assets/warehouse-DHqetQ7c.js","/assets/workflow-C7bOhIUv.js","/assets/x-BfhbJlih.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
const CACHE = "safia-" + BUILD;
const SHELL = "/";
const NAV_TIMEOUT_MS = 5000;

// Backend prefixes: never cached, never served from cache, never given the shell.
const NEVER_CACHE = ["/api/", "/bot/", "/health", "/docs", "/redoc", "/openapi.json"];
// The SPA's own /admin paths. Every other /admin/* is a backend route.
const SPA_ADMIN = new Set(["/admin", "/admin/", "/admin/upload", "/admin/upload/"]);

function passThrough(path) {
  if (NEVER_CACHE.some((p) => path.startsWith(p))) return true;
  if (path.startsWith("/admin") && !SPA_ADMIN.has(path)) return true;
  return path === "/build.json" || path === "/sw.js";
}

function namesFile(path) {
  return path.slice(path.lastIndexOf("/") + 1).includes(".");
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Never atomic: a file that is missing must not keep the whole build out of
    // the cache. Eight at a time, not two hundred at once — a phone on a slow
    // link should not have every chunk of the app competing with the page it
    // is showing. An unchanged hashed asset comes out of the browser's own HTTP
    // cache (served immutable) — but chunk hashes cascade with the import
    // graph, so most deploys rename most chunks and re-download most of the
    // graph; CLAUDE.md records that cost as accepted and names the knob.
    const BATCH = 8;
    for (let i = 0; i < PRECACHE.length; i += BATCH) {
      await Promise.allSettled(PRECACHE.slice(i, i + BATCH).map((path) => cache.add(path)));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith("safia-") && n !== CACHE).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (req.mode === "navigate") {
    if (!passThrough(path) && !namesFile(path) && !path.startsWith("/assets/")) {
      event.respondWith(shell(req));
    }
    return;
  }
  if (passThrough(path)) return;
  event.respondWith(path.startsWith("/assets/") ? cacheFirst(req) : networkFirst(req));
});

// Every cache lookup ignores Vary. The server's CORS layer stamps
// `Vary: Origin` on assets, and the Cache API honours it by default: a module
// script request carries an Origin header where a plain fetch() of the same URL
// does not, so the entry chunk fetch() found was a MISS for the module loader,
// and an offline start died on it (found in local testing, 2026-09-18). Assets
// are content-hashed — identical for every origin — so Vary says nothing here.
const MATCH = { ignoreVary: true };

// The Cache API can refuse — storage evicted or "in a broken state" mid-session,
// a quota error while the origin's data is being cleared, a private window that
// registered the worker earlier. A refusal inside respondWith() is a FAILED
// request for a server that is perfectly reachable, so every cache call on the
// fetch path goes through these three, and a failing cache degrades to plain
// network — never to an error page or a dead module.
async function safeOpen() {
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}
async function safeMatch(key) {
  try {
    return (await caches.match(key, MATCH)) || null;
  } catch {
    return null;
  }
}
function safePut(cache, key, res) {
  if (!cache) return;
  try {
    cache.put(key, res.clone()).catch(() => {});
  } catch {
    /* body already used, or storage refused */
  }
}
// Only a body of the kind the URL names is stored: serve_spa answers ANY
// unknown same-origin path with index.html/200, so without this a renamed
// icon or a stale <img src> would park the shell under a static's URL. The
// shell itself is stored by shell(), under SHELL and nowhere else.
function storable(res) {
  return res.status === 200 && !(res.headers.get("content-type") || "").includes("text/html");
}

async function shell(req) {
  const cache = await safeOpen();
  const fresh = fetch(req).then((res) => {
    if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
      safePut(cache, SHELL, res);
    }
    return res;
  });
  fresh.catch(() => {}); // a failure after the cached shell already went out is not an error
  const late = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS, null));
  let res = null;
  try {
    res = await Promise.race([fresh, late]);
  } catch {
    // offline — fall through to the cached shell
  }
  // A 5xx is the origin saying it is not there right now — nginx during the
  // backend restart every deploy performs, a Cloudflare 52x — and that is the
  // one moment the cached shell exists for: the app then shows its own
  // offline/error state instead of the proxy's page. A 4xx is never masked.
  if (res && res.status < 500) return res;
  const cached = await safeMatch(SHELL);
  if (cached) return cached;
  if (res) return res;
  try {
    return await fresh;
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(req) {
  const hit = await safeMatch(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (storable(res)) safePut(await safeOpen(), req, res);
  return res;
}

async function networkFirst(req) {
  let res;
  try {
    res = await fetch(req);
  } catch (err) {
    const hit = await safeMatch(req);
    if (hit) return hit;
    throw err;
  }
  if (storable(res)) safePut(await safeOpen(), req, res);
  return res;
}

// Shown only when the app has never been cached on this device and there is no
// network — a cold first open offline. Three languages on one line each; the
// full four-language boot copy lives in index.html, which is what this is
// standing in for.
function offlinePage() {
  const html =
    '<!doctype html><html lang="uz"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Safia</title>' +
    "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
    "background:#0f1117;color:#f3f4f6;font-family:system-ui,sans-serif;text-align:center;padding:24px}" +
    "h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#9ca3af;font-size:14px;line-height:1.5}</style></head>" +
    "<body><div><h1>Internet aloqasi yo‘q</h1><p>Aloqa tiklangach sahifani yangilang.<br>" +
    "Нет подключения — обновите страницу, когда связь появится.<br>" +
    "No connection — reload once you are back online.</p></div></body></html>";
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
