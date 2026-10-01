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

const BUILD = "2026-10-01T13:54:37.348Z";
const PRECACHE = ["/","/assets/AdminPanel-B3m_t0Pj.js","/assets/AnalysisBoard-C3vygVEn.js","/assets/Arc-Dl3KxCC8.js","/assets/ArcLegacy-CAxwZjl2.js","/assets/BrigadirProfile-C2EFJgbz.js","/assets/BroadcastReceivers-iqkOHTDO.js","/assets/BroadcastRecord-C0hSauF5.js","/assets/CatLockNotice-CPETRF2e.js","/assets/CategoryLegendModal-DIDCfHLo.js","/assets/CellConcerns-BLwnSySA.js","/assets/CellDetails-BmtHBmwh.js","/assets/CellFormModal-CbTjD-mv.js","/assets/CellIdent-D7xr3I6T.js","/assets/CellLink-CHbNw6Yv.js","/assets/Cells-koKd5nLQ.js","/assets/ColumnFilter-DeOFaF3B.js","/assets/ColumnsPicker-CFNmo5D_.js","/assets/CommentsModal-kpEr0HL_.js","/assets/ComparisonTable-BXQYKFMH.js","/assets/Concerns-BAZ0YrUI.js","/assets/ConfirmDialog-B4ewE1J1.js","/assets/Daily-BvjfXvVg.js","/assets/DataTable-D-j6qsUe.js","/assets/DateRangePicker-BY9fG2Xx.js","/assets/DayReportView-pWtePWSp.js","/assets/DayStepper-cBQyTzCX.js","/assets/DifferenceBreakdown-DMnMcb9b.js","/assets/Downtime-BGdabr0v.js","/assets/Education-DMkhVUKG.js","/assets/EducationLesson-CgSBicmQ.js","/assets/EmptyState-HfBwDITD.js","/assets/Exam-DW3tiQ1W.js","/assets/FactorySelect-Cu-dhuEH.js","/assets/Gamification-hx3YG9jF.js","/assets/GroupBadge-DgFqgMAx.js","/assets/HeatmapChart-2HZegOhj.js","/assets/IdleCell-Cj9nFnql.js","/assets/KPICard-ODoKUrTC.js","/assets/Kaizen-Cd2EE3BD.js","/assets/Kelish-C9bg4bY_.js","/assets/KpiDeltaCard-cD2PPjtx.js","/assets/LangTextInput-Df6RXZ9Z.js","/assets/Layout-BifYMNAh.js","/assets/LeaderAppeal-CTvcQeq6.js","/assets/LeaderDayReport-rKrpnCUh.js","/assets/LeaderUnitReport-CiwDoDBd.js","/assets/Leaderboard-Ke1U5ACG.js","/assets/Leaders-CVR271r0.js","/assets/Lightbox-BTR-F-8u.js","/assets/LiveOverview-CoVSynYn.js","/assets/Login-B1hA4Sl9.js","/assets/NotFound-C_DohHyJ.js","/assets/Notifications-Dt6CUJj1.js","/assets/Overview-DvKXM_wK.js","/assets/Pagination-W0TqND5k.js","/assets/PerenaladkaFactTable-DU-egmmE.js","/assets/PlanFulfillment-CdNS0WzK.js","/assets/Production-Cl6g0i5x.js","/assets/Profile-DkXjDNnJ.js","/assets/ProofCamera-DjVkvDrm.js","/assets/ProofPhoto-CAx_sDeo.js","/assets/Quality-9obHaSt4.js","/assets/RequestStateChip-B-EFa__v.js","/assets/RichTextEditor-DjaCi2FW.js","/assets/SaveState-DeW4Ht__.js","/assets/SearchInput-BHGw_sU_.js","/assets/SeasonalityHeatmap-BBXyIQxV.js","/assets/SegmentedToggle-DD-MCRwK.js","/assets/SetupTimes-Cbz1zebu.js","/assets/ShiftDaily-suYNFghM.js","/assets/Staff-DU-24Q6X.js","/assets/StaffLive-DPhHk91x.js","/assets/StatusBadge-DMoMUG1c.js","/assets/TargetGoal-DvesSM3w.js","/assets/Targets-CCnqtBaE.js","/assets/Tasks-DUrBz8BX.js","/assets/TimeWheelPicker-03QVCm1v.js","/assets/Toast-C95PLBhS.js","/assets/Tooltip-BFF2eOi1.js","/assets/TrendChart-C4WbP6X3.js","/assets/TripleSpeedometer-DQH6Jdyf.js","/assets/Trudoyomkost-a6FKLWZJ.js","/assets/UploadDropzone-C40kyF3W.js","/assets/UsersActivity-7Pr29-TQ.js","/assets/VerdictBlock-C47g6WS2.js","/assets/WatchProgress-D6d77L3Z.js","/assets/WebLogin-BZ_CR7_G.js","/assets/WorkerConcerns-Cm_J43u6.js","/assets/Workers-DzOEsn19.js","/assets/Zagruzka-KjCIfhvI.js","/assets/ZagruzkaCell-DDf4dp_n.js","/assets/api-IqyXIdW1.js","/assets/archive-BwKTJv5e.js","/assets/archive-restore-CUgVSc-0.js","/assets/arrow-down-BM0rKQGu.js","/assets/arrow-left-Cs3fKrnR.js","/assets/arrow-right-left-B4Yvf5Nk.js","/assets/arrow-up-DRTsvnqi.js","/assets/arrow-up-narrow-wide-CNQD95tM.js","/assets/arrow-up-right-CSL5Ntl9.js","/assets/award-BR6NPCiB.js","/assets/ban-dKRV6PhQ.js","/assets/bot-COSQh_v_.js","/assets/boxes-BrLIwFdd.js","/assets/brigadirFilters-BnTeJBTX.js","/assets/broadcastTree-CVuHhgy4.js","/assets/building-2-Cud6y9po.js","/assets/calendar-C0ChjD9N.js","/assets/calendar-days-BS6vDjcd.js","/assets/calendar-range-DHzMSUqw.js","/assets/camera-B5sL-0_N.js","/assets/categories-BJLTr5qU.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DqthFc-X.js","/assets/chart-line-DM1CBm2f.js","/assets/chart-pie-86gGXWAi.js","/assets/chartRange-BO_mve2-.js","/assets/chevron-left-CoQpspKu.js","/assets/chevrons-up-down-DXqFUsa9.js","/assets/circle-alert-CEmazUtb.js","/assets/circle-check-big-CQ3KykXi.js","/assets/circle-fA_wxD3g.js","/assets/circle-minus-BGdUE61m.js","/assets/circle-slash-X9FsJT1w.js","/assets/circle-user-round-B4DsYdd4.js","/assets/cloud-off-DsIoPKMx.js","/assets/cloud-upload-ooOLqIH3.js","/assets/compass-DLcstc4y.js","/assets/concernCategories-O3ccXGIN.js","/assets/copy-59HwFElq.js","/assets/corner-down-right-CSDGqHpl.js","/assets/createLucideIcon-GHhj2_Xo.js","/assets/es-wXiOseja.js","/assets/exportXlsx-_H8Za34w.js","/assets/external-link-D_Z6KLXp.js","/assets/file-clock-D341GLcN.js","/assets/file-exclamation-point-D8dvED5E.js","/assets/file-spreadsheet-C_PQSRVM.js","/assets/file-text-D_R57dxe.js","/assets/flag-DbddPLpy.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BroexksH.js","/assets/hash-Bo8t9WJO.js","/assets/history-K1nTEsnX.js","/assets/hourglass-Do_1xIH0.js","/assets/id-card-BMIhm_ZN.js","/assets/image-Cwl1q_J1.js","/assets/image-off-DNsFebr2.js","/assets/inbox-CKsIEiOX.js","/assets/index-B1YffX7N.js","/assets/index-C5C7uERa.css","/assets/key-round-twoa_2To.js","/assets/keyboard-Dg21r-CJ.js","/assets/languages-CcMZVl4i.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CM43p-I4.js","/assets/lightbulb-Brumkjfu.js","/assets/link-2-BFNmMet1.js","/assets/link-2-off-Do6isEy6.js","/assets/list-ordered-Btgp4HL_.js","/assets/list-tree-DrnqMvXd.js","/assets/lock-open-CGO9FP1C.js","/assets/log-in-vsRT094J.js","/assets/maximize-2-gy3jbfZ2.js","/assets/message-square-DdNLyIha.js","/assets/minimize-2-DEduwGvS.js","/assets/package-check-DLrcqlSX.js","/assets/paperclip-CGGR8Xl4.js","/assets/pencil-BUPRclZd.js","/assets/percent-l48h_ub_.js","/assets/pin-YeVB0v_3.js","/assets/pin-off-DNLEh8Ex.js","/assets/play-Bg8752He.js","/assets/plug-zap-Cl0sen8U.js","/assets/presentation-BL3lAm1d.js","/assets/prop-types-CluGP8ZA.js","/assets/radio-BcgaWt4w.js","/assets/react-apexcharts.esm-B-_4S-_E.js","/assets/repeat-BhfKABzb.js","/assets/rotate-ccw-Dk5nA4RW.js","/assets/rotate-cw-Ci2Zw4Fz.js","/assets/save-CA3hG-f8.js","/assets/scopeLinks-Cl8LYkP8.js","/assets/scroll-text-CygwUhG9.js","/assets/search-x-BzBX8-xb.js","/assets/segments-BLFNEtBd.js","/assets/send-RwXp66kw.js","/assets/settings-2-B1EGSAhj.js","/assets/shield-DlhdW9_s.js","/assets/shield-alert-HKgJKCt8.js","/assets/shield-check-Dq_5mEyG.js","/assets/shield-question-mark-CrIpUOku.js","/assets/siren-Cyd04tXM.js","/assets/snowflake-DuNLPVHT.js","/assets/split-BKQdvzkx.js","/assets/square-CMdfammm.js","/assets/square-check-big-DeV5ckbB.js","/assets/star-CwvYxgsT.js","/assets/statusBands-CThIwdZC.js","/assets/store-Bo5QB-qD.js","/assets/table-2-CyzhhInY.js","/assets/table-properties-Bsx0CHQv.js","/assets/tag-Bzjq9rWA.js","/assets/timer-off-CmvR8P_W.js","/assets/trending-down-BY9OnwVF.js","/assets/trending-up-YXoNdSQ6.js","/assets/undo-2-BzDJtW-J.js","/assets/useChartTheme-C2SXYIXe.js","/assets/useElementWidth-Vq2UK7T4.js","/assets/useIsMobile-aQGOggHJ.js","/assets/useOpenParam-D3YPDWGw.js","/assets/useStatusBands-7b8c52uD.js","/assets/useUrlScope-DKm5jRFL.js","/assets/user-DUecyIjy.js","/assets/user-cog-YQhU0YMe.js","/assets/user-minus-pdQQXrMy.js","/assets/users-pxZN1y_7.js","/assets/video-u0lbZXDR.js","/assets/wallet-Dn4emFkf.js","/assets/warehouse-DTzxrXFt.js","/assets/x-CwL8hN4l.js","/assets/zap-CKhKf8WJ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
