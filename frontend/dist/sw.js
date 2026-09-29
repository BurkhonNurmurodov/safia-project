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

const BUILD = "2026-09-29T05:22:42.504Z";
const PRECACHE = ["/","/assets/AdminPanel-Bj_39_nw.js","/assets/AnalysisBoard-DNt-t4np.js","/assets/Arc-D50MhA_4.js","/assets/ArcLegacy-CCyXY5sB.js","/assets/AttendanceModal-Dy0OoHR0.js","/assets/BrigadirProfile-h6QPdA6p.js","/assets/BroadcastReceivers-CJFTXVG4.js","/assets/BroadcastRecord-CxE11gvh.js","/assets/CatLockNotice-CcYCN7EH.js","/assets/CategoryLegendModal-DcbM9uId.js","/assets/CellConcerns-Djz81HuN.js","/assets/CellDetails-C8TglvwN.js","/assets/CellFormModal-B39VhNLS.js","/assets/CellLink-CQDtwivy.js","/assets/Cells-C9dTejbO.js","/assets/ColumnFilter-B2X3ynX3.js","/assets/ColumnsPicker-DIv8bG5o.js","/assets/CommentsModal-BsKpB7Bc.js","/assets/ComparisonTable-CB0vGGyz.js","/assets/Concerns-0l48_Wqu.js","/assets/ConfirmDialog-DP5OpAiZ.js","/assets/Daily-BWxCxaZh.js","/assets/DataTable-BDDU6CW_.js","/assets/DateRangePicker-DyG3bXW4.js","/assets/DayReportView-CjNzZ_X0.js","/assets/DayStepper-D3Puat_E.js","/assets/DifferenceBreakdown-TfaZI9md.js","/assets/Downtime-DOGGFe-g.js","/assets/Education-BIN1Lbli.js","/assets/EducationLesson-49GKmfNn.js","/assets/EmptyState-XkRqmwZk.js","/assets/Exam-ssaWreMy.js","/assets/FactorySelect-DLX9-LLZ.js","/assets/Gamification-DOup56w4.js","/assets/GroupBadge-C7RCBdMA.js","/assets/HeatmapChart-ZTwIQOPq.js","/assets/IdleCell-B0Rs1TJV.js","/assets/KPICard-DDjdE_Jw.js","/assets/Kaizen-BQweCSiA.js","/assets/Kelish-B6ZH7o-T.js","/assets/KpiDeltaCard-NWKgXwXX.js","/assets/LangTextInput-ERP0ChGA.js","/assets/Layout-DydiBrIH.js","/assets/LeaderAppeal-CoPIZo2G.js","/assets/LeaderDayReport-BG1uOkPG.js","/assets/LeaderUnitReport-DXdJXF1W.js","/assets/Leaderboard-DG9BhuE4.js","/assets/Leaders-BfJPz_FT.js","/assets/Lightbox-BpLgrObw.js","/assets/LiveOverview-IZlDcv7-.js","/assets/Login-D0_5qIFk.js","/assets/NotFound-PgNPnO8W.js","/assets/Overview-CzWu0ZKR.js","/assets/Pagination-CW3mo0wk.js","/assets/PerenaladkaFactTable-Dss7loT2.js","/assets/PlanFulfillment-s1xRmwJD.js","/assets/Production-DTSS8jk0.js","/assets/Profile-zOQWD92h.js","/assets/ProofCamera-C0MMws9h.js","/assets/ProofPhoto-BJEQ5Ahh.js","/assets/Quality-Bsdcvnl-.js","/assets/RequestStateChip-Bh3TY3pC.js","/assets/RichTextEditor-CL64rCv3.js","/assets/SaveState-BCbZLj6O.js","/assets/SearchInput-Dv5D4i7u.js","/assets/SeasonalityHeatmap-B5mcu48g.js","/assets/SegmentedToggle-DUWSmpZe.js","/assets/SetupTimes-CbWXGxVs.js","/assets/ShiftDaily-CB94O0jq.js","/assets/Staff-BgFWqkcf.js","/assets/StatusBadge-CJD5Uy8i.js","/assets/TargetGoal-bqjOqgeH.js","/assets/Targets-BPtH0sk9.js","/assets/Tasks-CjTXle-z.js","/assets/TimeWheelPicker-EBWDsoX1.js","/assets/Tooltip-D9DVkKBb.js","/assets/TrendChart-BY1wxnZL.js","/assets/TripleSpeedometer-CkVqcn8e.js","/assets/Trudoyomkost-IX50dZE5.js","/assets/UploadDropzone-0iK0X5Qm.js","/assets/UsersActivity-CCyoIt8Q.js","/assets/VerdictBlock-Dautvdq-.js","/assets/WatchProgress-vWwO4i-O.js","/assets/WebLogin-y1yl9MxC.js","/assets/WorkerConcerns-BQtQZqJe.js","/assets/Workers-AobVGR1f.js","/assets/Zagruzka-pTqZD6Cn.js","/assets/ZagruzkaCell-TdaaY1dg.js","/assets/api-DjZiDQ21.js","/assets/archive-hJvmIsb7.js","/assets/archive-restore-L5MNFpnK.js","/assets/arrow-down-DoO6eeke.js","/assets/arrow-left-XszZ1WOO.js","/assets/arrow-left-right-N0RNKvOx.js","/assets/arrow-up-DBv7C9m5.js","/assets/arrow-up-narrow-wide-DHtfFvJk.js","/assets/arrow-up-right-DdGteSoD.js","/assets/award-B7nHDMzr.js","/assets/ban-ReV8hfZv.js","/assets/bot-Cf_P0vj1.js","/assets/boxes-BFXQEL-P.js","/assets/brigadirFilters-DD4S0oFL.js","/assets/broadcastTree-lqxcYja7.js","/assets/building-2-PJ8jIV2B.js","/assets/calendar-Dr3li1_J.js","/assets/calendar-clock-CoVSVoeQ.js","/assets/calendar-days-C0UyvXRK.js","/assets/calendar-range-BYUacW0K.js","/assets/camera-v2uogCwP.js","/assets/categories-UvE9Nqd7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CYfbxXVg.js","/assets/chart-line-DR-Q6WbO.js","/assets/chart-pie-HEeYxAy8.js","/assets/chartRange-DKJ8n068.js","/assets/chevron-left-DufahFQ1.js","/assets/chevrons-up-down-B6tYPhHQ.js","/assets/circle-DmggrImg.js","/assets/circle-check-big-B-Cp5QMD.js","/assets/circle-dot-CH2MDXA1.js","/assets/circle-minus-BEW9FxE2.js","/assets/circle-slash-CC_y8cwM.js","/assets/circle-user-round-DinfB8Ea.js","/assets/cloud-off-CdWJfxaH.js","/assets/cloud-upload-Chf-_3EF.js","/assets/compass-CGeM5Ee5.js","/assets/concernCategories-DOKj-zIt.js","/assets/copy-TIrcq9EJ.js","/assets/corner-down-right-B_OjYEyO.js","/assets/createLucideIcon-DK8Ls_sa.js","/assets/es-fDFmFnYg.js","/assets/exportXlsx-wh0yyvSv.js","/assets/external-link-DQSIGF3p.js","/assets/file-clock-Di9OagqX.js","/assets/file-exclamation-point-nirdxqtN.js","/assets/file-spreadsheet-UmwK1i8Y.js","/assets/file-text-B-Fot50q.js","/assets/flag-B2EY_j08.js","/assets/flame-GbONoiDr.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CfjCO33c.js","/assets/hash-CfdqS9JE.js","/assets/history-BR-mEjDN.js","/assets/hourglass-BDzSA7SC.js","/assets/image-Bd1QU0W1.js","/assets/image-off-CCBF8jDu.js","/assets/index-BtjWqi6K.css","/assets/index-DQtB-ofe.js","/assets/key-round-BxMinttK.js","/assets/keyboard-K7tK-tm5.js","/assets/languages-BalnWlYX.js","/assets/layers-ZixDPf0Z.js","/assets/lightbulb-B0hmVpBP.js","/assets/link-2-CwYkJy3f.js","/assets/link-2-off-Cp_fmsQL.js","/assets/list-checks-vdi18E_j.js","/assets/list-ordered-CZxN5NIW.js","/assets/list-tree-Dm1tvShz.js","/assets/lock-open-xkz3_3dE.js","/assets/log-in-D1TBCMQB.js","/assets/maximize-2-CuJZDMwV.js","/assets/message-square-CtlTW1g_.js","/assets/minimize-2-DjH4PPzu.js","/assets/package-check-ETlCYwcl.js","/assets/paperclip-XKfIHBlh.js","/assets/pencil-TuGjbHyV.js","/assets/percent-D_QgZY5Z.js","/assets/personName-B4KId4zS.js","/assets/pin-lgn1Mnp9.js","/assets/pin-off-DRG5azXZ.js","/assets/play-Ar4WTT6c.js","/assets/presentation-BL4qPXZy.js","/assets/prop-types-BBZS22h5.js","/assets/radio-D8u8kjoa.js","/assets/react-apexcharts.esm-Y5nPOd5k.js","/assets/repeat-DRBBfM7o.js","/assets/rotate-ccw-Bo6nB3x7.js","/assets/rotate-cw-AOs4DEvJ.js","/assets/save-Cpb9trQ4.js","/assets/scale-BnVI-Kkk.js","/assets/scroll-text-Dm54N2YP.js","/assets/search-x-BRdMJhAe.js","/assets/segments-L674lZwb.js","/assets/send-C29KrvYc.js","/assets/settings-2-Cqazd8-E.js","/assets/shield-B2vk3gpy.js","/assets/shield-alert-lNeJBKOv.js","/assets/shield-check-D46ITgq0.js","/assets/shield-question-mark-W0LvWh2v.js","/assets/siren-CTNrt2nH.js","/assets/snowflake-s1V0Nnoz.js","/assets/square-C0Sfm833.js","/assets/square-check-big-B80eZyZ5.js","/assets/star-CBcS6hgd.js","/assets/statusBands-D-29Ptch.js","/assets/store-BapRuTHm.js","/assets/table-2-CMGvzSUW.js","/assets/table-properties-TGG6io2B.js","/assets/tag-BAuZYly4.js","/assets/timer-off-C1L-fh-N.js","/assets/trending-down-DoH6rM56.js","/assets/trending-up-fenegxF-.js","/assets/undo-2-DFnjLqUF.js","/assets/useChartTheme-L1CPe404.js","/assets/useElementWidth-C3ysJFAD.js","/assets/useIsMobile-Bl507AEb.js","/assets/useMutation-CC8vNoll.js","/assets/useStatusBands-B5Gjrez2.js","/assets/user-0PWJ8DYb.js","/assets/user-cog-BqZzavUb.js","/assets/user-minus-DW7ETL5Y.js","/assets/users-CeJQSQyx.js","/assets/video-BxVF6QQZ.js","/assets/wallet-DA15qiR7.js","/assets/warehouse-DcwDnNes.js","/assets/zap-BU92j9Y6.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
