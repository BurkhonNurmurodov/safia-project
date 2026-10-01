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

const BUILD = "2026-10-01T09:32:47.236Z";
const PRECACHE = ["/","/assets/AdminPanel-8H55v3As.js","/assets/AnalysisBoard-BiOXPSP7.js","/assets/Arc-BJXxZ9jx.js","/assets/ArcLegacy-BBfpBIYe.js","/assets/BrigadirProfile-UgzrkN8o.js","/assets/BroadcastReceivers-B3Z9x4SU.js","/assets/BroadcastRecord-DvtmulPS.js","/assets/CatLockNotice-CrXeUZfc.js","/assets/CategoryLegendModal-C5TtnkdN.js","/assets/CellConcerns-DRL8fIWe.js","/assets/CellDetails-CKWXN4wh.js","/assets/CellFormModal-DbkPmW3u.js","/assets/CellIdent-xz05H7iV.js","/assets/CellLink-DlPeK5XU.js","/assets/Cells-CXAhPrhv.js","/assets/ColumnFilter-bgkJMd1v.js","/assets/ColumnsPicker-CPTm_7ZV.js","/assets/CommentsModal-DXwSKOCO.js","/assets/ComparisonTable-CL1YTnYE.js","/assets/Concerns-BHR7RzSw.js","/assets/ConfirmDialog-B0AVYqj9.js","/assets/Daily-Cv3jXkH4.js","/assets/DataTable-DHz5bK9j.js","/assets/DateRangePicker-CShr78Rz.js","/assets/DayReportView-mW5PPvGk.js","/assets/DayStepper-Dgs1bQwv.js","/assets/DifferenceBreakdown-C10lBrJ4.js","/assets/Downtime-B1_W9hh3.js","/assets/Education-CKWx_JsH.js","/assets/EducationLesson-Der4PWAP.js","/assets/EmptyState-CGVELT_M.js","/assets/Exam-DHttZyQD.js","/assets/FactorySelect-DfEWIuH7.js","/assets/Gamification-BJsVrW4j.js","/assets/GroupBadge-C2hQkidX.js","/assets/HeatmapChart-CBCd0uw9.js","/assets/IdleCell-D0OawGV3.js","/assets/KPICard-cSoRhgED.js","/assets/Kaizen-Bry6qkkJ.js","/assets/Kelish-DkIrWUTz.js","/assets/KpiDeltaCard-z78pas0U.js","/assets/LangTextInput-DY5dK-dV.js","/assets/Layout-D-N58OVY.js","/assets/LeaderAppeal-8hhs7UZx.js","/assets/LeaderDayReport-DRfUCrAr.js","/assets/LeaderUnitReport-DUiEvyq8.js","/assets/Leaderboard-FCb6cVqc.js","/assets/Leaders-BDfqDzsn.js","/assets/Lightbox-BB0E3xkb.js","/assets/LiveOverview-BYxzzq-j.js","/assets/Login-GkhvyObA.js","/assets/NotFound-QH-8lJKO.js","/assets/Overview-ByQF-gBB.js","/assets/Pagination-CuR2lfpG.js","/assets/PerenaladkaFactTable-BMGrl_if.js","/assets/PlanFulfillment-CbXm8dgg.js","/assets/Production-CwrFBZSy.js","/assets/Profile-a08Joqwa.js","/assets/ProofCamera-BaLQ1oVm.js","/assets/ProofPhoto-B55qfiql.js","/assets/Quality-BfnJItSA.js","/assets/RequestStateChip-CNPBBZaF.js","/assets/RichTextEditor-DsmPkyyx.js","/assets/SaveState-BY-IsDxI.js","/assets/SearchInput-CwWWqIzL.js","/assets/SeasonalityHeatmap-CvGjRXoG.js","/assets/SegmentedToggle-BY0SzhHR.js","/assets/SetupTimes-BoWEGJjm.js","/assets/ShiftDaily-ks6P0DZ7.js","/assets/Staff-MhRrjSDE.js","/assets/StaffLive-ABFw3baj.js","/assets/StatusBadge-DBc7lUCg.js","/assets/TargetGoal-Bjx674R3.js","/assets/Targets-DlgbkZPQ.js","/assets/Tasks-D5gy-r0C.js","/assets/TimeWheelPicker-8CSQNEtk.js","/assets/Tooltip-DwHmCSIb.js","/assets/TrendChart-DgBEYLcA.js","/assets/TripleSpeedometer-DKGz2dsj.js","/assets/Trudoyomkost-C5X-kuHm.js","/assets/UploadDropzone-oLukx2JA.js","/assets/UsersActivity-B96gGTYS.js","/assets/VerdictBlock-Dk0Kj3OU.js","/assets/WatchProgress-BGdPpCKY.js","/assets/WebLogin-B-xdLKud.js","/assets/WorkerConcerns-B40FWPUG.js","/assets/Workers-DhT8OSKh.js","/assets/Zagruzka-Dx1qh9UJ.js","/assets/ZagruzkaCell-CW34ziQu.js","/assets/api-CIsKz9BW.js","/assets/archive-BcKdsh7b.js","/assets/archive-restore-CZNVKUYR.js","/assets/arrow-down-DrlF_CGR.js","/assets/arrow-left-B2mbTyHr.js","/assets/arrow-left-right-D-WZvmEK.js","/assets/arrow-right-left-C5T9Mw7D.js","/assets/arrow-up-narrow-wide-DkTjhxXy.js","/assets/arrow-up-right-CrQtyh9-.js","/assets/arrow-up-xO1NrHt0.js","/assets/award-BML9rYgy.js","/assets/ban-COZebqqs.js","/assets/bot-CJJpxxjT.js","/assets/boxes-BdG1QvQx.js","/assets/brigadirFilters-B6t05FXG.js","/assets/broadcastTree-Bv-_he4d.js","/assets/building-2-B0osRpXV.js","/assets/calendar-BbBkqXP_.js","/assets/calendar-clock-DwfVbkxk.js","/assets/calendar-days-DJpr912u.js","/assets/calendar-range-kePl_wlR.js","/assets/camera-BsqBSWBu.js","/assets/categories-4XgAF0O2.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-dIWNvcy1.js","/assets/chart-line-BTCDLG7e.js","/assets/chart-pie-BSDcX5ql.js","/assets/chartRange-FdgYJmbb.js","/assets/chevron-left-B4XI2Wfe.js","/assets/chevrons-up-down-DZtd2a9R.js","/assets/circle-B9Mk9fMs.js","/assets/circle-check-big-WupSwI4_.js","/assets/circle-dot-CR1oOJa7.js","/assets/circle-minus-DrcjPpfK.js","/assets/circle-slash-CT23iQcb.js","/assets/circle-user-round-BiuGQe_3.js","/assets/cloud-off-BOUE10Rl.js","/assets/cloud-upload-DwzMYW5i.js","/assets/compass-Q1xgBHtP.js","/assets/concernCategories-DQU3PNja.js","/assets/copy-BC6NjFij.js","/assets/corner-down-right-CoUxZh6T.js","/assets/createLucideIcon-Xaj_6U8p.js","/assets/es-BSt6-6vb.js","/assets/exportXlsx-B0Nx9IpO.js","/assets/external-link-CX3NPDzY.js","/assets/file-clock-KucU6Dgj.js","/assets/file-exclamation-point-BIusNyaU.js","/assets/file-spreadsheet-Bss9FwZj.js","/assets/file-text-JL3MyCe_.js","/assets/flag-eWk7MDcI.js","/assets/flame-C2CVhgKe.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BHNrDdDh.js","/assets/hash-ArLEfFQt.js","/assets/history-CSDn42u8.js","/assets/hourglass-Cmg_dEF7.js","/assets/id-card-DqXhkYhJ.js","/assets/image-dQJiA9Rb.js","/assets/image-off-DZQjTC_i.js","/assets/index-6rNv2tEv.css","/assets/index-D99DrClE.js","/assets/key-round-CTtadDtv.js","/assets/keyboard-Hw1R_EzC.js","/assets/languages-ZvmZGiZM.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-ZKqcQDe7.js","/assets/lightbulb-D57AFl72.js","/assets/link-2-DePc3ofv.js","/assets/link-2-off-Bn2mRu34.js","/assets/list-checks-Bgohv7qA.js","/assets/list-ordered-D0m9mJsc.js","/assets/list-tree-CwodgZpi.js","/assets/lock-open-D3jIown9.js","/assets/log-in-COOmRkVF.js","/assets/maximize-2-DsA3vBuj.js","/assets/message-square-C0FL38Gv.js","/assets/minimize-2-CNhO1LNZ.js","/assets/package-check-Dc0bW-iR.js","/assets/paperclip-Y8LVT2CQ.js","/assets/pencil-CB1TK_jr.js","/assets/percent-ChccMjNP.js","/assets/personName-CogOuS3K.js","/assets/pin-CaNsNv8H.js","/assets/pin-off-Cmywtfju.js","/assets/play-FlI3RsvF.js","/assets/plug-zap-Bf9PDY7k.js","/assets/presentation-BOsocXPl.js","/assets/prop-types-C6Z1QTB0.js","/assets/radio-tVD6_s3l.js","/assets/react-apexcharts.esm-D63zwMUi.js","/assets/repeat-DvbPNpkF.js","/assets/rotate-ccw-CrsUlpeJ.js","/assets/rotate-cw-DfAa0xgN.js","/assets/save-D7sUmRss.js","/assets/scale-B273-WlU.js","/assets/scopeLinks-CuYBEASD.js","/assets/scroll-text-CHpw2O0e.js","/assets/search-x-DHKoxXoe.js","/assets/segments-CzFhRfxR.js","/assets/send-BtymvS9t.js","/assets/settings-2-PLH9fxiM.js","/assets/shield-DprbA_6H.js","/assets/shield-alert-BoLRDuew.js","/assets/shield-check-CZtOQRIm.js","/assets/shield-question-mark-DUOWDN-c.js","/assets/siren-pEBGXS6i.js","/assets/snowflake-D4x229SQ.js","/assets/split-8uUkCsIo.js","/assets/square-DSYHypu3.js","/assets/square-check-big-Cn4iqQIn.js","/assets/star-AdC6-xPE.js","/assets/statusBands-Dg_u18DE.js","/assets/store-2wd12G27.js","/assets/table-2-IjZUwi_7.js","/assets/table-properties-Dvdj2DHz.js","/assets/tag-BOkb3d9I.js","/assets/timer-off-D3ZHJO51.js","/assets/trending-down-DgWZ_SFS.js","/assets/trending-up-BxEQJ_AP.js","/assets/undo-2-Duahd7VD.js","/assets/useChartTheme-h0l-g6-B.js","/assets/useElementWidth-DSFySL8z.js","/assets/useIsMobile-woKFS8wT.js","/assets/useMutation-BJAY7EIY.js","/assets/useStatusBands-CZeZGLrv.js","/assets/useUrlScope-vIgwAb3G.js","/assets/user-DmB_4k68.js","/assets/user-cog-BqDUiJ_J.js","/assets/user-minus-CCkY3zik.js","/assets/users-DT461v6m.js","/assets/video-C5KAIiZX.js","/assets/wallet-BEP6h6Us.js","/assets/warehouse-BZG6fU-c.js","/assets/zap-Bk-nYMHH.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
