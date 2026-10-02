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

const BUILD = "2026-10-02T18:59:53.108Z";
const PRECACHE = ["/","/assets/AdminPanel-Bkjds-a4.js","/assets/AnalysisBoard-C5AADBR8.js","/assets/Arc-C3cpuSgO.js","/assets/ArcLegacy-CLNic4ht.js","/assets/BrigadirProfile-D8-Pt_QH.js","/assets/BroadcastReceivers-BptS9iNy.js","/assets/BroadcastRecord-BdUZgs8c.js","/assets/CatLockNotice-BQWNMELT.js","/assets/CategoryLegendModal-osqScXF6.js","/assets/CellConcerns-NA95lSmL.js","/assets/CellDetails-BwlgGWT0.js","/assets/CellFormModal-DnWMYO6I.js","/assets/CellIdent-B9ttXKbf.js","/assets/CellLink-DCJI-NTA.js","/assets/Cells-CiXQ0vFC.js","/assets/ColumnFilter-BCgtg9PF.js","/assets/ColumnsPicker-B90T4rXf.js","/assets/CommentsModal-DE5eay5U.js","/assets/ComparisonTable-C-cDsmqW.js","/assets/Concerns-CnNLJmUu.js","/assets/ConfirmDialog-BBL4TJGf.js","/assets/Daily-Dkm-8ju6.js","/assets/DataTable-Da__2i9d.js","/assets/DateRangePicker-DCtEBfZr.js","/assets/DayReportView-CD3_mjwT.js","/assets/DayStepper-B7gkSFUz.js","/assets/DifferenceBreakdown-BxzUq6ko.js","/assets/Downtime-BiOuCqRl.js","/assets/Education-hWY2KlpT.js","/assets/EducationLesson-aZYPbpKQ.js","/assets/EmptyState-Cq1Bun_P.js","/assets/Exam-lnVpKEGD.js","/assets/FactorySelect-CDCuKUv7.js","/assets/Gamification-cb-4y5jv.js","/assets/GroupBadge-Bnpx8TVT.js","/assets/HeatmapChart-zfmHDdLL.js","/assets/IdleCell-_tVGtjl5.js","/assets/KPICard-CaLUgi0y.js","/assets/Kaizen-CMwgcIQx.js","/assets/Kelish-BmOa4n8G.js","/assets/KpiDeltaCard-JX5at1VS.js","/assets/LangTextInput-D5K2fIrO.js","/assets/Layout-auhkgEgw.js","/assets/LeaderAppeal-_xfxzT7F.js","/assets/LeaderDayReport-CXezm-YA.js","/assets/LeaderUnitReport-DBwhtE6c.js","/assets/Leaderboard-KBXspM6b.js","/assets/Leaders-C8Sj59sm.js","/assets/Lightbox-DYiYiZ1S.js","/assets/LiveOverview-CtjyOgvO.js","/assets/Login-Cm3mh7_I.js","/assets/NotFound-D6khgda0.js","/assets/Notifications-CQQ8mmDn.js","/assets/Overview-ORdrdZzZ.js","/assets/Pagination-pEc9s5Cq.js","/assets/PerenaladkaFactTable-BvIP7wFr.js","/assets/PlanFulfillment-Buh4DUrA.js","/assets/Production-fApnA489.js","/assets/Profile-CkqS4uTX.js","/assets/ProofCamera-DyYngjJU.js","/assets/ProofPhoto-Ctl98ne8.js","/assets/Quality-i4G7puB_.js","/assets/RequestStateChip-2SHK0K5B.js","/assets/RichTextEditor-CLH5N8d4.js","/assets/SaveState-fZGjRAE0.js","/assets/SearchInput-QIkxUw8M.js","/assets/SeasonalityHeatmap-VBLtClkZ.js","/assets/SegmentedToggle-BAdt5qf8.js","/assets/SetupTimes-E9BQEzLK.js","/assets/ShiftDaily-BRj8tpB4.js","/assets/Staff-DhVpGeIm.js","/assets/StaffLive-DoChKDff.js","/assets/StatusBadge-4hKnaP6g.js","/assets/TargetGoal-DS8RhNfr.js","/assets/Targets-D9POaBVV.js","/assets/Tasks-DFbTuhkN.js","/assets/TimeWheelPicker-8Bm9cRdq.js","/assets/Toast-eJln6OZH.js","/assets/Tooltip-5DjhgS-E.js","/assets/TrendChart-SL-_mgzy.js","/assets/TripleSpeedometer-G47o5AXA.js","/assets/Trudoyomkost-nAYZSB4R.js","/assets/UploadDropzone-BtkUlpw5.js","/assets/UsersActivity-CpA2TuPA.js","/assets/VerdictBlock-DHBuvkSr.js","/assets/WatchProgress-DTVeE46d.js","/assets/WebLogin-DJUjEOfF.js","/assets/WorkerConcerns-BN-MmUS8.js","/assets/Workers-CpxLoXUG.js","/assets/Zagruzka-CMYYLurU.js","/assets/ZagruzkaCell-BqsmkWmm.js","/assets/api-rOgjGPtI.js","/assets/archive-C7DfQ8WC.js","/assets/archive-restore-CfpHOwqH.js","/assets/arrow-down-DbkCMmJH.js","/assets/arrow-left-CMn3Sl9L.js","/assets/arrow-right-left-pAsi9REP.js","/assets/arrow-up-Do36Tg-u.js","/assets/arrow-up-narrow-wide-18i4o0ZS.js","/assets/arrow-up-right-BPgbnEQY.js","/assets/award-DUbWnedX.js","/assets/ban-CHlc4JQV.js","/assets/bot-DtTJ-9LK.js","/assets/boxes-DG80jmzd.js","/assets/brigadirFilters-D1nQNJ9e.js","/assets/broadcastTree-ykVtHUZ6.js","/assets/building-2-Do958s3y.js","/assets/calendar-BegMaDJU.js","/assets/calendar-days-BwjbzM3k.js","/assets/calendar-range-Y-vKPQ8u.js","/assets/camera-3hRzo0pn.js","/assets/categories-BLJvLhx0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CEbatcXi.js","/assets/chart-line-BOAfPoIl.js","/assets/chart-pie-D1323uLA.js","/assets/chartRange-BX7TaWmS.js","/assets/chevron-left-BVCsdyuO.js","/assets/chevrons-up-down-DMJrytNP.js","/assets/circle-CZNrk9bb.js","/assets/circle-alert-DatCV-1i.js","/assets/circle-check-big-C4HH1-we.js","/assets/circle-minus-D8l4slBI.js","/assets/circle-question-mark-DtJnmkI9.js","/assets/circle-slash-D-CEgOpQ.js","/assets/circle-user-round-C5lkMVpA.js","/assets/cloud-off-B78OxPfl.js","/assets/cloud-upload-CXM2AIPC.js","/assets/compass-DnNHv_62.js","/assets/concernCategories-DxLK0i3v.js","/assets/copy-DWxqfBc5.js","/assets/corner-down-right-NLxeVRpP.js","/assets/createLucideIcon-BvQtBNRp.js","/assets/es-DsrUM-ry.js","/assets/exportXlsx-BcZpoEcP.js","/assets/external-link-Dk8DcicF.js","/assets/file-clock-DyBnsd5M.js","/assets/file-exclamation-point-DBuiAqGF.js","/assets/file-spreadsheet-D3N9szVs.js","/assets/file-text-ocwB48vv.js","/assets/flag-CD7y3M7L.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-gSOeZ_YK.js","/assets/hash-C_-GY7Yw.js","/assets/history-Wgt86gKj.js","/assets/hourglass-Dk6Sm8wZ.js","/assets/id-card-DS0SpLnO.js","/assets/image-DRWT95Tb.js","/assets/image-off-DWv7YJEg.js","/assets/inbox-CYnAxh5f.js","/assets/index-B1c5w8hB.js","/assets/index-BctiIRrp.css","/assets/key-round-BK32ISDL.js","/assets/keyboard-_z1Yeuk6.js","/assets/languages-DiILLXLI.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DH5kqq3x.js","/assets/lightbulb-BYD_3xlz.js","/assets/link-2-DiGDkMNp.js","/assets/link-2-off-jCozvbQf.js","/assets/list-ordered-C2mipB2Y.js","/assets/list-tree-Dskmik2s.js","/assets/lock-open-CbP7z8HA.js","/assets/log-in-BHtLpGM7.js","/assets/maximize-2-BvCaaJuP.js","/assets/message-square-BHh8oQok.js","/assets/minimize-2-DqJxa5RN.js","/assets/package-check-DLmM9ISw.js","/assets/paperclip-C0XbxzS7.js","/assets/pencil-Bk6Ag3WC.js","/assets/percent-D0L3qGt3.js","/assets/pin-BicUj1Hb.js","/assets/pin-off-B-bYjVKG.js","/assets/play-CiPAZ3Ko.js","/assets/plug-zap-CyWBXdPI.js","/assets/presentation-DIsAR_EB.js","/assets/prop-types-D-09FhdF.js","/assets/radio-uTPOOohr.js","/assets/react-apexcharts.esm-823zCvf2.js","/assets/repeat-ix-8WenB.js","/assets/rotate-ccw-COJVXwq8.js","/assets/rotate-cw-pPI6QYM6.js","/assets/save-u0TjIcAJ.js","/assets/scopeLinks-Da3iJFYX.js","/assets/scroll-text-DOw7AXzX.js","/assets/search-x-DDIJ75FI.js","/assets/segments-CuRNi19i.js","/assets/send-Cj4ZEFVq.js","/assets/settings-2-DUVMcmzZ.js","/assets/shield-alert-CKnqaI9A.js","/assets/shield-check-LdwZyXsb.js","/assets/shield-ehSslbHf.js","/assets/shield-question-mark-CJa2MgBs.js","/assets/siren-C8IvZl2Z.js","/assets/snowflake-BZfDLXk1.js","/assets/split-D4WLqDGN.js","/assets/square-check-big-D826QCWP.js","/assets/square-zMnbM0Uf.js","/assets/star-BPzr9Zoe.js","/assets/statusBands-B9zr1P7P.js","/assets/store-CCWzkCRG.js","/assets/table-2-BDqXwr9G.js","/assets/table-properties-BCpMoMGT.js","/assets/tag-Dvm448eT.js","/assets/timer-off-C0RUKjX3.js","/assets/trending-down-Bjw3bQoZ.js","/assets/trending-up-CKwjV_8w.js","/assets/undo-2-9UctJkY3.js","/assets/useChartTheme-DuLzx1vl.js","/assets/useElementWidth-vbBXPll_.js","/assets/useIsMobile-D7CkQ3Tv.js","/assets/useOpenParam-DhItwtVq.js","/assets/useStatusBands-qE_I2zdP.js","/assets/useUrlScope-BdvUPsT_.js","/assets/user-BWliaFq3.js","/assets/user-cog-D-A5-n06.js","/assets/user-minus-BGHe3Ywb.js","/assets/users-gqKVBa2L.js","/assets/video-Bz8TBi8O.js","/assets/wallet-BK2xFvcd.js","/assets/warehouse-Cc2Eg4nZ.js","/assets/x-_yfe_5gH.js","/assets/zap-B85fOlHO.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
