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

const BUILD = "2026-10-05T15:30:12.748Z";
const PRECACHE = ["/","/assets/AdminPanel-BB8HaNuR.js","/assets/AnalysisBoard-BQa5BmGr.js","/assets/Arc-BhmXe_jF.js","/assets/BrigadirProfile-DUqLZidK.js","/assets/BroadcastReceivers-CWMC5qJE.js","/assets/BroadcastRecord-CUydR3Aw.js","/assets/Button-BrkmcjoU.js","/assets/CatLockNotice-CN0HOYyZ.js","/assets/CategoryLegendModal-CNiVplWs.js","/assets/CellConcerns-GmNe-Dbf.js","/assets/CellDetails-NPsFbzG5.js","/assets/CellFormModal-BjBqderI.js","/assets/CellIdent-CTZumJV7.js","/assets/CellLink-DNDfCV--.js","/assets/Cells-Dtg-UCqg.js","/assets/ColumnFilter-mrw1M3DC.js","/assets/ColumnsPicker-DQwnsHpS.js","/assets/CommentsModal-DJgRt_0t.js","/assets/ComparisonTable-B--QovIN.js","/assets/Concerns-x8n-UFFU.js","/assets/Daily-COzPgpAH.js","/assets/DataTable-ZIgXt4jb.js","/assets/DateRangePicker-Coq6shtL.js","/assets/DayReportView-DQjhUlFm.js","/assets/DayStepper-JJhn0zs0.js","/assets/DifferenceBreakdown-C_yBbPOx.js","/assets/Downtime-Dm7Lob-x.js","/assets/Education-DW12tB6o.js","/assets/EducationLesson-5sivcpMT.js","/assets/EmptyState-DOk0pu5m.js","/assets/Exam-jQazHqEa.js","/assets/FactorySelect-jo0fte7c.js","/assets/Gamification--p0lhf93.js","/assets/GroupBadge-DuNmX7DA.js","/assets/HeatmapChart-O0m_Jjse.js","/assets/IdleCell-Da30REaf.js","/assets/KPICard-OGaBePcV.js","/assets/Kaizen-CxOfjd5_.js","/assets/Kelish-BDy1mH99.js","/assets/KpiDeltaCard-Cec8psJX.js","/assets/LangTextInput-BW4kEOeh.js","/assets/Layout-DmUuOqEV.js","/assets/LeaderAppeal-DuYw0k_8.js","/assets/LeaderDayReport-B24G17fl.js","/assets/LeaderUnitReport-BhC_BK6t.js","/assets/Leaderboard-DchgaVLi.js","/assets/Leaders-kte8ylDb.js","/assets/Lightbox-BvJzNyp8.js","/assets/LiveOverview-DY-5uast.js","/assets/Login-_tH2pTE7.js","/assets/NotFound-C3VNVhp8.js","/assets/Notifications-BHC2m_9k.js","/assets/Overview-BNFKmU6m.js","/assets/Pagination-4iInx3sa.js","/assets/PerenaladkaFactTable-BFub9cIm.js","/assets/PersonCard-D3RkBA0E.js","/assets/PlanFulfillment-Uj6fdtQa.js","/assets/Production-BAtxgT93.js","/assets/Profile-CrrJ-bP_.js","/assets/ProofCamera-CKHCfQtO.js","/assets/ProofPhoto-CjzcgNRn.js","/assets/Quality--V0TVSqs.js","/assets/RawRows-B6kdapC_.js","/assets/RequestStateChip-fePSgHP4.js","/assets/RichTextEditor-DAqofqqH.js","/assets/SaveState-BJBVCbCl.js","/assets/SearchInput-D--S09u9.js","/assets/SeasonalityHeatmap-HXQQb3Ha.js","/assets/SegmentedToggle-DSJcIC5e.js","/assets/SetupTimes-BDJf9IBL.js","/assets/ShiftDaily-t6wb6dMg.js","/assets/Staff-B14R1Mi-.js","/assets/StaffLive-dYJns4ZT.js","/assets/StatusBadge-BgNWt6eW.js","/assets/TargetGoal-bfeYRdpV.js","/assets/Targets-DcdF2jZA.js","/assets/Tasks-DIAIRvib.js","/assets/TimeWheelPicker-DoiBBH4W.js","/assets/Toast-Dfecu8TL.js","/assets/Tooltip-BDYDoNXt.js","/assets/TrendChart-Rur9XN0x.js","/assets/TripleSpeedometer-DxP8X53L.js","/assets/Trudoyomkost-sAifKTam.js","/assets/Turnover-Dhoy2HkB.js","/assets/UploadDropzone-BkNxSl0w.js","/assets/UsersActivity-DKzYe4ZQ.js","/assets/VerdictBlock-DUQ5LfOC.js","/assets/VfxApiMap-C3YyXvkI.js","/assets/VfxDictionaries-CuzmdEhU.js","/assets/VfxEmployees-CDB3oSGH.js","/assets/VfxHrMoves-CQaRbiCi.js","/assets/VfxJobs-DFZdT2YY.js","/assets/VfxPhoto-CRmPus7T.js","/assets/VfxShifts-DCu0aLB9.js","/assets/VfxState-BI1m4VT3.js","/assets/VfxTimebooks-DMaQZuXz.js","/assets/VfxTimesheet-CDcXnJ5X.js","/assets/WatchProgress-CQL25DMl.js","/assets/WebLogin-Dqz8Gz5m.js","/assets/WorkerConcerns-pkwEmkmw.js","/assets/Workers-DWVPgvza.js","/assets/Zagruzka-DytyVDtA.js","/assets/ZagruzkaCell-Dty_UhR2.js","/assets/api-qE_3wZMl.js","/assets/archive-CITrvwWK.js","/assets/archive-restore-DsE2XkJC.js","/assets/arrow-down-BNSgTE-v.js","/assets/arrow-left-DRXYoGrt.js","/assets/arrow-up-BQKyh6P1.js","/assets/arrow-up-narrow-wide-Boq0PFHg.js","/assets/arrow-up-right-t846nnE_.js","/assets/award-gCuJL4Mp.js","/assets/ban-lvlmtPOg.js","/assets/book-open-CZ0g4NkI.js","/assets/boxes-CAK2ZKY2.js","/assets/braces-BfPSMC2V.js","/assets/brigadirFilters-CFtjlm51.js","/assets/broadcastTree-CfQHHlxB.js","/assets/building-2-DcpbX_9f.js","/assets/calculator-YiM3M7H6.js","/assets/calendar-BS4EmxG7.js","/assets/calendar-days-BgnhDaGl.js","/assets/camera-C0ZwOv5c.js","/assets/categories-CdOXXRyz.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DFK8vakv.js","/assets/chart-line-WFKH-DeC.js","/assets/chart-pie-DFkZyP1I.js","/assets/chartRange-EfQEE8ZV.js","/assets/check-check-DqfzusWE.js","/assets/chevron-left-B57uUgCB.js","/assets/chevrons-up-down-Dc91MxnL.js","/assets/circle-DCKVIeT4.js","/assets/circle-alert-Dy_2DEO0.js","/assets/circle-check-big-DIM__uGo.js","/assets/circle-dashed-lK11lUk5.js","/assets/circle-minus-B882URge.js","/assets/circle-question-mark-Bvkx1Je0.js","/assets/circle-slash-HNH4N_8h.js","/assets/circle-user-round-DQANk8Rr.js","/assets/clock-3-BgTEENF6.js","/assets/cloud-off-CZzDzXlM.js","/assets/cloud-upload-CF3sAaU3.js","/assets/compass-CMVwRAJ7.js","/assets/concernCategories-CPcAfc0g.js","/assets/copy-jNJfuTrS.js","/assets/corner-down-right-CudYgIDO.js","/assets/createLucideIcon-CJYbTjDX.js","/assets/es-BMNCnU-G.js","/assets/exportXlsx-BBBd4qqz.js","/assets/external-link-Ci4GgEI6.js","/assets/file-clock-D5FhO94s.js","/assets/file-exclamation-point-BF2HmDZf.js","/assets/file-spreadsheet-pJ5jOZrH.js","/assets/file-text-2306xZc6.js","/assets/flag-DGq-M6uh.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cbsi7a10.js","/assets/hash-Ct8DP41l.js","/assets/history-DQtKH_7v.js","/assets/hourglass-B6KgcLts.js","/assets/image-BLQWTtKQ.js","/assets/image-off-Cwtt9hYV.js","/assets/inbox-C6NExIbt.js","/assets/index-B1BGX_7I.css","/assets/index-BwoE1KGW.js","/assets/key-round-CdBYT2bi.js","/assets/keyboard-BdRQt2y1.js","/assets/languages-0B-cZdT3.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CKGmi-yZ.js","/assets/lightbulb-FPX4ESer.js","/assets/link-2-off-CkZzlj2J.js","/assets/link-2-xJH6BVfj.js","/assets/list-ordered-Bsxop6Kz.js","/assets/list-tree-CFS49Udh.js","/assets/lock-open-DqpwYKec.js","/assets/log-in-F5k2ByoX.js","/assets/maximize-2-SL7UCAlW.js","/assets/message-square-C_8u9Gdh.js","/assets/minimize-2-Drv1EDLC.js","/assets/package-check-D_mbnw7f.js","/assets/paperclip-VBgg0Itl.js","/assets/pencil-BrukVP0z.js","/assets/percent-CbpaiKhu.js","/assets/pin-DRk9nAS0.js","/assets/pin-off-B-9fR0qj.js","/assets/play-ZePV8u5O.js","/assets/plug-zap-DR1BsQYa.js","/assets/presentation-CDaUCprM.js","/assets/prop-types-kSixM8A-.js","/assets/radio-C85hNe1j.js","/assets/react-apexcharts.esm-DBtCd2cV.js","/assets/registers-CvkZBejO.js","/assets/repeat-CTw0dCn-.js","/assets/rotate-ccw-D8A9IHew.js","/assets/rotate-cw-D0DFIxYR.js","/assets/save-B0aQjPfA.js","/assets/scopeLinks-Cui5VK_u.js","/assets/scroll-text-BeuZAJYz.js","/assets/search-x-C1NznTKn.js","/assets/segments-CxG62BZS.js","/assets/send-KwMo9J6K.js","/assets/settings-2-DGCvg93K.js","/assets/shield-9MPPik9Q.js","/assets/shield-alert-DEsrYfoy.js","/assets/shield-check-ZND3daoW.js","/assets/shield-question-mark-CDOYkUCr.js","/assets/siren-D5vkTVTS.js","/assets/snowflake-BN4eL4zk.js","/assets/split-Dzx4DhnJ.js","/assets/square-CbavbsXU.js","/assets/square-check-big-BhW2VZEM.js","/assets/star-DaACgMif.js","/assets/statusBands-BoiaVtws.js","/assets/store-BSVGi3K7.js","/assets/table-2-PRuPFi9h.js","/assets/table-properties-CFNAP6tI.js","/assets/tag-BODFmFsP.js","/assets/timer-off-EepKpKfd.js","/assets/trending-down-BQVAR92D.js","/assets/trending-up-CgyHrcDe.js","/assets/undo-2-wIG_blv0.js","/assets/useChartTheme-C3B5XBnW.js","/assets/useElementWidth-BQsIeDs5.js","/assets/useIsMobile-D87G0e7t.js","/assets/useOpenParam-DDNzf-_-.js","/assets/useStatusBands-7cU30VSY.js","/assets/useUrlScope-CfZaDZsT.js","/assets/user-DA7cNozt.js","/assets/user-cog-DgBZmgPt.js","/assets/users-BlCccNsr.js","/assets/vfx-CL91G2jI.js","/assets/video-pJlRTu69.js","/assets/wallet-mcS5OeFp.js","/assets/warehouse-obndg_xD.js","/assets/x-Bn5kv17o.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
