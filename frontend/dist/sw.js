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

const BUILD = "2026-10-20T14:18:15.624Z";
const PRECACHE = ["/","/assets/AdminPanel-B68CnLLr.js","/assets/AnalysisBoard-BnYY2-1H.js","/assets/Arc-jKFxOJAv.js","/assets/Assistant-BH1-YX_B.js","/assets/BrigadirProfile-Dg49cPB_.js","/assets/BroadcastReceivers-oWdFt13n.js","/assets/BroadcastRecord-CCtSuX1Z.js","/assets/Button-BXVBiZBr.js","/assets/CatLockNotice-DBeWofPF.js","/assets/CategoryLegendModal-DmFPL1jg.js","/assets/CellConcerns-BINlVUzT.js","/assets/CellDetails-BL_XAzpo.js","/assets/CellFormModal-4DyMQEU4.js","/assets/CellIdent-C6oVY5ur.js","/assets/CellLink-Bstl81HA.js","/assets/Cells-Ey4MJwEi.js","/assets/ColumnFilter-WxWBv5gH.js","/assets/ColumnsPicker-Cx9BgGFM.js","/assets/CommentsModal-C45MPL6G.js","/assets/ComparisonTable-CHROuxj3.js","/assets/Concerns-Ca_tjG1v.js","/assets/CountStepper-BgCaz9w3.js","/assets/Daily-HIIFZ2Nl.js","/assets/DataTable-B1NZPS0w.js","/assets/DateRangePicker-BzcEaB6S.js","/assets/DayReportView-DmNMhI39.js","/assets/DayStepper-MMhHRwcw.js","/assets/DayStrip-nVNbE6vt.js","/assets/DifferenceBreakdown-uCkyNKz6.js","/assets/Downtime-Cl6Q-joF.js","/assets/Education-Cgtb0q0r.js","/assets/EducationLesson-4PlY7fon.js","/assets/EmptyState-3wITIAw7.js","/assets/Exam-dFchVj8G.js","/assets/FactorySelect-CQajm6AK.js","/assets/Gamification-CwNPORzm.js","/assets/GroupBadge-CPO3J76y.js","/assets/HeatmapChart-CW1mHOJG.js","/assets/IdleCell-D622BWMO.js","/assets/KPICard-C0EenvPE.js","/assets/Kaizen-R1wZjP73.js","/assets/Kelish-DdW_DwkP.js","/assets/KpiDeltaCard-Bli1CxiE.js","/assets/LangTextInput-D8DS4MXb.js","/assets/Layout-DZaPv9Ty.js","/assets/LeaderAppeal-D_hbXf0C.js","/assets/LeaderDayReport-hVAGZA_8.js","/assets/LeaderUnitReport-BVi9-WRc.js","/assets/Leaderboard-Bs7sAIQ4.js","/assets/Leaders-B_ICNozd.js","/assets/LeadersKpi-CoN6CxIa.js","/assets/Lightbox-DbM3ogsK.js","/assets/LiveOverview-BMRKQUMr.js","/assets/Login-DmE-QzmN.js","/assets/NotFound-DTMBPulK.js","/assets/Notifications-E1worxAJ.js","/assets/Ontime-BcsbbOh0.js","/assets/Overview-D_pXcq6H.js","/assets/Pagination-Cy76iCzc.js","/assets/PerenaladkaFactTable-C3i2sN74.js","/assets/PersonCard-Bd30k09C.js","/assets/PlanFulfillment-CIsUkrDB.js","/assets/Production-D7oRDwky.js","/assets/Profile-CzSN1asj.js","/assets/ProofCamera-D_VpgK_X.js","/assets/ProofPhoto-DXiWxYKo.js","/assets/Quality-JxKjJTcd.js","/assets/RawRows-F6o_TX-9.js","/assets/RequestStateChip-B-c3dcK0.js","/assets/RichTextEditor-BhUl-eL2.js","/assets/SaveState-BFeCj3W_.js","/assets/SearchInput-CzXhzTFJ.js","/assets/SeasonalityHeatmap-9aBSB5KW.js","/assets/SegmentedToggle-C89-eg3i.js","/assets/SetupTimes-CTTQNmlC.js","/assets/ShiftDaily-Cs4n_hzP.js","/assets/Staff-CqADciPB.js","/assets/StaffListAtCheck-Dm4Ka6Rp.js","/assets/StatusBadge-DgebZaUC.js","/assets/StatusBandsModal-BYijALIt.js","/assets/TargetGoal-CfOorvXS.js","/assets/Targets-inEzQ6wJ.js","/assets/Tasks-RyGwPerS.js","/assets/TimeWheelPicker-D3P0_gjO.js","/assets/Toast-DO4T1vGh.js","/assets/Tooltip-CcDanQQC.js","/assets/TrendChart-Co4AfhH7.js","/assets/TripleSpeedometer-C6lzRiXu.js","/assets/Trudoyomkost-DbGrO5o_.js","/assets/UploadDropzone-aqU3P1HF.js","/assets/UsersActivity-D-pmxlDK.js","/assets/VerdictBlock-DDifZ5Rs.js","/assets/VfxApiMap-CL99DKzj.js","/assets/VfxDictionaries-BwRqtYh7.js","/assets/VfxEmployees-BTAScr3g.js","/assets/VfxHrMoves-un7fhNzQ.js","/assets/VfxJobs-8xk_NGQY.js","/assets/VfxPhoto-WxX7npXC.js","/assets/VfxShifts-BH2famXU.js","/assets/VfxState-BEe-q7vu.js","/assets/VfxTimebooks-CAA56-IQ.js","/assets/VfxTimesheet-BiAdM7zV.js","/assets/WatchProgress-BMpfqb5y.js","/assets/WebLogin-aTs1eD0Z.js","/assets/Workers-B2jDVyUx.js","/assets/Zagruzka-B31MPILx.js","/assets/ZagruzkaCell-Cq-xeFFY.js","/assets/api-tvO5nHNB.js","/assets/archive-BqNzKZzc.js","/assets/archive-restore-Cspv7fHb.js","/assets/arrow-down-DrWHGaMv.js","/assets/arrow-down-right-DqPT17Qo.js","/assets/arrow-down-wide-narrow-DxYL1q_g.js","/assets/arrow-up-narrow-wide-DMQ9N2nm.js","/assets/ban-Bvtz6Yow.js","/assets/boxes-Cp__6F30.js","/assets/braces-C1GWuNzo.js","/assets/brigadirFilters-DIPBRFTE.js","/assets/broadcastTree-DGsLgl4m.js","/assets/building-2-D8cqYbMw.js","/assets/calendar-days-CRi2wLsY.js","/assets/calendar-kX28qMYf.js","/assets/camera-Ckl05Nk_.js","/assets/categories-BW72jZa4.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Dui6h-Oy.js","/assets/chart-line-BwhJK118.js","/assets/chart-pie-BJzmAaH9.js","/assets/chartRange-CBWcam4x.js","/assets/check-check-By83STjQ.js","/assets/chevron-left-CI2GS-1j.js","/assets/chevrons-up-down-C6E4CZr2.js","/assets/circle-CrWpy8rI.js","/assets/circle-alert-BHSgb5ez.js","/assets/circle-check-big-DNFPkvYQ.js","/assets/circle-dashed-Cl-VbqmI.js","/assets/circle-minus-BGlMzXsv.js","/assets/circle-question-mark-BnfhSzBH.js","/assets/circle-slash-Lz0pAYTH.js","/assets/circle-user-round-BO0ucIum.js","/assets/cloud-off-BmhKcBmg.js","/assets/cloud-upload-C44pE6M4.js","/assets/compass-BCKgrIH1.js","/assets/concernCategories-DffzOx29.js","/assets/corner-down-right-8_uY7uXX.js","/assets/createLucideIcon-DuqAwLSy.js","/assets/es-EjykctPO.js","/assets/external-link-stGatI8x.js","/assets/file-clock-DBiY6aA9.js","/assets/file-exclamation-point-Dl5WVIBV.js","/assets/flag-braLgAwf.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-D7qs9VPw.js","/assets/funnel-CEfc74yh.js","/assets/hash-D4pWAXc6.js","/assets/hourglass-DggPfsmC.js","/assets/image-off-CTvTpAhn.js","/assets/image-vpXbmnV1.js","/assets/inbox-C7gEhiRG.js","/assets/index-CDfPTO8X.js","/assets/index-DLT_vDJq.css","/assets/keyboard-DT6zBnTL.js","/assets/languages-GTadfKYY.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-_TSgo3sP.js","/assets/lightbulb-BcnQTqGU.js","/assets/link-2-DEdc9tHQ.js","/assets/link-2-off-DAd3m0AL.js","/assets/list-ordered-Dm6vGniU.js","/assets/list-tree-BIH78w1E.js","/assets/lock-open-DkzJ34BR.js","/assets/log-in-sMwx2zhz.js","/assets/marks-3R2X2VS4.js","/assets/minimize-2-TwU1AnJY.js","/assets/package-check-nWPXfOXO.js","/assets/pencil-Bu_1QRhm.js","/assets/percent-BNFDAFFA.js","/assets/pin-DWs-kvDK.js","/assets/pin-off-CQ5VIpcZ.js","/assets/play-qEySeYez.js","/assets/plug-zap-Dxxa2Zxa.js","/assets/prop-types-0n5FrBIt.js","/assets/radio-B62R4-Ie.js","/assets/react-apexcharts.esm-D5JdM3-0.js","/assets/registers-9QGP3zB4.js","/assets/repeat-Uu9eQDLG.js","/assets/save-CtJ9Y9R6.js","/assets/scopeLinks-C_yqwdzj.js","/assets/scroll-text-BPhhEqWi.js","/assets/search-x-CdaXRjeY.js","/assets/segments-CVeSHA-R.js","/assets/send-D94rGO1b.js","/assets/settings-2-DuRxANze.js","/assets/shield-CbmjfMd8.js","/assets/shield-alert-C6r8Auhu.js","/assets/shield-question-mark-C0zo0LeY.js","/assets/sigma--2uwoS7S.js","/assets/siren-DZDINtQ-.js","/assets/snowflake-4olFOlkw.js","/assets/split-BeCDEnwb.js","/assets/square-check-big-BldjGdQW.js","/assets/star-3oNuv7kq.js","/assets/statusBands-BtOTt54q.js","/assets/store-BR5pwglt.js","/assets/table-2-dcNPGHgP.js","/assets/table-properties-B93QVMtG.js","/assets/tag-D7SfP7Ud.js","/assets/timer-off-WfAOSr3e.js","/assets/trending-down-v4_JURv1.js","/assets/trending-up-BcSCbNDZ.js","/assets/undo-2-0ouGZ854.js","/assets/useChartTheme-ETeZ5KRq.js","/assets/useElementWidth-Bvz3vMp8.js","/assets/useIsMobile-D6qcD7ka.js","/assets/useOpenParam-CP-KUw5w.js","/assets/useStatusBands-Cw606q98.js","/assets/useUrlScope-aE8WVfyi.js","/assets/user-DELYR-oi.js","/assets/user-cog-CjbwIeVi.js","/assets/user-minus-DYZpLxOB.js","/assets/users-cdVtizVA.js","/assets/vfx-CZ2I_vrt.js","/assets/video-DRDMCOuv.js","/assets/wallet-Cm1vyn69.js","/assets/warehouse-gGPy08zM.js","/assets/workflow-BjkjU73q.js","/assets/x-BJ-g5dXf.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
