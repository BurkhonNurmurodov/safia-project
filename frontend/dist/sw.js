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

const BUILD = "2026-10-12T05:20:01.428Z";
const PRECACHE = ["/","/assets/AdminPanel-Dxu-n10U.js","/assets/AnalysisBoard-DRK4nLzN.js","/assets/Arc-CcaASphL.js","/assets/Assistant-C5PhirHu.js","/assets/BrigadirProfile-Bss8_e9Z.js","/assets/BroadcastReceivers-DnaasnZ2.js","/assets/BroadcastRecord-wY3gKRlC.js","/assets/Button-BsVbvxs8.js","/assets/CatLockNotice-D7Ii9mHJ.js","/assets/CategoryLegendModal-DR3Hwm0U.js","/assets/CellConcerns-DSaHCDsj.js","/assets/CellDetails-BToGkSIc.js","/assets/CellFormModal-JqrEaZf1.js","/assets/CellIdent-DQ6R_Tx6.js","/assets/CellLink-DjI4voL3.js","/assets/Cells-CaWkoFLS.js","/assets/ColumnFilter-C9S8S-KI.js","/assets/ColumnsPicker-Dfn36W2q.js","/assets/CommentsModal-DZ3E833M.js","/assets/ComparisonTable-BFyF63wm.js","/assets/Concerns-CaTT5R-G.js","/assets/Daily-BmRTSM6J.js","/assets/DataTable-DCnNxrm9.js","/assets/DateRangePicker-qv07t1pA.js","/assets/DayReportView-R8FTFe_Z.js","/assets/DayStepper-Dp7NRSCD.js","/assets/DifferenceBreakdown-zSoM3t_G.js","/assets/Downtime-B82OTwqG.js","/assets/Education-ByWVrJ0H.js","/assets/EducationLesson-CaL1ajz8.js","/assets/EmptyState-CedWH7pW.js","/assets/Exam-D0a_p7Ug.js","/assets/FactorySelect-D27SWN-_.js","/assets/Gamification-CO7Pk7vK.js","/assets/GroupBadge-DfyMJcud.js","/assets/HeatmapChart-B_bogSbx.js","/assets/IdleCell-Byh_XzXK.js","/assets/KPICard-CHH548uS.js","/assets/Kaizen-BVS5tEt2.js","/assets/Kelish-Bc2xjNPw.js","/assets/KpiDeltaCard-CuSN2_8R.js","/assets/LangTextInput-DLTNz25V.js","/assets/Layout-CriLaUNh.js","/assets/LeaderAppeal-ClB9ZYsm.js","/assets/LeaderDayReport-By7o1NAs.js","/assets/LeaderUnitReport-C7pGUmnw.js","/assets/Leaderboard-D_AtRq3L.js","/assets/Leaders-D18K3HDy.js","/assets/Lightbox-BG2xGG3h.js","/assets/LiveOverview-Dq-NbAzD.js","/assets/Login-pcbpSWUa.js","/assets/NotFound-DMmXWC53.js","/assets/Notifications-Bd2gBSnx.js","/assets/Overview-D4PTIbCu.js","/assets/Pagination-BKgW98wH.js","/assets/PerenaladkaFactTable-koLugbZC.js","/assets/PersonCard-d8HRLrAM.js","/assets/PlanFulfillment-VsM1b6GS.js","/assets/Production-C_VHUUvn.js","/assets/Profile-B1cuRtCU.js","/assets/ProofCamera-BsgCQQsp.js","/assets/ProofPhoto-COA_Sey2.js","/assets/Quality-B_eofLHw.js","/assets/RawRows-rpaXy7lK.js","/assets/RequestStateChip-DlGUMlf4.js","/assets/RichTextEditor-Be-Nk5qZ.js","/assets/SaveState-DkA8Dw7Z.js","/assets/SearchInput-BXsIYtru.js","/assets/SeasonalityHeatmap-CMtrKbSz.js","/assets/SegmentedToggle-C_d5f6TN.js","/assets/SetupTimes-PO709cnC.js","/assets/ShiftDaily-CQZbrTVR.js","/assets/Staff-DFyVsl6D.js","/assets/StatusBadge-rv98Bt4d.js","/assets/TargetGoal-DHeNZyVj.js","/assets/Targets-BlGsdgsS.js","/assets/Tasks-C7a1WT2P.js","/assets/TimeWheelPicker-bVbPms1b.js","/assets/Toast-D4S59t3C.js","/assets/Tooltip-CYKHvKrR.js","/assets/TrendChart-BKBxAiNJ.js","/assets/TripleSpeedometer-DKggDVRu.js","/assets/Trudoyomkost-BqH5WgRl.js","/assets/Turnover-CTgS1iOq.js","/assets/UploadDropzone-DnA8-qkv.js","/assets/UsersActivity-DBD9NIkn.js","/assets/VerdictBlock-DBNz31BM.js","/assets/VfxApiMap-COFNnvLc.js","/assets/VfxDictionaries-B7HcNDiJ.js","/assets/VfxEmployees-BCZiwEdn.js","/assets/VfxHrMoves-Cb1zAhmf.js","/assets/VfxJobs-rGAO2dEA.js","/assets/VfxPhoto-D-OLd9EW.js","/assets/VfxShifts-DtOotqxu.js","/assets/VfxState-69LtkBTy.js","/assets/VfxTimebooks-B-3tgshv.js","/assets/VfxTimesheet-Dh0WPEUR.js","/assets/WatchProgress-7IlhsP-r.js","/assets/WebLogin-DqK3gAwx.js","/assets/WorkerConcerns-BoaSBybm.js","/assets/Workers-CGfDKhWl.js","/assets/Zagruzka-C5X-Ixom.js","/assets/ZagruzkaCell-8eIcHHu1.js","/assets/api-B5KoBpbu.js","/assets/archive-DOw5Ae3N.js","/assets/archive-restore-ZEPPoAXS.js","/assets/arrow-down-BZ3embxd.js","/assets/arrow-down-wide-narrow-D5Gc67T_.js","/assets/arrow-up-narrow-wide-BNNasJeN.js","/assets/award-WOwkqilb.js","/assets/ban-DkuiYgKV.js","/assets/boxes-C3zZvJwm.js","/assets/braces-CyAa7rJq.js","/assets/brigadirFilters-PW3o6xD9.js","/assets/broadcastTree-DmqOxCCn.js","/assets/building-2-DiwHap0V.js","/assets/calculator-DN9tRBZ5.js","/assets/calendar-DqbcDmyr.js","/assets/calendar-days-CTda3_lz.js","/assets/camera-Sz6LQIQy.js","/assets/categories-x-uWrlV0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C2GoewYs.js","/assets/chart-line-U0IPM4LI.js","/assets/chart-pie-BiEomIdX.js","/assets/chartRange-C6pY8J5X.js","/assets/check-check-Cj_QocWM.js","/assets/chevron-left-BtR3KlQp.js","/assets/chevrons-up-down-DYTRG8xK.js","/assets/circle-Cje2WdU2.js","/assets/circle-alert-DN3QI61J.js","/assets/circle-check-big-CCrNT5lg.js","/assets/circle-dashed-CQQqR9d1.js","/assets/circle-minus-Dd3M-RlU.js","/assets/circle-question-mark-DgE0WTAE.js","/assets/circle-slash-SlLw6TZC.js","/assets/circle-user-round-Ppndhifx.js","/assets/clock-3-qzizMU60.js","/assets/cloud-off-Ch4H9PLk.js","/assets/cloud-upload-BlLCh4Sr.js","/assets/compass-DJHB4Pps.js","/assets/concernCategories-znoj-Tfx.js","/assets/copy-Crebqsj2.js","/assets/corner-down-right-DPeheD4L.js","/assets/createLucideIcon-BPJle2ll.js","/assets/es-DojQW5NW.js","/assets/external-link-DGTcaMZV.js","/assets/file-clock-DctdT2KQ.js","/assets/file-exclamation-point-iOWnkEWz.js","/assets/flag-CpRUdaiX.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CwZ73iZi.js","/assets/hash-CNhkfNY8.js","/assets/hourglass-CwP3DaIt.js","/assets/image-Uo56Ip1M.js","/assets/image-off-B8cLnWW2.js","/assets/inbox-tYo_GE9C.js","/assets/index-4398keYK.css","/assets/index-Dd3I7zQE.js","/assets/keyboard-CRKDZ4mV.js","/assets/languages-Cx-Az-Uw.js","/assets/latinCode-DckTgOCZ.js","/assets/layers--9rFVwce.js","/assets/lightbulb-DSPAcafC.js","/assets/link-2-CSfcfnx1.js","/assets/link-2-off-DffTB2f9.js","/assets/list-ordered-BVPbxUrC.js","/assets/list-tree-Dt8KaYK9.js","/assets/lock-open-BedldECL.js","/assets/log-in-B3D_0h3B.js","/assets/minimize-2-B9-kO1Lk.js","/assets/package-check-PekmBX-q.js","/assets/pencil-CpyScHZ8.js","/assets/percent-D8sCH_tg.js","/assets/pin-Dxza-xLC.js","/assets/pin-off-CsyZ5OVn.js","/assets/play-hfvmlYgM.js","/assets/plug-zap-CoB6WvM0.js","/assets/prop-types-tXnlehOL.js","/assets/radio-DM71wGaY.js","/assets/react-apexcharts.esm-DABvdxUA.js","/assets/registers-CknCB1IT.js","/assets/repeat-CbNACsdm.js","/assets/save-Bf0x25qA.js","/assets/scopeLinks-DZz-GIo9.js","/assets/scroll-text-CjTPRU3f.js","/assets/search-x-CBBPrdb0.js","/assets/segments-B_MbXkY2.js","/assets/send-CNOOTNIH.js","/assets/settings-2-BHQ-dO1u.js","/assets/shield-CHdq-Yvf.js","/assets/shield-alert-D9L3I0Xe.js","/assets/shield-question-mark-HYmcTPh2.js","/assets/siren-6x8-QaCP.js","/assets/snowflake-B3G2EEWy.js","/assets/split-Bsj6TEPC.js","/assets/square-check-big-Dt4WPqYo.js","/assets/star-DT8HAHR0.js","/assets/statusBands-BHuMpHEE.js","/assets/store-C8zhGlm4.js","/assets/table-2-DOo6p0wa.js","/assets/table-properties-C439HNCg.js","/assets/tag-BkMIwOrH.js","/assets/timer-off-Bp4Bh6g6.js","/assets/trending-down-CogzjHV2.js","/assets/trending-up-SERAplIX.js","/assets/undo-2-Ben3Qqbm.js","/assets/useChartTheme-Cn4IArUd.js","/assets/useElementWidth-CMdNwpWu.js","/assets/useIsMobile-BgMMa0S_.js","/assets/useOpenParam-DFsdTuFB.js","/assets/useStatusBands-BHJ_XeRG.js","/assets/useUrlScope-1OGw2eDv.js","/assets/user-b1nbHtY1.js","/assets/user-cog-YT-M0QK8.js","/assets/users-KpnN3QSt.js","/assets/vfx-DxLKovhT.js","/assets/video-BnLySwcO.js","/assets/wallet-BiGNxdeL.js","/assets/warehouse-03zOH_7W.js","/assets/workflow-NuANwd13.js","/assets/x-AB0lQ2pm.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
