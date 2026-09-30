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

const BUILD = "2026-09-30T06:04:00.278Z";
const PRECACHE = ["/","/assets/AdminPanel-pyMHdJP_.js","/assets/AnalysisBoard-BI1MFT4k.js","/assets/Arc-BId2QTc7.js","/assets/ArcLegacy-Co8vEkqS.js","/assets/AttendanceModal-D8Qx8oes.js","/assets/BrigadirProfile-zpHFRb9Y.js","/assets/BroadcastReceivers-D9P21caN.js","/assets/BroadcastRecord-CRDwVFnK.js","/assets/CatLockNotice-BJD4sJIG.js","/assets/CategoryLegendModal-CLzgc1pU.js","/assets/CellConcerns-DX8iOVYi.js","/assets/CellDetails-CuKBopKu.js","/assets/CellFormModal-DxTwgKzv.js","/assets/CellLink-DCvpK58f.js","/assets/Cells-uk4UV0J7.js","/assets/ColumnFilter-DaL27JxV.js","/assets/ColumnsPicker-CpN_sNrY.js","/assets/CommentsModal-DxqjfJKk.js","/assets/ComparisonTable-Bwl37PA1.js","/assets/Concerns-CosVw1ix.js","/assets/ConfirmDialog-CwX9JEJR.js","/assets/Daily-Bhr6iJp8.js","/assets/DataTable-C8nilAsK.js","/assets/DateRangePicker-LuyYUUMN.js","/assets/DayReportView-BMLEZ3y8.js","/assets/DayStepper-BIKFRvDg.js","/assets/DifferenceBreakdown-Ctw7a1mK.js","/assets/Downtime-C640tKRI.js","/assets/Education-CAho2aQK.js","/assets/EducationLesson-CA8eDj8B.js","/assets/EmptyState-Cv_s-VIT.js","/assets/Exam-fMszaj92.js","/assets/FactorySelect-BPz-5U9C.js","/assets/Gamification-BdB7pL8v.js","/assets/GroupBadge-BUjuCFCI.js","/assets/HeatmapChart-CDGMRTdK.js","/assets/IdleCell-Ca45JOxA.js","/assets/KPICard-B3X7uYue.js","/assets/Kaizen-pxdkJGKl.js","/assets/Kelish-Bon8LnZL.js","/assets/KpiDeltaCard-DU4tPkOH.js","/assets/LangTextInput-BXroJYz4.js","/assets/Layout-D2-WGBk7.js","/assets/LeaderAppeal--Ko6cRNA.js","/assets/LeaderDayReport-CeW55qAt.js","/assets/LeaderUnitReport-DZDhweLP.js","/assets/Leaderboard-o4djkIdr.js","/assets/Leaders-D-Bk5JxS.js","/assets/Lightbox-CLLQmw1A.js","/assets/LiveOverview-Ci2BySoj.js","/assets/Login-24LtJtp_.js","/assets/NotFound-D9CQ5Uuf.js","/assets/Overview-DM4lhMiT.js","/assets/Pagination-C8YI1USD.js","/assets/PerenaladkaFactTable-CDwqSkhm.js","/assets/PlanFulfillment-DPYqBK9W.js","/assets/Production-RGPE_6N-.js","/assets/Profile-Dr6XIGI4.js","/assets/ProofCamera-Cc20pqFC.js","/assets/ProofPhoto-BxRVxoMj.js","/assets/Quality-5XOlXxGP.js","/assets/RequestStateChip-D0aV5VD1.js","/assets/RichTextEditor-BjaN_af_.js","/assets/SaveState-BNarA_w2.js","/assets/SearchInput-Dndb8aOn.js","/assets/SeasonalityHeatmap-BpAT_WMV.js","/assets/SegmentedToggle-D90LChoV.js","/assets/SetupTimes-YYVM1Kcm.js","/assets/ShiftDaily-C5GIHyvh.js","/assets/Staff-EH1YLFOt.js","/assets/StatusBadge-CHVAJ2OZ.js","/assets/TargetGoal-CCpnx4W9.js","/assets/Targets-CyKhd0At.js","/assets/Tasks-DghgN1HL.js","/assets/TimeWheelPicker-DrIKxWrT.js","/assets/Tooltip-Ckvuzx_z.js","/assets/TrendChart-D0SEsQsD.js","/assets/TripleSpeedometer-DSuh5yVC.js","/assets/Trudoyomkost-DMWG2QuH.js","/assets/UploadDropzone-CcY2bTWF.js","/assets/UsersActivity-D7sM0JGR.js","/assets/VerdictBlock-CHxARgnb.js","/assets/WatchProgress-CNKp3HiK.js","/assets/WebLogin-BM8Oankr.js","/assets/WorkerConcerns-CSUoWoTa.js","/assets/Workers-86_c381g.js","/assets/Zagruzka-CV_cavkV.js","/assets/ZagruzkaCell-CvRc4n_k.js","/assets/api-CV7cat_0.js","/assets/archive-Ck72fQJy.js","/assets/archive-restore-CggYsb9y.js","/assets/arrow-down-DEcegPDv.js","/assets/arrow-left-CJXzMMu9.js","/assets/arrow-left-right-Bd9AJ1ou.js","/assets/arrow-up-BDwMMSvC.js","/assets/arrow-up-narrow-wide-CilQn559.js","/assets/arrow-up-right-CFXXssR0.js","/assets/award-Die-naIK.js","/assets/ban-Qlih2tKA.js","/assets/bot-Cyn9ZfAJ.js","/assets/boxes-Dq01sA2y.js","/assets/brigadirFilters-D906qo8M.js","/assets/broadcastTree-CrD48bUj.js","/assets/building-2-qtoMcufI.js","/assets/calendar-CWLFEtXc.js","/assets/calendar-clock-DJNtPSSl.js","/assets/calendar-days-BM3ZEkq2.js","/assets/calendar-range-DVs5Lpu7.js","/assets/camera-DFnj_nQP.js","/assets/categories-DRflOTjn.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DWbA9NRS.js","/assets/chart-line-CJxVv0s2.js","/assets/chart-pie-Dva33nA5.js","/assets/chartRange-vWWqnYem.js","/assets/chevron-left-Bs_X0hG9.js","/assets/chevrons-up-down-DK5T0Vue.js","/assets/circle-BNxBNLuG.js","/assets/circle-check-big-r4MM0VsK.js","/assets/circle-dot-C3kJWDip.js","/assets/circle-minus-jycgvKI0.js","/assets/circle-slash-9efdSNMw.js","/assets/circle-user-round-BfC7ihz4.js","/assets/cloud-off-A6Mpbojz.js","/assets/cloud-upload-2Mb7Sexg.js","/assets/compass-Bh42hlwK.js","/assets/concernCategories-DiCG3__R.js","/assets/copy-wa4J3SFv.js","/assets/corner-down-right-B7IYxyEY.js","/assets/createLucideIcon-B3sNt90L.js","/assets/es-BahhUTRo.js","/assets/exportXlsx-BwCAMNgZ.js","/assets/external-link-CziPP51v.js","/assets/file-clock-aJaXOAlc.js","/assets/file-exclamation-point-CyooTJRg.js","/assets/file-spreadsheet--ctDEkBs.js","/assets/file-text-CvKEDV5A.js","/assets/flag-DRwHy_fs.js","/assets/flame-DfPAamva.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-WDi_qaMM.js","/assets/hash-BBneqB6v.js","/assets/history-BrGELp9o.js","/assets/hourglass-DrPpjO2e.js","/assets/image-BZ_owNdl.js","/assets/image-off-CDXjJTlu.js","/assets/index-B8JHyLjE.css","/assets/index-D2Hb1UCH.js","/assets/key-round-CwUtSI9t.js","/assets/keyboard-CD3OlheJ.js","/assets/languages-BlYzkAhJ.js","/assets/layers-CCOsGBkN.js","/assets/lightbulb-CGBFoTS8.js","/assets/link-2-BWESytzj.js","/assets/link-2-off-l0N1vd8E.js","/assets/list-checks--AGNHlfK.js","/assets/list-ordered-dKohEqdY.js","/assets/list-tree-zk0i_bSj.js","/assets/lock-open-Bl88KjxB.js","/assets/log-in-CrQFEC7g.js","/assets/maximize-2-tqsBf4rT.js","/assets/message-square-BuugCciJ.js","/assets/minimize-2-Bdzl6DB3.js","/assets/package-check-b2A6RZc4.js","/assets/paperclip-B5qGJXMm.js","/assets/pencil-CWmr1P7l.js","/assets/percent-Dsh7IQ5t.js","/assets/personName-CogOuS3K.js","/assets/pin-CtOYOzZi.js","/assets/pin-off-BC1T9lip.js","/assets/play-Cv_UOgGQ.js","/assets/presentation-8zsyKiBr.js","/assets/prop-types-GvON6djE.js","/assets/radio-ByFNjP5w.js","/assets/react-apexcharts.esm-BXz6l5nq.js","/assets/repeat-Ddbe4Z8n.js","/assets/rotate-ccw-CgYAeVnw.js","/assets/rotate-cw-CnC5tBHi.js","/assets/save-BWCf7E8e.js","/assets/scale-DFER3Sin.js","/assets/scroll-text-BdfHw6fa.js","/assets/search-x-sjE30IfE.js","/assets/segments-p7rxvv5Z.js","/assets/send-CcmasQS4.js","/assets/settings-2-C_WAiYM6.js","/assets/shield-DaKzCYhC.js","/assets/shield-alert-DvtmlusV.js","/assets/shield-check-DVOOZYHH.js","/assets/shield-question-mark-pYw3S2Ri.js","/assets/siren-Bbr74deD.js","/assets/snowflake-yL8DwUG8.js","/assets/square-QnSh3ycw.js","/assets/square-check-big-DvOZPgCT.js","/assets/star-jn6eZPm9.js","/assets/statusBands-BmVL3OJV.js","/assets/store-6kI6F5GV.js","/assets/table-2-BqnsdD1v.js","/assets/table-properties-_nfcHow_.js","/assets/tag-DJgeft8O.js","/assets/timer-off-BoYqaLnw.js","/assets/trending-down-4eaBjDwh.js","/assets/trending-up-CPYIng8R.js","/assets/undo-2-DX6y8Ti6.js","/assets/useChartTheme-DYJ6f_n-.js","/assets/useElementWidth-Bh5Jq3Yl.js","/assets/useIsMobile-DWmB3zEa.js","/assets/useMutation-D2SZrLYn.js","/assets/useStatusBands-c9NmBvLm.js","/assets/user-DJ8rKkZk.js","/assets/user-cog--9q1queY.js","/assets/user-minus-B5QQ8EjU.js","/assets/users-EnQUIe1d.js","/assets/video-ZEKdFTH2.js","/assets/wallet-CIR_AnxQ.js","/assets/warehouse-BENA-Lb4.js","/assets/zap-DRVnqbtg.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
