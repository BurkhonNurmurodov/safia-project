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

const BUILD = "2026-10-04T20:29:46.484Z";
const PRECACHE = ["/","/assets/AdminPanel-Bih7sb7J.js","/assets/AnalysisBoard-BAwHx7Au.js","/assets/Arc-Bxf4ycCP.js","/assets/ArcLegacy-0BrTR9D5.js","/assets/BrigadirProfile-uXAyctxO.js","/assets/BroadcastReceivers-QvPFveei.js","/assets/BroadcastRecord-B6DPa3u3.js","/assets/CatLockNotice-DtIVi2bA.js","/assets/CategoryLegendModal-B1MC9zJh.js","/assets/CellConcerns-nOTU9BOH.js","/assets/CellDetails-BPmP3GV9.js","/assets/CellFormModal-L3zkt6OD.js","/assets/CellIdent-CDCv7Vrw.js","/assets/CellLink-DisvEITJ.js","/assets/Cells-CsG3OCEi.js","/assets/ColumnFilter-BEwiAkfv.js","/assets/ColumnsPicker-LM4zTN25.js","/assets/CommentsModal-BYwCbDwT.js","/assets/ComparisonTable-Bt1D3MDg.js","/assets/Concerns-5f3vW0Xk.js","/assets/ConfirmDialog-DxREut9w.js","/assets/Daily-DMnLvNC7.js","/assets/DataTable-B0Mu5o3J.js","/assets/DateRangePicker-CiZIBs3b.js","/assets/DayReportView-D8FVkihQ.js","/assets/DayStepper-CyasSB0n.js","/assets/DifferenceBreakdown-D8u6xu6e.js","/assets/Downtime-pfCmAkbq.js","/assets/Education-DwmYbknb.js","/assets/EducationLesson-Cpl6tbuE.js","/assets/EmptyState-CKOwvg73.js","/assets/Exam-XwKIRtgq.js","/assets/FactorySelect-DwD6c4fL.js","/assets/Gamification-Dwf9Ap2n.js","/assets/GroupBadge-CPTz1so8.js","/assets/HeatmapChart-DCPBEuXH.js","/assets/IdleCell-DBpr2d6E.js","/assets/KPICard-C_Ncyi_k.js","/assets/Kaizen-DzbK63Bi.js","/assets/Kelish-DbdP0-tP.js","/assets/KpiDeltaCard-uy8Lc58Z.js","/assets/LangTextInput-CogTJbNg.js","/assets/Layout-BbJ-I0Wl.js","/assets/LeaderAppeal-CaUGsxOY.js","/assets/LeaderDayReport-B_iW4674.js","/assets/LeaderUnitReport-5NupzqhU.js","/assets/Leaderboard-ojTR3QpQ.js","/assets/Leaders-DIWw8Os7.js","/assets/Lightbox-N06p3dcW.js","/assets/LiveOverview-BfS5qHol.js","/assets/Login-Ci5K44fm.js","/assets/NotFound-vPbrrp0Q.js","/assets/Notifications-vcUJRSvk.js","/assets/Overview-Du0Gytsf.js","/assets/Pagination-qKou6UMu.js","/assets/PerenaladkaFactTable-bjSdcmea.js","/assets/PersonCard-Dhv0XE9P.js","/assets/PlanFulfillment-B5GEUp9M.js","/assets/Production-CRKON9z5.js","/assets/Profile-geJhXxo1.js","/assets/ProofCamera-B4bnRlJg.js","/assets/ProofPhoto-BeAiv_H0.js","/assets/Quality-C4MEP4ka.js","/assets/RawRows-D_Sg_t-r.js","/assets/RequestStateChip-Dny3pC3F.js","/assets/RichTextEditor-oVh-HAY3.js","/assets/SaveState-Bo9fJthf.js","/assets/SearchInput-BbS6Q9QY.js","/assets/SeasonalityHeatmap-BJkR1QsW.js","/assets/SegmentedToggle-Cu8jh8Ba.js","/assets/SetupTimes-Bkems3Zn.js","/assets/ShiftDaily-XaqmqTF0.js","/assets/Staff-CV8OR6fu.js","/assets/StaffLive-Shk6d1F8.js","/assets/StatusBadge-05VGcHmF.js","/assets/TargetGoal-Dp0Fpz_o.js","/assets/Targets-D4P36Xl6.js","/assets/Tasks-p_smyHrK.js","/assets/TimeWheelPicker-CjTfoQAp.js","/assets/Toast-1-UD3ua3.js","/assets/Tooltip-aVG70wax.js","/assets/TrendChart-TUvZzpDz.js","/assets/TripleSpeedometer-CgQl9G_5.js","/assets/Trudoyomkost-B2NsTKae.js","/assets/Turnover-BLi6KN1G.js","/assets/UploadDropzone-BAcn_UY5.js","/assets/UsersActivity-25CoMCvG.js","/assets/VerdictBlock-Bc62OQto.js","/assets/VfxApiMap-RSwygLUS.js","/assets/VfxDictionaries-BUzfpP1G.js","/assets/VfxEmployees-BGfUhjPq.js","/assets/VfxHrMoves-D1BDn3h3.js","/assets/VfxJobs-Bb-PLOlQ.js","/assets/VfxPhoto-Bod7MHuf.js","/assets/VfxShifts-BBixDDS_.js","/assets/VfxState-D39_qjV8.js","/assets/VfxTimebooks-eBFZg1aL.js","/assets/VfxTimesheet-C8AMTie9.js","/assets/WatchProgress-s1WWncm7.js","/assets/WebLogin-DoN5NqHF.js","/assets/WorkerConcerns-Fa75lxQ4.js","/assets/Workers-Dcz4oldg.js","/assets/Zagruzka-DZYxVBvW.js","/assets/ZagruzkaCell-D-IWyzjM.js","/assets/api-BCXbu84I.js","/assets/archive-BlpfRTjL.js","/assets/archive-restore-DFCevp0f.js","/assets/arrow-down-h-F6hzCA.js","/assets/arrow-left-BbD1S8vp.js","/assets/arrow-up-0ZbouEoU.js","/assets/arrow-up-narrow-wide-3b9YgI8J.js","/assets/arrow-up-right-CPIwxNT3.js","/assets/award-Y5mVP6Y5.js","/assets/ban-D7I34_2r.js","/assets/book-open-Dls6L1xU.js","/assets/bot-Ds9m58NX.js","/assets/boxes-Bn6vaADU.js","/assets/braces-BZpvArxh.js","/assets/brigadirFilters-CuptMrTA.js","/assets/broadcastTree-DElIL8-v.js","/assets/building-2-DajXf0dw.js","/assets/calculator-BUZtkne7.js","/assets/calendar-CZyXnDtQ.js","/assets/calendar-days-FXX8qtOK.js","/assets/camera-4xc-SOfW.js","/assets/categories-AGk2Pud6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DwEvM4g9.js","/assets/chart-line-B_9NACEF.js","/assets/chart-pie-C6nR7ETO.js","/assets/chartRange-mleYNIDS.js","/assets/check-check-BSNwZ7yn.js","/assets/chevron-left-CGalu94Q.js","/assets/chevrons-up-down-DUNyuQ3n.js","/assets/circle-CgdHMMHf.js","/assets/circle-alert-VzvpN07E.js","/assets/circle-check-big-BUVb9AJ9.js","/assets/circle-dashed-DcbXDAlm.js","/assets/circle-minus-Vi82qpMZ.js","/assets/circle-question-mark-ChZMyzyY.js","/assets/circle-slash-ChHSg3CA.js","/assets/circle-user-round-CCLasusz.js","/assets/clock-3-GdzjxPAc.js","/assets/cloud-off-BTIxVKfC.js","/assets/cloud-upload-BNGwLvGS.js","/assets/compass-eq8r0_YT.js","/assets/concernCategories-CR_5YvC8.js","/assets/copy-C39S_1Hi.js","/assets/corner-down-right-C4OfAXqJ.js","/assets/createLucideIcon-BPwjZvO5.js","/assets/es-Cy7nLuLy.js","/assets/exportXlsx-BlM9LI1m.js","/assets/external-link-DvxdWIif.js","/assets/file-clock-COBZsYVE.js","/assets/file-exclamation-point-CNmGLQ2W.js","/assets/file-spreadsheet-DKGQV0CV.js","/assets/file-text-CZ6D3e-Q.js","/assets/flag-BTp3mZ9C.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-9sintXsb.js","/assets/hash-DrmKPgsj.js","/assets/history-BSgVRSfn.js","/assets/hourglass-8Kn4ZQHy.js","/assets/image-DNpkKVID.js","/assets/image-off-CbQ_C-7Y.js","/assets/inbox-CzXsa6be.js","/assets/index-BYo7qxAC.js","/assets/index-D4VDufLq.css","/assets/key-round-CUrEw-_9.js","/assets/keyboard-CCgMG7rT.js","/assets/languages-CjTNmzmr.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CIeuIqdV.js","/assets/lightbulb-myaKVClD.js","/assets/link-2-CEA3EWAc.js","/assets/link-2-off-wbG__h7d.js","/assets/list-ordered-L13LDYLo.js","/assets/list-tree-BMPfYGG8.js","/assets/lock-open-BE16wuh8.js","/assets/log-in-K27oakNO.js","/assets/maximize-2-B78qYoZa.js","/assets/message-square-CLdMEBww.js","/assets/minimize-2-Bn34mHvq.js","/assets/package-check-CtaKEWkS.js","/assets/paperclip-BQGdlgEY.js","/assets/pencil-BfCm9rS1.js","/assets/percent-CcQ8XfI-.js","/assets/pin-WomYg8c2.js","/assets/pin-off-DvhDs2pG.js","/assets/play-B4Pr74uL.js","/assets/plug-zap-BAIlDj2J.js","/assets/presentation-BSrOTh0C.js","/assets/prop-types-B1UUCwYQ.js","/assets/radio-BUrL3yc-.js","/assets/react-apexcharts.esm-DIBRkf_k.js","/assets/registers-GCvLpId1.js","/assets/repeat-BHh9KEcu.js","/assets/rotate-ccw-D0f8HZY5.js","/assets/rotate-cw-DpKFF8gc.js","/assets/save-CV-45ipJ.js","/assets/scopeLinks-BcbD8X6p.js","/assets/scroll-text-CLpIqlva.js","/assets/search-x-LLAbOqp6.js","/assets/segments-FSjBrPfp.js","/assets/send-spLzgh8e.js","/assets/settings-2-CkZlYzw1.js","/assets/shield-CY7t2cZl.js","/assets/shield-alert-CIaYlCXS.js","/assets/shield-check-DEv3F4lZ.js","/assets/shield-question-mark-DOvpL8PB.js","/assets/siren-D3DI60bC.js","/assets/snowflake-BQCWW4ii.js","/assets/split-B1T97JYG.js","/assets/square-De8jAOPB.js","/assets/square-check-big-jQvyMXQa.js","/assets/star-DI2bgSQf.js","/assets/statusBands-D6H-LeiX.js","/assets/store-9RDWMAr_.js","/assets/table-2-CK_G8tXV.js","/assets/table-properties-Cx3sq4ra.js","/assets/tag-BpAFBn3D.js","/assets/timer-off-BH9WoIVl.js","/assets/trending-down-CEKIl_PR.js","/assets/trending-up-C0kHiDWK.js","/assets/undo-2-v2rJW4N6.js","/assets/useChartTheme-DI-m6P0X.js","/assets/useElementWidth-wxeGwQNu.js","/assets/useIsMobile-CHKY9SR8.js","/assets/useOpenParam-CiDwSF_f.js","/assets/useStatusBands-CLMTMch2.js","/assets/useUrlScope-DjfOOZof.js","/assets/user-a7ezNGO6.js","/assets/user-cog-Bhhu28xx.js","/assets/users-Ceq6lYtc.js","/assets/vfx-Btd7n40w.js","/assets/video-Cggcgtmh.js","/assets/wallet-Hbdwmsx9.js","/assets/warehouse-CLEVidVS.js","/assets/x-8MBIRddv.js","/assets/zap-IoC5imzC.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
