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

const BUILD = "2026-10-04T10:13:24.947Z";
const PRECACHE = ["/","/assets/AdminPanel-Cjw7WHc1.js","/assets/AnalysisBoard-BfhRdzny.js","/assets/Arc-AejGWzNd.js","/assets/ArcLegacy-zMOUEnZR.js","/assets/BrigadirProfile-DWpPH7SW.js","/assets/BroadcastReceivers-ancoQ1hP.js","/assets/BroadcastRecord-QZ_zn5FE.js","/assets/CatLockNotice-DMKLIuPN.js","/assets/CategoryLegendModal-BKwJ_O-L.js","/assets/CellConcerns-WQVEoHQL.js","/assets/CellDetails-BianFzWB.js","/assets/CellFormModal-CZzXSsR1.js","/assets/CellIdent-D-HGM6NC.js","/assets/CellLink-BZksG8Lt.js","/assets/Cells-bGbzjQ2r.js","/assets/ColumnFilter-cFhw6qb4.js","/assets/ColumnsPicker-D96EO5xT.js","/assets/CommentsModal-CON8R6t3.js","/assets/ComparisonTable-C56_pTnN.js","/assets/Concerns-BTnqmnTD.js","/assets/ConfirmDialog-BZbw2TP6.js","/assets/Daily-DHIH81zQ.js","/assets/DataTable-NCz3Zwf5.js","/assets/DateRangePicker-CKH52SrP.js","/assets/DayReportView-Dkv6QsWg.js","/assets/DayStepper-BM7Xj1u4.js","/assets/DifferenceBreakdown-CGDRLc69.js","/assets/Downtime-ZpR6vEVE.js","/assets/Education-HjfCWXpA.js","/assets/EducationLesson-eEQdx_9t.js","/assets/EmptyState-gWsz0HoD.js","/assets/Exam-BsYSIaT7.js","/assets/FactorySelect-DcnUCcgq.js","/assets/Gamification-Bh1hw7mI.js","/assets/GroupBadge-DnSeosZW.js","/assets/HeatmapChart-CxYRHsi_.js","/assets/IdleCell-C1t8xamE.js","/assets/KPICard-BV1fN4Gd.js","/assets/Kaizen-GxTTbQVr.js","/assets/Kelish-DNLynvVk.js","/assets/KpiDeltaCard-DaYZwSFT.js","/assets/LangTextInput-Ch1p4zx-.js","/assets/Layout-sbQ3yAXK.js","/assets/LeaderAppeal-DWLWCA1h.js","/assets/LeaderDayReport-C5Nci8gW.js","/assets/LeaderUnitReport-D0__ZW7f.js","/assets/Leaderboard-rJvH8vMq.js","/assets/Leaders-BlgEOTw2.js","/assets/Lightbox-CYknlHxQ.js","/assets/LiveOverview-CucR2yPe.js","/assets/Login-DNyE0Egq.js","/assets/NotFound-nDoCuFGo.js","/assets/Notifications-BMg_Dxyz.js","/assets/Overview-CaQySlJX.js","/assets/Pagination-BStLPmyH.js","/assets/PerenaladkaFactTable-B4gy0nSV.js","/assets/PersonCard-ByPGxypG.js","/assets/PlanFulfillment-BK8gkrKD.js","/assets/Production-rh4Q3tt7.js","/assets/Profile-SWCmYc2W.js","/assets/ProofCamera-ByhXOnaU.js","/assets/ProofPhoto-DCQmw2lW.js","/assets/Quality-C2NIeID9.js","/assets/RawRows-D28aLSnm.js","/assets/RequestStateChip-DpK6Kv2M.js","/assets/RichTextEditor-B_ydx1rb.js","/assets/SaveState-DjIAOtkv.js","/assets/SearchInput-DrDELdnY.js","/assets/SeasonalityHeatmap-BBbuCz3b.js","/assets/SegmentedToggle-xHz3eQcT.js","/assets/SetupTimes-zH0b1-XE.js","/assets/ShiftDaily-ClLrVHnP.js","/assets/Staff-BvJBVT2R.js","/assets/StaffLive-ewZrRWlX.js","/assets/StatusBadge-tOnfjwel.js","/assets/TargetGoal-CVqWFRre.js","/assets/Targets-DF5Fr1oH.js","/assets/Tasks-DCO6h63p.js","/assets/TimeWheelPicker-CJehy0wi.js","/assets/Toast--gKhP1Yn.js","/assets/Tooltip-BGFHAuKq.js","/assets/TrendChart-abzUnYBl.js","/assets/TripleSpeedometer-Cqd48gwz.js","/assets/Trudoyomkost-CXPYSHHr.js","/assets/UploadDropzone-COfXuNnL.js","/assets/UsersActivity-sC1tkGeM.js","/assets/VerdictBlock-C5sWxuln.js","/assets/VfxApiMap-zqM776tU.js","/assets/VfxDictionaries-DK2fmQ4K.js","/assets/VfxEmployees-zu5DA8NJ.js","/assets/VfxHrMoves-BFJITeXr.js","/assets/VfxJobs-BH7I-pzN.js","/assets/VfxPhoto-CgjiJ_d7.js","/assets/VfxShifts-2WVzcLOs.js","/assets/VfxState-DUFO0waq.js","/assets/VfxTimebooks-VzNIAiVO.js","/assets/VfxTimesheet-CqtraMzu.js","/assets/WatchProgress-PYOCxzpn.js","/assets/WebLogin-CqtPtSRc.js","/assets/WorkerConcerns-B59Uxb2i.js","/assets/Workers-C_vouSJz.js","/assets/Zagruzka-D8XHKJjT.js","/assets/ZagruzkaCell-asZV3Fvj.js","/assets/api-giSaRgsm.js","/assets/archive-DbyVMyDq.js","/assets/archive-restore-DU4mMq1r.js","/assets/arrow-down-hQ0TYvMH.js","/assets/arrow-left-CRbYCR3w.js","/assets/arrow-up-9vxnkX-h.js","/assets/arrow-up-narrow-wide-DlxwkQUA.js","/assets/arrow-up-right-Df1BVcWM.js","/assets/award-BOJ5YjrG.js","/assets/ban-DaqGaaNT.js","/assets/bot-C8pKrx0H.js","/assets/boxes-Cfb87eQT.js","/assets/braces-CqWRBpWE.js","/assets/brigadirFilters-DXL-U5A5.js","/assets/broadcastTree-CptHyn3M.js","/assets/building-2-DbfIvEvk.js","/assets/calendar-CdPwGQqu.js","/assets/calendar-days-BRJK7dm1.js","/assets/camera-BGAavq3u.js","/assets/categories-gRgLWH55.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dqnt8DZF.js","/assets/chart-line-B3tWZ73o.js","/assets/chart-pie-Kqcq89o8.js","/assets/chartRange-egip_xkM.js","/assets/check-check-DMHiSco8.js","/assets/chevron-left-CiGRd1pY.js","/assets/chevrons-up-down-B-gf8I2E.js","/assets/circle-BqRCtLsj.js","/assets/circle-alert-T6QW-fIt.js","/assets/circle-check-big-DAHGm5S6.js","/assets/circle-dashed-DtWNNGNX.js","/assets/circle-minus-CoyG1zBY.js","/assets/circle-question-mark-0KBj1CcD.js","/assets/circle-slash-BQuZvD9O.js","/assets/circle-user-round-JGEppiej.js","/assets/clock-3-BvTsUZcu.js","/assets/cloud-off-29ifpRvv.js","/assets/cloud-upload-BWPt9ym5.js","/assets/compass-BNVPV7ib.js","/assets/concernCategories-CZkFU1iD.js","/assets/copy-DGoojCPY.js","/assets/corner-down-right-BECara6j.js","/assets/createLucideIcon-CzxOURDW.js","/assets/es-dSAuDyl8.js","/assets/exportXlsx-Bs63NxNJ.js","/assets/external-link-BjHea2cj.js","/assets/file-clock-Db1-j954.js","/assets/file-exclamation-point-hf3p9NTn.js","/assets/file-spreadsheet-D3ZpCNoM.js","/assets/file-text-BP_JpUdt.js","/assets/flag-CleHR_Lv.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bxx2AY_r.js","/assets/hash-CVdxWsSZ.js","/assets/history-CiOFd1Co.js","/assets/hourglass-DFLMuZwo.js","/assets/image-DHYaUYmw.js","/assets/image-off-W9uHMcBJ.js","/assets/inbox-C1-IMuOH.js","/assets/index-BngiOmj1.css","/assets/index-igInUXDg.js","/assets/key-round-BB_2-CLq.js","/assets/keyboard-hQ8ChcIw.js","/assets/languages-B6YmrfzX.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BxWsvBFH.js","/assets/lightbulb-CPx4-Igv.js","/assets/link-2-DgMpNTaj.js","/assets/link-2-off-CUoeXhTv.js","/assets/list-ordered-IkXOIXF7.js","/assets/list-tree-CoFr5iKn.js","/assets/lock-open-BOe2_Qxx.js","/assets/log-in-CgTctT6i.js","/assets/maximize-2-DRSoGQyY.js","/assets/message-square-1stwDoof.js","/assets/minimize-2-BR7_K9On.js","/assets/package-check-DJWm3NOk.js","/assets/paperclip-CFaSSxYF.js","/assets/pencil-ClL9kG4q.js","/assets/percent-CcxTVcnD.js","/assets/pin-KBQQMiWJ.js","/assets/pin-off-CDKRNobE.js","/assets/play-Ct8PdCUd.js","/assets/plug-zap-CKFOQe8g.js","/assets/presentation-CbWmkjDL.js","/assets/prop-types-CV9tp8Jq.js","/assets/radio-yADao_Wa.js","/assets/react-apexcharts.esm-BnMSEq6F.js","/assets/registers-B0WG016H.js","/assets/repeat-CfS1k0x6.js","/assets/rotate-ccw-8PR2tKRC.js","/assets/rotate-cw-DpoBZkjn.js","/assets/save-BeMKuU9G.js","/assets/scopeLinks-CRQ8WNII.js","/assets/scroll-text-CTSBoZxA.js","/assets/search-x-DPZJpVEM.js","/assets/segments-C9T18_xC.js","/assets/send-BoL0oS6z.js","/assets/settings-2-CjWi-ZKZ.js","/assets/shield-C6OarBI5.js","/assets/shield-alert-DM-wmf54.js","/assets/shield-check-DxJ6a87h.js","/assets/shield-question-mark-cvvSYYJZ.js","/assets/siren-labIhAf1.js","/assets/snowflake-DyEEcajq.js","/assets/split-CXQpW5XY.js","/assets/square-check-big-JnNyZg_X.js","/assets/square-i0aFzL0I.js","/assets/star-B2TfKoMC.js","/assets/statusBands-BuEIfiv7.js","/assets/store-B9sqKo8a.js","/assets/table-2-DIIn_ilR.js","/assets/table-properties-BI8Gbewc.js","/assets/tag-4MapVZS3.js","/assets/timer-off-fupWR9rI.js","/assets/trending-down-k6jz497b.js","/assets/trending-up-CIo2pIJ4.js","/assets/undo-2-BwRtoBbY.js","/assets/useChartTheme-CDlH9NUF.js","/assets/useElementWidth-EdCt7yHe.js","/assets/useIsMobile-DlO99blo.js","/assets/useOpenParam-Ca5TC5X1.js","/assets/useStatusBands-CF9ccNBK.js","/assets/useUrlScope-_xccjWbU.js","/assets/user-Bflz-9C-.js","/assets/user-cog-DC2lyEYu.js","/assets/user-minus-O8iAa_pW.js","/assets/users-Cc31zpgI.js","/assets/video-D9bhvKXS.js","/assets/wallet-BHMa8Bki.js","/assets/warehouse-DZ3uuwa6.js","/assets/x-BR7ZPtJJ.js","/assets/zap-BddhYqyb.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
