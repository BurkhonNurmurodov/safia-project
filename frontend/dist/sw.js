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

const BUILD = "2026-10-03T04:33:17.199Z";
const PRECACHE = ["/","/assets/AdminPanel-V9a6KFHr.js","/assets/AnalysisBoard-DOYJrvXg.js","/assets/Arc-YFDgmG1Q.js","/assets/ArcLegacy-CZqbCahZ.js","/assets/BrigadirProfile-DHWR4nOf.js","/assets/BroadcastReceivers-BL9RnLD7.js","/assets/BroadcastRecord-C8jv5VLC.js","/assets/CatLockNotice-CnMD9Jpt.js","/assets/CategoryLegendModal-CfgMPIpy.js","/assets/CellConcerns-BmaqZbMM.js","/assets/CellDetails-BOc1UprP.js","/assets/CellFormModal-CnhEASp8.js","/assets/CellIdent-DLTYbCG9.js","/assets/CellLink-D-R91QV4.js","/assets/Cells-DXnyOU3Q.js","/assets/ColumnFilter-CoKU-596.js","/assets/ColumnsPicker-BMUVlr1O.js","/assets/CommentsModal-CkoP6g0b.js","/assets/ComparisonTable-7j0tx3Nl.js","/assets/Concerns-QvjlaQph.js","/assets/ConfirmDialog-DVGv6Uh2.js","/assets/Daily-BT2VmQjp.js","/assets/DataTable-DXqBlxT0.js","/assets/DateRangePicker-0GxWH171.js","/assets/DayReportView-DDo3_BOW.js","/assets/DayStepper-D0JeQIke.js","/assets/DifferenceBreakdown-ByjIS-To.js","/assets/Downtime-BciVJVSV.js","/assets/Education-Co_L-cnX.js","/assets/EducationLesson-D9lvUSjf.js","/assets/EmptyState-DdmL-EnV.js","/assets/Exam-BmLFTHom.js","/assets/FactorySelect-ChYwhVF-.js","/assets/Gamification-mqdS-tAr.js","/assets/GroupBadge-DXHq_iBo.js","/assets/HeatmapChart-CEJ57oU4.js","/assets/IdleCell-ZSDN6mRk.js","/assets/KPICard-DPCN5ty9.js","/assets/Kaizen-DADDEQGo.js","/assets/Kelish-Co5786pG.js","/assets/KpiDeltaCard-NEOsj-gv.js","/assets/LangTextInput-BjNXCHZ4.js","/assets/Layout-JygxFwPr.js","/assets/LeaderAppeal-B3VKxBHH.js","/assets/LeaderDayReport-DbGZCoP6.js","/assets/LeaderUnitReport-C8DFYNLa.js","/assets/Leaderboard-DCX3zZHJ.js","/assets/Leaders-CGV95AVz.js","/assets/Lightbox-KcVjAjxE.js","/assets/LiveOverview-DCnhRlOB.js","/assets/Login-BZuvNlye.js","/assets/NotFound-B03S76F-.js","/assets/Notifications-BdsrGbjx.js","/assets/Overview-sJw80Zh0.js","/assets/Pagination-Dyye1JTV.js","/assets/PerenaladkaFactTable-CDIArTpE.js","/assets/PlanFulfillment-CANoOrSu.js","/assets/Production-BnATGl3V.js","/assets/Profile-kADGWHFw.js","/assets/ProofCamera-DLrgD_0L.js","/assets/ProofPhoto-Cj3TNoNi.js","/assets/Quality-C_2LmDrg.js","/assets/RequestStateChip-rTGicQ-3.js","/assets/RichTextEditor-BupePFP5.js","/assets/SaveState-CWWP6s_C.js","/assets/SearchInput-BLeQB0RU.js","/assets/SeasonalityHeatmap-BJRimSG-.js","/assets/SegmentedToggle-DYTKMeGJ.js","/assets/SetupTimes-BpESvKIF.js","/assets/ShiftDaily-DqIh_9y9.js","/assets/Staff-C2ux2WvZ.js","/assets/StaffLive-C4SHhUvU.js","/assets/StatusBadge-C1UxNZrq.js","/assets/TargetGoal-FuLTIq-e.js","/assets/Targets-BYPPVXrs.js","/assets/Tasks-D_ELLdK3.js","/assets/TimeWheelPicker-DqN-qbRL.js","/assets/Toast-NdOhmGi-.js","/assets/Tooltip-DQZ2GoRA.js","/assets/TrendChart-y5ficpeq.js","/assets/TripleSpeedometer-Cd2Jslgu.js","/assets/Trudoyomkost-BJfRZZTl.js","/assets/UploadDropzone-BW252ddQ.js","/assets/UsersActivity-B4tgQWKP.js","/assets/VerdictBlock-M1zwS2CS.js","/assets/WatchProgress-C82kWd3X.js","/assets/WebLogin-Cd40M-j6.js","/assets/WorkerConcerns-DiKa3k9e.js","/assets/Workers-vKGCMHqL.js","/assets/Zagruzka-B4BRcXBK.js","/assets/ZagruzkaCell-D1i5KnpX.js","/assets/api-B1to9xhW.js","/assets/archive-CEMirGI9.js","/assets/archive-restore-C-5gx5k0.js","/assets/arrow-down-ByQXzF4w.js","/assets/arrow-left-C0tVAexP.js","/assets/arrow-right-left-BXcjagW-.js","/assets/arrow-up-DCOs73Q3.js","/assets/arrow-up-narrow-wide-DueFyBLg.js","/assets/arrow-up-right-C1mEgaw1.js","/assets/award-nsXg-PyM.js","/assets/ban-ioV8YmaM.js","/assets/bot-DF2dMFZe.js","/assets/boxes-OAS4f1jQ.js","/assets/brigadirFilters-BxVNpcIp.js","/assets/broadcastTree-Bpu0f1wb.js","/assets/building-2-C1EVmJeK.js","/assets/calendar-DHHyiBHt.js","/assets/calendar-days-D1T2_lwp.js","/assets/calendar-range-oPhOWawD.js","/assets/camera-m2UIM_fj.js","/assets/categories-DuanBI_e.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BXGOa4q2.js","/assets/chart-line-CZlZKEsP.js","/assets/chart-pie-CJiTTSWJ.js","/assets/chartRange-DNoucUlh.js","/assets/chevron-left-zKkKYxax.js","/assets/chevrons-up-down-BUwi-WNJ.js","/assets/circle-DR8fD3NG.js","/assets/circle-alert-BLh8i1lo.js","/assets/circle-check-big-Bl1OVG_u.js","/assets/circle-minus-DX1gnsES.js","/assets/circle-question-mark-D-akcklD.js","/assets/circle-slash-DB95sPUX.js","/assets/circle-user-round-CZ1mgUYU.js","/assets/cloud-off-BNVoG3nX.js","/assets/cloud-upload-ZVomZZk7.js","/assets/compass-BnxhVzvP.js","/assets/concernCategories-DGbx9yfU.js","/assets/copy-Cb61LVqN.js","/assets/corner-down-right-5rqgfEdT.js","/assets/createLucideIcon-DquOQng5.js","/assets/es-BEKsQOhL.js","/assets/exportXlsx-CqTmR0T8.js","/assets/external-link-BuSMM9nX.js","/assets/file-clock-DGYPEqjl.js","/assets/file-exclamation-point-D9-eEVE2.js","/assets/file-spreadsheet-CSHRMZmU.js","/assets/file-text-BSeYA88Q.js","/assets/flag-DLKto4Rt.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D-TLt6YN.js","/assets/hash-CwBa0Z_R.js","/assets/history-CsOBwIn-.js","/assets/hourglass-BgdOd-XT.js","/assets/id-card-BM2Wpcd3.js","/assets/image-D_Ey5C1b.js","/assets/image-off-BUJU23EV.js","/assets/inbox-CAfxcvx_.js","/assets/index-BctiIRrp.css","/assets/index-XPHlBoY7.js","/assets/key-round-CAKSE_7U.js","/assets/keyboard-DkakEOyB.js","/assets/languages-CVMTk0Ov.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-oPYJtlLz.js","/assets/lightbulb-Dn-GZ6PW.js","/assets/link-2-DsorMKHp.js","/assets/link-2-off-DXcEl_XT.js","/assets/list-ordered-seEgdH16.js","/assets/list-tree-BoLS9vCj.js","/assets/lock-open-CH80pCM9.js","/assets/log-in-Ctt_xliT.js","/assets/maximize-2-CJrzZ5Vg.js","/assets/message-square-DNLFuavr.js","/assets/minimize-2-DeSegeVa.js","/assets/package-check-Ckq1tRRJ.js","/assets/paperclip-DXpVRnv2.js","/assets/pencil-BA7GBu7w.js","/assets/percent-Df-WP9Ee.js","/assets/pin-C279Sjcz.js","/assets/pin-off-CoPbzTPZ.js","/assets/play-DZGx_Aqm.js","/assets/plug-zap-Cz8-4TJC.js","/assets/presentation-DRVzbMrv.js","/assets/prop-types-UIxGWmZR.js","/assets/radio-BcR-un3H.js","/assets/react-apexcharts.esm-L2LOO_qh.js","/assets/repeat-DuEt_HeL.js","/assets/rotate-ccw-0JIrCyV6.js","/assets/rotate-cw-DpUu8po0.js","/assets/save-CX5pGu0J.js","/assets/scopeLinks-BOC4v588.js","/assets/scroll-text-BOMMWS9G.js","/assets/search-x-MFZQH449.js","/assets/segments-DkqiCffK.js","/assets/send-BRhSw9mV.js","/assets/settings-2-I1GE2H2u.js","/assets/shield-DfkMMAF4.js","/assets/shield-alert-BDUowUnp.js","/assets/shield-check-CmnyexSh.js","/assets/shield-question-mark-BoObIet4.js","/assets/siren-CpktAKYI.js","/assets/snowflake-Onop-3h_.js","/assets/split-DquBZ-cr.js","/assets/square-DJJ2vfrB.js","/assets/square-check-big-Kf8MD4oq.js","/assets/star-hPkk3PUw.js","/assets/statusBands-CYpDMxPL.js","/assets/store-y1PBKlqf.js","/assets/table-2-C_sOH-NK.js","/assets/table-properties-BWOfS_HG.js","/assets/tag-1iwtqMlV.js","/assets/timer-off-CPizc_3b.js","/assets/trending-down-CsAF9Q1z.js","/assets/trending-up-CZPq6Bk1.js","/assets/undo-2-DLHMhjMf.js","/assets/useChartTheme-CG4Dn9Yy.js","/assets/useElementWidth-Deko-Pw5.js","/assets/useIsMobile-U1VgBJJe.js","/assets/useOpenParam-BB3shH5i.js","/assets/useStatusBands-CETqa2O8.js","/assets/useUrlScope-D4EaKZ6m.js","/assets/user-DVnSmbFQ.js","/assets/user-cog-Dbm37k8f.js","/assets/user-minus-C8si-u6_.js","/assets/users-BqgqTaWy.js","/assets/video-CQ0LyfSP.js","/assets/wallet-B2XvRAkx.js","/assets/warehouse-Dm0uTgZH.js","/assets/x-CeZYJf7Y.js","/assets/zap-BHRvM-vi.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
