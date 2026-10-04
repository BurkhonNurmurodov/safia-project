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

const BUILD = "2026-10-04T19:10:01.239Z";
const PRECACHE = ["/","/assets/AdminPanel-kuVB07BM.js","/assets/AnalysisBoard-CFoftezp.js","/assets/Arc-BNbXfSor.js","/assets/ArcLegacy-C0pooQlK.js","/assets/BrigadirProfile-CSZUOEGI.js","/assets/BroadcastReceivers-CT95PdqV.js","/assets/BroadcastRecord-Dg5NWKpx.js","/assets/CatLockNotice-BghdsmAh.js","/assets/CategoryLegendModal-Dp-Eipo7.js","/assets/CellConcerns-D2sGdzFe.js","/assets/CellDetails-Cfxq_cYb.js","/assets/CellFormModal-C_obnC7Y.js","/assets/CellIdent-D8J390fT.js","/assets/CellLink-G8BIHQWT.js","/assets/Cells-kCHnS1K_.js","/assets/ColumnFilter-BrBb957I.js","/assets/ColumnsPicker-BRNEGcrq.js","/assets/CommentsModal-CMcSVysm.js","/assets/ComparisonTable-BTvvB4Rc.js","/assets/Concerns-Kwx9ZM52.js","/assets/ConfirmDialog-DMIOtZRW.js","/assets/Daily-DbyaGi0H.js","/assets/DataTable-Dj5j8bqE.js","/assets/DateRangePicker-CiIKKK3I.js","/assets/DayReportView-iEujIw23.js","/assets/DayStepper-D01Nh1Fq.js","/assets/DifferenceBreakdown-NNneBpTT.js","/assets/Downtime-B0-ZFB_1.js","/assets/Education-Bw3sWRP_.js","/assets/EducationLesson-D1XnZdSE.js","/assets/EmptyState-CYSwkHK9.js","/assets/Exam-tvPLotVO.js","/assets/FactorySelect-Bt60LcjO.js","/assets/Gamification-C5gA5U3H.js","/assets/GroupBadge-zk7Ubl8A.js","/assets/HeatmapChart-D6PYDckB.js","/assets/IdleCell-BNyUjCcC.js","/assets/KPICard-DB2YMQ86.js","/assets/Kaizen-D1daYOuX.js","/assets/Kelish-xtlcAcPd.js","/assets/KpiDeltaCard-ISKi1br_.js","/assets/LangTextInput-BgTs5F7g.js","/assets/Layout-BU0fHKqM.js","/assets/LeaderAppeal-BOi1hT-t.js","/assets/LeaderDayReport-BVPJ2NRA.js","/assets/LeaderUnitReport-CiZPBPY6.js","/assets/Leaderboard-C90g5Qu4.js","/assets/Leaders-CFAB2so9.js","/assets/Lightbox-CRJr9xsa.js","/assets/LiveOverview-KPdxyERX.js","/assets/Login-BLDvX3mc.js","/assets/NotFound-D9sVUPdU.js","/assets/Notifications-DLUWYf0u.js","/assets/Overview-DAjsk-Ju.js","/assets/Pagination-tX5qNqU4.js","/assets/PerenaladkaFactTable-CznH9XCV.js","/assets/PersonCard-2quxv2TS.js","/assets/PlanFulfillment-BbmhPDVR.js","/assets/Production-xozUmaft.js","/assets/Profile-CKjVid0q.js","/assets/ProofCamera-BG3B0oj-.js","/assets/ProofPhoto-DkXsJBVC.js","/assets/Quality-mkun3b6R.js","/assets/RawRows-Vm5aiqtO.js","/assets/RequestStateChip-CSJ5ad1h.js","/assets/RichTextEditor-CgYY5DBn.js","/assets/SaveState-CatROHvh.js","/assets/SearchInput-BGi5fr0K.js","/assets/SeasonalityHeatmap-DuHgK0za.js","/assets/SegmentedToggle-Ducxz6X0.js","/assets/SetupTimes-BbgSxq7k.js","/assets/ShiftDaily-Cf5-1R6I.js","/assets/Staff-BOgbDUcw.js","/assets/StaffLive-BNLhyHLT.js","/assets/StatusBadge-DOGqVVHV.js","/assets/TargetGoal-Cvj6CQdi.js","/assets/Targets-BAcocOXR.js","/assets/Tasks-Dw7okNf8.js","/assets/TimeWheelPicker-DEK2Rvjj.js","/assets/Toast-C24w3Lrt.js","/assets/Tooltip-DBCrJrFb.js","/assets/TrendChart-vCUqZW27.js","/assets/TripleSpeedometer-QzuaK_9c.js","/assets/Trudoyomkost-C3XKDigV.js","/assets/Turnover-CCDvNr9L.js","/assets/UploadDropzone-1yPVwJ_y.js","/assets/UsersActivity-BF9fiOmi.js","/assets/VerdictBlock-iCAQHO6z.js","/assets/VfxApiMap-CIsAwLe0.js","/assets/VfxDictionaries-rKBc8qR-.js","/assets/VfxEmployees-B8IMpxT_.js","/assets/VfxHrMoves-C5UIe5gU.js","/assets/VfxJobs-CdjGdp1i.js","/assets/VfxPhoto-DmS0r-Sn.js","/assets/VfxShifts-B8KYR-Rt.js","/assets/VfxState-Cg_-vfwX.js","/assets/VfxTimebooks-0WmAuMmw.js","/assets/VfxTimesheet-BRXfILSa.js","/assets/WatchProgress-CgLpZCZf.js","/assets/WebLogin-DGqbtl4n.js","/assets/WorkerConcerns-D5l6hnTh.js","/assets/Workers-BP2yS7SA.js","/assets/Zagruzka-BTF0heug.js","/assets/ZagruzkaCell-Dmkg_FVk.js","/assets/api-BRroGnTx.js","/assets/archive-DmYQ-XU6.js","/assets/archive-restore-BhI34vs8.js","/assets/arrow-down-DqjhW6Ys.js","/assets/arrow-left-BUuU1F0r.js","/assets/arrow-up-B2kdRHGS.js","/assets/arrow-up-narrow-wide-299vXDhi.js","/assets/arrow-up-right-BIHZz3rx.js","/assets/award-DVGvKnW7.js","/assets/ban-BE63es9L.js","/assets/book-open-n-AGxbML.js","/assets/bot-DbFUqjlz.js","/assets/boxes-BuU4j98K.js","/assets/braces-BPWc9t8b.js","/assets/brigadirFilters-vgGKr3Iw.js","/assets/broadcastTree-DkC8DAh8.js","/assets/building-2-CCt9bK5l.js","/assets/calculator-CK75BS20.js","/assets/calendar-CXceIyd_.js","/assets/calendar-days-BB-piE_Y.js","/assets/camera-DceQaAtt.js","/assets/categories-BX1ndCDl.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-I-0vVH2-.js","/assets/chart-line-BsUjDoTZ.js","/assets/chart-pie-CrwawzCW.js","/assets/chartRange-Dw9zSZyo.js","/assets/check-check-DKsMSR4L.js","/assets/chevron-left-B6teKcSg.js","/assets/chevrons-up-down-oWvjZwM9.js","/assets/circle-Dj5AJOA3.js","/assets/circle-alert-COMWEYJs.js","/assets/circle-check-big-CCQohoNX.js","/assets/circle-dashed-Ch5glhmd.js","/assets/circle-minus-Cbow5kiG.js","/assets/circle-question-mark-BfKLaYMF.js","/assets/circle-slash-B0OfNyCv.js","/assets/circle-user-round-DpXKA96I.js","/assets/clock-3-DbsD0Poh.js","/assets/cloud-off-iKiPbZPu.js","/assets/cloud-upload-BvAOz7Qn.js","/assets/compass-BwtAqSGw.js","/assets/concernCategories-DKydk_sh.js","/assets/copy-C8lKu_uL.js","/assets/corner-down-right-Bj9mWHxm.js","/assets/createLucideIcon-BdnUCXkh.js","/assets/es-BXCx35a7.js","/assets/exportXlsx-C8wrA1LG.js","/assets/external-link-CHG9UipX.js","/assets/file-clock-DVfCDZCi.js","/assets/file-exclamation-point-B2rGIODw.js","/assets/file-spreadsheet-DaV0zntX.js","/assets/file-text-QhqaiyBY.js","/assets/flag-A6Icrxqc.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-EtL5DmMl.js","/assets/hash-RbdpA7Bm.js","/assets/history-CJy-aDiK.js","/assets/hourglass-DgRuWHQK.js","/assets/image-B0DOSZKo.js","/assets/image-off-Bp75WYz-.js","/assets/inbox-k_nu1cyD.js","/assets/index-BLeGEgdE.css","/assets/index-DT7ISNyC.js","/assets/key-round-Tu0QWXFT.js","/assets/keyboard-CmyT55UW.js","/assets/languages-BUYE72A3.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DSbfc_fZ.js","/assets/lightbulb-E8ATPUxj.js","/assets/link-2-DkqCr1Ut.js","/assets/link-2-off-DQKOQiCp.js","/assets/list-ordered-BCQd5rpf.js","/assets/list-tree-B-U205il.js","/assets/lock-open-BXiMMNls.js","/assets/log-in-CpIL4fVA.js","/assets/maximize-2-BwmyEKMe.js","/assets/message-square-CO9qZHFR.js","/assets/minimize-2-kPHqoVQB.js","/assets/package-check-DSPvAw6N.js","/assets/paperclip-CPHR0Gyk.js","/assets/pencil-B-qH2PQa.js","/assets/percent-DDemJI1d.js","/assets/pin-Oe0cRC20.js","/assets/pin-off-DTUJXk8R.js","/assets/play-DnklIcM6.js","/assets/plug-zap-DihvuG2D.js","/assets/presentation-B24dCZQQ.js","/assets/prop-types-CDTsHlcD.js","/assets/radio-CNGMLTV4.js","/assets/react-apexcharts.esm-CRDmKfdo.js","/assets/registers-CRnHO5oi.js","/assets/repeat-Db9SCC9m.js","/assets/rotate-ccw-CqKnxzxH.js","/assets/rotate-cw-CU9g0RjG.js","/assets/save-CXhyjnfu.js","/assets/scopeLinks-DTcTB8qw.js","/assets/scroll-text-BEsknwDS.js","/assets/search-x-5PQ7lXK2.js","/assets/segments-D3H7BCRY.js","/assets/send-Dpkqq4b9.js","/assets/settings-2-Db6x3W02.js","/assets/shield-DHz_zPnd.js","/assets/shield-alert-_ef6428s.js","/assets/shield-check-CpHLx2d0.js","/assets/shield-question-mark-BqqBeA1V.js","/assets/siren-DoG5xy61.js","/assets/snowflake-BYGBZNlP.js","/assets/split-CJdqE9cM.js","/assets/square-BAlDFLtb.js","/assets/square-check-big-B31SJgfy.js","/assets/star-BBC-pz4I.js","/assets/statusBands-DO7fh2eO.js","/assets/store-BVFOGszp.js","/assets/table-2-C3c6Lwk5.js","/assets/table-properties-mS3bcYN8.js","/assets/tag-CR54_-gj.js","/assets/timer-off-BMn5c-s2.js","/assets/trending-down-CEDk9b0R.js","/assets/trending-up-CX86z2JW.js","/assets/undo-2-BuSSuBeG.js","/assets/useChartTheme-gFTIdCqp.js","/assets/useElementWidth-ynnQkgjO.js","/assets/useIsMobile-DUFjH3Ln.js","/assets/useOpenParam-D4wbHlqp.js","/assets/useStatusBands-DeALRsqf.js","/assets/useUrlScope-Dun0hOMU.js","/assets/user-cog-B17y6bal.js","/assets/user-nz9Eauty.js","/assets/users-DmIxbi5z.js","/assets/vfx-BOSHnchD.js","/assets/video-DWXqA630.js","/assets/wallet-Dk0ZHXTn.js","/assets/warehouse-DQiXZCjr.js","/assets/x-BlIU21ww.js","/assets/zap-CVLuWvAd.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
