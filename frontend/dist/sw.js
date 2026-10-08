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

const BUILD = "2026-10-08T04:30:33.204Z";
const PRECACHE = ["/","/assets/AdminPanel-Dc8c2CtI.js","/assets/AnalysisBoard-j9Cqr-91.js","/assets/Arc-BevyXcEw.js","/assets/Assistant-D7p4ZwZ4.js","/assets/BrigadirProfile-1xNsqo_2.js","/assets/BroadcastReceivers-6SHinY1-.js","/assets/BroadcastRecord-s4B_JKbG.js","/assets/Button-BsQM-zy7.js","/assets/CatLockNotice-BFtQAsa9.js","/assets/CategoryLegendModal-DbgkzGPy.js","/assets/CellConcerns-pnBQYu6h.js","/assets/CellDetails-BWFUPtU9.js","/assets/CellFormModal-BcaFfo5d.js","/assets/CellIdent-C40zqANo.js","/assets/CellLink-Wi-5Tz1g.js","/assets/Cells-Bkssp_iR.js","/assets/ColumnFilter-Su4O5NTr.js","/assets/ColumnsPicker-C0sVKIS6.js","/assets/CommentsModal-BmAx_WlN.js","/assets/ComparisonTable-DbomdMug.js","/assets/Concerns-BAFjiuRF.js","/assets/Daily-0gZbL4I1.js","/assets/DataTable-C51leVgB.js","/assets/DateRangePicker-CIr7FUCU.js","/assets/DayReportView-C6m0xI8W.js","/assets/DayStepper-7Tf7fMPh.js","/assets/DifferenceBreakdown-CQHcbQDZ.js","/assets/Downtime-DIjElVKr.js","/assets/Education-DCvUwZFV.js","/assets/EducationLesson-BYqqV7L9.js","/assets/EmptyState-Dmt0DU-3.js","/assets/Exam-zu-I2AI3.js","/assets/FactorySelect-DZAbCIRO.js","/assets/Gamification-CMRkb8ud.js","/assets/GroupBadge-QmWgzLXO.js","/assets/HeatmapChart-JxVaSvpe.js","/assets/IdleCell-CfbBUQQM.js","/assets/KPICard-BpXN2y5D.js","/assets/Kaizen-BgYpSHs0.js","/assets/Kelish-Dlx_mBBD.js","/assets/KpiDeltaCard-BaZH6G_H.js","/assets/LangTextInput-B0MV7Md3.js","/assets/Layout-DU5BBoHg.js","/assets/LeaderAppeal-CyGNvddB.js","/assets/LeaderDayReport-vPEmG3_S.js","/assets/LeaderUnitReport-DnqtOpE-.js","/assets/Leaderboard-SJQM-6Ud.js","/assets/Leaders-DJKos4SG.js","/assets/Lightbox-jbhQMtN9.js","/assets/LiveOverview--8dygrv3.js","/assets/Login-DqQetSyB.js","/assets/NotFound-CdR6hk1O.js","/assets/Notifications-DXr_PPTs.js","/assets/Overview-D7zf6RE2.js","/assets/Pagination-CJgIYXG2.js","/assets/PerenaladkaFactTable-CKmHQ9R1.js","/assets/PersonCard-o_Mf_lYv.js","/assets/PlanFulfillment-B6s3c4tS.js","/assets/Production-sCkRVoV7.js","/assets/Profile-Bxx_UGNC.js","/assets/ProofCamera-512F35BW.js","/assets/ProofPhoto-CI4j04XE.js","/assets/Quality-DenEc7fG.js","/assets/RawRows-DAlW1o4b.js","/assets/RequestStateChip-BcyqkVvZ.js","/assets/RichTextEditor-DQwOc2kd.js","/assets/SaveState--lyXTeFQ.js","/assets/SearchInput-RwgvUcuE.js","/assets/SeasonalityHeatmap-BUSuZ5pC.js","/assets/SegmentedToggle-CTNqUdjq.js","/assets/SetupTimes-DAijB6Sz.js","/assets/ShiftDaily-Cwf41p3r.js","/assets/Staff-DJ0OpqHc.js","/assets/StatusBadge-hl-BsZtQ.js","/assets/TargetGoal-BeQoYVGi.js","/assets/Targets-CaSCZsQT.js","/assets/Tasks-D7PM3o5x.js","/assets/TimeWheelPicker-DKP30aUn.js","/assets/Toast-Cx-K3YQe.js","/assets/Tooltip-Cnzg9y42.js","/assets/TrendChart-CMogUz42.js","/assets/TripleSpeedometer-B50u5Ani.js","/assets/Trudoyomkost-7ooCN-Uc.js","/assets/Turnover-tE1bFXc3.js","/assets/UploadDropzone-DFqep8Dg.js","/assets/UsersActivity-Bd0AbKJP.js","/assets/VerdictBlock-DFpPXfvM.js","/assets/VfxApiMap-6w92z6C4.js","/assets/VfxDictionaries-Bg0MQG6D.js","/assets/VfxEmployees-CJADgYjO.js","/assets/VfxHrMoves-D-If62r7.js","/assets/VfxJobs-DXKZozMu.js","/assets/VfxPhoto-BB4hG4Lx.js","/assets/VfxShifts-DjWJS4fa.js","/assets/VfxState-DmjAHU-x.js","/assets/VfxTimebooks-BtwRIWer.js","/assets/VfxTimesheet-CoiH4YqP.js","/assets/WatchProgress-wKBlygJl.js","/assets/WebLogin-DTPLDuKj.js","/assets/WorkerConcerns-gHIbEDZi.js","/assets/Workers-B60uyBvJ.js","/assets/Zagruzka-ch52-rYg.js","/assets/ZagruzkaCell-nzGWLGF4.js","/assets/api-PInOPVvz.js","/assets/archive-C9c7hwBW.js","/assets/archive-restore-fFLmMuhg.js","/assets/arrow-down-8jLv2UB3.js","/assets/arrow-up-narrow-wide-DvwWBk9X.js","/assets/award-BW23ZEr7.js","/assets/ban-eXY1IFpH.js","/assets/boxes-BMinzfXj.js","/assets/braces-D0og2iu1.js","/assets/brigadirFilters-yZ-ytQOQ.js","/assets/broadcastTree-BaQy1QDw.js","/assets/building-2-BZdSybTy.js","/assets/calculator-BOPlPZtx.js","/assets/calendar-days-DlEdMJNh.js","/assets/calendar-qmvoQjtI.js","/assets/camera-BScgaIdP.js","/assets/categories-CSLpLkQe.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CBkzvA2T.js","/assets/chart-line-LIX6RS0k.js","/assets/chart-pie-CpCpBI1t.js","/assets/chartRange-DIe1WaFd.js","/assets/check-check-D_CA1cvv.js","/assets/chevron-left-CbWzbWCb.js","/assets/chevrons-up-down-DzbF3F6A.js","/assets/circle-Bbbn3MZq.js","/assets/circle-alert-Bgpe2O0c.js","/assets/circle-check-big-Cnomn764.js","/assets/circle-dashed-kmq6_vrc.js","/assets/circle-minus-BNNkQ4IW.js","/assets/circle-question-mark-BVIbVYba.js","/assets/circle-slash-qu-ft9_1.js","/assets/circle-user-round-DAXaEoOs.js","/assets/clock-3-C3mvm5F-.js","/assets/cloud-off-yLJ_3Pn-.js","/assets/cloud-upload-Cu1Ecqmj.js","/assets/compass-Ba7baxrw.js","/assets/concernCategories-Bqtt7HbM.js","/assets/copy-BGJGdR4U.js","/assets/corner-down-right-QALYWAti.js","/assets/createLucideIcon-DQ8LD8gK.js","/assets/es-CH-dcH2o.js","/assets/external-link-DetAawT6.js","/assets/file-clock-Yu_kfiBU.js","/assets/file-exclamation-point-Kl4LjagS.js","/assets/flag-Bial-DqP.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-WkYTi5tn.js","/assets/hash-DmIMauYd.js","/assets/hourglass-gTL06IKG.js","/assets/image-B8QWXbFE.js","/assets/image-off-CM6cVssV.js","/assets/inbox-IbwmSrdz.js","/assets/index-BKkQAnb-.css","/assets/index-LEM5gE4Q.js","/assets/keyboard-D4Ot5n6_.js","/assets/languages-sjMxmB43.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-G7zfBLMY.js","/assets/lightbulb-Bn5UriqU.js","/assets/link-2-COYSUAwB.js","/assets/link-2-off-DjDX3-0d.js","/assets/list-ordered-KJWc4QRn.js","/assets/list-tree-Bo9qq2DC.js","/assets/lock-open-BLPsBieo.js","/assets/log-in-CCZuA2x8.js","/assets/minimize-2-DxJXZfut.js","/assets/package-check-COQo5Wad.js","/assets/pencil-f7SscFjK.js","/assets/percent-fdQlVDlX.js","/assets/pin-B5H4RRef.js","/assets/pin-off-CkCNO4Bz.js","/assets/play-BsR5Afhx.js","/assets/plug-zap-Dvzenlcu.js","/assets/prop-types-CK_6uXGL.js","/assets/radio-D_-ghaqp.js","/assets/react-apexcharts.esm-Cr9Qm3S7.js","/assets/registers-CJHLo5DO.js","/assets/repeat-Dgp8WqIj.js","/assets/save-DpWhzuU2.js","/assets/scopeLinks-BIOPl3v3.js","/assets/scroll-text-BybghTJE.js","/assets/search-x-K9LecKh1.js","/assets/segments-IgPYHoot.js","/assets/send-CmFgYS-k.js","/assets/settings-2-D12RNW5i.js","/assets/shield-alert-Ba68dYUb.js","/assets/shield-o0Bo_GqN.js","/assets/shield-question-mark-C-VTo23Q.js","/assets/siren-Cpd8TPTl.js","/assets/snowflake-CXGR3ysu.js","/assets/split-CIHUT-Nn.js","/assets/square-check-big-CEYOvQI-.js","/assets/star--6_fuo0e.js","/assets/statusBands-DUBs17VH.js","/assets/store-D7hRRq41.js","/assets/table-2-DKKim8EU.js","/assets/table-properties-CVIVKed2.js","/assets/tag-Dl7ZyT6i.js","/assets/timer-off-mW0UnC8z.js","/assets/trending-down-Dqhubuev.js","/assets/trending-up-D0mdpEeF.js","/assets/undo-2-BMH59F2V.js","/assets/useChartTheme-LgwOApBy.js","/assets/useElementWidth-BWtI9CoA.js","/assets/useIsMobile-BkpwckxB.js","/assets/useOpenParam-CJ-Q1wEV.js","/assets/useStatusBands-Q1uclU24.js","/assets/useUrlScope-Bm2QKnLm.js","/assets/user-K4mY354E.js","/assets/user-cog-DjKNoFT_.js","/assets/users-DBksFJlL.js","/assets/vfx-CZtQMjf0.js","/assets/video-DVfgUHA1.js","/assets/wallet-DCcmWD3V.js","/assets/warehouse-Nwk5cIut.js","/assets/x-5q29u1LT.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
