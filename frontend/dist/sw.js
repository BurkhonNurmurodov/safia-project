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

const BUILD = "2026-10-03T10:10:35.346Z";
const PRECACHE = ["/","/assets/AdminPanel-CRnyxstw.js","/assets/AnalysisBoard-DK31PxIZ.js","/assets/Arc-B1bB7-ud.js","/assets/ArcLegacy-a6GSLIPl.js","/assets/BrigadirProfile-wBBjhHFe.js","/assets/BroadcastReceivers-BI8S3Ujy.js","/assets/BroadcastRecord-DC57OfMq.js","/assets/CatLockNotice-Clve6Bem.js","/assets/CategoryLegendModal-pASdDqqQ.js","/assets/CellConcerns-BkRg2gUj.js","/assets/CellDetails-BcpFYs9g.js","/assets/CellFormModal-DdHfk6AD.js","/assets/CellIdent-x56iVZro.js","/assets/CellLink-C1aK-yzq.js","/assets/Cells-GPhY-_VJ.js","/assets/ColumnFilter-tUECJk-T.js","/assets/ColumnsPicker-G9fQCt36.js","/assets/CommentsModal-D1n_DgvJ.js","/assets/ComparisonTable-D59erPlT.js","/assets/Concerns-U-2OdOu_.js","/assets/ConfirmDialog-DzU-ypjJ.js","/assets/Daily-D-B5gNex.js","/assets/DataTable-neP18C_a.js","/assets/DateRangePicker-D3XMzFtP.js","/assets/DayReportView-D5Oek9SL.js","/assets/DayStepper-Cqvmilb7.js","/assets/DifferenceBreakdown-DNCeNad8.js","/assets/Downtime-U_BTXmB-.js","/assets/Education-XdZ3gWln.js","/assets/EducationLesson-C5H7iBxc.js","/assets/EmptyState-CYEPepk4.js","/assets/Exam-B-OUuJfh.js","/assets/FactorySelect-B7WtOqK1.js","/assets/Gamification-DZFivIyQ.js","/assets/GroupBadge-D-8ltuBf.js","/assets/HeatmapChart-CrXI08El.js","/assets/IdleCell-DAUrxUFD.js","/assets/KPICard-DohGYN-5.js","/assets/Kaizen-DI-sjrx2.js","/assets/Kelish-CCoGe_M0.js","/assets/KpiDeltaCard-DlNzf3TB.js","/assets/LangTextInput-CcvAheYp.js","/assets/Layout--qmJj9sY.js","/assets/LeaderAppeal-LedFAWqy.js","/assets/LeaderDayReport-1k4q_354.js","/assets/LeaderUnitReport-MeZHOb1v.js","/assets/Leaderboard-Dw8NeZ4k.js","/assets/Leaders-CyasKIYu.js","/assets/Lightbox-C6Sja_1S.js","/assets/LiveOverview-D8SKo3dK.js","/assets/Login-TN753BUK.js","/assets/NotFound-LQzt0V6m.js","/assets/Notifications-mL_Rp1j7.js","/assets/Overview-DCj4lUwE.js","/assets/Pagination-DfaBq-do.js","/assets/PerenaladkaFactTable-BNbmuTus.js","/assets/PersonCard-DJ_yCdg9.js","/assets/PlanFulfillment-cZ8x5Zku.js","/assets/Production-CRE_0y1M.js","/assets/Profile-uH8_exiM.js","/assets/ProofCamera-DNuPjU9G.js","/assets/ProofPhoto-C2UB7cg5.js","/assets/Quality-BK8iI1Z0.js","/assets/RawRows-Cp_xbdni.js","/assets/RequestStateChip-QglABAo0.js","/assets/RichTextEditor-BLpUmQ8w.js","/assets/SaveState-DArkhfj6.js","/assets/SearchInput-DNNeKrnE.js","/assets/SeasonalityHeatmap-DmDkHezc.js","/assets/SegmentedToggle-0lHMmmIF.js","/assets/SetupTimes-Dh5MRObi.js","/assets/ShiftDaily-qZc-fwUG.js","/assets/Staff-CrJbrYGc.js","/assets/StaffLive-DSUsYG7_.js","/assets/StatusBadge-Bv410zEz.js","/assets/TargetGoal-CdfBV1Ca.js","/assets/Targets-BO-DG-Or.js","/assets/Tasks-CGugKSXq.js","/assets/TimeWheelPicker-Dz7dCa3B.js","/assets/Toast-DFUxWM3x.js","/assets/Tooltip-Bb9DM_Ev.js","/assets/TrendChart-BHqJu-an.js","/assets/TripleSpeedometer-DTGx4siE.js","/assets/Trudoyomkost-nvcUTADR.js","/assets/UploadDropzone-BPbVCN28.js","/assets/UsersActivity-BJ1VFi__.js","/assets/VerdictBlock-CbKGhBjy.js","/assets/VfxApiMap-D_5efb3n.js","/assets/VfxEmployees-DQk9y5OA.js","/assets/VfxJobs-xOP5udwQ.js","/assets/VfxMarks-BqnejuvJ.js","/assets/VfxOnSite-BT0Cn5ot.js","/assets/VfxPhoto-CnJy4umg.js","/assets/VfxState-Di-7r7-t.js","/assets/VfxStructure-BrPPtmj6.js","/assets/VfxTable-Gu4xnm-u.js","/assets/VfxTimesheet-Cz-h3mAI.js","/assets/WatchProgress-Cc0dAPT9.js","/assets/WebLogin-DRM8b1zI.js","/assets/WorkerConcerns-BoQvhdVv.js","/assets/Workers-Bpr6AZeD.js","/assets/Zagruzka-DzUcmm6-.js","/assets/ZagruzkaCell-DLIA5sIx.js","/assets/api-CjqOlnUv.js","/assets/archive-18ofjqG0.js","/assets/archive-restore-BP8HSIJ4.js","/assets/arrow-down-wRg4LhWM.js","/assets/arrow-left-CZMebWpo.js","/assets/arrow-right-left-5kw-1sor.js","/assets/arrow-up-narrow-wide-CBJlXRCX.js","/assets/arrow-up-right-C5ZLMuvk.js","/assets/arrow-up-uTTPsNO4.js","/assets/award-N2MrYzG8.js","/assets/ban-DxDy42PX.js","/assets/bot-CIueJPtl.js","/assets/boxes-ByVQl44H.js","/assets/braces-BSQchldS.js","/assets/brigadirFilters-gVQzNkoS.js","/assets/broadcastTree-Cl3I1O0l.js","/assets/building-2-rWSPmT7s.js","/assets/calendar-days-Bf6_xDdF.js","/assets/calendar-y9w-DnJI.js","/assets/camera-C-cwAbzU.js","/assets/categories-0KzSKM0U.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B4ROE32F.js","/assets/chart-line-BUfu0_u3.js","/assets/chart-pie-C4HJok6Y.js","/assets/chartRange-I1F4blJv.js","/assets/chevron-left-435dkZD8.js","/assets/chevrons-up-down-32Ny6r-Q.js","/assets/circle-6mcB0Q3-.js","/assets/circle-alert-B4MYU1O_.js","/assets/circle-check-big-CRUM-5Jp.js","/assets/circle-dashed-Bl2gyu6O.js","/assets/circle-minus-B6ys20sg.js","/assets/circle-question-mark-Wu8d2tYz.js","/assets/circle-slash-A3dV7uWK.js","/assets/circle-user-round-B0pqbR9T.js","/assets/clock-3-DBahv0X_.js","/assets/cloud-off-Chk9ECWS.js","/assets/cloud-upload-CTyrnFid.js","/assets/compass-DS73XXt1.js","/assets/concernCategories-Cielja7j.js","/assets/copy-DTC5xA3N.js","/assets/corner-down-right-DOo3ZZK7.js","/assets/createLucideIcon-2aoVIcMg.js","/assets/door-open-CwC6rk30.js","/assets/es-DTTY4jSH.js","/assets/exportXlsx-CJz6YDRK.js","/assets/external-link-k6QYpAqe.js","/assets/file-clock-Dl4oh4so.js","/assets/file-exclamation-point-JrnwREAu.js","/assets/file-spreadsheet-Cq_imdGK.js","/assets/file-text-4jyfEDov.js","/assets/flag-DPuvi6jv.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BpuJYg91.js","/assets/hash-D__DZ2i5.js","/assets/history-5ckeaY3M.js","/assets/hourglass-BfzBk_sl.js","/assets/image-DdDl8tn-.js","/assets/image-off-DRmecMAq.js","/assets/inbox-CbW45QRn.js","/assets/index-CPVGdSVZ.css","/assets/index-fDo-NK6T.js","/assets/key-round-B3bKMcu3.js","/assets/keyboard-yAy6FXnd.js","/assets/languages-BHVkZvs4.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BaZqolQg.js","/assets/lightbulb-BLzezcVa.js","/assets/link-2-CSFnjy-H.js","/assets/link-2-off-ttElKC6k.js","/assets/list-ordered-BqaFKqoT.js","/assets/list-tree-DhiXtBhT.js","/assets/lock-open-CQoZIluN.js","/assets/log-in-Dh0qRO0j.js","/assets/maximize-2-BIlGEOkv.js","/assets/message-square-CQNMQkJi.js","/assets/minimize-2-B6xd4YhC.js","/assets/package-check-CY6cZDrq.js","/assets/paperclip-zyFqdfwX.js","/assets/pencil-w70puCr6.js","/assets/percent-DrJ4QxWu.js","/assets/phone-DLzY9diL.js","/assets/pin-D5u6voyi.js","/assets/pin-off-DrOXMHhd.js","/assets/play-B4Dpm_0m.js","/assets/plug-zap-Cd-uTP_-.js","/assets/presentation-BIwXAiue.js","/assets/prop-types-DI1_4Fe_.js","/assets/radio-DQt4xvzC.js","/assets/react-apexcharts.esm-D8edyTbe.js","/assets/repeat-BAreSnZo.js","/assets/rotate-ccw-Dfu40qQI.js","/assets/rotate-cw-RtUNSBnd.js","/assets/save-C5atSrLo.js","/assets/scopeLinks-BOm-pB0-.js","/assets/scroll-text-Byw2FFAz.js","/assets/search-x-DCWnwkvz.js","/assets/segments-BaJiyyXr.js","/assets/send-sf1NfjP1.js","/assets/settings-2-xh4nwhXH.js","/assets/shield-RFeKX-Pn.js","/assets/shield-alert-pwRfk5Id.js","/assets/shield-check-BNsuOJIO.js","/assets/shield-question-mark-BeemHcRt.js","/assets/siren-yLNUaTsC.js","/assets/snowflake-9mjo3B6E.js","/assets/split-DBVnYq9-.js","/assets/square-check-big-CUDI5oK1.js","/assets/square-hRDlLFlJ.js","/assets/star-Dw1qfdAv.js","/assets/statusBands-CUhjcyuh.js","/assets/store-C7iBnI5G.js","/assets/table-2-D7j_hOwH.js","/assets/table-properties-B9593GH8.js","/assets/tag-CMGMwHNT.js","/assets/timer-off-B_0awR8i.js","/assets/trending-down-BorHkOwj.js","/assets/trending-up-CFLvtmpC.js","/assets/undo-2-C_8I2KM2.js","/assets/useChartTheme-DQicIkHz.js","/assets/useElementWidth-CaZbisRH.js","/assets/useIsMobile-Bux1JxBo.js","/assets/useOpenParam-CWDIPMyw.js","/assets/useStatusBands-BqKnv7BQ.js","/assets/useUrlScope-BL5px6xl.js","/assets/user-DHh7DbX_.js","/assets/user-cog-DGFo5zNG.js","/assets/user-minus-BEUMTLdQ.js","/assets/users-LcDA17UK.js","/assets/video-BSGCuszX.js","/assets/wallet-B1cUXszW.js","/assets/warehouse-BzFR_JFg.js","/assets/x-DdsBX_wp.js","/assets/zap-liGaE73J.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
