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

const BUILD = "2026-10-05T10:57:58.843Z";
const PRECACHE = ["/","/assets/AdminPanel-Doxnd12g.js","/assets/AnalysisBoard-BOoMILSd.js","/assets/Arc-5kTcJ_Xn.js","/assets/ArcLegacy-XVSTSffq.js","/assets/BrigadirProfile-Do7KnHqP.js","/assets/BroadcastReceivers-BB2adJ0g.js","/assets/BroadcastRecord-BYXh4Fgl.js","/assets/Button-C7w8v7G5.js","/assets/CatLockNotice-CF6yjgZp.js","/assets/CategoryLegendModal-inMOaerk.js","/assets/CellConcerns-DjX_x_N-.js","/assets/CellDetails-3bsi6CVD.js","/assets/CellFormModal-1j3wnark.js","/assets/CellIdent-DQwyMeM_.js","/assets/CellLink-ByHfKGEw.js","/assets/Cells-F3VZR9QR.js","/assets/ColumnFilter-DsR0TxnM.js","/assets/ColumnsPicker-CwQz39lT.js","/assets/CommentsModal-CGUpbs2U.js","/assets/ComparisonTable-B3HvmoHz.js","/assets/Concerns-mGwQCLl0.js","/assets/Daily-CGXSUl2x.js","/assets/DataTable-CUfCdLp0.js","/assets/DateRangePicker-BarGoV7r.js","/assets/DayReportView-BPk9s0R5.js","/assets/DayStepper-CQY-exkw.js","/assets/DifferenceBreakdown-BoKMM9gU.js","/assets/Downtime-CVYI4nVc.js","/assets/Education-CDWfXckl.js","/assets/EducationLesson-DZnsd1D7.js","/assets/EmptyState-CwqvIybi.js","/assets/Exam-B7LYmfEZ.js","/assets/FactorySelect-tnScXDSr.js","/assets/Gamification-vakxkUcO.js","/assets/GroupBadge-CtgSTchV.js","/assets/HeatmapChart-Bxq_xK1f.js","/assets/IdleCell-CCb3b04E.js","/assets/KPICard-DWxQn-rM.js","/assets/Kaizen-UYUN_pVY.js","/assets/Kelish-DZNGIm-u.js","/assets/KpiDeltaCard-DXpmitv6.js","/assets/LangTextInput-Drvrjc2S.js","/assets/Layout-Dq57VKS3.js","/assets/LeaderAppeal-DRk5mpdW.js","/assets/LeaderDayReport-BcQoW27T.js","/assets/LeaderUnitReport-BqRl4vFT.js","/assets/Leaderboard-D1bKusI9.js","/assets/Leaders-Cr5iy-VS.js","/assets/Lightbox-CrQw2DrO.js","/assets/LiveOverview-Dpi6Jolp.js","/assets/Login-CSGV_3B8.js","/assets/NotFound-VTY4P2_3.js","/assets/Notifications-BbRUXGk4.js","/assets/Overview-CkWgTU7j.js","/assets/Pagination-DgknOJbn.js","/assets/PerenaladkaFactTable-DxHj3Fvm.js","/assets/PersonCard-d1w0Fe03.js","/assets/PlanFulfillment-CQ_3vK8m.js","/assets/Production-BBj8vkQy.js","/assets/Profile-CnmZyOeL.js","/assets/ProofCamera-BQGmMKmU.js","/assets/ProofPhoto-BBRvQOMU.js","/assets/Quality-6v0IZSCr.js","/assets/RawRows-DConaMNM.js","/assets/RequestStateChip-KjG6NAoD.js","/assets/RichTextEditor-CAD6zAv6.js","/assets/SaveState-BKz88Ahq.js","/assets/SearchInput-BA2zkWPF.js","/assets/SeasonalityHeatmap-BCjD6A-k.js","/assets/SegmentedToggle-BLfUeaKV.js","/assets/SetupTimes-DJLnu9WV.js","/assets/ShiftDaily-DKWIt4-S.js","/assets/Staff-DnJi42Oa.js","/assets/StaffLive-BwPdqz8E.js","/assets/StatusBadge-BZdCcSKO.js","/assets/TargetGoal-CZO1j_fm.js","/assets/Targets-eEGKO-Rt.js","/assets/Tasks-BlbCUOuM.js","/assets/TimeWheelPicker-DfEAPDjg.js","/assets/Toast-NXK01AWU.js","/assets/Tooltip-CjbY3G59.js","/assets/TrendChart-B1Rg1gQB.js","/assets/TripleSpeedometer-Z1lyq_ZT.js","/assets/Trudoyomkost-DqDy6PwD.js","/assets/Turnover-B7K6iaHL.js","/assets/UploadDropzone-D4Zn9lv3.js","/assets/UsersActivity-BqoQ5TRb.js","/assets/VerdictBlock-DWtC4lMs.js","/assets/VfxApiMap-6e7cggkY.js","/assets/VfxDictionaries-BMjBiyH3.js","/assets/VfxEmployees-D74fxZpN.js","/assets/VfxHrMoves-Ht-Ab4qU.js","/assets/VfxJobs-C1J8XLOS.js","/assets/VfxPhoto-DTpoiBYW.js","/assets/VfxShifts-BglkBAcf.js","/assets/VfxState-rhSCxryM.js","/assets/VfxTimebooks-om3Q1oYC.js","/assets/VfxTimesheet-BuHCyxjs.js","/assets/WatchProgress-uYaJBOPg.js","/assets/WebLogin-DeykiqyU.js","/assets/WorkerConcerns-T2LP2SQM.js","/assets/Workers-BTBQQsv0.js","/assets/Zagruzka-DIAxPVQe.js","/assets/ZagruzkaCell-CBTLB05Y.js","/assets/api-Cf80U9qK.js","/assets/archive-C6OoNrqp.js","/assets/archive-restore-Dt1SVRtR.js","/assets/arrow-down-Z0f8Zft2.js","/assets/arrow-left-DTS8lYiy.js","/assets/arrow-up-Dutnfcm8.js","/assets/arrow-up-narrow-wide-Dofa7_Px.js","/assets/arrow-up-right-CkFmZMSF.js","/assets/award-BtdOFyLH.js","/assets/ban-g5cfuLTW.js","/assets/book-open-gIXg5FxI.js","/assets/bot-CNJkZFKK.js","/assets/boxes-CjROklhx.js","/assets/braces-MrCSFLoM.js","/assets/brigadirFilters-77LvGSMz.js","/assets/broadcastTree-D1dA_Swz.js","/assets/building-2-j1e7Lu3d.js","/assets/calculator-DyqG1DwZ.js","/assets/calendar-B90EMExo.js","/assets/calendar-days-DxDMbPxR.js","/assets/camera-Dtw9Fijv.js","/assets/categories-BMd6iaoK.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ovDu0Sb0.js","/assets/chart-line-Dms8xoUQ.js","/assets/chart-pie-Dk2COlxh.js","/assets/chartRange-B3S6eXQO.js","/assets/check-check-5uUi0MmH.js","/assets/chevron-left-Bd-Je7Hl.js","/assets/chevrons-up-down-C0n5PWJA.js","/assets/circle-D9mA9Vg3.js","/assets/circle-alert-_MzRjr38.js","/assets/circle-check-big-3AC7XxUy.js","/assets/circle-dashed-7wrS15b6.js","/assets/circle-minus-DXBzPQcx.js","/assets/circle-question-mark-BPmdGPBZ.js","/assets/circle-slash-D6FckOm4.js","/assets/circle-user-round-CAhgGLA-.js","/assets/clock-3-6givnccY.js","/assets/cloud-off-BARzDpZp.js","/assets/cloud-upload-MkUK5Vz_.js","/assets/compass-DMx5ZQsO.js","/assets/concernCategories-BIAV2a34.js","/assets/copy-B5nxLlHz.js","/assets/corner-down-right-CxxPSwSO.js","/assets/createLucideIcon-Cd1eiJuq.js","/assets/es-PJB_Q17d.js","/assets/exportXlsx-CSfZNPtr.js","/assets/external-link-BttiuoMf.js","/assets/file-clock-B2mptHKn.js","/assets/file-exclamation-point-tCs_xkRa.js","/assets/file-spreadsheet-DUHWlCNR.js","/assets/file-text-DWjyIzFm.js","/assets/flag-DZW4KZK9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bu4oCgaE.js","/assets/hash-C3pf0ZUZ.js","/assets/history-DTu0_o45.js","/assets/hourglass-DFzwwWzx.js","/assets/image-BKxXBZfd.js","/assets/image-off-u5cgwFgK.js","/assets/inbox-CsRyUUQh.js","/assets/index-DDexO6_P.js","/assets/index-EzRNd0F3.css","/assets/key-round-zjhX2Pp-.js","/assets/keyboard-D9fw_q-j.js","/assets/languages-jf_dpFzi.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BPHjz2Tg.js","/assets/lightbulb-Bg_qYOII.js","/assets/link-2-DPrvrjDW.js","/assets/link-2-off-C0xBahh9.js","/assets/list-ordered-Bg8GPtyy.js","/assets/list-tree-Bo85VWU7.js","/assets/lock-open-BSl9H60R.js","/assets/log-in-C2ONQqVx.js","/assets/maximize-2-DfrIOrY6.js","/assets/message-square-CyupLlVw.js","/assets/minimize-2-B8Nmz7DD.js","/assets/package-check-DpjT_VQs.js","/assets/paperclip-CC30usPO.js","/assets/pencil-C2bl6Qzl.js","/assets/percent-YxQFrsQt.js","/assets/pin-ehuX9Aez.js","/assets/pin-off-O0i-cr2a.js","/assets/play-nkmqlW1t.js","/assets/plug-zap-CN7sR5ZZ.js","/assets/presentation-Dlrjd0vV.js","/assets/prop-types-DLqRiNrq.js","/assets/radio-BgUIku41.js","/assets/react-apexcharts.esm-DZHeY3G4.js","/assets/registers-DprPRjIr.js","/assets/repeat-ut57zH1L.js","/assets/rotate-ccw-Drc0fl0U.js","/assets/rotate-cw-BsXyvSCB.js","/assets/save-Cn7DInZB.js","/assets/scopeLinks-Bcb-RkSw.js","/assets/scroll-text-D0Sb7afA.js","/assets/search-x-Dn_FQcwY.js","/assets/segments-BRI6s2Ri.js","/assets/send-B-D6XL6J.js","/assets/settings-2-DClCt7UG.js","/assets/shield-CM4aWQBT.js","/assets/shield-alert-oVx09jnx.js","/assets/shield-check-DML1LA7P.js","/assets/shield-question-mark-BJsEIyzn.js","/assets/siren-Bt5JUlDi.js","/assets/snowflake-Cnl3job_.js","/assets/split-CF_mhuRF.js","/assets/square-check-big-BIjF7oiq.js","/assets/square-vxIhLCnI.js","/assets/star-CKS6nPok.js","/assets/statusBands-M_yyBWl6.js","/assets/store-5U4pQv5r.js","/assets/table-2-DbNqAwSF.js","/assets/table-properties-BgY1Ysyb.js","/assets/tag-CzWkOfGX.js","/assets/timer-off-Ds0BHgE1.js","/assets/trending-down-BtpYGE1y.js","/assets/trending-up-HKvpu2ps.js","/assets/undo-2-S-DbiwGo.js","/assets/useChartTheme-CX8hhfh4.js","/assets/useElementWidth-C4tVInnZ.js","/assets/useIsMobile-VC8Fb7zG.js","/assets/useOpenParam-BXaoiA4c.js","/assets/useStatusBands-ITc4hKWP.js","/assets/useUrlScope-DI0YCi8C.js","/assets/user-CNmNYmT3.js","/assets/user-cog-CzqrHv_y.js","/assets/users-CIlkuhTD.js","/assets/vfx-CIttk-f_.js","/assets/video-BOPLh_NU.js","/assets/wallet-DsefDdQr.js","/assets/warehouse-DnTb1X7V.js","/assets/x-BuqTgeq_.js","/assets/zap-CcBKJ_Cw.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
