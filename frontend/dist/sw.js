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

const BUILD = "2026-10-19T07:14:21.427Z";
const PRECACHE = ["/","/assets/AdminPanel-smVdOHwk.js","/assets/AnalysisBoard-D9D0u7jT.js","/assets/Arc-CQErlP7A.js","/assets/Assistant-CiwZXNdE.js","/assets/BrigadirProfile-CPNDcNyW.js","/assets/BroadcastReceivers-BGRml2Dw.js","/assets/BroadcastRecord-Bvp1BNM0.js","/assets/Button-n9gwpgBe.js","/assets/CatLockNotice-DKys-TWg.js","/assets/CategoryLegendModal-Gn2sX_aH.js","/assets/CellConcerns-Bn3YLEBA.js","/assets/CellDetails-DkV7iN1r.js","/assets/CellFormModal-D2kLjKbG.js","/assets/CellIdent-DqnlogGg.js","/assets/CellLink-CeUVuTWF.js","/assets/Cells-DUaIdcOB.js","/assets/ColumnFilter-DmEwEGOO.js","/assets/ColumnsPicker-Fz5B1g3O.js","/assets/CommentsModal-BET_y6jj.js","/assets/ComparisonTable-CCkceYPu.js","/assets/Concerns-lNfLZeqW.js","/assets/CountStepper-dRuV5UUB.js","/assets/Daily-Bm8JwqhB.js","/assets/DataTable-CryUKrcE.js","/assets/DateRangePicker-BJybpO1P.js","/assets/DayReportView-De1zFw44.js","/assets/DayStepper-5pShfz8v.js","/assets/DifferenceBreakdown-C27i-sVR.js","/assets/Downtime-Frf2XZiR.js","/assets/Education-Dq3qx08X.js","/assets/EducationLesson-DprzzDQO.js","/assets/EmptyState--G06fs4Z.js","/assets/Exam-JnKnocq5.js","/assets/FactorySelect-CNbbcVRw.js","/assets/Gamification-D9MkecRr.js","/assets/GroupBadge-BKYYLbvC.js","/assets/HeatmapChart-BpsJDOaa.js","/assets/IdleCell-CNmWfXpA.js","/assets/KPICard-BT3Ny4EN.js","/assets/Kaizen-okwzvvnx.js","/assets/Kelish-23zKW37g.js","/assets/KpiDeltaCard-BDb5ohRV.js","/assets/LangTextInput-4NxkSegZ.js","/assets/Layout-9sThoruG.js","/assets/LeaderAppeal-D78J7Ltl.js","/assets/LeaderDayReport-n5UGuYHJ.js","/assets/LeaderUnitReport-DRvofbs-.js","/assets/Leaderboard-C0mPuiTK.js","/assets/Leaders-B-u5y-Fn.js","/assets/LeadersKpi-s7LpRG4z.js","/assets/Lightbox-DvcUgpZk.js","/assets/LiveOverview-KcYdE_Zb.js","/assets/Login-mgDYiigy.js","/assets/NotFound-BuIgEDkq.js","/assets/Notifications-WoxMqsqb.js","/assets/Overview-BHWdzF4C.js","/assets/Pagination-CpVOnDLq.js","/assets/PerenaladkaFactTable-B-IHJFNY.js","/assets/PersonCard-DzwkpY9r.js","/assets/PlanFulfillment-CZcosuAg.js","/assets/Production-DLiLpNto.js","/assets/Profile-Cp5fy5C5.js","/assets/ProofCamera-DcC56XlM.js","/assets/ProofPhoto-DfHk5i0v.js","/assets/Quality-BHf86O_j.js","/assets/RawRows-BAMuKFus.js","/assets/RequestStateChip-BrCp-cpU.js","/assets/RichTextEditor-BxgwXWjl.js","/assets/SaveState-BzGNNuZK.js","/assets/SearchInput-CK6AHai7.js","/assets/SeasonalityHeatmap-i4tHEdkw.js","/assets/SegmentedToggle-SirD6-hg.js","/assets/SetupTimes-DNnTPIcu.js","/assets/ShiftDaily-Bqz8HZbv.js","/assets/Staff--m8-xG9H.js","/assets/StaffListAtCheck-rGLefPhD.js","/assets/StatusBadge-CZ34787E.js","/assets/TargetGoal-BPbFfS9_.js","/assets/Targets-nNwrc2VN.js","/assets/Tasks-BAHFlX9c.js","/assets/TimeWheelPicker-CzJ420bB.js","/assets/Toast-DR8irliS.js","/assets/Tooltip-BY38zpoR.js","/assets/TrendChart-DqAawoi5.js","/assets/TripleSpeedometer-CZLkF_Dj.js","/assets/Trudoyomkost-NuGQDjPS.js","/assets/UploadDropzone-DxXJyk96.js","/assets/UsersActivity-B59ZueI7.js","/assets/VerdictBlock-DzgY5Hq9.js","/assets/VfxApiMap-MypFz_72.js","/assets/VfxDictionaries-e8HqAuf-.js","/assets/VfxEmployees-Df-dIOfq.js","/assets/VfxHrMoves-B8YaTOBg.js","/assets/VfxJobs-DOkdIxiF.js","/assets/VfxPhoto-BqFk7wse.js","/assets/VfxShifts-C8VFpuAH.js","/assets/VfxState-C0d5xokN.js","/assets/VfxTimebooks-FmLiHvHL.js","/assets/VfxTimesheet-BQYYszOs.js","/assets/WatchProgress-BnCIZqvO.js","/assets/WebLogin-C2BlV_Qn.js","/assets/Workers-Dy2C7Lro.js","/assets/Zagruzka-B8lEslx7.js","/assets/ZagruzkaCell-BB-mkJjC.js","/assets/api-C-cjKpF3.js","/assets/archive-DdZscsDx.js","/assets/archive-restore-BLfgJc0d.js","/assets/arrow-down-BNRrjjHq.js","/assets/arrow-down-wide-narrow-tVLaT5xh.js","/assets/arrow-up-narrow-wide-YaCxTl7Q.js","/assets/ban-CDHwhuRJ.js","/assets/boxes-B3ilRvUI.js","/assets/braces-BnbTS8qB.js","/assets/brigadirFilters-CAsnfvza.js","/assets/broadcastTree-BUkC6Z00.js","/assets/building-2-CUtFxDwh.js","/assets/calculator-CHjF_Em4.js","/assets/calendar-days-DOlr-S4t.js","/assets/calendar-vB_IlJQR.js","/assets/camera-KtKh_syj.js","/assets/categories-HhtS77b3.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BZSeQwqd.js","/assets/chart-line-DFPgtUMj.js","/assets/chart-pie-BK8dlMwT.js","/assets/chartRange-B84Ykj6v.js","/assets/check-check-z9DvNd0V.js","/assets/chevron-left-h3lTrc54.js","/assets/chevrons-up-down-B8zHj9Qv.js","/assets/circle-CFIcupKH.js","/assets/circle-alert-sQhxGRWw.js","/assets/circle-check-big-C7RkLvfg.js","/assets/circle-dashed-CjFMxK6y.js","/assets/circle-minus-BDiUmoQV.js","/assets/circle-question-mark-BsfUCXVh.js","/assets/circle-slash-CYXvrRDx.js","/assets/circle-user-round-zaWNkMVj.js","/assets/cloud-off-BdlM53md.js","/assets/cloud-upload-D2mEp_F6.js","/assets/compass-pD_rWtO5.js","/assets/concernCategories-B_zuAkZR.js","/assets/corner-down-right-D6R4SN0n.js","/assets/createLucideIcon-CVXGrjSp.js","/assets/es-Ia6X5dlr.js","/assets/external-link-DkrFF872.js","/assets/file-clock-CITVcHEd.js","/assets/file-exclamation-point-DNV7t0CZ.js","/assets/flag-405c52Xe.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DTTsn8M1.js","/assets/hash-Bxb-3Tv1.js","/assets/hourglass-BFgYGdEz.js","/assets/image-BiXByv6L.js","/assets/image-off-DpqD6Kml.js","/assets/inbox-Dj-8CqDY.js","/assets/index-B1im45g6.js","/assets/index-v0EESk-F.css","/assets/keyboard-Df5Uhpc8.js","/assets/languages-D-k_i-uW.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-q8j2j6BX.js","/assets/lightbulb-C9wEYS2c.js","/assets/link-2-QunYYLU7.js","/assets/link-2-off-CmJ06j6G.js","/assets/list-ordered-BLFGsA7M.js","/assets/list-tree-BFNjZV9Y.js","/assets/lock-open-DUxXkCMf.js","/assets/log-in-Bb2EIssV.js","/assets/marks-DVkMDw0L.js","/assets/minimize-2-Bk4XJ_jN.js","/assets/package-check-DbgdoRs8.js","/assets/pencil-CM8gJY72.js","/assets/percent-CPYW2g4S.js","/assets/pin-CpasWch_.js","/assets/pin-off-CdU00Ig8.js","/assets/play-B3X_25Bh.js","/assets/plug-zap-C1ykPUsT.js","/assets/prop-types-BnWw9rza.js","/assets/radio-DJTNwTdL.js","/assets/react-apexcharts.esm-5OTl8fxi.js","/assets/registers-BR5GgsSY.js","/assets/repeat-C7PNHcXM.js","/assets/save-b2Mr9BFy.js","/assets/scopeLinks-BpeRCnq6.js","/assets/scroll-text-hKcwUip5.js","/assets/search-x-CZSkEzBy.js","/assets/segments-DnySpM1o.js","/assets/send-BkemUQ2m.js","/assets/settings-2-B7ugqswA.js","/assets/shield-Ct8Vb7PG.js","/assets/shield-alert-CFHpDjzQ.js","/assets/shield-question-mark-BvEu1m9U.js","/assets/siren-xhrztIeI.js","/assets/snowflake-ma34hqtd.js","/assets/split-Xb6k3y1G.js","/assets/square-check-big-UyCIs24T.js","/assets/star-FhAV4-8C.js","/assets/statusBands-CxIQCGEX.js","/assets/store-DgEj_a0g.js","/assets/table-2-shs8T3pH.js","/assets/table-properties-BQg3XsLq.js","/assets/tag-D6v9QE9r.js","/assets/timer-off-CTfNYB6M.js","/assets/trending-down-CNPzimgF.js","/assets/trending-up-D2PFPXqS.js","/assets/undo-2-7c3oNh8r.js","/assets/useChartTheme-BWoQMqy3.js","/assets/useElementWidth-Cd-bse1v.js","/assets/useIsMobile-D6VB3hUB.js","/assets/useOpenParam-BcAc4qhd.js","/assets/useStatusBands-PrzGxZph.js","/assets/useUrlScope-BF4m3E2h.js","/assets/user-DvjvK0ZQ.js","/assets/user-cog-Ci7JmLHj.js","/assets/user-minus-BT3CX7Uc.js","/assets/users-BRKLt4sT.js","/assets/vfx-DbvDmiVT.js","/assets/video-C4X0Pmmm.js","/assets/wallet-BrR2-qtc.js","/assets/warehouse-B0Kvg5oL.js","/assets/workflow--QNSFK2X.js","/assets/x-CApwYR7k.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
