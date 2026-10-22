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

const BUILD = "2026-10-22T04:56:46.686Z";
const PRECACHE = ["/","/assets/AdminPanel-DDp0cnB0.js","/assets/AnalysisBoard-R-57clWh.js","/assets/Arc-C72Tm1SG.js","/assets/Assistant-DST7g76_.js","/assets/BrigadirProfile-Xj2j1zuA.js","/assets/BroadcastReceivers-BNE-az0e.js","/assets/BroadcastRecord-oiB3wliF.js","/assets/Button-D0AczGom.js","/assets/CatLockNotice-D3k7bWxR.js","/assets/CategoryLegendModal-D9wq_gfu.js","/assets/CellConcerns-CVKxk7Jq.js","/assets/CellDetails-vwpbULM8.js","/assets/CellFormModal-DY3mGioS.js","/assets/CellIdent-BuBTdnnq.js","/assets/CellLink-Dqk-DrqW.js","/assets/Cells-DDZPYeVp.js","/assets/ColumnFilter-D6yvGbfp.js","/assets/ColumnsPicker-CsGO2Qat.js","/assets/CommentsModal-D-QXW1R1.js","/assets/ComparisonTable-M9MaAHW1.js","/assets/Concerns-Co1bIab_.js","/assets/CountStepper-9cjyEpFq.js","/assets/Daily-DhUp2Bn0.js","/assets/DataTable-BtSNJhy4.js","/assets/DateRangePicker-BvKbukIs.js","/assets/DayReportView-Dkwegflj.js","/assets/DayStepper-A5Ws5UQR.js","/assets/DayStrip-DRO8hqvn.js","/assets/DifferenceBreakdown-kjJD6Gvx.js","/assets/Downtime-CRo3u_Wq.js","/assets/Education-hF0jHP4r.js","/assets/EducationLesson-BcaYoAj3.js","/assets/EmptyState-CN43zH5Z.js","/assets/Exam-CNXYsE6o.js","/assets/FactorySelect-BYVov-5k.js","/assets/Gamification-BZ1fUEGx.js","/assets/GroupBadge-BE71i3BG.js","/assets/HeatmapChart-AOzIcEjm.js","/assets/IdleCell-BYBzNZ3o.js","/assets/KPICard-DAI1a1UH.js","/assets/Kaizen-CLtCSJRH.js","/assets/Kelish-CwiWQ88N.js","/assets/KpiDeltaCard-D3nxcfS1.js","/assets/LangTextInput-t7bketEA.js","/assets/Layout-Bb1Y6Xuz.js","/assets/LeaderAppeal-CNVGLrcu.js","/assets/LeaderDayReport-p7aQt6ld.js","/assets/LeaderUnitReport-B5NXXd-h.js","/assets/Leaderboard-CqhOOndG.js","/assets/Leaders-M01iWoma.js","/assets/LeadersKpi-Ydtf4c6P.js","/assets/Lightbox-DWAbeOtg.js","/assets/LiveOverview-DyX5em0p.js","/assets/Login-BEod5Don.js","/assets/NotFound-DIzvA1vk.js","/assets/Notifications-DQjXOvaw.js","/assets/Ontime-c-EIXpUK.js","/assets/Overview-CQKm0DvD.js","/assets/Pagination-BgsOcK_l.js","/assets/PerenaladkaFactTable-Bqz_5Z_h.js","/assets/PersonCard-Mz4H8kbs.js","/assets/PlanFulfillment-C1kA-ocW.js","/assets/Production-aUW16SXb.js","/assets/Profile-D3-91tQu.js","/assets/ProofCamera-BI3_kvzw.js","/assets/ProofPhoto-B0Hrdxmf.js","/assets/Quality-pl7tYZrc.js","/assets/RawRows-BtxX99rx.js","/assets/RequestStateChip-C3eZbKti.js","/assets/RichTextEditor-D-795eUB.js","/assets/SaveState-qWpAyDdq.js","/assets/SearchInput-l-Bk0s05.js","/assets/SeasonalityHeatmap-Bv8Rxdqa.js","/assets/SegmentedToggle-DJHvANeI.js","/assets/SetupTimes-cvfkzWgk.js","/assets/ShiftDaily-7yfPFrSt.js","/assets/Staff-CjcLwtcq.js","/assets/StaffListAtCheck-Bvkvuixd.js","/assets/StatusBadge-Bocq8gMd.js","/assets/StatusBandsModal-DPcx9637.js","/assets/TargetGoal-BRThShEn.js","/assets/Targets-DvydBgAD.js","/assets/Tasks-DIu9rvcT.js","/assets/TimeWheelPicker-C771vpsS.js","/assets/Toast-BfrwnYxL.js","/assets/Tooltip-Cs5ih43r.js","/assets/TrendChart-DIxFIZX8.js","/assets/TripleSpeedometer-D-W-oWds.js","/assets/Trudoyomkost-Diu0UFN6.js","/assets/UploadDropzone-BGqvr6KM.js","/assets/UsersActivity-CCg51niX.js","/assets/VerdictBlock-DuPZyfzr.js","/assets/VfxApiMap-DkAAS4CT.js","/assets/VfxDictionaries-CesmuF_s.js","/assets/VfxEmployees-DuPuMMhS.js","/assets/VfxHrMoves-CWemydoT.js","/assets/VfxJobs-BLZ7F-V8.js","/assets/VfxPhoto-M6LRfLmO.js","/assets/VfxShifts-BkYGQDtS.js","/assets/VfxState-DCXbMJSe.js","/assets/VfxTimebooks-BlHMsIW9.js","/assets/VfxTimesheet-Bn7BvDtm.js","/assets/WatchProgress-BxRbTndf.js","/assets/WebLogin-CUJQLEQG.js","/assets/Workers-BFMjQus-.js","/assets/Zagruzka-BT6C7MBt.js","/assets/ZagruzkaCell-DkPK8LMD.js","/assets/api-BAnX5XX9.js","/assets/archive-Bg8m_rA1.js","/assets/archive-restore-BM3aeEQG.js","/assets/arrow-down-Bj4OxbM3.js","/assets/arrow-down-right-C1sYbwF3.js","/assets/arrow-down-wide-narrow-DDEkh7kg.js","/assets/arrow-up-narrow-wide-CDW4bRIr.js","/assets/ban-CAJH3FH2.js","/assets/boxes-9VxH7ZSC.js","/assets/braces-BCqWhJbS.js","/assets/brigadirFilters-6wyU0hmT.js","/assets/broadcastTree-BzQA5Adb.js","/assets/building-2-BNXlXKht.js","/assets/calendar-BD1zIY3O.js","/assets/calendar-days-DbEuT3mJ.js","/assets/camera-BfM8nrHP.js","/assets/categories-0rEa4S6G.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DdY21Tp8.js","/assets/chart-line-KNFKPsZv.js","/assets/chart-pie-BaMFRRDt.js","/assets/chartRange-CBd3r9e4.js","/assets/check-check-D5eAzZ2_.js","/assets/chevron-left-BX05nhED.js","/assets/chevrons-up-down--M9BUYlr.js","/assets/circle-CtUhiPek.js","/assets/circle-alert-BRVB7glQ.js","/assets/circle-check-big-axUN0D5n.js","/assets/circle-dashed-0d2oDIu7.js","/assets/circle-minus-C_iO9tCg.js","/assets/circle-question-mark-wHG65b2f.js","/assets/circle-slash-CZidoK_j.js","/assets/circle-user-round-BX9E147B.js","/assets/cloud-off-CDQFAXOd.js","/assets/cloud-upload-U-YSN7a6.js","/assets/compass-DuQ9se6m.js","/assets/concernCategories-B16sXwbk.js","/assets/corner-down-right-C3DoUy7k.js","/assets/createLucideIcon-D1cVAjbO.js","/assets/es-mPfpKozk.js","/assets/external-link-DdruWH-6.js","/assets/file-clock-Bxo4Slbx.js","/assets/file-exclamation-point-CeSe0fK1.js","/assets/flag-Cx179aAH.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Dk0tMV_B.js","/assets/funnel-DkHKIZBT.js","/assets/hash-DcY2InxJ.js","/assets/hourglass-DFH0xapH.js","/assets/image-DekP-Ax1.js","/assets/image-off-DFS5XZFt.js","/assets/inbox-DxYftbnf.js","/assets/index-CHzvOaG8.js","/assets/index-Ct9WqSVA.css","/assets/keyboard-Cvz5SWUv.js","/assets/languages-DzeT-b32.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Df4SyuEA.js","/assets/lightbulb-BCkVxZPU.js","/assets/link-2-BDPSV06P.js","/assets/link-2-off-DftGeJ6a.js","/assets/list-ordered-CyaGRiQg.js","/assets/list-tree-Cr50F4xY.js","/assets/lock-open-UQeXlTvM.js","/assets/log-in-DjkJCvB8.js","/assets/marks-BW-0wABc.js","/assets/minimize-2-D2dMRa8S.js","/assets/package-check-BARENmKR.js","/assets/pencil-Dx3YFusg.js","/assets/percent-BYaQ6Pzw.js","/assets/pin-C6Ed1Y3D.js","/assets/pin-off-BaDtJXhN.js","/assets/play-BwoYELOa.js","/assets/plug-zap-CJtWWZN0.js","/assets/prop-types-B4tgJNdp.js","/assets/radio-C10KavIb.js","/assets/react-apexcharts.esm-C8jUEIUu.js","/assets/registers-fvDWrnlw.js","/assets/repeat-DtWHeDC3.js","/assets/save-kuVgneAK.js","/assets/scopeLinks-BdeeOVS-.js","/assets/scroll-text-jEgzV01e.js","/assets/search-x-gS6f6t2C.js","/assets/segments-9Uzf_g_N.js","/assets/send-ss4bltBx.js","/assets/settings-2-q5tR6Yie.js","/assets/shield-CX7rsZtU.js","/assets/shield-alert-BGYIRpS5.js","/assets/shield-question-mark-BkgrON9z.js","/assets/sigma-De1t_D5P.js","/assets/siren-CO77xAoJ.js","/assets/snowflake-BjpfUX5t.js","/assets/split-BSrWpkVO.js","/assets/square-check-big-CA0vQlxI.js","/assets/star-D1zVvTrl.js","/assets/statusBands-Bssu9Gsk.js","/assets/store-CUbG8afv.js","/assets/table-2-CWjfoWFK.js","/assets/table-properties-bRIq2VkD.js","/assets/tag-DWfo2Gy5.js","/assets/timer-off-DwYxOj0j.js","/assets/trendBuckets-CGTJ3aES.js","/assets/trending-down-D_0VhMVM.js","/assets/trending-up-6y6rXI7q.js","/assets/undo-2-CYxqhBln.js","/assets/useChartTheme-sN-90Xgl.js","/assets/useElementWidth-BnuQ6PA_.js","/assets/useIsMobile-BPvbuaCV.js","/assets/useOpenParam-CFzsORNi.js","/assets/useStatusBands-DirLaWqi.js","/assets/useUrlScope-CIOhmiCl.js","/assets/user-BKA__ltK.js","/assets/user-cog-BL3b0NNw.js","/assets/user-minus-Qp8QZUO4.js","/assets/users-BvKG7b3b.js","/assets/vfx-DsZYH6Wj.js","/assets/video-C924ZLoT.js","/assets/wallet-Oy9fx82P.js","/assets/warehouse-ChtykPS3.js","/assets/workflow-DMhsy5Rf.js","/assets/x-D-xGMi29.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
