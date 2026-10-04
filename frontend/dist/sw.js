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

const BUILD = "2026-10-04T15:20:34.915Z";
const PRECACHE = ["/","/assets/AdminPanel-7mduJBrA.js","/assets/AnalysisBoard-Bi9inOHK.js","/assets/Arc-DGUZT1-y.js","/assets/ArcLegacy-BF3sjMza.js","/assets/BrigadirProfile-fo2-99oS.js","/assets/BroadcastReceivers-NOibjRNw.js","/assets/BroadcastRecord-DQydgncu.js","/assets/CatLockNotice-S050hbCa.js","/assets/CategoryLegendModal-DdVVzgKo.js","/assets/CellConcerns-D30TigDz.js","/assets/CellDetails-CWHeS3lk.js","/assets/CellFormModal-DWqoVgir.js","/assets/CellIdent-B2HyOkQr.js","/assets/CellLink-DlCAjQQA.js","/assets/Cells-B95gAymz.js","/assets/ColumnFilter-C0_6uuh7.js","/assets/ColumnsPicker-CWbG_drh.js","/assets/CommentsModal-wNAuw1ij.js","/assets/ComparisonTable-C2mFkUpz.js","/assets/Concerns-Bss5yPfR.js","/assets/ConfirmDialog-CrTs1xJe.js","/assets/Daily-Bxv4zAK9.js","/assets/DataTable-WiQef5Ro.js","/assets/DateRangePicker-BiCl8KJj.js","/assets/DayReportView-BNGUdqaT.js","/assets/DayStepper-BpJFZ91B.js","/assets/DifferenceBreakdown-NWArYqyj.js","/assets/Downtime-CZ4LLOV6.js","/assets/Education-6CyQRGzv.js","/assets/EducationLesson-B1JgoLwV.js","/assets/EmptyState-CWBe1y8T.js","/assets/Exam-B28c-i6W.js","/assets/FactorySelect-BIPvQ297.js","/assets/Gamification-CM2IeAS5.js","/assets/GroupBadge-BqECrR7p.js","/assets/HeatmapChart-BLz4cSkl.js","/assets/IdleCell-CkLI6fb4.js","/assets/KPICard-BPEzUE_e.js","/assets/Kaizen-BFz8WeND.js","/assets/Kelish-COiVi1jr.js","/assets/KpiDeltaCard-srtBsUIc.js","/assets/LangTextInput-UIk18axB.js","/assets/Layout-CbgMyDdC.js","/assets/LeaderAppeal-uLrFGTtd.js","/assets/LeaderDayReport-Bf16Nfcv.js","/assets/LeaderUnitReport-DuBL-J0h.js","/assets/Leaderboard-gaxTR-95.js","/assets/Leaders-DVewWy_w.js","/assets/Lightbox-De4H4XY2.js","/assets/LiveOverview-2ZV0DfPH.js","/assets/Login-COjz3KiV.js","/assets/NotFound-CLO1h4bV.js","/assets/Notifications-DGkPCaEg.js","/assets/Overview-D3JR0olu.js","/assets/Pagination-D6VCHrq0.js","/assets/PerenaladkaFactTable-nq35mlFf.js","/assets/PersonCard-BFYI-pNc.js","/assets/PlanFulfillment-C-3Y25Ni.js","/assets/Production-1qPovR4Q.js","/assets/Profile-ToqTFwOi.js","/assets/ProofCamera-CvrapJ5N.js","/assets/ProofPhoto-gkKp_H4e.js","/assets/Quality-CIENqVNi.js","/assets/RawRows-CmAMEbUN.js","/assets/RequestStateChip-D3aONllY.js","/assets/RichTextEditor-DQ_QwOgH.js","/assets/SaveState-CW0lCNcW.js","/assets/SearchInput-DZvUmoNP.js","/assets/SeasonalityHeatmap-DWr9f4T2.js","/assets/SegmentedToggle-BNUEnQOy.js","/assets/SetupTimes-oaXiS_KO.js","/assets/ShiftDaily-D9TLuFqh.js","/assets/Staff-B009zdQ5.js","/assets/StaffLive-DVn0Ah5I.js","/assets/StatusBadge-C1XHwIwS.js","/assets/TargetGoal-CJzRjz6F.js","/assets/Targets-BNi9gI2e.js","/assets/Tasks-ghH0CZDb.js","/assets/TimeWheelPicker-DUa90ZjT.js","/assets/Toast-D7R_epTT.js","/assets/Tooltip-C4DpF_-h.js","/assets/TrendChart-D7M2nLqP.js","/assets/TripleSpeedometer-DH4HguJZ.js","/assets/Trudoyomkost-D4r8qgEp.js","/assets/Turnover-BvjDswjK.js","/assets/UploadDropzone-BV_tY08e.js","/assets/UsersActivity-D_GrwdSx.js","/assets/VerdictBlock-PyVP01lA.js","/assets/VfxApiMap-DviQpXDs.js","/assets/VfxDictionaries-DJFIdfSl.js","/assets/VfxEmployees-ChTA50bW.js","/assets/VfxHrMoves-D-yON1bc.js","/assets/VfxJobs-jUkeu-Wk.js","/assets/VfxPhoto-CBxT8kgu.js","/assets/VfxShifts-CRtVnuXY.js","/assets/VfxState-CY4cNqZa.js","/assets/VfxTimebooks-CoXKNsXv.js","/assets/VfxTimesheet-kD2pDacK.js","/assets/WatchProgress-CiMuJ5wf.js","/assets/WebLogin-CdIz6xoZ.js","/assets/WorkerConcerns-D8S05lsh.js","/assets/Workers-DfJ7E6KR.js","/assets/Zagruzka-DirBCvdf.js","/assets/ZagruzkaCell-sCU15zPJ.js","/assets/api-GWyzEZDB.js","/assets/archive--ANgwqRE.js","/assets/archive-restore-ccmnPif_.js","/assets/arrow-down-Cdiojk0Z.js","/assets/arrow-left-e-Ypj-Af.js","/assets/arrow-up-BJk8UqWb.js","/assets/arrow-up-narrow-wide-PQZcooNj.js","/assets/arrow-up-right-DAU7S1XI.js","/assets/award-DckL0fWQ.js","/assets/ban-Bl5fS5nq.js","/assets/book-open-j4IQywf2.js","/assets/bot-DP1cED5A.js","/assets/boxes-BkTML-cj.js","/assets/braces-Cu4pvK34.js","/assets/brigadirFilters-PMhkVfZF.js","/assets/broadcastTree-CJklzCbA.js","/assets/building-2-BeNZhNRQ.js","/assets/calculator-5ozGPvEv.js","/assets/calendar-BNH8Mx2a.js","/assets/calendar-days-BU877Ant.js","/assets/camera-p-REW0Ow.js","/assets/categories-lUTGKxhp.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-AHfxg8hf.js","/assets/chart-line-C6cIvrWI.js","/assets/chart-pie-DGKooNHn.js","/assets/chartRange-BtH2-pl0.js","/assets/check-check-sejsQyok.js","/assets/chevron-left-Due9JOom.js","/assets/chevrons-up-down-1F5bqRAD.js","/assets/circle-0BZiVqKQ.js","/assets/circle-alert-CyiLEs6-.js","/assets/circle-check-big-C3POcPxW.js","/assets/circle-dashed-CeusRXch.js","/assets/circle-minus-CKC7y70s.js","/assets/circle-question-mark-D641N15c.js","/assets/circle-slash-Bd091dZi.js","/assets/circle-user-round-CtmBpuvY.js","/assets/clock-3-CYxqr_2p.js","/assets/cloud-off-DN1mtARd.js","/assets/cloud-upload-DujPWuxu.js","/assets/compass-BB2jmpcn.js","/assets/concernCategories-s1ASGTcX.js","/assets/copy-C5zuOFG3.js","/assets/corner-down-right-COvp_5NJ.js","/assets/createLucideIcon-Ds6ORE1Y.js","/assets/es-DvlO9NSN.js","/assets/exportXlsx-CpOrlPYH.js","/assets/external-link-BEuTebCa.js","/assets/file-clock-OrqqxxCX.js","/assets/file-exclamation-point-BExF4Sfe.js","/assets/file-spreadsheet-BZykKXFG.js","/assets/file-text-CLTn8tvq.js","/assets/flag-LnVJujPb.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C7Trmrqm.js","/assets/hash-Bp8KCnp_.js","/assets/history-DQSESP-m.js","/assets/hourglass-Byu0BQac.js","/assets/image-D6qPerLZ.js","/assets/image-off-Cr69bam7.js","/assets/inbox-DDkeG9PX.js","/assets/index-B5ISwwGE.js","/assets/index-BAN4mMdX.css","/assets/key-round-9UCDUDQu.js","/assets/keyboard-Dg6cgzN_.js","/assets/languages-tZ1dFJFM.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-lVuIDYo3.js","/assets/lightbulb-C_itHLO7.js","/assets/link-2-Dye3NllP.js","/assets/link-2-off-Bywmy4M6.js","/assets/list-ordered-DipEBmKg.js","/assets/list-tree-DOifarnV.js","/assets/lock-open-BP9E4ExT.js","/assets/log-in-BlCn2nmL.js","/assets/maximize-2-aJOo5nPc.js","/assets/message-square-0DC_RuFB.js","/assets/minimize-2-jMjwNUGc.js","/assets/package-check-B_S0dVEx.js","/assets/paperclip-Dr83wUuO.js","/assets/pencil-DLnieJqh.js","/assets/percent-B59-7Py3.js","/assets/pin-Dy_KZTny.js","/assets/pin-off-BCivLmzk.js","/assets/play-D01_hiyF.js","/assets/plug-zap-BqgqjeAN.js","/assets/presentation-BISjRXvt.js","/assets/prop-types-df4zhqMx.js","/assets/radio-YNrhMSwr.js","/assets/react-apexcharts.esm-DEXF4wJ9.js","/assets/registers-B5YRs8FF.js","/assets/repeat-D-fImf7C.js","/assets/rotate-ccw-Dmhp7Kc4.js","/assets/rotate-cw-BuwygtVU.js","/assets/save-CwE7InOQ.js","/assets/scopeLinks-eoNE0Th2.js","/assets/scroll-text-CSeppEsD.js","/assets/search-x-3zo1q8kE.js","/assets/segments-DM35gbBu.js","/assets/send-BENuCwZO.js","/assets/settings-2-BF_n4m5x.js","/assets/shield-CJQ-QOKJ.js","/assets/shield-alert-C7q70lu1.js","/assets/shield-check-C7zzgviB.js","/assets/shield-question-mark-p_5mGeaf.js","/assets/siren-Bv48tmEE.js","/assets/snowflake-CfMc20DO.js","/assets/split-Dv6qa7JN.js","/assets/square-Cn_iLG08.js","/assets/square-check-big-B2-QvSAp.js","/assets/star-CsGsyawJ.js","/assets/statusBands-Dia1jIc_.js","/assets/store-Bpp_7FKi.js","/assets/table-2-DQmTEiw-.js","/assets/table-properties-DpASTdLf.js","/assets/tag-DE-htiNG.js","/assets/timer-off-VCRsdZ_D.js","/assets/trending-down-Cy8dLuCK.js","/assets/trending-up-BtxKTSig.js","/assets/undo-2-L99WEO_D.js","/assets/useChartTheme-B2ESy24P.js","/assets/useElementWidth-DrgCVRzS.js","/assets/useIsMobile-Bwd6Uy5b.js","/assets/useOpenParam-CsePKm83.js","/assets/useStatusBands-g3XCS3QT.js","/assets/useUrlScope-D9qapPBM.js","/assets/user-DVFJ5Jk-.js","/assets/user-cog-B9E_byvc.js","/assets/users-CWDeFlfW.js","/assets/vfx-C_6sau7X.js","/assets/video-PAl1w6K5.js","/assets/wallet-DpDinY72.js","/assets/warehouse-CJBrnLG9.js","/assets/x-Crft_HPj.js","/assets/zap-Du-lCB2D.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
