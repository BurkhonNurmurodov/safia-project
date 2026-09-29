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

const BUILD = "2026-09-29T14:15:25.557Z";
const PRECACHE = ["/","/assets/AdminPanel-0ARTnOsV.js","/assets/AnalysisBoard-DLDGC1hF.js","/assets/Arc-DG-O1mF2.js","/assets/ArcLegacy-HcqAoLEt.js","/assets/AttendanceModal-CZkcHUld.js","/assets/BrigadirProfile-CUNzXr7E.js","/assets/BroadcastReceivers-Co31hp2G.js","/assets/BroadcastRecord-CYMIwtQU.js","/assets/CatLockNotice-6OPDmMHp.js","/assets/CategoryLegendModal-CpgTOuud.js","/assets/CellConcerns-CGRgBL_n.js","/assets/CellDetails-BXMUaAnH.js","/assets/CellFormModal-Bg1ISsMO.js","/assets/CellLink-5ToSEJoa.js","/assets/Cells-DJdgYndf.js","/assets/ColumnFilter-iRatJTAZ.js","/assets/ColumnsPicker-BKqH3SHY.js","/assets/CommentsModal-CxODbsbZ.js","/assets/ComparisonTable-BnspzXSC.js","/assets/Concerns-ZFkm7CNW.js","/assets/ConfirmDialog-W2p0UsS4.js","/assets/Daily-D48-PIQy.js","/assets/DataTable-CZpC2Yb2.js","/assets/DateRangePicker-BhLvKjar.js","/assets/DayReportView-C98JilqZ.js","/assets/DayStepper-8l5jxL16.js","/assets/DifferenceBreakdown-CskfXRE_.js","/assets/Downtime-C1W7wuiZ.js","/assets/Education-BYfpCb1t.js","/assets/EducationLesson-G54FOYwb.js","/assets/EmptyState-BQwFLiRT.js","/assets/Exam-DJ2cHgt7.js","/assets/FactorySelect-r-miaDMX.js","/assets/Gamification-BQkLT_Se.js","/assets/GroupBadge-Der0kovg.js","/assets/HeatmapChart-CtN7J0kK.js","/assets/IdleCell-DLnpd0Me.js","/assets/KPICard-CaYF5tEN.js","/assets/Kaizen-CifCpTMi.js","/assets/Kelish-XJwNZJo9.js","/assets/KpiDeltaCard-Bj5-toZT.js","/assets/LangTextInput-CIbxVgzy.js","/assets/Layout-DTUEI-ox.js","/assets/LeaderAppeal-C47t_arc.js","/assets/LeaderDayReport-kuIdHf6o.js","/assets/LeaderUnitReport-DO8W0pBI.js","/assets/Leaderboard-sxFTZDcd.js","/assets/Leaders-sjTuWJJd.js","/assets/Lightbox-9KHxN58f.js","/assets/LiveOverview-C2HHgtEU.js","/assets/Login-Dje3r72J.js","/assets/NotFound-CxmNAQo_.js","/assets/Overview-BDoVGP7W.js","/assets/Pagination-DpnuGC87.js","/assets/PerenaladkaFactTable-DRS1Ka2s.js","/assets/PlanFulfillment-92sW5zji.js","/assets/Production-Cz2MdW9E.js","/assets/Profile-TTR_C-q2.js","/assets/ProofCamera-wgm375ZU.js","/assets/ProofPhoto-BWscjVmN.js","/assets/Quality-CoTs3ql_.js","/assets/RequestStateChip-CsfFMRfO.js","/assets/RichTextEditor-DHtFUG-g.js","/assets/SaveState-DIqS_vKe.js","/assets/SearchInput-BS3_pQQJ.js","/assets/SeasonalityHeatmap-Bjf1Klz2.js","/assets/SegmentedToggle-MfiTvKc0.js","/assets/SetupTimes-CW07mmtS.js","/assets/ShiftDaily-D1xb6B8D.js","/assets/Staff-BPf_Dj4e.js","/assets/StatusBadge-C5ZxXZmZ.js","/assets/TargetGoal-DNTGnhYM.js","/assets/Targets-CkGv_fdk.js","/assets/Tasks-ByRiSu6D.js","/assets/TimeWheelPicker-EnnyLGxb.js","/assets/Tooltip-BrstKmCN.js","/assets/TrendChart-BF4YydFI.js","/assets/TripleSpeedometer-CStBnry-.js","/assets/Trudoyomkost-Bdsz6ukk.js","/assets/UploadDropzone-BT8Z37hd.js","/assets/UsersActivity-By5rJnqo.js","/assets/VerdictBlock-CUSPlfBe.js","/assets/WatchProgress-BN9kCwD-.js","/assets/WebLogin-CVdDcq44.js","/assets/WorkerConcerns-DznQmsxA.js","/assets/Workers-_n15A0dK.js","/assets/Zagruzka-IO5ITfvm.js","/assets/ZagruzkaCell-Bj8P6T5R.js","/assets/api-NYHbgYWu.js","/assets/archive-Dzw273hY.js","/assets/archive-restore-wA-biYPY.js","/assets/arrow-down-BIj1GoZp.js","/assets/arrow-left-DAyS5pmz.js","/assets/arrow-left-right-CTF89e3R.js","/assets/arrow-up-DPSAu19a.js","/assets/arrow-up-narrow-wide-9p-XW0J5.js","/assets/arrow-up-right-D5YVD_2P.js","/assets/award-D1oF0t5J.js","/assets/ban-BWR0HsIZ.js","/assets/bot-CU0Gn4jJ.js","/assets/boxes-90Wx2fnz.js","/assets/brigadirFilters-CSVwygfs.js","/assets/broadcastTree-Co3l4K8G.js","/assets/building-2-_kqLcd_U.js","/assets/calendar-clock-Bi9eVmQG.js","/assets/calendar-days-FZhUDdHy.js","/assets/calendar-range-gRCU7EBO.js","/assets/calendar-tSln3bGs.js","/assets/camera-DYzheALl.js","/assets/categories-iPPFMiBR.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CCk8Q932.js","/assets/chart-line-D-nXRpIT.js","/assets/chart-pie-CcbMN7jo.js","/assets/chartRange-CLJOsOkI.js","/assets/chevron-left-BXL3JrhU.js","/assets/chevrons-up-down-CMLQ0LTc.js","/assets/circle-9A9mlwZH.js","/assets/circle-check-big-Bkn1_NJi.js","/assets/circle-dot-CvP8tMDN.js","/assets/circle-minus-CxipXVwI.js","/assets/circle-slash-BmOLN7n3.js","/assets/circle-user-round-DLT0mm32.js","/assets/cloud-off-zUMPrFC4.js","/assets/cloud-upload-C0HsIeDH.js","/assets/compass-Cee0x5GZ.js","/assets/concernCategories-7RSv9m0B.js","/assets/copy-CUfkJ_dc.js","/assets/corner-down-right-ClnuJA3n.js","/assets/createLucideIcon-C872DUYA.js","/assets/es-CvTU9GnO.js","/assets/exportXlsx-ChsFAzc-.js","/assets/external-link-BFT-9sr0.js","/assets/file-clock-CQjrz_sZ.js","/assets/file-exclamation-point-BuaYMpi7.js","/assets/file-spreadsheet-M0fF_8ju.js","/assets/file-text-DhdofI8l.js","/assets/flag-9FcmXYP5.js","/assets/flame-C1LL0i8X.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BQ7_fcFg.js","/assets/hash-CZH93WK9.js","/assets/history-CVeMnWgs.js","/assets/hourglass-qZ7af-VE.js","/assets/image-6h1zBQRa.js","/assets/image-off-DtjHqtIP.js","/assets/index-C_T6aH6A.js","/assets/index-ClcfsWXQ.css","/assets/key-round-BKqgYMTK.js","/assets/keyboard-CDAscCa9.js","/assets/languages-Bt4A9fHS.js","/assets/layers-DCpUE361.js","/assets/lightbulb-OqdOUPv1.js","/assets/link-2-D1O8xiyi.js","/assets/link-2-off-AGUAFNG6.js","/assets/list-checks-zV8-0ln5.js","/assets/list-ordered-BS4d3l27.js","/assets/list-tree-CH-r-YCB.js","/assets/lock-open-DjqH3QbS.js","/assets/log-in-DtGuak78.js","/assets/maximize-2-D84Gv-Cn.js","/assets/message-square-DH1fPzTq.js","/assets/minimize-2-D9R9yvV8.js","/assets/package-check-B3aRvg1D.js","/assets/paperclip-OUAnkee3.js","/assets/pencil-D3awWMgs.js","/assets/percent-BfkaIPwr.js","/assets/personName-CogOuS3K.js","/assets/pin-BEWfO5M1.js","/assets/pin-off-BVj5tckA.js","/assets/play-4FKiTN-Q.js","/assets/presentation-iAosJGXz.js","/assets/prop-types-BIVp7sJT.js","/assets/radio-B99E1Z7r.js","/assets/react-apexcharts.esm-CUk_dR6b.js","/assets/repeat-BKbAtXA3.js","/assets/rotate-ccw-DBdggCA-.js","/assets/rotate-cw-VvfYNBfz.js","/assets/save-C9fqYmp6.js","/assets/scale-BBCu54G3.js","/assets/scroll-text-CmZpNg-5.js","/assets/search-x-BG8KXoOA.js","/assets/segments-BoTNwFXf.js","/assets/send-ChG_LuCB.js","/assets/settings-2-wJE0bujJ.js","/assets/shield-BIjUGkxz.js","/assets/shield-alert-DbDvoBCj.js","/assets/shield-check-C12i3gpC.js","/assets/shield-question-mark-BRok9eDJ.js","/assets/siren-9GBsn5Qr.js","/assets/snowflake-DFdsrpFm.js","/assets/square-96SmfVVC.js","/assets/square-check-big-B-OG_UvL.js","/assets/star-DZi4BA1X.js","/assets/statusBands-Bks0nyGC.js","/assets/store-Pgw2C640.js","/assets/table-2-D1Wp9Fii.js","/assets/table-properties-w2_8jPli.js","/assets/tag-vMNsLUXP.js","/assets/timer-off-l0oNDRlQ.js","/assets/trending-down-1NPXdHhs.js","/assets/trending-up-BXAn-e35.js","/assets/undo-2-BQMoJQ4r.js","/assets/useChartTheme-BXUBo_Nt.js","/assets/useElementWidth-C673JOb1.js","/assets/useIsMobile-v3phfqZT.js","/assets/useMutation-K3mppw8b.js","/assets/useStatusBands-BMAOhvTs.js","/assets/user-CHQSv30Z.js","/assets/user-cog-CaS1Dze3.js","/assets/user-minus-vx3WyCuW.js","/assets/users-BKypU1nI.js","/assets/video-ZGLHc2tE.js","/assets/wallet-BElGOVGM.js","/assets/warehouse-DtFK7-EB.js","/assets/zap-B9iuUbjC.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
