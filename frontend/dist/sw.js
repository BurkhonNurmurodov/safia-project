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

const BUILD = "2026-10-04T20:05:14.026Z";
const PRECACHE = ["/","/assets/AdminPanel-CFBiJU6T.js","/assets/AnalysisBoard-C1AWMuRs.js","/assets/Arc-0aCUkv7U.js","/assets/ArcLegacy-CXEKkWAv.js","/assets/BrigadirProfile-cTl_Jn9r.js","/assets/BroadcastReceivers-4nXvgYJ4.js","/assets/BroadcastRecord-DT7c0E4l.js","/assets/CatLockNotice-DD926aJT.js","/assets/CategoryLegendModal-DV0i7NiZ.js","/assets/CellConcerns-DRWpTZt5.js","/assets/CellDetails-Cd9co93P.js","/assets/CellFormModal-D9c6QQWo.js","/assets/CellIdent-DFhpeU7q.js","/assets/CellLink-0DSw-NFb.js","/assets/Cells-BV97o_5R.js","/assets/ColumnFilter-ri8MuGet.js","/assets/ColumnsPicker-6ojR_FRb.js","/assets/CommentsModal-C3ruOZ3N.js","/assets/ComparisonTable-DsKPzOBY.js","/assets/Concerns-HO6gIwbV.js","/assets/ConfirmDialog-nYDt3aTY.js","/assets/Daily-B9fyEy-v.js","/assets/DataTable-CED0lb4C.js","/assets/DateRangePicker-Rk1GxY-F.js","/assets/DayReportView-DZe2yR-B.js","/assets/DayStepper-DwrwzKlL.js","/assets/DifferenceBreakdown-DeS-FYPn.js","/assets/Downtime-B4PRRyxx.js","/assets/Education-D3eoHyKu.js","/assets/EducationLesson-q-CrsGgk.js","/assets/EmptyState-CiqNvFFL.js","/assets/Exam-CY6b_Tj_.js","/assets/FactorySelect-Bvg9SPMg.js","/assets/Gamification-CZzjGY1K.js","/assets/GroupBadge-CyJUc0Gh.js","/assets/HeatmapChart-BtbwLgAC.js","/assets/IdleCell-CfmWqzL2.js","/assets/KPICard-JoRFcQXj.js","/assets/Kaizen-DzWbCyBM.js","/assets/Kelish-35EGibPa.js","/assets/KpiDeltaCard-D9Aho8I8.js","/assets/LangTextInput-Dgve635Q.js","/assets/Layout-DqFTlXPY.js","/assets/LeaderAppeal-D9i_we4h.js","/assets/LeaderDayReport-CHdbPTuB.js","/assets/LeaderUnitReport-DFFNV1my.js","/assets/Leaderboard-C1hPyjin.js","/assets/Leaders-BTjCMHpv.js","/assets/Lightbox-D2eRd7fs.js","/assets/LiveOverview-QnVeAea1.js","/assets/Login-B5_zSR1d.js","/assets/NotFound-D8ctCLVL.js","/assets/Notifications-8JL5zrel.js","/assets/Overview-0_60fmXg.js","/assets/Pagination-Si1Joi4I.js","/assets/PerenaladkaFactTable-LdQyKDod.js","/assets/PersonCard-wf4dDS8G.js","/assets/PlanFulfillment-xPF_sQe4.js","/assets/Production-CR4ZWb4Y.js","/assets/Profile-JuoSwpHV.js","/assets/ProofCamera-BkeCA8iM.js","/assets/ProofPhoto-DXNMzogT.js","/assets/Quality-CaPTEuEh.js","/assets/RawRows-C8ck6V4O.js","/assets/RequestStateChip-ByW9xaF0.js","/assets/RichTextEditor-YS_fhywF.js","/assets/SaveState-D3DGvUSS.js","/assets/SearchInput-DW8p_9ZE.js","/assets/SeasonalityHeatmap-DLk9qoJK.js","/assets/SegmentedToggle-D-_kVFO5.js","/assets/SetupTimes-C9y9r0fT.js","/assets/ShiftDaily-n7ilmLj2.js","/assets/Staff-ClBX836B.js","/assets/StaffLive-croB1Oy4.js","/assets/StatusBadge-Cw8a_akP.js","/assets/TargetGoal-Dyxff-0X.js","/assets/Targets-Q6JFxWKv.js","/assets/Tasks-C1X9qgTG.js","/assets/TimeWheelPicker-B-5RvMAI.js","/assets/Toast-CbnMJNb_.js","/assets/Tooltip-BplON5X4.js","/assets/TrendChart-B5bok2XE.js","/assets/TripleSpeedometer-BTE2Oy-h.js","/assets/Trudoyomkost-dcbuTznK.js","/assets/Turnover-eDsIdejm.js","/assets/UploadDropzone-ChSBsi22.js","/assets/UsersActivity-C5o4MaL3.js","/assets/VerdictBlock-CPYk4It5.js","/assets/VfxApiMap-DElwZT36.js","/assets/VfxDictionaries-Da0JcNND.js","/assets/VfxEmployees-BAJEhl5C.js","/assets/VfxHrMoves-BnrPvbcC.js","/assets/VfxJobs-Bb0BGp-s.js","/assets/VfxPhoto-BkpmrIqj.js","/assets/VfxShifts-CZeVN3QC.js","/assets/VfxState-DCGOMdV0.js","/assets/VfxTimebooks-CaVdddAL.js","/assets/VfxTimesheet-DXPStLYA.js","/assets/WatchProgress-yNpG7KLW.js","/assets/WebLogin-D0mdjXAL.js","/assets/WorkerConcerns-4irSTTrE.js","/assets/Workers-CCcwQdA8.js","/assets/Zagruzka-CEeMpEKo.js","/assets/ZagruzkaCell-Cc6Q7YRm.js","/assets/api-CCO_M7YS.js","/assets/archive-D-bClT4Q.js","/assets/archive-restore-iZ98ZrkN.js","/assets/arrow-down-KDI3iiaO.js","/assets/arrow-left-DqhudAUy.js","/assets/arrow-up-CREkxTgV.js","/assets/arrow-up-narrow-wide-Dz0Yro6X.js","/assets/arrow-up-right-c1stY5xk.js","/assets/award-BvJHeben.js","/assets/ban-RI6PUZ5_.js","/assets/book-open-C9kC1Z0H.js","/assets/bot-DoLvpkmn.js","/assets/boxes-DAf_PUIW.js","/assets/braces-BRjhuSS-.js","/assets/brigadirFilters-D-3hPT1w.js","/assets/broadcastTree-DVHV6Mu6.js","/assets/building-2-BSu6SEPM.js","/assets/calculator-CZXNCLkV.js","/assets/calendar-BWmvpUY5.js","/assets/calendar-days-NVYycEc9.js","/assets/camera-B4FmZzoN.js","/assets/categories-CTqyVaqe.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-AYNGROkr.js","/assets/chart-line-CebmQH2c.js","/assets/chart-pie-yag-6UgC.js","/assets/chartRange-audGoDxi.js","/assets/check-check-BwoqcUC0.js","/assets/chevron-left-CLjxfAA0.js","/assets/chevrons-up-down-CkxNhHJy.js","/assets/circle-CWVe5rGB.js","/assets/circle-alert-4VwmwIz0.js","/assets/circle-check-big-hpSiHeqh.js","/assets/circle-dashed-D6ktEd6Q.js","/assets/circle-minus-BiKga7yF.js","/assets/circle-question-mark-Dqe8gDz2.js","/assets/circle-slash-CWOoRh2f.js","/assets/circle-user-round-CUZ9gi5m.js","/assets/clock-3-CNsMIcPd.js","/assets/cloud-off-Dj-BD6Qf.js","/assets/cloud-upload-Di4inGkq.js","/assets/compass-DRM1otVm.js","/assets/concernCategories-B426VgJB.js","/assets/copy-WUIEEljc.js","/assets/corner-down-right-CIY6zrrR.js","/assets/createLucideIcon-CHCI5FPL.js","/assets/es-Da1HSTor.js","/assets/exportXlsx-lDMQinOi.js","/assets/external-link-Cp9lrb29.js","/assets/file-clock-BUWy2kHF.js","/assets/file-exclamation-point-DMF4yI_d.js","/assets/file-spreadsheet-BORwaUNx.js","/assets/file-text-ZRIMemx-.js","/assets/flag-CrHwDIXn.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-iWY_tjTw.js","/assets/hash-Br59K0Pu.js","/assets/history-Ct8v7W7v.js","/assets/hourglass-DMHBGGVV.js","/assets/image-DTJ3sP5O.js","/assets/image-off-REId8aca.js","/assets/inbox-BzOQK05c.js","/assets/index-CbWpRQJB.js","/assets/index-L3sa6CXi.css","/assets/key-round-DQ3fc1Qg.js","/assets/keyboard-DQTvyGWw.js","/assets/languages-BRQoYm4o.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-dSCV__Rv.js","/assets/lightbulb-DPlCcEBi.js","/assets/link-2-C7MgU_RU.js","/assets/link-2-off-Cri4OSpQ.js","/assets/list-ordered-BZ3s6hQO.js","/assets/list-tree-D2QBejHE.js","/assets/lock-open-BvaoJYNn.js","/assets/log-in-BcxiHrBD.js","/assets/maximize-2-CKZY0dHH.js","/assets/message-square-D8vBg6He.js","/assets/minimize-2-DaEhBTz0.js","/assets/package-check-CDZfPMx4.js","/assets/paperclip-DfkSwOpb.js","/assets/pencil-Dfx6FsLH.js","/assets/percent-6JxzhFyj.js","/assets/pin-DzTTLAmg.js","/assets/pin-off-C_7p8L7L.js","/assets/play-DOD5hAha.js","/assets/plug-zap-DmNqoSGn.js","/assets/presentation-BTTcoiNn.js","/assets/prop-types-C_oF_-65.js","/assets/radio-D1frsep-.js","/assets/react-apexcharts.esm-Pcx9nGdE.js","/assets/registers-Cc3L8kJR.js","/assets/repeat-wh4JFupF.js","/assets/rotate-ccw-BwO9ozoI.js","/assets/rotate-cw-D7MQiNuR.js","/assets/save-BUpxA-vo.js","/assets/scopeLinks-CRe1-RK4.js","/assets/scroll-text-wfJ1n916.js","/assets/search-x-Cex-h3l3.js","/assets/segments-BfFs9dhO.js","/assets/send-DK5TlYu5.js","/assets/settings-2-D89Kb-UD.js","/assets/shield-B6Vs8l3T.js","/assets/shield-alert-B94IT8N_.js","/assets/shield-check-B_gmf3NL.js","/assets/shield-question-mark-CaxqHKnK.js","/assets/siren-BdfjvSPy.js","/assets/snowflake-q7FIMi2i.js","/assets/split-yz6zOX4m.js","/assets/square-C8wyYSxm.js","/assets/square-check-big-BwC8ks9s.js","/assets/star-CFoSADEC.js","/assets/statusBands-DB2r8fU8.js","/assets/store-wk9fNTm3.js","/assets/table-2-BgHqPZQz.js","/assets/table-properties-CzSpPT1H.js","/assets/tag-7_QMGdNZ.js","/assets/timer-off-BdgXFUe8.js","/assets/trending-down-Dt1aHKpt.js","/assets/trending-up-CR9fGOWQ.js","/assets/undo-2-DzuJyLiQ.js","/assets/useChartTheme-xoD8Ldze.js","/assets/useElementWidth-D4290XHx.js","/assets/useIsMobile-Cdr_28OX.js","/assets/useOpenParam-DwMx89RS.js","/assets/useStatusBands-BA2lOiwq.js","/assets/useUrlScope-Beli6SeX.js","/assets/user-DmdRnNMI.js","/assets/user-cog-B01UziQK.js","/assets/users-qH77gMwj.js","/assets/vfx-CvUw3uPw.js","/assets/video-GCLRMgEL.js","/assets/wallet-r_xqVOnh.js","/assets/warehouse-VZ4QmmHr.js","/assets/x-CtfRXXPv.js","/assets/zap-ww2NI_O7.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
