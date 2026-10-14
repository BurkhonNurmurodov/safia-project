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

const BUILD = "2026-10-14T16:24:16.652Z";
const PRECACHE = ["/","/assets/AdminPanel-CZnQm1Zt.js","/assets/AnalysisBoard-so0CrtZd.js","/assets/Arc-Dq95Y_mY.js","/assets/Assistant-B2Nz7ivl.js","/assets/BrigadirProfile-BneTgjew.js","/assets/BroadcastReceivers-qkfSFzQ3.js","/assets/BroadcastRecord-DVtMh9FY.js","/assets/Button-C6ZOgEEx.js","/assets/CatLockNotice-CSAXjz1U.js","/assets/CategoryLegendModal-BETkQiRu.js","/assets/CellConcerns-BqC1YvrP.js","/assets/CellDetails-Bh76sO-T.js","/assets/CellFormModal-_UEcPSqv.js","/assets/CellIdent-DaHXuZ7H.js","/assets/CellLink-BiJhYm_2.js","/assets/Cells-DC63H4jR.js","/assets/ColumnFilter-DoAfcila.js","/assets/ColumnsPicker-DwvS7eoP.js","/assets/CommentsModal-DjT-ZL8g.js","/assets/ComparisonTable-PcClonRX.js","/assets/Concerns-0nQ_VUDv.js","/assets/CountStepper-D67VCVub.js","/assets/Daily-DXN0txxs.js","/assets/DataTable-NGAG5p8e.js","/assets/DateRangePicker-CXvaoup4.js","/assets/DayReportView-DvDwy3NG.js","/assets/DayStepper-djDhPk19.js","/assets/DifferenceBreakdown-B_ok9ms7.js","/assets/Downtime-CL2QfZzp.js","/assets/Education-DBR6kG2K.js","/assets/EducationLesson-DurYuShK.js","/assets/EmptyState-CaB-tz0d.js","/assets/Exam-D1zoK_fe.js","/assets/FactorySelect-ABH7CL65.js","/assets/Gamification-DA7hJYkx.js","/assets/GroupBadge-sTqMkrhK.js","/assets/HeatmapChart-DqrdCzws.js","/assets/IdleCell-Cc2SaQzS.js","/assets/KPICard-CKSn5rH_.js","/assets/Kaizen-SJn9JMNf.js","/assets/Kelish-BZSIQ1aG.js","/assets/KpiDeltaCard-vnQp5XZ5.js","/assets/LangTextInput-BhUKXp2W.js","/assets/Layout-D_ttKkGv.js","/assets/LeaderAppeal-J6mQBaZV.js","/assets/LeaderDayReport-BUuKk209.js","/assets/LeaderUnitReport-VlXXE2bL.js","/assets/Leaderboard-DSSC2R7c.js","/assets/Leaders-CRwrk514.js","/assets/Lightbox-D96tc-BY.js","/assets/LiveOverview-Cb1UTzCi.js","/assets/Login-CtVrLMCu.js","/assets/NotFound-veparh6I.js","/assets/Notifications-Cd3BHcYt.js","/assets/Overview-7fj639nv.js","/assets/Pagination-DaWTF6fH.js","/assets/PerenaladkaFactTable-D1daMmCV.js","/assets/PersonCard-CMCDSggp.js","/assets/PlanFulfillment-D5oHu9au.js","/assets/Production-Bfe5ugeu.js","/assets/Profile-gncRYh8_.js","/assets/ProofCamera-CF8T3QyB.js","/assets/Quality-DbUcYfzU.js","/assets/RawRows-B9_Yz36L.js","/assets/RequestStateChip-Bn3NVUJ6.js","/assets/RichTextEditor-BsDHizuu.js","/assets/SaveState-D4Rb6Iso.js","/assets/SearchInput-CQkqmoVm.js","/assets/SeasonalityHeatmap-_efoGOji.js","/assets/SegmentedToggle-BNka-_p7.js","/assets/SetupTimes-CBb8t31w.js","/assets/ShiftDaily-Dzc-sGlF.js","/assets/Staff-Gaj6rfLH.js","/assets/StaffListAtCheck-DkBBdj1C.js","/assets/StatusBadge-PJoGx8Lp.js","/assets/TargetGoal-BKPUj3RU.js","/assets/Targets-DhA__gPc.js","/assets/Tasks-ZpMCp1AU.js","/assets/TimeWheelPicker-D2wVqHGb.js","/assets/Toast-CAtxw7Qk.js","/assets/Tooltip-BjAJvdCl.js","/assets/TrendChart-C6TDzNSA.js","/assets/TripleSpeedometer-Do3XhIqG.js","/assets/Trudoyomkost-4lBYi9DK.js","/assets/Turnover-CnyZmySZ.js","/assets/UploadDropzone-KgMuJm1K.js","/assets/UsersActivity-DD9loPiN.js","/assets/VerdictBlock-DLherCIC.js","/assets/VfxApiMap-Ds5EZBjq.js","/assets/VfxDictionaries-BJUt4ocj.js","/assets/VfxEmployees-BzqYdt7v.js","/assets/VfxHrMoves-C7GYHuXW.js","/assets/VfxJobs-D6qlnVL0.js","/assets/VfxPhoto-CDMM6hP6.js","/assets/VfxShifts-CFKtghqX.js","/assets/VfxState-Dn0e7wbc.js","/assets/VfxTimebooks-DUHyZdN-.js","/assets/VfxTimesheet-BwDE9Hy6.js","/assets/WatchProgress-DcpY1qQD.js","/assets/WebLogin-OgVnBCQW.js","/assets/WorkerConcerns-CCCXMhf7.js","/assets/Workers-BSQndTDv.js","/assets/Zagruzka-DIk-KPsz.js","/assets/ZagruzkaCell-BsrHD0um.js","/assets/api-0hi08ELZ.js","/assets/archive-DyxwKsS5.js","/assets/archive-restore-Dc4XyN2K.js","/assets/arrow-down-DUZwzLjG.js","/assets/arrow-down-wide-narrow-Ce0SyvC-.js","/assets/arrow-up-narrow-wide-BwjeaACO.js","/assets/award-DsAAldu3.js","/assets/ban-BjRkIla9.js","/assets/boxes-328-rCan.js","/assets/braces-CmcnsViN.js","/assets/brigadirFilters-CHR4SPXb.js","/assets/broadcastTree-BzDO3TjF.js","/assets/building-2-BICHBOYc.js","/assets/calculator-DknKvDzs.js","/assets/calendar-PySlacV8.js","/assets/calendar-days-DlsGz02n.js","/assets/camera-D6Sk5qgL.js","/assets/categories-DiFCfJU8.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DkwHc6Ar.js","/assets/chart-line-DLlNPm-j.js","/assets/chart-pie-B6fJNz9r.js","/assets/chartRange-BOtTEApd.js","/assets/check-check-k6JFSB1F.js","/assets/chevron-left-D0oU70Tp.js","/assets/chevrons-up-down-DcIsx0uB.js","/assets/circle-DiJaS8XU.js","/assets/circle-alert-C4pdrcVx.js","/assets/circle-check-big-C6Kwf2Ph.js","/assets/circle-dashed-CEBxmVJw.js","/assets/circle-minus-DMdE1ioI.js","/assets/circle-question-mark-BySNnZcC.js","/assets/circle-slash-D6WrpV0W.js","/assets/circle-user-round-CbL3JMrJ.js","/assets/clock-3-fp_T5pwC.js","/assets/cloud-off-BNon3aop.js","/assets/cloud-upload-B-fgmlJR.js","/assets/compass-DzU__ACd.js","/assets/concernCategories-BGWiaoD1.js","/assets/copy-D44s60tF.js","/assets/corner-down-right-Dss_hP9v.js","/assets/createLucideIcon-D4jGR8XZ.js","/assets/es-vEpXPQbF.js","/assets/external-link-CYyQU1q8.js","/assets/file-clock-DkL9web7.js","/assets/file-exclamation-point-llGA3Js4.js","/assets/flag-CJY3mPnA.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-RtTto4HE.js","/assets/hash-Dcm5d8GU.js","/assets/hourglass-xPEqBSsg.js","/assets/image-CqSAObrb.js","/assets/image-off-CrbTRk0L.js","/assets/inbox-Dl4-45iK.js","/assets/index-4hKht-uk.js","/assets/index-DWCq5gUB.css","/assets/keyboard-C0D7_1o7.js","/assets/languages-_KbPQbQD.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-PIMMV6Sf.js","/assets/lightbulb-OJOzBrFy.js","/assets/link-2-D_nOb6tf.js","/assets/link-2-off-CJmYIg3L.js","/assets/list-ordered-_zwFw3ct.js","/assets/list-tree-DC1yYO3p.js","/assets/lock-open-D1d6lf_U.js","/assets/log-in-NixEuTiu.js","/assets/marks-hf8N34m1.js","/assets/minimize-2-CTHMEYm0.js","/assets/package-check-ColjaXgw.js","/assets/pencil-BPtjXW0l.js","/assets/percent-I3tOquIZ.js","/assets/pin-CaFDXS8V.js","/assets/pin-off-HBLfDzFf.js","/assets/play-FyMCyoBu.js","/assets/plug-zap-78PGcK8L.js","/assets/prop-types-zzOApi6n.js","/assets/radio-DC2Y3dnq.js","/assets/react-apexcharts.esm-Dc4S8MGw.js","/assets/registers-BQ08B18N.js","/assets/repeat-BKGdDrvP.js","/assets/save-DFgCs8dE.js","/assets/scopeLinks-CBmW9JYM.js","/assets/scroll-text-Chatgu3e.js","/assets/search-x-VXYFXhCo.js","/assets/segments-CLzJtWLg.js","/assets/send-C-DfSVYG.js","/assets/settings-2-CUHaB-jA.js","/assets/shield-CrD4O0Gk.js","/assets/shield-alert-C2VbiNJj.js","/assets/shield-question-mark-B-qx9hM4.js","/assets/siren-BqF2C9Cn.js","/assets/snowflake-Cze0-t_N.js","/assets/split-DHmOVhte.js","/assets/square-check-big-B4DavFZd.js","/assets/star-CQAsy82h.js","/assets/statusBands-BNKNRoLm.js","/assets/store-BjO-lhSx.js","/assets/table-2-TO5aMtTU.js","/assets/table-properties-Dz2nqyY1.js","/assets/tag-Df58M6Zt.js","/assets/timer-off-CLtcyC4c.js","/assets/trending-down-D0Ylhi-t.js","/assets/trending-up-ChUhmPv5.js","/assets/undo-2-B0cBV50v.js","/assets/useChartTheme-_jeHNpd2.js","/assets/useElementWidth-ClTq8Fm0.js","/assets/useIsMobile-CCpN5xXw.js","/assets/useOpenParam-D92lT0LN.js","/assets/useStatusBands-D6XnWJBW.js","/assets/useUrlScope-nw-Hy2B1.js","/assets/user-BbBOI2Yj.js","/assets/user-cog-Di7QPHZd.js","/assets/users-C8RNdh1s.js","/assets/vfx-BqEEmoKe.js","/assets/video-DwaRd0E9.js","/assets/wallet-B5X_zV00.js","/assets/warehouse-Cm28PssJ.js","/assets/workflow-0zmwG0vj.js","/assets/x-DOLCjoFf.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
