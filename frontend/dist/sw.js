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

const BUILD = "2026-09-30T08:10:53.927Z";
const PRECACHE = ["/","/assets/AdminPanel-Bph2WA4J.js","/assets/AnalysisBoard-D6xaNVfb.js","/assets/Arc-BwjrG4Gt.js","/assets/ArcLegacy-DzLerpE3.js","/assets/AttendanceModal-D1LNbmWa.js","/assets/BrigadirProfile-CmeeRuEs.js","/assets/BroadcastReceivers-CO6DApxh.js","/assets/BroadcastRecord-D41bVNqY.js","/assets/CatLockNotice-zNIPuk3y.js","/assets/CategoryLegendModal-D5SEDth-.js","/assets/CellConcerns-DlPbTXiA.js","/assets/CellDetails-DVFgwUqf.js","/assets/CellFormModal-ODyJNqne.js","/assets/CellLink-B7Me1x-I.js","/assets/Cells-BkS2lMje.js","/assets/ColumnFilter-Cek9aBtq.js","/assets/ColumnsPicker-DhfOx1Ul.js","/assets/CommentsModal-Damyf7Wk.js","/assets/ComparisonTable-6jA4vbDC.js","/assets/Concerns-Bb-nsoEm.js","/assets/ConfirmDialog-DaoKDhMR.js","/assets/Daily-DwoLyGUU.js","/assets/DataTable-Cu3olg89.js","/assets/DateRangePicker-CTVBBnaQ.js","/assets/DayReportView-F3LRyM9F.js","/assets/DayStepper-Cr5W21FQ.js","/assets/DifferenceBreakdown-EWPrph0s.js","/assets/Downtime-CQRWSrYc.js","/assets/Education-oDGucAEY.js","/assets/EducationLesson-C8TL3t0g.js","/assets/EmptyState-DhCU4QS_.js","/assets/Exam-CPySsUkw.js","/assets/FactorySelect-D-B5xr0F.js","/assets/Gamification-DCCpJ9Zm.js","/assets/GroupBadge-C9uToUjF.js","/assets/HeatmapChart-CuaBG6_Q.js","/assets/IdleCell-ClflEBHW.js","/assets/KPICard-DeXwkbh0.js","/assets/Kaizen-DXgrZfxM.js","/assets/Kelish-C5CdvrHh.js","/assets/KpiDeltaCard-LMDS_dHr.js","/assets/LangTextInput-BZIlVm82.js","/assets/Layout-DtnHLe-T.js","/assets/LeaderAppeal-DG-6BSga.js","/assets/LeaderDayReport-Dy_GxNOO.js","/assets/LeaderUnitReport-BXmMNGeb.js","/assets/Leaderboard-CAAA1kL9.js","/assets/Leaders-BadAfDvV.js","/assets/Lightbox-BJDVjuCw.js","/assets/LiveOverview-q3fF99wn.js","/assets/Login-D4_N7zMP.js","/assets/NotFound-Cvs0Ii7N.js","/assets/Overview-D8uNHF4s.js","/assets/Pagination-C5Pq9GXA.js","/assets/PerenaladkaFactTable-DkBdaT1O.js","/assets/PlanFulfillment-8QEIBBRK.js","/assets/Production-0dBcQCyP.js","/assets/Profile-DlrALd3A.js","/assets/ProofCamera-BJSoVOXx.js","/assets/ProofPhoto-B3CETiQ8.js","/assets/Quality-DN6DhHNh.js","/assets/RequestStateChip-BoG_U7Kr.js","/assets/RichTextEditor-D5mM6xHn.js","/assets/SaveState-Brwn2ajH.js","/assets/SearchInput-Dpzxb5dC.js","/assets/SeasonalityHeatmap-2i1lz01C.js","/assets/SegmentedToggle-CIYAZLe7.js","/assets/SetupTimes-BE22j4ka.js","/assets/ShiftDaily-m1XYPYEq.js","/assets/Staff-DVolGkwo.js","/assets/StatusBadge-Du3_8pC8.js","/assets/TargetGoal-DX4JSUp7.js","/assets/Targets-2q-rjQWF.js","/assets/Tasks-DViMj1NG.js","/assets/TimeWheelPicker-DCuXvc4O.js","/assets/Tooltip-5g3s29vo.js","/assets/TrendChart-K0QGYJ2g.js","/assets/TripleSpeedometer-RbZWv8c1.js","/assets/Trudoyomkost-B6xHnci9.js","/assets/UploadDropzone-DMCNlreK.js","/assets/UsersActivity-BG2_BeXb.js","/assets/VerdictBlock-BzftDcC-.js","/assets/WatchProgress-BR712hNQ.js","/assets/WebLogin-DIekQVuF.js","/assets/WorkerConcerns-ZBFvD3ni.js","/assets/Workers-CWCi4RHh.js","/assets/Zagruzka-DSrq_X6d.js","/assets/ZagruzkaCell-BaKUlSZ4.js","/assets/api-Bbz2GiRu.js","/assets/archive-BZGaQ9Kg.js","/assets/archive-restore-Dq_mp7ij.js","/assets/arrow-down-5qbHmqjZ.js","/assets/arrow-left-DHSQLc2W.js","/assets/arrow-left-right-YcXsw0BI.js","/assets/arrow-up-KZJ5VZQC.js","/assets/arrow-up-narrow-wide-CIkIE1aP.js","/assets/arrow-up-right-B1UW292L.js","/assets/award-Jky3TKtd.js","/assets/ban-Db8QrWpT.js","/assets/bot-CUJmuPpP.js","/assets/boxes-B2tnttpj.js","/assets/brigadirFilters-BMuljTP-.js","/assets/broadcastTree-DewY8n1k.js","/assets/building-2-0tjX3Q0q.js","/assets/calendar-BvmQxUsS.js","/assets/calendar-clock-DeRzSfiA.js","/assets/calendar-days-5eqbgZC8.js","/assets/calendar-range-CkS6VTPx.js","/assets/camera-DcR40-d5.js","/assets/categories-BjpPuEjA.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dz0bCEQp.js","/assets/chart-line-OgAzGtY0.js","/assets/chart-pie-DHoj_mx_.js","/assets/chartRange-CijlXKtS.js","/assets/chevron-left-CZVPmfY9.js","/assets/chevrons-up-down-CGT-gzyC.js","/assets/circle-DSa577_n.js","/assets/circle-check-big-BoPmZ1lP.js","/assets/circle-dot-CXrDAAqL.js","/assets/circle-minus-Dq83G73a.js","/assets/circle-slash-CA79xfMw.js","/assets/circle-user-round-CMGSLX4K.js","/assets/cloud-off-KHKqMkeL.js","/assets/cloud-upload-ccKnDmTF.js","/assets/compass-BAC-ihUv.js","/assets/concernCategories-LnAP0Ib6.js","/assets/copy-qAT7t1km.js","/assets/corner-down-right-DmGy4mTo.js","/assets/createLucideIcon-anYjUL0p.js","/assets/es-DZFeehtu.js","/assets/exportXlsx-C37IXOAB.js","/assets/external-link-CKsk7Lp9.js","/assets/file-clock-Qy2-teuO.js","/assets/file-exclamation-point-B6pmvc4F.js","/assets/file-spreadsheet-BwP8-491.js","/assets/file-text-D2K4evYS.js","/assets/flag-Ls8hQv5k.js","/assets/flame-502QM-F0.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CTNBBOo1.js","/assets/hash-VapIXKNO.js","/assets/history-CHyY6DpY.js","/assets/hourglass-DHsb8i44.js","/assets/image-4_8pGdUt.js","/assets/image-off-D2MvPaqU.js","/assets/index-BghOQ10u.css","/assets/index-fYZX1QGO.js","/assets/key-round-De1Z3SnW.js","/assets/keyboard-BdEPtJ0F.js","/assets/languages-B23gyyYg.js","/assets/layers-CkV8Dk9c.js","/assets/lightbulb-DMVWlZmo.js","/assets/link-2-D9_zTxsZ.js","/assets/link-2-off-DPDipHLP.js","/assets/list-checks-DvvQaEib.js","/assets/list-ordered-DGuhBH7M.js","/assets/list-tree-7U3b-VJc.js","/assets/lock-open-DoGoDWCF.js","/assets/log-in-CE-AxbjY.js","/assets/maximize-2-BfmhcVQJ.js","/assets/message-square-DlnxrgqG.js","/assets/minimize-2-CwviQ_tI.js","/assets/package-check-Bz8Kd7b6.js","/assets/paperclip-hEyuhJF2.js","/assets/pencil-B1AjfcgE.js","/assets/percent-BRrmTjcY.js","/assets/personName-CogOuS3K.js","/assets/pin-BZWLlUFx.js","/assets/pin-off-BkfXFjRT.js","/assets/play-Bby2ojHa.js","/assets/presentation-D0U02OO6.js","/assets/prop-types-DsgocNed.js","/assets/radio-WE2AH4Ez.js","/assets/react-apexcharts.esm-CNbvC2U-.js","/assets/repeat-D6yzq-XF.js","/assets/rotate-ccw-D59XSSyx.js","/assets/rotate-cw-Z9ycSK0e.js","/assets/save-CFxm0kQx.js","/assets/scale-Bymxd9iG.js","/assets/scopeLinks-jpq8DY0-.js","/assets/scroll-text-c99ZCR0a.js","/assets/search-x-DjQXrBKc.js","/assets/segments-IMDf_it8.js","/assets/send-DZ1xKQ5n.js","/assets/settings-2-BsY3cYXl.js","/assets/shield-1Az_1UIw.js","/assets/shield-alert-DTLiYI1p.js","/assets/shield-check-BzgtIh9w.js","/assets/shield-question-mark-C0XmVKqT.js","/assets/siren-DXKYZ-nP.js","/assets/snowflake-DMwrOECe.js","/assets/square-D-N_cHE5.js","/assets/square-check-big-C_oPkClQ.js","/assets/star-B2bs9qIT.js","/assets/statusBands-B4pWn_nL.js","/assets/store-CyxBkA4o.js","/assets/table-2-BhV1vxwu.js","/assets/table-properties-BgDO5L-1.js","/assets/tag-C7PTREQ5.js","/assets/timer-off-CCyEP-MJ.js","/assets/trending-down-CbVSj5FL.js","/assets/trending-up-DIDGYvRw.js","/assets/undo-2-D4pdSm3G.js","/assets/useChartTheme-BtxbkNAT.js","/assets/useElementWidth-CphOIraz.js","/assets/useIsMobile-htZIBGFL.js","/assets/useMutation-DFJ3LTFg.js","/assets/useStatusBands-CIdpxs_l.js","/assets/useUrlScope-CCl4LWHo.js","/assets/user-0D1XiZw7.js","/assets/user-cog-C0vzkNL7.js","/assets/user-minus-CV3fOWPt.js","/assets/users-Bv5QmvqU.js","/assets/video-DkUXgA7v.js","/assets/wallet-C8uuJtgy.js","/assets/warehouse-CKCIkmNH.js","/assets/zap-DrjGGPcW.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
