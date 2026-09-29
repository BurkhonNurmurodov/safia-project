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

const BUILD = "2026-09-29T14:42:35.976Z";
const PRECACHE = ["/","/assets/AdminPanel-AqWpm8Z8.js","/assets/AnalysisBoard-BKbPYikQ.js","/assets/Arc-CobpGt1s.js","/assets/ArcLegacy-D4YslZtI.js","/assets/AttendanceModal-BPvEgfAU.js","/assets/BrigadirProfile-DduhrDpT.js","/assets/BroadcastReceivers-Efa_d9rm.js","/assets/BroadcastRecord-p_8QFS1f.js","/assets/CatLockNotice-DoulQUxH.js","/assets/CategoryLegendModal-CeGRrCki.js","/assets/CellConcerns-CN-L5MU3.js","/assets/CellDetails-uNrHdvwr.js","/assets/CellFormModal-D5qdSbFp.js","/assets/CellLink-Cc_prkDt.js","/assets/Cells-BA5amZ4C.js","/assets/ColumnFilter-CcSt_ms6.js","/assets/ColumnsPicker-B8zwQZmo.js","/assets/CommentsModal-CKJpPjyk.js","/assets/ComparisonTable-C7rdsa3x.js","/assets/Concerns-C_w-AIK-.js","/assets/ConfirmDialog-B3AvONo-.js","/assets/Daily-K-R0JQKT.js","/assets/DataTable-DbW0zijO.js","/assets/DateRangePicker-DJ4GJDcG.js","/assets/DayReportView-CAYZMAfZ.js","/assets/DayStepper-xnDIDixG.js","/assets/DifferenceBreakdown-CNRV08rJ.js","/assets/Downtime-DZ4uDlWD.js","/assets/Education-r3jpsqSI.js","/assets/EducationLesson-B8GuqNan.js","/assets/EmptyState-CjZTnder.js","/assets/Exam-57VNtlQM.js","/assets/FactorySelect-B2vx68B0.js","/assets/Gamification-C_8HiNIs.js","/assets/GroupBadge-DQ-qocqM.js","/assets/HeatmapChart-aIMp1chh.js","/assets/IdleCell-BxB4FS0U.js","/assets/KPICard-yP96GUs0.js","/assets/Kaizen-pHbKbcyi.js","/assets/Kelish-Dt_tf8cV.js","/assets/KpiDeltaCard-BpJxl8zv.js","/assets/LangTextInput-D716CxEL.js","/assets/Layout-RdwcRGBB.js","/assets/LeaderAppeal-BgIDxYHH.js","/assets/LeaderDayReport-8WnAo9qX.js","/assets/LeaderUnitReport-Bh0d9afL.js","/assets/Leaderboard-DYRN0ZL4.js","/assets/Leaders-6VQpgYnD.js","/assets/Lightbox-DNvAu72P.js","/assets/LiveOverview-CZI9q2xN.js","/assets/Login-DIM62o-r.js","/assets/NotFound-C-jPzLbr.js","/assets/Overview-CCiD0Uii.js","/assets/Pagination-CbxNHnFV.js","/assets/PerenaladkaFactTable-DIVqnQ4L.js","/assets/PlanFulfillment-DaC1XWl4.js","/assets/Production-BaoKNf2m.js","/assets/Profile-COTKeu7Q.js","/assets/ProofCamera-CVJqmuUh.js","/assets/ProofPhoto-CG2V0r48.js","/assets/Quality-M3_mnNXH.js","/assets/RequestStateChip-OXZ6pj-j.js","/assets/RichTextEditor-C2Kmm4bm.js","/assets/SaveState-DgyT1sfV.js","/assets/SearchInput-DklwpdQn.js","/assets/SeasonalityHeatmap-DjpCdeYb.js","/assets/SegmentedToggle-DfroLMa7.js","/assets/SetupTimes-Dxt2jSTk.js","/assets/ShiftDaily-B3IhT4Ry.js","/assets/Staff-BdjOxyyY.js","/assets/StatusBadge-CNygrlQi.js","/assets/TargetGoal-CjVvRGk7.js","/assets/Targets-DehKeYFM.js","/assets/Tasks-BjeFSQK2.js","/assets/TimeWheelPicker-CsOd4RgS.js","/assets/Tooltip-8L6Z763f.js","/assets/TrendChart-7VmuDydB.js","/assets/TripleSpeedometer-BDU2rPC6.js","/assets/Trudoyomkost-BxBhluYn.js","/assets/UploadDropzone-B2LGmKPY.js","/assets/UsersActivity-DepLP7Vz.js","/assets/VerdictBlock-eC-8sXNi.js","/assets/WatchProgress-C6ycloIo.js","/assets/WebLogin-BcK_V_07.js","/assets/WorkerConcerns-DH9AyNHJ.js","/assets/Workers-BOx5v5ff.js","/assets/Zagruzka-Br6o8PyW.js","/assets/ZagruzkaCell-6HQgEPgz.js","/assets/api-BhT4zbEh.js","/assets/archive-B9L-jXF3.js","/assets/archive-restore-B4Icok3M.js","/assets/arrow-down-Cg0aYkIA.js","/assets/arrow-left-C8wAQupk.js","/assets/arrow-left-right-BYNrrN-p.js","/assets/arrow-up-BtUw2EV2.js","/assets/arrow-up-narrow-wide-D_1CvvRm.js","/assets/arrow-up-right-V_XQTVzk.js","/assets/award-BXOLNW3P.js","/assets/ban-D9sXcGK5.js","/assets/bot-KtDsFP_k.js","/assets/boxes-dSiDWDp5.js","/assets/brigadirFilters-C_COmUiO.js","/assets/broadcastTree-tBDu2CEI.js","/assets/building-2-BK-NZJTM.js","/assets/calendar-Ca0AYaUU.js","/assets/calendar-clock-CSN1m2tm.js","/assets/calendar-days-mjRklYcU.js","/assets/calendar-range-Cy6odk2x.js","/assets/camera-DNBJcPM5.js","/assets/categories-OKhHg8U5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C_HAqubh.js","/assets/chart-line-_xA6sNMO.js","/assets/chart-pie-h8yr7oyc.js","/assets/chartRange-CJWRoXKc.js","/assets/chevron-left-BSZN3LiG.js","/assets/chevrons-up-down-X7Qhustm.js","/assets/circle-MneGA1GH.js","/assets/circle-check-big-BTBJucx3.js","/assets/circle-dot-B2zkW5Kp.js","/assets/circle-minus-lyX6a7bM.js","/assets/circle-slash-Dl-hixtv.js","/assets/circle-user-round-CCrFij9M.js","/assets/cloud-off-B9Fkj6CS.js","/assets/cloud-upload-Bn_nPN79.js","/assets/compass-Cfjtuivd.js","/assets/concernCategories-B_IdUa09.js","/assets/copy-BzvZPGRG.js","/assets/corner-down-right-DUrEW44U.js","/assets/createLucideIcon-DTga3FBI.js","/assets/es-C6g-EsIr.js","/assets/exportXlsx-DXRoAwbd.js","/assets/external-link-CjZ5vqj3.js","/assets/file-clock-diizK0_b.js","/assets/file-exclamation-point-CFSrl--F.js","/assets/file-spreadsheet-Czvo1rL0.js","/assets/file-text-C7ibgkxy.js","/assets/flag-RRDNoPcM.js","/assets/flame-DY90H8a7.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DjgWJR6o.js","/assets/hash-PEhyBXvo.js","/assets/history-AGPdHBfu.js","/assets/hourglass-Bqg1UorE.js","/assets/image-Dw9ukxW1.js","/assets/image-off-DhSPErVn.js","/assets/index-ClcfsWXQ.css","/assets/index-DtCwA3OW.js","/assets/key-round-D3qSk4X3.js","/assets/keyboard-C9cNViDa.js","/assets/languages-BPsWDu81.js","/assets/layers-0e_pGhyL.js","/assets/lightbulb-BZdtL3lv.js","/assets/link-2-j3Smlqb0.js","/assets/link-2-off-C3MI31Yn.js","/assets/list-checks-CsyDTwQ8.js","/assets/list-ordered-MFWo5gjU.js","/assets/list-tree-DwK2f6nu.js","/assets/lock-open-Bon68E5h.js","/assets/log-in-BVW82sjX.js","/assets/maximize-2-DcA4Ms0w.js","/assets/message-square-Cy7KmD-F.js","/assets/minimize-2-BnySb_98.js","/assets/package-check-DMFQUEto.js","/assets/paperclip-CkuKHDFL.js","/assets/pencil-CBLOgZjw.js","/assets/percent-Ck8APcur.js","/assets/personName-CogOuS3K.js","/assets/pin-DAR83XOH.js","/assets/pin-off-f3y0twzn.js","/assets/play-DdhSasYA.js","/assets/presentation-Bmidmu3r.js","/assets/prop-types-BukKTTGE.js","/assets/radio-C-NzyH8p.js","/assets/react-apexcharts.esm-BLbCOOH_.js","/assets/repeat-Cz9ah9yI.js","/assets/rotate-ccw-BSW89c6Y.js","/assets/rotate-cw-B0ioeisr.js","/assets/save-B2UUwYdN.js","/assets/scale-1-u9H_Wf.js","/assets/scroll-text-LYgAdRFk.js","/assets/search-x-CDn6rLpV.js","/assets/segments-Dbqllkik.js","/assets/send-BnoYDSKw.js","/assets/settings-2-CcLfbKaX.js","/assets/shield-CW5IbYmi.js","/assets/shield-alert-CjCl6mfY.js","/assets/shield-check-C6NVgvYs.js","/assets/shield-question-mark-Byvwa6Ew.js","/assets/siren-Dcp_cT0S.js","/assets/snowflake-D8lPUH3k.js","/assets/square-D7Z-L4yB.js","/assets/square-check-big-ksiatthA.js","/assets/star-BFhyQi_-.js","/assets/statusBands-D0nhxBmj.js","/assets/store-DwcdzKIb.js","/assets/table-2-B5unx29-.js","/assets/table-properties-B3QVFHP-.js","/assets/tag-Ck8n1Aa3.js","/assets/timer-off-CeShksUI.js","/assets/trending-down-BD45O5NF.js","/assets/trending-up-CCyBv7Pc.js","/assets/undo-2-o9kQI67f.js","/assets/useChartTheme-CDimWZFn.js","/assets/useElementWidth-CHCzhUnF.js","/assets/useIsMobile-BNUMjCEq.js","/assets/useMutation-BLrDcEZm.js","/assets/useStatusBands-CJPB6_V6.js","/assets/user-DaZ8gIEa.js","/assets/user-cog-Cc3iAlxc.js","/assets/user-minus-DqHR8FKf.js","/assets/users-26EhYMaG.js","/assets/video-DSvLE2D6.js","/assets/wallet-CKS0Pw5q.js","/assets/warehouse-DP-T0jNY.js","/assets/zap-DEXk-BS_.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
