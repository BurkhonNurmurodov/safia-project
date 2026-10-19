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

const BUILD = "2026-10-19T09:50:22.662Z";
const PRECACHE = ["/","/assets/AdminPanel-B5ZyvdDT.js","/assets/AnalysisBoard-D8HUSigf.js","/assets/Arc-CnIsBvHD.js","/assets/Assistant-C1sNCE6q.js","/assets/BrigadirProfile-BiqaQP0V.js","/assets/BroadcastReceivers-CQ_y1ie2.js","/assets/BroadcastRecord-DgWQsHdH.js","/assets/Button-DttS30Jx.js","/assets/CatLockNotice-BlRsWL96.js","/assets/CategoryLegendModal-CJt7o7p5.js","/assets/CellConcerns-D4vNrQVu.js","/assets/CellDetails-DPpN6n2V.js","/assets/CellFormModal-DyI2bnMb.js","/assets/CellIdent-B4UfLKLC.js","/assets/CellLink-DIA32ANj.js","/assets/Cells-CloPCMzn.js","/assets/ColumnFilter-BpEnVK5R.js","/assets/ColumnsPicker-CZ4o7Nea.js","/assets/CommentsModal-D3hww69Z.js","/assets/ComparisonTable-BwVG4rFw.js","/assets/Concerns-C0opWEzd.js","/assets/CountStepper-BTxq2q53.js","/assets/Daily-Dfp-1Scm.js","/assets/DataTable-CS-M1g6f.js","/assets/DateRangePicker-CEMs7ppQ.js","/assets/DayReportView-dP1X83pp.js","/assets/DayStepper-CmIsjw1n.js","/assets/DifferenceBreakdown-DP-nq8cr.js","/assets/Downtime-Qeaj2wb4.js","/assets/Education-CWvm9CCC.js","/assets/EducationLesson-BLWCqMvB.js","/assets/EmptyState-Dh2MSPJx.js","/assets/Exam-DcAGL97M.js","/assets/FactorySelect-BPXDGmYJ.js","/assets/Gamification-FwF0A2O9.js","/assets/GroupBadge-CAE_KQpR.js","/assets/HeatmapChart-B6VnI6lE.js","/assets/IdleCell-CW1uyfKC.js","/assets/KPICard-fGzUseer.js","/assets/Kaizen-B-B4ldR9.js","/assets/Kelish-DSjMWDfQ.js","/assets/KpiDeltaCard-Dc497eQE.js","/assets/LangTextInput-C521RfDd.js","/assets/Layout-CQlJG4FB.js","/assets/LeaderAppeal-CduP1saI.js","/assets/LeaderDayReport-XvbvcXTR.js","/assets/LeaderUnitReport-BLJF4ZLp.js","/assets/Leaderboard-Bf20C21t.js","/assets/Leaders-BJfuWOV6.js","/assets/LeadersKpi-DmKeiaej.js","/assets/Lightbox-Dz3PYffN.js","/assets/LiveOverview-qebe6Ezf.js","/assets/Login-HCYVQGM1.js","/assets/NotFound-BetjTB5t.js","/assets/Notifications-DAdYNMws.js","/assets/Overview-DnRpe_s3.js","/assets/Pagination-BDvC6eQB.js","/assets/PerenaladkaFactTable-DyH4eBp3.js","/assets/PersonCard-EGSC-FLA.js","/assets/PlanFulfillment-D8jIdaLz.js","/assets/Production-BuWwxQZ2.js","/assets/Profile-D-tc5aqO.js","/assets/ProofCamera-wDxxzY7t.js","/assets/ProofPhoto-LCSXt3o8.js","/assets/Quality-CFgdzxcI.js","/assets/RawRows-C3HJ6V5n.js","/assets/RequestStateChip-uCdjcX3q.js","/assets/RichTextEditor-ByEhfIYQ.js","/assets/SaveState-Bf9_wVdi.js","/assets/SearchInput-C7AwUXMn.js","/assets/SeasonalityHeatmap-FY_Nfjmj.js","/assets/SegmentedToggle-DAmXXY1b.js","/assets/SetupTimes-DdPYK5zO.js","/assets/ShiftDaily-DGYPJSBu.js","/assets/Staff-DEqGDxd8.js","/assets/StaffListAtCheck-N7Z4eo-b.js","/assets/StatusBadge-Oj43u0sh.js","/assets/TargetGoal-vbieZBoM.js","/assets/Targets-B1pWhe_z.js","/assets/Tasks-Cfy92YiB.js","/assets/TimeWheelPicker-B7Mt3hHF.js","/assets/Toast-CACppQtU.js","/assets/Tooltip-DRPvJ9Fu.js","/assets/TrendChart-57maRsRc.js","/assets/TripleSpeedometer-BGj53cBq.js","/assets/Trudoyomkost-BYCY04gk.js","/assets/UploadDropzone-Ed0jZoHg.js","/assets/UsersActivity-fXhCSVzC.js","/assets/VerdictBlock-0d9N-3ey.js","/assets/VfxApiMap-BfRO4GZK.js","/assets/VfxDictionaries-8ad75tJg.js","/assets/VfxEmployees-Czh38SfJ.js","/assets/VfxHrMoves-Cbr-uU4z.js","/assets/VfxJobs-Bau-_hcV.js","/assets/VfxPhoto-DgcSdyOd.js","/assets/VfxShifts-VnI4Cyrr.js","/assets/VfxState-Bn06ZGyP.js","/assets/VfxTimebooks-pkIc5g5_.js","/assets/VfxTimesheet-N103EXJ4.js","/assets/WatchProgress-CKGc6bOl.js","/assets/WebLogin-Lx2zKtgR.js","/assets/Workers-BRnQKvxI.js","/assets/Zagruzka-CYvrWtP6.js","/assets/ZagruzkaCell-Fa0mR1PL.js","/assets/api-CU8y2u2N.js","/assets/archive-B9ilfQKX.js","/assets/archive-restore-DLWuzhQz.js","/assets/arrow-down-DKBRlt0r.js","/assets/arrow-down-right-pYjSqqj9.js","/assets/arrow-down-wide-narrow-IIB9c0m3.js","/assets/arrow-up-narrow-wide-Jc7dpcn-.js","/assets/ban-C8B5wnRL.js","/assets/boxes-Ck80xaXl.js","/assets/braces-DwVqTSvB.js","/assets/brigadirFilters-D5QVdBql.js","/assets/broadcastTree-BLKgylSG.js","/assets/building-2-CziVqzCY.js","/assets/calculator-D4prEFnu.js","/assets/calendar-CGUkEMyp.js","/assets/calendar-days-BPt4mlTb.js","/assets/camera-Cmj21Vx3.js","/assets/categories-jG-KSuc0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CjLkBL2U.js","/assets/chart-line-DgvCoeal.js","/assets/chart-pie-CzJZ6DgE.js","/assets/chartRange-Bd_NNJZE.js","/assets/check-check-Cdox_6re.js","/assets/chevron-left-BSoAN5GF.js","/assets/chevrons-up-down-CfeINRON.js","/assets/circle-EHQVD4AP.js","/assets/circle-alert-CQkSChIK.js","/assets/circle-check-big-Ch67ETqp.js","/assets/circle-dashed-DKWu-bYU.js","/assets/circle-minus-ByamgZv4.js","/assets/circle-question-mark-njbbtRr-.js","/assets/circle-slash-Cb7nKLKN.js","/assets/circle-user-round-WKYDtCJg.js","/assets/cloud-off-wvkOU80g.js","/assets/cloud-upload-DQeaUwT8.js","/assets/compass-DJ1bW1Zp.js","/assets/concernCategories-DzxPiS2S.js","/assets/corner-down-right-B2MhREPB.js","/assets/createLucideIcon-Dk415jHE.js","/assets/es-h5JdUfpC.js","/assets/external-link-CMwNlIUE.js","/assets/file-clock-CKRrWeSY.js","/assets/file-exclamation-point-2HgNOjiQ.js","/assets/flag-B2eFr5vd.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Db4gyepw.js","/assets/hash-DPbCUHlI.js","/assets/hourglass-CtqxdOdr.js","/assets/image-DTaxmILD.js","/assets/image-off-XdXdquPF.js","/assets/inbox-Dq3mSVgC.js","/assets/index-DemTQruw.css","/assets/index-HjnPy1m-.js","/assets/keyboard-Ca4kMb0z.js","/assets/languages-Bvj-ZJE6.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CeROOmGS.js","/assets/lightbulb-DEQ95O0N.js","/assets/link-2-BzQETkZ_.js","/assets/link-2-off-BnkRlKLM.js","/assets/list-ordered-Bjtik6h5.js","/assets/list-tree-Cwnb29Xz.js","/assets/lock-open-DsqaB3HP.js","/assets/log-in-BLelSwCU.js","/assets/marks-BjqkKHeZ.js","/assets/minimize-2-CjbeGa5v.js","/assets/package-check-CEZAGtBa.js","/assets/pencil-DeTke1aG.js","/assets/percent-DyJyazZk.js","/assets/pin-CYlyahAp.js","/assets/pin-off-Oumko6jT.js","/assets/play-GSWn-SeL.js","/assets/plug-zap-CLelFqm_.js","/assets/prop-types-BadPCznO.js","/assets/radio-CltQUia5.js","/assets/react-apexcharts.esm-cFBkjkG1.js","/assets/registers-Cg-nEXuR.js","/assets/repeat-1fF7YctJ.js","/assets/save-DqTXrQ_U.js","/assets/scopeLinks-BIDRD89f.js","/assets/scroll-text-BwTPozUA.js","/assets/search-x-4f7GUggA.js","/assets/segments-CoFgt7nR.js","/assets/send-C7rrrmq8.js","/assets/settings-2-BWz8dmPv.js","/assets/shield-Cg3_MIb3.js","/assets/shield-alert-1JY6oXLf.js","/assets/shield-question-mark-Bx2ZG3re.js","/assets/siren-DOtWcDZ1.js","/assets/snowflake-AtvA0zeW.js","/assets/split-SydZIK9Y.js","/assets/square-check-big-BAjLpjey.js","/assets/star-CCOVmWfV.js","/assets/statusBands-BJRu4Xb8.js","/assets/store-CjthrJky.js","/assets/table-2-C-KD51UL.js","/assets/table-properties-Dugt4h2I.js","/assets/tag-6JgGoU-C.js","/assets/timer-off-CcNzwhGK.js","/assets/trending-down-D3ChNpai.js","/assets/trending-up-CFTkryqd.js","/assets/undo-2-DlHv5oZS.js","/assets/useChartTheme-kIbNFfmA.js","/assets/useElementWidth-DtEbLlpY.js","/assets/useIsMobile-BcJP98hD.js","/assets/useOpenParam-GG9vdPkd.js","/assets/useStatusBands-B4mMN5Ah.js","/assets/useUrlScope-DEZq2hU9.js","/assets/user-Gn82u008.js","/assets/user-cog-DErO6bY9.js","/assets/user-minus-DZAB7RgO.js","/assets/users-BfhYVbtD.js","/assets/vfx-dzRja5Oz.js","/assets/video-114Pm2vw.js","/assets/wallet-HljMIYMN.js","/assets/warehouse-Dued_UwQ.js","/assets/workflow-zmpdY_59.js","/assets/x-BQLjS_ov.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
