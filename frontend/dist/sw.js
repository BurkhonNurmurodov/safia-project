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

const BUILD = "2026-10-01T09:15:13.527Z";
const PRECACHE = ["/","/assets/AdminPanel-CQprqpyu.js","/assets/AnalysisBoard-fOPAXlGK.js","/assets/Arc-7VYCn9rk.js","/assets/ArcLegacy-DbdLMOe9.js","/assets/BrigadirProfile-DhGNzOMb.js","/assets/BroadcastReceivers-Bi5xS5_0.js","/assets/BroadcastRecord-CtlpSa3Y.js","/assets/CatLockNotice-DJWnclC-.js","/assets/CategoryLegendModal-C8I9C8x8.js","/assets/CellConcerns-x_ucTIe4.js","/assets/CellDetails-D2i0qmv-.js","/assets/CellFormModal-DxoPsxLi.js","/assets/CellIdent-CX_gwEUx.js","/assets/CellLink-CpPzZbCx.js","/assets/Cells-zGGz2_c6.js","/assets/ColumnFilter-DuFVTYCC.js","/assets/ColumnsPicker-DFZodwIm.js","/assets/CommentsModal-CLtuc0YB.js","/assets/ComparisonTable-CqisVJmi.js","/assets/Concerns-CZmX85Xe.js","/assets/ConfirmDialog-BwaNNd_G.js","/assets/Daily-CqtH3vXM.js","/assets/DataTable-CsAAmGTm.js","/assets/DateRangePicker-xIB0RB-M.js","/assets/DayReportView-BRyoH5Ll.js","/assets/DayStepper-CBxM4XMI.js","/assets/DifferenceBreakdown-Cw8jAkCe.js","/assets/Downtime-C2AEoy0W.js","/assets/Education-BwIVKfh6.js","/assets/EducationLesson-DUe0Wo76.js","/assets/EmptyState-BTiwkKkA.js","/assets/Exam-C39s98tZ.js","/assets/FactorySelect-CajqzhVK.js","/assets/Gamification-CUFLAoqi.js","/assets/GroupBadge-qP3VOpy8.js","/assets/HeatmapChart-XqVlK6IY.js","/assets/IdleCell-Dbn49VNi.js","/assets/KPICard-BsCDZCi3.js","/assets/Kaizen-C3VZxjWM.js","/assets/Kelish-BLcKKLdr.js","/assets/KpiDeltaCard-BPOgmi4u.js","/assets/LangTextInput-BgewaKG3.js","/assets/Layout-CUIRIs8D.js","/assets/LeaderAppeal-Dbkq1Y4U.js","/assets/LeaderDayReport-BU4hJlp8.js","/assets/LeaderUnitReport-DVygf2-r.js","/assets/Leaderboard-BkGqLjLj.js","/assets/Leaders-CKyvIMz_.js","/assets/Lightbox-BrWsH5Bb.js","/assets/LiveOverview--37lCEph.js","/assets/Login-Bl2tZE_J.js","/assets/NotFound-1f4DB4ph.js","/assets/Overview-MCcR0X2N.js","/assets/Pagination-D7AXiC7z.js","/assets/PerenaladkaFactTable-CdCQQt2_.js","/assets/PlanFulfillment-C7ZYOr_9.js","/assets/Production-gfo8HQKz.js","/assets/Profile-CSVLtbq2.js","/assets/ProofCamera-D985GeFK.js","/assets/ProofPhoto-hGVSpw67.js","/assets/Quality-DSxAhwWY.js","/assets/RequestStateChip-Ch5aQw3G.js","/assets/RichTextEditor-cXq-trbb.js","/assets/SaveState-R3TZe0a1.js","/assets/SearchInput-9xF9nFU6.js","/assets/SeasonalityHeatmap-ondFcpWM.js","/assets/SegmentedToggle-XWFHfnlo.js","/assets/SetupTimes-B1cjdlx5.js","/assets/ShiftDaily-DCJtvZkG.js","/assets/Staff-Cp_bo_xZ.js","/assets/StaffLive-CLBK2uA5.js","/assets/StatusBadge-DPE-22TV.js","/assets/TargetGoal-TnXbJIsX.js","/assets/Targets-DLzbbnc-.js","/assets/Tasks-DLLWh_jq.js","/assets/TimeWheelPicker-DobWA67x.js","/assets/Tooltip-BOaQyTdP.js","/assets/TrendChart-DgMBwwIH.js","/assets/TripleSpeedometer-qXqEfVpv.js","/assets/Trudoyomkost-B2MYd9y4.js","/assets/UploadDropzone-zVzOMzGk.js","/assets/UsersActivity-BJZbE3dl.js","/assets/VerdictBlock-BJeuSxZP.js","/assets/WatchProgress-wI8BflN8.js","/assets/WebLogin-D-5Rg7q0.js","/assets/WorkerConcerns-loy2cQdp.js","/assets/Workers-h6gzXQAI.js","/assets/Zagruzka-BmFvQL2A.js","/assets/ZagruzkaCell-n4cA-XiM.js","/assets/api-Gl7Azzhe.js","/assets/archive-UQjtRatl.js","/assets/archive-restore-DdctlOrP.js","/assets/arrow-down-C62IaERt.js","/assets/arrow-left-BosjrZR-.js","/assets/arrow-left-right-DJaKphkz.js","/assets/arrow-right-left-Bb-cn-HZ.js","/assets/arrow-up-BXSXKFLk.js","/assets/arrow-up-narrow-wide-BcPP39HY.js","/assets/arrow-up-right-CsjURiDg.js","/assets/award-BaCV2h4h.js","/assets/ban-BaXqqHzm.js","/assets/bot-BC-pzSbk.js","/assets/boxes-pQhUT1pr.js","/assets/brigadirFilters-BytJHSPe.js","/assets/broadcastTree-B57EGL49.js","/assets/building-2-Db2-zyMc.js","/assets/calendar-DHZMWfCM.js","/assets/calendar-clock-DM7LlFh0.js","/assets/calendar-days-B-VE36-N.js","/assets/calendar-range-0jIB7446.js","/assets/camera-CGtNuUzm.js","/assets/categories-CI9Y6wNx.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B_yahjtO.js","/assets/chart-line-_mvd2Hqt.js","/assets/chart-pie-C-9aEJ1W.js","/assets/chartRange-DCuRLWDu.js","/assets/chevron-left-CneExeyF.js","/assets/chevrons-up-down-BfrPTVIj.js","/assets/circle-B_cg5xRM.js","/assets/circle-check-big-Bgq_zIiR.js","/assets/circle-dot-Dsh57ol1.js","/assets/circle-minus-BEH_2j2R.js","/assets/circle-slash-BixbeSSb.js","/assets/circle-user-round-BtnybxL0.js","/assets/cloud-off-DWf8fkzA.js","/assets/cloud-upload-DI9AcZ2s.js","/assets/compass-ILtzVHdZ.js","/assets/concernCategories-BG1QKHip.js","/assets/copy-CRSoG9X3.js","/assets/corner-down-right-BZkVhSeX.js","/assets/createLucideIcon-Ck8yD_UI.js","/assets/es-BVDy-_LT.js","/assets/exportXlsx-KmVfBjJY.js","/assets/external-link-BLHDwdd-.js","/assets/file-clock-BZil2rM0.js","/assets/file-exclamation-point-ByPJQt02.js","/assets/file-spreadsheet-B-N4QxdI.js","/assets/file-text-DNnJtwu_.js","/assets/flag-DIDnoKH3.js","/assets/flame-yWjIVThY.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-nFl4_A40.js","/assets/hash-Cgl_vXTN.js","/assets/history-DajILKn-.js","/assets/hourglass-BwsYwvX4.js","/assets/id-card-CE8Xe2HC.js","/assets/image-BfJKgNZl.js","/assets/image-off-CzkCfHAL.js","/assets/index-6rNv2tEv.css","/assets/index-fp_kwtVJ.js","/assets/key-round-p0p0cEUl.js","/assets/keyboard-DaLWwqlE.js","/assets/languages-BtrhK9G0.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BRy3_8JS.js","/assets/lightbulb-DcaOngLD.js","/assets/link-2-93j-Bj2K.js","/assets/link-2-off-DJlWzVK2.js","/assets/list-checks-7YLjHbRn.js","/assets/list-ordered-C4rjDYCl.js","/assets/list-tree-C9pkgmRa.js","/assets/lock-open-BfJ10bi1.js","/assets/log-in-RzS_C4Pe.js","/assets/maximize-2-Cs0_FzvN.js","/assets/message-square-eYtMrrvf.js","/assets/minimize-2-8Y_5OsO0.js","/assets/package-check-vrW7VRze.js","/assets/paperclip-x3Foedyj.js","/assets/pencil-CguSpRTU.js","/assets/percent-Ct-7Qr64.js","/assets/personName-CogOuS3K.js","/assets/pin-D2KEtzjt.js","/assets/pin-off-Cq0SFxXo.js","/assets/play-RCq-ZZUY.js","/assets/plug-zap-CxqplgIU.js","/assets/presentation-Cumv0t-l.js","/assets/prop-types-0-P3RtLW.js","/assets/radio-Ci-wHQf0.js","/assets/react-apexcharts.esm-jk4MVfU2.js","/assets/repeat-CojLFWIY.js","/assets/rotate-ccw-BifrKGqR.js","/assets/rotate-cw-Bqtw6d7I.js","/assets/save-CkqH7rFS.js","/assets/scale-5x62Gexd.js","/assets/scopeLinks-ClvuXJJM.js","/assets/scroll-text-9q8Xub0G.js","/assets/search-x-rlSywksf.js","/assets/segments-Skz2hUmC.js","/assets/send-vYDb_Rw4.js","/assets/settings-2-zDBMDKdM.js","/assets/shield-BwPm_bqH.js","/assets/shield-alert-ARaqebiq.js","/assets/shield-check-Ci4QK5WY.js","/assets/shield-question-mark-BUWi3f2E.js","/assets/siren-DIV_Koyn.js","/assets/snowflake-DamiafPh.js","/assets/split-DICvJtH_.js","/assets/square-check-big-ClBKiVuH.js","/assets/square-mxCUlZn0.js","/assets/star-BAwkocDZ.js","/assets/statusBands-C_lUvQg6.js","/assets/store-hOfP6B60.js","/assets/table-2-CKjhg2ou.js","/assets/table-properties-Cr0w8SxF.js","/assets/tag-C0g6B7UR.js","/assets/timer-off-By9Gha2h.js","/assets/trending-down-DOyh24qk.js","/assets/trending-up-BAzVC9N1.js","/assets/undo-2-Btvi_DPT.js","/assets/useChartTheme-s7g3Tgu6.js","/assets/useElementWidth-CrfnoWuo.js","/assets/useIsMobile-BhPAzCHf.js","/assets/useMutation-DYffLlmi.js","/assets/useStatusBands-D3KL_MGs.js","/assets/useUrlScope-7SiXuHFx.js","/assets/user-cog-D8HYzflh.js","/assets/user-minus-CpPV8gxq.js","/assets/user-vOd4GSFF.js","/assets/users-DhATjwAw.js","/assets/video-D5sV0dA_.js","/assets/wallet-hq3iFs36.js","/assets/warehouse-BaTBrCUm.js","/assets/zap-ES0LjovE.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
