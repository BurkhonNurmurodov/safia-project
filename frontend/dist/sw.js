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

const BUILD = "2026-10-03T14:03:50.586Z";
const PRECACHE = ["/","/assets/AdminPanel-0DjzB9sz.js","/assets/AnalysisBoard-Dq-QpSlb.js","/assets/Arc-ms8_Wnea.js","/assets/ArcLegacy-Cn00UKVE.js","/assets/BrigadirProfile-Bph_oJ7G.js","/assets/BroadcastReceivers-RswiOnPi.js","/assets/BroadcastRecord-BM2-1g8c.js","/assets/CatLockNotice-WNiH69CN.js","/assets/CategoryLegendModal-C7GFcuWq.js","/assets/CellConcerns-CzKddxfQ.js","/assets/CellDetails-D0EEqxhL.js","/assets/CellFormModal-F2I2uLOL.js","/assets/CellIdent-BJEwGGmv.js","/assets/CellLink-CM6n3kMZ.js","/assets/Cells-DHdderS7.js","/assets/ColumnFilter-C7R31MID.js","/assets/ColumnsPicker-BroAmAar.js","/assets/CommentsModal-B9LZOvTP.js","/assets/ComparisonTable-DUAsShMG.js","/assets/Concerns-DjtUMpS1.js","/assets/ConfirmDialog-D2zVeAIA.js","/assets/Daily-CMkxYdvd.js","/assets/DataTable-HDUYT4Vl.js","/assets/DateRangePicker-DGNrMkfA.js","/assets/DayReportView-D-w3mCxq.js","/assets/DayStepper-D3NDeLKS.js","/assets/DifferenceBreakdown-CD0n9F-z.js","/assets/Downtime-DkaY3ZAF.js","/assets/Education-DWMDQvlE.js","/assets/EducationLesson-cbBGIL7b.js","/assets/EmptyState-glL0tKrS.js","/assets/Exam-CBEiE0Tu.js","/assets/FactorySelect-DlBdDuCx.js","/assets/Gamification-BeaAsCp8.js","/assets/GroupBadge-vSpuivO_.js","/assets/HeatmapChart-_4qON9ip.js","/assets/IdleCell-CPORw51i.js","/assets/KPICard-QJbSTnT_.js","/assets/Kaizen-D1jmiwJ5.js","/assets/Kelish-x5W87IjJ.js","/assets/KpiDeltaCard-03KfmT2f.js","/assets/LangTextInput-D0pLx1aA.js","/assets/Layout-BFjLNa6_.js","/assets/LeaderAppeal-BWZtCnY5.js","/assets/LeaderDayReport-DZcJ4qEp.js","/assets/LeaderUnitReport-DStwe6TP.js","/assets/Leaderboard-DHNRL6ve.js","/assets/Leaders-BQFnr4NM.js","/assets/Lightbox-DapyUfXO.js","/assets/LiveOverview-depg3ejr.js","/assets/Login-BoQiSTn7.js","/assets/NotFound-B9ecCTsa.js","/assets/Notifications-D93bOWYc.js","/assets/Overview-Cne0NpXB.js","/assets/Pagination-9JUog8fw.js","/assets/PerenaladkaFactTable-CcLeqGx_.js","/assets/PersonCard-BylnOERM.js","/assets/PlanFulfillment-BtZuCLiF.js","/assets/Production-4u9DwS2K.js","/assets/Profile-DDl01_Lo.js","/assets/ProofCamera-DjLZM6kn.js","/assets/ProofPhoto-Cuy_XTpx.js","/assets/Quality-ti1CiP4p.js","/assets/RawRows-CEllao0a.js","/assets/RequestStateChip-Be606kbx.js","/assets/RichTextEditor-DGdJcncx.js","/assets/SaveState-BJAC7g3M.js","/assets/SearchInput-BoHyBjwU.js","/assets/SeasonalityHeatmap-B8Q8UCKI.js","/assets/SegmentedToggle-D2bSkefV.js","/assets/SetupTimes-BKbHHfLM.js","/assets/ShiftDaily-BvoFwr7S.js","/assets/Staff-BoRHucOW.js","/assets/StaffLive-BDCZi1zA.js","/assets/StatusBadge-BBp_QCEK.js","/assets/TargetGoal-BqnHmT7H.js","/assets/Targets-Dkqc5KKi.js","/assets/Tasks-n-k-SNA7.js","/assets/TimeWheelPicker-MKQOXTtw.js","/assets/Toast-Ztnsvb-c.js","/assets/Tooltip-BRcc_e9I.js","/assets/TrendChart-ClW5eD1T.js","/assets/TripleSpeedometer-B9kngtCW.js","/assets/Trudoyomkost-D2UQ7DTT.js","/assets/UploadDropzone-_3sh_7B_.js","/assets/UsersActivity-C5RI6QT3.js","/assets/VerdictBlock-kBF0Crp_.js","/assets/VfxAbsences-CEYCz6EO.js","/assets/VfxApiMap-1ZvO29sz.js","/assets/VfxDevices-BZY1XkkN.js","/assets/VfxDictionaries-C0_o22es.js","/assets/VfxEmployees-Wq2oo72n.js","/assets/VfxHrMoves-Df6qdkZG.js","/assets/VfxIncidents-cu7Z6gfz.js","/assets/VfxJobs-kqe-3AHD.js","/assets/VfxMarks-DhEj99ZM.js","/assets/VfxOnSite-5yDGu_zI.js","/assets/VfxPayroll-DICswM9C.js","/assets/VfxPhoto-CRql6iGp.js","/assets/VfxRequests-17u5uora.js","/assets/VfxShifts-BLayADhI.js","/assets/VfxState-7cvPTxot.js","/assets/VfxStructure-COtdVgrm.js","/assets/VfxTable-BmN2ZGXA.js","/assets/VfxTimebooks-DcpilYc6.js","/assets/VfxTimesheet-qW8-C0BI.js","/assets/WatchProgress-DO0xwsVz.js","/assets/WebLogin-BYk3neEy.js","/assets/WorkerConcerns-RA4L6KNX.js","/assets/Workers-De-FPyHX.js","/assets/Zagruzka-BJn26F8A.js","/assets/ZagruzkaCell-Bt89FeEM.js","/assets/api-DEuRGWzS.js","/assets/archive-CDVTcNxL.js","/assets/archive-restore-Bx9ZFCPn.js","/assets/arrow-down-Cuai_0g0.js","/assets/arrow-down-right-DX8ZeiGS.js","/assets/arrow-left-DOKBNwXI.js","/assets/arrow-up-3_FWRCW0.js","/assets/arrow-up-narrow-wide-CVnWBdUz.js","/assets/arrow-up-right-Ck5RckHX.js","/assets/award-B2_bExEG.js","/assets/ban-Bk9Vzp4_.js","/assets/bot-DVKgIxFg.js","/assets/boxes-BOwZNw4i.js","/assets/braces-Cuiaov4Z.js","/assets/brigadirFilters-DQoVkHrW.js","/assets/broadcastTree-BUQQ4c4P.js","/assets/building-2-x09MHKC3.js","/assets/calendar-D4mnqJTP.js","/assets/calendar-days-DBjNGD4k.js","/assets/camera-C84tdxlP.js","/assets/categories-BSZ6jFbU.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BJG3XCPv.js","/assets/chart-line-4tqc8cNZ.js","/assets/chart-pie-CLkx1Rpc.js","/assets/chartRange-ZEbAhmbj.js","/assets/chevron-left-D8qkXA9p.js","/assets/chevrons-up-down-BXyk-r3N.js","/assets/circle-6yVXGlVB.js","/assets/circle-alert-C4MpkObf.js","/assets/circle-check-big-BoZZpovi.js","/assets/circle-dashed-CqTx14Si.js","/assets/circle-minus-CGdOqyI1.js","/assets/circle-question-mark-B3CtiZXh.js","/assets/circle-slash-CE2aDFWj.js","/assets/circle-user-round-ChdLJfs_.js","/assets/clock-3-HFJS0WXm.js","/assets/cloud-off-Dupih-Xd.js","/assets/cloud-upload-DuvPilvC.js","/assets/compass-Bsunnc0N.js","/assets/concernCategories-Cyqz7vVZ.js","/assets/copy-QTqAKHi_.js","/assets/corner-down-right-Frkddxgg.js","/assets/createLucideIcon-BiwC3kNt.js","/assets/door-open-CWIQCzDI.js","/assets/es-DIjRMzfM.js","/assets/exportXlsx-CkR3DlfN.js","/assets/external-link-DSVgJHTq.js","/assets/file-clock-Ca6GR-gl.js","/assets/file-exclamation-point-O4IuVfY0.js","/assets/file-spreadsheet-CVAt6gzF.js","/assets/file-text-DwgaBfEL.js","/assets/flag-FBJUl6kx.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-n1aGFgti.js","/assets/hash-CDWXIDkh.js","/assets/history-DgPXpnrr.js","/assets/hourglass-Dfp1Bn6w.js","/assets/image-DvKtPVe3.js","/assets/image-off-CYJx4FzK.js","/assets/index-AIEPP-Tc.js","/assets/index-YBeOcWwc.css","/assets/key-round-Bz-F8pvK.js","/assets/keyboard-BAmv8J7k.js","/assets/languages-mzBXRGnc.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DwYBKID4.js","/assets/lightbulb-BKRBFnMd.js","/assets/link-2-_wXsexfE.js","/assets/link-2-off-B9TV2_1T.js","/assets/list-ordered-C14uBtJp.js","/assets/list-tree-Bd1hZAHA.js","/assets/lock-open-BamKnbI9.js","/assets/log-in-C-F98t-o.js","/assets/maximize-2-SrSeC93S.js","/assets/message-square-BLt_hm8N.js","/assets/minimize-2-8YzLqoHI.js","/assets/package-check-CSi7bpXX.js","/assets/paperclip-DT8SvYXd.js","/assets/pencil-BdKLN5J5.js","/assets/percent-CAgZmLOh.js","/assets/phone-Iilg8VqE.js","/assets/pin-B6SIhvj9.js","/assets/pin-off-SF48h0Jh.js","/assets/play-CsdyJdec.js","/assets/plug-zap-DdltYf47.js","/assets/presentation-B7vTphAv.js","/assets/prop-types-DlQMOx7e.js","/assets/radio-C1qWTZpz.js","/assets/react-apexcharts.esm-KJ1xHH_D.js","/assets/registers-d8t9ivyv.js","/assets/repeat-aEBF5Mnh.js","/assets/rotate-ccw-9NUBMNdd.js","/assets/rotate-cw-DSWY7a5H.js","/assets/save-0sJiqrKE.js","/assets/scopeLinks-oSeXwXxb.js","/assets/scroll-text-BJb5iwtu.js","/assets/search-x-Do8tCFaC.js","/assets/segments-Dr1MmNnx.js","/assets/send-BtVpUXVr.js","/assets/settings-2-BXD3Rdx6.js","/assets/shield-CcSftEHz.js","/assets/shield-alert-UXJW4HtC.js","/assets/shield-check-CpCwy7Np.js","/assets/shield-question-mark-DiKPk41c.js","/assets/snowflake-CirJKJ82.js","/assets/split-CdjqPnTJ.js","/assets/square--jrBKbr5.js","/assets/square-check-big-Ch7fCwkn.js","/assets/star-DsO_1YKB.js","/assets/statusBands-C0R3z1Rw.js","/assets/store-C0o1fPAs.js","/assets/table-2-CrStf-_p.js","/assets/table-properties-Bm52PSzs.js","/assets/tag-BE-hU7Em.js","/assets/tags-gd5sLzuD.js","/assets/timer-off-BqPejb97.js","/assets/trending-down-DhnI6IzS.js","/assets/trending-up-BJ9UHQGt.js","/assets/undo-2-Fb17ghQR.js","/assets/useChartTheme-DO9eJeD0.js","/assets/useElementWidth-BTc1CKak.js","/assets/useIsMobile-D-yoQLW1.js","/assets/useOpenParam-Dhnucp9I.js","/assets/useStatusBands-ry8T3DDA.js","/assets/useUrlScope-5MuLk4Wz.js","/assets/user-cog-CSn7WsBO.js","/assets/user-gpNKP67E.js","/assets/user-minus-BPnBgITm.js","/assets/users-ClXTIskU.js","/assets/video-DM7XwL8e.js","/assets/wallet-DLSgLdFp.js","/assets/warehouse-BOqIV40g.js","/assets/x-CB5YJLGW.js","/assets/zap-DAej74XP.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
