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

const BUILD = "2026-10-21T10:25:22.202Z";
const PRECACHE = ["/","/assets/AdminPanel-Bceb8Ep5.js","/assets/AnalysisBoard-BdGJc6n8.js","/assets/Arc-DX5xZbf5.js","/assets/Assistant-CItUVsZE.js","/assets/BrigadirProfile-Czfip0pZ.js","/assets/BroadcastReceivers-BNzUQBJl.js","/assets/BroadcastRecord-BzNCMBFF.js","/assets/Button-WAu5vJrk.js","/assets/CatLockNotice-3QiGhMe9.js","/assets/CategoryLegendModal-CdClj49-.js","/assets/CellConcerns-DSVnlsYY.js","/assets/CellDetails-BDtTpLHW.js","/assets/CellFormModal-BUaHAdXc.js","/assets/CellIdent-D98qWVEe.js","/assets/CellLink-D4PXm3kU.js","/assets/Cells-D2YdLsZA.js","/assets/ColumnFilter-CDCGOHGJ.js","/assets/ColumnsPicker-ClmeoSk3.js","/assets/CommentsModal-Cied8PCN.js","/assets/ComparisonTable-Bx2-pG3G.js","/assets/Concerns-DTs1c9-i.js","/assets/CountStepper-CItbBXDD.js","/assets/Daily-BdBDN711.js","/assets/DataTable-o5Z00drK.js","/assets/DateRangePicker-B8Gqtksc.js","/assets/DayReportView-B2dzCKpd.js","/assets/DayStepper-CEWbrWxi.js","/assets/DayStrip-BDd3SjbJ.js","/assets/DifferenceBreakdown-BgEJ1JuC.js","/assets/Downtime-C4F33jCD.js","/assets/Education-BHMy6DwA.js","/assets/EducationLesson-IqJg_Hjr.js","/assets/EmptyState-m4ZFfhib.js","/assets/Exam-D5ShrZsg.js","/assets/FactorySelect-VFbo6RFH.js","/assets/Gamification-RjY3NtIP.js","/assets/GroupBadge-D1CG4ZgN.js","/assets/HeatmapChart-pa5MaSN2.js","/assets/IdleCell-C9Qlus-m.js","/assets/KPICard-EsaZFUQ5.js","/assets/Kaizen-D0np_emj.js","/assets/Kelish-DaePc7hz.js","/assets/KpiDeltaCard-DDy9lC46.js","/assets/LangTextInput-CN7fsoQh.js","/assets/Layout-BaVIR-3u.js","/assets/LeaderAppeal-CUFRdlkx.js","/assets/LeaderDayReport-rHeoIJSF.js","/assets/LeaderUnitReport-xpY5lQCL.js","/assets/Leaderboard-DKZ3TTy-.js","/assets/Leaders-_RZbqgHA.js","/assets/LeadersKpi-C2qXYY-C.js","/assets/Lightbox-DuFyuHUE.js","/assets/LiveOverview-R8CQpH5w.js","/assets/Login-CVDEn13H.js","/assets/NotFound-Buz4_4eK.js","/assets/Notifications-DLNUbRB7.js","/assets/Ontime-Cv8FK4Kt.js","/assets/Overview-DObOc-t5.js","/assets/Pagination-CEJTf2wu.js","/assets/PerenaladkaFactTable-C6XITg1A.js","/assets/PersonCard-Bf-xansB.js","/assets/PlanFulfillment-By94ERAU.js","/assets/Production-I6KIrjPU.js","/assets/Profile-BSnoc5v0.js","/assets/ProofCamera-DfLk8thd.js","/assets/ProofPhoto-Bwsqx1Et.js","/assets/Quality-FCfpZMIR.js","/assets/RawRows-92jjR01W.js","/assets/RequestStateChip-B5S1b-cT.js","/assets/RichTextEditor-Bb05bgrI.js","/assets/SaveState-CmKfOlkJ.js","/assets/SearchInput-B0zltGCg.js","/assets/SeasonalityHeatmap-CHThF6Yd.js","/assets/SegmentedToggle-C_yns5fK.js","/assets/SetupTimes-DCeCNqzs.js","/assets/ShiftDaily-nGCfN9YL.js","/assets/Staff-CWjXH9O_.js","/assets/StaffListAtCheck-KR8KmPyX.js","/assets/StatusBadge-GKuupjYE.js","/assets/StatusBandsModal-DVTFgu2Y.js","/assets/TargetGoal-B19R_xDk.js","/assets/Targets-cQBh3c3K.js","/assets/Tasks-DXYaBOm_.js","/assets/TimeWheelPicker-RtmfDYkA.js","/assets/Toast-DaXaVKJ9.js","/assets/Tooltip-C0muri1L.js","/assets/TrendChart-Bkc2HSUY.js","/assets/TripleSpeedometer-DfCohxzd.js","/assets/Trudoyomkost-CepQSNSa.js","/assets/UploadDropzone-pg7-idLy.js","/assets/UsersActivity-Cx3AeZYF.js","/assets/VerdictBlock-D1GOECHG.js","/assets/VfxApiMap-D1OxZqgs.js","/assets/VfxDictionaries-BZXB2QaP.js","/assets/VfxEmployees-Bhcbwg18.js","/assets/VfxHrMoves-CyfHBjic.js","/assets/VfxJobs-_8tDG396.js","/assets/VfxPhoto-Bg8H6PQ-.js","/assets/VfxShifts-C_Ys9NrN.js","/assets/VfxState-DBKibmqc.js","/assets/VfxTimebooks-BIPa1YZb.js","/assets/VfxTimesheet-DIOMbeCc.js","/assets/WatchProgress-A0cvK_jP.js","/assets/WebLogin-D0iccusL.js","/assets/Workers-FtMifJvM.js","/assets/Zagruzka-BnfBJtPq.js","/assets/ZagruzkaCell-B5GFSI9R.js","/assets/api-DI_S_lDP.js","/assets/archive-BNQ-1JSk.js","/assets/archive-restore-DpknLew2.js","/assets/arrow-down-DbTQQK1W.js","/assets/arrow-down-right-BkXqiiPR.js","/assets/arrow-down-wide-narrow-ougQpZZG.js","/assets/arrow-up-narrow-wide-DYAVTgK2.js","/assets/ban-vaf8nwt8.js","/assets/boxes-B9cQZOsQ.js","/assets/braces-s6UX-vuL.js","/assets/brigadirFilters-QnZ4EcO5.js","/assets/broadcastTree-fFfKcoWz.js","/assets/building-2-CQkBSJMq.js","/assets/calendar-B3-TMFUz.js","/assets/calendar-days-bne6IxWs.js","/assets/camera-3UlFB0CC.js","/assets/categories-bfIVS3vO.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DLsupwNk.js","/assets/chart-line-DR9Nm_SP.js","/assets/chart-pie-CWECnDrF.js","/assets/chartRange-eQyKxJWf.js","/assets/check-check-DQRnZOW5.js","/assets/chevron-left-ChSzks4H.js","/assets/chevrons-up-down-Dl26tT-Z.js","/assets/circle-DK4JShBI.js","/assets/circle-alert-Dn1AJt-U.js","/assets/circle-check-big-DIzCMSiL.js","/assets/circle-dashed-CueFQALu.js","/assets/circle-minus-ByXzrDDB.js","/assets/circle-question-mark-bzqneR0D.js","/assets/circle-slash-2GPFzxch.js","/assets/circle-user-round-DzHM-vNu.js","/assets/cloud-off-eQkRZGq4.js","/assets/cloud-upload-C3v7oeW0.js","/assets/compass-Cs3Zcxfy.js","/assets/concernCategories-DpGSfLBl.js","/assets/corner-down-right-ChUYPPx4.js","/assets/createLucideIcon-EaTMb34-.js","/assets/es-qBIxf1kF.js","/assets/external-link-Cfo9jAI0.js","/assets/file-clock-CwDdBbOY.js","/assets/file-exclamation-point-BqqAlqsA.js","/assets/flag-B9NNy6_f.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B6ZvYW4v.js","/assets/funnel-YEG2PgIN.js","/assets/hash-DUP1CXLI.js","/assets/hourglass-BdDHzPSl.js","/assets/image-C1qLUl-i.js","/assets/image-off-DggwXPnw.js","/assets/inbox-CzfhidhC.js","/assets/index-BfqztHV1.js","/assets/index-Ct9WqSVA.css","/assets/keyboard--BJ2kinI.js","/assets/languages-DWM9NIrA.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C-3-eUhy.js","/assets/lightbulb-Ay2_0eAi.js","/assets/link-2-BsYx9DAe.js","/assets/link-2-off-DfhrDzsP.js","/assets/list-ordered-C5VuuQ_l.js","/assets/list-tree-DsYBIQmO.js","/assets/lock-open-C7NnYPHi.js","/assets/log-in-ByScKSsk.js","/assets/marks-DRmqEd1d.js","/assets/minimize-2-EB5SISp_.js","/assets/package-check-CqS1kV4v.js","/assets/pencil-CTVSdgmo.js","/assets/percent-CPcVjO2J.js","/assets/pin-Dgxg8ubM.js","/assets/pin-off-DaIfLK3r.js","/assets/play-CEXzyZXB.js","/assets/plug-zap-MtKjImY2.js","/assets/prop-types-fHnn81OW.js","/assets/radio-OumXR702.js","/assets/react-apexcharts.esm-Bb-cc0Un.js","/assets/registers-D7C5R69r.js","/assets/repeat-b6wvHFSY.js","/assets/save-Dq3WXLan.js","/assets/scopeLinks-CKzrkLei.js","/assets/scroll-text-CmQlBkI6.js","/assets/search-x-B7C3hKda.js","/assets/segments-CQCvAwfr.js","/assets/send-D9WQ4ezA.js","/assets/settings-2-Cn6MS9_q.js","/assets/shield-BmFWALtf.js","/assets/shield-alert-C3z_gpSW.js","/assets/shield-question-mark-BMgRAQLj.js","/assets/sigma-Bu_gprWb.js","/assets/siren-CRyLLxfZ.js","/assets/snowflake-CMCbeUSN.js","/assets/split-D0-pfIzM.js","/assets/square-check-big-C-FCSwxH.js","/assets/star-DarxeZaO.js","/assets/statusBands-B8-9reM4.js","/assets/store-Cgmy5FxU.js","/assets/table-2-CZgmfpcp.js","/assets/table-properties-BhACckSm.js","/assets/tag-8bSRiaYj.js","/assets/timer-off-BF8QsplV.js","/assets/trendBuckets-JR8dRN7S.js","/assets/trending-down-0u386K6f.js","/assets/trending-up-Cnvd48xD.js","/assets/undo-2-DI5WK3FG.js","/assets/useChartTheme-BorTg7r6.js","/assets/useElementWidth-DRztQdbA.js","/assets/useIsMobile-D6rCGpG5.js","/assets/useOpenParam-B5-d9n2c.js","/assets/useStatusBands-CPBKGNaD.js","/assets/useUrlScope-O8OvXQwE.js","/assets/user-cog-ySQadkRG.js","/assets/user-hQ_pBVCD.js","/assets/user-minus-DG8Zjxgx.js","/assets/users-BUDS4aDt.js","/assets/vfx-DVDhPb9S.js","/assets/video-BaWEXt3S.js","/assets/wallet-D_oeIyeX.js","/assets/warehouse-D5dlBoHA.js","/assets/workflow-DgkXWgae.js","/assets/x-BP4qKVNI.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
