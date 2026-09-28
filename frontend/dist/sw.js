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

const BUILD = "2026-09-28T07:11:19.164Z";
const PRECACHE = ["/","/assets/AdminPanel-B5mNb4Zf.js","/assets/AnalysisBoard-BlhfoTJK.js","/assets/Arc-DAU9Kmfm.js","/assets/ArcLegacy-KOPr9Bk9.js","/assets/AttendanceModal-BF2VXBxH.js","/assets/BrigadirProfile-BT7J8t4B.js","/assets/BroadcastReceivers-CB3GECWd.js","/assets/BroadcastRecord-CxomK50O.js","/assets/CatLockNotice-pkZpeEs7.js","/assets/CategoryLegendModal-L_YgsYC9.js","/assets/CellConcerns-F6nFuAlb.js","/assets/CellDetails-C85BlibB.js","/assets/CellFormModal-U6P5mULK.js","/assets/CellLink-DydRciZs.js","/assets/Cells-Be74VtQK.js","/assets/ColumnFilter-DL0vT9lR.js","/assets/ColumnsPicker-DhZiQDEV.js","/assets/CommentsModal-DZqnCgkT.js","/assets/ComparisonTable-Bv7fOXIo.js","/assets/Concerns-ClpTptv4.js","/assets/ConfirmDialog-DTu944o6.js","/assets/Daily-D3vgOuXq.js","/assets/DataTable-DxMtJD72.js","/assets/DateRangePicker-C5gw1bze.js","/assets/DayReportView-B9lMYZf9.js","/assets/DayStepper-YxQ3EMAq.js","/assets/DifferenceBreakdown-CRI10KVr.js","/assets/Downtime-CuCGiu2b.js","/assets/Education-CQkxnrKl.js","/assets/EducationLesson-c9jAMMqc.js","/assets/EmptyState-CjPN8tpO.js","/assets/Exam-CC0lhpOM.js","/assets/FactorySelect-R_7iY4m4.js","/assets/Gamification-BkQlOwOc.js","/assets/GroupBadge-D6-HLYr0.js","/assets/HeatmapChart-DM-JAA7y.js","/assets/IdleCell-B3LZ0iI3.js","/assets/KPICard-CkPFvUxd.js","/assets/Kaizen-DWIcMifp.js","/assets/KpiDeltaCard-BGtaELJP.js","/assets/LangTextInput-XY29Sf83.js","/assets/Layout-Dr6mNt9l.js","/assets/LeaderAppeal-DVo5PmB9.js","/assets/LeaderDayReport-4bMaOq6m.js","/assets/LeaderUnitReport-BNU93TXD.js","/assets/Leaderboard-DIMMWZ5f.js","/assets/Leaders-ltYBLgCD.js","/assets/Lightbox-BgwPE5tY.js","/assets/LiveOverview-DXjzY8V4.js","/assets/Login-DB0gS8tU.js","/assets/NotFound-L-U-7GZi.js","/assets/Overview-IbRqEi6o.js","/assets/Pagination-bpkFg-kD.js","/assets/PerenaladkaFactTable-D2uaw03w.js","/assets/PlanFulfillment-Cjfhnays.js","/assets/Production-BOnqoudK.js","/assets/Profile-BcXjJh8H.js","/assets/ProofCamera-BuOE7S6G.js","/assets/ProofPhoto-DYykMiiL.js","/assets/Quality-DrTs_m49.js","/assets/RequestStateChip-Bq8TuKvh.js","/assets/RichTextEditor-DbAdl1lD.js","/assets/SaveState-DAPmkjUa.js","/assets/SearchInput-Czv_1pO0.js","/assets/SeasonalityHeatmap-Bw-kSfsH.js","/assets/SegmentedToggle-DzGgB-oe.js","/assets/SetupTimes-CXIM3NY2.js","/assets/ShiftDaily-8Dl9CfRi.js","/assets/Staff-CHS0mZZ1.js","/assets/StatusBadge-CluKjjDJ.js","/assets/TargetGoal-BYFwfQOb.js","/assets/Targets-e2wtpWF6.js","/assets/Tasks-BErpAbNx.js","/assets/TimeWheelPicker-CCLHdFaK.js","/assets/Tooltip-BAhCtFmX.js","/assets/TrendChart-Cd5iiX7b.js","/assets/TripleSpeedometer-VtAhILlW.js","/assets/Trudoyomkost-DO7boer1.js","/assets/UsersActivity-DCQshEYm.js","/assets/WatchProgress-vRpDQC2f.js","/assets/WebLogin-D6gyQhOt.js","/assets/WorkerConcerns-Crytg8y3.js","/assets/Workers-BCKz3KpH.js","/assets/Zagruzka-Cq85q7DX.js","/assets/ZagruzkaCell-DO9Ns6QL.js","/assets/alarm-clock-DgSRSzlB.js","/assets/api-B_FcXeDg.js","/assets/archive-RY3OCm0j.js","/assets/archive-restore-DDldXA5K.js","/assets/arrow-down-CpIbOB38.js","/assets/arrow-left-BOJ-L6gz.js","/assets/arrow-left-right-CXKpFga3.js","/assets/arrow-up-CizeeSGH.js","/assets/arrow-up-right-DXJNzmnt.js","/assets/award-CykCDjMR.js","/assets/ban-BVIRCWSf.js","/assets/bot-zVbF0fit.js","/assets/boxes-bRDJlqSr.js","/assets/brigadirFilters-2nviw9RU.js","/assets/broadcastTree-ChBO7L39.js","/assets/building-2-DCDNlYFB.js","/assets/calendar-C6WtU88K.js","/assets/calendar-clock-BcEGNArj.js","/assets/calendar-days-Ct-n0JUY.js","/assets/calendar-range-qvykYxKh.js","/assets/camera-Z87Lllre.js","/assets/categories-921LJcAP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CxClHNhU.js","/assets/chart-line-CycM1WMC.js","/assets/chart-pie-DfddjqE4.js","/assets/chartRange-CgR89lf8.js","/assets/chevron-left-RO4PvGO9.js","/assets/chevrons-up-down-DNacbDAN.js","/assets/circle-check-big-DStFE4mO.js","/assets/circle-dot-Bd9GpBol.js","/assets/circle-minus-BgwWqjA6.js","/assets/circle-slash-Re-HNNSF.js","/assets/circle-user-round-C7oOYvEe.js","/assets/cloud-off-Kv23e_pI.js","/assets/cloud-upload-C0YUFpHq.js","/assets/compass-jY4fM-M4.js","/assets/concernCategories-fw-eSJbX.js","/assets/copy-CKbp_Pxa.js","/assets/corner-down-right-C7Jv1frn.js","/assets/createLucideIcon-CQUsqSuy.js","/assets/es-CvXfVzxU.js","/assets/exportXlsx-CCvVgt3-.js","/assets/external-link-CI-KbY5K.js","/assets/file-clock-DUZiLGIG.js","/assets/file-exclamation-point-Kv5p5EgK.js","/assets/file-spreadsheet-CQfXGJoQ.js","/assets/file-text-CaFPoEVq.js","/assets/flag-BfTgDixS.js","/assets/flame-BUgMXjVZ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CLm-Z_tR.js","/assets/hash-C34GAKDH.js","/assets/history-c6tf-sJm.js","/assets/hourglass-DsqYmeQC.js","/assets/image-DMz5p3nT.js","/assets/image-off-DthUoFZ5.js","/assets/index-1-nHeX7U.js","/assets/index-TBzEnSGJ.css","/assets/key-round-Dcmst39E.js","/assets/keyboard-BDKl_NG-.js","/assets/languages-hKRKRVzd.js","/assets/layers-D5oJ5gHi.js","/assets/leaderReason-BYq-dOvd.js","/assets/lightbulb-Bh_BFs1u.js","/assets/link-2-WrnPCeWa.js","/assets/list-checks-CUtlKYw0.js","/assets/list-ordered-CUIutwJG.js","/assets/list-tree-DXux9gzw.js","/assets/lock-open-DmCcCdQ5.js","/assets/log-in-akZAu_0d.js","/assets/message-square-Dch1X087.js","/assets/minimize-2-gSmiojt-.js","/assets/package-check-Div7Ip2H.js","/assets/paperclip-YcsT0K71.js","/assets/pencil-DDqqscJa.js","/assets/personName-B4KId4zS.js","/assets/pin-iAM_dcv-.js","/assets/pin-off-0f8B3ZVA.js","/assets/play-C7gmz4PY.js","/assets/presentation-D0yZ2Ntc.js","/assets/prop-types-D1EvMOyz.js","/assets/radio-CrPbaLik.js","/assets/react-apexcharts.esm-BCWrdjuQ.js","/assets/repeat-ChZ2Uvtu.js","/assets/rotate-ccw-6x819eIZ.js","/assets/rotate-cw-638HoRCR.js","/assets/save-B8h4nMOi.js","/assets/scale-CLdAUjKO.js","/assets/scroll-text-C667m1lJ.js","/assets/search-x-DJ9gFbIN.js","/assets/segments-BaJCRGWm.js","/assets/send-uIDWMxsl.js","/assets/settings-2-LvfrmmEu.js","/assets/shield-BzfSIgOE.js","/assets/shield-alert-BdW1PiKz.js","/assets/shield-check-C5I9Etka.js","/assets/shield-question-mark-BHXe4S3B.js","/assets/siren-BN6QOwHC.js","/assets/smartphone-DI_BRlXl.js","/assets/snowflake-bAb59Grr.js","/assets/square-RBPR69in.js","/assets/square-check-big-40JbXlGT.js","/assets/star-BySwrWhP.js","/assets/statusBands-8E9_Ou-w.js","/assets/store-BZc1F2CS.js","/assets/table-2-CKV2So6d.js","/assets/tag-DIWtGisD.js","/assets/trending-down-CKu4m194.js","/assets/trending-up-BC9406Wi.js","/assets/undo-2-DW6VGm7N.js","/assets/useChartTheme-C7MUD-mD.js","/assets/useElementWidth-CGBWXAyF.js","/assets/useIsMobile-B3JiYKmH.js","/assets/useMutation-IHRMkeQM.js","/assets/useStatusBands-Dy5lm76m.js","/assets/user-DUKnuDRG.js","/assets/user-check-D8dRzT10.js","/assets/user-cog-BoxAsRXu.js","/assets/user-minus-L7yzMkOV.js","/assets/users-xEXYtmHB.js","/assets/verifyState-CFotGuYw.js","/assets/video-C1TGit2Y.js","/assets/wallet-CpvUwfVF.js","/assets/warehouse-CpMAW3Aq.js","/assets/zap-CHRqLcH0.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
