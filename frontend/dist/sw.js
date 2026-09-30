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

const BUILD = "2026-09-30T08:34:43.263Z";
const PRECACHE = ["/","/assets/AdminPanel-DYwznHhO.js","/assets/AnalysisBoard-Ct138Wqe.js","/assets/Arc-wcXJ1D5r.js","/assets/ArcLegacy-BmgFbEaT.js","/assets/AttendanceModal-BbsynZwf.js","/assets/BrigadirProfile-9Y9bXfmS.js","/assets/BroadcastReceivers-ZBoqoYX1.js","/assets/BroadcastRecord-CLhVEgie.js","/assets/CatLockNotice-p-QVF6bp.js","/assets/CategoryLegendModal-BcQzuc6B.js","/assets/CellConcerns-DvodOyUQ.js","/assets/CellDetails-CRn8yYXN.js","/assets/CellFormModal-61wtZ6xC.js","/assets/CellLink-DUN1LE_P.js","/assets/Cells-CJewlc1X.js","/assets/ColumnFilter-BiX2Z9ub.js","/assets/ColumnsPicker-DxeDPFLX.js","/assets/CommentsModal-C7m9n3nq.js","/assets/ComparisonTable-S9K-fkOn.js","/assets/Concerns-BgFeQkWN.js","/assets/ConfirmDialog-DB2UX1U8.js","/assets/Daily-CPCYt1m-.js","/assets/DataTable-DUA29jkq.js","/assets/DateRangePicker-Dm8i8QX1.js","/assets/DayReportView-eH4cOY0u.js","/assets/DayStepper-BU3X0Svy.js","/assets/DifferenceBreakdown-Cc4SjlGm.js","/assets/Downtime-SnyBT4Nj.js","/assets/Education-DX9YbekO.js","/assets/EducationLesson-Bbfnb0_T.js","/assets/EmptyState-DdMYL6IB.js","/assets/Exam-BW3zMcMY.js","/assets/FactorySelect-DAI6xwFr.js","/assets/Gamification-CkeTC4Cl.js","/assets/GroupBadge-Dqu6jQm_.js","/assets/HeatmapChart-BvQoC-SJ.js","/assets/IdleCell-CEZ_kCdH.js","/assets/KPICard-CEBje-cm.js","/assets/Kaizen-ClQDJgQU.js","/assets/Kelish-CuoxAbGS.js","/assets/KpiDeltaCard-3gQpo6JG.js","/assets/LangTextInput-1U0Dx3kB.js","/assets/Layout-BMDay47I.js","/assets/LeaderAppeal-BkTbOrp5.js","/assets/LeaderDayReport-BztpRJkz.js","/assets/LeaderUnitReport-R3U-H-FU.js","/assets/Leaderboard-Dm2rQAfz.js","/assets/Leaders-B8Wua2NB.js","/assets/Lightbox-d4a3srPK.js","/assets/LiveOverview-Co2-pHfr.js","/assets/Login-DCjDq-9x.js","/assets/NotFound-lbyW68Hd.js","/assets/Overview-v4xugUtX.js","/assets/Pagination-Cdmy5LU1.js","/assets/PerenaladkaFactTable-CjvBUbrV.js","/assets/PlanFulfillment-DaA3EVqD.js","/assets/Production-OX_lUO3g.js","/assets/Profile-BAx2xwDp.js","/assets/ProofCamera-C7XTLSj4.js","/assets/ProofPhoto-CaP_K5-c.js","/assets/Quality-DSYqCrL_.js","/assets/RequestStateChip-DbWc5D0N.js","/assets/RichTextEditor-tGeEO2Ct.js","/assets/SaveState-CAkVr3KP.js","/assets/SearchInput-Dywl88qf.js","/assets/SeasonalityHeatmap-rXlzrs9B.js","/assets/SegmentedToggle-4iESWIrZ.js","/assets/SetupTimes-Bd9-_4km.js","/assets/ShiftDaily-BN3qHhWs.js","/assets/Staff-CCnoxszJ.js","/assets/StatusBadge-Cxm19J8E.js","/assets/TargetGoal-DKxNGG6L.js","/assets/Targets-B3JlQIcz.js","/assets/Tasks-ChZjw3SR.js","/assets/TimeWheelPicker-DrexXdFf.js","/assets/Tooltip-CM2_Sf89.js","/assets/TrendChart-DxHRxMOB.js","/assets/TripleSpeedometer-Dagqihsl.js","/assets/Trudoyomkost-B9X4YIP7.js","/assets/UploadDropzone-DcqFLxkJ.js","/assets/UsersActivity-DoznXfOi.js","/assets/VerdictBlock-CfwFSVmt.js","/assets/WatchProgress-DK3qisve.js","/assets/WebLogin-DC2v45F2.js","/assets/WorkerConcerns-DnLLzyTo.js","/assets/Workers-f5-A4QyL.js","/assets/Zagruzka-DzrKGCit.js","/assets/ZagruzkaCell-Dwo4Z1_T.js","/assets/api-C7NOWGAk.js","/assets/archive-CDj_KJdx.js","/assets/archive-restore-XAA7BAX-.js","/assets/arrow-down-BMcZqHhi.js","/assets/arrow-left-BbhNlOPc.js","/assets/arrow-left-right-BAJebdxP.js","/assets/arrow-up-E_ZD748O.js","/assets/arrow-up-narrow-wide-CZkqdFIK.js","/assets/arrow-up-right-Ds0KMgnW.js","/assets/award-C_vZYNHc.js","/assets/ban-BMDQQSHx.js","/assets/bot-BRqZHRqf.js","/assets/boxes-CiEYLsvu.js","/assets/brigadirFilters-Ddfg_ZxR.js","/assets/broadcastTree-BJ8OqdBb.js","/assets/building-2-8IXtE8Ll.js","/assets/calendar-DNsC-CgY.js","/assets/calendar-clock-pb-v4c4h.js","/assets/calendar-days--InDAc0E.js","/assets/calendar-range-Bb5AZkde.js","/assets/camera-D6HpmHlY.js","/assets/categories-CQANehrh.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DnqL3zID.js","/assets/chart-line-DEcMYsHA.js","/assets/chart-pie-VqbverIN.js","/assets/chartRange-B_9w1YTk.js","/assets/chevron-left-DXE5_A4T.js","/assets/chevrons-up-down-Drye4uTQ.js","/assets/circle-check-big-DcD-Le31.js","/assets/circle-dRzL0Nf4.js","/assets/circle-dot-CfkUsFGz.js","/assets/circle-minus-cwqfBWxI.js","/assets/circle-slash-LTadL63k.js","/assets/circle-user-round-DH4SqwNq.js","/assets/cloud-off-DZRUMeel.js","/assets/cloud-upload-Crv-z5Ht.js","/assets/compass-CoAReT3b.js","/assets/concernCategories-DLv56eyV.js","/assets/copy-Cp1c9vgO.js","/assets/corner-down-right-Di68TKGg.js","/assets/createLucideIcon-DHMMAIsH.js","/assets/es-cMTQwNqH.js","/assets/exportXlsx-CxDcnrmJ.js","/assets/external-link-SkvMZzdd.js","/assets/file-clock-Dn0CWaTV.js","/assets/file-exclamation-point-BgBQxsix.js","/assets/file-spreadsheet-D0lXXFm_.js","/assets/file-text-Bo4jZDRz.js","/assets/flag-BPCeVVmt.js","/assets/flame-Dk8ByRTs.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Ba9q3RwB.js","/assets/hash-DBqOl075.js","/assets/history-xnmdTdQ5.js","/assets/hourglass-DuMkREOV.js","/assets/image-8Ogu5_zv.js","/assets/image-off-CSQl9HDJ.js","/assets/index-BTHIA2aF.js","/assets/index-Bn5n-OZu.css","/assets/key-round-Bgom7b47.js","/assets/keyboard-D8xryFm_.js","/assets/languages-I5XQSCDO.js","/assets/layers-CL9JvTmp.js","/assets/lightbulb-y-ZgXDOT.js","/assets/link-2-BC6efjla.js","/assets/link-2-off-D-zyRhRX.js","/assets/list-checks-DMCSf6EV.js","/assets/list-ordered-DmJo0Gj5.js","/assets/list-tree-CJEDAMzK.js","/assets/lock-open-CINRWKND.js","/assets/log-in-Dtj2TEv5.js","/assets/maximize-2-9z2hdr4z.js","/assets/message-square-qT82dDZ2.js","/assets/minimize-2-CvAizaA2.js","/assets/package-check-DM_TSz5m.js","/assets/paperclip-DNB6KPIk.js","/assets/pencil-BmNgNk2x.js","/assets/percent-BZ60jgYp.js","/assets/personName-CogOuS3K.js","/assets/pin-CVMYGfn9.js","/assets/pin-off-BNtLbfag.js","/assets/play-BfwANqeo.js","/assets/presentation-DK-GErng.js","/assets/prop-types-B5eEeCDI.js","/assets/radio-CAoePkOG.js","/assets/react-apexcharts.esm-g-QDu-nV.js","/assets/repeat-Ddz6C2_l.js","/assets/rotate-ccw-l8EYMRVb.js","/assets/rotate-cw-BVpPVUiR.js","/assets/save-Cw2x-uLu.js","/assets/scale-Cp7Nw0fK.js","/assets/scopeLinks-PmBKnW-j.js","/assets/scroll-text-osGCuH9k.js","/assets/search-x-SuySOpGi.js","/assets/segments-DQChuUBG.js","/assets/send-Bs764H3D.js","/assets/settings-2-BIDONAzT.js","/assets/shield-B2q00q5-.js","/assets/shield-alert-BafZkie7.js","/assets/shield-check-zpjn7BK5.js","/assets/shield-question-mark-d60yAKr8.js","/assets/siren-kyLBfH_H.js","/assets/snowflake-Bl6-RRIZ.js","/assets/square-Cp01uw42.js","/assets/square-check-big-DEfVp128.js","/assets/star-_onC_Q7x.js","/assets/statusBands-C42l_Zo2.js","/assets/store-BflO56HP.js","/assets/table-2-BIPM9NRk.js","/assets/table-properties-kvdsL5CQ.js","/assets/tag-DDgme5td.js","/assets/timer-off-BHtKHjbK.js","/assets/trending-down-BZTailWJ.js","/assets/trending-up-OgrkWOTP.js","/assets/undo-2-DhO4QhF6.js","/assets/useChartTheme-BfVh8RaQ.js","/assets/useElementWidth-DaVXVgKP.js","/assets/useIsMobile-8VfCKcs0.js","/assets/useMutation-BCagGUHB.js","/assets/useStatusBands-CPpy23Uc.js","/assets/useUrlScope-DWmJiRIa.js","/assets/user-Pwoa9LnD.js","/assets/user-cog-BNwRfzFK.js","/assets/user-minus-C3tq0QMw.js","/assets/users-DmUCF9Iu.js","/assets/video-DsYxdknh.js","/assets/wallet-BK0-wTL3.js","/assets/warehouse-Cge72BhY.js","/assets/zap-Cv8kteYo.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
