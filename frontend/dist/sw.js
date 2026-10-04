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

const BUILD = "2026-10-04T13:10:47.745Z";
const PRECACHE = ["/","/assets/AdminPanel-1zbX-VPm.js","/assets/AnalysisBoard-CDU8Ywuh.js","/assets/Arc-CGUrLu4e.js","/assets/ArcLegacy-Bmm-Do_D.js","/assets/BrigadirProfile-Bvti1OwV.js","/assets/BroadcastReceivers-eTUyylpE.js","/assets/BroadcastRecord-Bgdq5Nxk.js","/assets/CatLockNotice-D4jvsGqt.js","/assets/CategoryLegendModal-BixhyQtj.js","/assets/CellConcerns-hGH7QqS6.js","/assets/CellDetails-Sm64RA91.js","/assets/CellFormModal-Bee13mM9.js","/assets/CellIdent-CUh6iukd.js","/assets/CellLink-C_Tmoc66.js","/assets/Cells-BBeZy6YU.js","/assets/ColumnFilter-_BU6IEBj.js","/assets/ColumnsPicker-BHZKacO-.js","/assets/CommentsModal-SE6ju-GP.js","/assets/ComparisonTable-C9fd0bIO.js","/assets/Concerns-CyAwoX3l.js","/assets/ConfirmDialog-BYvmmag-.js","/assets/Daily-BlR5RfXV.js","/assets/DataTable-mCUxO1xv.js","/assets/DateRangePicker-CqITPbRp.js","/assets/DayReportView-DtQo4StK.js","/assets/DayStepper-CB41IF82.js","/assets/DifferenceBreakdown-uq7vDM7U.js","/assets/Downtime-41wMCK0m.js","/assets/Education-m9mh8UJ0.js","/assets/EducationLesson-CfGBbrih.js","/assets/EmptyState-RiIumyAM.js","/assets/Exam-55q2IyNS.js","/assets/FactorySelect-e4p_KInu.js","/assets/Gamification-B7vsm0ui.js","/assets/GroupBadge-BjX0H6R_.js","/assets/HeatmapChart-CYmnTcvV.js","/assets/IdleCell-C9Qs6Eyv.js","/assets/KPICard-BOrMvIct.js","/assets/Kaizen-DWl5UxbU.js","/assets/Kelish-DVVJRQvb.js","/assets/KpiDeltaCard-BzCqSMFm.js","/assets/LangTextInput-B2N6a_Ik.js","/assets/Layout-CPPet_7b.js","/assets/LeaderAppeal-C-DvNNHC.js","/assets/LeaderDayReport-JGg-IXgF.js","/assets/LeaderUnitReport-BwxMTbju.js","/assets/Leaderboard-B5effxIR.js","/assets/Leaders-SxtsLFWA.js","/assets/Lightbox-qzjscA_X.js","/assets/LiveOverview-BR82o29X.js","/assets/Login-jtQOjnYN.js","/assets/NotFound-CMu-6z30.js","/assets/Notifications-B26MZ3dN.js","/assets/Overview-Cfxl4FNj.js","/assets/Pagination-C_SWnxyy.js","/assets/PerenaladkaFactTable-g6AI4-qB.js","/assets/PersonCard-BoeePjSx.js","/assets/PlanFulfillment-BmeXdpxw.js","/assets/Production-8W7BqGbi.js","/assets/Profile-BxjGbMI2.js","/assets/ProofCamera-CXi8z5dS.js","/assets/ProofPhoto-BhZDq16P.js","/assets/Quality-DDCl4Uap.js","/assets/RawRows-psaIKhG2.js","/assets/RequestStateChip-nInoiLLO.js","/assets/RichTextEditor-D-vOiCDh.js","/assets/SaveState-C1icnQvU.js","/assets/SearchInput-BKCvR_Wj.js","/assets/SeasonalityHeatmap-xwy9fWH9.js","/assets/SegmentedToggle-CRNUxmc_.js","/assets/SetupTimes-CbMsfIHO.js","/assets/ShiftDaily-dOgqj3PV.js","/assets/Staff-DLKEfV5E.js","/assets/StaffLive-DTuwi-NF.js","/assets/StatusBadge-9G8y5qb3.js","/assets/TargetGoal-CxMlQXPt.js","/assets/Targets-BLTze3DM.js","/assets/Tasks-BnmX9Rt3.js","/assets/TimeWheelPicker-DYKPNrm2.js","/assets/Toast-Bd-2f1_v.js","/assets/Tooltip-3tCjkvVa.js","/assets/TrendChart-DGc5d8t-.js","/assets/TripleSpeedometer-DPew3bBJ.js","/assets/Trudoyomkost-D0wK94ha.js","/assets/UploadDropzone-TK6AZrzH.js","/assets/UsersActivity-y63tR4B0.js","/assets/VerdictBlock-DwwyI82N.js","/assets/VfxApiMap-D5eI9EHc.js","/assets/VfxDictionaries-Cl09jR_W.js","/assets/VfxEmployees-D--lnUUN.js","/assets/VfxHrMoves-ep7I7bld.js","/assets/VfxJobs-D5lk2WxB.js","/assets/VfxPhoto-DERyZYmh.js","/assets/VfxShifts-BVvhC0ZM.js","/assets/VfxState-B8c2N2n5.js","/assets/VfxTimebooks-BXapJjgD.js","/assets/VfxTimesheet-CSZd-VHM.js","/assets/WatchProgress-AjvloGpv.js","/assets/WebLogin-Bapgxifq.js","/assets/WorkerConcerns-2PHmRm7g.js","/assets/Workers-DDG88omz.js","/assets/Zagruzka-Dx0zHYv4.js","/assets/ZagruzkaCell-Dy3LI3p3.js","/assets/api-BBYZVgRQ.js","/assets/archive-ELL43b2N.js","/assets/archive-restore-BOKMYhDo.js","/assets/arrow-down-xafcC9Xo.js","/assets/arrow-left-DKluuMzo.js","/assets/arrow-up-B-tS7UxE.js","/assets/arrow-up-narrow-wide-Dq-G3SFt.js","/assets/arrow-up-right-DGMvdMm_.js","/assets/award-BCrvt0Qa.js","/assets/ban-BW29D62j.js","/assets/bot-Ld41cabw.js","/assets/boxes-DYhjcYv0.js","/assets/braces-Dy2R_NR4.js","/assets/brigadirFilters-DGG3jUUm.js","/assets/broadcastTree-Dj1S6QyJ.js","/assets/building-2-DLN5yKuE.js","/assets/calendar-Bj4b86rF.js","/assets/calendar-days-jC-JP_Hz.js","/assets/camera-Guytf8yv.js","/assets/categories-C3xriV0D.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-De9Exzrv.js","/assets/chart-line-DQ_nj1UP.js","/assets/chart-pie-DCrcnsna.js","/assets/chartRange-D3Dt0f_m.js","/assets/check-check-mX1UCyjG.js","/assets/chevron-left-CJnSeoa8.js","/assets/chevrons-up-down-BJLwfLht.js","/assets/circle-BP1_96rh.js","/assets/circle-alert-BHehyr6b.js","/assets/circle-check-big-DwTuzTJ-.js","/assets/circle-dashed-BAhoXwda.js","/assets/circle-minus-3XfV_uHA.js","/assets/circle-question-mark-BbuWq-22.js","/assets/circle-slash-Caa1fMIu.js","/assets/circle-user-round-Cv93LE-b.js","/assets/clock-3-Bac-uCIW.js","/assets/cloud-off-BvvxXriy.js","/assets/cloud-upload-Cjj35bpy.js","/assets/compass-CKNqZ-oA.js","/assets/concernCategories-Bq9ujyzX.js","/assets/copy-DUQdt165.js","/assets/corner-down-right-CbBjAX2l.js","/assets/createLucideIcon-s6UGezSg.js","/assets/es-B27Na5y9.js","/assets/exportXlsx-CSvtfpPI.js","/assets/external-link-DlhkRo73.js","/assets/file-clock-D6pRM3eX.js","/assets/file-exclamation-point-BszdujZW.js","/assets/file-spreadsheet-IrTb88ad.js","/assets/file-text-B3pfvHMg.js","/assets/flag-CuTcveXO.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C0Forg1j.js","/assets/hash-DkUyCf8K.js","/assets/history-gFaVVRAo.js","/assets/hourglass-RyoyzKIs.js","/assets/image-BkLsOHuC.js","/assets/image-off-BiXd1kfY.js","/assets/inbox-BNFKKl4P.js","/assets/index-CYu7moi8.js","/assets/index-DzDT26XC.css","/assets/key-round-DRVMxrPE.js","/assets/keyboard-COT_bzeh.js","/assets/languages-B1qu8OYp.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BKHpz-aP.js","/assets/lightbulb-Dd6UFnFp.js","/assets/link-2-Bl5RZhxC.js","/assets/link-2-off-Dw7Jzke_.js","/assets/list-ordered-C-5RFPkq.js","/assets/list-tree-BywF32M1.js","/assets/lock-open-Caq1CVBd.js","/assets/log-in-BTpiludx.js","/assets/maximize-2-Bq9UNGG9.js","/assets/message-square-B4tf06mL.js","/assets/minimize-2-BUbGZRLY.js","/assets/package-check-DLArTI_s.js","/assets/paperclip-DKy5h4YZ.js","/assets/pencil-C-1ntYwk.js","/assets/percent-D47n0-ym.js","/assets/pin-CUYw55cy.js","/assets/pin-off-DW7wqoiD.js","/assets/play-DCCq12n-.js","/assets/plug-zap-BXctZrM2.js","/assets/presentation-YuFSbiVl.js","/assets/prop-types-DiKYWO0S.js","/assets/radio-W5VR7xBS.js","/assets/react-apexcharts.esm-DJ80UX9S.js","/assets/registers-KyZrjArK.js","/assets/repeat-ajI2dxZ0.js","/assets/rotate-ccw-D6jD-uPR.js","/assets/rotate-cw-BAGHC712.js","/assets/save-9kXpL3r5.js","/assets/scopeLinks-DrIVxNbt.js","/assets/scroll-text-D0H-bay6.js","/assets/search-x-CPbWgCbo.js","/assets/segments-lXDoJUdJ.js","/assets/send-ido5qHF7.js","/assets/settings-2-DeXtYVm4.js","/assets/shield-C9c5uFRJ.js","/assets/shield-alert-_w2X44r1.js","/assets/shield-check-DVKBUJVl.js","/assets/shield-question-mark-D9F5g9tX.js","/assets/siren-Cf8595ss.js","/assets/snowflake-Ccd8dsYI.js","/assets/split-VTLEovn9.js","/assets/square-B7GtO2CC.js","/assets/square-check-big-BZoQ_I5Y.js","/assets/star-yUqq6Ywg.js","/assets/statusBands-DGl5woyg.js","/assets/store-BiN84hV7.js","/assets/table-2-QbsWw2oJ.js","/assets/table-properties-CR2QcrKY.js","/assets/tag-DbB0R5QY.js","/assets/timer-off-C7wK2dPz.js","/assets/trending-down-C00qBiA8.js","/assets/trending-up-CS0Kzm9v.js","/assets/undo-2-BS1oBhM2.js","/assets/useChartTheme-f9geH2va.js","/assets/useElementWidth-DvEv9IA-.js","/assets/useIsMobile-88NxI4UD.js","/assets/useOpenParam-Cu6eDgi7.js","/assets/useStatusBands-BK5w1oEU.js","/assets/useUrlScope-B9E-JCSY.js","/assets/user-C3w7nlYa.js","/assets/user-cog-BYLu5l_b.js","/assets/user-minus-DJ0JgHo8.js","/assets/users-BIZi7N45.js","/assets/video-BM5PYDai.js","/assets/wallet-CXysf54f.js","/assets/warehouse-D2f7DdPH.js","/assets/x-Nd-iC6k9.js","/assets/zap-D3LZn_qL.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
