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

const BUILD = "2026-10-13T14:33:19.790Z";
const PRECACHE = ["/","/assets/AdminPanel-B8JLquz8.js","/assets/AnalysisBoard-Db_HbGO5.js","/assets/Arc-Lu2J4IZh.js","/assets/Assistant-a5MrCZl9.js","/assets/BrigadirProfile-B3H6QXyP.js","/assets/BroadcastReceivers-CU5tUm-9.js","/assets/BroadcastRecord-v3wfdoXU.js","/assets/Button-CRGSIn8D.js","/assets/CatLockNotice-DRBxMyJE.js","/assets/CategoryLegendModal-CerxWnoj.js","/assets/CellConcerns-C7h8-DZC.js","/assets/CellDetails-DuR9xUZ3.js","/assets/CellFormModal-ux0uecvo.js","/assets/CellIdent-JoRjJ28f.js","/assets/CellLink-CZoMUrwy.js","/assets/Cells-C2CHB3CS.js","/assets/ColumnFilter-BipVUGOd.js","/assets/ColumnsPicker-ppJpzw_g.js","/assets/CommentsModal-Y46baDPB.js","/assets/ComparisonTable-DmYiFEkV.js","/assets/Concerns-CL4ri3LS.js","/assets/CountStepper-8XR2CSd3.js","/assets/Daily-CqQoEn_s.js","/assets/DataTable-ActTYoUS.js","/assets/DateRangePicker-D3sCRh6t.js","/assets/DayReportView-BFjISIfS.js","/assets/DayStepper-C9x1EUV1.js","/assets/DifferenceBreakdown-BeOtTez0.js","/assets/Downtime-sg35McCU.js","/assets/Education-S9xkX0ND.js","/assets/EducationLesson-D6kfyoU4.js","/assets/EmptyState-FO_Pltoo.js","/assets/Exam-DhvH8_WZ.js","/assets/FactorySelect-BOg4xyk3.js","/assets/Gamification-C-vhBiVs.js","/assets/GroupBadge-m0c4axY8.js","/assets/HeatmapChart-Dt2tXuPu.js","/assets/IdleCell-DKwzE2IP.js","/assets/KPICard-DGtWwA79.js","/assets/Kaizen-CvffZuCt.js","/assets/Kelish-DkrETv6N.js","/assets/KpiDeltaCard-D1qcHB9f.js","/assets/LangTextInput-CaBX6YH6.js","/assets/Layout-FTfz3Sq2.js","/assets/LeaderAppeal-BNQzI8mr.js","/assets/LeaderDayReport-CLv0ctEU.js","/assets/LeaderUnitReport-BlyZ0tZv.js","/assets/Leaderboard-BnR6rnBE.js","/assets/Leaders-Dz1Jjwcz.js","/assets/Lightbox-CWpDaI0u.js","/assets/LiveOverview-MdMrg9UY.js","/assets/Login-VJ49KaW_.js","/assets/NotFound-CZsNfs42.js","/assets/Notifications-BsiD-nJS.js","/assets/Overview-B7O0eUC4.js","/assets/Pagination-BMw6dlGb.js","/assets/PerenaladkaFactTable-DKIFSdfQ.js","/assets/PersonCard-ASiKtgIT.js","/assets/PlanFulfillment-CDxdaO5r.js","/assets/Production-Bj1axnm1.js","/assets/Profile-DMzEtdOD.js","/assets/ProofCamera-614yLu7t.js","/assets/Quality-BMxpoRut.js","/assets/RawRows-tEj-w_by.js","/assets/RequestStateChip-C8SRqiAg.js","/assets/RichTextEditor-1Wm2s3Xc.js","/assets/SaveState-CNhZijji.js","/assets/SearchInput-BY9aU0tq.js","/assets/SeasonalityHeatmap-Bz7gHFCq.js","/assets/SegmentedToggle-KWN2jRJV.js","/assets/SetupTimes-C4TXuU1g.js","/assets/ShiftDaily-4YdAmhP9.js","/assets/Staff-CyxUffRV.js","/assets/StaffListAtCheck-_0W39yaV.js","/assets/StatusBadge-B_H42LRR.js","/assets/TargetGoal-Dp56PjKK.js","/assets/Targets-K_j6NN0Z.js","/assets/Tasks-DUQk3_1p.js","/assets/TimeWheelPicker-CCo6wTHU.js","/assets/Toast-BNhNQBfD.js","/assets/Tooltip-I-x5eMNx.js","/assets/TrendChart-DhmENz_z.js","/assets/TripleSpeedometer-Dfk8c3Zp.js","/assets/Trudoyomkost-B1iV5QJP.js","/assets/Turnover-CT84VL5E.js","/assets/UploadDropzone-B6bOiBbM.js","/assets/UsersActivity-BkzIEjCl.js","/assets/VerdictBlock-CfySOGRR.js","/assets/VfxApiMap-CY7BNQz6.js","/assets/VfxDictionaries-DDpIsnHV.js","/assets/VfxEmployees-DWq2u0Ru.js","/assets/VfxHrMoves-C2T9VGEe.js","/assets/VfxJobs-BLhihEXE.js","/assets/VfxPhoto-OnzKPJ02.js","/assets/VfxShifts-Ds_tB4ar.js","/assets/VfxState-1DGh3uI5.js","/assets/VfxTimebooks-Z_CQpYIh.js","/assets/VfxTimesheet-Cwp3BhPL.js","/assets/WatchProgress-D0v54CgI.js","/assets/WebLogin-Co_kkvbX.js","/assets/WorkerConcerns-DU0AygPi.js","/assets/Workers-BYqKdKud.js","/assets/Zagruzka-Cs_LqOK3.js","/assets/ZagruzkaCell-CWaEYSv_.js","/assets/api-9HSTtnl4.js","/assets/archive-BlZCvUyU.js","/assets/archive-restore-diJgSTn9.js","/assets/arrow-down-C_E0qIE1.js","/assets/arrow-down-wide-narrow-C5J4I6Q5.js","/assets/arrow-up-narrow-wide-DOvjkMyB.js","/assets/award-DiZAKWjw.js","/assets/ban-DS7X8Xau.js","/assets/boxes-_2lZHkTK.js","/assets/braces-CiBbC5vp.js","/assets/brigadirFilters-Cf7XnCF5.js","/assets/broadcastTree-Cu9j3qX5.js","/assets/building-2-B_vLWAuL.js","/assets/calculator-D1VDeV_a.js","/assets/calendar-ChqCEVDp.js","/assets/calendar-days-Dg8ByWWH.js","/assets/camera-BQXz3G4P.js","/assets/categories-4vVW1vDb.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DNSLMEYo.js","/assets/chart-line-fIr5P0iP.js","/assets/chart-pie-CS5mqfu8.js","/assets/chartRange-BLMoShey.js","/assets/check-check-BilAlLp5.js","/assets/chevron-left-CopqiVRJ.js","/assets/chevrons-up-down-C3WfOjQY.js","/assets/circle-alert-3piE0OvY.js","/assets/circle-check-big-DsURWFQh.js","/assets/circle-dashed-CWUv8smG.js","/assets/circle-minus-cWK8R3O5.js","/assets/circle-question-mark-DDHbXkPC.js","/assets/circle-slash-BFcDMY5r.js","/assets/circle-user-round-_6aPNfKQ.js","/assets/circle-zMLaJnz9.js","/assets/clock-3-DhSFlfZS.js","/assets/cloud-off-BF0N6WBY.js","/assets/cloud-upload-B70lx1VZ.js","/assets/compass-VZvamYvY.js","/assets/concernCategories-B3mpg5of.js","/assets/copy-CUGij4pD.js","/assets/corner-down-right-B2En2pVL.js","/assets/createLucideIcon-GkfTPGjz.js","/assets/es-CzUmg78I.js","/assets/external-link-t0e1UolL.js","/assets/file-clock-D6sKeUYi.js","/assets/file-exclamation-point-XbNSvl7H.js","/assets/flag-CDGO0VPO.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dd1LqXxe.js","/assets/hash-D9ozIAmR.js","/assets/hourglass-BkA0uP7N.js","/assets/image-Cx1XjjGi.js","/assets/image-off-B_2wkWa-.js","/assets/inbox-Do_ZmKlk.js","/assets/index-7f1rnqtY.css","/assets/index-DZzUDhhu.js","/assets/keyboard-HHIatqub.js","/assets/languages-BEwIegQa.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-WUeGn4yY.js","/assets/lightbulb-m33BqCM4.js","/assets/link-2-CwbJ2zaq.js","/assets/link-2-off-BL9rW3QE.js","/assets/list-ordered-CjBT1J4k.js","/assets/list-tree-BZFcWNnb.js","/assets/lock-open-aOvomVzy.js","/assets/log-in-k5OdILBZ.js","/assets/marks-Hnz8DXRn.js","/assets/minimize-2-BeZ4I_zF.js","/assets/package-check-DMhd9Et8.js","/assets/pencil-CLuwoE-_.js","/assets/percent-TN_OcK_9.js","/assets/pin-off-Be213GVO.js","/assets/pin-v_d233AH.js","/assets/play-D0zwpcg1.js","/assets/plug-zap-_SUvw6rI.js","/assets/prop-types-DE_t6p_G.js","/assets/radio-BmC5bDY7.js","/assets/react-apexcharts.esm-Bjm1OtDJ.js","/assets/registers-DuErvLqR.js","/assets/repeat-WaHCdvPA.js","/assets/save-8-TaBZ_d.js","/assets/scopeLinks-CU0pCEHA.js","/assets/scroll-text-CHLoaxj5.js","/assets/search-x-D5ui9phx.js","/assets/segments-DCbNNe1P.js","/assets/send-BUXTAaxF.js","/assets/settings-2-DSzemi08.js","/assets/shield-Cdl5kQuY.js","/assets/shield-alert-CmK-5xJX.js","/assets/shield-question-mark-CfC1yuF1.js","/assets/siren-C6QNXKgb.js","/assets/snowflake-WdOkMEEL.js","/assets/split-DnEZp1Vk.js","/assets/square-check-big-DdZVOQI0.js","/assets/star-D6GAJP_o.js","/assets/statusBands-B4vlxIu6.js","/assets/store-BA_euP20.js","/assets/table-2-BKCn8FE_.js","/assets/table-properties-D7KU5xVP.js","/assets/tag-BEfP3OS0.js","/assets/timer-off-YRqTLyrh.js","/assets/trending-down-FCnJA5o2.js","/assets/trending-up-Deak1aHR.js","/assets/undo-2-BG8scnAU.js","/assets/useChartTheme-Chjd4I82.js","/assets/useElementWidth-DXMaAf28.js","/assets/useIsMobile-_M96fxox.js","/assets/useOpenParam-CZK60zud.js","/assets/useStatusBands-C55lte9a.js","/assets/useUrlScope-Dc_C3LY2.js","/assets/user-CNFVQNhe.js","/assets/user-cog-DGM8G7O0.js","/assets/users-D9SyUH_Z.js","/assets/vfx-TlKzW9pn.js","/assets/video-BjcLK6hY.js","/assets/wallet-zFMdbCYK.js","/assets/warehouse-BhPhqQEq.js","/assets/workflow-BAkvKn8h.js","/assets/x-D6ePiaKN.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
