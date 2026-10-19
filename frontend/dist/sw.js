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

const BUILD = "2026-10-19T06:01:57.456Z";
const PRECACHE = ["/","/assets/AdminPanel-BSSTDWj3.js","/assets/AnalysisBoard-BnyQswC4.js","/assets/Arc-imqHiidW.js","/assets/Assistant-kDhU1syY.js","/assets/BrigadirProfile-DzAyp4SV.js","/assets/BroadcastReceivers-C_RtAdkZ.js","/assets/BroadcastRecord-UGde6S1u.js","/assets/Button-CXrzcox1.js","/assets/CatLockNotice-Fm_u1YE0.js","/assets/CategoryLegendModal-CweDcpb0.js","/assets/CellConcerns-BbJ_bUHD.js","/assets/CellDetails-B_FLt3XF.js","/assets/CellFormModal-BD82lt4R.js","/assets/CellIdent-h3VI_S2a.js","/assets/CellLink-GmEuIBtN.js","/assets/Cells-I0aWSg1g.js","/assets/ColumnFilter-BiMtMGz0.js","/assets/ColumnsPicker-Bjy69Zyk.js","/assets/CommentsModal-Beaa0xlO.js","/assets/ComparisonTable-DvbQZXbd.js","/assets/Concerns-DKesUp0r.js","/assets/CountStepper-iN6F-kmH.js","/assets/Daily-fBam50pi.js","/assets/DataTable-BdsMHNnZ.js","/assets/DateRangePicker-DsGrHs5c.js","/assets/DayReportView-BgWyPyUA.js","/assets/DayStepper-DNDGUkvW.js","/assets/DifferenceBreakdown-Bypy_yu6.js","/assets/Downtime-qdnjg5JA.js","/assets/Education-wucymw9q.js","/assets/EducationLesson-CfFBmCZF.js","/assets/EmptyState-2eYM0S9V.js","/assets/Exam-BBFqG2Lf.js","/assets/FactorySelect-BjDRf7r-.js","/assets/ForeignObjects-CFxTT-6L.js","/assets/Gamification-Kd6HwJiC.js","/assets/GroupBadge-nOM6X0vw.js","/assets/HeatmapChart-CGrXQKSZ.js","/assets/IdleCell-CBC9YI_R.js","/assets/KPICard-CQqgR-J8.js","/assets/Kaizen-BG1ZEJK6.js","/assets/Kelish-4kn5Uv8t.js","/assets/KpiDeltaCard-CqeeeHhA.js","/assets/LangTextInput-U5VttBsL.js","/assets/Layout-CQ-wzNwe.js","/assets/LeaderAppeal-DZVmoutA.js","/assets/LeaderDayReport-DgzaBB4r.js","/assets/LeaderUnitReport-CCxqiAFI.js","/assets/Leaderboard-BTEXeGxT.js","/assets/Leaders-Dr13Nre7.js","/assets/Lightbox-DC2jGGKC.js","/assets/LiveOverview-BWNOQTzR.js","/assets/Login-DyfQDHWF.js","/assets/NotFound-DuoWtNR4.js","/assets/Notifications-DFhzDMbQ.js","/assets/Overview-BDRslcpc.js","/assets/Pagination-DFhbwt4L.js","/assets/PerenaladkaFactTable-9zORVO60.js","/assets/PersonCard-Dk6KBzgs.js","/assets/PlanFulfillment-CtCinj7F.js","/assets/Production-BLwAWA5-.js","/assets/Profile-DvQ6z951.js","/assets/ProofCamera-BXwj6mld.js","/assets/ProofPhoto-iniUFbmu.js","/assets/Quality-B8bSoOTG.js","/assets/RawRows-E7xHoyuM.js","/assets/RequestStateChip-BEqkyuIJ.js","/assets/RichTextEditor-B_DmWuft.js","/assets/SaveState-BHhXLZU2.js","/assets/SearchInput-NrTxmFfT.js","/assets/SeasonalityHeatmap-N0udwNtZ.js","/assets/SegmentedToggle-DvqKofsM.js","/assets/SetupTimes-s3EZZuS5.js","/assets/ShiftDaily-DEeTr88I.js","/assets/Staff-Dt3IhMm3.js","/assets/StaffListAtCheck-olGKgKYu.js","/assets/StatusBadge-B3kxqISu.js","/assets/TargetGoal-D0Pw5ZrA.js","/assets/Targets-DaTddNiE.js","/assets/Tasks-B_LtG7t1.js","/assets/TimeWheelPicker-DmaMXxkg.js","/assets/Toast-iVOZbn7Q.js","/assets/Tooltip-C1nCjJni.js","/assets/TrendChart-BT-QjjCL.js","/assets/TripleSpeedometer-KrmkrQF6.js","/assets/Trudoyomkost-YKVKZTIK.js","/assets/Turnover-Ju1zfpGB.js","/assets/TurnoverBits-Cj_5Tf2X.js","/assets/UploadDropzone-C2XkP_Y5.js","/assets/UsersActivity-B_81W3BS.js","/assets/VerdictBlock-C_0meIqz.js","/assets/VfxApiMap-CSi5zLN1.js","/assets/VfxDictionaries-BEOghStS.js","/assets/VfxEmployees-C0DcFYqX.js","/assets/VfxHrMoves-1TYYXTSd.js","/assets/VfxJobs-D85yVSiF.js","/assets/VfxPhoto-xf0R1FP6.js","/assets/VfxShifts-Brj8Tcgy.js","/assets/VfxState-CNwdQl91.js","/assets/VfxTimebooks-DwT3jrM_.js","/assets/VfxTimesheet-wy5ibnD1.js","/assets/WatchProgress-DcGWVADi.js","/assets/WebLogin-CI-8qpi2.js","/assets/WorkerConcerns-CLHg55Gm.js","/assets/Workers-BrAlupzx.js","/assets/Zagruzka-DFcqFEhu.js","/assets/ZagruzkaCell-DJqQGlcy.js","/assets/api-Cq1Sdb1V.js","/assets/archive-CD5FOvIq.js","/assets/archive-restore-BWOYSBIG.js","/assets/arrow-down-DHGqdvbr.js","/assets/arrow-down-wide-narrow-2pHV1EZo.js","/assets/arrow-up-narrow-wide-BWx9zRmy.js","/assets/award-o6HNBjqY.js","/assets/ban-XbxJHyHB.js","/assets/boxes--H-2sTQB.js","/assets/braces-BkGiQIQZ.js","/assets/brigadirFilters-Bg5EmMD6.js","/assets/broadcastTree-B3LGJbpv.js","/assets/building-2-D9aosU0R.js","/assets/calculator-BL04l05t.js","/assets/calendar-C60Ky2wx.js","/assets/calendar-days-4KyPLED4.js","/assets/camera-DvwT0tQ2.js","/assets/categories-BMTt-7TH.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BoJ4C3k3.js","/assets/chart-line-DAjyAlOB.js","/assets/chart-pie-prWaA2un.js","/assets/chartRange-rle6Iaxu.js","/assets/check-check-ByeN9MhN.js","/assets/chevron-left-D90fzxhd.js","/assets/chevrons-up-down-BQWlWAcZ.js","/assets/circle-DONC7rsb.js","/assets/circle-alert-B0I6EG72.js","/assets/circle-check-big-UsVLQOdY.js","/assets/circle-dashed-0WqDKX23.js","/assets/circle-minus-BzaLAaqw.js","/assets/circle-question-mark-CXY7o1Aj.js","/assets/circle-slash-C6CaYzZM.js","/assets/circle-user-round-BXgtem_L.js","/assets/cloud-off-DRNBlprj.js","/assets/cloud-upload-BDTwp-sf.js","/assets/compass-CFWkkdp7.js","/assets/concernCategories-BPPc2biv.js","/assets/corner-down-right-BntHgASF.js","/assets/createLucideIcon-BFrU5m1j.js","/assets/es-CQrajGSy.js","/assets/external-link-5dBp_kkw.js","/assets/file-clock-FPkIDKbB.js","/assets/file-exclamation-point-Bsn306Xx.js","/assets/flag-yTHTDL0S.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-LibkEWG1.js","/assets/hash-DkAT_TiW.js","/assets/hourglass-BIlXzCCE.js","/assets/image-DuxTenc-.js","/assets/image-off-CymQSumO.js","/assets/inbox-CT9j4d6T.js","/assets/index-DMaaZqfZ.css","/assets/index-DQz9Ooev.js","/assets/keyboard-BJjLCjF2.js","/assets/languages-BOSA5ADA.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B3VK8LuW.js","/assets/lightbulb-xsoPvuzc.js","/assets/link-2-DJKszd6m.js","/assets/link-2-off-B5PzldUL.js","/assets/list-ordered-DStRyr9g.js","/assets/list-tree-CYe3gkZt.js","/assets/lock-open-B9_tHRxW.js","/assets/log-in-CbHwerXq.js","/assets/marks-BDeCSL9q.js","/assets/minimize-2-BdnjBcaQ.js","/assets/package-check-DrJL-WqW.js","/assets/pencil-yJmOcUcB.js","/assets/percent-DLq7BIDj.js","/assets/pin-DArc75hE.js","/assets/pin-off-mC_5AbBa.js","/assets/play-BTN6IrDb.js","/assets/plug-zap-Df_mdG7v.js","/assets/prop-types-Dqwit0Ds.js","/assets/radio-C10ymm0_.js","/assets/react-apexcharts.esm-bKq69vWm.js","/assets/registers-7tWDcm1F.js","/assets/repeat-DUM5ynS3.js","/assets/save-Dx9H8-AN.js","/assets/scopeLinks-CWG30f7y.js","/assets/scroll-text-ByY3PHCU.js","/assets/search-x-BFS0M3yP.js","/assets/segments-BefIOzFV.js","/assets/send-dsZ5PSzu.js","/assets/settings-2-BhbFq0fp.js","/assets/shield-DLtxvhov.js","/assets/shield-alert-_AxoO-4C.js","/assets/shield-question-mark-dOXwk8ii.js","/assets/siren-CRjm__y8.js","/assets/snowflake-DsuE0z2d.js","/assets/split-7gaXlatY.js","/assets/square-check-big-DDDbvqee.js","/assets/star-BUXEGKPn.js","/assets/statusBands-CDDexg3K.js","/assets/store-BKvQVPKx.js","/assets/table-2-xibkOK96.js","/assets/table-properties-BN2WcqhF.js","/assets/tag-DDuALxb0.js","/assets/timer-off-B7fHRr0B.js","/assets/trending-down-fuYIHqIr.js","/assets/trending-up-CFeRkuPr.js","/assets/undo-2-CTqSFrii.js","/assets/useChartTheme-huXPV5P6.js","/assets/useElementWidth-BTc0yHs4.js","/assets/useIsMobile-CMRE5hri.js","/assets/useOpenParam-BqZEG7dH.js","/assets/useStatusBands-BgacikPj.js","/assets/useUrlScope-BfA86rBP.js","/assets/user-BXa-lpva.js","/assets/user-cog-BzS2SOZ3.js","/assets/users-C0RPWzk0.js","/assets/vfx-BXScwAa3.js","/assets/video-Cq-XWo5n.js","/assets/wallet-BaKONcQF.js","/assets/warehouse-DryxaCY0.js","/assets/workflow-Csq2wZG7.js","/assets/x-CvzCsyF1.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
