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

const BUILD = "2026-10-23T12:04:47.987Z";
const PRECACHE = ["/","/assets/AdminPanel-BsvKpT4H.js","/assets/AnalysisBoard-BNpZSfSG.js","/assets/Arc-B2xGFDpV.js","/assets/Assistant-DnXNh6HD.js","/assets/BrigadirProfile-C1j89d-9.js","/assets/BroadcastReceivers--Rx12543.js","/assets/BroadcastRecord-BomplLNm.js","/assets/Button-92FC5xya.js","/assets/CatLockNotice-CjwriYds.js","/assets/CategoryLegendModal-DROU0LWt.js","/assets/CellConcerns-BuxNvTT3.js","/assets/CellDetails-B7kru3Ez.js","/assets/CellFormModal-zk1ytU6w.js","/assets/CellIdent-_4qpIRCq.js","/assets/CellLink-BxtaFmfS.js","/assets/Cells-guFxIJiF.js","/assets/ColumnFilter-Dlp4l_mp.js","/assets/ColumnsPicker-iFBDSK0g.js","/assets/CommentsModal-CLthPkuZ.js","/assets/ComparisonTable-D9Joo6lh.js","/assets/Concerns-SlrDtedS.js","/assets/CountStepper-Dr91Vjrw.js","/assets/Daily-DFJ797mp.js","/assets/DataTable-B1OhF-yZ.js","/assets/DateRangePicker-6Cy4H8ux.js","/assets/DayReportView-BPLLKti-.js","/assets/DayStepper-QyQmVXQu.js","/assets/DayStrip-BMeTqSQE.js","/assets/DifferenceBreakdown-DUn3Z1zA.js","/assets/Downtime-DCFahslQ.js","/assets/Education-DkkoOjzf.js","/assets/EducationLesson-D7aJ5Aoa.js","/assets/EmptyState-SDvkbKlv.js","/assets/Exam-D8T0Igsr.js","/assets/FactorySelect-CGC_3ltM.js","/assets/Gamification-Dn-KQ092.js","/assets/GroupBadge-DeCqnDy3.js","/assets/HeatmapChart-Ch9W_07I.js","/assets/IdleCell-CHhj0rzV.js","/assets/KPICard-BTsSXYlC.js","/assets/Kaizen-Ku8ujdHh.js","/assets/Kelish-C_7DPHfR.js","/assets/KpiDeltaCard-CTaebX6J.js","/assets/LangTextInput-C85sqmXA.js","/assets/Layout-dPgoZgw-.js","/assets/LeaderAppeal-BT0Nsm-B.js","/assets/LeaderDayReport-BW-l_SfK.js","/assets/LeaderUnitReport-UdIdIM60.js","/assets/Leaderboard-Sjn2lwwT.js","/assets/Leaders-BTcc9oNq.js","/assets/LeadersKpi-BTKWiKUr.js","/assets/Lightbox-B7D3xuWz.js","/assets/LiveOverview-Br9IaBpK.js","/assets/Login-CrXXRCYx.js","/assets/NotFound-HqXcnP5I.js","/assets/Notifications-CaZhWjQs.js","/assets/Ontime-DteteQQV.js","/assets/Overview-DHW4t4R5.js","/assets/Pagination-BTatabuK.js","/assets/PerenaladkaFactTable-C-03WTUr.js","/assets/PersonCard-Tih4cKgk.js","/assets/PlanFulfillment-Dcsr7q7j.js","/assets/Production-RRxZdCQK.js","/assets/Profile-DnzPo55U.js","/assets/ProofCamera-CHsbHuj8.js","/assets/ProofPhoto-B9kQ4OaT.js","/assets/Quality-X98qcq1G.js","/assets/RawRows-B1X_H9W7.js","/assets/RequestStateChip-BBfJLed8.js","/assets/RichTextEditor-CHRjGDg7.js","/assets/SaveState-Dri546CU.js","/assets/SearchInput-BdF7Ar4m.js","/assets/SeasonalityHeatmap-DxU84H1C.js","/assets/SegmentedToggle-84W1aYP1.js","/assets/SetupTimes-DC8Ay3Py.js","/assets/ShiftDaily-BfTLfpwd.js","/assets/Staff-CT0CyduS.js","/assets/StaffListAtCheck-CQD10cjY.js","/assets/StatusBadge-C5P83bKt.js","/assets/StatusBandsModal-VP4WSHao.js","/assets/TargetGoal-D-eqEGQW.js","/assets/Targets-CIZtg9wm.js","/assets/Tasks-13BKoVIH.js","/assets/TimeWheelPicker-Cl73ixOS.js","/assets/Toast-CwRA1RH1.js","/assets/Tooltip-C4JmA289.js","/assets/TrendChart-BSg8Se8R.js","/assets/TripleSpeedometer-CM-bSGB4.js","/assets/Trudoyomkost-Bz4zVfGi.js","/assets/UploadDropzone-BGxRutaw.js","/assets/UsersActivity-D_-LGfKP.js","/assets/VerdictBlock-CnsSoy3O.js","/assets/VfxApiMap-BOhy6zJ2.js","/assets/VfxDictionaries-BFdo0vjX.js","/assets/VfxEmployees-BspiDaZN.js","/assets/VfxHrMoves-IFzRJs_Y.js","/assets/VfxJobs-snJCDwgx.js","/assets/VfxPhoto-opXQ8l_v.js","/assets/VfxShifts-BTL1Q5BN.js","/assets/VfxState-5tWrs2iU.js","/assets/VfxTimebooks-D9MkCnj7.js","/assets/VfxTimesheet-DKLPgw2W.js","/assets/WatchProgress-DsqyatxJ.js","/assets/WebLogin-CGv2RfaJ.js","/assets/Workers-HKfNHPlk.js","/assets/Zagruzka-CBg_YqJb.js","/assets/ZagruzkaCell-B3oPAVk5.js","/assets/api-C9b9-ucp.js","/assets/archive-3jYDJIxM.js","/assets/archive-restore-DO9p22Wl.js","/assets/arrow-down-DBQzDwZz.js","/assets/arrow-down-right-DaCSe20_.js","/assets/arrow-down-wide-narrow-BznNTFpt.js","/assets/arrow-up-narrow-wide-DRZSzhFD.js","/assets/ban-0MG-8IzM.js","/assets/boxes-B7VVjeEz.js","/assets/braces-BTVgJiMG.js","/assets/brigadirFilters-JA49rFhZ.js","/assets/broadcastTree-DyYaJoXD.js","/assets/building-2-BHkFWWLs.js","/assets/calendar-BUiG9LXT.js","/assets/calendar-days-DITbLpv3.js","/assets/camera-Bcqst99X.js","/assets/categories-C2p6WPlQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-lo4jIlET.js","/assets/chart-line-DTd21tFs.js","/assets/chart-pie-BCDgON6l.js","/assets/chartRange-BFxYy9Ls.js","/assets/check-check-nJtTxBiH.js","/assets/chevron-left-DOmF28ht.js","/assets/chevrons-up-down-BoQfE_Bf.js","/assets/circle-CfYqAfnH.js","/assets/circle-alert-DwgcgoiZ.js","/assets/circle-check-big-D6kGRYlt.js","/assets/circle-dashed-DUS-MR9k.js","/assets/circle-minus-DPddOKit.js","/assets/circle-question-mark-B5qru0yv.js","/assets/circle-slash-CaGgNYAd.js","/assets/circle-user-round-oYJB2nC1.js","/assets/cloud-off-DKQA_f3D.js","/assets/cloud-upload-DnrMTaFm.js","/assets/compass-CCZgFC_j.js","/assets/concernCategories-BR9RYFBa.js","/assets/corner-down-right-Ce3-v4Sk.js","/assets/createLucideIcon-BicLBCh6.js","/assets/es-Cjm6cCXb.js","/assets/external-link-C6JxFh9-.js","/assets/file-clock-DnmJal0E.js","/assets/file-exclamation-point-BdB8wgXA.js","/assets/flag-_LLuBx95.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-B4HgdSP3.js","/assets/funnel-JQ1CYXed.js","/assets/hash-DA8WShcn.js","/assets/hourglass-C6uxn0KD.js","/assets/image-D2hw4Nn6.js","/assets/image-off-DuX4nuM-.js","/assets/inbox-DuAuZY4j.js","/assets/index-C8jkofNq.css","/assets/index-g_wb4cR4.js","/assets/keyboard-CI9qdOKr.js","/assets/languages-D6uKTmTO.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CSlq8Rxm.js","/assets/lightbulb-CM2GcJAv.js","/assets/link-2-iw44nrrX.js","/assets/link-2-off-DuoH-_qb.js","/assets/list-ordered-WMWfMcG_.js","/assets/list-tree-Dggt5-_n.js","/assets/lock-open-BcXE9Wck.js","/assets/log-in--ePI2zHY.js","/assets/marks-BvCCKlid.js","/assets/minimize-2-C330ivlR.js","/assets/package-check-CADLcgzl.js","/assets/pencil-Dxnt3F61.js","/assets/percent-DeZ4upzI.js","/assets/pin-BrzGFrvp.js","/assets/pin-off-DwXrHzou.js","/assets/play-D2S6b-2N.js","/assets/plug-zap-sSzRuntA.js","/assets/prop-types-j3PFd7ko.js","/assets/radio-VrrRRdG0.js","/assets/react-apexcharts.esm-DfZqhkl2.js","/assets/registers-BTPFSmIb.js","/assets/repeat-BpBX1cdX.js","/assets/save-DmYvYpFZ.js","/assets/scopeLinks-CTyxomsA.js","/assets/scroll-text-DP6_I279.js","/assets/search-x-D1zTXsbJ.js","/assets/segments-BvkVi_vr.js","/assets/send-vcmTzVHi.js","/assets/settings-2-COqsIlJj.js","/assets/shield-DglsAJFo.js","/assets/shield-alert-CwEUv8TZ.js","/assets/shield-question-mark-BXbktoSv.js","/assets/sigma-BBMT9drM.js","/assets/siren-Bh57cOye.js","/assets/snowflake-CJdUswo5.js","/assets/split-B1hGd0s9.js","/assets/square-check-big-D8vfVuFo.js","/assets/star-CHZB0Hc7.js","/assets/statusBands-UPrYcjAL.js","/assets/store-DOqXrBib.js","/assets/table-2-DJktH8fo.js","/assets/table-properties-TNZ2Txaw.js","/assets/tag-sw9QMdXo.js","/assets/timer-off-DJcX5g0A.js","/assets/trendBuckets-By8-fjzA.js","/assets/trending-down-DP115kPz.js","/assets/trending-up-kpDdZDpZ.js","/assets/undo-2-Dk7ueN0p.js","/assets/useChartTheme-DlxtFTCe.js","/assets/useElementWidth-BL2zccs2.js","/assets/useIsMobile-CeiclPvu.js","/assets/useOpenParam-Bej1S5_C.js","/assets/useStatusBands-CHh4m6ek.js","/assets/useUrlScope-CUr0PjVk.js","/assets/user-cog-DkjZwl4K.js","/assets/user-minus-DWGGfmMw.js","/assets/user-qdrf0y_m.js","/assets/users-CXbZnIHt.js","/assets/vfx-DCpq6zlx.js","/assets/video-D9aadR7b.js","/assets/wallet-TRgAM_-F.js","/assets/warehouse-Cazn__Io.js","/assets/workflow-CZbq8-FP.js","/assets/x-VDIl7yjr.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
