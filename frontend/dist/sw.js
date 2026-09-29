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

const BUILD = "2026-09-29T04:42:45.998Z";
const PRECACHE = ["/","/assets/AdminPanel-DgK2_2ZW.js","/assets/AnalysisBoard-DwL46N2b.js","/assets/Arc-CY453yBC.js","/assets/ArcLegacy-By9gSffR.js","/assets/AttendanceModal-0JGEVmxM.js","/assets/BrigadirProfile-CS4otiWZ.js","/assets/BroadcastReceivers-B4fDcv7r.js","/assets/BroadcastRecord-CSZ4tJE0.js","/assets/CatLockNotice-DJSAONoD.js","/assets/CategoryLegendModal-D9U8w-Dr.js","/assets/CellConcerns-q_zEtHaJ.js","/assets/CellDetails-DlSR087Y.js","/assets/CellFormModal-DIzR0r3_.js","/assets/CellLink-BwU7INgg.js","/assets/Cells-ldWMHMEI.js","/assets/ColumnFilter-Cf3RDl2n.js","/assets/ColumnsPicker-BIoh4ijF.js","/assets/CommentsModal-BfRBYj_V.js","/assets/ComparisonTable-CZVbxqCw.js","/assets/Concerns-CA-9Fz7m.js","/assets/ConfirmDialog-DAVxEDgE.js","/assets/Daily-DSVzMMbM.js","/assets/DataTable-DdF52-BO.js","/assets/DateRangePicker-DtZr3KNq.js","/assets/DayReportView-l50KPwx_.js","/assets/DayStepper-Dgn2ByCX.js","/assets/DifferenceBreakdown-BA6t5YXX.js","/assets/Downtime-DFhej7op.js","/assets/Education-rCwE4mes.js","/assets/EducationLesson-C6elKgHJ.js","/assets/EmptyState-DEX6TA7p.js","/assets/Exam-q10luTNK.js","/assets/FactorySelect-DzR4AyAw.js","/assets/Gamification-CdUylEGv.js","/assets/GroupBadge-T22Kx78T.js","/assets/HeatmapChart-DGgvn0vK.js","/assets/IdleCell-BV5gVHUf.js","/assets/KPICard-UufP-NmN.js","/assets/Kaizen-DwLJXkL5.js","/assets/Kelish-C-3GNw_r.js","/assets/KpiDeltaCard-CIi2Lf9J.js","/assets/LangTextInput-UP-1IaZV.js","/assets/Layout-CE2RXk89.js","/assets/LeaderAppeal-DJqOSwUV.js","/assets/LeaderDayReport-CClVAiiy.js","/assets/LeaderUnitReport-BGKNHOPZ.js","/assets/Leaderboard-DRo4LMyP.js","/assets/Leaders-D87_3tFH.js","/assets/Lightbox-CKDRNsdu.js","/assets/LiveOverview-D7hH2eZ2.js","/assets/Login-DyTiKP04.js","/assets/NotFound-B9lVzpYy.js","/assets/Overview-DT6Sll0A.js","/assets/Pagination-DiPtQiZ-.js","/assets/PerenaladkaFactTable-BcqbHLpD.js","/assets/PlanFulfillment-Cx0VFYLk.js","/assets/Production-DDjeDbK7.js","/assets/Profile-DiecwXq0.js","/assets/ProofCamera-BRMQvoLQ.js","/assets/ProofPhoto-0eV5FrY0.js","/assets/Quality-DaMG7Rvz.js","/assets/RequestStateChip-DMT72wYa.js","/assets/RichTextEditor-CPBvHwCp.js","/assets/SaveState-V5pT-QED.js","/assets/SearchInput-DYn6szIl.js","/assets/SeasonalityHeatmap-D-1zN-0c.js","/assets/SegmentedToggle-DdBQzXFO.js","/assets/SetupTimes-BDaFoH8V.js","/assets/ShiftDaily-BBSQemcC.js","/assets/Staff-W9PlldYU.js","/assets/StatusBadge-DZ2mruWt.js","/assets/TargetGoal-nL2iBUPp.js","/assets/Targets-Bvbts6s5.js","/assets/Tasks-Bjtxl3KM.js","/assets/TimeWheelPicker-BeD-qjpZ.js","/assets/Tooltip-D9XccgIs.js","/assets/TrendChart-DIvYYV9j.js","/assets/TripleSpeedometer-TTxEi-pU.js","/assets/Trudoyomkost-DJlWD1nS.js","/assets/UploadDropzone-uBU-8_AH.js","/assets/UsersActivity-BuI3lIQ6.js","/assets/VerdictBlock-CHDtAewl.js","/assets/WatchProgress-VS4Dd6jD.js","/assets/WebLogin-DjZvgXiu.js","/assets/WorkerConcerns-DdzUqdRE.js","/assets/Workers-BcAJzK8I.js","/assets/Zagruzka-DsF3pyp2.js","/assets/ZagruzkaCell-D9Pf_X4Q.js","/assets/api-BGIYx-cE.js","/assets/archive-B2Nk7Pm1.js","/assets/archive-restore-B0HHYsoA.js","/assets/arrow-down-C2tmvfZO.js","/assets/arrow-left-C8t4x7Ph.js","/assets/arrow-left-right-7RA0dkoA.js","/assets/arrow-up-D2K4zwf0.js","/assets/arrow-up-right-BS1M4IUW.js","/assets/award-CPIVXPow.js","/assets/ban-4V1nvOSo.js","/assets/bot-BBpPEBWS.js","/assets/boxes-2U_r1dFQ.js","/assets/brigadirFilters-Bcc4eEeD.js","/assets/broadcastTree-B3aosuvH.js","/assets/building-2-7FjR-pUf.js","/assets/calendar-DJSDG3QO.js","/assets/calendar-clock-cPFEVKC3.js","/assets/calendar-days-Cs6nJ9MM.js","/assets/calendar-range-53X9tWjD.js","/assets/camera-CZan-Jsj.js","/assets/categories-hirZRMJC.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BBmGwhBG.js","/assets/chart-line-BgZcJHgO.js","/assets/chart-pie-D7a0VtDT.js","/assets/chartRange-CDl2Zxk5.js","/assets/chevron-left-D9-Qy-7W.js","/assets/chevrons-up-down-DIT2xd7v.js","/assets/circle-Bnqurct_.js","/assets/circle-check-big-BRo2VxdD.js","/assets/circle-dot-CyshW_F5.js","/assets/circle-minus-D7h61Mmv.js","/assets/circle-slash-VSVxNjwd.js","/assets/circle-user-round-Cw9QwRjk.js","/assets/cloud-off-CPhxpI9w.js","/assets/cloud-upload-Dk3Gbyg5.js","/assets/compass-Bj23TV2h.js","/assets/concernCategories-Bmp9B-qX.js","/assets/copy-COybijH9.js","/assets/corner-down-right-7FIRv4y4.js","/assets/createLucideIcon-Ci_iD9ud.js","/assets/es-P-R39lom.js","/assets/exportXlsx-CJ1F4PJ2.js","/assets/external-link-C04-VEl9.js","/assets/file-clock-Cdga0iUN.js","/assets/file-exclamation-point-r7wcyf3Y.js","/assets/file-spreadsheet-DEBSzgnH.js","/assets/file-text-CchT61AK.js","/assets/flag-hFsmTmF9.js","/assets/flame-Bsz8E-TG.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-knkBHxJe.js","/assets/hash-CCFmKXUQ.js","/assets/history-C4V5E27n.js","/assets/hourglass-BCXvOOOr.js","/assets/image-BmGb9Z6o.js","/assets/image-off-zpZumnXL.js","/assets/index-AFSqrg7q.js","/assets/index-C5FDdCN-.css","/assets/key-round-CeXI2jxS.js","/assets/keyboard-YJdN82Av.js","/assets/languages-BUznRJ4S.js","/assets/layers-BWLg1XsQ.js","/assets/lightbulb-gaf3lcgz.js","/assets/link-2-DBTeZmbD.js","/assets/list-checks-DfJf7j91.js","/assets/list-ordered-FIwda-vp.js","/assets/list-tree-ByX_NQdg.js","/assets/lock-open-CccO3HVG.js","/assets/log-in-C2P-USW1.js","/assets/maximize-2-CH1OkHar.js","/assets/message-square-CXb5szrR.js","/assets/minimize-2-DOhj-cPh.js","/assets/package-check-Dw6MM41x.js","/assets/paperclip-DHsiSLzo.js","/assets/pencil-ixNe-TgN.js","/assets/percent-0a77AcC_.js","/assets/personName-B4KId4zS.js","/assets/pin-C96u0dUw.js","/assets/pin-off-1kiS0XiQ.js","/assets/play-17bg44WI.js","/assets/presentation-BQbrNLcp.js","/assets/prop-types-bjq_jex3.js","/assets/radio-CFIyjk4p.js","/assets/react-apexcharts.esm-Bqok7ACG.js","/assets/repeat-BoIwjPn3.js","/assets/rotate-ccw-DKdeVXqT.js","/assets/rotate-cw-KP-QQHTM.js","/assets/save-DwCuyBY2.js","/assets/scale-DYYeD8di.js","/assets/scroll-text-tUbXC99b.js","/assets/search-x-CIq0ORPv.js","/assets/segments-qPpi3Ipi.js","/assets/send-DOPw79-m.js","/assets/settings-2-CBjBmorQ.js","/assets/shield-CHeqjF6n.js","/assets/shield-alert-BBt58svW.js","/assets/shield-check-Bhu1mBCY.js","/assets/shield-question-mark-CI1GaPGL.js","/assets/siren-vNjq6M3q.js","/assets/smartphone-BUSxOo-p.js","/assets/snowflake-PMs7JmaF.js","/assets/square-BxPowKoG.js","/assets/square-check-big-UiUTqpB0.js","/assets/star-BXJh4LpS.js","/assets/statusBands-Dd_ZXW0l.js","/assets/store-BhUfD3Oo.js","/assets/table-2-BTQZkbxI.js","/assets/tag-BYmzKyaC.js","/assets/timer-off-eWtREUXu.js","/assets/trending-down-oXXaiw7w.js","/assets/trending-up-DX0PFq1O.js","/assets/undo-2-BveYc-lN.js","/assets/useChartTheme-fFvcZ-d0.js","/assets/useElementWidth-pZg1O6OY.js","/assets/useIsMobile-DhteGfx9.js","/assets/useMutation-BhcB0Ci8.js","/assets/useStatusBands-B1bd2Giv.js","/assets/user-CicvSRut.js","/assets/user-cog-0Zq4khqJ.js","/assets/user-minus-CatL0hKt.js","/assets/users-DambCvBy.js","/assets/video-BqiKatJT.js","/assets/wallet-5cCP1YGZ.js","/assets/warehouse-CV7Vakxa.js","/assets/zap-Df8810tc.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
