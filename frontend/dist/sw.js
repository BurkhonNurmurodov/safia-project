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

const BUILD = "2026-10-05T05:10:12.233Z";
const PRECACHE = ["/","/assets/AdminPanel-BYP63TtN.js","/assets/AnalysisBoard-5UWAkY3R.js","/assets/Arc-B6wzmhy1.js","/assets/ArcLegacy-DeY1z9aj.js","/assets/BrigadirProfile-Dk53aA5P.js","/assets/BroadcastReceivers-lUzTu6Q8.js","/assets/BroadcastRecord-Bnc-wXV8.js","/assets/CatLockNotice-C4TOWlmF.js","/assets/CategoryLegendModal-BP4_0PeK.js","/assets/CellConcerns-lh17EroR.js","/assets/CellDetails-Ae9syU2N.js","/assets/CellFormModal-Dy4qVfrz.js","/assets/CellIdent-Jc1MKaMt.js","/assets/CellLink-C2_rzjIx.js","/assets/Cells-Dh94AqUG.js","/assets/ColumnFilter-i39JRVJC.js","/assets/ColumnsPicker-CQfItRVZ.js","/assets/CommentsModal-CoydFcqE.js","/assets/ComparisonTable-B-xVEZf9.js","/assets/Concerns-BGqMLQf9.js","/assets/ConfirmDialog-DwV7HRV9.js","/assets/Daily-q2NQMats.js","/assets/DataTable-CyVapelI.js","/assets/DateRangePicker-BLFVUkAB.js","/assets/DayReportView-DSm0gADN.js","/assets/DayStepper-NBb2AXvV.js","/assets/DifferenceBreakdown-DBQ9gK22.js","/assets/Downtime-ButxbkyX.js","/assets/Education-Bvdw6Xeu.js","/assets/EducationLesson-CFTe3h1-.js","/assets/EmptyState-DcFaS4Tk.js","/assets/Exam-LMmO4oBI.js","/assets/FactorySelect-BKQ32eph.js","/assets/Gamification-COBUFsKv.js","/assets/GroupBadge-pOT7Vwpu.js","/assets/HeatmapChart-BzkeYdmN.js","/assets/IdleCell-BT1xaVD3.js","/assets/KPICard-C56VfVeD.js","/assets/Kaizen-DB6JE7_X.js","/assets/Kelish-Z2t1bmGG.js","/assets/KpiDeltaCard-WX1K9g-z.js","/assets/LangTextInput-DiNWFFuL.js","/assets/Layout-o8Ccq_rl.js","/assets/LeaderAppeal-BxEWzAWX.js","/assets/LeaderDayReport-CD_gJ-7s.js","/assets/LeaderUnitReport-DMQVngEL.js","/assets/Leaderboard-Cuqk9H-I.js","/assets/Leaders-C8G1gd9A.js","/assets/Lightbox-BGkntT8s.js","/assets/LiveOverview-J8sAQzL2.js","/assets/Login-D-52_f-I.js","/assets/NotFound-BDf0ioWQ.js","/assets/Notifications-DivJI99i.js","/assets/Overview-C_ZL-RzM.js","/assets/Pagination-DCyiGdmC.js","/assets/PerenaladkaFactTable-BxHBPzgE.js","/assets/PersonCard-8ujgl4ap.js","/assets/PlanFulfillment-4zFpFQFb.js","/assets/Production-Hn0oE-ek.js","/assets/Profile-DEEYYqIR.js","/assets/ProofCamera-BUJ2CGUj.js","/assets/ProofPhoto-CEiiPY4V.js","/assets/Quality-DNzfJxjm.js","/assets/RawRows-COhBWjd8.js","/assets/RequestStateChip-BV_UQuDE.js","/assets/RichTextEditor-BFnFPM_p.js","/assets/SaveState-BFlSFbwL.js","/assets/SearchInput-ZoXGQZag.js","/assets/SeasonalityHeatmap-BywUtnAF.js","/assets/SegmentedToggle-CGS0g5Op.js","/assets/SetupTimes-BmY2vv-X.js","/assets/ShiftDaily-DUgFHJsN.js","/assets/Staff-Wp2sEpg_.js","/assets/StaffLive-DV_JO05v.js","/assets/StatusBadge-CgYZ1C7h.js","/assets/TargetGoal-Cfkxzm3r.js","/assets/Targets-UEQiSsmi.js","/assets/Tasks-BPbxOOW3.js","/assets/TimeWheelPicker-DQEUgox8.js","/assets/Toast-BwHSDh52.js","/assets/Tooltip-C7NA5wLZ.js","/assets/TrendChart-CvScOsqV.js","/assets/TripleSpeedometer-Dd3gzGNQ.js","/assets/Trudoyomkost-DolN3ObX.js","/assets/Turnover-CpuSKMgU.js","/assets/UploadDropzone-C_aXaZ6U.js","/assets/UsersActivity-BbLuqeK0.js","/assets/VerdictBlock-CtdC2-5R.js","/assets/VfxApiMap-CLowWoFh.js","/assets/VfxDictionaries-wC2c05eM.js","/assets/VfxEmployees-DM9ac3Rs.js","/assets/VfxHrMoves-cVCCoID1.js","/assets/VfxJobs-CCcB8A4D.js","/assets/VfxPhoto-Bxdnj6m3.js","/assets/VfxShifts-CyE2dxoZ.js","/assets/VfxState-BurcBvR5.js","/assets/VfxTimebooks-BiLtz32R.js","/assets/VfxTimesheet-jGecAHvz.js","/assets/WatchProgress-DKu2TyaJ.js","/assets/WebLogin-C9luIgIw.js","/assets/WorkerConcerns-B3uBFQHr.js","/assets/Workers-CZVRTnyc.js","/assets/Zagruzka-BkU7JzYs.js","/assets/ZagruzkaCell-CQo2ZlKf.js","/assets/api-MqFVkkuW.js","/assets/archive-CISFJ3UV.js","/assets/archive-restore-Ctgv84uU.js","/assets/arrow-down-BAmtLjOk.js","/assets/arrow-left-hIoJ_Uvh.js","/assets/arrow-up-Ot4hUQre.js","/assets/arrow-up-narrow-wide-DMTe0J09.js","/assets/arrow-up-right-JiMlbBSu.js","/assets/award-yaBDmAna.js","/assets/ban-x5sGsTQW.js","/assets/book-open-ybOVWvzd.js","/assets/bot-C_HjUuZw.js","/assets/boxes-C-cz5wwt.js","/assets/braces-CgQDn-eR.js","/assets/brigadirFilters-BkkWoH_3.js","/assets/broadcastTree-Df8cexQO.js","/assets/building-2-iiggCAsn.js","/assets/calculator-C8kLgiff.js","/assets/calendar-BbsoJtKq.js","/assets/calendar-days-CkKORMaj.js","/assets/camera-D3E3ILG9.js","/assets/categories-TRfb2gxk.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D0lQ3zHF.js","/assets/chart-line-CZACxw6O.js","/assets/chart-pie-hqUhCUCR.js","/assets/chartRange-B8tg2PWA.js","/assets/check-check-BGeMrKVY.js","/assets/chevron-left-CM2hhlev.js","/assets/chevrons-up-down-C4CMdhDR.js","/assets/circle-DqJPA_JB.js","/assets/circle-alert-D1mNMCh7.js","/assets/circle-check-big-Ba5y4w3v.js","/assets/circle-dashed-C_qiADsF.js","/assets/circle-minus-9xqxp0Xh.js","/assets/circle-question-mark-lWzl5wAI.js","/assets/circle-slash-BNCTblSZ.js","/assets/circle-user-round-Cexu9C3U.js","/assets/clock-3-Bsolo8sa.js","/assets/cloud-off-NIgSnW3_.js","/assets/cloud-upload-CjemjU2x.js","/assets/compass-BBvhRiwa.js","/assets/concernCategories-2lqaeyvc.js","/assets/copy-CQTNCNnC.js","/assets/corner-down-right-DRbrg5GM.js","/assets/createLucideIcon-DOO6_aDx.js","/assets/es-BQHdkDq6.js","/assets/exportXlsx-B5eU5l0z.js","/assets/external-link-DbQzzkYa.js","/assets/file-clock-C9-4zfGN.js","/assets/file-exclamation-point-BJRpp2-5.js","/assets/file-spreadsheet-CGyFFGWr.js","/assets/file-text-ewR7_WWP.js","/assets/flag-NsJRxy6H.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-h_NRI4ox.js","/assets/hash-CauYTk2W.js","/assets/history-BmfJwgy3.js","/assets/hourglass-DFZrxSlN.js","/assets/image-o5AAlDdj.js","/assets/image-off-Dhnx8YH4.js","/assets/inbox-DAEegUZP.js","/assets/index-DjwE3Zj3.js","/assets/index-mJxwuT6s.css","/assets/key-round-C-CddBxk.js","/assets/keyboard-_40yMBIR.js","/assets/languages-CGakbpnm.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C7aHQq6c.js","/assets/lightbulb-U-kV1-Wd.js","/assets/link-2-f3ODFfJT.js","/assets/link-2-off-72ff8Hr3.js","/assets/list-ordered-B-krjjOd.js","/assets/list-tree-4oNT83fc.js","/assets/lock-open-OR746ciX.js","/assets/log-in-JTTBjxbH.js","/assets/maximize-2-BV7A5o9-.js","/assets/message-square-CM7nRyqi.js","/assets/minimize-2-B7vp2H_m.js","/assets/package-check-CBmE8F3t.js","/assets/paperclip-BrDFsKeH.js","/assets/pencil-Dlux-bWl.js","/assets/percent-Dygiz__C.js","/assets/pin-B6iT14Mv.js","/assets/pin-off--QAH4J_v.js","/assets/play-Bbw15Jev.js","/assets/plug-zap-0Qkv18gp.js","/assets/presentation-DM1N8EyX.js","/assets/prop-types-BKspsmSp.js","/assets/radio-B2gsZqTD.js","/assets/react-apexcharts.esm-BaCZcQ-F.js","/assets/registers-Cz8S8h1J.js","/assets/repeat-CVEWmCqh.js","/assets/rotate-ccw-DpV8Meag.js","/assets/rotate-cw-C8VNE3O7.js","/assets/save-gNdo7pu0.js","/assets/scopeLinks-DVskeZoP.js","/assets/scroll-text-D4UO-dBd.js","/assets/search-x-Sv7PFHbs.js","/assets/segments-JEr4EWZQ.js","/assets/send-DwSQRBc0.js","/assets/settings-2-CE04Lb3J.js","/assets/shield-XmPx0ex1.js","/assets/shield-alert-JTKl6g-m.js","/assets/shield-check-DRlVA4Ji.js","/assets/shield-question-mark-CPCUNbjy.js","/assets/siren-JvalqJCn.js","/assets/snowflake-zLtC2EB2.js","/assets/split-F4bd7KCl.js","/assets/square-DJdO3STR.js","/assets/square-check-big-BZQDBVkI.js","/assets/star-DAXw33Sn.js","/assets/statusBands-CCaLjztx.js","/assets/store-B5b3RZ2z.js","/assets/table-2-BYTbtWI9.js","/assets/table-properties-ZjoXGcww.js","/assets/tag-CQ9QdHTx.js","/assets/timer-off-B9O7FoSD.js","/assets/trending-down-brLymPAj.js","/assets/trending-up-Erb_l6Sc.js","/assets/undo-2-Bz8i0kFd.js","/assets/useChartTheme-IiHRZdzD.js","/assets/useElementWidth-CtNwDm10.js","/assets/useIsMobile-DqcQi5YE.js","/assets/useOpenParam-BOEn8czi.js","/assets/useStatusBands-CcLjYYfG.js","/assets/useUrlScope-avkz-xcR.js","/assets/user-CVqIGR-6.js","/assets/user-cog-DkdcOJjk.js","/assets/users-Cw1qAHRY.js","/assets/vfx-CnZXd-xd.js","/assets/video-DjifKs5S.js","/assets/wallet-LIChgFhw.js","/assets/warehouse-4bCevMXO.js","/assets/x-P48PsNPq.js","/assets/zap-CwMg08Bp.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
