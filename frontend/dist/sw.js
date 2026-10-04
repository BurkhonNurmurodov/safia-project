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

const BUILD = "2026-10-04T10:21:44.671Z";
const PRECACHE = ["/","/assets/AdminPanel-DyvExUhU.js","/assets/AnalysisBoard-CyJc536Y.js","/assets/Arc-Ci89jqnd.js","/assets/ArcLegacy-FrKcv2C8.js","/assets/BrigadirProfile-B5PkuP07.js","/assets/BroadcastReceivers-DucCqGZx.js","/assets/BroadcastRecord-De1qI7By.js","/assets/CatLockNotice-BoIqtAAs.js","/assets/CategoryLegendModal-Dv_V0jZv.js","/assets/CellConcerns-Ge8GctPg.js","/assets/CellDetails-CU-8zozf.js","/assets/CellFormModal-DZUiXot3.js","/assets/CellIdent-B48JV_E8.js","/assets/CellLink-Zv7zxpB7.js","/assets/Cells-CubeUClZ.js","/assets/ColumnFilter-EFeEmRmY.js","/assets/ColumnsPicker-BKnYdqbi.js","/assets/CommentsModal-hqf6dp6x.js","/assets/ComparisonTable-C_qtviIb.js","/assets/Concerns-Cn73Wkix.js","/assets/ConfirmDialog-CQcK9LUI.js","/assets/Daily-6lY7QP9o.js","/assets/DataTable-DOfc39TR.js","/assets/DateRangePicker-CkjFwdV0.js","/assets/DayReportView-BXW6feos.js","/assets/DayStepper-Dbvn1Tpi.js","/assets/DifferenceBreakdown-vc-yhFN-.js","/assets/Downtime-CbNHVDC8.js","/assets/Education-BMQwWjCj.js","/assets/EducationLesson-Wl2WHjRg.js","/assets/EmptyState-Z1glV7xB.js","/assets/Exam-BqwWlBtU.js","/assets/FactorySelect-DV5y8UBb.js","/assets/Gamification-Dxa_3AtE.js","/assets/GroupBadge-C3iE-YyU.js","/assets/HeatmapChart-BbeziP9D.js","/assets/IdleCell-BgYzZusc.js","/assets/KPICard-C5h-0-WV.js","/assets/Kaizen-Dy9wTUSg.js","/assets/Kelish-ApLq7oUs.js","/assets/KpiDeltaCard-Bbe2Z0s-.js","/assets/LangTextInput-DE2U7J7t.js","/assets/Layout-OCXgboFN.js","/assets/LeaderAppeal-BhML4Ugl.js","/assets/LeaderDayReport-DtrKUM8A.js","/assets/LeaderUnitReport-C-O_94D3.js","/assets/Leaderboard-B_uVI6a9.js","/assets/Leaders-BkJQGT5V.js","/assets/Lightbox-omcf88q4.js","/assets/LiveOverview-CKMsRTOY.js","/assets/Login-BZb2Wbl7.js","/assets/NotFound-Ddvw3T44.js","/assets/Notifications-DUCQOWed.js","/assets/Overview-3tcd18V6.js","/assets/Pagination-DMnh8ZeQ.js","/assets/PerenaladkaFactTable-CLd5dJOh.js","/assets/PersonCard-B_qTJESI.js","/assets/PlanFulfillment-DUcM991X.js","/assets/Production-D9DfgRX-.js","/assets/Profile-B0hzTeKO.js","/assets/ProofCamera-DGKulUee.js","/assets/ProofPhoto-CpVJxPCo.js","/assets/Quality-CmSZqWvZ.js","/assets/RawRows-BJLbkGfY.js","/assets/RequestStateChip-D9THxiEp.js","/assets/RichTextEditor-B_ZDsLiT.js","/assets/SaveState-NLUIkwnz.js","/assets/SearchInput-Bj6nCxD_.js","/assets/SeasonalityHeatmap-DgAt5uOT.js","/assets/SegmentedToggle-Cw3ZtPxf.js","/assets/SetupTimes-CkdVkeY9.js","/assets/ShiftDaily-B53yNRuB.js","/assets/Staff-Bd8bNIkH.js","/assets/StaffLive-DvS41_By.js","/assets/StatusBadge-Dw3yFVa3.js","/assets/TargetGoal-Bjhyg7H-.js","/assets/Targets-Cvt9y_o-.js","/assets/Tasks-BP5WDVQX.js","/assets/TimeWheelPicker-iEce7N9_.js","/assets/Toast-BW6f9yDT.js","/assets/Tooltip-BpHkx0yM.js","/assets/TrendChart-BcBx8-Ew.js","/assets/TripleSpeedometer-BhidVxbP.js","/assets/Trudoyomkost-DF6VoDoa.js","/assets/UploadDropzone-CwbmnU5z.js","/assets/UsersActivity-D0APxPVv.js","/assets/VerdictBlock-J885S_71.js","/assets/VfxApiMap-DmmQJDTb.js","/assets/VfxDictionaries-MK7fuHnk.js","/assets/VfxEmployees-BvHewTJL.js","/assets/VfxHrMoves-CSN6Eew8.js","/assets/VfxJobs-3v4SNUYz.js","/assets/VfxPhoto-D5D_pYdR.js","/assets/VfxShifts-C3C0kgTZ.js","/assets/VfxState-CFSL_OiP.js","/assets/VfxTimebooks-DiGBOgnY.js","/assets/VfxTimesheet-D5c2AiRw.js","/assets/WatchProgress-CTKbphl0.js","/assets/WebLogin-B7IJD3Ds.js","/assets/WorkerConcerns-BD0Js_tm.js","/assets/Workers-yMrQ319M.js","/assets/Zagruzka-jWXyKord.js","/assets/ZagruzkaCell-DSgaDG-r.js","/assets/api-Bz7kIITE.js","/assets/archive-B44ly_Nx.js","/assets/archive-restore-Dc2qIyU-.js","/assets/arrow-down-kRhatRXU.js","/assets/arrow-left-DWU8Md4c.js","/assets/arrow-up-DyIlzyRN.js","/assets/arrow-up-narrow-wide-zRgI3pBf.js","/assets/arrow-up-right-BliqllOk.js","/assets/award-BAFuQwe7.js","/assets/ban-BUc15aD5.js","/assets/bot-BbUo04FD.js","/assets/boxes-DEY2v7FZ.js","/assets/braces-Qrn2Zk8m.js","/assets/brigadirFilters-DMAELq_d.js","/assets/broadcastTree-B1_N6FTz.js","/assets/building-2-zS_u49Ck.js","/assets/calendar-CqIB_Lpu.js","/assets/calendar-days-CS3RvaEU.js","/assets/camera-vOqNocNZ.js","/assets/categories-Cx2jCxPJ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CwcFGUsR.js","/assets/chart-line-D9deQPnZ.js","/assets/chart-pie-DOBlU_Ib.js","/assets/chartRange-Ow4Zp432.js","/assets/check-check-lCjkiX1u.js","/assets/chevron-left-YnAuALkK.js","/assets/chevrons-up-down-BRn5JC3j.js","/assets/circle-DJe4Qkxn.js","/assets/circle-alert-DKjEC2pL.js","/assets/circle-check-big-CqAuGcc8.js","/assets/circle-dashed-Du23g0Ax.js","/assets/circle-minus-CCOoWoUF.js","/assets/circle-question-mark-jL638w48.js","/assets/circle-slash-DetCHM76.js","/assets/circle-user-round-6js15_At.js","/assets/clock-3-BAkULen4.js","/assets/cloud-off-BFFc-aHY.js","/assets/cloud-upload-wZX0wcJg.js","/assets/compass-29ApWC9l.js","/assets/concernCategories-CvXbh7AV.js","/assets/copy-Cfaf9DHJ.js","/assets/corner-down-right-DJ_rNn0c.js","/assets/createLucideIcon-D34bsTVD.js","/assets/es-D0Q00Csg.js","/assets/exportXlsx-BT1i0hSb.js","/assets/external-link-CWSCfbY4.js","/assets/file-clock-BikLkSMA.js","/assets/file-exclamation-point-DGpaPmli.js","/assets/file-spreadsheet-D3dE5E50.js","/assets/file-text-CRvkL5So.js","/assets/flag-BKs7Cw6O.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DkU9tUCy.js","/assets/hash-DiCc16qs.js","/assets/history-UBMnwOeq.js","/assets/hourglass-BJq3xRG7.js","/assets/image-CoMaB9G4.js","/assets/image-off-CpZcNzPu.js","/assets/inbox-C8PdYLkI.js","/assets/index-BngiOmj1.css","/assets/index-ClfOsQOU.js","/assets/key-round-Bnj2Mk7E.js","/assets/keyboard-2c0cn50f.js","/assets/languages-ButvrV8A.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-lk-CKJ1Z.js","/assets/lightbulb-BMtdBjGE.js","/assets/link-2-DAkuOknO.js","/assets/link-2-off-DAeyBUfU.js","/assets/list-ordered-CUaNIW2d.js","/assets/list-tree-Ca7_4dOU.js","/assets/lock-open-CLM9UOjy.js","/assets/log-in-CtDOKEaO.js","/assets/maximize-2-By4kYlgX.js","/assets/message-square-DRVDjxN9.js","/assets/minimize-2-DiuNOg8p.js","/assets/package-check-CaEkuxjJ.js","/assets/paperclip-DLaaQJbA.js","/assets/pencil-BCB1DC7v.js","/assets/percent-ImOVJ1i5.js","/assets/pin-D96dij00.js","/assets/pin-off-Ivc615Ps.js","/assets/play-BDjwFQXp.js","/assets/plug-zap-BAsTQycq.js","/assets/presentation-jkaw1_LT.js","/assets/prop-types-BdsRago6.js","/assets/radio-CoWLFmh4.js","/assets/react-apexcharts.esm-CfcGYo0v.js","/assets/registers-CFyiyVmD.js","/assets/repeat-C5fU44Rf.js","/assets/rotate-ccw-Ds-Z5vUZ.js","/assets/rotate-cw-ON22yYJE.js","/assets/save-DDbhH_77.js","/assets/scopeLinks-CAPqyOAT.js","/assets/scroll-text-HULeHPTT.js","/assets/search-x-DH2HCaga.js","/assets/segments-Cpr4Lsjr.js","/assets/send-DTlSqjZd.js","/assets/settings-2-NyvvNX1u.js","/assets/shield-Caa0KMXU.js","/assets/shield-alert-De1MlYit.js","/assets/shield-check-BvYWXT-E.js","/assets/shield-question-mark-DKWRI4ui.js","/assets/siren-KX3a4RzO.js","/assets/snowflake-C-TLaPJe.js","/assets/split-NuoLfnJ-.js","/assets/square-6y8RQmhT.js","/assets/square-check-big-BkN2JFm1.js","/assets/star-Brv8sUdB.js","/assets/statusBands-C-C_lJDs.js","/assets/store-DkR4iiqp.js","/assets/table-2-DeEBuWKm.js","/assets/table-properties-rEpOkjl5.js","/assets/tag-BH9Sn7EV.js","/assets/timer-off-BPuyP2d4.js","/assets/trending-down-DwacqBRh.js","/assets/trending-up-WeJvkW1t.js","/assets/undo-2-nJn_oiqH.js","/assets/useChartTheme-BZ4LMIZe.js","/assets/useElementWidth-DD6xzl1B.js","/assets/useIsMobile-C7JkNLv7.js","/assets/useOpenParam-DsTxpX7N.js","/assets/useStatusBands-DRgWVy-y.js","/assets/useUrlScope-6jDLh7fx.js","/assets/user-CGynedJH.js","/assets/user-cog-XJIV-Ezi.js","/assets/user-minus-Bf-BePpH.js","/assets/users-q8h_1XLy.js","/assets/video-DvXUYgMK.js","/assets/wallet-BuS4K04_.js","/assets/warehouse-vl1wrrsx.js","/assets/x-DPds-GYU.js","/assets/zap-CpkE43hs.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
