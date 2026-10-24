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

const BUILD = "2026-10-24T11:21:13.776Z";
const PRECACHE = ["/","/assets/AdminPanel-Dk1GyzZU.js","/assets/AnalysisBoard-Ck_Vt7Fy.js","/assets/Arc-DR0RYsE4.js","/assets/Assistant-Bh2cj3Ih.js","/assets/BrigadirProfile-B8NyKcPl.js","/assets/BroadcastReceivers-DOhn06oe.js","/assets/BroadcastRecord-Dad5aS_b.js","/assets/Button-DD2NHxh9.js","/assets/CatLockNotice-B0MSjRN4.js","/assets/CategoryLegendModal-CdOyhaFA.js","/assets/CellConcerns-1eviWfBd.js","/assets/CellDetails-1KakTUuh.js","/assets/CellFormModal-dYs5B03Q.js","/assets/CellIdent-D7S3Z0pl.js","/assets/CellLink-DfJwf_20.js","/assets/Cells-Ccvl85mN.js","/assets/ColumnFilter-DRszlLqM.js","/assets/ColumnsPicker-zChjPRo6.js","/assets/CommentsModal-5kdvyqTr.js","/assets/ComparisonTable-FYnY1NPo.js","/assets/Concerns-oRkDm7Pd.js","/assets/CountStepper-lc29zMH_.js","/assets/Daily-D52-OG-D.js","/assets/DataTable-DirAdZJ0.js","/assets/DateRangePicker-CYhHE8eG.js","/assets/DayReportView-CEbTZpJO.js","/assets/DayStepper-cFOvoICF.js","/assets/DayStrip-B3F1X7q3.js","/assets/DifferenceBreakdown-DU5XOTBR.js","/assets/Downtime-DqJ5uA5-.js","/assets/Education-BIsLFvQT.js","/assets/EducationLesson-B4H7-w0o.js","/assets/EmptyState-4O9Xuro-.js","/assets/Exam-CSy1weIk.js","/assets/FactorySelect-DZ95gbXd.js","/assets/Gamification-KpiUnEAv.js","/assets/GroupBadge-D6EDxoa6.js","/assets/HeatmapChart-BUV3w7aR.js","/assets/IdleCell-4zP4hlP4.js","/assets/KPICard-BMXyrcyN.js","/assets/Kaizen-CKauuvNG.js","/assets/Kelish-Bw0A62A_.js","/assets/KpiDeltaCard-B42B7trY.js","/assets/LangTextInput-CJepMdxd.js","/assets/Layout-BmefWT55.js","/assets/LeaderAppeal-DDWvNh_6.js","/assets/LeaderDayReport-DqKWtQTO.js","/assets/LeaderUnitReport-BHXlh_Pd.js","/assets/Leaderboard-BiyDsjlD.js","/assets/Leaders-BBKB2u1e.js","/assets/LeadersKpi-CAQiqPRR.js","/assets/Lightbox-SGjkLkfN.js","/assets/LiveOverview-DH3kD2r1.js","/assets/Login-CqA83pq8.js","/assets/NotFound-D0iQj0He.js","/assets/Notifications-DPNBkexY.js","/assets/Ontime-Dhy0Hatn.js","/assets/Overview-D9VhxXpg.js","/assets/Pagination-C8r5etUb.js","/assets/PerenaladkaFactTable-BR7fcKGI.js","/assets/PersonCard-C25WpMv_.js","/assets/PlanFulfillment-DnIxVYCw.js","/assets/Production-D0xWiO0s.js","/assets/Profile-lxzzeGjy.js","/assets/ProofCamera-DJ8yNC0g.js","/assets/ProofPhoto-B2PIWwVe.js","/assets/Quality-DIpCGPy_.js","/assets/RawRows-BTgdc7ij.js","/assets/RequestStateChip-R_LygMEa.js","/assets/RichTextEditor-CxhETrSB.js","/assets/SaveState-BBozIocD.js","/assets/SearchInput-DepW8Ekq.js","/assets/SeasonalityHeatmap-Cv_EooMm.js","/assets/SegmentedToggle-BAMNzmV1.js","/assets/SetupTimes-DwPDTyg3.js","/assets/ShiftDaily-C-6QaK_a.js","/assets/Staff-Bk005Ur5.js","/assets/StaffListAtCheck-CdIeQfQR.js","/assets/StatusBadge-BzigYEWk.js","/assets/StatusBandsModal-CRViD62q.js","/assets/TargetGoal-RtS0H99J.js","/assets/Targets-BtJmWBcr.js","/assets/Tasks-KneWovNA.js","/assets/TimeWheelPicker-0GNpI1Ve.js","/assets/Toast-DD9cQm-M.js","/assets/Tooltip-CL3of0WS.js","/assets/TrendChart-DFYqFMCL.js","/assets/TripleSpeedometer-5h2QxSCC.js","/assets/Trudoyomkost-B0Gezw5B.js","/assets/UploadDropzone-CNvipRkr.js","/assets/UsersActivity-Dw-_Q3Fd.js","/assets/VerdictBlock-BywlP7EX.js","/assets/VfxApiMap-CGGtZURr.js","/assets/VfxDictionaries-B-PpyoHC.js","/assets/VfxEmployees-UqZgqZHz.js","/assets/VfxHrMoves-D3fteFmh.js","/assets/VfxJobs-CPfY2t-9.js","/assets/VfxPhoto-B1CFuPSe.js","/assets/VfxShifts-B3cJ19IO.js","/assets/VfxState-DBqJZCn_.js","/assets/VfxTimebooks-DXDLnsRD.js","/assets/VfxTimesheet-Dc12XlzL.js","/assets/WatchProgress-DZ9yCBvm.js","/assets/WebLogin-CWzyuGDl.js","/assets/Workers-CV6TQlR_.js","/assets/Zagruzka-CysLXGZt.js","/assets/ZagruzkaCell-CJ6lr8ev.js","/assets/api-BFm7MSgf.js","/assets/archive-Cs5JzNVY.js","/assets/archive-restore-eGYquCnJ.js","/assets/arrow-down-AYDvZAH7.js","/assets/arrow-down-right-BPcp97jO.js","/assets/arrow-down-wide-narrow-BBtloHZj.js","/assets/arrow-up-narrow-wide-DciBuatE.js","/assets/ban-BlBgJxCp.js","/assets/boxes-B4Jn14w6.js","/assets/braces-OBk4gECt.js","/assets/brigadirFilters-BoTKTAwE.js","/assets/broadcastTree-CW8VKZPG.js","/assets/building-2-DaNraaqA.js","/assets/calendar-Dc7c9gDl.js","/assets/calendar-days-4CkFL71r.js","/assets/camera-OKu03wwd.js","/assets/categories-D3Fy_trR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BXwgFuKw.js","/assets/chart-line-CBfwhVrj.js","/assets/chart-pie-CMmZ7rlq.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-bTVCyRhi.js","/assets/chevron-left-BCbVKNu8.js","/assets/chevrons-up-down-BOKFSjGI.js","/assets/circle-D0v4yBqF.js","/assets/circle-alert-DSo-vlTC.js","/assets/circle-check-big-DeyaE1wW.js","/assets/circle-dashed-Bq2jDCs4.js","/assets/circle-minus-Brp51VFH.js","/assets/circle-question-mark-nxrdlyCb.js","/assets/circle-slash-DbrHHzGi.js","/assets/circle-user-round-Ctmp65Qm.js","/assets/cloud-off-BmXMNpGd.js","/assets/cloud-upload-DhbtLCKl.js","/assets/compass-CZUjy645.js","/assets/concernCategories-CBnc5l6y.js","/assets/corner-down-right-B68oL91W.js","/assets/createLucideIcon-DdhAUb3f.js","/assets/en-CFXzWcvY.js","/assets/es-Dtgc5NM1.js","/assets/external-link-qhrwtcqx.js","/assets/file-clock-BEnwnRrx.js","/assets/file-exclamation-point-DTurxvXA.js","/assets/flag-BwApUl_M.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DE7ed0uW.js","/assets/funnel-1YoUK-X0.js","/assets/hash-BgEKc5og.js","/assets/hourglass-DtAnNs1z.js","/assets/image-B5dMVNbI.js","/assets/image-off-VMVupjD_.js","/assets/inbox-jKmaln60.js","/assets/index-B-xlMnEH.css","/assets/index-DNSSZzj1.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-i6Zx59e_.js","/assets/languages-dE4h5_hR.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B5MLXAOU.js","/assets/leaderBoard-DTxVMMya.js","/assets/lightbulb-BlAwGhud.js","/assets/link-2-D8OmBfn_.js","/assets/link-2-off-CqTP-Tgt.js","/assets/list-ordered-lPFtuGAq.js","/assets/list-tree-CcyYHaeU.js","/assets/lock-open-BzQWrCF1.js","/assets/log-in-BpQfNUIZ.js","/assets/map-pin-B7pYTlUE.js","/assets/marks-BmjWM8ae.js","/assets/minimize-2-Dw1sCuIM.js","/assets/package-check-_ojcsq6w.js","/assets/pencil-CpXPFRfp.js","/assets/percent-CXVnilHL.js","/assets/pin-DaKCg6_X.js","/assets/pin-off-O1OGnVX6.js","/assets/play-B5BXQSRj.js","/assets/plug-zap-D9JkxXHi.js","/assets/prop-types-RD3fbola.js","/assets/radio-KNk8EScw.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-4htEMGqG.js","/assets/repeat-B9Z_em8g.js","/assets/ru-AOzi0FZu.js","/assets/save-Bm8wrteu.js","/assets/scopeLinks-DfeQCQIh.js","/assets/scroll-text-Bnc9jeO8.js","/assets/search-x-DhDSopDZ.js","/assets/segments-D5Uiedtv.js","/assets/send-BjuKepWL.js","/assets/settings-2-BrBxRyhd.js","/assets/shield-BXgQKKvD.js","/assets/shield-alert-BtzCZAht.js","/assets/shield-question-mark-eCMAZ3aU.js","/assets/sigma-DbQ2JGnG.js","/assets/siren-BhigSuhZ.js","/assets/snowflake-DljRxv6Q.js","/assets/split-CP3iDYXX.js","/assets/square-check-big-BAzZl9Lc.js","/assets/star-CE26iExB.js","/assets/statusBands-DVBZcBq3.js","/assets/store-DiGY5XzR.js","/assets/table-2-B1DQqDX-.js","/assets/table-properties-B2wwZTAh.js","/assets/tag-DB3I43g1.js","/assets/timer-off-kghCu1vz.js","/assets/translations-pULXVyjU.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-xHh0spQ4.js","/assets/trending-up-BHvMaLYr.js","/assets/undo-2-PNzuzoi0.js","/assets/useChartTheme-CeKfMPp7.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-eNBbPcvZ.js","/assets/useStatusBands-BrjxzVSw.js","/assets/useUrlScope-DhL2-0EK.js","/assets/user-D4-b8jFy.js","/assets/user-cog-BGhEov5b.js","/assets/user-minus-PKls7c7i.js","/assets/users-DT0pI55y.js","/assets/uz-BvIzYSLQ.js","/assets/uz_cyrl-BykRBgOS.js","/assets/vfx-S5UW_yl4.js","/assets/video-Doiyr1FO.js","/assets/wallet-B_T5Fx4l.js","/assets/warehouse-MgxjPUcA.js","/assets/workflow-CxOFiDEu.js","/assets/x-Cn6pJ0NO.js","/assets/zap-d-rEz_4D.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
