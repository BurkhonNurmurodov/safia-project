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

const BUILD = "2026-10-02T05:01:10.282Z";
const PRECACHE = ["/","/assets/AdminPanel-9f4nRtjG.js","/assets/AnalysisBoard-CVP2vH_6.js","/assets/Arc-CA-wuqCH.js","/assets/ArcLegacy-BP9fqWXs.js","/assets/BrigadirProfile-C8dnezwV.js","/assets/BroadcastReceivers-BOeiBI7K.js","/assets/BroadcastRecord-DSOFSvqt.js","/assets/CatLockNotice-BdufgZoo.js","/assets/CategoryLegendModal-Bx7I8Cbh.js","/assets/CellConcerns-DfJHpy4b.js","/assets/CellDetails-BxRBBhue.js","/assets/CellFormModal-CDcDc1mp.js","/assets/CellIdent-bBpQXn01.js","/assets/CellLink-Chlsq5b9.js","/assets/Cells-DN7nMfXy.js","/assets/ColumnFilter-BBqdqIE1.js","/assets/ColumnsPicker-vNbWrrwN.js","/assets/CommentsModal-DkLz1ljK.js","/assets/ComparisonTable-B2FZGC4N.js","/assets/Concerns-C1NOG9uz.js","/assets/ConfirmDialog-C1d6B6m9.js","/assets/Daily-DxK5O2M7.js","/assets/DataTable-DN6hMAuj.js","/assets/DateRangePicker-SwoPTAL2.js","/assets/DayReportView-ClhqQgS9.js","/assets/DayStepper-iFQWjvwS.js","/assets/DifferenceBreakdown-CfsxOki6.js","/assets/Downtime-BWFrVUI4.js","/assets/Education-CP_z7Ilj.js","/assets/EducationLesson-B1KUblHz.js","/assets/EmptyState-CAC3FH90.js","/assets/Exam-CH4MZEkU.js","/assets/FactorySelect-VFZPt2gu.js","/assets/Gamification-CrZKOfIK.js","/assets/GroupBadge-B6szbdT1.js","/assets/HeatmapChart-lwhfTXRv.js","/assets/IdleCell-BK5R2HgQ.js","/assets/KPICard-pgnR4j62.js","/assets/Kaizen-CATwN8Z7.js","/assets/Kelish-MBDcXovF.js","/assets/KpiDeltaCard-OHHgFCGG.js","/assets/LangTextInput-BUVyCUtQ.js","/assets/Layout-vd-prSEG.js","/assets/LeaderAppeal-DNGaxKDn.js","/assets/LeaderDayReport-nK5amwRq.js","/assets/LeaderUnitReport-CnDPpp5W.js","/assets/Leaderboard-C5u-tx65.js","/assets/Leaders-BGNK7Bj4.js","/assets/Lightbox-B9WLuG_B.js","/assets/LiveOverview-C7q9HoZI.js","/assets/Login-CmXHEhsw.js","/assets/NotFound-CvYcMjNv.js","/assets/Notifications-TGbr9m1J.js","/assets/Overview-DIbETsy-.js","/assets/Pagination-BD4H0OHl.js","/assets/PerenaladkaFactTable-C-Y2EfZz.js","/assets/PlanFulfillment-BALSWOc4.js","/assets/Production-C5REq1y6.js","/assets/Profile-DzDXECeU.js","/assets/ProofCamera-Cwt6vHhs.js","/assets/ProofPhoto-BefFKGFW.js","/assets/Quality-Cen1yzgO.js","/assets/RequestStateChip-6Rty5TEE.js","/assets/RichTextEditor-BmG0jIgb.js","/assets/SaveState-DFuBLm_4.js","/assets/SearchInput-CsuzMBZ9.js","/assets/SeasonalityHeatmap-CsxaRSOW.js","/assets/SegmentedToggle-y92kPLG6.js","/assets/SetupTimes-DDqrMAeI.js","/assets/ShiftDaily-B92dpzsG.js","/assets/Staff-CcjZMhQS.js","/assets/StaffLive-DQfZQKu7.js","/assets/StatusBadge-BuEkNHFg.js","/assets/TargetGoal-CLAkBOy0.js","/assets/Targets-CMBQppJW.js","/assets/Tasks-CuhY88zG.js","/assets/TimeWheelPicker-Ds95B2RM.js","/assets/Toast-LSlc6PDA.js","/assets/Tooltip-euN79mA3.js","/assets/TrendChart-C84pwktR.js","/assets/TripleSpeedometer-BUbcG6oc.js","/assets/Trudoyomkost-CMyzbf7Q.js","/assets/UploadDropzone-jziCKuUz.js","/assets/UsersActivity-Dh4gcOP3.js","/assets/VerdictBlock-DroSBLq0.js","/assets/WatchProgress-BvCM67s6.js","/assets/WebLogin-0m6tZ1S5.js","/assets/WorkerConcerns-B_uuEfIz.js","/assets/Workers-CqF-yTXA.js","/assets/Zagruzka-BESaO0Ie.js","/assets/ZagruzkaCell-BrPydl2e.js","/assets/api-CS-EBkab.js","/assets/archive-BhrewlWe.js","/assets/archive-restore-BDNdORZt.js","/assets/arrow-down-CBHSjDcB.js","/assets/arrow-left-DDNVe566.js","/assets/arrow-right-left-BLCJa4rj.js","/assets/arrow-up-DkQ0icRQ.js","/assets/arrow-up-narrow-wide-2FEiEkH6.js","/assets/arrow-up-right-DD2T09-e.js","/assets/award-BJkZwK_M.js","/assets/ban-CEawTnwN.js","/assets/bot-CsDxndCK.js","/assets/boxes-CCyDvUs9.js","/assets/brigadirFilters-8bBuZfm1.js","/assets/broadcastTree-Ct6CEoCE.js","/assets/building-2-D4Ek7BsP.js","/assets/calendar-CPXvWc1I.js","/assets/calendar-days-CYiIkvV9.js","/assets/calendar-range-Dth3Fk0k.js","/assets/camera-BI0jCSuH.js","/assets/categories-C_8NjYzn.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DUTReX64.js","/assets/chart-line-Cv5GfTTy.js","/assets/chart-pie-DiGxscLq.js","/assets/chartRange-CIQzn6QZ.js","/assets/chevron-left-B_YizB7q.js","/assets/chevrons-up-down-CwlB5qBH.js","/assets/circle-ICn4SFns.js","/assets/circle-alert-SNnL_6j4.js","/assets/circle-check-big-IWRqWQZt.js","/assets/circle-minus-DMBmJga3.js","/assets/circle-slash-D1rrzo_-.js","/assets/circle-user-round-BMfxks-0.js","/assets/cloud-off-CWzeL0yu.js","/assets/cloud-upload-DqRjOLit.js","/assets/compass-Np-LGZ4W.js","/assets/concernCategories-CxFb8Gcn.js","/assets/copy-C4ltfBo4.js","/assets/corner-down-right-DHiXrRSH.js","/assets/createLucideIcon-CQnQR9YO.js","/assets/es-P86RbmxC.js","/assets/exportXlsx-BddD4vrY.js","/assets/external-link-D8ZN3Q1i.js","/assets/file-clock-C8zlFhyZ.js","/assets/file-exclamation-point-C73cfJnt.js","/assets/file-spreadsheet-vj9GHhyr.js","/assets/file-text-BEIv5HYY.js","/assets/flag-D2SaI8KG.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BIjKvniC.js","/assets/hash-Crs0qgAM.js","/assets/history-jRkfBC4-.js","/assets/hourglass-DejWRyWO.js","/assets/id-card-DL9zMj6X.js","/assets/image-DUE-rrR9.js","/assets/image-off-Esdzoeel.js","/assets/inbox-CmV-G8Sb.js","/assets/index-CBQ-7RpV.css","/assets/index-hY6UhyiD.js","/assets/key-round-D__EecYQ.js","/assets/keyboard-B91Ju7ex.js","/assets/languages-DHr_nWoH.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B2cgSwI2.js","/assets/lightbulb-B8DbX64Y.js","/assets/link-2-m68oqebl.js","/assets/link-2-off-DBeeB2vl.js","/assets/list-ordered-BCbh8NTV.js","/assets/list-tree-BszgUsyz.js","/assets/lock-open-DHBonMN-.js","/assets/log-in-CBPFUOpx.js","/assets/maximize-2-5-I1cEgb.js","/assets/message-square-DfCynQ-l.js","/assets/minimize-2--nqpHdjb.js","/assets/package-check--r1uAiML.js","/assets/paperclip-CT-DMcoX.js","/assets/pencil-kuXdHalu.js","/assets/percent-C49EcOht.js","/assets/pin-DfteQi6Y.js","/assets/pin-off-BC3FPLYq.js","/assets/play-gqIPS2tn.js","/assets/plug-zap-DdP0e1Bg.js","/assets/presentation-HQi4tUNP.js","/assets/prop-types-DGxTbIpU.js","/assets/radio-DXXgU0ep.js","/assets/react-apexcharts.esm-CuiMa6F_.js","/assets/repeat-HvZK9Z7o.js","/assets/rotate-ccw-D-2bwPJv.js","/assets/rotate-cw-Dlq2L6fL.js","/assets/save-kDL7133w.js","/assets/scopeLinks-BagCfwqO.js","/assets/scroll-text-CaoXgC0l.js","/assets/search-x-BXsQNecB.js","/assets/segments-CFXWRI8a.js","/assets/send-hc6sf39z.js","/assets/settings-2-BHVGjtEO.js","/assets/shield-BKo42h4Q.js","/assets/shield-alert-BeMg-bg3.js","/assets/shield-check-foEaVsCu.js","/assets/shield-question-mark-B1ab0Pe8.js","/assets/siren-Ck6wp3Ap.js","/assets/snowflake-DW4zVMJ3.js","/assets/split-uWiaMQR0.js","/assets/square-BQOdKvra.js","/assets/square-check-big-BqqkL9Z_.js","/assets/star-D2eG7Vru.js","/assets/statusBands-CW4DcP1w.js","/assets/store-DJcpXxOD.js","/assets/table-2-sqGZjDgG.js","/assets/table-properties-DZHfDr-I.js","/assets/tag-BSuOpgN2.js","/assets/timer-off-CtVMfRGX.js","/assets/trending-down-DbkuxKFo.js","/assets/trending-up-BsXEc4Io.js","/assets/undo-2-CuVHaAPf.js","/assets/useChartTheme-B1HNrb0O.js","/assets/useElementWidth-gv1SfjNC.js","/assets/useIsMobile-03AU4Enu.js","/assets/useOpenParam-fYYOywt_.js","/assets/useStatusBands-BCi5ZCUS.js","/assets/useUrlScope-jIGwCqDi.js","/assets/user-cog-KjJs0tIg.js","/assets/user-minus-YoDBE_hA.js","/assets/user-uuweoJde.js","/assets/users-CWv54lea.js","/assets/video-CV7Y1dq5.js","/assets/wallet-CVYHPrbN.js","/assets/warehouse-T3kMrzRE.js","/assets/x-BfY0eqEw.js","/assets/zap-DAcMbRjU.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
