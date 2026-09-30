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

const BUILD = "2026-09-30T06:10:18.655Z";
const PRECACHE = ["/","/assets/AdminPanel-Ce-y75cy.js","/assets/AnalysisBoard-CwwU5R4h.js","/assets/Arc-DND_kj0I.js","/assets/ArcLegacy-BOd6Z5B-.js","/assets/AttendanceModal-CqedgBru.js","/assets/BrigadirProfile-doa9kzRE.js","/assets/BroadcastReceivers-CO6_BtWa.js","/assets/BroadcastRecord-BbK9zPsV.js","/assets/CatLockNotice-BH1hBWcg.js","/assets/CategoryLegendModal-Dqv3vSeE.js","/assets/CellConcerns-Bxh8oigd.js","/assets/CellDetails-DGcOS7E6.js","/assets/CellFormModal-CKyMY6Db.js","/assets/CellLink-gf7EzpZo.js","/assets/Cells-B_8dQm9s.js","/assets/ColumnFilter-Dj3jDPJ6.js","/assets/ColumnsPicker-YuZco2Sd.js","/assets/CommentsModal-D9byRNsu.js","/assets/ComparisonTable-B2bOZmqM.js","/assets/Concerns-CfeXohQi.js","/assets/ConfirmDialog-CPYGk5xP.js","/assets/Daily-lymGWcw3.js","/assets/DataTable-ChgQH4Vu.js","/assets/DateRangePicker-DOA9VbGc.js","/assets/DayReportView-BCHOsRYI.js","/assets/DayStepper-C8hr5XNO.js","/assets/DifferenceBreakdown-rvgnQ1G0.js","/assets/Downtime-Ct5P9wXX.js","/assets/Education-Dq1hql6M.js","/assets/EducationLesson-f94D23Cp.js","/assets/EmptyState-CJowLW-b.js","/assets/Exam-BgocvqoA.js","/assets/FactorySelect-Du4gUNLl.js","/assets/Gamification-Bgbd9_vQ.js","/assets/GroupBadge-CjDhYlgu.js","/assets/HeatmapChart-FrTdr1tf.js","/assets/IdleCell-WUepD_z7.js","/assets/KPICard-zBBTsdWB.js","/assets/Kaizen-Di51AvtK.js","/assets/Kelish-D6R2tRJl.js","/assets/KpiDeltaCard-D_EzLZ2j.js","/assets/LangTextInput-C-yD-AvX.js","/assets/Layout-DbDi4l39.js","/assets/LeaderAppeal-qLEmIp-1.js","/assets/LeaderDayReport-CGQ8M-Y5.js","/assets/LeaderUnitReport-DfIRvb1e.js","/assets/Leaderboard-fv3eGb8M.js","/assets/Leaders-81NszPdk.js","/assets/Lightbox-ZjdP9XNf.js","/assets/LiveOverview-Cg5_rU2M.js","/assets/Login-5_oBtipA.js","/assets/NotFound-BsqLQ-wP.js","/assets/Overview-nqLT4zZU.js","/assets/Pagination-D0W1ijgs.js","/assets/PerenaladkaFactTable-CCvLA5U2.js","/assets/PlanFulfillment-DkG23Hlk.js","/assets/Production-Be4TM2EL.js","/assets/Profile-DGrLlg-3.js","/assets/ProofCamera-Dkb2aAjf.js","/assets/ProofPhoto-i1XheN1E.js","/assets/Quality-DUjOIJCW.js","/assets/RequestStateChip-BD5F3sLy.js","/assets/RichTextEditor-Bje5hhgv.js","/assets/SaveState-BkGmdohS.js","/assets/SearchInput-DnRWKFVk.js","/assets/SeasonalityHeatmap-BNpQqr-k.js","/assets/SegmentedToggle-BQhnRMD6.js","/assets/SetupTimes-DyDxyQIa.js","/assets/ShiftDaily-f_zha-sW.js","/assets/Staff-ZXt6iiNQ.js","/assets/StatusBadge-C9XvZ9zj.js","/assets/TargetGoal-ChvpM2h_.js","/assets/Targets-BUJvvw0r.js","/assets/Tasks-CVCeCyna.js","/assets/TimeWheelPicker-CZ3zmH2H.js","/assets/Tooltip-O94JL7J3.js","/assets/TrendChart-DGI5CowN.js","/assets/TripleSpeedometer-BrtC3w7-.js","/assets/Trudoyomkost-cl0FpczL.js","/assets/UploadDropzone-d07eiy5b.js","/assets/UsersActivity-BbOpzpEy.js","/assets/VerdictBlock-DFEOEg49.js","/assets/WatchProgress-nLUK-Xxz.js","/assets/WebLogin-DMSUEoNz.js","/assets/WorkerConcerns-DXTj3YED.js","/assets/Workers-ARdSzneF.js","/assets/Zagruzka-CrOFU6z1.js","/assets/ZagruzkaCell-Opy4zW00.js","/assets/api-CMPVKyzp.js","/assets/archive-D27gZTM_.js","/assets/archive-restore-C_DT0YC3.js","/assets/arrow-down-DBUhPYLT.js","/assets/arrow-left-right-RxMXzZyc.js","/assets/arrow-left-tpNm3eEH.js","/assets/arrow-up-BwnlgwhD.js","/assets/arrow-up-narrow-wide-CEchLG_E.js","/assets/arrow-up-right-TkP2WnPO.js","/assets/award-BD0-ROD3.js","/assets/ban-CW9VstUz.js","/assets/bot-Bbyx7o_k.js","/assets/boxes-DX_-rRvc.js","/assets/brigadirFilters-BAL8mich.js","/assets/broadcastTree-BEEFPImk.js","/assets/building-2-x2siPaik.js","/assets/calendar-BYj2tuQV.js","/assets/calendar-clock-CJMt0CyT.js","/assets/calendar-days-C6EjgkWi.js","/assets/calendar-range-BSXfL10W.js","/assets/camera-CULXAhjp.js","/assets/categories-aKDNqchd.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CaKiYIFW.js","/assets/chart-line-CuTY9DVq.js","/assets/chart-pie-BVy7Zko0.js","/assets/chartRange-DNvQuB6Z.js","/assets/chevron-left-zimecUL2.js","/assets/chevrons-up-down-aEiSLQ_p.js","/assets/circle-DhjnqC2d.js","/assets/circle-check-big-BuYo_MlO.js","/assets/circle-dot-DpEMQ7cE.js","/assets/circle-minus-CntAjXnT.js","/assets/circle-slash-CFoGNDOp.js","/assets/circle-user-round-fIh3iLRh.js","/assets/cloud-off-BD27m90s.js","/assets/cloud-upload-Da6kDUbd.js","/assets/compass-BJXVShNp.js","/assets/concernCategories-wcqpj5kZ.js","/assets/copy-4Xw3Ia08.js","/assets/corner-down-right-Bsj5v-cn.js","/assets/createLucideIcon-DsTrhWG3.js","/assets/es-CsLUCn8U.js","/assets/exportXlsx-DG3YcpZ0.js","/assets/external-link-CvnvGAR1.js","/assets/file-clock-De5VLu-t.js","/assets/file-exclamation-point-nvap8JWJ.js","/assets/file-spreadsheet-BH21j2kT.js","/assets/file-text-5gS9YdY_.js","/assets/flag-kKwbfsEY.js","/assets/flame-DeRvXMKO.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-AHEC6xfs.js","/assets/hash-B4Ha8zgT.js","/assets/history-BYn4F2Uq.js","/assets/hourglass-DMX_0zjM.js","/assets/image-BJByNXlT.js","/assets/image-off-RZwE9Vpu.js","/assets/index-CMr-KBcg.js","/assets/index-DZHSdK6H.css","/assets/key-round-B3MMUDBf.js","/assets/keyboard-DQWHAwxN.js","/assets/languages-BbQGeu2Z.js","/assets/layers-D9SjJmH_.js","/assets/lightbulb-BTGcOQVZ.js","/assets/link-2-43EvF-Dr.js","/assets/link-2-off-C7xQhxnF.js","/assets/list-checks-dRaISKUH.js","/assets/list-ordered-BQqCb6b2.js","/assets/list-tree-Dl9-W_4n.js","/assets/lock-open-DFAOJiRR.js","/assets/log-in-CpGEzdeJ.js","/assets/maximize-2-C63ZpimW.js","/assets/message-square-BP6LkMum.js","/assets/minimize-2-Cn5I1H_z.js","/assets/package-check-CmHa9F1e.js","/assets/paperclip-INohJ4K-.js","/assets/pencil-DefjVyr9.js","/assets/percent-DadIP9rj.js","/assets/personName-CogOuS3K.js","/assets/pin-DqsHBa3i.js","/assets/pin-off-fmSfbAYn.js","/assets/play-Bb2lhNTO.js","/assets/presentation-CEyWuw5l.js","/assets/prop-types-DeqDi60V.js","/assets/radio-DeJ-uCyX.js","/assets/react-apexcharts.esm-BAEpLExN.js","/assets/repeat-BObZ0883.js","/assets/rotate-ccw-BRl8DAm8.js","/assets/rotate-cw-DXMyer_W.js","/assets/save-CVEhL8gF.js","/assets/scale-BMZza93i.js","/assets/scopeLinks-BLR5eqon.js","/assets/scroll-text-DfTDxM1-.js","/assets/search-x-BzpkX6EE.js","/assets/segments-DIgS7C6E.js","/assets/send-Bqb29kSh.js","/assets/settings-2-CRc6Xdjt.js","/assets/shield-alert-C4VZke6X.js","/assets/shield-check-BUZFWbYa.js","/assets/shield-question-mark-BEuAjJdH.js","/assets/shield-xdZIoggK.js","/assets/siren-DnATO9gt.js","/assets/snowflake-gEFBa_R0.js","/assets/square-Uq4yEz7s.js","/assets/square-check-big-C70WK4K0.js","/assets/star-p4HSfxQI.js","/assets/statusBands-C-D6kE6Q.js","/assets/store-CRDVm_ox.js","/assets/table-2-B2eHQePb.js","/assets/table-properties-CtnXuyIS.js","/assets/tag-DhrlGCNp.js","/assets/timer-off-DfpYTz7n.js","/assets/trending-down-BidZ5QZp.js","/assets/trending-up-tfJ07iRl.js","/assets/undo-2-DqGuY7Od.js","/assets/useChartTheme-7LzVu6ZP.js","/assets/useElementWidth-CIdeyNQE.js","/assets/useIsMobile-BJe6ouFg.js","/assets/useMutation-CnBq2e9v.js","/assets/useStatusBands-BMurkuRV.js","/assets/useUrlScope-B53Pvz6I.js","/assets/user-CjI5JQR_.js","/assets/user-cog-DZf4dq4L.js","/assets/user-minus-B56NkCvv.js","/assets/users-ChvkxFjF.js","/assets/video-CzS4iLsj.js","/assets/wallet-cwEquqZ0.js","/assets/warehouse-hVaSgPfa.js","/assets/zap-DhCyctSs.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
