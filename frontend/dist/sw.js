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

const BUILD = "2026-10-23T07:19:10.096Z";
const PRECACHE = ["/","/assets/AdminPanel-CwNxyd44.js","/assets/AnalysisBoard-CmJw0b3M.js","/assets/Arc-BlbtH5V1.js","/assets/Assistant-B5SM6LDO.js","/assets/BrigadirProfile-DRNnbgx7.js","/assets/BroadcastReceivers-B2LPyocV.js","/assets/BroadcastRecord-BFss3Mt5.js","/assets/Button-B2au7UQu.js","/assets/CatLockNotice-dKAGic0G.js","/assets/CategoryLegendModal-KEGOgofI.js","/assets/CellConcerns-D471z7M7.js","/assets/CellDetails-DiZnxFsT.js","/assets/CellFormModal-B7ahHEr3.js","/assets/CellIdent-C17s_zZN.js","/assets/CellLink-CRSr-zjG.js","/assets/Cells-Cu2KgzEL.js","/assets/ColumnFilter-Dlzi5eGk.js","/assets/ColumnsPicker-CE0Vvare.js","/assets/CommentsModal-C29NT7oD.js","/assets/ComparisonTable-XBLbG1Xk.js","/assets/Concerns-DdMw0G_p.js","/assets/CountStepper-_rBiJjKn.js","/assets/Daily-C0id59AZ.js","/assets/DataTable-B1J_OPYF.js","/assets/DateRangePicker-B4BBfEtb.js","/assets/DayReportView-B41qfYfk.js","/assets/DayStepper-6EKRLd7P.js","/assets/DayStrip-C00qJtlF.js","/assets/DifferenceBreakdown-Bz6TdFBk.js","/assets/Downtime-B9nCIRta.js","/assets/Education-CTz6PsbG.js","/assets/EducationLesson-BZc-_XZF.js","/assets/EmptyState-vISDKAwh.js","/assets/Exam-BME79Dxu.js","/assets/FactorySelect-BaUaaMZy.js","/assets/Gamification-BWQPeWEa.js","/assets/GroupBadge-daXJlEWx.js","/assets/HeatmapChart-DMCFSRpQ.js","/assets/IdleCell-TMO3VFTb.js","/assets/KPICard-CeKqL49X.js","/assets/Kaizen-CO-5LXCn.js","/assets/Kelish-Hj6eMUBP.js","/assets/KpiDeltaCard-CGtZmZQJ.js","/assets/LangTextInput-DlyDsOBn.js","/assets/Layout-DZ39cSq9.js","/assets/LeaderAppeal-CFx6gh0f.js","/assets/LeaderDayReport-C1QxfrF_.js","/assets/LeaderUnitReport-G5BgB2s8.js","/assets/Leaderboard-BLofM-9g.js","/assets/Leaders-BTT2u2eu.js","/assets/LeadersKpi-dd27KIkX.js","/assets/Lightbox-B4iD8t6N.js","/assets/LiveOverview-DCjAhqew.js","/assets/Login-CA1e2yag.js","/assets/NotFound-Bd7hH-f7.js","/assets/Notifications-DnxxPj28.js","/assets/Ontime-DQ0-l3dP.js","/assets/Overview-BDstjbSx.js","/assets/Pagination-1AWVeSOW.js","/assets/PerenaladkaFactTable-m4PsyTLI.js","/assets/PersonCard-cjUEUNFG.js","/assets/PlanFulfillment-DyCCAkZv.js","/assets/Production-veYLNVQs.js","/assets/Profile-dnVZCZ_E.js","/assets/ProofCamera-DQbq2PWf.js","/assets/ProofPhoto-ow_MAm88.js","/assets/Quality--3mGfHHq.js","/assets/RawRows-CFSyMlr1.js","/assets/RequestStateChip-_JpdEgFc.js","/assets/RichTextEditor-CLq3-RD-.js","/assets/SaveState-DB_u5grC.js","/assets/SearchInput-BZAuaH3s.js","/assets/SeasonalityHeatmap-CNNrowWq.js","/assets/SegmentedToggle-BWJ_2HyC.js","/assets/SetupTimes-CCa0nF8N.js","/assets/ShiftDaily-_1Wuk7Lf.js","/assets/Staff-DigOOsLr.js","/assets/StaffListAtCheck-BSTeFzjW.js","/assets/StatusBadge-DIGgUvcH.js","/assets/StatusBandsModal-CDiWxZJb.js","/assets/TargetGoal-qs22nx_Z.js","/assets/Targets-BUiJ3UgR.js","/assets/Tasks-DRurg-xE.js","/assets/TimeWheelPicker-yiZTgXY6.js","/assets/Toast-YmBfD0u_.js","/assets/Tooltip-GXR230gp.js","/assets/TrendChart-qnkso9cr.js","/assets/TripleSpeedometer-0GOLvGlg.js","/assets/Trudoyomkost-CI2ngXZg.js","/assets/UploadDropzone-DE9lf1fr.js","/assets/UsersActivity-Duf4loKT.js","/assets/VerdictBlock-nITp9I0K.js","/assets/VfxApiMap-DSVdR5sM.js","/assets/VfxDictionaries-BE9t5X8y.js","/assets/VfxEmployees-BlVVu2ch.js","/assets/VfxHrMoves-Bb3CzwCL.js","/assets/VfxJobs-81hnv5sA.js","/assets/VfxPhoto-sgmzlG9J.js","/assets/VfxShifts-DUDqrC7N.js","/assets/VfxState-BP0NKvYw.js","/assets/VfxTimebooks-3X2kW9Vx.js","/assets/VfxTimesheet-CJjCSNjC.js","/assets/WatchProgress-DvtnK1TB.js","/assets/WebLogin-CdJP9j5x.js","/assets/Workers-BF4NQuMh.js","/assets/Zagruzka-Cm9VrhbI.js","/assets/ZagruzkaCell-CbNdcXbS.js","/assets/api-B0ugXpe6.js","/assets/archive-Cm8JqRat.js","/assets/archive-restore-Cz0eVGiC.js","/assets/arrow-down-Bori4IcW.js","/assets/arrow-down-right-BO2KXO_C.js","/assets/arrow-down-wide-narrow-DOSFILSH.js","/assets/arrow-up-narrow-wide-DrD2RLwb.js","/assets/ban-rAHWT74E.js","/assets/boxes-DEISoNqG.js","/assets/braces-BRWTWz6S.js","/assets/brigadirFilters-P7Uj1s0e.js","/assets/broadcastTree-Shecse1h.js","/assets/building-2-wFPVhJUI.js","/assets/calendar-days-SKxq7NeS.js","/assets/calendar-veokm-L6.js","/assets/camera-C7eHAmGk.js","/assets/categories-BntnqXLM.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BV0PXsig.js","/assets/chart-line-DfmabZTd.js","/assets/chart-pie-BZb2TPL_.js","/assets/chartRange-CBOYRYCh.js","/assets/check-check-Clv_0q3g.js","/assets/chevron-left-DdVeqzop.js","/assets/chevrons-up-down-CCl5dfVO.js","/assets/circle-DL_TRGOS.js","/assets/circle-alert-fDQ47RfU.js","/assets/circle-check-big-Cw6Wiatg.js","/assets/circle-dashed-D-wetFgR.js","/assets/circle-minus-2RB96uv1.js","/assets/circle-question-mark-BRg3JDGO.js","/assets/circle-slash-D0KsnN6h.js","/assets/circle-user-round-DBqJCvLp.js","/assets/cloud-off-M5H8W40j.js","/assets/cloud-upload-CmwM5zOh.js","/assets/compass-2AA1bGAf.js","/assets/concernCategories-CqrH4HgE.js","/assets/corner-down-right-CPUzgVAH.js","/assets/createLucideIcon-DDtkbgPs.js","/assets/es-m9GsBUt8.js","/assets/external-link-CCpz085f.js","/assets/file-clock-Blrd5HOh.js","/assets/file-exclamation-point-CS7zj8SL.js","/assets/flag-BsZpJiLL.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-eoWTzAqj.js","/assets/funnel-DtA12hln.js","/assets/hash-DlQ535LZ.js","/assets/hourglass-Cyz4S4SR.js","/assets/image-juTGKpKH.js","/assets/image-off-0jLkNIN3.js","/assets/inbox-BCiKYtSW.js","/assets/index-Ct9WqSVA.css","/assets/index-OBYfHAzE.js","/assets/keyboard-IFYktSUz.js","/assets/languages-CfnfpoFM.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CL98cfdW.js","/assets/lightbulb-CG5thmzM.js","/assets/link-2-Bcc74OiL.js","/assets/link-2-off-y9R7Ziha.js","/assets/list-ordered-CYMY6kZ-.js","/assets/list-tree-Dev7PGWB.js","/assets/lock-open-f3rjpJMG.js","/assets/log-in-D9S7suSL.js","/assets/marks-B_9AXx1x.js","/assets/minimize-2-CTVQgFKJ.js","/assets/package-check-BOrfN969.js","/assets/pencil-DMcOWwY3.js","/assets/percent-D2v0SC5f.js","/assets/pin-BwFHK69r.js","/assets/pin-off-Cl5KOH-Z.js","/assets/play-BEn5si62.js","/assets/plug-zap-DPzviuRt.js","/assets/prop-types-BjCMHXbd.js","/assets/radio-C4h7ODoZ.js","/assets/react-apexcharts.esm-DvupYW8d.js","/assets/registers-BjiFSCNN.js","/assets/repeat-Co_2j8Ws.js","/assets/save-Dpx2rd_s.js","/assets/scopeLinks-Bz59C6GF.js","/assets/scroll-text-BYbla0ph.js","/assets/search-x-C55dRBlD.js","/assets/segments-DUfZKdsO.js","/assets/send-CvU8BY38.js","/assets/settings-2-DHQutMMc.js","/assets/shield-Co6NbbVT.js","/assets/shield-alert-HL9g5Hsn.js","/assets/shield-question-mark-Au148KI5.js","/assets/sigma-BdCQQ2lJ.js","/assets/siren-c42wO1eP.js","/assets/snowflake-CGEcYHvW.js","/assets/split-CA75QUYt.js","/assets/square-check-big-OH4TfXcS.js","/assets/star-Bm76A8a9.js","/assets/statusBands-C6Wc-u9P.js","/assets/store-DCSVfRKX.js","/assets/table-2-CnxSghHJ.js","/assets/table-properties-NI1NO-D7.js","/assets/tag-B7dtVoSP.js","/assets/timer-off-C3ASl61F.js","/assets/trendBuckets-DKuEkhze.js","/assets/trending-down-Cik3Bl5k.js","/assets/trending-up-v5_iT9bs.js","/assets/undo-2-Db-4jiHm.js","/assets/useChartTheme-Dxb9xcIA.js","/assets/useElementWidth-CtQLa0ZA.js","/assets/useIsMobile-DR4pkKCT.js","/assets/useOpenParam-BizsntQF.js","/assets/useStatusBands-B-6W-QA6.js","/assets/useUrlScope-BzoOhnru.js","/assets/user-DX-Pql1u.js","/assets/user-cog-C5qTGZZb.js","/assets/user-minus-DYHTZiG4.js","/assets/users-C7A4I6Fo.js","/assets/vfx-C9YyRzUv.js","/assets/video-DPfkgLk8.js","/assets/wallet-BtFhUcAA.js","/assets/warehouse-BQqx6nCQ.js","/assets/workflow-DAjccrG6.js","/assets/x-DZvfIXIx.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
