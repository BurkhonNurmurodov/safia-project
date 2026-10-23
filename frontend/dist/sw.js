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

const BUILD = "2026-10-23T06:16:13.060Z";
const PRECACHE = ["/","/assets/AdminPanel-CALkKxky.js","/assets/AnalysisBoard-0XjMMYCQ.js","/assets/Arc-DyagqhP_.js","/assets/Assistant-DfjE8XdH.js","/assets/BrigadirProfile-DbRWZENO.js","/assets/BroadcastReceivers-CpoQ941N.js","/assets/BroadcastRecord-BxaXgxh7.js","/assets/Button-DaxySkKN.js","/assets/CatLockNotice-BLD55vmk.js","/assets/CategoryLegendModal-DXUilewG.js","/assets/CellConcerns-BO1JoK8H.js","/assets/CellDetails-CcslHJK7.js","/assets/CellFormModal-B8sWXZRb.js","/assets/CellIdent-C5ZE4aa_.js","/assets/CellLink-ByNP6ulJ.js","/assets/Cells-OvdjtB2E.js","/assets/ColumnFilter-Cn2WAXFc.js","/assets/ColumnsPicker-D9Eoo4_u.js","/assets/CommentsModal-BTmWbUVo.js","/assets/ComparisonTable-D26znO8w.js","/assets/Concerns-COEHeuhs.js","/assets/CountStepper-BJUuCJ8g.js","/assets/Daily-DGHuMeVG.js","/assets/DataTable-DiamrDxc.js","/assets/DateRangePicker-C8uMh31f.js","/assets/DayReportView-DUOv9kpn.js","/assets/DayStepper-tqHNOmGT.js","/assets/DayStrip-vy46gx35.js","/assets/DifferenceBreakdown-C4BIbN67.js","/assets/Downtime-BRgicFld.js","/assets/Education-HW1TbgBW.js","/assets/EducationLesson-CdKbKZ8q.js","/assets/EmptyState-BclQi10r.js","/assets/Exam-CLTQnWzq.js","/assets/FactorySelect-DojDaHCq.js","/assets/Gamification-DXLKbRJ-.js","/assets/GroupBadge-BMhB7UZP.js","/assets/HeatmapChart-DI8qhjC8.js","/assets/IdleCell-DjzhW9xv.js","/assets/KPICard-CnCDkx5W.js","/assets/Kaizen-HmubOCRc.js","/assets/Kelish-DZRg2t_T.js","/assets/KpiDeltaCard-DbssMRac.js","/assets/LangTextInput-BmTz3uhP.js","/assets/Layout-D-RkWlbh.js","/assets/LeaderAppeal-CjUBWnfx.js","/assets/LeaderDayReport-DsGlYyT8.js","/assets/LeaderUnitReport-C_YlNM8D.js","/assets/Leaderboard-IoYMf0yx.js","/assets/Leaders-DdBkGtzt.js","/assets/LeadersKpi-BhSLL7mC.js","/assets/Lightbox-DJdYGocj.js","/assets/LiveOverview-D1blxq5i.js","/assets/Login-CfoVBsbt.js","/assets/NotFound-CBC85s36.js","/assets/Notifications-DNN828IX.js","/assets/Ontime-CPf-VNw0.js","/assets/Overview-ChXnP7vG.js","/assets/Pagination-BIiEEg_6.js","/assets/PerenaladkaFactTable-3HL4SV0o.js","/assets/PersonCard-PEdo1y2M.js","/assets/PlanFulfillment-B1FOI61z.js","/assets/Production-BaWaKUph.js","/assets/Profile-BNzgJ0Fs.js","/assets/ProofCamera-CyKhD6zG.js","/assets/ProofPhoto-DcJUu1J2.js","/assets/Quality-C0Bnkbtf.js","/assets/RawRows-35zCvw1w.js","/assets/RequestStateChip-B8XDltVk.js","/assets/RichTextEditor-mSGp6o0h.js","/assets/SaveState-DpWJY1jh.js","/assets/SearchInput-rBYLJPv5.js","/assets/SeasonalityHeatmap-s4JSmamE.js","/assets/SegmentedToggle-DMfYvzvV.js","/assets/SetupTimes-CRqsJRc_.js","/assets/ShiftDaily-CGQFVKQi.js","/assets/Staff-BXueFyzI.js","/assets/StaffListAtCheck-DCBoRYzt.js","/assets/StatusBadge-2_WT8Q6X.js","/assets/StatusBandsModal-Aj9DI0IT.js","/assets/TargetGoal-DbtWsfCN.js","/assets/Targets-CdKXwDYi.js","/assets/Tasks-RfA8H5ph.js","/assets/TimeWheelPicker-2j3Lzxys.js","/assets/Toast-BquTKoag.js","/assets/Tooltip-JPE83TDT.js","/assets/TrendChart-CDtxDR_p.js","/assets/TripleSpeedometer-B2rKqedC.js","/assets/Trudoyomkost-JXqijazX.js","/assets/UploadDropzone-CpxNRs9j.js","/assets/UsersActivity-CnwV83Jm.js","/assets/VerdictBlock-Bf99c39K.js","/assets/VfxApiMap-VNxw4Dn9.js","/assets/VfxDictionaries-CduY-JT7.js","/assets/VfxEmployees-C2voHbza.js","/assets/VfxHrMoves-DWbFvXm3.js","/assets/VfxJobs-Dm6DH1ib.js","/assets/VfxPhoto-CX48Hln6.js","/assets/VfxShifts-D9G2tNN1.js","/assets/VfxState-7DEOJ4Vv.js","/assets/VfxTimebooks-IDGspZfH.js","/assets/VfxTimesheet-DKceG4jI.js","/assets/WatchProgress-MuUb24_b.js","/assets/WebLogin-BwRoZSzK.js","/assets/Workers-C0cu9ufl.js","/assets/Zagruzka-yU0kSWrS.js","/assets/ZagruzkaCell-l-9xsyhD.js","/assets/api-D2R0CfIX.js","/assets/archive-ByUol-D-.js","/assets/archive-restore-CaH2uIj_.js","/assets/arrow-down-BYQJN4AU.js","/assets/arrow-down-right-V8k3uKpU.js","/assets/arrow-down-wide-narrow-_HBqQzAJ.js","/assets/arrow-up-narrow-wide-DQviUA6E.js","/assets/ban-C6DEAuhO.js","/assets/boxes-CgKMUW1Q.js","/assets/braces-CiDmpnXX.js","/assets/brigadirFilters-BWmIRNo_.js","/assets/broadcastTree-BiEkFY3F.js","/assets/building-2-Dkv03EVb.js","/assets/calendar-days-Drq23s4a.js","/assets/calendar-oniqjTJo.js","/assets/camera-DpV7vayo.js","/assets/categories-qcDP02qU.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BXZxnwup.js","/assets/chart-line-Vg18IVTO.js","/assets/chart-pie-0K09NmSr.js","/assets/chartRange-mUoqlGxs.js","/assets/check-check-JZiAFZKX.js","/assets/chevron-left-BbOaow5h.js","/assets/chevrons-up-down-BxzOXyXg.js","/assets/circle-CPVXcHOq.js","/assets/circle-alert-MJn2eG5Q.js","/assets/circle-check-big-D-YE_qUx.js","/assets/circle-dashed-DMGNyIdl.js","/assets/circle-minus-CDVo_bFA.js","/assets/circle-question-mark-DiHOrNMJ.js","/assets/circle-slash-DV2jgL9h.js","/assets/circle-user-round-ObMdqH04.js","/assets/cloud-off-DvgqiSwH.js","/assets/cloud-upload-0xkIFjdX.js","/assets/compass-d2_iJHm7.js","/assets/concernCategories-BnDL9faM.js","/assets/corner-down-right-DJ2opNOS.js","/assets/createLucideIcon-ZGlXXGoO.js","/assets/es-k_WjQaDh.js","/assets/external-link-Cu6IcA8u.js","/assets/file-clock-C5leHfwl.js","/assets/file-exclamation-point-C6LCOA_R.js","/assets/flag-BMppT29u.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BakOPs3R.js","/assets/funnel-B8Rix62X.js","/assets/hash-CN_01-9O.js","/assets/hourglass-KyAJQWkm.js","/assets/image-DNye_mgl.js","/assets/image-off-A5OBfhNF.js","/assets/inbox-EPQPMdv2.js","/assets/index-Ct9WqSVA.css","/assets/index-qgpTJiiO.js","/assets/keyboard-CmKyw0SU.js","/assets/languages-C9jZYxvo.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DAzj_IpR.js","/assets/lightbulb-CMHrqMYA.js","/assets/link-2-CIqrwync.js","/assets/link-2-off-qMWRkmsf.js","/assets/list-ordered-99tlZLPN.js","/assets/list-tree-ClwXDQ3Y.js","/assets/lock-open-Bx2Z4lF8.js","/assets/log-in-DKiLmX7o.js","/assets/marks-DYYDndxq.js","/assets/minimize-2-o3KxZImF.js","/assets/package-check-CbEn25LF.js","/assets/pencil-BgioMt_n.js","/assets/percent-CeD_0dB1.js","/assets/pin-DNw6yQWd.js","/assets/pin-off-n2IzooOQ.js","/assets/play-DLDvRpUC.js","/assets/plug-zap-BpIQBS6R.js","/assets/prop-types-CLQewAWd.js","/assets/radio-4TkYoe73.js","/assets/react-apexcharts.esm-DGt6Oxxd.js","/assets/registers-BS_qL0Ow.js","/assets/repeat-CER4srmE.js","/assets/save-Bn-c4dXq.js","/assets/scopeLinks-28IahZax.js","/assets/scroll-text-DUbcgBWs.js","/assets/search-x-kfXiiTrU.js","/assets/segments-CAY8kb4R.js","/assets/send-EUpxiO5i.js","/assets/settings-2-DXo4n1Uz.js","/assets/shield-C4hD907y.js","/assets/shield-alert-wx5VKVFV.js","/assets/shield-question-mark-DKFK-DhE.js","/assets/sigma-C_IQ7PkR.js","/assets/siren-DuHyns61.js","/assets/snowflake-Dju1C93I.js","/assets/split-CWNXZW0G.js","/assets/square-check-big-aM9kuP5e.js","/assets/star-DtF0rKGO.js","/assets/statusBands-wZ_7ujq7.js","/assets/store-DxtzE483.js","/assets/table-2-CZLohkqP.js","/assets/table-properties-VRqM72oo.js","/assets/tag-Rt8hC_2S.js","/assets/timer-off-WpKca87l.js","/assets/trendBuckets-AQIQBVNN.js","/assets/trending-down-CxIm4CW3.js","/assets/trending-up-HOE_VAIh.js","/assets/undo-2-D8aa25Wt.js","/assets/useChartTheme-D52z4gbY.js","/assets/useElementWidth-ffJwedKV.js","/assets/useIsMobile-DfLFfGrB.js","/assets/useOpenParam-DB4ASGa8.js","/assets/useStatusBands-DF-Wv-Xo.js","/assets/useUrlScope-C-_kAObb.js","/assets/user-DOp3bDet.js","/assets/user-cog-Df5gXYhj.js","/assets/user-minus-BKsmeeVy.js","/assets/users-DCGi2W-Q.js","/assets/vfx-Dcg4K1L1.js","/assets/video-BpUOLBW2.js","/assets/wallet-Wo-NlJR5.js","/assets/warehouse-D91hdZYw.js","/assets/workflow-D1NJVxe_.js","/assets/x-BghlWqtL.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
