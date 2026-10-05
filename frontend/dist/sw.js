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

const BUILD = "2026-10-05T12:45:41.357Z";
const PRECACHE = ["/","/assets/AdminPanel-SzUVN9BZ.js","/assets/AnalysisBoard-BzkAeIZc.js","/assets/Arc-D4Sit5u8.js","/assets/BrigadirProfile-ElVZ2gyX.js","/assets/BroadcastReceivers-DcZ24MfX.js","/assets/BroadcastRecord-Daw_Z29I.js","/assets/Button-BwPW9zHn.js","/assets/CatLockNotice-Bwjj1k0Z.js","/assets/CategoryLegendModal-DOEfmrKI.js","/assets/CellConcerns-Dk4_AkSL.js","/assets/CellDetails-Ba3NP9P2.js","/assets/CellFormModal-LMTY4YC7.js","/assets/CellIdent-CREk4W-M.js","/assets/CellLink-0JsXAC9e.js","/assets/Cells-DKOvBsZr.js","/assets/ColumnFilter-D4o0R__a.js","/assets/ColumnsPicker-pl0HM67J.js","/assets/CommentsModal-DkUUDwIl.js","/assets/ComparisonTable-Ce5j3hrF.js","/assets/Concerns-tyAOIUU5.js","/assets/Daily-Br5ddvkl.js","/assets/DataTable-CrO_o-tw.js","/assets/DateRangePicker-Cio7I1c5.js","/assets/DayReportView-JRBGtXC_.js","/assets/DayStepper-BiqR_HCO.js","/assets/DifferenceBreakdown-DpeqywOe.js","/assets/Downtime-Dy5NN7Ek.js","/assets/Education-DgaIGweP.js","/assets/EducationLesson-CwhWpza9.js","/assets/EmptyState-BRy9MRhH.js","/assets/Exam-UmDCBdXv.js","/assets/FactorySelect-C53qfPC7.js","/assets/Gamification-D9lYWOqc.js","/assets/GroupBadge-BmiA19-D.js","/assets/HeatmapChart-CZw5RQWY.js","/assets/IdleCell-wJu1ohej.js","/assets/KPICard-DgrhW-bi.js","/assets/Kaizen-DGNScIju.js","/assets/Kelish-DjYq09DN.js","/assets/KpiDeltaCard-74Ox6C5P.js","/assets/LangTextInput-4sdXOxl2.js","/assets/Layout-vWPLornU.js","/assets/LeaderAppeal-1sG8AQAf.js","/assets/LeaderDayReport-CEF9QDuP.js","/assets/LeaderUnitReport-CjYSZ4-6.js","/assets/Leaderboard-Be7WXv2c.js","/assets/Leaders-BDbUipoM.js","/assets/Lightbox-Dic9AWHU.js","/assets/LiveOverview-gybD1l-p.js","/assets/Login-DO3Hvj3v.js","/assets/NotFound-CLDBwhzb.js","/assets/Notifications-DCKnGAbI.js","/assets/Overview-C4_avfiK.js","/assets/Pagination-BqyKqNFV.js","/assets/PerenaladkaFactTable-BYqrHrSD.js","/assets/PersonCard-BTUQ5ymF.js","/assets/PlanFulfillment-MCqpF1Cc.js","/assets/Production-Cvtn1PyT.js","/assets/Profile-ChDMpPE3.js","/assets/ProofCamera-BoGV7NQP.js","/assets/ProofPhoto-DTs9LWMd.js","/assets/Quality-BkC9b8Z2.js","/assets/RawRows-C9-g0nmN.js","/assets/RequestStateChip-wJBB8Z6i.js","/assets/RichTextEditor-DnkH_sNQ.js","/assets/SaveState-DRAGXuDB.js","/assets/SearchInput-C1L4_oBA.js","/assets/SeasonalityHeatmap-hLqB7RFN.js","/assets/SegmentedToggle-CM_tjEAj.js","/assets/SetupTimes-KCFYlmv9.js","/assets/ShiftDaily-4uqhmqZo.js","/assets/Staff-aLVKfW3A.js","/assets/StaffLive-CvRfyP8t.js","/assets/StatusBadge-DnnV5lIF.js","/assets/TargetGoal-DMvy_ApF.js","/assets/Targets-CA5EE_LI.js","/assets/Tasks-C5GuLY9T.js","/assets/TimeWheelPicker-KQiHgpz3.js","/assets/Toast-DU7uLRmR.js","/assets/Tooltip-C3edWDHA.js","/assets/TrendChart-BZC6tUss.js","/assets/TripleSpeedometer-Bz8WCk9i.js","/assets/Trudoyomkost-DOWs2NfN.js","/assets/Turnover-BeBDgP8U.js","/assets/UploadDropzone-DauokxV6.js","/assets/UsersActivity-CwYcpG1l.js","/assets/VerdictBlock-CNoilQlg.js","/assets/VfxApiMap-CnI0_F1M.js","/assets/VfxDictionaries-BbhSS3-1.js","/assets/VfxEmployees-2Z0_Rfrz.js","/assets/VfxHrMoves-CmnSQB0F.js","/assets/VfxJobs-BZZmZfqt.js","/assets/VfxPhoto-6skQPyDU.js","/assets/VfxShifts-BOiaHwz0.js","/assets/VfxState-CgxgzoW1.js","/assets/VfxTimebooks-CUW7Crsn.js","/assets/VfxTimesheet-BvhepDEb.js","/assets/WatchProgress-CkBiv72n.js","/assets/WebLogin-C0ME0mug.js","/assets/WorkerConcerns-B5CRw1VD.js","/assets/Workers-DK5bFcOD.js","/assets/Zagruzka-CqQEt9yS.js","/assets/ZagruzkaCell-c2GF8ksT.js","/assets/api-DyXWxxyA.js","/assets/archive-C-R4EtHJ.js","/assets/archive-restore-CiDBrOME.js","/assets/arrow-down-oqY5j_iS.js","/assets/arrow-left-CqEFbegc.js","/assets/arrow-up-narrow-wide-B8uqZAA9.js","/assets/arrow-up-right-DSH9k6Sb.js","/assets/arrow-up-y5XFWHUq.js","/assets/award-DsDXzwlM.js","/assets/ban-DvOCvNdT.js","/assets/book-open-DoiaRnZN.js","/assets/boxes-Pc5J9vuv.js","/assets/braces-C_zV7WLE.js","/assets/brigadirFilters-BICCPzzw.js","/assets/broadcastTree-Ni1jgp_s.js","/assets/building-2-BJPKDrmk.js","/assets/calculator-B43FI8rZ.js","/assets/calendar-0gjdJgBr.js","/assets/calendar-days-BNRG6Uj1.js","/assets/camera-UBb8Qxja.js","/assets/categories-B_4EJ1fD.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DV80BZ0v.js","/assets/chart-line-ByC26x5y.js","/assets/chart-pie-B8zGoRhF.js","/assets/chartRange-CoI-FHhh.js","/assets/check-check-Dw-a3OMg.js","/assets/chevron-left-BQHFakc8.js","/assets/chevrons-up-down-DoPd6M9x.js","/assets/circle-BxbrZ0VX.js","/assets/circle-alert-CSlPEr7t.js","/assets/circle-check-big-B8IjTcSV.js","/assets/circle-dashed-Dw20fOfr.js","/assets/circle-minus-DqAKrdcu.js","/assets/circle-question-mark-D3j2I8i-.js","/assets/circle-slash-Dr7bvkQQ.js","/assets/circle-user-round-qBKQkrpx.js","/assets/clock-3-1TDeKJNh.js","/assets/cloud-off-CVyaxaOT.js","/assets/cloud-upload-BV0cTA2J.js","/assets/compass-Bw5AW6Rs.js","/assets/concernCategories-BEjUowKU.js","/assets/copy-gyayBqRu.js","/assets/corner-down-right-C3M842Ue.js","/assets/createLucideIcon-Ddby2Xef.js","/assets/es-BUfDLrXB.js","/assets/exportXlsx-CX4r4WC2.js","/assets/external-link-BFdZOcyy.js","/assets/file-clock-CgEUrkHz.js","/assets/file-exclamation-point-CXV_xFzb.js","/assets/file-spreadsheet-CMpA2pRu.js","/assets/file-text-kgQh89T6.js","/assets/flag-DohzYCho.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BqhENu98.js","/assets/hash-2l0lYtDA.js","/assets/history-C-GzJn7U.js","/assets/hourglass-BeUZtpAB.js","/assets/image-off--G4ayc35.js","/assets/image-u_tWmnj3.js","/assets/inbox-BAnHlj36.js","/assets/index-CCQoDNa6.css","/assets/index-wXcnj-g-.js","/assets/key-round-BrAv18ty.js","/assets/keyboard-DmUS4uBO.js","/assets/languages-BywaqrfO.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-uovQB7W0.js","/assets/lightbulb-Ca5g6A13.js","/assets/link-2-D2FwrKEp.js","/assets/link-2-off-BZiRMedt.js","/assets/list-ordered-CujNi4-_.js","/assets/list-tree-DsMDy6Nd.js","/assets/lock-open-B1Xtsn3P.js","/assets/log-in-Bz5E7IPn.js","/assets/maximize-2-su4-7la0.js","/assets/message-square-Q74xMYkF.js","/assets/minimize-2-B4VzzNlz.js","/assets/package-check-D9rURjcC.js","/assets/paperclip-BCTWD6M2.js","/assets/pencil-D93CvPIR.js","/assets/percent-DURF2NGH.js","/assets/pin-heAJoirD.js","/assets/pin-off-CultBGKD.js","/assets/play-BSOXvqao.js","/assets/plug-zap-Bfe8jUxh.js","/assets/presentation-BJqRyjWS.js","/assets/prop-types-DozG3Go2.js","/assets/radio-BdWBDZXo.js","/assets/react-apexcharts.esm-DcyK7d67.js","/assets/registers-H9MZouKo.js","/assets/repeat-BIrYwA09.js","/assets/rotate-ccw-CXx0y-DE.js","/assets/rotate-cw-B9ygxh_m.js","/assets/save-DjNUfN3C.js","/assets/scopeLinks-CVqzi3CM.js","/assets/scroll-text-BPlCPR5K.js","/assets/search-x-aNH8_J6j.js","/assets/segments-0m_uY_cd.js","/assets/send-CxdHKaLI.js","/assets/settings-2-Cw9W3LNe.js","/assets/shield-alert-Cj8r38ML.js","/assets/shield-check-_JoHykTz.js","/assets/shield-question-mark-CwDY6Hsn.js","/assets/shield-zn0J70wY.js","/assets/siren-BXkINKDj.js","/assets/snowflake-CJGXbf4v.js","/assets/split-COZ9d3QX.js","/assets/square-CRNslMnl.js","/assets/square-check-big-CDx0VeJV.js","/assets/star-D-276eKO.js","/assets/statusBands-B_MIdlQb.js","/assets/store-hVt8mVXp.js","/assets/table-2-CPraWNUI.js","/assets/table-properties-Cfhbgx8H.js","/assets/tag-DnbeO3E0.js","/assets/timer-off-tnStWp4S.js","/assets/trending-down-CqPYu0qx.js","/assets/trending-up-CFtTHtFH.js","/assets/undo-2-C7CcHveU.js","/assets/useChartTheme-BnP-9jU1.js","/assets/useElementWidth-DHh58dMY.js","/assets/useIsMobile-B1oBIDS5.js","/assets/useOpenParam-CLBP6RhV.js","/assets/useStatusBands-BP2JvUk_.js","/assets/useUrlScope-CJEI3LEG.js","/assets/user-CFx2_FUj.js","/assets/user-cog-C7rLB4m2.js","/assets/users-HiK6EboW.js","/assets/vfx-DoQ6FoO0.js","/assets/video-LsVpF0oO.js","/assets/wallet-BQqZYw7w.js","/assets/warehouse-CfzQI4ox.js","/assets/x-C3SHBsOi.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
