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

const BUILD = "2026-10-03T20:59:27.840Z";
const PRECACHE = ["/","/assets/AdminPanel-B7evmx-D.js","/assets/AnalysisBoard-DOitok9J.js","/assets/Arc-BFbz211M.js","/assets/ArcLegacy-C_BY6QKu.js","/assets/BrigadirProfile-wbedkgf3.js","/assets/BroadcastReceivers-Dfb8R5fM.js","/assets/BroadcastRecord-DIT33JPc.js","/assets/CatLockNotice-CCoKowK5.js","/assets/CategoryLegendModal-Cj8W5tY_.js","/assets/CellConcerns-Bt8YBBO-.js","/assets/CellDetails-D6c3dJ4o.js","/assets/CellFormModal-DS8e5dcJ.js","/assets/CellIdent-DS0xSouW.js","/assets/CellLink-CZYPDqdT.js","/assets/Cells-BYUvVQbu.js","/assets/ColumnFilter-DPXt45ua.js","/assets/ColumnsPicker-rNCUyS0j.js","/assets/CommentsModal-XLnUFwBr.js","/assets/ComparisonTable-CoTHYCWM.js","/assets/Concerns-D-CZ6-p7.js","/assets/ConfirmDialog-DizQL4oY.js","/assets/Daily-nllZZnZv.js","/assets/DataTable-C4k0CK3S.js","/assets/DateRangePicker-DSiVtL9D.js","/assets/DayReportView-yJe_I_c-.js","/assets/DayStepper-DQ3VkNVP.js","/assets/DifferenceBreakdown-wiSpeyp8.js","/assets/Downtime-CC27bRZv.js","/assets/Education-h3fHZTin.js","/assets/EducationLesson-CGGNSGYk.js","/assets/EmptyState-BX0qYVo1.js","/assets/Exam-D-bvEN2C.js","/assets/FactorySelect-KAoVQcvG.js","/assets/Gamification-C83fzs3G.js","/assets/GroupBadge-a9QklzMJ.js","/assets/HeatmapChart-jjm0YFAy.js","/assets/IdleCell-Cx4Bpmt3.js","/assets/KPICard-Bvf4eN7A.js","/assets/Kaizen-CMhh3MQH.js","/assets/Kelish-2gMyFl3C.js","/assets/KpiDeltaCard-DcPRSwDr.js","/assets/LangTextInput-BMU-q5XH.js","/assets/Layout-UDNAMCfl.js","/assets/LeaderAppeal-DwZN6C4I.js","/assets/LeaderDayReport-BuRxaikQ.js","/assets/LeaderUnitReport-CFev0y2U.js","/assets/Leaderboard-3WcwmAFx.js","/assets/Leaders-L75FqpJQ.js","/assets/Lightbox-CdCu_u2g.js","/assets/LiveOverview-DQ2ns6lG.js","/assets/Login-hNXDIPA-.js","/assets/NotFound-C_ravJ6R.js","/assets/Notifications-KOpoR6d_.js","/assets/Overview-D4szajeb.js","/assets/Pagination-BA3T6ctA.js","/assets/PerenaladkaFactTable-BpyN5-Ic.js","/assets/PersonCard-DnHprBd7.js","/assets/PlanFulfillment-CulTS7nQ.js","/assets/Production-dXRNODPh.js","/assets/Profile-Co6fM3lX.js","/assets/ProofCamera-tkgZmx5E.js","/assets/ProofPhoto-DvVN80Uf.js","/assets/Quality-BwPe-DMe.js","/assets/RawRows-SNULDzgC.js","/assets/RequestStateChip-LErIwGmw.js","/assets/RichTextEditor-iwyHUrPg.js","/assets/SaveState-LBosT6en.js","/assets/SearchInput-BP6SF9tl.js","/assets/SeasonalityHeatmap-Bhl2qg7c.js","/assets/SegmentedToggle-CwRaJx3g.js","/assets/SetupTimes-CFIku-D7.js","/assets/ShiftDaily-Caz_Ej7Y.js","/assets/Staff-CuIzR3Qd.js","/assets/StaffLive-afd_dlZr.js","/assets/StatusBadge-kvJklZIm.js","/assets/TargetGoal-CpiWHMDa.js","/assets/Targets-C-t_JepS.js","/assets/Tasks-LNGa9ny8.js","/assets/TimeWheelPicker-BBzfiVG9.js","/assets/Toast-C6LHHrKu.js","/assets/Tooltip-A_UBwq-C.js","/assets/TrendChart-CATXBUWH.js","/assets/TripleSpeedometer-BCVl0Bdq.js","/assets/Trudoyomkost-BNX4KcPw.js","/assets/UploadDropzone-DVLM3haN.js","/assets/UsersActivity-ClqsnFb3.js","/assets/VerdictBlock-azXQvTvd.js","/assets/VfxAbsences-qmhormhn.js","/assets/VfxApiMap-opuWqI_7.js","/assets/VfxDevices-BzVPRMhE.js","/assets/VfxDictionaries-BPv6Y-lg.js","/assets/VfxEmployees-CQSg7TZg.js","/assets/VfxHrMoves-lfD0K1-R.js","/assets/VfxIncidents-BlCJNkgX.js","/assets/VfxJobs-Bd4SxLPR.js","/assets/VfxMarks-DsydUKEY.js","/assets/VfxOnSite-C2wGhLS4.js","/assets/VfxPhoto-q1wD_w_p.js","/assets/VfxRequests-j8zlTeE5.js","/assets/VfxShifts-Y0XW1gLs.js","/assets/VfxState-COCHNsT5.js","/assets/VfxStructure-BkKQifTj.js","/assets/VfxTable-Obk-5B9X.js","/assets/VfxTimebooks-3-SyCsWd.js","/assets/VfxTimesheet-DlIzmI9J.js","/assets/WatchProgress-CkpLoctw.js","/assets/WebLogin-DDNpntlf.js","/assets/WorkerConcerns-DbqEGel9.js","/assets/Workers-CBWLFUVa.js","/assets/Zagruzka-DDq2fJpp.js","/assets/ZagruzkaCell-BI_cxj16.js","/assets/api-Dcj9sysE.js","/assets/archive-CbnL61wZ.js","/assets/archive-restore-BKN37grM.js","/assets/arrow-down-DyI-XGNN.js","/assets/arrow-left-9NjVdSOS.js","/assets/arrow-up-CP0s6JOV.js","/assets/arrow-up-narrow-wide-DianLEtE.js","/assets/arrow-up-right-Bvwjo4MY.js","/assets/award-Mg_cNC0C.js","/assets/ban-CwVTPZlE.js","/assets/bot-CEiNc6tt.js","/assets/boxes-599x4flx.js","/assets/braces-McafF2vX.js","/assets/brigadirFilters-uhI5a6pM.js","/assets/broadcastTree-DeB36BQ2.js","/assets/building-2-BF-tqQGP.js","/assets/calendar-CF0rhCYh.js","/assets/calendar-days-1twAwhZ6.js","/assets/camera-Bhqmn58t.js","/assets/categories-Ba3JbSQ9.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-X2IFfWfS.js","/assets/chart-line-Cai9f6IC.js","/assets/chart-pie-Bbk77Ig0.js","/assets/chartRange-YzuZWr3x.js","/assets/check-check-CTdaPUYy.js","/assets/chevron-left-BkEG0J6N.js","/assets/chevrons-up-down-BVJzM0SE.js","/assets/circle-D-CTgigd.js","/assets/circle-alert-DZAPxpb7.js","/assets/circle-check-big-t1R35X09.js","/assets/circle-dashed-R16b4DnL.js","/assets/circle-minus-BzQaF9RP.js","/assets/circle-question-mark-CBHJiKHq.js","/assets/circle-slash-Dzx6_qKB.js","/assets/circle-user-round-Bo_mxUEo.js","/assets/clock-3-DvAtq9Jh.js","/assets/cloud-off-95DEaKpH.js","/assets/cloud-upload-WZ3j47iP.js","/assets/compass-nsq_-Doh.js","/assets/concernCategories-FdcbzFFU.js","/assets/copy-RjpirIsB.js","/assets/corner-down-right-LCpr16DT.js","/assets/createLucideIcon-DEW3zdj0.js","/assets/door-open-DhADcPyZ.js","/assets/es-CBXGQn0p.js","/assets/exportXlsx-Nx1ZvZv2.js","/assets/external-link-BrTOjmlh.js","/assets/file-clock-BC90DTjZ.js","/assets/file-exclamation-point-BBMcZ_FQ.js","/assets/file-spreadsheet-CpXx-hrq.js","/assets/file-text-DN8wgaVw.js","/assets/flag-84K3IYal.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Nnok4UOJ.js","/assets/hash-BbWInwCv.js","/assets/history-Lb4aSBHZ.js","/assets/hourglass-BcmRI8mV.js","/assets/image-DbR588P3.js","/assets/image-off-D2qp4zLx.js","/assets/index-B32HTdXZ.js","/assets/index-B7RbwW6q.css","/assets/key-round-RnaSwRaJ.js","/assets/keyboard-p-IDd88V.js","/assets/languages-6xbvA5Oa.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CUd5khoX.js","/assets/lightbulb-p0EDHUP0.js","/assets/link-2-off-C-5sJ53t.js","/assets/link-2-ppsuooQ3.js","/assets/list-filter-BYXopMUJ.js","/assets/list-ordered-CExPqKOC.js","/assets/list-tree-DNcWTrUz.js","/assets/lock-open-BZGXdnbh.js","/assets/log-in-C4jlw11B.js","/assets/maximize-2-DTj0mGNa.js","/assets/message-square-D518ojE-.js","/assets/minimize-2-CTyfECK-.js","/assets/package-check-BRlcZ_Aq.js","/assets/paperclip-D44C-i0k.js","/assets/pencil-DBc9ac3-.js","/assets/percent-D4sq4mXW.js","/assets/phone-XNAOeGAP.js","/assets/pin-Dt44Qm0I.js","/assets/pin-off-AnT6V8G9.js","/assets/play-1A8mlPtn.js","/assets/plug-zap-CD3G2c3b.js","/assets/presentation-B3UpW3p4.js","/assets/prop-types-CgNyVTr-.js","/assets/radio-z27ernND.js","/assets/react-apexcharts.esm-sXBqTSBw.js","/assets/registers-Dk8RBmma.js","/assets/repeat-DdANOHiA.js","/assets/rotate-ccw-B7qXxbjb.js","/assets/rotate-cw-CBhbo35M.js","/assets/save-DNz8chP6.js","/assets/scopeLinks-Bpf9CyM4.js","/assets/scroll-text-C8XkVoOg.js","/assets/search-x-DKH5TuCQ.js","/assets/segments-Ddlc-e7u.js","/assets/send-vmyu3cvc.js","/assets/settings-2-Vbl49GRH.js","/assets/shield-Dhh69oXX.js","/assets/shield-alert-DRXte7UC.js","/assets/shield-check-B4aMhYIK.js","/assets/shield-question-mark-DlnSHyku.js","/assets/snowflake-7aYLQNZi.js","/assets/split-wRztDEXs.js","/assets/square-check-big-JWuTV5xh.js","/assets/square-fDSFF_jA.js","/assets/star-DZFhKpkd.js","/assets/statusBands-Cqja_low.js","/assets/store-5IDjJWsP.js","/assets/table-2-7B6DmuYN.js","/assets/table-properties-BDffDC_H.js","/assets/tag-B6P8vZLP.js","/assets/tags-DFkEubrt.js","/assets/timer-off-CC_w0u0L.js","/assets/trending-down-CJzFjWl8.js","/assets/trending-up-CCfxeHec.js","/assets/undo-2-BOZHbt7Q.js","/assets/useChartTheme-DYK4IxeQ.js","/assets/useElementWidth-z_oafW3j.js","/assets/useIsMobile-B5o3VCxW.js","/assets/useOpenParam-VsmQWSyx.js","/assets/useStatusBands-rZe_ZRYF.js","/assets/useUrlScope-VDTYCWD-.js","/assets/user-cog-CXUDYoYv.js","/assets/user-minus-CFKRuoJe.js","/assets/user-v9fskF5o.js","/assets/users-Du669W_H.js","/assets/video-DOVr0LtX.js","/assets/wallet-BJ9ALrQW.js","/assets/warehouse-Drxw9a1Q.js","/assets/x-D4I1AWEG.js","/assets/zap-BZhE9szU.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
