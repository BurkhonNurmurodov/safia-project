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

const BUILD = "2026-10-04T11:16:04.736Z";
const PRECACHE = ["/","/assets/AdminPanel-DFCsCmE2.js","/assets/AnalysisBoard-BMam8G8v.js","/assets/Arc-B6jey3hz.js","/assets/ArcLegacy-cPFqLtdn.js","/assets/BrigadirProfile-3-Q_LXw9.js","/assets/BroadcastReceivers-Zkp73_mZ.js","/assets/BroadcastRecord-DDu0nKPf.js","/assets/CatLockNotice-CnjvqAjc.js","/assets/CategoryLegendModal-DHlViCfv.js","/assets/CellConcerns-BHSxB14o.js","/assets/CellDetails-BHtFllHi.js","/assets/CellFormModal-BhaZu4LM.js","/assets/CellIdent-C_qdAsTE.js","/assets/CellLink-Cp5KR3pP.js","/assets/Cells-lL8FjZmj.js","/assets/ColumnFilter-DO0zTXFa.js","/assets/ColumnsPicker-Ccb0QnfV.js","/assets/CommentsModal-vekRZfmO.js","/assets/ComparisonTable-Bd6c35kr.js","/assets/Concerns-W4Lb0y0u.js","/assets/ConfirmDialog-C4zTAgtV.js","/assets/Daily-HVGV4Qww.js","/assets/DataTable-B4mxMip8.js","/assets/DateRangePicker-6a0gtQHa.js","/assets/DayReportView-CPJb0LCf.js","/assets/DayStepper-D_tfXewL.js","/assets/DifferenceBreakdown-Dnhod9AD.js","/assets/Downtime-Av0qI-yv.js","/assets/Education-CMwO3VlT.js","/assets/EducationLesson-DOeWOtcf.js","/assets/EmptyState-D6pzpbXA.js","/assets/Exam-Cr7QGPct.js","/assets/FactorySelect-T-4IK_w4.js","/assets/Gamification-J5z8W-Hx.js","/assets/GroupBadge-CkvjK1or.js","/assets/HeatmapChart-BmdAFVPG.js","/assets/IdleCell-CUkjGiUk.js","/assets/KPICard-D6xus1n9.js","/assets/Kaizen-BxBOcj6r.js","/assets/Kelish-BYlTMp39.js","/assets/KpiDeltaCard-37ctWc3X.js","/assets/LangTextInput-B6JSItNP.js","/assets/Layout-DFLGkBN1.js","/assets/LeaderAppeal-CFEVFRwp.js","/assets/LeaderDayReport-B9-K68i9.js","/assets/LeaderUnitReport-DhAeKr4d.js","/assets/Leaderboard-uEIV1Htd.js","/assets/Leaders-Cu0zp39s.js","/assets/Lightbox-CTFqFFNt.js","/assets/LiveOverview-CCKiLIQm.js","/assets/Login-CY68Ok2Y.js","/assets/NotFound-CBAzuere.js","/assets/Notifications-DWc1wFUh.js","/assets/Overview-DC6hYM-X.js","/assets/Pagination-sJ0qiXLw.js","/assets/PerenaladkaFactTable-CN41HVko.js","/assets/PersonCard-B-CiaxLe.js","/assets/PlanFulfillment-BvaQeKP-.js","/assets/Production-BTexCVd_.js","/assets/Profile-CDXFuygz.js","/assets/ProofCamera-BXv7KIah.js","/assets/ProofPhoto-BtihFHuQ.js","/assets/Quality-dFZjMi_j.js","/assets/RawRows-VAun9S_B.js","/assets/RequestStateChip-Bjru8OXl.js","/assets/RichTextEditor-B9_KOaDP.js","/assets/SaveState-Ctrl_muE.js","/assets/SearchInput-B9DTkfnZ.js","/assets/SeasonalityHeatmap-B2iR8tGK.js","/assets/SegmentedToggle-CqFWoarF.js","/assets/SetupTimes-B8OG_A-q.js","/assets/ShiftDaily-ChsTak8a.js","/assets/Staff-1dgEc2qN.js","/assets/StaffLive-D0vtEgHQ.js","/assets/StatusBadge-DsGKGFGg.js","/assets/TargetGoal-COfaBtmM.js","/assets/Targets-B5bGUMbk.js","/assets/Tasks-DeT4dsdP.js","/assets/TimeWheelPicker-C7FgUt5b.js","/assets/Toast-DQHEAo8I.js","/assets/Tooltip-DIfONqGf.js","/assets/TrendChart-Cvb1BhxQ.js","/assets/TripleSpeedometer-BKXfm6gz.js","/assets/Trudoyomkost-CO2nzIfd.js","/assets/UploadDropzone-B7Vbrghj.js","/assets/UsersActivity-DuUn-UJb.js","/assets/VerdictBlock-LaCsVT_3.js","/assets/VfxApiMap-Cd9SGEJl.js","/assets/VfxDictionaries-DUxqNP_S.js","/assets/VfxEmployees-qIXfRYis.js","/assets/VfxHrMoves-CEGI08eq.js","/assets/VfxJobs-CGdxLyUB.js","/assets/VfxPhoto-DFErOk5N.js","/assets/VfxShifts-CjrVjGVY.js","/assets/VfxState-ZQSPMh8s.js","/assets/VfxTimebooks-BRRyidiN.js","/assets/VfxTimesheet-mDiwIefn.js","/assets/WatchProgress-BQpQvhl9.js","/assets/WebLogin-DKhd3-2X.js","/assets/WorkerConcerns-HwSLGvI7.js","/assets/Workers-vrJNyiB2.js","/assets/Zagruzka-CGWyRKpb.js","/assets/ZagruzkaCell-CeC4Sgo1.js","/assets/api-DMSeLTHK.js","/assets/archive-5TVsjk6U.js","/assets/archive-restore-CYOKqaBH.js","/assets/arrow-down-DV197RZ2.js","/assets/arrow-left-hkUDTLzN.js","/assets/arrow-up-CSyxpxx5.js","/assets/arrow-up-narrow-wide-DiN5YRY7.js","/assets/arrow-up-right-v8Kj3qpK.js","/assets/award-DD-e_hhq.js","/assets/ban-Cmloy0Yx.js","/assets/bot-B9TcW_gA.js","/assets/boxes-IFWXS5Tr.js","/assets/braces-DD0sQt79.js","/assets/brigadirFilters-DOVTizVN.js","/assets/broadcastTree-iuRJo6_n.js","/assets/building-2-xCn0K_Vn.js","/assets/calendar-BezLY8Ij.js","/assets/calendar-days-DyXUtGdE.js","/assets/camera-2ftRB_YE.js","/assets/categories-CaQjexZn.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Co-vE70i.js","/assets/chart-line-gDP4Wj9y.js","/assets/chart-pie-Bq48Vifv.js","/assets/chartRange-UVFxcOTX.js","/assets/check-check-DAtoWM4A.js","/assets/chevron-left-D-5MFBJc.js","/assets/chevrons-up-down-DQuMS-dE.js","/assets/circle-CXLSI6lC.js","/assets/circle-alert-Bf0JHiEm.js","/assets/circle-check-big-DXNguvfZ.js","/assets/circle-dashed-f2SQ2Zgp.js","/assets/circle-minus-BlEt1soe.js","/assets/circle-question-mark-Do3uSpdT.js","/assets/circle-slash-Bhfg_rcu.js","/assets/circle-user-round-GrDI_Fwt.js","/assets/clock-3-DEYUv3JD.js","/assets/cloud-off-CS3KO8wB.js","/assets/cloud-upload-BziYfPEi.js","/assets/compass-CqEoq8nd.js","/assets/concernCategories-OcMau5bl.js","/assets/copy-CUZIOOLB.js","/assets/corner-down-right-DDCpbQhb.js","/assets/createLucideIcon-BuymdHdW.js","/assets/es-IuKKvFBu.js","/assets/exportXlsx-8zcbjsxn.js","/assets/external-link-xpQsWsvz.js","/assets/file-clock-G03-qprm.js","/assets/file-exclamation-point-DIr4E6F2.js","/assets/file-spreadsheet-D8Y9cMjf.js","/assets/file-text-CmvzC4el.js","/assets/flag-CIjRenur.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-ynsjS4ED.js","/assets/hash-S5U_yMIO.js","/assets/history-B8-lbccN.js","/assets/hourglass-cByjJi0r.js","/assets/image-1iR4fho0.js","/assets/image-off-3xRkAtoZ.js","/assets/inbox-CwJIiucT.js","/assets/index-BngiOmj1.css","/assets/index-jmrGxvvm.js","/assets/key-round-9E3A08D1.js","/assets/keyboard-CysLz81d.js","/assets/languages-DAn8L0Dm.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Cr4QPfHO.js","/assets/lightbulb-I_zUodU1.js","/assets/link-2-nEH4LOB8.js","/assets/link-2-off--HQ1Xp7_.js","/assets/list-ordered-CUIVTPte.js","/assets/list-tree-DQ6Rcfpi.js","/assets/lock-open-DSwR8lZp.js","/assets/log-in-C8fk4VPm.js","/assets/maximize-2-BezLfoz4.js","/assets/message-square-DfOtOKCI.js","/assets/minimize-2-CtNBT1TR.js","/assets/package-check-DqW5S70d.js","/assets/paperclip-Byf1YEhu.js","/assets/pencil-BTNb8qrT.js","/assets/percent-YLdfWVFZ.js","/assets/pin-off-C01MQcB1.js","/assets/pin-v7__itJS.js","/assets/play-C0HogYa1.js","/assets/plug-zap-BC0LYG3N.js","/assets/presentation-CXgPJuWE.js","/assets/prop-types-DmCCLHGU.js","/assets/radio-JKEgN59L.js","/assets/react-apexcharts.esm-C4iLJ4uk.js","/assets/registers-wNe5w5WN.js","/assets/repeat-DJcEvxdC.js","/assets/rotate-ccw-Dw3Yfyw2.js","/assets/rotate-cw-B3_vzrg-.js","/assets/save-CbKu6NY0.js","/assets/scopeLinks-D0kT1Wkz.js","/assets/scroll-text-DGBpelEi.js","/assets/search-x-Dk1p5o7e.js","/assets/segments-B4GIN6LA.js","/assets/send-CD_I12xy.js","/assets/settings-2-RtccmFpf.js","/assets/shield-DR1gp8rg.js","/assets/shield-alert-BUoVK97t.js","/assets/shield-check-wIxr3Spd.js","/assets/shield-question-mark-CrWDk_3u.js","/assets/siren-CLXB2OFi.js","/assets/snowflake-CI6mO_fs.js","/assets/split-CaMupY7j.js","/assets/square-CBa15DES.js","/assets/square-check-big-DnAibE1D.js","/assets/star-CwAy4HZp.js","/assets/statusBands-CHfeeELZ.js","/assets/store-B3TXPi6y.js","/assets/table-2-CzbmoywB.js","/assets/table-properties-CnVvdisY.js","/assets/tag-BIomVIZC.js","/assets/timer-off-BLgf9mbY.js","/assets/trending-down-DYMDI5P2.js","/assets/trending-up-6C4jNkKa.js","/assets/undo-2-BjOnkWPG.js","/assets/useChartTheme-dr7NW-Ti.js","/assets/useElementWidth-C0RLtIPR.js","/assets/useIsMobile-CdwwxMdE.js","/assets/useOpenParam-DCDxulik.js","/assets/useStatusBands-D_Lb67cZ.js","/assets/useUrlScope-BxEUyQFv.js","/assets/user-C1hOvIsB.js","/assets/user-cog-BZbGEjwx.js","/assets/user-minus-C5RJUfnG.js","/assets/users-BoaiaXEO.js","/assets/video-D_Swi0iI.js","/assets/wallet-BgZaiu7o.js","/assets/warehouse-7VpBwXlJ.js","/assets/x-D12lltV9.js","/assets/zap-BbPtF_IY.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
