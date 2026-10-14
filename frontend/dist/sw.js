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

const BUILD = "2026-10-14T16:34:33.810Z";
const PRECACHE = ["/","/assets/AdminPanel-Kw3LXr_5.js","/assets/AnalysisBoard-C90zjhCm.js","/assets/Arc-FuMI6ify.js","/assets/Assistant-KAXG8lo8.js","/assets/BrigadirProfile-C0up2em8.js","/assets/BroadcastReceivers-D9Q-wMJl.js","/assets/BroadcastRecord-BV2ofM3R.js","/assets/Button-CbOobZFo.js","/assets/CatLockNotice-BvzLFjvM.js","/assets/CategoryLegendModal-B2qE-xW_.js","/assets/CellConcerns-uokOEA2H.js","/assets/CellDetails-BN-aov0q.js","/assets/CellFormModal-Cg7bkJrj.js","/assets/CellIdent-DrCFZfuL.js","/assets/CellLink-2jUyUQHx.js","/assets/Cells-GIQ6cLFq.js","/assets/ColumnFilter-f1YF8pnq.js","/assets/ColumnsPicker-CGM3hp3b.js","/assets/CommentsModal-C5_WxZqr.js","/assets/ComparisonTable-ClS-cOC6.js","/assets/Concerns-CuwYrtK_.js","/assets/CountStepper-B3p7DbE8.js","/assets/Daily-CaRXkICt.js","/assets/DataTable-D-1d3sqh.js","/assets/DateRangePicker-Lz7mQhcV.js","/assets/DayReportView-DGRjTJCG.js","/assets/DayStepper-DHUV1F50.js","/assets/DifferenceBreakdown-BFfbaDLP.js","/assets/Downtime-9-pFpFy-.js","/assets/Education-BCYv-0RD.js","/assets/EducationLesson-Dtn4fJHP.js","/assets/EmptyState-DFoKTKON.js","/assets/Exam-Bxh6w8KM.js","/assets/FactorySelect-hDkPawCQ.js","/assets/Gamification-GVN4QME3.js","/assets/GroupBadge-DucgMGUH.js","/assets/HeatmapChart-C3nwEne8.js","/assets/IdleCell-Du0JVYQJ.js","/assets/KPICard-DIO9-hYg.js","/assets/Kaizen-BC1LrvXe.js","/assets/Kelish-CBrQAN14.js","/assets/KpiDeltaCard-B-MrLs28.js","/assets/LangTextInput-BW69zMfu.js","/assets/Layout-BbZFp-ss.js","/assets/LeaderAppeal-CuaUrlrO.js","/assets/LeaderDayReport-DUHL1EYs.js","/assets/LeaderUnitReport-D3BRGxzB.js","/assets/Leaderboard-DWJaPqOj.js","/assets/Leaders-DdxOvhvg.js","/assets/Lightbox-CZih8xTe.js","/assets/LiveOverview-C0s2YXkb.js","/assets/Login-mq6TxyTP.js","/assets/NotFound-BMF1xyru.js","/assets/Notifications-gVd0Zban.js","/assets/Overview-CDMdSSJk.js","/assets/Pagination--qoYCSLM.js","/assets/PerenaladkaFactTable-NzP-bgic.js","/assets/PersonCard-De-wWq11.js","/assets/PlanFulfillment-wwl1R-gc.js","/assets/Production-Bfh0etwT.js","/assets/Profile-C7kUjiyd.js","/assets/ProofCamera-CRqbdB1g.js","/assets/Quality-B_VzmzUb.js","/assets/RawRows-CJ8CDDH2.js","/assets/RequestStateChip-C6txHFMT.js","/assets/RichTextEditor-CV3g5UnZ.js","/assets/SaveState-Opdu2bBw.js","/assets/SearchInput-O9kpaL87.js","/assets/SeasonalityHeatmap-DZA6fo_P.js","/assets/SegmentedToggle-CDv0q-5Z.js","/assets/SetupTimes-BQLPZhJu.js","/assets/ShiftDaily-D-DE5UZ6.js","/assets/Staff-B7NJWz-1.js","/assets/StaffListAtCheck-cms9we_m.js","/assets/StatusBadge-DH_scqcz.js","/assets/TargetGoal-h9UomNvm.js","/assets/Targets-C6C9_-Kn.js","/assets/Tasks-CDfFwBZK.js","/assets/TimeWheelPicker-DpUqgXNl.js","/assets/Toast-C7C332UB.js","/assets/Tooltip-Dvt-h6wW.js","/assets/TrendChart-BjHE7rtK.js","/assets/TripleSpeedometer-DMz8eJaI.js","/assets/Trudoyomkost-w9cDLT-g.js","/assets/Turnover-BXdkH1QW.js","/assets/UploadDropzone-CgFy2uLR.js","/assets/UsersActivity-hOXGOD7_.js","/assets/VerdictBlock-DZFbd4qW.js","/assets/VfxApiMap-B8-pTYDX.js","/assets/VfxDictionaries-CBGwc6j5.js","/assets/VfxEmployees-CJTgtul6.js","/assets/VfxHrMoves-D0uRB014.js","/assets/VfxJobs-po9kPk66.js","/assets/VfxPhoto-C6t8RzSF.js","/assets/VfxShifts-C6grOdf2.js","/assets/VfxState-C4n0pexZ.js","/assets/VfxTimebooks-NQsy8I83.js","/assets/VfxTimesheet-DpWhFmA3.js","/assets/WatchProgress-D0t-VHV8.js","/assets/WebLogin-BFKOuU3w.js","/assets/WorkerConcerns-CZZJPrpt.js","/assets/Workers-Dub7y9r1.js","/assets/Zagruzka-CKOBg7Hz.js","/assets/ZagruzkaCell-CgpLZb1A.js","/assets/api-B9dmFySp.js","/assets/archive-CZcM0t-L.js","/assets/archive-restore-PMno3JVF.js","/assets/arrow-down-DL_uVFN1.js","/assets/arrow-down-wide-narrow-BIOs3OQb.js","/assets/arrow-up-narrow-wide-Cuz8y4av.js","/assets/award-CxnDyhC9.js","/assets/ban-DzQYxPaS.js","/assets/boxes-CO3iazaQ.js","/assets/braces-D9rNDP6Q.js","/assets/brigadirFilters-Bu6D8FYR.js","/assets/broadcastTree-CMjfTqku.js","/assets/building-2-CWpjFITE.js","/assets/calculator-DXGVMsAz.js","/assets/calendar-BoGAJhyq.js","/assets/calendar-days-c1iYHB3G.js","/assets/camera-CctD_HM2.js","/assets/categories-C824o_SV.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-_O6QM20b.js","/assets/chart-line-eh-y_r7S.js","/assets/chart-pie-EosAwovl.js","/assets/chartRange-Dtgl10oh.js","/assets/check-check-BtRvecMR.js","/assets/chevron-left-CNgj8nO2.js","/assets/chevrons-up-down-ruN2Qqf1.js","/assets/circle-CZixoQMf.js","/assets/circle-alert-DdOkL2mB.js","/assets/circle-check-big-kKk-iR1r.js","/assets/circle-dashed-FQklY4Pa.js","/assets/circle-minus-iDN1iS5n.js","/assets/circle-question-mark-DIOgJ35q.js","/assets/circle-slash-IjRc9zQD.js","/assets/circle-user-round-pUr_h_1L.js","/assets/clock-3-Dhuw0bOM.js","/assets/cloud-off-DPvENvGb.js","/assets/cloud-upload-B8WIZmn7.js","/assets/compass-B-POImZA.js","/assets/concernCategories-BGhl175y.js","/assets/copy-BWNf63ci.js","/assets/corner-down-right-BW1lqg6N.js","/assets/createLucideIcon-GP_5ceH3.js","/assets/es-BUyzSXib.js","/assets/external-link-CXLhxBhb.js","/assets/file-clock-pYfVcoEY.js","/assets/file-exclamation-point-CTj7_C_v.js","/assets/flag-DKrz0BIf.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CGmfZCii.js","/assets/hash-DKGqmDyG.js","/assets/hourglass-BwXTfBBw.js","/assets/image-B2OCZHjq.js","/assets/image-off-HvKC6RS1.js","/assets/inbox-sqj0kXY8.js","/assets/index-CQ11BbYp.js","/assets/index-oN3ajqAx.css","/assets/keyboard-B0KPnxG2.js","/assets/languages-ZIyj5H1y.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DGINvWZa.js","/assets/lightbulb-Amg-QGWF.js","/assets/link-2-B-trwr_c.js","/assets/link-2-off-dMz9M8sq.js","/assets/list-ordered-l46G8siB.js","/assets/list-tree-xkMBxwr0.js","/assets/lock-open-Cyk2vt4Q.js","/assets/log-in-Bh5cHaKk.js","/assets/marks-BwnGFRi-.js","/assets/minimize-2-C1buku6X.js","/assets/package-check-B8D_erhP.js","/assets/pencil-2FePF9h1.js","/assets/percent-DVBMpcLx.js","/assets/pin-CaCirluH.js","/assets/pin-off-CBN1nxxq.js","/assets/play-BRIFj8lN.js","/assets/plug-zap-CAr2PN_-.js","/assets/prop-types-sSLiwNIe.js","/assets/radio-DoqDM0Tv.js","/assets/react-apexcharts.esm-DAzrib8h.js","/assets/registers-CwxAqKrf.js","/assets/repeat-CHmmCZip.js","/assets/save-DMZx31XJ.js","/assets/scopeLinks-Bw4IBFh0.js","/assets/scroll-text-DHg8w9-Q.js","/assets/search-x-Cw1rYCyj.js","/assets/segments-BwZ4ZA9R.js","/assets/send-DHSlhb8u.js","/assets/settings-2-DZiCMmk5.js","/assets/shield-TiPks14E.js","/assets/shield-alert-DneYH83J.js","/assets/shield-question-mark-B43jRkh-.js","/assets/siren-BzVia1lB.js","/assets/snowflake-C2n8QjUM.js","/assets/split-DZXM6m_e.js","/assets/square-check-big-D_DtA4K_.js","/assets/star-CdsCqyrS.js","/assets/statusBands-DX32UX_U.js","/assets/store-B_-yocl3.js","/assets/table-2-DzHpzvSj.js","/assets/table-properties-BdTmjl1S.js","/assets/tag-Ap7Ck0p_.js","/assets/timer-off-32uoxtoq.js","/assets/trending-down-BxL6sQ9P.js","/assets/trending-up-BL-kO90m.js","/assets/undo-2-RzGsqz4n.js","/assets/useChartTheme-2-2QNlTL.js","/assets/useElementWidth-DsgKKNlc.js","/assets/useIsMobile-Crdhh9fV.js","/assets/useOpenParam-H7udNJvL.js","/assets/useStatusBands-D2oZOR1l.js","/assets/useUrlScope-fjyF7ynh.js","/assets/user-Cdrhh6wb.js","/assets/user-cog-BoYy41vg.js","/assets/users-D-P34tlp.js","/assets/vfx-4i8dzc6_.js","/assets/video-7oJ_cqgA.js","/assets/wallet-BcKk1vGv.js","/assets/warehouse-DQmsduhB.js","/assets/workflow-DPT29X0b.js","/assets/x-5XLbTzqU.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
