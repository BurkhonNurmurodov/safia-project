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

const BUILD = "2026-09-30T15:00:10.386Z";
const PRECACHE = ["/","/assets/AdminPanel-YzXRmgp5.js","/assets/AnalysisBoard-BiV_u-6_.js","/assets/Arc-BeXEKKuS.js","/assets/ArcLegacy-DtMrwq8B.js","/assets/AttendanceModal-C60bAha7.js","/assets/BrigadirProfile-D2ryjiD4.js","/assets/BroadcastReceivers-hJGCHj9Y.js","/assets/BroadcastRecord-Bp93Ihxa.js","/assets/CatLockNotice-BJyAWACw.js","/assets/CategoryLegendModal-9zHk-i47.js","/assets/CellConcerns-lHlaJjtZ.js","/assets/CellDetails-DKIDCG5Z.js","/assets/CellFormModal-CcUrOlXK.js","/assets/CellIdent-ClUJKuTx.js","/assets/CellLink-CBNvWzkX.js","/assets/Cells-B3p6wLfE.js","/assets/ColumnFilter-DlVfluqN.js","/assets/ColumnsPicker-BHP-jeg5.js","/assets/CommentsModal-EYMC2ueP.js","/assets/ComparisonTable-DCSZj0mb.js","/assets/Concerns-CJRjf4kP.js","/assets/ConfirmDialog-BQNykK7g.js","/assets/Daily-D6rtCWSV.js","/assets/DataTable-CJewf6VO.js","/assets/DateRangePicker-BnjY13oh.js","/assets/DayReportView-CwXe8Gop.js","/assets/DayStepper-CJFRpQt0.js","/assets/DifferenceBreakdown-mpOoO_jt.js","/assets/Downtime-CdB4cUyY.js","/assets/Education-GHzvb-h4.js","/assets/EducationLesson-Cymr92R0.js","/assets/EmptyState-D98OSg-x.js","/assets/Exam-wBmm4kHr.js","/assets/FactorySelect-D90UWDuR.js","/assets/Gamification-zbHTYl4W.js","/assets/GroupBadge-CK5BniMs.js","/assets/HeatmapChart-CfQyGWa6.js","/assets/IdleCell-BOH8HG4v.js","/assets/KPICard-D-zy7St8.js","/assets/Kaizen-Csw1E0Vx.js","/assets/Kelish-C3mycZaa.js","/assets/KpiDeltaCard-BvIDWqHl.js","/assets/LangTextInput-K7EewXAP.js","/assets/Layout-C3PbpLMb.js","/assets/LeaderAppeal-CzwlDCIh.js","/assets/LeaderDayReport-B0SCGBLB.js","/assets/LeaderUnitReport-CoztHanJ.js","/assets/Leaderboard-Cpc8A9Lr.js","/assets/Leaders-C-zHQ7Ny.js","/assets/Lightbox-xBTkWOpZ.js","/assets/LiveOverview-BBOES9Sv.js","/assets/Login-DhixLu7m.js","/assets/NotFound-DEwFBO6s.js","/assets/Overview-zhvmz26y.js","/assets/Pagination--trA_8zM.js","/assets/PerenaladkaFactTable-DjLCDkoV.js","/assets/PlanFulfillment-CZulBBFe.js","/assets/Production-CnxQLd7K.js","/assets/Profile-Bigrmx1i.js","/assets/ProofCamera-B2Jka1dB.js","/assets/ProofPhoto-D-CmfcHO.js","/assets/Quality-b_ixVZJT.js","/assets/RequestStateChip-CHfmdVmj.js","/assets/RichTextEditor-6b_Hng_N.js","/assets/SaveState-BuqFYggO.js","/assets/SearchInput-yoUsHZIm.js","/assets/SeasonalityHeatmap-CTptMAJN.js","/assets/SegmentedToggle-DGk8o6tC.js","/assets/SetupTimes-D_-xQ2Wl.js","/assets/ShiftDaily-DSB3MDPy.js","/assets/Staff-vAwK4jhi.js","/assets/StatusBadge-CnQiND97.js","/assets/TargetGoal-CtKXUIGW.js","/assets/Targets-BohVVhGT.js","/assets/Tasks-C5nh6DUz.js","/assets/TimeWheelPicker-D2blztee.js","/assets/Tooltip-By8dW1OV.js","/assets/TrendChart-Dz28scqQ.js","/assets/TripleSpeedometer-CR-s2mGt.js","/assets/Trudoyomkost-DT7rFc-K.js","/assets/UploadDropzone-BxfGndua.js","/assets/UsersActivity-WqRx-wzP.js","/assets/VerdictBlock-DaPiKeYa.js","/assets/WatchProgress-3zEs-f3B.js","/assets/WebLogin-XiZ-nJjQ.js","/assets/WorkerConcerns-B-E5F_PP.js","/assets/Workers-8WzbYwPN.js","/assets/Zagruzka-CZxi8NFp.js","/assets/ZagruzkaCell-CLz9Z-F5.js","/assets/api-BPJidryg.js","/assets/archive-Da70ojdH.js","/assets/archive-restore-B5Sgb0p2.js","/assets/arrow-down-1DdFRmAO.js","/assets/arrow-left-CEjqH2jd.js","/assets/arrow-left-right-DXpMvP6q.js","/assets/arrow-up-Depvycnz.js","/assets/arrow-up-narrow-wide-BTZh5njf.js","/assets/arrow-up-right-B5UHQqb9.js","/assets/award-id6R6noo.js","/assets/ban-Bvtejn92.js","/assets/bot-BnwLs0eK.js","/assets/boxes-BdJbFvhl.js","/assets/brigadirFilters-DLJYRPgn.js","/assets/broadcastTree-Di6AUhiF.js","/assets/building-2-BNoNJYYf.js","/assets/calendar-CAaMboUK.js","/assets/calendar-clock-Oi9bUfOf.js","/assets/calendar-days-CdP6j44A.js","/assets/calendar-range-CDA43D-a.js","/assets/camera-D2KrUyaG.js","/assets/categories-C_7ccv_S.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C99O9Nbb.js","/assets/chart-line-0BxPGHvI.js","/assets/chart-pie-B6Co6SLp.js","/assets/chartRange-BqIbZ3K1.js","/assets/chevron-left-DOhPHF-0.js","/assets/chevrons-up-down-DAv4-N_5.js","/assets/circle-DqtNA7cu.js","/assets/circle-check-big-DniURyrk.js","/assets/circle-dot-CriQk8FX.js","/assets/circle-minus-CxqODJoO.js","/assets/circle-slash-ykOTsb7a.js","/assets/circle-user-round-CghnELUX.js","/assets/cloud-off-Ci_IKuol.js","/assets/cloud-upload-C6Ub4f6t.js","/assets/compass-Bhv84u03.js","/assets/concernCategories-DA53thE3.js","/assets/copy-YuVeFlOn.js","/assets/corner-down-right-BDLYKiNg.js","/assets/createLucideIcon-CgpNMLj7.js","/assets/es-BXFj8JFg.js","/assets/exportXlsx-atTf7KHm.js","/assets/external-link-BXUbdLnV.js","/assets/file-clock-DCUeEV3I.js","/assets/file-exclamation-point-DZJdoPe0.js","/assets/file-spreadsheet-ns0ZIEYJ.js","/assets/file-text-YCTpqk7j.js","/assets/flag-9AcHBft_.js","/assets/flame-krKRONU9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DhzmvhDR.js","/assets/hash-BwKkUMxq.js","/assets/history-BIqkQTX0.js","/assets/hourglass-C7gBxcgg.js","/assets/image-Cf73a7dB.js","/assets/image-off-a9WJqoEh.js","/assets/index-DcopkxyX.js","/assets/index-De8gXd1p.css","/assets/key-round-E2ggdp1Y.js","/assets/keyboard-CVY3XMU8.js","/assets/languages-JLY9dllo.js","/assets/layers-BcXSCoOn.js","/assets/lightbulb-C-iDjLxs.js","/assets/link-2-D1ZLceiv.js","/assets/link-2-off-DHB68TFx.js","/assets/list-checks-BbVapWm4.js","/assets/list-ordered-BVMMdg7K.js","/assets/list-tree-DZMFmAY9.js","/assets/lock-open-CZpOkNtI.js","/assets/log-in-8A2n97t3.js","/assets/maximize-2-BNTdZnmy.js","/assets/message-square-Bt9u2i4A.js","/assets/minimize-2-Djor29Ci.js","/assets/package-check-CBnEmV5y.js","/assets/paperclip-BhOu5crE.js","/assets/pencil-BSS_9jS9.js","/assets/percent-E3RD4yv-.js","/assets/personName-CogOuS3K.js","/assets/pin-Btin8Hws.js","/assets/pin-off-CTIgzaFx.js","/assets/play-U-flWoEK.js","/assets/presentation-CCgfqFfj.js","/assets/prop-types-BffxwTTO.js","/assets/radio-Bx8ikn7c.js","/assets/react-apexcharts.esm-CwOL1Uyl.js","/assets/repeat-BxHC1Qlc.js","/assets/rotate-ccw-C6OHCLQl.js","/assets/rotate-cw-78MJOlAG.js","/assets/save-3FzKDsP-.js","/assets/scale-BIrmtEJc.js","/assets/scopeLinks-BBfEfNgB.js","/assets/scroll-text-CTWIsphL.js","/assets/search-x-BnOC1NNY.js","/assets/segments-DrHKk2GD.js","/assets/send-BiaI0bX_.js","/assets/settings-2-8nFhpmUy.js","/assets/shield-BBjutFJ7.js","/assets/shield-alert-BA_fZhX8.js","/assets/shield-check-sH1_h8mS.js","/assets/shield-question-mark-DHHakn8I.js","/assets/siren-DwMytgJr.js","/assets/snowflake-CE4WUwIb.js","/assets/square-BjYG4BoB.js","/assets/square-check-big-CiPDHJD9.js","/assets/star-RTY6pbIn.js","/assets/statusBands-l_s0syF7.js","/assets/store-DEzpkfqY.js","/assets/table-2-DxXVYDaZ.js","/assets/table-properties-4jmJbaCi.js","/assets/tag-BnS7uBEX.js","/assets/timer-off-DGXj-j_N.js","/assets/trending-down-CeJuDu-o.js","/assets/trending-up-rm5uvz63.js","/assets/undo-2-GBsPf6FP.js","/assets/useChartTheme-DJDBk3Ax.js","/assets/useElementWidth-B5t6EIF7.js","/assets/useIsMobile-Bf-bm0hI.js","/assets/useMutation-D9ROgiJw.js","/assets/useStatusBands-C2WSqc6K.js","/assets/useUrlScope-BA6oi4nf.js","/assets/user-BnXR7NUA.js","/assets/user-cog-DQX3M9Jp.js","/assets/user-minus-CgMknMX9.js","/assets/users-ChzVKyVu.js","/assets/video-CgQYoU_H.js","/assets/wallet-CtoGkPa2.js","/assets/warehouse-C970KGF7.js","/assets/zap-B1Kgn_8p.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
