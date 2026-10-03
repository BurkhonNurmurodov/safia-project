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

const BUILD = "2026-10-03T14:02:16.281Z";
const PRECACHE = ["/","/assets/AdminPanel-CfpT8q66.js","/assets/AnalysisBoard-vdEP8UCc.js","/assets/Arc-DnZUp2GQ.js","/assets/ArcLegacy-C7vS2GZ_.js","/assets/BrigadirProfile-d9Xok4Ju.js","/assets/BroadcastReceivers-BJ3ucLpv.js","/assets/BroadcastRecord-BD3htf_q.js","/assets/CatLockNotice-CxYADC93.js","/assets/CategoryLegendModal-BVBzJFxY.js","/assets/CellConcerns-BaHgB6rl.js","/assets/CellDetails-DbyXp8TG.js","/assets/CellFormModal-mlJAgo1X.js","/assets/CellIdent-2cV4l0LC.js","/assets/CellLink-BgZTEQVA.js","/assets/Cells-6JkEkoVU.js","/assets/ColumnFilter-XsnXywAT.js","/assets/ColumnsPicker-BCAmhox7.js","/assets/CommentsModal-CcD-M5uu.js","/assets/ComparisonTable-KcQNH3p4.js","/assets/Concerns-DZ6AU_wq.js","/assets/ConfirmDialog-NooXHa3c.js","/assets/Daily-PBM_no4L.js","/assets/DataTable-BdGpBMYn.js","/assets/DateRangePicker-vHPyDOXn.js","/assets/DayReportView-CCpv2Zn0.js","/assets/DayStepper-B4dtfFi7.js","/assets/DifferenceBreakdown-BORgyaW8.js","/assets/Downtime-DLwWh2sl.js","/assets/Education-03tP_uqb.js","/assets/EducationLesson-BpkDCgbW.js","/assets/EmptyState-B2ACB_XM.js","/assets/Exam-CpWUWgXi.js","/assets/FactorySelect-CU9lK_U8.js","/assets/Gamification-Br-SPjVI.js","/assets/GroupBadge-dKnA4k8X.js","/assets/HeatmapChart-DovERxPp.js","/assets/IdleCell-Eu_UXyfy.js","/assets/KPICard-0sXmT-sj.js","/assets/Kaizen-S4NKWGNX.js","/assets/Kelish-CTTJqe68.js","/assets/KpiDeltaCard-Bm3j7vPZ.js","/assets/LangTextInput-CvWCuVdM.js","/assets/Layout-Bok7Ygig.js","/assets/LeaderAppeal-jOqI2P2Y.js","/assets/LeaderDayReport-BUbArEfe.js","/assets/LeaderUnitReport-CsM0ELKA.js","/assets/Leaderboard-B22ahas2.js","/assets/Leaders-M7BNK0ma.js","/assets/Lightbox-CLl7ISQC.js","/assets/LiveOverview-BhjWy6Gz.js","/assets/Login-C9Js4bwT.js","/assets/NotFound-C3-eoF3c.js","/assets/Notifications-BTkZBjak.js","/assets/Overview-BYDkNGy-.js","/assets/Pagination-CJvzZ1cI.js","/assets/PerenaladkaFactTable-DwJPO-gU.js","/assets/PersonCard-aoZA2zSO.js","/assets/PlanFulfillment-o_ZDnBzF.js","/assets/Production-DbCFSB9M.js","/assets/Profile-DiH3DYQY.js","/assets/ProofCamera-gEWSxQUH.js","/assets/ProofPhoto-BnoHaQSk.js","/assets/Quality-CsX3j7NC.js","/assets/RawRows-buzM00Iv.js","/assets/RequestStateChip-hT7IeBNF.js","/assets/RichTextEditor-D6j2eigE.js","/assets/SaveState-Dy5tJBUV.js","/assets/SearchInput-yl118nqE.js","/assets/SeasonalityHeatmap-BUoCafVD.js","/assets/SegmentedToggle-YZ5ZUzYG.js","/assets/SetupTimes-jCHbKGua.js","/assets/ShiftDaily-C72uPqez.js","/assets/Staff-5eAu07o5.js","/assets/StaffLive-BY7Hp9AI.js","/assets/StatusBadge-9uVT0glI.js","/assets/TargetGoal-CI5rFQUc.js","/assets/Targets-Cv5Ev94f.js","/assets/Tasks-DlmaaP7O.js","/assets/TimeWheelPicker-C-jNv4Sb.js","/assets/Toast-CVjN8VZ6.js","/assets/Tooltip-x73trrHb.js","/assets/TrendChart-fdlpKSMq.js","/assets/TripleSpeedometer-Bn7rCOtv.js","/assets/Trudoyomkost-DkY6CKWI.js","/assets/UploadDropzone-BpZIahpD.js","/assets/UsersActivity-4Ype22oV.js","/assets/VerdictBlock-BaPtiGDe.js","/assets/VfxAbsences-7pWkUw0t.js","/assets/VfxApiMap-01yWb0bs.js","/assets/VfxDevices-DwNX9hHZ.js","/assets/VfxDictionaries-BQ4M3NtH.js","/assets/VfxEmployees-C8tYZFKr.js","/assets/VfxHrMoves-Bu5-oc1_.js","/assets/VfxIncidents-DhlbVSBy.js","/assets/VfxJobs-C7qNMWpt.js","/assets/VfxMarks-DzHUoSMw.js","/assets/VfxOnSite-CsdOjcvZ.js","/assets/VfxPayroll-CU5gYY4B.js","/assets/VfxPhoto-YtR7AKmd.js","/assets/VfxRequests-CzpXLXiZ.js","/assets/VfxShifts-BP_rbFJ5.js","/assets/VfxState-C_tDuEvo.js","/assets/VfxStructure-hjKFFkpP.js","/assets/VfxTable-BSowJ4gS.js","/assets/VfxTimebooks-CcmnX9jb.js","/assets/VfxTimesheet-BslpNSr0.js","/assets/WatchProgress-CG0VEAhL.js","/assets/WebLogin-Bhd7Az2f.js","/assets/WorkerConcerns-DTBo3htW.js","/assets/Workers-DkT0JfMa.js","/assets/Zagruzka-B511YQjR.js","/assets/ZagruzkaCell-C4Om_Cu3.js","/assets/api-BhaAMPlc.js","/assets/archive-DEQNqb8m.js","/assets/archive-restore-Bb5QRqYZ.js","/assets/arrow-down-CZmBOEja.js","/assets/arrow-down-right-DLyscMiD.js","/assets/arrow-left-B_maXZ9A.js","/assets/arrow-up-SQCPDnlS.js","/assets/arrow-up-narrow-wide-DTDMfjL7.js","/assets/arrow-up-right-BhzJezEt.js","/assets/award-BgW3CzmR.js","/assets/ban-D4tBBegj.js","/assets/bot-BYc9vbbX.js","/assets/boxes-CmFhFOf-.js","/assets/braces-CTHm1Fdf.js","/assets/brigadirFilters-GDJeVOOd.js","/assets/broadcastTree-BrgEbn5N.js","/assets/building-2-BmBSPJ2x.js","/assets/calendar-DGnUfZ4i.js","/assets/calendar-days-DuxeKOb_.js","/assets/camera-CT8Kp2YT.js","/assets/categories-CL69QyfC.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cs1CKCjL.js","/assets/chart-line-CwG0U-7e.js","/assets/chart-pie-B5jK5WSb.js","/assets/chartRange-BTWvYJrI.js","/assets/chevron-left-CI5UQIxM.js","/assets/chevrons-up-down-S1-_Z8aD.js","/assets/circle-UiLGrzwO.js","/assets/circle-alert-V_ak03A8.js","/assets/circle-check-big-BKQ-MvrQ.js","/assets/circle-dashed-DFrA5Vup.js","/assets/circle-minus-DTPEVkFr.js","/assets/circle-question-mark-gBlNeLC4.js","/assets/circle-slash-Dbw-KqAc.js","/assets/circle-user-round-koXw8OmJ.js","/assets/clock-3-CC4xzL-H.js","/assets/cloud-off-BC73tRsF.js","/assets/cloud-upload-B46QGudH.js","/assets/compass-1cEOhtJz.js","/assets/concernCategories-C2Alqwrc.js","/assets/copy-BdEKt034.js","/assets/corner-down-right-BsFX1pix.js","/assets/createLucideIcon-bf8S4pTh.js","/assets/door-open-D8Ykgtpr.js","/assets/es-DUKxns-1.js","/assets/exportXlsx-DSkJFpo4.js","/assets/external-link-_UtnlIPS.js","/assets/file-clock-BmxErSMo.js","/assets/file-exclamation-point-u46Q0SQU.js","/assets/file-spreadsheet-CQCoTRND.js","/assets/file-text-DdfgzeHk.js","/assets/flag-Ca9FyC-y.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-3s-P-_6X.js","/assets/hash-5u_BGx7W.js","/assets/history-Ci9wj1-u.js","/assets/hourglass-BJ4PVfYh.js","/assets/image-CrJpNq2-.js","/assets/image-off-IcjmKnFe.js","/assets/index-4MV0EO8M.js","/assets/index-YBeOcWwc.css","/assets/key-round-Bz6QRd3_.js","/assets/keyboard-0haW5Mab.js","/assets/languages-Dcash_wN.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BSvQRUdb.js","/assets/lightbulb-D5kG-fW3.js","/assets/link-2-off-c0iSuN4x.js","/assets/link-2-wmyQOoS0.js","/assets/list-ordered-BpAkZqUc.js","/assets/list-tree-CR7mzlCi.js","/assets/lock-open-LRM3g2IS.js","/assets/log-in-BLA1yPXb.js","/assets/maximize-2-Bhepo01M.js","/assets/message-square-D0P8YR0p.js","/assets/minimize-2-DrAxwt0X.js","/assets/package-check-BzqhOB4K.js","/assets/paperclip-5pPQdAMQ.js","/assets/pencil-W--3Evv_.js","/assets/percent-HBfhG-PM.js","/assets/phone-DQGlEwlS.js","/assets/pin-b8VXysBO.js","/assets/pin-off-C_fjb_G0.js","/assets/play-nMTBAfbt.js","/assets/plug-zap-P2nPW7it.js","/assets/presentation-BL0f8_6y.js","/assets/prop-types-CobthvH2.js","/assets/radio-DkRmT5SW.js","/assets/react-apexcharts.esm-DwFkIZDl.js","/assets/registers-Bd0ybwlE.js","/assets/repeat-DGcgQ0Xe.js","/assets/rotate-ccw-B2w-ENj_.js","/assets/rotate-cw-L-PQ0G9p.js","/assets/save-BMC8ThRI.js","/assets/scopeLinks-C0rqcPs1.js","/assets/scroll-text-D9ShBj5l.js","/assets/search-x-EOkoUE01.js","/assets/segments-CXNOlqlb.js","/assets/send-BnyZZMBt.js","/assets/settings-2-C4CDPxFC.js","/assets/shield-CdcQki-V.js","/assets/shield-alert-AtSMfQhK.js","/assets/shield-check-COV6M17P.js","/assets/shield-question-mark-LVsCz9kv.js","/assets/snowflake-DWZqov5S.js","/assets/split-BrlC-Z76.js","/assets/square-BmNcm7QL.js","/assets/square-check-big-DI-6_yOo.js","/assets/star-B8RShkFR.js","/assets/statusBands-DxKRLGNE.js","/assets/store-C6_RMzXo.js","/assets/table-2-BFH_BFS0.js","/assets/table-properties-B5t9UoHT.js","/assets/tag-CthrMmLK.js","/assets/tags-D40aIptn.js","/assets/timer-off-BQoL_PEJ.js","/assets/trending-down-DUvn5ekX.js","/assets/trending-up-B3J2EOWQ.js","/assets/undo-2-4BISPzfE.js","/assets/useChartTheme-BiDccVzI.js","/assets/useElementWidth-Dj2vaIBg.js","/assets/useIsMobile-gMo0GqwI.js","/assets/useOpenParam-BbOOyDJ2.js","/assets/useStatusBands-BHA6FFMR.js","/assets/useUrlScope-BU3tdLho.js","/assets/user-Cli3lGIK.js","/assets/user-cog-LYh2V-qU.js","/assets/user-minus-BnzMuIFq.js","/assets/users-JHPwbIA5.js","/assets/video-Cq3iLbZK.js","/assets/wallet-CxQgeOxY.js","/assets/warehouse-B4HQ7X86.js","/assets/x-8kj6g1os.js","/assets/zap-C-L9sgOA.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
