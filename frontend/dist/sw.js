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

const BUILD = "2026-10-04T12:40:02.713Z";
const PRECACHE = ["/","/assets/AdminPanel-DaQzZkYG.js","/assets/AnalysisBoard-CW6khga3.js","/assets/Arc-CHTrJruo.js","/assets/ArcLegacy-CcxD1p8Y.js","/assets/BrigadirProfile-fYmQ7uGb.js","/assets/BroadcastReceivers-CROqmKfP.js","/assets/BroadcastRecord-DqG3F19W.js","/assets/CatLockNotice-CDaBzG4_.js","/assets/CategoryLegendModal-BIgjaZka.js","/assets/CellConcerns-BuMUnSXT.js","/assets/CellDetails-ekBk17_V.js","/assets/CellFormModal-84aeG5cz.js","/assets/CellIdent-gjR-fMDp.js","/assets/CellLink-DLSc-cPR.js","/assets/Cells-CnuWZx3O.js","/assets/ColumnFilter-BVrNk6A1.js","/assets/ColumnsPicker-De-GbIiJ.js","/assets/CommentsModal-CupNvDUU.js","/assets/ComparisonTable-7fYvpEop.js","/assets/Concerns-CxRevH6U.js","/assets/ConfirmDialog-DCapL7N2.js","/assets/Daily-ImuuP8sa.js","/assets/DataTable-Bb2SEpWn.js","/assets/DateRangePicker-N36wxHxk.js","/assets/DayReportView-D9FeOlCy.js","/assets/DayStepper-41exkl2W.js","/assets/DifferenceBreakdown-D43IV1FZ.js","/assets/Downtime-BSsMCsVr.js","/assets/Education-DVdZUD8-.js","/assets/EducationLesson-xfSEERUm.js","/assets/EmptyState-DCvc701V.js","/assets/Exam-D2_hFj1U.js","/assets/FactorySelect-q73xmO3P.js","/assets/Gamification-5-Vbwmz5.js","/assets/GroupBadge-DeRvDC3M.js","/assets/HeatmapChart-mxr9yE8l.js","/assets/IdleCell-DYui4OsS.js","/assets/KPICard-Chbum3Js.js","/assets/Kaizen-BtXFRFJ2.js","/assets/Kelish-BAHHuh7C.js","/assets/KpiDeltaCard-D3fTWDOF.js","/assets/LangTextInput-D9RNDJo8.js","/assets/Layout-CdU3k91g.js","/assets/LeaderAppeal-VZRiqV4D.js","/assets/LeaderDayReport-71xSvRgU.js","/assets/LeaderUnitReport-BwN3qOKa.js","/assets/Leaderboard-WKe_Agpf.js","/assets/Leaders-C3tYSNfk.js","/assets/Lightbox-BHNHClDv.js","/assets/LiveOverview-D-E5Ex4N.js","/assets/Login-jiUrVQmw.js","/assets/NotFound-BcYQA470.js","/assets/Notifications-BAViXQoC.js","/assets/Overview-Cg14ztPE.js","/assets/Pagination-yK82WKwN.js","/assets/PerenaladkaFactTable-oPFzSrBQ.js","/assets/PersonCard-Dvrt76xn.js","/assets/PlanFulfillment-3hKDbQ9D.js","/assets/Production-D9BQG-oX.js","/assets/Profile-CmCcAny6.js","/assets/ProofCamera-ClQ7D35D.js","/assets/ProofPhoto-B4o1C5NJ.js","/assets/Quality-15vmR2Yn.js","/assets/RawRows-B62_psOQ.js","/assets/RequestStateChip-C7xSLbkA.js","/assets/RichTextEditor-t_m2nVEb.js","/assets/SaveState-DeXZBt6Q.js","/assets/SearchInput-qvitE6eZ.js","/assets/SeasonalityHeatmap-Dmxae8i5.js","/assets/SegmentedToggle-BtNNYR0c.js","/assets/SetupTimes-DtG-FTxA.js","/assets/ShiftDaily-Dp50r1Ja.js","/assets/Staff-CU3to-zG.js","/assets/StaffLive-Ck_EpZIN.js","/assets/StatusBadge-CKvwTi0y.js","/assets/TargetGoal-c4fNaKvX.js","/assets/Targets-DDBMdt3W.js","/assets/Tasks-DZaCgPPP.js","/assets/TimeWheelPicker-BnxhTMON.js","/assets/Toast-C8L_mAGD.js","/assets/Tooltip-smmzBNpn.js","/assets/TrendChart-Ds-x4HVq.js","/assets/TripleSpeedometer-Ddc6x0Qu.js","/assets/Trudoyomkost-D1DKGwgg.js","/assets/UploadDropzone-D-as-dmI.js","/assets/UsersActivity-D3hBJN4J.js","/assets/VerdictBlock-CV9kHGUT.js","/assets/VfxApiMap-DXlCnS4m.js","/assets/VfxDictionaries-C_JOnBnx.js","/assets/VfxEmployees-CjcwAZbw.js","/assets/VfxHrMoves-CfffImPQ.js","/assets/VfxJobs-TPXlHR_w.js","/assets/VfxPhoto-CiFw3HRa.js","/assets/VfxShifts-CjUiscyx.js","/assets/VfxState-Cl_EoJAS.js","/assets/VfxTimebooks-BCqDYG0H.js","/assets/VfxTimesheet-Fut4GIAa.js","/assets/WatchProgress-BnLRrq90.js","/assets/WebLogin-CiQeVu1I.js","/assets/WorkerConcerns-BJ0p5V-C.js","/assets/Workers-B3TMH_UW.js","/assets/Zagruzka-BF_jHVVX.js","/assets/ZagruzkaCell-eeiKOezT.js","/assets/api-BgoC9O46.js","/assets/archive-BcBcARcf.js","/assets/archive-restore-Bux4Fz3S.js","/assets/arrow-down-DxoFFzNd.js","/assets/arrow-left-DO-2FhjT.js","/assets/arrow-up-UWSUrY2E.js","/assets/arrow-up-narrow-wide-CRQzR8I7.js","/assets/arrow-up-right-C6GI_V5a.js","/assets/award-Dups5XBT.js","/assets/ban-DQGewnSq.js","/assets/bot-BMRDxfOL.js","/assets/boxes-CwsQNevR.js","/assets/braces-BP1v_krS.js","/assets/brigadirFilters-eXY27kfY.js","/assets/broadcastTree-CdISDZm9.js","/assets/building-2-VMpj14mo.js","/assets/calendar-Cs3st_D8.js","/assets/calendar-days-BPd51P6d.js","/assets/camera-8sd1dOHW.js","/assets/categories-Cp6l3Z_2.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CLqtcQOM.js","/assets/chart-line-Dy64fQ9r.js","/assets/chart-pie-CIxo1WTm.js","/assets/chartRange-D1T_QKfG.js","/assets/check-check-Bba7a45E.js","/assets/chevron-left-BQN853i7.js","/assets/chevrons-up-down-BIevwzrH.js","/assets/circle-BAmsIvQl.js","/assets/circle-alert-lnA-9lkm.js","/assets/circle-check-big-gmpXk2da.js","/assets/circle-dashed-Bp6e4zD5.js","/assets/circle-minus-DB4_AsPl.js","/assets/circle-question-mark-Diauy3g9.js","/assets/circle-slash-CGu_DpZX.js","/assets/circle-user-round-Bdsw_H1v.js","/assets/clock-3-C7qszWlE.js","/assets/cloud-off-CbYR1ad7.js","/assets/cloud-upload-CoNRtYtQ.js","/assets/compass-Cro0G6Fz.js","/assets/concernCategories-BJh9q2cU.js","/assets/copy-XBANaZ8V.js","/assets/corner-down-right-Z-gKOjQO.js","/assets/createLucideIcon-VJKqm8Tm.js","/assets/es-C1xCZusI.js","/assets/exportXlsx-Qy_Q9Y5o.js","/assets/external-link-zn05IRC9.js","/assets/file-clock-Gbr_mbOh.js","/assets/file-exclamation-point-sdDufSpY.js","/assets/file-spreadsheet-B5B00akA.js","/assets/file-text-CFljb0B0.js","/assets/flag-DmisLnjQ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-GdnvEjUN.js","/assets/hash-C8GRm2aP.js","/assets/history-tLAcA2fo.js","/assets/hourglass-kKqxKPRa.js","/assets/image-Bj_5b1-z.js","/assets/image-off-C-E5Tshp.js","/assets/inbox-Dzcl0cUy.js","/assets/index-C79W1Zz-.js","/assets/index-DzDT26XC.css","/assets/key-round-DM1E5eTa.js","/assets/keyboard-CMMrszUj.js","/assets/languages-CfCvxJOe.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-MOOtDBE-.js","/assets/lightbulb-C70geraX.js","/assets/link-2-DXkYOpsL.js","/assets/link-2-off-GxC85Icq.js","/assets/list-ordered-DwldbZ5P.js","/assets/list-tree-XO2cWG--.js","/assets/lock-open-Bs0cyyJW.js","/assets/log-in-Ca-lMxPt.js","/assets/maximize-2-YWZgRP8D.js","/assets/message-square-BZoGdT9c.js","/assets/minimize-2-ChNoRjyW.js","/assets/package-check-BzHCoiec.js","/assets/paperclip-lcBA9fmH.js","/assets/pencil-D1CbvQaB.js","/assets/percent-C7PKfetC.js","/assets/pin-Dj6Wk3_3.js","/assets/pin-off-2cvDf9Ir.js","/assets/play-CjD2nzBd.js","/assets/plug-zap-BQt1De6P.js","/assets/presentation-CYL2CpoH.js","/assets/prop-types-DVWXbGaz.js","/assets/radio-k1TvWfCn.js","/assets/react-apexcharts.esm-D1o9Y0wp.js","/assets/registers-BVv3xI-f.js","/assets/repeat-D4w-5Oy6.js","/assets/rotate-ccw-DWC1PvP_.js","/assets/rotate-cw-xa7_fOq1.js","/assets/save-Cj7p6j2i.js","/assets/scopeLinks-BFhFUvGs.js","/assets/scroll-text-Dbpo3QyY.js","/assets/search-x-CvA1iHax.js","/assets/segments-DuhwAP2X.js","/assets/send-d0Lgd8cs.js","/assets/settings-2-B-8cIObw.js","/assets/shield-BQmKr7L4.js","/assets/shield-alert-CGb_J6Xz.js","/assets/shield-check-Dml1EWiX.js","/assets/shield-question-mark-BMJzD_VT.js","/assets/siren-BTfghtgC.js","/assets/snowflake-T3fLrpqD.js","/assets/split-BifeGu_L.js","/assets/square-Djldhmd0.js","/assets/square-check-big-CI58SUYe.js","/assets/star-yfEVQVl-.js","/assets/statusBands-D7Wq4k_Z.js","/assets/store-NX_ZGCK7.js","/assets/table-2-Dk8M6vrz.js","/assets/table-properties-BV8wQFOt.js","/assets/tag-BzrtQVsG.js","/assets/timer-off-BO_Pc6FJ.js","/assets/trending-down-K4OZztvO.js","/assets/trending-up-DCSH3Wft.js","/assets/undo-2-ByEVWAM5.js","/assets/useChartTheme-7fxuNxLa.js","/assets/useElementWidth-D4HsEOl7.js","/assets/useIsMobile-BKVYBWDI.js","/assets/useOpenParam-D--T3xIR.js","/assets/useStatusBands-0LtVmkhN.js","/assets/useUrlScope-CIoxcPeF.js","/assets/user-DPWkAEQP.js","/assets/user-cog-BNVP-0ic.js","/assets/user-minus-5y6CDLls.js","/assets/users-Dut5uZa5.js","/assets/video-bJanSKgo.js","/assets/wallet-CU_gm5UE.js","/assets/warehouse-B1iH7wYT.js","/assets/x-BN1R7N5X.js","/assets/zap-CLy3XQfq.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
