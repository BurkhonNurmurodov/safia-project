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

const BUILD = "2026-10-26T09:57:58.514Z";
const PRECACHE = ["/","/assets/AdminPanel-DQa8XJh3.js","/assets/AnalysisBoard-BQOO4yyX.js","/assets/Arc-CsMctV_b.js","/assets/Assistant-BZh5032R.js","/assets/BrigadirProfile-DOAWxLl6.js","/assets/BroadcastReceivers-oUuRyQai.js","/assets/BroadcastRecord-Co2lb07n.js","/assets/Button-7zxItH39.js","/assets/CatLockNotice-DM74lf9M.js","/assets/CategoryLegendModal-1_TwQnOa.js","/assets/CellConcerns-B40r5Due.js","/assets/CellDetails-DZ4D6BPM.js","/assets/CellFormModal-Dw42p6jL.js","/assets/CellIdent-DdktFnSl.js","/assets/CellLink-BrFiVJZO.js","/assets/Cells-CCNjuEED.js","/assets/ColumnFilter-CZ4U7rAH.js","/assets/ColumnsPicker-CAbZ7hBZ.js","/assets/CommentsModal-io_fWXXV.js","/assets/ComparisonTable-SSFBy4pE.js","/assets/Concerns-CT19vktV.js","/assets/CountStepper-CUle3wz9.js","/assets/Daily-BlE5KAcs.js","/assets/DataTable-DxwJMN2t.js","/assets/DateRangePicker-CXZaaUf9.js","/assets/DayReportView-f-aze_IP.js","/assets/DayStepper-d5jRrSGe.js","/assets/DayStrip-BP_p-8QO.js","/assets/DifferenceBreakdown-BE1kBs7d.js","/assets/Downtime-mc_MacU7.js","/assets/Education-tlHqb0er.js","/assets/EducationLesson-DE7gB9Q1.js","/assets/EmptyState-Cank783m.js","/assets/Exam-4h4V2_Ry.js","/assets/FactorySelect-BwBsN16O.js","/assets/Gamification-B173prSg.js","/assets/GroupBadge-B1iqfZjG.js","/assets/HeatmapChart-j30MFscC.js","/assets/IdleCell-DuObR9SG.js","/assets/KPICard-BN2y-iWk.js","/assets/Kaizen-u-76Y7f-.js","/assets/Kelish-B66oOhCr.js","/assets/KpiDeltaCard-5UwzU2IE.js","/assets/LangTextInput-BOiFYcEO.js","/assets/Layout-A5c61_bJ.js","/assets/LeaderAppeal-CN4A7UZ6.js","/assets/LeaderDayReport-BO5NrHqp.js","/assets/LeaderUnitReport-DnKTkq7D.js","/assets/Leaderboard-zJnSGLJf.js","/assets/Leaders-DvR--XZI.js","/assets/LeadersKpi-DT_Rcekd.js","/assets/Lightbox-Dv0kC4a7.js","/assets/LiveOverview-B5uloPoa.js","/assets/Login-ARu0kXRD.js","/assets/NotFound-CMkCwL2a.js","/assets/Notifications-DZkD9R-U.js","/assets/Ontime-ClYbcrFK.js","/assets/Overview-DZV__oJv.js","/assets/Pagination-DlIYgVwD.js","/assets/PerenaladkaFactTable-mh2-3BAs.js","/assets/PersonCard-B8Fp-06n.js","/assets/PlanFulfillment-D-_Kn2_Z.js","/assets/Production-C-iX5Vqx.js","/assets/Profile-C_wod8gX.js","/assets/ProofCamera-CbbiFTU2.js","/assets/ProofPhoto-0dwypqat.js","/assets/Quality-B1wey35U.js","/assets/RawRows-CzT8di56.js","/assets/Reports-yLrF002a.js","/assets/RequestStateChip-rQdbSFBm.js","/assets/RichTextEditor-Cgwm1jQh.js","/assets/SaveState-BvsWE3AS.js","/assets/SearchInput-CSJUf_lD.js","/assets/SeasonalityHeatmap-Bf2PJLlL.js","/assets/SegmentedToggle-DE_fkBPp.js","/assets/SetupTimes-BcQVEqeM.js","/assets/ShiftDaily-LqnuuYBQ.js","/assets/Staff-DWVnvxdX.js","/assets/StaffListAtCheck-xY3FBofx.js","/assets/StatusBadge-C7gVNmyd.js","/assets/StatusBandsModal-C7G5JjZW.js","/assets/TargetGoal-CNJJXj2v.js","/assets/Targets-BO0U6-g-.js","/assets/Tasks-CsoPkjP5.js","/assets/TimeWheelPicker-DoY4ZP2S.js","/assets/Toast-Cnydnnjk.js","/assets/Tooltip-kOXU0swm.js","/assets/TrendChart-BdBWjz9r.js","/assets/TripleSpeedometer-B7qDqo18.js","/assets/Trudoyomkost-PB-69T0P.js","/assets/UploadDropzone-DLgSI-iq.js","/assets/UsersActivity-CBVHs5qi.js","/assets/VerdictBlock-4bb-St5e.js","/assets/VfxApiMap-maKnKDGA.js","/assets/VfxDictionaries-DzESrJpH.js","/assets/VfxEmployees-Csplgqyf.js","/assets/VfxHrMoves-CDu5vFJL.js","/assets/VfxJobs-CZRvOA_x.js","/assets/VfxPhoto-D4QZunV1.js","/assets/VfxShifts-CGQbFVKT.js","/assets/VfxState-Cp7DRqyX.js","/assets/VfxTimebooks-DrgrU0Vj.js","/assets/VfxTimesheet-4QWwWGFE.js","/assets/WatchProgress-COO24WTH.js","/assets/WebLogin-IwraPD6D.js","/assets/Workers-BhQHyVYc.js","/assets/Zagruzka-Cw32CiQR.js","/assets/ZagruzkaCell-DytR_C21.js","/assets/api-BFm7MSgf.js","/assets/archive-BnL1QyIq.js","/assets/archive-restore-DbSpVkr3.js","/assets/arrow-down-C_Z0GOKJ.js","/assets/arrow-down-right-ngwEVfrM.js","/assets/arrow-down-wide-narrow-D121WdMx.js","/assets/arrow-up-narrow-wide-BVpqeSaj.js","/assets/ban-DNdVg8pH.js","/assets/boxes-3GkcyYbX.js","/assets/braces-CosFW2wI.js","/assets/brigadirFilters-CPXzvEX4.js","/assets/broadcastTree-BTD9oD-E.js","/assets/building-2-Cz_00aAZ.js","/assets/calendar-DC8FVIPM.js","/assets/calendar-days-BmiPKC3D.js","/assets/camera-Dk5bYmvE.js","/assets/categories-B-phS_SB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B7LKo6jN.js","/assets/chart-line-flbVDb41.js","/assets/chart-pie-Cvstcxm-.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-GRaEpVFf.js","/assets/chevron-left-BgJ2-gbn.js","/assets/chevrons-up-down-Dd9pCF3f.js","/assets/circle-BaY2PrUb.js","/assets/circle-alert-BXg-rm5h.js","/assets/circle-check-big-D1vSGgcd.js","/assets/circle-dashed-DGq8FthC.js","/assets/circle-minus-DwyNTXS-.js","/assets/circle-question-mark-Dd4mNuQu.js","/assets/circle-slash-CMbfYYi0.js","/assets/circle-user-round-qo_DGHy-.js","/assets/cloud-off-jHFEWbTF.js","/assets/cloud-upload-C2sqDYRR.js","/assets/coins-DuTbGuk3.js","/assets/compass-DgEDUr70.js","/assets/concernCategories-CIjrfzzQ.js","/assets/corner-down-right-CyAWqIob.js","/assets/createLucideIcon-Cxu5AMfJ.js","/assets/en-CL07oKtN.js","/assets/es-Dtgc5NM1.js","/assets/external-link-CCdy5pln.js","/assets/file-clock-C-nzvRs6.js","/assets/file-exclamation-point-C_2ZJ46r.js","/assets/flag-Df1dsRQZ.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-CFf42Dkc.js","/assets/funnel-xTS36hPb.js","/assets/hash-BFT6bDo0.js","/assets/hourglass-xpKPZdm0.js","/assets/idleTime-CHPnJRpw.js","/assets/image-CIK15xi0.js","/assets/image-off-TxXD2mcq.js","/assets/inbox-Cc8yaeow.js","/assets/index-CFKNzIy8.css","/assets/index-DzazPb22.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DAaPuHbw.js","/assets/languages-BiwHBSjd.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BYzLou_J.js","/assets/leaderBoard-BZXbT6Gk.js","/assets/lightbulb-DNXKSihM.js","/assets/link-2-Di2X4y4S.js","/assets/link-2-off-BHufLakk.js","/assets/list-ordered-B5BHL_AK.js","/assets/list-tree-Dxd8Y051.js","/assets/lock-open-D5arEy3n.js","/assets/log-in-Dl1rW4Sn.js","/assets/map-pin-sLZ2ZSzm.js","/assets/marks-Bm1bdurJ.js","/assets/minimize-2-BrE-OiEd.js","/assets/package-check-DhJKrGZP.js","/assets/pencil-no30fLh0.js","/assets/percent-FTQAmsr7.js","/assets/pin-C1Un_YYA.js","/assets/pin-off-BFFvJkQO.js","/assets/play-B89iLCPb.js","/assets/plug-zap-DO72Czrv.js","/assets/prop-types-RD3fbola.js","/assets/radio-BIIialmY.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-CeQmlO2E.js","/assets/repeat-S5Upu_ww.js","/assets/ru-Dt02A5CR.js","/assets/save-NfBUtck9.js","/assets/scopeLinks-CdPljShp.js","/assets/scroll-text-JXWr7jhJ.js","/assets/search-x-BK_2Q0qb.js","/assets/segments-D5Uiedtv.js","/assets/send-BtC0EtZw.js","/assets/settings-2-Cat0TiA3.js","/assets/shield-B2eZqNPx.js","/assets/shield-alert-DC1v1wRT.js","/assets/shield-question-mark-CbN5yxiE.js","/assets/sigma-Br0QMSLU.js","/assets/siren-BT9wVvvC.js","/assets/snowflake-BBg9QGOZ.js","/assets/split-g6hT9Kp9.js","/assets/square-check-big-B2OabeA6.js","/assets/star-OpB7crKO.js","/assets/statusBands-DVBZcBq3.js","/assets/store-CiqouLYG.js","/assets/table-2-Ce1UdgSh.js","/assets/table-properties-Bz0vE7Gc.js","/assets/tag-Bv_r7r9-.js","/assets/timer-off-ayLhZXHc.js","/assets/translations-pbpe5xnv.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-DW3G-1hd.js","/assets/trending-up-Bs4CKqvY.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-DIUYFe06.js","/assets/useChartTheme-CT3yj44c.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-BvMiZrr2.js","/assets/useStatusBands-BG26tEmA.js","/assets/useUrlScope-B6ZTV_qH.js","/assets/user-BLzDjLUX.js","/assets/user-cog-CKMzE29u.js","/assets/user-minus-DxfrZoN8.js","/assets/users-JAn2rk6T.js","/assets/uz-DOMS2QVT.js","/assets/uz_cyrl-Cv7KD5AQ.js","/assets/vfx-CeV__yb3.js","/assets/video-C_tmlqPT.js","/assets/wallet-Dm8FGdGG.js","/assets/warehouse-C5XEkG_6.js","/assets/workflow-DRsJNKGa.js","/assets/x-DBfEARDS.js","/assets/zap-D7q0AeLg.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
