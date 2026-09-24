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

const BUILD = "2026-09-24T08:49:18.195Z";
const PRECACHE = ["/","/assets/AdminPanel-Ck8I2135.js","/assets/AnalysisBoard-BiKtN1bW.js","/assets/Arc-DsMOaCQP.js","/assets/AttendanceModal-CQ1A1AZZ.js","/assets/BrigadirProfile-By5Ewgi3.js","/assets/BroadcastReceivers-C7ShRLtc.js","/assets/BroadcastRecord-D1XiVhBg.js","/assets/CatLockNotice-DWa0lZhY.js","/assets/CategoryLegendModal-B-FjKOvQ.js","/assets/CellConcerns-_ufvvgwA.js","/assets/CellDetails-DMKkZCsE.js","/assets/CellFormModal-BbQeKKtJ.js","/assets/CellLink-CuMZGFBO.js","/assets/Cells-DyWnz1g4.js","/assets/ColumnFilter-2Apnt9F3.js","/assets/ColumnsPicker-2P7UdVSV.js","/assets/CommentsModal-D61Gms5A.js","/assets/ComparisonTable-BJXYhE9N.js","/assets/Concerns-DG2qwQnR.js","/assets/ConfirmDialog-BX0K6jee.js","/assets/Daily-70X-Zcad.js","/assets/DataTable-DRpZkroB.js","/assets/DateRangePicker-CluAjExT.js","/assets/DayReportView-BiTTvgf_.js","/assets/DayStepper-wVmBtE5A.js","/assets/DifferenceBreakdown-7FkAGjcI.js","/assets/Downtime-c1YKTSez.js","/assets/Education-DZirZ0KT.js","/assets/EducationLesson-Bf9QEjEQ.js","/assets/EmptyState-GYJSmNhN.js","/assets/Exam-BZyHIHDP.js","/assets/FactorySelect-CbbqjCKG.js","/assets/Gamification-CAG6Dj0q.js","/assets/GroupBadge-Bg2MJ_Fi.js","/assets/HeatmapChart-BeBiYBhF.js","/assets/IdleCell-RllRSzVO.js","/assets/KPICard-D0wBsPnw.js","/assets/Kaizen-Cd7Cx0ri.js","/assets/KpiDeltaCard-DDQgO-M3.js","/assets/LangTextInput-d8oDVaXe.js","/assets/Layout-DaVkQ1-3.js","/assets/LeaderDayReport-DoRohuCl.js","/assets/LeaderUnitReport-ak8G4Lqd.js","/assets/Leaderboard-CTKTAOcL.js","/assets/Leaders-nlJ1JThe.js","/assets/LiveOverview-OBdmF32B.js","/assets/Login-Do47p19v.js","/assets/NotFound-B6M_QQbZ.js","/assets/Overview-Ce3Djxmk.js","/assets/Pagination-e_JOUnaZ.js","/assets/PerenaladkaFactTable-Dh-Mdym4.js","/assets/PlanFulfillment-BZwnaVya.js","/assets/Production-lhkLjYXh.js","/assets/Profile-B5JOd_Us.js","/assets/ProofCamera-a8W-U1As.js","/assets/Quality-CdmeF4ue.js","/assets/RequestStateChip-CKljlcNi.js","/assets/RichTextEditor-DLSY2_b0.js","/assets/SearchInput-BqYkV3nj.js","/assets/SeasonalityHeatmap-svJUpOkF.js","/assets/SegmentedToggle-B9OCu84H.js","/assets/SetupTimes-Cw6QPim0.js","/assets/ShiftDaily-bwWxgshQ.js","/assets/Staff-CHvsGJjJ.js","/assets/StatusBadge-CaPe9PC5.js","/assets/Targets-MsWoXCkd.js","/assets/Tasks-DtVthMi6.js","/assets/TimeWheelPicker-BPo9o2YK.js","/assets/Tooltip-rvEmCRaJ.js","/assets/TrendChart-xoqqdXxd.js","/assets/TripleSpeedometer-CV0qvPYK.js","/assets/Trudoyomkost-0p3AxQ8b.js","/assets/UsersActivity-CZuz0vsp.js","/assets/WatchProgress-D76mn_XY.js","/assets/WebLogin-DLHzjoQv.js","/assets/WorkerConcerns-KUVGbLJ6.js","/assets/Workers-B8IWH6cP.js","/assets/Zagruzka-JKW-C6Jn.js","/assets/ZagruzkaCell-BtLX93Nt.js","/assets/alarm-clock-iu8FLx0a.js","/assets/api-Dhqykuqa.js","/assets/archive-C0OfAZ3l.js","/assets/archive-restore-pk3yNYiV.js","/assets/arrow-down-DOLVAg_P.js","/assets/arrow-left-Cp4zaJIa.js","/assets/arrow-left-right-DjLHGDTe.js","/assets/arrow-up-G-MmEY8x.js","/assets/arrow-up-right-Cy7asqgd.js","/assets/award-COSsS431.js","/assets/ban-DG1tMOVX.js","/assets/bot-DAwiMbKa.js","/assets/boxes-Dc34Ur9L.js","/assets/brigadirFilters-3Kxq-mUK.js","/assets/broadcastTree-BHW-n3cI.js","/assets/building-2-DxBjFGYK.js","/assets/calendar-DwFrW-xu.js","/assets/calendar-clock-DwbDUD08.js","/assets/calendar-days-46Qg3UAt.js","/assets/calendar-range-CMWGugiF.js","/assets/camera-DYkgqqyq.js","/assets/categories-i86IOPiP.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-cv-mZk32.js","/assets/chart-line-CnKj0Bvk.js","/assets/chart-pie-BrqNSzjB.js","/assets/chartRange-ClSaWfzt.js","/assets/check-check-CBd__-GS.js","/assets/chevron-left-DY6z5hvj.js","/assets/chevrons-up-down-C5bYjewX.js","/assets/circle-check-big-BR89RQ9u.js","/assets/circle-dashed-jUdfO4rM.js","/assets/circle-dot-Cq2jVyn1.js","/assets/circle-minus-qxtVa_yf.js","/assets/circle-slash-D3XpGC-a.js","/assets/circle-user-round-C9S5EGyN.js","/assets/coins-BlNQriir.js","/assets/compass-D4_vNgVZ.js","/assets/concernCategories-C3QQu1Xg.js","/assets/copy-WOn-r6rD.js","/assets/corner-down-right-D0Y6akiw.js","/assets/createLucideIcon-CLl2tWmx.js","/assets/exportXlsx-Dx2l1ISF.js","/assets/external-link-DXreALn-.js","/assets/file-clock-E4DRYz58.js","/assets/file-spreadsheet-Bi2p9Umr.js","/assets/file-text-BEqee8q0.js","/assets/flag-AleHhjvm.js","/assets/flame-BRkwWAeJ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Bly64DD0.js","/assets/hash-4TlQxkNe.js","/assets/history-DwKHCyph.js","/assets/hourglass-Wqz_RSbT.js","/assets/image-D3ACUV3w.js","/assets/image-off-CECfOcZx.js","/assets/index-BMCZProW.css","/assets/index-CNyFvbaM.js","/assets/keyboard-Cfwh-Xoc.js","/assets/languages-HJP7Naxr.js","/assets/layers-6fbvdN0N.js","/assets/leaderReason-Dp9PCWC8.js","/assets/lightbulb-BAAPOEsl.js","/assets/link-2-76z6_DbK.js","/assets/list-checks-BzlJn_uT.js","/assets/list-ordered-DG4yosHr.js","/assets/lock-open-DXO1c-lw.js","/assets/log-in-CcU6tW8n.js","/assets/message-square-BRrHIvX3.js","/assets/minimize-2-PA0d5ok_.js","/assets/paperclip-DlBsgyAV.js","/assets/pencil-BwRjB32B.js","/assets/personName-B4KId4zS.js","/assets/pin-7H7s2C8R.js","/assets/play-DL3TZbaz.js","/assets/presentation-BXhDfBPO.js","/assets/prop-types-B2svUgqn.js","/assets/radio-Bkq083K1.js","/assets/react-apexcharts.esm-DeMcRwLB.js","/assets/repeat-3eWRrEeV.js","/assets/rotate-ccw-BrZIkLBg.js","/assets/rotate-cw-DNJPWYSN.js","/assets/save-CvLkAPqH.js","/assets/scale-DvMGfYzM.js","/assets/scroll-text-BIPTap_z.js","/assets/search-x-DqH8ewPM.js","/assets/segments-C1p5oyzq.js","/assets/send-CUP6G9hz.js","/assets/settings-2-ChGbsP4F.js","/assets/shield-D6u022sO.js","/assets/shield-alert-CtvzESPz.js","/assets/shield-check-Bchn-tjw.js","/assets/shield-question-mark-9sLJBbuH.js","/assets/siren-CU35Wsiq.js","/assets/smartphone-Bjpb5b3i.js","/assets/snowflake-C5iymPPC.js","/assets/square-YIUYOFLa.js","/assets/square-check-big-BHhfNG-i.js","/assets/star-mdv-yIkd.js","/assets/statusBands-B0_ZgoA-.js","/assets/table-2-B9kHb7kQ.js","/assets/tag-Damb1T94.js","/assets/trending-down-CMxhaNfp.js","/assets/trending-up-BlvJ52u3.js","/assets/triangle-alert-jJ-rBL1F.js","/assets/undo-2-DbYaH2nf.js","/assets/useChartTheme-Btx_K9UG.js","/assets/useElementWidth-C9DJ4oxF.js","/assets/useIsMobile-BK3O6Y7s.js","/assets/useMutation-C9VLdLth.js","/assets/useStatusBands-CkZCV7n_.js","/assets/user-check-DnpYy-hc.js","/assets/user-cog-aUbjrpYG.js","/assets/user-mZVzKTsg.js","/assets/user-minus-DP3EWCs3.js","/assets/users-D5W51R-0.js","/assets/verifyState-BzJpfHmt.js","/assets/video-DbKYmpsp.js","/assets/warehouse-CJcFvS0K.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
