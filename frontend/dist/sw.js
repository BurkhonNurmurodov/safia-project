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

const BUILD = "2026-10-17T12:35:41.024Z";
const PRECACHE = ["/","/assets/AdminPanel-D8QN_Tnd.js","/assets/AnalysisBoard-D-ZXk7Kx.js","/assets/Arc-ByMkTx72.js","/assets/Assistant-BxcygarI.js","/assets/BrigadirProfile-CV8H2ZZB.js","/assets/BroadcastReceivers-BkfII_z1.js","/assets/BroadcastRecord-1hqrl-IB.js","/assets/Button-loBafQwx.js","/assets/CatLockNotice-BR5OrkLG.js","/assets/CategoryLegendModal-CiN3Sx_P.js","/assets/CellConcerns-wA_a8nPk.js","/assets/CellDetails-Cvrtc-Kz.js","/assets/CellFormModal-D1HMv0Na.js","/assets/CellIdent-DSYPp0Zd.js","/assets/CellLink-DGhCc5IS.js","/assets/Cells-BGFhLL9k.js","/assets/ColumnFilter-CrzrUGz0.js","/assets/ColumnsPicker-C5Kx4IXH.js","/assets/CommentsModal-BClxeeFg.js","/assets/ComparisonTable-CZeGuR0o.js","/assets/Concerns-kuiU-LI6.js","/assets/CountStepper-0lR-AI3F.js","/assets/Daily-D-e1s8xh.js","/assets/DataTable-CgewJFka.js","/assets/DateRangePicker-BgTy8EgL.js","/assets/DayReportView-CUvBpGLa.js","/assets/DayStepper-BN2DvjNv.js","/assets/DifferenceBreakdown-B52KQzeM.js","/assets/Downtime-Bi7tM0JG.js","/assets/Education-mZE5vlNq.js","/assets/EducationLesson-Bhookh2u.js","/assets/EmptyState-C04qpOsm.js","/assets/Exam-qympOkzi.js","/assets/FactorySelect-daNMCcXz.js","/assets/ForeignObjects-BZU_hWb7.js","/assets/Gamification-CFzm1JhA.js","/assets/GroupBadge-DoyF5KHT.js","/assets/HeatmapChart-D1r8l5LD.js","/assets/IdleCell-CSZbfMk-.js","/assets/KPICard-BQ8gRzR9.js","/assets/Kaizen-DxwX9NJg.js","/assets/Kelish-BBCgVpjQ.js","/assets/KpiDeltaCard-CL_o7WU5.js","/assets/LangTextInput-MATM5W_q.js","/assets/Layout-ueWvXo3_.js","/assets/LeaderAppeal-Bs1xFfZT.js","/assets/LeaderDayReport-2KdRd_Pk.js","/assets/LeaderUnitReport-BekBnqkN.js","/assets/Leaderboard-BYd2mgfa.js","/assets/Leaders-CCzb9gDh.js","/assets/Lightbox-CCxu_T_S.js","/assets/LiveOverview-CLVTQK_m.js","/assets/Login-DsTHHB8t.js","/assets/NotFound-BGs11-DM.js","/assets/Notifications-C0k1m_Mg.js","/assets/Overview-Cl5dXR7A.js","/assets/Pagination-DtuyjREU.js","/assets/PerenaladkaFactTable-BehKf1cO.js","/assets/PersonCard-BGdKsz2f.js","/assets/PlanFulfillment-BPDemEJv.js","/assets/Production-kIKGAdXC.js","/assets/Profile-Bx8hUkL6.js","/assets/ProofCamera-CSmO1p-D.js","/assets/Quality-CBFCoDto.js","/assets/RawRows-Bpmsf3cN.js","/assets/RequestStateChip-BWVX1cRE.js","/assets/RichTextEditor-DktzA25x.js","/assets/SaveState-D5lNNuPh.js","/assets/SearchInput-Cus9Q7EQ.js","/assets/SeasonalityHeatmap-ztlv5NLO.js","/assets/SegmentedToggle-DIJ1XpU2.js","/assets/SetupTimes-b4w49E3n.js","/assets/ShiftDaily-ax5DEBNr.js","/assets/Staff-BuiWtvy7.js","/assets/StaffListAtCheck-iVAutykz.js","/assets/StatusBadge-CzZeDgW3.js","/assets/TargetGoal-C3gwEka3.js","/assets/Targets-Crz-TUI6.js","/assets/Tasks-CvS1FI3D.js","/assets/TimeWheelPicker-DuMGs_Bq.js","/assets/Toast-XYUIe9ZR.js","/assets/Tooltip-rw1SZLZx.js","/assets/TrendChart-bZZdWEWs.js","/assets/TripleSpeedometer-Bnau6D-1.js","/assets/Trudoyomkost-CGMr4NZa.js","/assets/Turnover-DTZVQ0zT.js","/assets/TurnoverBits-DcXDGJFR.js","/assets/UploadDropzone-CoZ1UBrf.js","/assets/UsersActivity-DvYfM3Vx.js","/assets/VerdictBlock-Be9LAvwb.js","/assets/VfxApiMap-ClnECQ2C.js","/assets/VfxDictionaries--MrJNpab.js","/assets/VfxEmployees-D9mpPxDX.js","/assets/VfxHrMoves-BntGG73P.js","/assets/VfxJobs-0d2HeX3a.js","/assets/VfxPhoto-BzD14o7T.js","/assets/VfxShifts-D_v9cY0m.js","/assets/VfxState-C9z3dKGM.js","/assets/VfxTimebooks-Dfb9Uxk9.js","/assets/VfxTimesheet-DTQPZ-1F.js","/assets/WatchProgress-DbXhhjiV.js","/assets/WebLogin-BRjSyFiV.js","/assets/WorkerConcerns-D7QKhUmP.js","/assets/Workers-BCmGmQEf.js","/assets/Zagruzka-pBdPrO-U.js","/assets/ZagruzkaCell-CZlgSXQj.js","/assets/api-ZzLTc-q6.js","/assets/archive-BKFJQH0R.js","/assets/archive-restore-Dg8b6XNm.js","/assets/arrow-down-BrSD_B5D.js","/assets/arrow-down-wide-narrow-B_IQv9SN.js","/assets/arrow-up-narrow-wide-Dr_wav4D.js","/assets/award-CkuwatVp.js","/assets/ban-BXBEEERj.js","/assets/boxes-H-xfX7Ik.js","/assets/braces-foRAjlVu.js","/assets/brigadirFilters-DYdQsL4P.js","/assets/broadcastTree-E0hMdyLt.js","/assets/building-2-Boa-IDw7.js","/assets/calculator-De7TaZpO.js","/assets/calendar-MiOVuzoM.js","/assets/calendar-days-BvCZSLZK.js","/assets/camera-C6nkc8cR.js","/assets/categories-CbG4lZLd.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CB7tMLkG.js","/assets/chart-line-DCE9j6KM.js","/assets/chart-pie-CxUcYvEp.js","/assets/chartRange-BU2LQuuy.js","/assets/check-check-BXgo0jZy.js","/assets/chevron-left-on86thUA.js","/assets/chevrons-up-down-DgaAro8X.js","/assets/circle-Bboh6McS.js","/assets/circle-alert-RByaYmde.js","/assets/circle-check-big-DGM21qug.js","/assets/circle-dashed-DaVGp3Nt.js","/assets/circle-minus-sfiIS688.js","/assets/circle-question-mark-6knq13OY.js","/assets/circle-slash-vLZ3Mi0D.js","/assets/circle-user-round-DFboPekZ.js","/assets/cloud-off-D_w2opjD.js","/assets/cloud-upload-BDBsfW8s.js","/assets/compass-BXi0nw6t.js","/assets/concernCategories-D-jMZC8_.js","/assets/corner-down-right-Df7yGo10.js","/assets/createLucideIcon-BnoD3I1m.js","/assets/es-CszbZFwg.js","/assets/external-link-DtE8zBmW.js","/assets/file-clock-CRjvhE2F.js","/assets/file-exclamation-point-aa-s-haX.js","/assets/flag-DOGh7f--.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Wady0vSt.js","/assets/hash-CDFOZ2tO.js","/assets/hourglass-DhzfJQmP.js","/assets/image-BtWtqwH0.js","/assets/image-off-C-jga4PY.js","/assets/inbox-CQOq-VR4.js","/assets/index-ByhNoNK_.css","/assets/index-DXr_1CGx.js","/assets/keyboard-BxNRsAvj.js","/assets/languages-D_8ZZ969.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Dttm01Gr.js","/assets/lightbulb-DXFBwYFl.js","/assets/link-2-DE2K67tO.js","/assets/link-2-off-3TN7MJJG.js","/assets/list-ordered-BIiz9vwJ.js","/assets/list-tree-dTf54BtM.js","/assets/lock-open-CBnD0Zj4.js","/assets/log-in-ccrimt2A.js","/assets/marks-Bw32xvxc.js","/assets/minimize-2-DlBxwHCW.js","/assets/package-check-B3dWJp-9.js","/assets/pencil-Ce812cWg.js","/assets/percent-DavZ_POG.js","/assets/pin-CHI252XM.js","/assets/pin-off-Dm7m6r60.js","/assets/play-CQk5Rd7B.js","/assets/plug-zap-DWvUxm23.js","/assets/prop-types-DPlSqwLf.js","/assets/radio-DKkcTLf3.js","/assets/react-apexcharts.esm-DA5Jyscn.js","/assets/registers-DWZlFAeM.js","/assets/repeat-CqK7wVln.js","/assets/save-ChQNbyYX.js","/assets/scopeLinks-Q89WnCWW.js","/assets/scroll-text-DsIMo_Sw.js","/assets/search-x-BYW0Ai8S.js","/assets/segments-Da2yRfG6.js","/assets/send-D6gkFKR9.js","/assets/settings-2-BiUGS9Wf.js","/assets/shield-CkqGuhRq.js","/assets/shield-alert-DaDcYcpZ.js","/assets/shield-question-mark-ngJhHMRL.js","/assets/siren-D352miDL.js","/assets/snowflake-BHdNCJlT.js","/assets/split-CnyGl562.js","/assets/square-check-big-y7o7S8Di.js","/assets/star-BpbjVS5f.js","/assets/statusBands-DKybrV1H.js","/assets/store-Ct7cw9ZU.js","/assets/table-2-C3Jng-rf.js","/assets/table-properties-CmnBG6sO.js","/assets/tag-rD9FniAU.js","/assets/timer-off-B0WoZUju.js","/assets/trending-down-DtvvLN0B.js","/assets/trending-up-DygN8pmy.js","/assets/undo-2-Cl78GaUn.js","/assets/useChartTheme-ZcizsBsE.js","/assets/useElementWidth-DVSey0ko.js","/assets/useIsMobile-DqF18myv.js","/assets/useOpenParam-BnUKlkaO.js","/assets/useStatusBands-COEnHDFn.js","/assets/useUrlScope-6Rug-n7C.js","/assets/user-Gpdp5mmm.js","/assets/user-cog-B0pHZQs_.js","/assets/users-DpnapNah.js","/assets/vfx-CIleIMYr.js","/assets/video-Drc4oCRW.js","/assets/wallet-BAB28lQo.js","/assets/warehouse-B4VUloyr.js","/assets/workflow-DfuBAhrS.js","/assets/x-xPQFTz9n.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
