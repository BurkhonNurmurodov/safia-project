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

const BUILD = "2026-10-17T12:41:50.225Z";
const PRECACHE = ["/","/assets/AdminPanel-D8MpZJYi.js","/assets/AnalysisBoard-B1aJEcyM.js","/assets/Arc-Dhh-QWFa.js","/assets/Assistant-BY3-wT3U.js","/assets/BrigadirProfile-DtPOwdNn.js","/assets/BroadcastReceivers-y4MogtHF.js","/assets/BroadcastRecord-DDWZ2NWA.js","/assets/Button-BNMZBIGJ.js","/assets/CatLockNotice-4ghsPqDr.js","/assets/CategoryLegendModal-LYBbWnJf.js","/assets/CellConcerns-BBMemw7D.js","/assets/CellDetails-v7wZWxbj.js","/assets/CellFormModal-DtTnzNbj.js","/assets/CellIdent-BbZV328i.js","/assets/CellLink-BRNK2ob4.js","/assets/Cells-tPGOyXec.js","/assets/ColumnFilter-CxrCOI7F.js","/assets/ColumnsPicker-DBmYELpp.js","/assets/CommentsModal-Ua76G5Cb.js","/assets/ComparisonTable-Dk_7TIdJ.js","/assets/Concerns-b3z7xPGz.js","/assets/CountStepper-BkJ8eGdj.js","/assets/Daily-BUuruM5v.js","/assets/DataTable-PNkutsRX.js","/assets/DateRangePicker--3IE84q9.js","/assets/DayReportView-De8d71Vn.js","/assets/DayStepper-EJ1nqFzM.js","/assets/DifferenceBreakdown-BGcU9ME8.js","/assets/Downtime-zAcl0zag.js","/assets/Education-CKrHtfQB.js","/assets/EducationLesson-kwJ-as-s.js","/assets/EmptyState--g1yBdxn.js","/assets/Exam-CLX5zrD2.js","/assets/FactorySelect-QD6pp6X9.js","/assets/ForeignObjects-Blr-0y2-.js","/assets/Gamification-CefFTOFn.js","/assets/GroupBadge-DjDeu1Df.js","/assets/HeatmapChart-9mDEOAQF.js","/assets/IdleCell-DNw-ShEp.js","/assets/KPICard-DoRoxP3u.js","/assets/Kaizen-DCBqurNF.js","/assets/Kelish-OchQ1xXi.js","/assets/KpiDeltaCard-BMYJtV7R.js","/assets/LangTextInput-BMDlCbuj.js","/assets/Layout-BlDgLRmK.js","/assets/LeaderAppeal-BygRYYfJ.js","/assets/LeaderDayReport-DLoEhXyY.js","/assets/LeaderUnitReport-C602Ho7M.js","/assets/Leaderboard-C1nb7Esf.js","/assets/Leaders-BcwGTBLF.js","/assets/Lightbox-DQdZ9hK-.js","/assets/LiveOverview-B4Xr5466.js","/assets/Login-DJk952H-.js","/assets/NotFound-EpeAcLVZ.js","/assets/Notifications-B6-4IYHF.js","/assets/Overview-YoVlDojv.js","/assets/Pagination-3BygxFTs.js","/assets/PerenaladkaFactTable-B8qpX9xP.js","/assets/PersonCard-_U6f58wk.js","/assets/PlanFulfillment-OKKNg82G.js","/assets/Production-h_fLwqkK.js","/assets/Profile-DCVDUAog.js","/assets/ProofCamera-B-enSDsG.js","/assets/Quality-Dfv4mp3F.js","/assets/RawRows-CAzVLU_3.js","/assets/RequestStateChip-BqTnlqFD.js","/assets/RichTextEditor-DpwCgO4r.js","/assets/SaveState-DKuyzmQS.js","/assets/SearchInput-C8GwZvQT.js","/assets/SeasonalityHeatmap-YB1qR8k8.js","/assets/SegmentedToggle-CSEpis7M.js","/assets/SetupTimes-DBIwZKFO.js","/assets/ShiftDaily-P6gd4aTb.js","/assets/Staff-Dfy1Gd1T.js","/assets/StaffListAtCheck-DV0NLv-Y.js","/assets/StatusBadge-BW3qmu0L.js","/assets/TargetGoal-DPdDHE0M.js","/assets/Targets-B9nCc06W.js","/assets/Tasks-cIVQlswp.js","/assets/TimeWheelPicker-DzxhF23T.js","/assets/Toast-BeNl9lkr.js","/assets/Tooltip-Dt09jPTr.js","/assets/TrendChart-Dv1r049F.js","/assets/TripleSpeedometer-bLF0_g7O.js","/assets/Trudoyomkost-BZyqsIqL.js","/assets/Turnover-Dt-_uR6P.js","/assets/TurnoverBits-DQwCUown.js","/assets/UploadDropzone-B0l4HtfJ.js","/assets/UsersActivity-DcZfmGa4.js","/assets/VerdictBlock-BpGQd2Y_.js","/assets/VfxApiMap-DvAib2vm.js","/assets/VfxDictionaries-BxbLrftK.js","/assets/VfxEmployees-Cr5Fd-Qb.js","/assets/VfxHrMoves-phLJbjaP.js","/assets/VfxJobs-Co-XLtek.js","/assets/VfxPhoto-CUApRaR1.js","/assets/VfxShifts-BLIyqIXN.js","/assets/VfxState-CMzxbLxC.js","/assets/VfxTimebooks-CVOB3Xdy.js","/assets/VfxTimesheet-DqZU5DsP.js","/assets/WatchProgress-nZnUKq1v.js","/assets/WebLogin-C_0-VyQU.js","/assets/WorkerConcerns-5RWuKdLk.js","/assets/Workers-1Xqas3Vb.js","/assets/Zagruzka-n3lh2meq.js","/assets/ZagruzkaCell-DYz5tqoy.js","/assets/api-B3wyXLXd.js","/assets/archive-Cr_s3m0Z.js","/assets/archive-restore-B0Hz3mTA.js","/assets/arrow-down-DVOzTo7W.js","/assets/arrow-down-wide-narrow-C134CM7C.js","/assets/arrow-up-narrow-wide-kO8FnvDY.js","/assets/award-CAjyEj8v.js","/assets/ban-BhI3w0m2.js","/assets/boxes-DxxOYhGl.js","/assets/braces-DsZPG3uY.js","/assets/brigadirFilters-C7B8Knj6.js","/assets/broadcastTree-7zqlHUhD.js","/assets/building-2-CeGCg5rF.js","/assets/calculator-BlLxmrHp.js","/assets/calendar-UbzRHY7O.js","/assets/calendar-days-ff93hqAw.js","/assets/camera-BtvTSos_.js","/assets/categories-By2F7Urd.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BNeDzoiM.js","/assets/chart-line-hesJy9iB.js","/assets/chart-pie-CU8mPBXt.js","/assets/chartRange-BL7Je9YS.js","/assets/check-check-DesbAqKs.js","/assets/chevron-left-BuPeFOyM.js","/assets/chevrons-up-down-W86cKd1f.js","/assets/circle-BoXi_5Qv.js","/assets/circle-alert-C5dwYUby.js","/assets/circle-check-big-Dqpj3vSX.js","/assets/circle-dashed-DLo9VQiO.js","/assets/circle-minus--FVt4UnT.js","/assets/circle-question-mark-D-8WyJEl.js","/assets/circle-slash-LcMj5yrN.js","/assets/circle-user-round-CyfTd8bL.js","/assets/cloud-off-EG0OUuT5.js","/assets/cloud-upload-DaHUzyv4.js","/assets/compass-D5EYvmJs.js","/assets/concernCategories-KFx9FfkA.js","/assets/corner-down-right-DtAwpmk9.js","/assets/createLucideIcon-D0JyyzAV.js","/assets/es-DFuuFUU3.js","/assets/external-link-DcoqVi8c.js","/assets/file-clock-CZDot8AJ.js","/assets/file-exclamation-point-cZH00_Ik.js","/assets/flag-CwNizpA-.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Be1NEgD8.js","/assets/hash-DvGKlAlW.js","/assets/hourglass-BwojBcTV.js","/assets/image-DPKdKbnk.js","/assets/image-off-B9R7qn2r.js","/assets/inbox-D_5MqkbW.js","/assets/index-ByhNoNK_.css","/assets/index-Cvza84_s.js","/assets/keyboard-BcX2hAcx.js","/assets/languages-CK0cYY0v.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-oyZc9YBd.js","/assets/lightbulb-FsN7oh5q.js","/assets/link-2-DUJb7CyM.js","/assets/link-2-off-WS3FUtjc.js","/assets/list-ordered-BuyuMn-H.js","/assets/list-tree-DYvb9GZd.js","/assets/lock-open-B4I3QNTN.js","/assets/log-in-C2bpQ6Yy.js","/assets/marks-BQF4VlZR.js","/assets/minimize-2-BndTwBPW.js","/assets/package-check-BkI8wXkl.js","/assets/pencil-DUTVehJq.js","/assets/percent-DTbFse0X.js","/assets/pin-Cq5cC4Xq.js","/assets/pin-off-DHrsD_XR.js","/assets/play-_1wgyI0f.js","/assets/plug-zap-DxZxB5x6.js","/assets/prop-types-Brouw8aO.js","/assets/radio-0WZJZowz.js","/assets/react-apexcharts.esm-C5wPves8.js","/assets/registers-DaLAzvf5.js","/assets/repeat-CcLq3nQk.js","/assets/save-DXClvS8s.js","/assets/scopeLinks-CTiwjuMi.js","/assets/scroll-text-CDZM1sAY.js","/assets/search-x-8GiU7xY5.js","/assets/segments-C8VGsEn0.js","/assets/send-DGhjKlHd.js","/assets/settings-2-Cl6acnEU.js","/assets/shield-Dgt-kSbq.js","/assets/shield-alert-BJM7_Q5f.js","/assets/shield-question-mark-BPFsh3gm.js","/assets/siren-TwIgBajY.js","/assets/snowflake-Cj0kbhXL.js","/assets/split-BOQf8FzY.js","/assets/square-check-big-BZgwnBdA.js","/assets/star-BBF-Vn5A.js","/assets/statusBands-Axu5xOEp.js","/assets/store-D8Yx3x5q.js","/assets/table-2-B6BfIfmv.js","/assets/table-properties-DSFqY9En.js","/assets/tag-B2q_GKrW.js","/assets/timer-off-B9gCHuYK.js","/assets/trending-down-C8MwAA8f.js","/assets/trending-up-XoNb1LuU.js","/assets/undo-2-dL38O7yj.js","/assets/useChartTheme-617IMKJQ.js","/assets/useElementWidth-BHd8ECUB.js","/assets/useIsMobile-PM2Ez5QF.js","/assets/useOpenParam-lrdpBsnv.js","/assets/useStatusBands-DD4x7M-m.js","/assets/useUrlScope-BTZ2uCi4.js","/assets/user-CPvK120K.js","/assets/user-cog-BQSJaoPu.js","/assets/users-CdZwSxiT.js","/assets/vfx-fxKGHqmx.js","/assets/video-BozFniTf.js","/assets/wallet-T6kj64Ew.js","/assets/warehouse-Cxh1Xpqv.js","/assets/workflow-CSqbKb31.js","/assets/x-B1X3X9-6.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
