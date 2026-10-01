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

const BUILD = "2026-10-01T12:17:13.100Z";
const PRECACHE = ["/","/assets/AdminPanel-Cj0BHPFf.js","/assets/AnalysisBoard-b_S6eQ8h.js","/assets/Arc-D6WAJa2j.js","/assets/ArcLegacy-WjvlLQAZ.js","/assets/BrigadirProfile-CTAribHZ.js","/assets/BroadcastReceivers-DaXjKa1N.js","/assets/BroadcastRecord-FKCpN6HP.js","/assets/CatLockNotice-Cy4uSa8I.js","/assets/CategoryLegendModal-CLQljQzz.js","/assets/CellConcerns-Cg5nPJI2.js","/assets/CellDetails-CioW3B6S.js","/assets/CellFormModal-BL0NwWpy.js","/assets/CellIdent-DyyIon68.js","/assets/CellLink-Cz2rYFVR.js","/assets/Cells-HQhOlZQ6.js","/assets/ColumnFilter-BUJt32jh.js","/assets/ColumnsPicker-S_vP2svV.js","/assets/CommentsModal-CrywrC9L.js","/assets/ComparisonTable-CfifNjXp.js","/assets/Concerns-QKtGgqtX.js","/assets/ConfirmDialog-DpL8Nvt2.js","/assets/Daily-C1ghJURp.js","/assets/DataTable-CrScdLwb.js","/assets/DateRangePicker-N9QkDmzb.js","/assets/DayReportView-CZI8pNB5.js","/assets/DayStepper-JvZ4b5R8.js","/assets/DifferenceBreakdown-Dfg0tA48.js","/assets/Downtime-D_qgotKk.js","/assets/Education-CAiZU6Dk.js","/assets/EducationLesson-CtmsUgGk.js","/assets/EmptyState-_vPvkROr.js","/assets/Exam-BcsE7AQI.js","/assets/FactorySelect-CLG4cFhK.js","/assets/Gamification-BFXlXpsU.js","/assets/GroupBadge-BFDr8_K4.js","/assets/HeatmapChart-Dvh3BwQT.js","/assets/IdleCell-Bf-U0Mei.js","/assets/KPICard-B_aaUOln.js","/assets/Kaizen-DGf_fkOi.js","/assets/Kelish-C-C2TjJk.js","/assets/KpiDeltaCard-DaW0g5Ob.js","/assets/LangTextInput-DhRBD-t1.js","/assets/Layout-dGbKmRXc.js","/assets/LeaderAppeal-BUFu1aEm.js","/assets/LeaderDayReport-BpfEUGGx.js","/assets/LeaderUnitReport-B15vtq9T.js","/assets/Leaderboard-QYy5u6R3.js","/assets/Leaders-B1kIRt2q.js","/assets/Lightbox-DlAw21Tz.js","/assets/LiveOverview-BAJ0qqrR.js","/assets/Login-Dc_FK3dF.js","/assets/NotFound-BLZfl0rj.js","/assets/Overview-CPljGVue.js","/assets/Pagination-C3aac8k_.js","/assets/PerenaladkaFactTable-D0bbwj2u.js","/assets/PlanFulfillment-BG31MbD-.js","/assets/Production-SEBjrgxa.js","/assets/Profile-gBLpHjS-.js","/assets/ProofCamera-B1pPuYiS.js","/assets/ProofPhoto-1Gnc8HT0.js","/assets/Quality-DcwmTrdW.js","/assets/RequestStateChip-DT0oRmt_.js","/assets/RichTextEditor-ONCDDhko.js","/assets/SaveState-B3kB4_Df.js","/assets/SearchInput-BtesGXvW.js","/assets/SeasonalityHeatmap-BdYSIIS0.js","/assets/SegmentedToggle-C9AyWRvT.js","/assets/SetupTimes-CxRcM1KJ.js","/assets/ShiftDaily-vPkNQJEC.js","/assets/Staff-C_sWlbLE.js","/assets/StaffLive-BfVi7q-K.js","/assets/StatusBadge-CEdBP0f7.js","/assets/TargetGoal-CC1SeZs0.js","/assets/Targets-TMj4GyHV.js","/assets/Tasks-CxXusIuq.js","/assets/TimeWheelPicker-DoDcUf9Z.js","/assets/Tooltip-Be0b4d93.js","/assets/TrendChart-BR5e7rON.js","/assets/TripleSpeedometer-D3URTSAz.js","/assets/Trudoyomkost-BjIsMPDX.js","/assets/UploadDropzone-DjIh-0mU.js","/assets/UsersActivity-DdTNrDL3.js","/assets/VerdictBlock-BZK0qWrC.js","/assets/WatchProgress-DsGu5uzo.js","/assets/WebLogin-DhECxVw-.js","/assets/WorkerConcerns-BAiKwjB2.js","/assets/Workers-MQ5l2ot7.js","/assets/Zagruzka-CpLHv0PY.js","/assets/ZagruzkaCell-CPp65_3v.js","/assets/api-D2O-nzt5.js","/assets/archive-DEbjh0h-.js","/assets/archive-restore-BdIfgvMl.js","/assets/arrow-down-2dTDJmoS.js","/assets/arrow-left-CTCtjY_S.js","/assets/arrow-left-right-DMdQ4f53.js","/assets/arrow-right-left-DHhtkIc-.js","/assets/arrow-up-CJzyr4OW.js","/assets/arrow-up-narrow-wide-FllXqWN_.js","/assets/arrow-up-right-C8rEZLof.js","/assets/award-jAWYZ4rn.js","/assets/ban-BjqxaPXL.js","/assets/bot-D_xNAFuo.js","/assets/boxes-CGfFSRR6.js","/assets/brigadirFilters-Ov8xgKIV.js","/assets/broadcastTree-NB2sASgb.js","/assets/building-2-xGKkmZzB.js","/assets/calendar-B-fr9x0D.js","/assets/calendar-clock-DiyjMB7E.js","/assets/calendar-days-BM79xO_T.js","/assets/calendar-range-CAJmUH9e.js","/assets/camera-NPRHv8cw.js","/assets/categories-L4drACe9.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column--uoMmanF.js","/assets/chart-line-CwDwzUL5.js","/assets/chart-pie-CAJnmWKw.js","/assets/chartRange-CeM1lroe.js","/assets/chevron-left-CMgDLs3I.js","/assets/chevrons-up-down-CVuDnT4I.js","/assets/circle-check-big-DfzKlc7n.js","/assets/circle-dot-C6q0gyFV.js","/assets/circle-minus-DE824qlk.js","/assets/circle-mkQjku4J.js","/assets/circle-slash-DEDOvhaa.js","/assets/circle-user-round-C1k1cfI7.js","/assets/cloud-off-CRpyBwqZ.js","/assets/cloud-upload-gJw8SfFJ.js","/assets/compass-Cnwcz0SI.js","/assets/concernCategories-Cxw9WHWe.js","/assets/copy-YEFINc0v.js","/assets/corner-down-right-DMlDo__a.js","/assets/createLucideIcon-BxdeZggH.js","/assets/es-CcMFViNA.js","/assets/exportXlsx-DwfrFhDl.js","/assets/external-link-BOQpk9Pk.js","/assets/file-clock-DZS8jLv2.js","/assets/file-exclamation-point-zYg6UScS.js","/assets/file-spreadsheet-CfZ-T0TF.js","/assets/file-text-COv8i1LW.js","/assets/flag-COBCXjYU.js","/assets/flame-D7JtFvy6.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CzD2RuKH.js","/assets/hash-BuEtYGhZ.js","/assets/history-CV2rW6Fq.js","/assets/hourglass-DkEvIxcj.js","/assets/id-card-BnYKVv7r.js","/assets/image-BPIObmqW.js","/assets/image-off-FR8R0klz.js","/assets/index-B9L3jRk3.js","/assets/index-CtD5yoCZ.css","/assets/key-round-BLyHCXVX.js","/assets/keyboard-D26QvKfH.js","/assets/languages-C8mivom0.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Cr80deTR.js","/assets/lightbulb-BTXQg-fm.js","/assets/link-2-Dhu_p8qa.js","/assets/link-2-off-yBek_N1b.js","/assets/list-checks-BRxiMwwY.js","/assets/list-ordered-BiFILZOE.js","/assets/list-tree-PiH1R6kd.js","/assets/lock-open-BECikJFM.js","/assets/log-in-BUK8WTqc.js","/assets/maximize-2-DHPzTyZc.js","/assets/message-square-Cdv7e13L.js","/assets/minimize-2-FPXxKHes.js","/assets/package-check-COwLCGWx.js","/assets/paperclip-Cz0l9M1L.js","/assets/pencil-wiINMSs_.js","/assets/percent-C4W1NWoJ.js","/assets/personName-CogOuS3K.js","/assets/pin-CJvXCciW.js","/assets/pin-off-DJNF7nx9.js","/assets/play-D28uPZ77.js","/assets/plug-zap-CykHUS8B.js","/assets/presentation-CBcagMrh.js","/assets/prop-types-CkPc6Vos.js","/assets/radio-d6dU5l6t.js","/assets/react-apexcharts.esm-CzjhVDTq.js","/assets/repeat-DcvM0oek.js","/assets/rotate-ccw-eZgvRPvW.js","/assets/rotate-cw-9q_mr11C.js","/assets/save-CAjU_R-L.js","/assets/scale-DXzsGD58.js","/assets/scopeLinks-CQwDFtgF.js","/assets/scroll-text-CU8AH9E7.js","/assets/search-x-Ba-Q9u0y.js","/assets/segments-CfHXvHjN.js","/assets/send-tuawoglB.js","/assets/settings-2-DkR5u56q.js","/assets/shield-alert-BCnERlk-.js","/assets/shield-bHuKw50H.js","/assets/shield-check-CLbz-cNO.js","/assets/shield-question-mark-DN288PBS.js","/assets/siren-CxVXGzsP.js","/assets/snowflake-C_fgKJA7.js","/assets/split-CzeI40UX.js","/assets/square-D9Yu_nV4.js","/assets/square-check-big-m7_pwS2j.js","/assets/star-CzGG98cV.js","/assets/statusBands-2pqaqoeA.js","/assets/store-CgYGp046.js","/assets/table-2-CtWbi3HV.js","/assets/table-properties-eOZhQjGL.js","/assets/tag-t28WZTm2.js","/assets/timer-off-_GKfCM8D.js","/assets/trending-down-DypAWJPh.js","/assets/trending-up-BpEm7jy6.js","/assets/undo-2-DvPGUY6P.js","/assets/useChartTheme-D6tB9UR-.js","/assets/useElementWidth-CyEfDy8l.js","/assets/useIsMobile-CeA_Hr4T.js","/assets/useMutation-COHLta2I.js","/assets/useStatusBands-zMTox13g.js","/assets/useUrlScope-BybapRRi.js","/assets/user-D-Ut2yp_.js","/assets/user-cog-B4kHoXLZ.js","/assets/user-minus-BLK9cwD1.js","/assets/users-DBpaCeaG.js","/assets/video-EbA0HSS3.js","/assets/wallet-DxJgn6vq.js","/assets/warehouse-Bl95E2yi.js","/assets/zap-Dnq-VZiQ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
