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

const BUILD = "2026-10-02T11:12:05.469Z";
const PRECACHE = ["/","/assets/AdminPanel-D1Fmarh2.js","/assets/AnalysisBoard-CavLnEEn.js","/assets/Arc-B00LY9pd.js","/assets/ArcLegacy-Ljpf5hJN.js","/assets/BrigadirProfile-DF-o2DZe.js","/assets/BroadcastReceivers-CFFRXHCN.js","/assets/BroadcastRecord-DSseBmGM.js","/assets/CatLockNotice-BcBvgW0M.js","/assets/CategoryLegendModal-CCV-nBuR.js","/assets/CellConcerns-C2oLmq_B.js","/assets/CellDetails-5U6gze7H.js","/assets/CellFormModal-BEf_tiX2.js","/assets/CellIdent-4Mplgu4f.js","/assets/CellLink-B5ejpoHT.js","/assets/Cells-CFwl2G6n.js","/assets/ColumnFilter-CXVcrK72.js","/assets/ColumnsPicker-CeelmzCR.js","/assets/CommentsModal-D_xcyLhr.js","/assets/ComparisonTable-DAR5Xthm.js","/assets/Concerns-CTB5JWP8.js","/assets/ConfirmDialog-Dd9yCXid.js","/assets/Daily-l43LO5Fq.js","/assets/DataTable-Cd9N51sF.js","/assets/DateRangePicker-yb1XQpVl.js","/assets/DayReportView-uCW_Hjll.js","/assets/DayStepper-BrxZXBWo.js","/assets/DifferenceBreakdown-DW995iEt.js","/assets/Downtime-DWUscL6M.js","/assets/Education-Co2WH4xu.js","/assets/EducationLesson-DLNGuQkQ.js","/assets/EmptyState-DHGv6OkT.js","/assets/Exam-b2OVUqDu.js","/assets/FactorySelect-fQqdnJo9.js","/assets/Gamification-BIeN34B1.js","/assets/GroupBadge-DnyVQcXX.js","/assets/HeatmapChart-Cogvefoh.js","/assets/IdleCell-nnEgutPi.js","/assets/KPICard-DCM7YC8-.js","/assets/Kaizen-DK96ZWy3.js","/assets/Kelish-CpBJt_Ip.js","/assets/KpiDeltaCard-B-SABQsS.js","/assets/LangTextInput-BGFHwRk-.js","/assets/Layout-C3xtMupg.js","/assets/LeaderAppeal-CukYqTif.js","/assets/LeaderDayReport-B-3zfSOg.js","/assets/LeaderUnitReport-DTQQaxQp.js","/assets/Leaderboard-COKgkiEY.js","/assets/Leaders-CNwQSJYo.js","/assets/Lightbox-OpI5lUIT.js","/assets/LiveOverview-Dd8fNl9R.js","/assets/Login-BDDljXCJ.js","/assets/NotFound-CqG0RZgy.js","/assets/Notifications-TFAh9DCL.js","/assets/Overview-DiJ3Nkb9.js","/assets/Pagination-4Rjlfah4.js","/assets/PerenaladkaFactTable-Da-Dwm4v.js","/assets/PlanFulfillment-CNogD8Se.js","/assets/Production-CWeokipq.js","/assets/Profile-6X-iACaP.js","/assets/ProofCamera-Be2BOIwi.js","/assets/ProofPhoto-Bzoi1tu9.js","/assets/Quality-BwMu7mxy.js","/assets/RequestStateChip-5TAZLFmO.js","/assets/RichTextEditor-BCGRp3D4.js","/assets/SaveState-DG1T0aKR.js","/assets/SearchInput-BLd5b28P.js","/assets/SeasonalityHeatmap-nx-ZI6q3.js","/assets/SegmentedToggle-CJTmzxwo.js","/assets/SetupTimes-BBAXnnso.js","/assets/ShiftDaily-C9Hy_kMm.js","/assets/Staff-DbAXYbNC.js","/assets/StaffLive-ByROOqNm.js","/assets/StatusBadge-BuagAEHt.js","/assets/TargetGoal-B4I-TS_q.js","/assets/Targets-CfT-A-Fi.js","/assets/Tasks-DMUUn7ZA.js","/assets/TimeWheelPicker-CQuquAhw.js","/assets/Toast-D9yrkrRH.js","/assets/Tooltip-B9vH08Iy.js","/assets/TrendChart-DJvIISpK.js","/assets/TripleSpeedometer-d8tTt_Y9.js","/assets/Trudoyomkost-BZv6fz-n.js","/assets/UploadDropzone-CDoK9T4g.js","/assets/UsersActivity-BNK8fScZ.js","/assets/VerdictBlock-DfYXrXqG.js","/assets/WatchProgress-CrgRV9gN.js","/assets/WebLogin-Dx3PDpN8.js","/assets/WorkerConcerns-Ckww63sv.js","/assets/Workers-BOUG79_E.js","/assets/Zagruzka-BYgibsVp.js","/assets/ZagruzkaCell-Doayxy6f.js","/assets/api-BtI9uEcz.js","/assets/archive-B7FGFG3C.js","/assets/archive-restore-D5JcTKlv.js","/assets/arrow-down-3SpbKl_u.js","/assets/arrow-left-D8Ahi5Oa.js","/assets/arrow-right-left-DloS-4BR.js","/assets/arrow-up-D6Dxq59Y.js","/assets/arrow-up-narrow-wide-RRG5-ku1.js","/assets/arrow-up-right-Bj8xqA2A.js","/assets/award-Dyh1whbi.js","/assets/ban-BOlcxfTs.js","/assets/bot-BIKFFYVe.js","/assets/boxes-CgfqN0Vz.js","/assets/brigadirFilters-DpCHGiDe.js","/assets/broadcastTree-DAeU8y25.js","/assets/building-2-DOykvG-B.js","/assets/calendar-CliRlGhu.js","/assets/calendar-days-C_aogJUl.js","/assets/calendar-range-Cktr0QkP.js","/assets/camera-BsD--3Dy.js","/assets/categories-BeSt1Un5.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D8oAY7Pf.js","/assets/chart-line-BLZ76QmA.js","/assets/chart-pie-DSA4p5cK.js","/assets/chartRange-DiXRrmy2.js","/assets/chevron-left-BeKICi_2.js","/assets/chevrons-up-down-PL7l3uaq.js","/assets/circle-BOFBX7-_.js","/assets/circle-alert-MiOogQii.js","/assets/circle-check-big-CMCWudt-.js","/assets/circle-minus-CXtYkuIO.js","/assets/circle-question-mark-DYbeFGUt.js","/assets/circle-slash-CJIMURnR.js","/assets/circle-user-round-Rgvoycg0.js","/assets/cloud-off-D0drmHTt.js","/assets/cloud-upload-Co98c6h0.js","/assets/compass-DwLr5wwA.js","/assets/concernCategories-DeymHn21.js","/assets/copy-Cnc9siMa.js","/assets/corner-down-right-10NTKMR_.js","/assets/createLucideIcon-BI_KxJdm.js","/assets/es-B0354-xK.js","/assets/exportXlsx-B-tilCNu.js","/assets/external-link-nTzUnyFv.js","/assets/file-clock-BVgeESu_.js","/assets/file-exclamation-point-Z8_R9tv5.js","/assets/file-spreadsheet-BMKQVfvQ.js","/assets/file-text-YS_0_MOM.js","/assets/flag-fP-o8A-P.js","/assets/formatters-YGHSWdVb.js","/assets/funnel--rzEDaNg.js","/assets/hash-DoJD2zHm.js","/assets/history-mhZORwru.js","/assets/hourglass-C2TAgZi5.js","/assets/id-card-Df0c_T6f.js","/assets/image-DxNGixfi.js","/assets/image-off-BW0iO7mJ.js","/assets/inbox-duMmdJ8a.js","/assets/index-C8B0XX0b.css","/assets/index-F8iw7qxc.js","/assets/key-round-CopBF18a.js","/assets/keyboard-_GwHgC-N.js","/assets/languages-1oXA5KUZ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-_bp5oPmv.js","/assets/lightbulb-BI66Xk6K.js","/assets/link-2-8YkvhH5x.js","/assets/link-2-off-Clc4w1He.js","/assets/list-ordered-CYlKRxjA.js","/assets/list-tree-B7qv3By2.js","/assets/lock-open-DCCdwIbn.js","/assets/log-in-D4EoWrxS.js","/assets/maximize-2-QF_chjtq.js","/assets/message-square-DZcs9Vbf.js","/assets/minimize-2-DJvc71EX.js","/assets/package-check-BFCD1-o6.js","/assets/paperclip-DGbqI4Bv.js","/assets/pencil-DqvIfQCt.js","/assets/percent-BjRX_xuB.js","/assets/pin-BVgNxEJQ.js","/assets/pin-off-DzYtxn9V.js","/assets/play-DrNOmNG-.js","/assets/plug-zap-B1Niwq_2.js","/assets/presentation-DDWvgvZS.js","/assets/prop-types-Dt7W7CyU.js","/assets/radio-B821LdbQ.js","/assets/react-apexcharts.esm-8q0iVouk.js","/assets/repeat-CuO3WO9_.js","/assets/rotate-ccw-C2pwMcVn.js","/assets/rotate-cw-DFw4NlJm.js","/assets/save-pABED6Az.js","/assets/scopeLinks-BWrcLF8r.js","/assets/scroll-text-Dteh36zT.js","/assets/search-x-BidkoCNZ.js","/assets/segments-BVQ0mbev.js","/assets/send-BkAs2rtc.js","/assets/settings-2-Dp6y8RUY.js","/assets/shield-BzpNYmt-.js","/assets/shield-alert-CHtmrf-6.js","/assets/shield-check-EPhUucps.js","/assets/shield-question-mark-BFMERtXN.js","/assets/siren-PEZnDWV4.js","/assets/snowflake-gE1v6UoQ.js","/assets/split-Ctr4MfcG.js","/assets/square-B5lLWWNM.js","/assets/square-check-big-x5tyVXdW.js","/assets/star-oy8RhuQO.js","/assets/statusBands-Bgvl5ZnB.js","/assets/store-DL2qDFPa.js","/assets/table-2-Da4NiqAQ.js","/assets/table-properties-DOdGTuv3.js","/assets/tag-vHrFzhSo.js","/assets/timer-off-CFiqajm0.js","/assets/trending-down-2R1ulW1O.js","/assets/trending-up-CtKMjzj3.js","/assets/undo-2-mGvgvzNR.js","/assets/useChartTheme-Dn9nneDr.js","/assets/useElementWidth-oIS6UYB4.js","/assets/useIsMobile-BSOgUF48.js","/assets/useOpenParam-DGvyu7Q7.js","/assets/useStatusBands-C1Dt7NR7.js","/assets/useUrlScope-BBMOdVEs.js","/assets/user-cog-ByFW1UgE.js","/assets/user-hEBQEyuB.js","/assets/user-minus-Blyl91hc.js","/assets/users-Boh6sJSK.js","/assets/video-PIODw5Ep.js","/assets/wallet-m-h0OHFQ.js","/assets/warehouse-CidhgyBA.js","/assets/x-DwNeeis2.js","/assets/zap-DPM8-8H3.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
