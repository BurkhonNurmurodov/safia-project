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

const BUILD = "2026-10-05T17:15:29.240Z";
const PRECACHE = ["/","/assets/AdminPanel-Cnaied7u.js","/assets/AnalysisBoard-D0z8-uOg.js","/assets/Arc-x_BHEsv-.js","/assets/BrigadirProfile-uibKGUna.js","/assets/BroadcastReceivers-CHZt9daS.js","/assets/BroadcastRecord-BgWvuACw.js","/assets/Button-PlAdYsCm.js","/assets/CatLockNotice-Q2k2uMJX.js","/assets/CategoryLegendModal-BtcRU1F-.js","/assets/CellConcerns-B-iZAHx3.js","/assets/CellDetails-enOiAxdo.js","/assets/CellFormModal-C9YPRVY_.js","/assets/CellIdent-PwjxThPF.js","/assets/CellLink-Gs9Zj4l0.js","/assets/Cells-hkQPTGek.js","/assets/ColumnFilter-DgJT8QlK.js","/assets/ColumnsPicker-C5BTsdRc.js","/assets/CommentsModal-CVMidYyr.js","/assets/ComparisonTable-l3S0dl_2.js","/assets/Concerns-Eu2Gslzw.js","/assets/Daily-Bsbkh7y_.js","/assets/DataTable-CUJb7L4f.js","/assets/DateRangePicker-C0f8-ZYI.js","/assets/DayReportView-BWD9iarq.js","/assets/DayStepper-Cjosxxx8.js","/assets/DifferenceBreakdown-BxpNBklx.js","/assets/Downtime-B9mNb61_.js","/assets/Education-CFw7G86l.js","/assets/EducationLesson-B_K0d9J9.js","/assets/EmptyState-C81v4ARz.js","/assets/Exam-D2PpNsJJ.js","/assets/FactorySelect-nK2Swflp.js","/assets/Gamification-D4ZmTXyy.js","/assets/GroupBadge-DifBmFAb.js","/assets/HeatmapChart-DJSXIlMP.js","/assets/IdleCell-BsQcn6XN.js","/assets/KPICard-jYPQyLUa.js","/assets/Kaizen-dymizQJM.js","/assets/Kelish-DiZVhOlg.js","/assets/KpiDeltaCard-DvcCzxuE.js","/assets/LangTextInput-DQR7BkoE.js","/assets/Layout-CKjRbNzW.js","/assets/LeaderAppeal-CrPstcsd.js","/assets/LeaderDayReport-BpK50DtC.js","/assets/LeaderUnitReport-CT-fOUU9.js","/assets/Leaderboard-BX76fkwW.js","/assets/Leaders-CtqyAEjC.js","/assets/Lightbox-bfZ9zs9q.js","/assets/LiveOverview-8Wj5NzJB.js","/assets/Login-cjZQmbcQ.js","/assets/NotFound-DXeTJvsO.js","/assets/Notifications-YVwPpDel.js","/assets/Overview-CElAEgrG.js","/assets/Pagination-cJdeE1or.js","/assets/PerenaladkaFactTable-pbqF-UQ4.js","/assets/PersonCard-BttzMkMK.js","/assets/PlanFulfillment-B6yseufO.js","/assets/Production-CZckWdt4.js","/assets/Profile-BjH40Mzi.js","/assets/ProofCamera-sdiDZ4Kn.js","/assets/ProofPhoto-CrYicJs0.js","/assets/Quality-Cz696j9M.js","/assets/RawRows-DtCKuEDs.js","/assets/RequestStateChip-B7OBF-Sg.js","/assets/RichTextEditor-C2klmKiB.js","/assets/SaveState-NJP185SW.js","/assets/SearchInput-Deqpqv6T.js","/assets/SeasonalityHeatmap-DylnpoK9.js","/assets/SegmentedToggle-B2_s2Gfs.js","/assets/SetupTimes-D-On5tel.js","/assets/ShiftDaily-LrSmtTAJ.js","/assets/Staff-BxCL1UO-.js","/assets/StaffLive-CytsD8-f.js","/assets/StatusBadge-CJNYPxAJ.js","/assets/TargetGoal-CLfni_RW.js","/assets/Targets-BuBdRxt4.js","/assets/Tasks-DG_yyXQg.js","/assets/TimeWheelPicker-dczv4tzl.js","/assets/Toast-DedFSKWI.js","/assets/Tooltip-Bj3PsEUK.js","/assets/TrendChart-DfbSG5Iz.js","/assets/TripleSpeedometer-DTIwH36_.js","/assets/Trudoyomkost-ChnGChAC.js","/assets/Turnover-DBx3TJsO.js","/assets/UploadDropzone-CjIUxSsx.js","/assets/UsersActivity-c97KV8VQ.js","/assets/VerdictBlock-DHd748Cp.js","/assets/VfxApiMap-BMiXiH54.js","/assets/VfxDictionaries-pWYpkXIk.js","/assets/VfxEmployees-zdhugJVs.js","/assets/VfxHrMoves-DuKf8WrE.js","/assets/VfxJobs-BfIhtmay.js","/assets/VfxPhoto-Bn3Qj2tM.js","/assets/VfxShifts--L3KXJPd.js","/assets/VfxState-Bs9f5ell.js","/assets/VfxTimebooks-BaQouZ41.js","/assets/VfxTimesheet-DfR13OeU.js","/assets/WatchProgress-BJd3Py3u.js","/assets/WebLogin-rbfCjUAN.js","/assets/WorkerConcerns-3COCEakl.js","/assets/Workers-BXpMaTSg.js","/assets/Zagruzka-CeOXSYSC.js","/assets/ZagruzkaCell-BJn4IF_k.js","/assets/api-CfoghBnV.js","/assets/archive-FngXWsKe.js","/assets/archive-restore-oioO8Oui.js","/assets/arrow-down-BnJYqYkb.js","/assets/arrow-left-NJi-0FeW.js","/assets/arrow-up-B2YqD_Jx.js","/assets/arrow-up-narrow-wide-YE_l0m3s.js","/assets/arrow-up-right-Ca0WQJ1W.js","/assets/award-0JArxZ79.js","/assets/ban-BU1iVEY8.js","/assets/book-open-BhXniBZC.js","/assets/boxes-DnsbtLOB.js","/assets/braces-CsM4Fwxj.js","/assets/brigadirFilters-Do0zExbn.js","/assets/broadcastTree-BD1CR7uS.js","/assets/building-2-BSoXkIx0.js","/assets/calculator-BE3IPQKp.js","/assets/calendar-C7bk9Nvx.js","/assets/calendar-days-CULinmfB.js","/assets/camera-D19R1p9w.js","/assets/categories-DGvE2MyD.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CTB_KimF.js","/assets/chart-line-bhwZW9zX.js","/assets/chart-pie-E0A8A7Fa.js","/assets/chartRange-52aJl-1-.js","/assets/check-check-v6Z4gbxc.js","/assets/chevron-left-rZPq35We.js","/assets/chevrons-up-down-bb-02Bt-.js","/assets/circle-HGdNpQUh.js","/assets/circle-alert-BOUTDp_V.js","/assets/circle-check-big-BMrbaFhj.js","/assets/circle-dashed-D4dzJyZ4.js","/assets/circle-minus-Bon2bZUZ.js","/assets/circle-question-mark-IYv7JduJ.js","/assets/circle-slash-BDGuGg7b.js","/assets/circle-user-round-DaOf4bTQ.js","/assets/clock-3-DYjPzZU5.js","/assets/cloud-off-EpsiweSJ.js","/assets/cloud-upload-D9-__pMN.js","/assets/compass-CdevPQTH.js","/assets/concernCategories-QrvjsKUP.js","/assets/copy-CnHo2wbs.js","/assets/corner-down-right-Bw7sZyfx.js","/assets/createLucideIcon-mz4dIUJh.js","/assets/es-B3VsRV5H.js","/assets/exportXlsx-ClH5msRB.js","/assets/external-link-mDQomZT0.js","/assets/file-clock-C8xcR8Qq.js","/assets/file-exclamation-point-C0x2J7Km.js","/assets/file-spreadsheet-BpBSGdQA.js","/assets/file-text-C1JiXWW8.js","/assets/flag-Ck39kW-r.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BXUMUU2s.js","/assets/hash-DqYYDqNm.js","/assets/history-BGM0fysO.js","/assets/hourglass-BjuBQaT8.js","/assets/image-7735TPPo.js","/assets/image-off-BkPFDyVG.js","/assets/inbox-Ce8w-TVp.js","/assets/index-B1BGX_7I.css","/assets/index-Bjj8MHOe.js","/assets/key-round-BZLAChn-.js","/assets/keyboard-BKcFk6dS.js","/assets/languages-Crp2CyvC.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-EKq6wfYA.js","/assets/lightbulb-CCIi_ruQ.js","/assets/link-2-aV8lTTUr.js","/assets/link-2-off-BqJXD2UP.js","/assets/list-ordered-C70LbXkL.js","/assets/list-tree-D_k8xZLu.js","/assets/lock-open-CPLRs1IA.js","/assets/log-in-CLaZU_JA.js","/assets/maximize-2-DaRKrHFF.js","/assets/message-square-C32JYKCn.js","/assets/minimize-2-DJvzrqdf.js","/assets/package-check-ByYy1yLv.js","/assets/paperclip-CnvrsnpM.js","/assets/pencil-Dh-yIq87.js","/assets/percent-CsOdT-qO.js","/assets/pin-D15fUmHg.js","/assets/pin-off-BuohrNDc.js","/assets/play-BS8ZZgDq.js","/assets/plug-zap-a_UJ0raL.js","/assets/presentation-xe2DaG_M.js","/assets/prop-types-DRAVW6Mc.js","/assets/radio-2Q4oxeCf.js","/assets/react-apexcharts.esm-BW5CHyOj.js","/assets/registers-CYyOpu9d.js","/assets/repeat-CXkUDaHh.js","/assets/rotate-ccw-CQIo2UCQ.js","/assets/rotate-cw-Cmyeq25K.js","/assets/save-CemxY-oK.js","/assets/scopeLinks-Ciroa-MY.js","/assets/scroll-text-DUPPKZAF.js","/assets/search-x-DPUq2mwY.js","/assets/segments-Ge2vbcmq.js","/assets/send-EfxFdFIO.js","/assets/settings-2-DFSVkIZC.js","/assets/shield-BbRTSewX.js","/assets/shield-alert-BbjC-QZm.js","/assets/shield-check-D_RtRhEm.js","/assets/shield-question-mark-B32Uo94e.js","/assets/siren-Br8ly5Nd.js","/assets/snowflake-Gak86D7L.js","/assets/split-Dx6bdiZE.js","/assets/square-DX8-fmAh.js","/assets/square-check-big-BkDT86kQ.js","/assets/star-9OH3JezT.js","/assets/statusBands-CgvdNoct.js","/assets/store-mQJYII7t.js","/assets/table-2-fMcJrmw3.js","/assets/table-properties-kFHaeZRy.js","/assets/tag-DE5VYX_C.js","/assets/timer-off-CJP-5Rnw.js","/assets/trending-down-BdhY1J54.js","/assets/trending-up-4uqAXgsu.js","/assets/undo-2-BTjuYG_Q.js","/assets/useChartTheme-B96YVErb.js","/assets/useElementWidth-X7Fz4d_Y.js","/assets/useIsMobile-BqanPRSi.js","/assets/useOpenParam-BQ6fK-ix.js","/assets/useStatusBands-aYo8OA85.js","/assets/useUrlScope-EcYImmxN.js","/assets/user-B_Zn6HDe.js","/assets/user-cog-BYcZw5lz.js","/assets/users-DXOH99-l.js","/assets/vfx-DRq1_Rsz.js","/assets/video-Ccn0IJ_1.js","/assets/wallet-DN7XhIAh.js","/assets/warehouse-DZIHlpJF.js","/assets/x-Bv-2ZF0I.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
