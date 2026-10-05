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

const BUILD = "2026-10-05T18:04:28.540Z";
const PRECACHE = ["/","/assets/AdminPanel-lGh2ky7z.js","/assets/AnalysisBoard-B3OimPwH.js","/assets/Arc-Dy6JUgsb.js","/assets/BrigadirProfile-MrJdlN_s.js","/assets/BroadcastReceivers-CkHmLcdC.js","/assets/BroadcastRecord-BSxHNZKu.js","/assets/Button-Dokq5qLI.js","/assets/CatLockNotice-mTujRLDq.js","/assets/CategoryLegendModal-DppnQkz7.js","/assets/CellConcerns--LMAqV1m.js","/assets/CellDetails-DCYaHCf2.js","/assets/CellFormModal-BmQMcz0Q.js","/assets/CellIdent-BaB7GiTX.js","/assets/CellLink-Bux3kdD3.js","/assets/Cells-DLIqQDH1.js","/assets/ColumnFilter-C_VFV91q.js","/assets/ColumnsPicker-BFq9oWA0.js","/assets/CommentsModal-3ohWXE7z.js","/assets/ComparisonTable-B6PQUTmx.js","/assets/Concerns-CJCPNXPq.js","/assets/Daily-MQhNyHRX.js","/assets/DataTable-BZgr_Zq_.js","/assets/DateRangePicker-DV0y2iXQ.js","/assets/DayReportView-DZBjGxkQ.js","/assets/DayStepper-BTEn1M6t.js","/assets/DifferenceBreakdown-hCqvSAYX.js","/assets/Downtime-Qh4WHKcd.js","/assets/Education-CW1UVN5m.js","/assets/EducationLesson-DsJfs0Tu.js","/assets/EmptyState-D_bl5V2q.js","/assets/Exam-5ovjE1oR.js","/assets/FactorySelect-5_SQqJ6X.js","/assets/Gamification-73pjIpVm.js","/assets/GroupBadge-B8Dc2fRU.js","/assets/HeatmapChart-JNjWVKMk.js","/assets/IdleCell-B3KBhTbq.js","/assets/KPICard-Nanhpojj.js","/assets/Kaizen-BXMQnvkE.js","/assets/Kelish-CAWIheZV.js","/assets/KpiDeltaCard-CpDvCDRm.js","/assets/LangTextInput-B9HPhLj8.js","/assets/Layout-vEY_TsTv.js","/assets/LeaderAppeal-DeGARdKy.js","/assets/LeaderDayReport-ByCIqdYP.js","/assets/LeaderUnitReport-Zrxfwl_T.js","/assets/Leaderboard-D1H3HF_5.js","/assets/Leaders-Idmg2JxF.js","/assets/Lightbox-CeT6aCZG.js","/assets/LiveOverview-CqlVv40r.js","/assets/Login-D3xxkuGs.js","/assets/NotFound-D4Tvisl6.js","/assets/Notifications-LVqSPikG.js","/assets/Overview-CS0PHOxt.js","/assets/Pagination-BhLMXUaL.js","/assets/PerenaladkaFactTable-C76pAtt9.js","/assets/PersonCard-DoQnle8k.js","/assets/PlanFulfillment-CagiuoQG.js","/assets/Production-TqouXypE.js","/assets/Profile-CxFXYxBl.js","/assets/ProofCamera-BDidd-8G.js","/assets/ProofPhoto-mRkD7Cg0.js","/assets/Quality-CPfWKeYA.js","/assets/RawRows-Bmuz4RXc.js","/assets/RequestStateChip-Cwy80Y7V.js","/assets/RichTextEditor-B38kjcCv.js","/assets/SaveState-D3mlOJvf.js","/assets/SearchInput-BaLy-ysg.js","/assets/SeasonalityHeatmap-BtDw8G3L.js","/assets/SegmentedToggle-v4PgJa1D.js","/assets/SetupTimes-DXgGaP32.js","/assets/ShiftDaily-UQRWXaU-.js","/assets/Staff-49MZl1G3.js","/assets/StaffLive-D1c4S7Bl.js","/assets/StatusBadge-Dd8wtizl.js","/assets/TargetGoal-DESP3DeS.js","/assets/Targets-DH0zaNXk.js","/assets/Tasks-DW-PpUjX.js","/assets/TimeWheelPicker-DiZv-TX9.js","/assets/Toast-Qv8-LKAD.js","/assets/Tooltip-fc0Hp04W.js","/assets/TrendChart-J55BiiVT.js","/assets/TripleSpeedometer-2PoZwuxd.js","/assets/Trudoyomkost-4sNH94dH.js","/assets/Turnover-CkSD9jZN.js","/assets/UploadDropzone-DDJJd3CJ.js","/assets/UsersActivity-BLyARaFT.js","/assets/VerdictBlock-BwJbneKs.js","/assets/VfxApiMap-DRPrwTE5.js","/assets/VfxDictionaries-DCqfVhor.js","/assets/VfxEmployees-DqaD8AKV.js","/assets/VfxHrMoves-BIs-4MPv.js","/assets/VfxJobs-CfG49XYE.js","/assets/VfxPhoto-B5qWmS9e.js","/assets/VfxShifts-DBiK3Glo.js","/assets/VfxState-B_b9Yl0I.js","/assets/VfxTimebooks-Cq9jwBnq.js","/assets/VfxTimesheet-COyClgi-.js","/assets/WatchProgress-D0bMrpFz.js","/assets/WebLogin-B6TJ24pJ.js","/assets/WorkerConcerns-BSaq2Dg-.js","/assets/Workers-CajyM7By.js","/assets/Zagruzka-CUmxCkKP.js","/assets/ZagruzkaCell-Dl3B0TsV.js","/assets/api-BgVjRMbE.js","/assets/archive-U-hpJahv.js","/assets/archive-restore-BlwoSrg1.js","/assets/arrow-down-Bkvuh7vT.js","/assets/arrow-left-gIfkP99j.js","/assets/arrow-up-narrow-wide-CWoitkkO.js","/assets/arrow-up-right-Cfzxoz_c.js","/assets/arrow-up-x6QTBlAi.js","/assets/award-BgX5EXdb.js","/assets/ban-DLJPVrBv.js","/assets/book-open-DjE-C-rI.js","/assets/boxes-GTiBadff.js","/assets/braces-DK0BzJg4.js","/assets/brigadirFilters-Bm3Dp4Eh.js","/assets/broadcastTree-B6eUqF7M.js","/assets/building-2-BSh8POAH.js","/assets/calculator-DSmynz1i.js","/assets/calendar-CaIJNfkI.js","/assets/calendar-days-B_fxx_Su.js","/assets/camera-9Z0QZlSq.js","/assets/categories-B4DFoECt.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-_HfNFQC6.js","/assets/chart-line-CA89QuvU.js","/assets/chart-pie-Cthb5xHb.js","/assets/chartRange-BZM99nu-.js","/assets/check-check-CpgG19L2.js","/assets/chevron-left-DD4qNqsB.js","/assets/chevrons-up-down-BD3AEr82.js","/assets/circle-BZJAe8SL.js","/assets/circle-alert-Bq-9Rk93.js","/assets/circle-check-big-CjvDGaJh.js","/assets/circle-dashed-CDAiD2uC.js","/assets/circle-minus-BrqvlOxT.js","/assets/circle-question-mark-BKjQZBjp.js","/assets/circle-slash-B9_R4BWU.js","/assets/circle-user-round-ZZ6WkXQK.js","/assets/clock-3-7nEu3zDw.js","/assets/cloud-off-cUVvi4lE.js","/assets/cloud-upload-iszOn1kQ.js","/assets/compass-69vpAqqz.js","/assets/concernCategories-BlFepZWY.js","/assets/copy-DyL5-fOB.js","/assets/corner-down-right-D37WdHWi.js","/assets/createLucideIcon-DlP6zyTi.js","/assets/es-6gIBK_lE.js","/assets/exportXlsx-D9qVA0Qz.js","/assets/external-link-D2M6QSwT.js","/assets/file-clock-BYHKTqmY.js","/assets/file-exclamation-point-Czh9DQMV.js","/assets/file-spreadsheet-D9JbtY_S.js","/assets/file-text-NOBa9Fp0.js","/assets/flag-q27M_YQV.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BfeAfTWK.js","/assets/hash-C1LY4WOt.js","/assets/history-BUhB6kwe.js","/assets/hourglass-B0ovZO-i.js","/assets/image-3tJQJV1u.js","/assets/image-off-hrOy5qmv.js","/assets/inbox-BOfK5B_t.js","/assets/index-BuPRzGD4.js","/assets/index-jsa3Vd7f.css","/assets/key-round-VBpWveKa.js","/assets/keyboard-DDVCkGJs.js","/assets/languages-Cq5q30Kq.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Ck_Ud0Xx.js","/assets/lightbulb-DY9JDyVR.js","/assets/link-2-BWnY_kpI.js","/assets/link-2-off-ByjMfRbL.js","/assets/list-ordered-DvZQwCO0.js","/assets/list-tree-DM342n2H.js","/assets/lock-open-7T6xx2yt.js","/assets/log-in-CH42khrX.js","/assets/maximize-2-D0xg-7MH.js","/assets/message-square-B0749Lpt.js","/assets/minimize-2-DVlFJL0Q.js","/assets/package-check-BUd2Z3sg.js","/assets/paperclip-CuUyqFVP.js","/assets/pencil-DQgRR0v0.js","/assets/percent-CaA60HjJ.js","/assets/pin-CVL89stU.js","/assets/pin-off-BygQulGH.js","/assets/play-D4Hexjwh.js","/assets/plug-zap-Cn3MXmHt.js","/assets/presentation-DX9byUcP.js","/assets/prop-types-BpI6ctHQ.js","/assets/radio-C-JZd5BJ.js","/assets/react-apexcharts.esm-Ba9ZrA0g.js","/assets/registers-BabKfOWv.js","/assets/repeat-CdidXHb-.js","/assets/rotate-ccw-CCMttDQQ.js","/assets/rotate-cw-KQhyY57H.js","/assets/save-KatvoMqz.js","/assets/scopeLinks-Bosz4M6k.js","/assets/scroll-text-yYv6b2cf.js","/assets/search-x-JZksl66m.js","/assets/segments-L2H6grXg.js","/assets/send-CAGafRdg.js","/assets/settings-2-Xtf8iUZP.js","/assets/shield-3lbBguIH.js","/assets/shield-alert-KcunleQH.js","/assets/shield-check-Yb5fBFl4.js","/assets/shield-question-mark-C0CUBh4c.js","/assets/siren-Cp6OFNL2.js","/assets/snowflake-BvldFErT.js","/assets/split-BortytyU.js","/assets/square-DdUwn38r.js","/assets/square-check-big-Dbog7--R.js","/assets/star-BYs6x5iT.js","/assets/statusBands-BIxSSQDq.js","/assets/store-D0t0iCDd.js","/assets/table-2-DgcMFqAm.js","/assets/table-properties-BtiDDiiT.js","/assets/tag-CZFb7XPX.js","/assets/timer-off-BDR0g3Nt.js","/assets/trending-down-Ch1efYNC.js","/assets/trending-up-6uDIpBxk.js","/assets/undo-2-4ji0LVNA.js","/assets/useChartTheme-BFO-flP_.js","/assets/useElementWidth-D2c3562K.js","/assets/useIsMobile-xZ_lXYeX.js","/assets/useOpenParam-zvDs9twY.js","/assets/useStatusBands-BSZ6uB-s.js","/assets/useUrlScope-Ba3wibRT.js","/assets/user--IL7HDrP.js","/assets/user-cog-BwcfrAM-.js","/assets/users-RQj4mR9v.js","/assets/vfx-C0GOv0q1.js","/assets/video-BuOyS0Hb.js","/assets/wallet-C4Ja7xcx.js","/assets/warehouse-BwiuaR58.js","/assets/x-D7TF3c4J.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
