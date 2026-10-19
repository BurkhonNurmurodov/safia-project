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

const BUILD = "2026-10-19T05:56:06.587Z";
const PRECACHE = ["/","/assets/AdminPanel-Dm3i1dAN.js","/assets/AnalysisBoard-CShHym7V.js","/assets/Arc-a8qv4oDD.js","/assets/Assistant-Bg38VXYJ.js","/assets/BrigadirProfile-DUQeLD9-.js","/assets/BroadcastReceivers-DrROxPYi.js","/assets/BroadcastRecord-8gxnFzsh.js","/assets/Button-DVW16GmY.js","/assets/CatLockNotice-Bv9qqhOk.js","/assets/CategoryLegendModal-CSz7_nWP.js","/assets/CellConcerns-8ya-KiWe.js","/assets/CellDetails-ieIWb-Vr.js","/assets/CellFormModal-WIGeCWRL.js","/assets/CellIdent-Bn8zplh9.js","/assets/CellLink-CpX4N4JM.js","/assets/Cells-CjzIQT8D.js","/assets/ColumnFilter-BfImAD_9.js","/assets/ColumnsPicker-CguYJ8hm.js","/assets/CommentsModal-BxDesxf4.js","/assets/ComparisonTable-DQC3-GSJ.js","/assets/Concerns-GyrZ5gSC.js","/assets/CountStepper-hZSV_RSh.js","/assets/Daily-DFHQcT-O.js","/assets/DataTable-Dlc9fpG-.js","/assets/DateRangePicker-CqNqB8wb.js","/assets/DayReportView-6Ox3yygc.js","/assets/DayStepper-BDHB5PJX.js","/assets/DifferenceBreakdown-CeHTZd4A.js","/assets/Downtime-BBeayOLu.js","/assets/Education-CmtdkeXw.js","/assets/EducationLesson-HITQCcu1.js","/assets/EmptyState-CRIPJHJf.js","/assets/Exam-DQ5XdovT.js","/assets/FactorySelect--vB0XT1O.js","/assets/ForeignObjects-C3EUq8kV.js","/assets/Gamification-CDACuq-T.js","/assets/GroupBadge-Dp7UNLgG.js","/assets/HeatmapChart-C2bovqHr.js","/assets/IdleCell-BPTLeO3p.js","/assets/KPICard-xdDvkW49.js","/assets/Kaizen-D16G_7IB.js","/assets/Kelish-C7wha714.js","/assets/KpiDeltaCard-C7F8ibzG.js","/assets/LangTextInput-BeMrsVzR.js","/assets/Layout-vTW4p8_P.js","/assets/LeaderAppeal-FQUB3CUH.js","/assets/LeaderDayReport-B8f25iuJ.js","/assets/LeaderUnitReport-B0z4Z0hK.js","/assets/Leaderboard-BL1KyIBG.js","/assets/Leaders-B_fetBnu.js","/assets/Lightbox-BTf7nWOH.js","/assets/LiveOverview-lkLLV6Zw.js","/assets/Login-BEnEIpCC.js","/assets/NotFound-D2XTgR65.js","/assets/Notifications-CTahbWYj.js","/assets/Overview-BQ3bb5RR.js","/assets/Pagination-MDpnUSML.js","/assets/PerenaladkaFactTable-DMN6_QiW.js","/assets/PersonCard-DTsVd1Mj.js","/assets/PlanFulfillment-ByEn0abI.js","/assets/Production-3mHgX5jy.js","/assets/Profile-YR_VaSIw.js","/assets/ProofCamera-CfhkZ0yS.js","/assets/ProofPhoto-D5PqqdPq.js","/assets/Quality-Cf9kMeMM.js","/assets/RawRows-D9m3Neu3.js","/assets/RequestStateChip-DluUdFg9.js","/assets/RichTextEditor-BQ9X9E7y.js","/assets/SaveState-CgJnlZEH.js","/assets/SearchInput-eRhXd8Ys.js","/assets/SeasonalityHeatmap-DC1FJwcx.js","/assets/SegmentedToggle-BfuPY_4C.js","/assets/SetupTimes-cJv3wL7K.js","/assets/ShiftDaily-CgwjcPNS.js","/assets/Staff-76oRIjO4.js","/assets/StaffListAtCheck-DEVfUIZ8.js","/assets/StatusBadge-CRFhb82C.js","/assets/TargetGoal-uS-o7iqV.js","/assets/Targets-DR-CRhXZ.js","/assets/Tasks-M4u5j7I0.js","/assets/TimeWheelPicker-Ca9vjW6p.js","/assets/Toast-dmzIs2yw.js","/assets/Tooltip-BjdBxmiG.js","/assets/TrendChart-CZ-yETeE.js","/assets/TripleSpeedometer-BaR_CF1u.js","/assets/Trudoyomkost-0s-QZnKL.js","/assets/Turnover-DSP45vPJ.js","/assets/TurnoverBits-ST-5K42k.js","/assets/UploadDropzone-Ds0hQ1W-.js","/assets/UsersActivity-mG3pUOaD.js","/assets/VerdictBlock-BZzik7it.js","/assets/VfxApiMap-BT5jfA2a.js","/assets/VfxDictionaries-_Jrf0kc9.js","/assets/VfxEmployees-Bmx3EeS9.js","/assets/VfxHrMoves-BwL-aVAS.js","/assets/VfxJobs-Cxr81-qd.js","/assets/VfxPhoto-BRRBX_e6.js","/assets/VfxShifts-d9eRZI-2.js","/assets/VfxState-CFVFrpgx.js","/assets/VfxTimebooks-EibgjimU.js","/assets/VfxTimesheet-B14hPa3e.js","/assets/WatchProgress-D93__T7V.js","/assets/WebLogin-3LQm-jUX.js","/assets/WorkerConcerns-CtxsXKKD.js","/assets/Workers-By--704M.js","/assets/Zagruzka-Bjdg4S31.js","/assets/ZagruzkaCell-D5zKi0kB.js","/assets/api-DeP2LnhW.js","/assets/archive-DXVGdZYx.js","/assets/archive-restore-DlJsi7gt.js","/assets/arrow-down-BGCxE6jv.js","/assets/arrow-down-wide-narrow-CzJh0w01.js","/assets/arrow-up-narrow-wide-Ct64lAag.js","/assets/award-HEL0NMvt.js","/assets/ban-BSKnZrRA.js","/assets/boxes-O3JFM5Ay.js","/assets/braces-zru4bd6E.js","/assets/brigadirFilters-Bq1X3-Vv.js","/assets/broadcastTree-BJizP9zd.js","/assets/building-2-CSaXQ7sM.js","/assets/calculator-CLsLdKUw.js","/assets/calendar-Bf4Iq9Vv.js","/assets/calendar-days-CNs8ycRX.js","/assets/camera-CWacctvg.js","/assets/categories-DHxca4An.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ZrXDEB6D.js","/assets/chart-line-DgGxv6vD.js","/assets/chart-pie-BT7B_fLE.js","/assets/chartRange-CV_gaye4.js","/assets/check-check-CWwtzwkR.js","/assets/chevron-left-BIG-9mD_.js","/assets/chevrons-up-down-G2eWHHDZ.js","/assets/circle-C0g3K7v5.js","/assets/circle-alert-W7pE03zb.js","/assets/circle-check-big-DthIA_XA.js","/assets/circle-dashed-D_5drNuI.js","/assets/circle-minus-B9doIJOh.js","/assets/circle-question-mark-Cd-fjt19.js","/assets/circle-slash-F9o58toR.js","/assets/circle-user-round-Ck3lATCR.js","/assets/cloud-off-BiIonG89.js","/assets/cloud-upload-CuOv2WAH.js","/assets/compass-Bdjhi560.js","/assets/concernCategories-BsgmETeC.js","/assets/corner-down-right-BPbPZXFX.js","/assets/createLucideIcon-2Cqtgvjq.js","/assets/es-CibDYhiW.js","/assets/external-link-BLNndMSf.js","/assets/file-clock-DPAPGAbD.js","/assets/file-exclamation-point-D4AoMspc.js","/assets/flag-CflPDDzT.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CQWipWJp.js","/assets/hash-DD6VDt-Q.js","/assets/hourglass-DhP5YQ9v.js","/assets/image-DsltJam6.js","/assets/image-off-1RzUGuKR.js","/assets/inbox-CQFRVVKe.js","/assets/index-ByhNoNK_.css","/assets/index-CEv8oAtL.js","/assets/keyboard-BUhA0itr.js","/assets/languages-Dkn9JpTs.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-JnfKTRdH.js","/assets/lightbulb-acroeelV.js","/assets/link-2-BM10yFOY.js","/assets/link-2-off-DNfAj4yh.js","/assets/list-ordered-COH22YF5.js","/assets/list-tree-TgrX56Gz.js","/assets/lock-open-CGFIoyAG.js","/assets/log-in-DXMdH6_i.js","/assets/marks-x-eXyh2W.js","/assets/minimize-2--FXdjOa9.js","/assets/package-check-Br9cP0NT.js","/assets/pencil-BIV7b7ml.js","/assets/percent-Bdm17-SE.js","/assets/pin-BQyHM-NS.js","/assets/pin-off-fetHtao0.js","/assets/play-BUnpSQ-f.js","/assets/plug-zap-6fNRq7zs.js","/assets/prop-types-7jccvyi1.js","/assets/radio-DzvFHA7V.js","/assets/react-apexcharts.esm-BGpSWRgA.js","/assets/registers-BJmJropP.js","/assets/repeat-Bi2sOD1D.js","/assets/save-CnX6luzF.js","/assets/scopeLinks-Dfs3WQbm.js","/assets/scroll-text-BAswHiDS.js","/assets/search-x-Bj1oRzHa.js","/assets/segments-jIaA2G1w.js","/assets/send-Dil7MrBs.js","/assets/settings-2-BisGQmGE.js","/assets/shield-Az7cK6-F.js","/assets/shield-alert-0MZiRPuf.js","/assets/shield-question-mark-DsM8c2WI.js","/assets/siren-CZfPFuNH.js","/assets/snowflake-DFcFDuD2.js","/assets/split-B3Qcgcoh.js","/assets/square-check-big-DUGFPgCo.js","/assets/star-CygSXjXY.js","/assets/statusBands-D-Ap3UlA.js","/assets/store-B0aIV6cx.js","/assets/table-2-HQbEqwu1.js","/assets/table-properties-DXR6ge4x.js","/assets/tag-0T79iiuH.js","/assets/timer-off-shJS3Iol.js","/assets/trending-down-BD9V8Hvd.js","/assets/trending-up-Bc0-nhJN.js","/assets/undo-2-LMaEapp5.js","/assets/useChartTheme-LaDcK6Qz.js","/assets/useElementWidth-qblgh9A0.js","/assets/useIsMobile-DWqA_0EK.js","/assets/useOpenParam-CZF5ITUV.js","/assets/useStatusBands-CJSQdeXr.js","/assets/useUrlScope-Bh3_j00P.js","/assets/user-Dvpw-7Xq.js","/assets/user-cog-BPlrb6Fj.js","/assets/users-BPoMXEmG.js","/assets/vfx-CA5KxcLT.js","/assets/video-BFjsZWBX.js","/assets/wallet-Bt9QFl8y.js","/assets/warehouse-BgB7Hash.js","/assets/workflow-nU7Ll3jt.js","/assets/x-Dl9VqeMd.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
