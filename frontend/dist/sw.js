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

const BUILD = "2026-10-06T12:25:38.946Z";
const PRECACHE = ["/","/assets/AdminPanel-DuuaOK3T.js","/assets/AnalysisBoard-BGt6zMZU.js","/assets/Arc-BBkNb9Kq.js","/assets/Assistant-loE-OOLf.js","/assets/BrigadirProfile-BqMdvfGn.js","/assets/BroadcastReceivers-SH2FFo8K.js","/assets/BroadcastRecord-DINVbIua.js","/assets/Button-Cs0C6AKU.js","/assets/CatLockNotice-w43GgLJ6.js","/assets/CategoryLegendModal-BTH13gI6.js","/assets/CellConcerns-CcpyTrP5.js","/assets/CellDetails-C_pt9dKB.js","/assets/CellFormModal-YjnGEg7k.js","/assets/CellIdent-BUfdmu68.js","/assets/CellLink-CGZF3j3f.js","/assets/Cells-C7s6Tmws.js","/assets/ColumnFilter-Cg8-gLvl.js","/assets/ColumnsPicker-Cri_zgBa.js","/assets/CommentsModal-CUOtlk5e.js","/assets/ComparisonTable-C7PeqwOB.js","/assets/Concerns-BBgG5J4-.js","/assets/Daily-Cru6I9_V.js","/assets/DataTable-C-TSW63N.js","/assets/DateRangePicker-CeajaFnY.js","/assets/DayReportView-B0R6I2LH.js","/assets/DayStepper-CXMJzc3k.js","/assets/DifferenceBreakdown-Dj7hF-aR.js","/assets/Downtime-DkTZ0VFe.js","/assets/Education-BGD6ZOTu.js","/assets/EducationLesson-CBi71ol6.js","/assets/EmptyState-BRXy-CHS.js","/assets/Exam-BeST02ON.js","/assets/FactorySelect-Bbl8T1xO.js","/assets/Gamification-CZpDmfhF.js","/assets/GroupBadge-BOwGHjAK.js","/assets/HeatmapChart-WqOn4DY0.js","/assets/IdleCell-CO2-HsqL.js","/assets/KPICard-DoX1nFEe.js","/assets/Kaizen-NeI3hVp9.js","/assets/Kelish-BbUU19Bq.js","/assets/KpiDeltaCard-BmQnFrsp.js","/assets/LangTextInput-BBtM5odA.js","/assets/Layout-CAK4TuIn.js","/assets/LeaderAppeal-DyFLxJ8B.js","/assets/LeaderDayReport-g4TIbJJo.js","/assets/LeaderUnitReport-45qr5ZvD.js","/assets/Leaderboard-Dvu4s6lH.js","/assets/Leaders-Db-gM9JA.js","/assets/Lightbox-BYa0I84O.js","/assets/LiveOverview-BeRx_oRn.js","/assets/Login-DI1erzhm.js","/assets/NotFound-BlxONlBs.js","/assets/Notifications-CVctTmYM.js","/assets/Overview-CnJJdgYQ.js","/assets/Pagination-BSWI_ZNs.js","/assets/PerenaladkaFactTable-DNKzktF5.js","/assets/PersonCard-CSaf0da2.js","/assets/PlanFulfillment-B3bYo_vW.js","/assets/Production-CotcZa8v.js","/assets/Profile-BiDKqSga.js","/assets/ProofCamera-F8W12k2p.js","/assets/ProofPhoto-C4HKm_ir.js","/assets/Quality-CCsZwOuM.js","/assets/RawRows-amciGJMZ.js","/assets/RequestStateChip-p7Rtis-C.js","/assets/RichTextEditor-B_W8jZkz.js","/assets/SaveState-C2_1xJ_l.js","/assets/SearchInput-6ApkTF1f.js","/assets/SeasonalityHeatmap-D4vg8mWW.js","/assets/SegmentedToggle-C_K-Jj5b.js","/assets/SetupTimes-Bf7_7y1R.js","/assets/ShiftDaily-B4d9sPlh.js","/assets/Staff-Ca8c7wbZ.js","/assets/StaffLive-CKARrQ_G.js","/assets/StatusBadge-CJU19Duh.js","/assets/TargetGoal-DZVYOpX8.js","/assets/Targets-Cs76t0p3.js","/assets/Tasks-CcHQeAi2.js","/assets/TimeWheelPicker-H7jfV3pg.js","/assets/Toast-SjFDFojm.js","/assets/Tooltip-DA20npvs.js","/assets/TrendChart-R47x0rdu.js","/assets/TripleSpeedometer-Poo7TFgO.js","/assets/Trudoyomkost-C8brhGON.js","/assets/Turnover-SBPoHzvn.js","/assets/UploadDropzone-BRJkKm5c.js","/assets/UsersActivity-DoEBJtta.js","/assets/VerdictBlock-CmbgI719.js","/assets/VfxApiMap-BzMMfFAG.js","/assets/VfxDictionaries-CLySgAG2.js","/assets/VfxEmployees-Bbpg2CPO.js","/assets/VfxHrMoves-OMztsxAL.js","/assets/VfxJobs-CY_tM0MM.js","/assets/VfxPhoto-Ck02DB9y.js","/assets/VfxShifts-BTGkOWfx.js","/assets/VfxState-D621b5z2.js","/assets/VfxTimebooks-DeZPD_XV.js","/assets/VfxTimesheet-DUXpyZiZ.js","/assets/WatchProgress-BZI39GFi.js","/assets/WebLogin-C4hE-MY1.js","/assets/WorkerConcerns-D1bD6uoU.js","/assets/Workers-1-WDSLda.js","/assets/Zagruzka-Ve_m7p2i.js","/assets/ZagruzkaCell-CBkl7WrT.js","/assets/api-nhjlLgvY.js","/assets/archive-CMJyf_yl.js","/assets/archive-restore-CH_jRrWA.js","/assets/arrow-down-BF-wivTq.js","/assets/arrow-up-narrow-wide-CjMXhCtQ.js","/assets/award-C3d_JgJ1.js","/assets/ban-3XE3piZd.js","/assets/boxes-brOJBYv4.js","/assets/braces-DzYWmh1O.js","/assets/brigadirFilters-DZ-0N3iU.js","/assets/broadcastTree-DleOUHQ5.js","/assets/building-2-BtPvq5Qh.js","/assets/calculator-S8CDyPog.js","/assets/calendar-BdSLF_OM.js","/assets/calendar-days-DaN46jmF.js","/assets/camera-D36SFkma.js","/assets/categories-Z16WzFsE.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D_QOHMmj.js","/assets/chart-line-CPU0yi_b.js","/assets/chart-pie-Dt8c-JbG.js","/assets/chartRange-B058ybjT.js","/assets/check-check-C3evgdK0.js","/assets/chevron-left-DfgznYrt.js","/assets/chevrons-up-down-BwEtTQgA.js","/assets/circle-CyPRKXUk.js","/assets/circle-alert-CVzhy_eV.js","/assets/circle-check-big-CJ8GWnjN.js","/assets/circle-dashed-BhT0cdvv.js","/assets/circle-minus-Bw0XJakc.js","/assets/circle-question-mark-D2p0mnyL.js","/assets/circle-slash-BDR_7tLJ.js","/assets/circle-user-round-DUOw5viG.js","/assets/clock-3-vtRXMyMM.js","/assets/cloud-off-BbZttaZ6.js","/assets/cloud-upload-BM1ShA-m.js","/assets/compass-BGc6vF03.js","/assets/concernCategories-ieXeL162.js","/assets/copy--F6geJR3.js","/assets/corner-down-right-DZISE4GS.js","/assets/createLucideIcon-UNKVl7al.js","/assets/es-Cdpw_lkR.js","/assets/external-link-Dke6W7Fh.js","/assets/file-clock-Ck7rxIe1.js","/assets/file-exclamation-point-qZn1IwTt.js","/assets/flag-BoK2t2Md.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-6fj0MuvY.js","/assets/hash-CRvyHi-F.js","/assets/hourglass--SNw5CjU.js","/assets/image-CKMC51js.js","/assets/image-off-B0t-urF6.js","/assets/inbox-CEeL-zat.js","/assets/index-BKM2gJ54.css","/assets/index-DfulCbEK.js","/assets/keyboard-L2PZjFmg.js","/assets/languages-BrF2b6EW.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CBFh7mP-.js","/assets/lightbulb-C9GxcEf0.js","/assets/link-2-B9YOjSRE.js","/assets/link-2-off-DwXvWZJd.js","/assets/list-ordered-BfZY_Fai.js","/assets/list-tree-BwbTEx3S.js","/assets/lock-open-Dwt29C9l.js","/assets/log-in-BOGVzZbG.js","/assets/minimize-2-BtuUmcla.js","/assets/package-check-summKsa8.js","/assets/pencil-Bf4jVkio.js","/assets/percent-oMB-a4x5.js","/assets/pin-CFOWFbG1.js","/assets/pin-off-BBFuJwYo.js","/assets/play-CAM8raRx.js","/assets/plug-zap-B-tt6Wul.js","/assets/prop-types-BESXylAs.js","/assets/react-apexcharts.esm-PiMn3kyH.js","/assets/registers-Dy6onsoX.js","/assets/repeat-Coq1Rvns.js","/assets/rotate-cw-CS7_ZZ0X.js","/assets/save-CsE2NcYM.js","/assets/scopeLinks-D1RdWwLU.js","/assets/scroll-text-C-aw-KTA.js","/assets/search-x-DO8P6FvS.js","/assets/segments-NffwJWR3.js","/assets/send--VXzlGIU.js","/assets/settings-2-D74lZwD7.js","/assets/shield-B-UOA4Wk.js","/assets/shield-alert-DZsZc5TH.js","/assets/shield-question-mark-CN9389Rd.js","/assets/siren-C-uLPKvS.js","/assets/snowflake-zK2UzH1l.js","/assets/split-BsYtUk0k.js","/assets/square-check-big-BFQMWTwC.js","/assets/star-BGZ1rRUB.js","/assets/statusBands-DIQs98TO.js","/assets/store-YzJo3xmn.js","/assets/table-2-B000v2tY.js","/assets/table-properties-CPE0Jh_2.js","/assets/tag-DrZP4Dwl.js","/assets/timer-off-DTAUEWXZ.js","/assets/trending-down-BGhLcWZw.js","/assets/trending-up-Dqm2bZJP.js","/assets/undo-2-Ca4X9RRA.js","/assets/useChartTheme-Ds9HLO11.js","/assets/useElementWidth-DsGoPUgX.js","/assets/useIsMobile-WOksPkIc.js","/assets/useOpenParam-BwvTcs2k.js","/assets/useStatusBands-D3D-Qc0L.js","/assets/useUrlScope-CmWFMk7Z.js","/assets/user-BPFEx-hx.js","/assets/user-cog-DLQBdhoI.js","/assets/users-fezE6TFn.js","/assets/vfx-kbXhMSpm.js","/assets/video-wMsMgyeI.js","/assets/wallet-DAkk1IWi.js","/assets/warehouse-BnxGFOzi.js","/assets/x-DQoJLy9X.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
