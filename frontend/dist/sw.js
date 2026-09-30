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

const BUILD = "2026-09-30T06:45:51.034Z";
const PRECACHE = ["/","/assets/AdminPanel-DO94Vi0X.js","/assets/AnalysisBoard-CgasWeLX.js","/assets/Arc-BV7Pn_an.js","/assets/ArcLegacy-Dux87u8X.js","/assets/AttendanceModal-BVrXqHwL.js","/assets/BrigadirProfile-ClK6kYxa.js","/assets/BroadcastReceivers-CewFNrtC.js","/assets/BroadcastRecord-jIiOY64H.js","/assets/CatLockNotice-uce6VlSP.js","/assets/CategoryLegendModal-Cmz0m0ta.js","/assets/CellConcerns-B6L7YLhn.js","/assets/CellDetails-COfH0SWA.js","/assets/CellFormModal-C9PEbKJy.js","/assets/CellLink-Bw80P12a.js","/assets/Cells-DiZuTCUu.js","/assets/ColumnFilter-DT566v0L.js","/assets/ColumnsPicker-c1a9rXfJ.js","/assets/CommentsModal-BsRXUCNp.js","/assets/ComparisonTable-BlSYWYMx.js","/assets/Concerns-BqSr7JBW.js","/assets/ConfirmDialog-BvPYpTYJ.js","/assets/Daily-DIrO0Edx.js","/assets/DataTable-D4e6QTXI.js","/assets/DateRangePicker-OouOHw0Z.js","/assets/DayReportView-J3-8y0IZ.js","/assets/DayStepper-DkucXZ0h.js","/assets/DifferenceBreakdown-Bo1rGK8i.js","/assets/Downtime-Dfk-Ysaw.js","/assets/Education-D4V7xnPb.js","/assets/EducationLesson-DQNdJwdJ.js","/assets/EmptyState-BqvdltAi.js","/assets/Exam-CmGlicor.js","/assets/FactorySelect-BN7arNpf.js","/assets/Gamification-pe-VETWn.js","/assets/GroupBadge-Dj00_aCg.js","/assets/HeatmapChart-D6QPU_uL.js","/assets/IdleCell-B-BHapZS.js","/assets/KPICard-DT0J9vO1.js","/assets/Kaizen-61WHKFzp.js","/assets/Kelish-Rmydlg1Q.js","/assets/KpiDeltaCard-CPXWuL8d.js","/assets/LangTextInput-C4HSxbZU.js","/assets/Layout-CKHHsTVf.js","/assets/LeaderAppeal-B-nfo-ow.js","/assets/LeaderDayReport-CRah15jO.js","/assets/LeaderUnitReport-wy3TeZ-z.js","/assets/Leaderboard-CpTeBYaf.js","/assets/Leaders-Cq3ABXUm.js","/assets/Lightbox-Cipswqn-.js","/assets/LiveOverview-kvS6YZy7.js","/assets/Login-I5XDHtM8.js","/assets/NotFound-CeWjXHF4.js","/assets/Overview-EdeM23DF.js","/assets/Pagination-GnVWMUDy.js","/assets/PerenaladkaFactTable-Qky7k23U.js","/assets/PlanFulfillment-DhNfbwwf.js","/assets/Production-CrutuDmF.js","/assets/Profile-EH8PRjnQ.js","/assets/ProofCamera-Bwzkg9Ao.js","/assets/ProofPhoto-DtanKOWd.js","/assets/Quality-BoKEvtQS.js","/assets/RequestStateChip-BT_JNo7E.js","/assets/RichTextEditor-B25Kh_ft.js","/assets/SaveState-DzeLN6QD.js","/assets/SearchInput-DBOQzm13.js","/assets/SeasonalityHeatmap-Bo3fLQ3b.js","/assets/SegmentedToggle-hvG77XbJ.js","/assets/SetupTimes-Y1DE16cY.js","/assets/ShiftDaily-DmfsgsXG.js","/assets/Staff-DwuSKzwl.js","/assets/StatusBadge-Co6rVSga.js","/assets/TargetGoal-CaHiSF9M.js","/assets/Targets-DwnaY73T.js","/assets/Tasks-DM22E5-2.js","/assets/TimeWheelPicker-B0T5FhCm.js","/assets/Tooltip-v76ZADL_.js","/assets/TrendChart-LbB3LFFp.js","/assets/TripleSpeedometer-BDRhK9tF.js","/assets/Trudoyomkost-rr2Cirgd.js","/assets/UploadDropzone-DPPfPeaa.js","/assets/UsersActivity-BE0cBP1O.js","/assets/VerdictBlock-SCcW1Bsr.js","/assets/WatchProgress-DxZ5C2ob.js","/assets/WebLogin-CJ8NPMfm.js","/assets/WorkerConcerns-CDgOt03A.js","/assets/Workers-vvz6bhwJ.js","/assets/Zagruzka-DmSA7VuZ.js","/assets/ZagruzkaCell-CdFU-VGB.js","/assets/api-DtYOB1-j.js","/assets/archive-restore-CoBF4mb7.js","/assets/archive-wABIDEWB.js","/assets/arrow-down-Cn_sv160.js","/assets/arrow-left-3GIm_6ir.js","/assets/arrow-left-right-9EPLL48K.js","/assets/arrow-up-C3li2Fzs.js","/assets/arrow-up-narrow-wide-D5o8Tc9f.js","/assets/arrow-up-right-DAfljPjO.js","/assets/award-Dcu6_p-7.js","/assets/ban-V1MXxLfZ.js","/assets/bot-BFngIzx1.js","/assets/boxes-uqfHUxRD.js","/assets/brigadirFilters-C0nWHuk1.js","/assets/broadcastTree-TDWNiTMM.js","/assets/building-2-BoSfSilf.js","/assets/calendar-clock-DfIMk0hQ.js","/assets/calendar-days-BdQrxIwD.js","/assets/calendar-izAJkyL_.js","/assets/calendar-range-C3BW7XCT.js","/assets/camera-BrKlyZZO.js","/assets/categories-D_YWJOf7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-v8qcTyRz.js","/assets/chart-line-CX-575Tr.js","/assets/chart-pie-BOx8mSLz.js","/assets/chartRange-DdFQAWXw.js","/assets/chevron-left-ChKEQED7.js","/assets/chevrons-up-down-G2acIQSs.js","/assets/circle-D8j9mFd6.js","/assets/circle-check-big-B22XMYBH.js","/assets/circle-dot-3UQNNO6W.js","/assets/circle-minus-BwB9ZH5G.js","/assets/circle-slash-DO-sAq0I.js","/assets/circle-user-round-DzxiuB2_.js","/assets/cloud-off-Y5oOAJJ8.js","/assets/cloud-upload-VUaSANyb.js","/assets/compass-vztOwXq4.js","/assets/concernCategories-B6I_S2iH.js","/assets/copy-tyHWOXZO.js","/assets/corner-down-right-oWt7zQZx.js","/assets/createLucideIcon-BFIE43by.js","/assets/es-hxASSxoT.js","/assets/exportXlsx-B-RJ51vt.js","/assets/external-link-DZLoBA1C.js","/assets/file-clock-CzNl7qXi.js","/assets/file-exclamation-point-DHzJRCJ3.js","/assets/file-spreadsheet-BqOCA1uh.js","/assets/file-text-q7Ju_5S7.js","/assets/flag-ZF7QDksy.js","/assets/flame-BoHWTSpm.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DsQLkfpF.js","/assets/hash-BB_Ntu5F.js","/assets/history-D8kJXDcs.js","/assets/hourglass-CVv1YJUR.js","/assets/image-C_S0lLeZ.js","/assets/image-off-M4HXje3a.js","/assets/index-D9goa3w9.css","/assets/index-DpvpkzOt.js","/assets/key-round-D4y1gYs0.js","/assets/keyboard-B8qvq_u2.js","/assets/languages-CO8jUCaq.js","/assets/layers-Dkf03a7W.js","/assets/lightbulb-DJa2QNsK.js","/assets/link-2-DMukE9gJ.js","/assets/link-2-off-C8SF_H4K.js","/assets/list-checks-D_zO_dIt.js","/assets/list-ordered-DlCDcB3C.js","/assets/list-tree-CoVv05UO.js","/assets/lock-open-Bb2U0zUV.js","/assets/log-in-2sszJif2.js","/assets/maximize-2-D7WSRsdB.js","/assets/message-square-CElZQtfV.js","/assets/minimize-2-C7PtIMmg.js","/assets/package-check-DPzI7m18.js","/assets/paperclip-Cb1SKuLq.js","/assets/pencil-CCUp1lMQ.js","/assets/percent-Dt3wTu8C.js","/assets/personName-CogOuS3K.js","/assets/pin-Ca_WnPQJ.js","/assets/pin-off-DdzMjgkV.js","/assets/play-V0biPF45.js","/assets/presentation-BMpAmA2o.js","/assets/prop-types-Ckp3xokS.js","/assets/radio-BU13Fm5M.js","/assets/react-apexcharts.esm-DwS29a51.js","/assets/repeat-B16i8OkK.js","/assets/rotate-ccw-B1Z-djHe.js","/assets/rotate-cw-DUDQM6g-.js","/assets/save-JrmqaPDB.js","/assets/scale-xZQ49cUN.js","/assets/scopeLinks-Cxukm1fo.js","/assets/scroll-text-BERok2MQ.js","/assets/search-x-79AzTm3p.js","/assets/segments-65uFhN0W.js","/assets/send-BKwIBMmM.js","/assets/settings-2-C-CGBGBf.js","/assets/shield-DwgguFhd.js","/assets/shield-alert-DZgZ3cLL.js","/assets/shield-check-BPNQpfog.js","/assets/shield-question-mark-DJURzKcf.js","/assets/siren-CvTole0H.js","/assets/snowflake-b9SVjPlG.js","/assets/square-CM3cbqjL.js","/assets/square-check-big-DSC43joq.js","/assets/star-myemav_h.js","/assets/statusBands-Lwm4tCIx.js","/assets/store-CPY9LOFc.js","/assets/table-2-sY0Dcxzb.js","/assets/table-properties-C-7EJ1H_.js","/assets/tag-Cs8bDatj.js","/assets/timer-off-DxPrnCL8.js","/assets/trending-down-PcdPB1lu.js","/assets/trending-up-CUiG9doY.js","/assets/undo-2-CeRLfq5l.js","/assets/useChartTheme-D-60grWE.js","/assets/useElementWidth-B3dscrit.js","/assets/useIsMobile-DFS4CikG.js","/assets/useMutation-D-Te3iD8.js","/assets/useStatusBands-CWlmLunN.js","/assets/useUrlScope-C8YLLq4g.js","/assets/user-CdTJHKZH.js","/assets/user-cog-CeGpZPfC.js","/assets/user-minus-BR0rBAm7.js","/assets/users-B7DLglrU.js","/assets/video-D0RQ7kvp.js","/assets/wallet-CD2GxcS2.js","/assets/warehouse-CZ5D3Emh.js","/assets/zap-DzmkEtI9.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
