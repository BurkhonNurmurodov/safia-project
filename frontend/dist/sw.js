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

const BUILD = "2026-10-19T05:42:08.940Z";
const PRECACHE = ["/","/assets/AdminPanel-CCk0quZ3.js","/assets/AnalysisBoard-2NmPkHNa.js","/assets/Arc-Du28cjWh.js","/assets/Assistant-BGorM3dG.js","/assets/BrigadirProfile-BYy8V4si.js","/assets/BroadcastReceivers-DHcX-eQS.js","/assets/BroadcastRecord-BZdJfKzm.js","/assets/Button-BxhAoRt4.js","/assets/CatLockNotice-Axn6jXHf.js","/assets/CategoryLegendModal-CWOozPQm.js","/assets/CellConcerns-BLUnLvb7.js","/assets/CellDetails-CcNjXkDN.js","/assets/CellFormModal-C05n5WGi.js","/assets/CellIdent-Bwd1nOXL.js","/assets/CellLink-DD_3Opj5.js","/assets/Cells-BandwuMJ.js","/assets/ColumnFilter-CeIgOJ54.js","/assets/ColumnsPicker-CHCM10hC.js","/assets/CommentsModal-KBJxxVXv.js","/assets/ComparisonTable-C0rz0OFB.js","/assets/Concerns-Csu9_m3F.js","/assets/CountStepper-D_jPTngV.js","/assets/Daily-dUZUDOMr.js","/assets/DataTable-D7YJ2jI1.js","/assets/DateRangePicker-B-gR98GY.js","/assets/DayReportView-qeir1GEq.js","/assets/DayStepper-DC2b0e0G.js","/assets/DifferenceBreakdown-Cksjb1bT.js","/assets/Downtime--yLVhh_S.js","/assets/Education-QAec2Y-x.js","/assets/EducationLesson-vE5_vnAY.js","/assets/EmptyState-BgMqlAY_.js","/assets/Exam-DfNYMP4V.js","/assets/FactorySelect-DG83ApH-.js","/assets/Gamification-BsFLGL5-.js","/assets/GroupBadge-C0HIF2J_.js","/assets/HeatmapChart-DTL7-zEp.js","/assets/IdleCell-Ao1bUoBf.js","/assets/KPICard-D-911s9z.js","/assets/Kaizen-CQeZ8UdK.js","/assets/Kelish-BE8UJ0rN.js","/assets/KpiDeltaCard-DAluFzrM.js","/assets/LangTextInput-BAWMuCNG.js","/assets/Layout-BDDtScoz.js","/assets/LeaderAppeal-Drs4yqwd.js","/assets/LeaderDayReport-BoDGClP9.js","/assets/LeaderUnitReport-wYHujzCq.js","/assets/Leaderboard-CETzLJZj.js","/assets/Leaders-DToOMpNg.js","/assets/LeadersKpi-DC_J2VYV.js","/assets/Lightbox-CC8EEbHB.js","/assets/LiveOverview-Briq-_Ii.js","/assets/Login-B9UqYkyP.js","/assets/NotFound-BJzJxdvX.js","/assets/Notifications-_f3FGFXe.js","/assets/Overview-CxqlDmwG.js","/assets/Pagination-BCm3b01e.js","/assets/PerenaladkaFactTable-CTIfY6MU.js","/assets/PersonCard-BCG-VYa8.js","/assets/PlanFulfillment-Pqv_2-1Q.js","/assets/Production-CSOC4sbF.js","/assets/Profile-DSHtcfcX.js","/assets/ProofCamera-QWZdYTO5.js","/assets/Quality-DdeThp67.js","/assets/RawRows-CXLoMyyX.js","/assets/RequestStateChip-CWoyLHKs.js","/assets/RichTextEditor-DhlmQ0sy.js","/assets/SaveState-Bk4oSAaE.js","/assets/SearchInput-DEo-oNxe.js","/assets/SeasonalityHeatmap-BgFo0NoT.js","/assets/SegmentedToggle-CXg0sDG8.js","/assets/SetupTimes-GLBA7FZA.js","/assets/ShiftDaily-DkaqexlD.js","/assets/Staff-CIU7fddf.js","/assets/StaffListAtCheck-BPsD_qeH.js","/assets/StatusBadge-CVetQ-GL.js","/assets/TargetGoal-C19qjMIi.js","/assets/Targets-CPkHypVN.js","/assets/Tasks-BopNt1cC.js","/assets/TimeWheelPicker-DG_5OSha.js","/assets/Toast-Du1hTYeA.js","/assets/Tooltip-72YxEgKM.js","/assets/TrendChart-CANs9Sjt.js","/assets/TripleSpeedometer-jsfdf1qL.js","/assets/Trudoyomkost-B3a8SO5l.js","/assets/UploadDropzone-D-fB-gnI.js","/assets/UsersActivity-D8ir9qQL.js","/assets/VerdictBlock-DmtNINQK.js","/assets/VfxApiMap-D47lKyRT.js","/assets/VfxDictionaries-1Wgt3F5W.js","/assets/VfxEmployees-D6xhG3-W.js","/assets/VfxHrMoves-BW74_1dy.js","/assets/VfxJobs-DeQMytCG.js","/assets/VfxPhoto-0M2hHmRo.js","/assets/VfxShifts-BGXHREuj.js","/assets/VfxState-WjcNYMxk.js","/assets/VfxTimebooks-Cn6q4sEs.js","/assets/VfxTimesheet-BI_C2gRm.js","/assets/WatchProgress-BuRfbZne.js","/assets/WebLogin-DSbk-w4K.js","/assets/Workers-AQVeyXKV.js","/assets/Zagruzka-CNyydMDZ.js","/assets/ZagruzkaCell-TMHIGBQk.js","/assets/api-BOubvSRj.js","/assets/archive-FHlNhazs.js","/assets/archive-restore-DHMzdic1.js","/assets/arrow-down-D4p0cCG7.js","/assets/arrow-down-wide-narrow-COnMRD25.js","/assets/arrow-up-narrow-wide-Dr2aiBSz.js","/assets/ban-Dv8GQfxl.js","/assets/boxes-W4wzfsgD.js","/assets/braces-r4qI6L74.js","/assets/brigadirFilters-hjQ5k7bl.js","/assets/broadcastTree-Cvvppdmt.js","/assets/building-2-HwH2TRP3.js","/assets/calculator-C7is7xQU.js","/assets/calendar-DD5Xcp9N.js","/assets/calendar-days-DgJHVH-0.js","/assets/camera-Cgoacxeu.js","/assets/categories-1Aan-A3Q.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B7EapjIk.js","/assets/chart-line-CQI4rUdD.js","/assets/chart-pie-Bv-79AdY.js","/assets/chartRange-Dsc2NG3D.js","/assets/check-check-Br6wjkpV.js","/assets/chevron-left-TVbWgPt6.js","/assets/chevrons-up-down-Cwjngu18.js","/assets/circle-D78czuvc.js","/assets/circle-alert-CvpsR0Up.js","/assets/circle-check-big-DzVR6Gqw.js","/assets/circle-dashed-BfS8FOkf.js","/assets/circle-minus-CjBgGT8E.js","/assets/circle-question-mark-k8hRGA3h.js","/assets/circle-slash-Bf6pdRi2.js","/assets/circle-user-round-C10wwHtW.js","/assets/cloud-off-BU-CgSgi.js","/assets/cloud-upload-CtOPIlae.js","/assets/compass-DaCIPQ8D.js","/assets/concernCategories-CKWRj-7E.js","/assets/corner-down-right-BaySdfwe.js","/assets/createLucideIcon-7JDeCCD0.js","/assets/es-DtCB9NAn.js","/assets/external-link-C7pA92G2.js","/assets/file-clock-Cn9jElYR.js","/assets/file-exclamation-point-D8MelcSt.js","/assets/flag-DQfJAAk_.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BXL88nSu.js","/assets/hash-UWU9wO1h.js","/assets/hourglass-BWDtRtF0.js","/assets/image-BPgFb8MK.js","/assets/image-off-N5Aqpacn.js","/assets/inbox-CqH-aiel.js","/assets/index-CNHWELdq.js","/assets/index-Dq1SQhBC.css","/assets/keyboard-DXdhJkiX.js","/assets/languages-kf_Xu_TO.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-7evSUJXU.js","/assets/lightbulb-B_iItBOT.js","/assets/link-2-CjJ92SLF.js","/assets/link-2-off-CxiGooXH.js","/assets/list-ordered-Cflm4y1s.js","/assets/list-tree-C6FHIVFd.js","/assets/lock-open-C59Wys57.js","/assets/log-in-Bhk8zKru.js","/assets/marks-CugT-3k6.js","/assets/minimize-2-a0ZwaGjF.js","/assets/package-check-BjMGfLvH.js","/assets/pencil-UdgRQ0fI.js","/assets/percent-COObyhpV.js","/assets/pin-DXzKl2oQ.js","/assets/pin-off-DS8kL2ku.js","/assets/play-NxGM7x52.js","/assets/plug-zap-DBNylFX_.js","/assets/prop-types-CUzRvwNe.js","/assets/radio-7YWofLAq.js","/assets/react-apexcharts.esm-Cm8U_Vzi.js","/assets/registers-C1gIIIKi.js","/assets/repeat-fG-mCW-i.js","/assets/save-OTo7rIJS.js","/assets/scopeLinks-B01evwEb.js","/assets/scroll-text-DqkgFpV3.js","/assets/search-x-YzV5hE9X.js","/assets/segments-1hyIoqNq.js","/assets/send-DGH39HHz.js","/assets/settings-2-BzznlP1V.js","/assets/shield-alert-yKiGfXuf.js","/assets/shield-cPQf326j.js","/assets/shield-question-mark-DnkiAh-z.js","/assets/siren-DBnPUDAq.js","/assets/snowflake-CVVwpsBu.js","/assets/split-B_yrQ34O.js","/assets/square-check-big-DDCUG_th.js","/assets/star-CvobyUxs.js","/assets/statusBands-CA5JnEu7.js","/assets/store-DZS4CL5V.js","/assets/table-2-BQ4Xlbp0.js","/assets/table-properties-D6uJXJjU.js","/assets/tag-DHp_7qpC.js","/assets/timer-off-CBoxxnYU.js","/assets/trending-down--SwcgFZz.js","/assets/trending-up-DcOR9tmw.js","/assets/undo-2-ly3kMFo0.js","/assets/useChartTheme-B3xmDJGs.js","/assets/useElementWidth-CoqUQqvH.js","/assets/useIsMobile-C2CoOx1Z.js","/assets/useOpenParam-DLYvqYBe.js","/assets/useStatusBands-DhC2Mgwf.js","/assets/useUrlScope-Bcq_NBFu.js","/assets/user-CgZ5VyoW.js","/assets/user-cog--ZV8XzQ6.js","/assets/user-minus-O4lsRKQJ.js","/assets/users-C2m5lsBD.js","/assets/vfx-JygJBXS9.js","/assets/video-DtJzuypQ.js","/assets/wallet-aLMs81qq.js","/assets/warehouse-HgjHI-Il.js","/assets/workflow-MwT4dTou.js","/assets/x-C3HJK6hB.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
