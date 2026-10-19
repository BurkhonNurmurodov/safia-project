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

const BUILD = "2026-10-19T07:15:08.649Z";
const PRECACHE = ["/","/assets/AdminPanel-DK07mM86.js","/assets/AnalysisBoard-B7s_alMc.js","/assets/Arc-BIcisIbm.js","/assets/Assistant-DgUaOOFC.js","/assets/BrigadirProfile-BoLmZ5SJ.js","/assets/BroadcastReceivers-BL7nR__3.js","/assets/BroadcastRecord-DLyUtiFa.js","/assets/Button-CsV0S3ZY.js","/assets/CatLockNotice-DzXir0G6.js","/assets/CategoryLegendModal-BbVRUotc.js","/assets/CellConcerns-P5jgZh2g.js","/assets/CellDetails-BPUkyhdz.js","/assets/CellFormModal-b_Pj_Zgf.js","/assets/CellIdent-Q780wtPp.js","/assets/CellLink-GrXpJ2u9.js","/assets/Cells-DwUeYRHF.js","/assets/ColumnFilter-BV8llyFF.js","/assets/ColumnsPicker-CuEoCP8o.js","/assets/CommentsModal-BKITWC1y.js","/assets/ComparisonTable-SzrI4py8.js","/assets/Concerns-DQl5ZSwA.js","/assets/CountStepper-CumSw7i0.js","/assets/Daily-Dq7XWdF-.js","/assets/DataTable-C07XrFh_.js","/assets/DateRangePicker-DHbEw-x7.js","/assets/DayReportView-DFy482t3.js","/assets/DayStepper-DBDP76u9.js","/assets/DifferenceBreakdown-8jXBm5X1.js","/assets/Downtime-DPsVo68Z.js","/assets/Education-iij6MlBN.js","/assets/EducationLesson-DDH6qdhF.js","/assets/EmptyState-BgKrGpYn.js","/assets/Exam-BmVnNvuk.js","/assets/FactorySelect-Mr5IzpnY.js","/assets/Gamification-3wYC12RH.js","/assets/GroupBadge-Dq-whJqX.js","/assets/HeatmapChart-CJ_K7bZp.js","/assets/IdleCell-Ca4dXBr-.js","/assets/KPICard-Dg0QeorL.js","/assets/Kaizen-WhxO40-V.js","/assets/Kelish-CJ8ZhR0q.js","/assets/KpiDeltaCard-BiPrlRR-.js","/assets/LangTextInput-DNp1WYp3.js","/assets/Layout-D1elFArW.js","/assets/LeaderAppeal-B5Bx80W4.js","/assets/LeaderDayReport-B7c78oB4.js","/assets/LeaderUnitReport-Dlqwnmrj.js","/assets/Leaderboard-Bs8Yi5wJ.js","/assets/Leaders-DVYIEcB2.js","/assets/LeadersKpi-C3OjoK6g.js","/assets/Lightbox-DpXVg9gs.js","/assets/LiveOverview-CuY04Lms.js","/assets/Login-VFtFCAsF.js","/assets/NotFound-_MAxpe4X.js","/assets/Notifications-CkjmZXqZ.js","/assets/Overview-CbbiSZom.js","/assets/Pagination-CBOx6sV0.js","/assets/PerenaladkaFactTable-DWyfSOJh.js","/assets/PersonCard-BgFZ3Q_f.js","/assets/PlanFulfillment-E-07_pO1.js","/assets/Production-7shqclCI.js","/assets/Profile-CWdJDLoY.js","/assets/ProofCamera-BSYC8VCW.js","/assets/ProofPhoto-D252lRyu.js","/assets/Quality-DjJ7CzR6.js","/assets/RawRows-B9mXnoae.js","/assets/RequestStateChip-BgPjXAC6.js","/assets/RichTextEditor-CIknO_ll.js","/assets/SaveState-DzUertoH.js","/assets/SearchInput-D4FGDpeH.js","/assets/SeasonalityHeatmap-T8vkOYVF.js","/assets/SegmentedToggle-CxuHzmxO.js","/assets/SetupTimes-CYJfu1Ci.js","/assets/ShiftDaily-Dw_zucEP.js","/assets/Staff-Cgyq7sqK.js","/assets/StaffListAtCheck-DT4Foq5i.js","/assets/StatusBadge-Bg8ZMdNk.js","/assets/TargetGoal-CkRSrNl8.js","/assets/Targets-DiGb4_mG.js","/assets/Tasks-TeQKys27.js","/assets/TimeWheelPicker-B14ZoA63.js","/assets/Toast-CI0-TeLW.js","/assets/Tooltip-C6Mwz_lJ.js","/assets/TrendChart-IJM3Ufzc.js","/assets/TripleSpeedometer-pVNAxY8e.js","/assets/Trudoyomkost-CPlv6L7k.js","/assets/UploadDropzone-BxnpGRKe.js","/assets/UsersActivity-CNk-9LLb.js","/assets/VerdictBlock-B_nXEKjW.js","/assets/VfxApiMap-D1AYaOy4.js","/assets/VfxDictionaries-D8x1RMg0.js","/assets/VfxEmployees-mnp4QQk0.js","/assets/VfxHrMoves-BRmGmeiB.js","/assets/VfxJobs-CkxmQglT.js","/assets/VfxPhoto-BF_4Xggr.js","/assets/VfxShifts-l82A1cX0.js","/assets/VfxState-BEqcMiRF.js","/assets/VfxTimebooks-DK7hIGrF.js","/assets/VfxTimesheet-DjqhDQpF.js","/assets/WatchProgress-Cw780-jr.js","/assets/WebLogin-CFs2AdkH.js","/assets/Workers-CAbMVg-3.js","/assets/Zagruzka-CMRJ1wVa.js","/assets/ZagruzkaCell-lph20eu4.js","/assets/api-qBn4pHZE.js","/assets/archive-D8EVhAcP.js","/assets/archive-restore-CroJlzRR.js","/assets/arrow-down-Cr3HPO_z.js","/assets/arrow-down-wide-narrow-g3dP7Ha-.js","/assets/arrow-up-narrow-wide-Cs37KalI.js","/assets/ban-N56GfaBT.js","/assets/boxes-qaOAvzZh.js","/assets/braces-DL-mQv7D.js","/assets/brigadirFilters-DvphFnEo.js","/assets/broadcastTree-Brwgh0x6.js","/assets/building-2-C_xH6NBf.js","/assets/calculator-DmQUPbOJ.js","/assets/calendar-DC2sVMwP.js","/assets/calendar-days-TfoDI9xe.js","/assets/camera-BijTNkRG.js","/assets/categories-BNmVJOq5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B2iivHnw.js","/assets/chart-line-DFK9lRDz.js","/assets/chart-pie-D3V0jBFc.js","/assets/chartRange-B_28Ewe6.js","/assets/check-check-CVJAQztY.js","/assets/chevron-left-BUM6KcMY.js","/assets/chevrons-up-down-DGqOU3aw.js","/assets/circle-D-Ni_afz.js","/assets/circle-alert-B8q-Av0Q.js","/assets/circle-check-big-B28oCwvw.js","/assets/circle-dashed-DpoJiyCN.js","/assets/circle-minus-zH-cy8zP.js","/assets/circle-question-mark-BbXo30Qb.js","/assets/circle-slash-CyRlnXj8.js","/assets/circle-user-round-CN9A420_.js","/assets/cloud-off-B8kTmqK_.js","/assets/cloud-upload-CZRF7qmI.js","/assets/compass-DEMJanWg.js","/assets/concernCategories-D6jHqvPR.js","/assets/corner-down-right-DPNbOjtw.js","/assets/createLucideIcon-I5z8Il2t.js","/assets/es-CFaXkevU.js","/assets/external-link-DTmG1M9a.js","/assets/file-clock-DBQQOiL1.js","/assets/file-exclamation-point-Co6phHLQ.js","/assets/flag-DBcSwFkM.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cvcz-_PX.js","/assets/hash-BUjKDFbm.js","/assets/hourglass-BbyTCRDv.js","/assets/image-IPZdlvn9.js","/assets/image-off-5fX-Sze_.js","/assets/inbox-DOdBEeIn.js","/assets/index-DDIX4fUW.js","/assets/index-jMiXE-EF.css","/assets/keyboard-CZrWLl0R.js","/assets/languages-B68vUP0i.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CN4swNMz.js","/assets/lightbulb-CRgcTEOh.js","/assets/link-2-W8eSrQL5.js","/assets/link-2-off-BXX_UCvw.js","/assets/list-ordered-DvVi5ILy.js","/assets/list-tree-DNyl9EZy.js","/assets/lock-open-BU84OgjW.js","/assets/log-in-CheBbyZY.js","/assets/marks-C4chOVeq.js","/assets/minimize-2-BSDpuS3y.js","/assets/package-check-D3rna3_N.js","/assets/pencil-DWXT1IUc.js","/assets/percent-DqEZzdK8.js","/assets/pin-b6eBsPUw.js","/assets/pin-off-CXwiNatT.js","/assets/play-DfTzYsA9.js","/assets/plug-zap-B1Zi1BNi.js","/assets/prop-types-C0l9o2Ho.js","/assets/radio-BZr-PKEc.js","/assets/react-apexcharts.esm-DC0EDJlh.js","/assets/registers-AOtMxLMT.js","/assets/repeat-WTTPjLmL.js","/assets/save-DOx28KCP.js","/assets/scopeLinks-DLk9b7ai.js","/assets/scroll-text-C2xAtkqA.js","/assets/search-x-DypLOhBE.js","/assets/segments-eOmwIcMc.js","/assets/send-Cwuqtvcx.js","/assets/settings-2-zn7Tsb6y.js","/assets/shield-0h1GsfKJ.js","/assets/shield-alert-5efmu974.js","/assets/shield-question-mark-C9NgbMnx.js","/assets/siren-DdBNyRlZ.js","/assets/snowflake-IDLnXVqv.js","/assets/split-BVzQ3AzV.js","/assets/square-check-big-Ufp4fSOz.js","/assets/star-DEgsMWfb.js","/assets/statusBands-CWzZPd2m.js","/assets/store-Mjy2REMY.js","/assets/table-2-DG-NC0hC.js","/assets/table-properties-CmocayUz.js","/assets/tag-Dv-Hoju-.js","/assets/timer-off-DSXoR4uY.js","/assets/trending-down-CGqN4Fwe.js","/assets/trending-up-Cq_PW2cT.js","/assets/undo-2-DuBGPF9r.js","/assets/useChartTheme-H44WQHTd.js","/assets/useElementWidth-BiVKXJJ2.js","/assets/useIsMobile-BpKd3uyr.js","/assets/useOpenParam-BYzwGEKT.js","/assets/useStatusBands-irIfqRh5.js","/assets/useUrlScope-DyWB531D.js","/assets/user-BQqif0CC.js","/assets/user-cog-BKsTKWSY.js","/assets/user-minus-CnuR1YW9.js","/assets/users-BovEQVDF.js","/assets/vfx-DVsOIp7K.js","/assets/video-CpoI9sXI.js","/assets/wallet-yB7_zI9Y.js","/assets/warehouse-Bhssh1aG.js","/assets/workflow-CPZS4_Qa.js","/assets/x-CKXsMPm_.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
