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

const BUILD = "2026-09-30T06:36:01.872Z";
const PRECACHE = ["/","/assets/AdminPanel-Zc4ap12p.js","/assets/AnalysisBoard-DHgCATvP.js","/assets/Arc-C1JGprl_.js","/assets/ArcLegacy-CrrjDMYK.js","/assets/AttendanceModal-Cejm3TxR.js","/assets/BrigadirProfile-B6uU6G4Y.js","/assets/BroadcastReceivers-kLVskM2b.js","/assets/BroadcastRecord-Dw5DxczV.js","/assets/CatLockNotice-BXJ0SqoZ.js","/assets/CategoryLegendModal-DN6R9Zrv.js","/assets/CellConcerns-pMOvCi-Q.js","/assets/CellDetails-m9ragdpz.js","/assets/CellFormModal-DWNyyq2n.js","/assets/CellLink-Bo2vV7hg.js","/assets/Cells-D-4zYRer.js","/assets/ColumnFilter-DXq3V1kR.js","/assets/ColumnsPicker-B70vvFQx.js","/assets/CommentsModal-VKn8WrdG.js","/assets/ComparisonTable-DlcZWD5Y.js","/assets/Concerns-BFmg0IS0.js","/assets/ConfirmDialog-B3s1zCi4.js","/assets/Daily-D91Yp6VC.js","/assets/DataTable-Bap4hGQI.js","/assets/DateRangePicker-CGO_5llv.js","/assets/DayReportView-DDU77vxt.js","/assets/DayStepper-BoEMY8F-.js","/assets/DifferenceBreakdown-D6BiWCF2.js","/assets/Downtime-DL8d3D6v.js","/assets/Education-4BRh7wks.js","/assets/EducationLesson-BWI4r-cV.js","/assets/EmptyState-1R8Mb_MF.js","/assets/Exam-Dh-0gjVg.js","/assets/FactorySelect-eeJtO0rb.js","/assets/Gamification-Zl0gqc_A.js","/assets/GroupBadge-BQUFvZq9.js","/assets/HeatmapChart-D-WqMT8K.js","/assets/IdleCell-CBoyi-sB.js","/assets/KPICard-Dy6omNRW.js","/assets/Kaizen-CPL6M-zZ.js","/assets/Kelish-BNni3C5B.js","/assets/KpiDeltaCard-CcAgWFKB.js","/assets/LangTextInput-CSu0QZjN.js","/assets/Layout-DNMsp0LI.js","/assets/LeaderAppeal-CVnOAQuE.js","/assets/LeaderDayReport-DDtd34yg.js","/assets/LeaderUnitReport-5zgrwr1x.js","/assets/Leaderboard-DdTGG_On.js","/assets/Leaders-BjovSQZV.js","/assets/Lightbox-nuTdozHW.js","/assets/LiveOverview-BzSSohPV.js","/assets/Login-B6Zf9HM-.js","/assets/NotFound-Cp9fkUYa.js","/assets/Overview-DZcqOKaz.js","/assets/Pagination-Lk-pVIwy.js","/assets/PerenaladkaFactTable-OqI9xsFX.js","/assets/PlanFulfillment-CZUaBaJa.js","/assets/Production-JsaTY2UY.js","/assets/Profile-DvbNfsL9.js","/assets/ProofCamera-DifSxCxs.js","/assets/ProofPhoto-BIRi6GpX.js","/assets/Quality-CaVWwFaH.js","/assets/RequestStateChip-DKbGIVa7.js","/assets/RichTextEditor-M6G0Gt-6.js","/assets/SaveState-CunXASQR.js","/assets/SearchInput-DzkWSDWz.js","/assets/SeasonalityHeatmap-nsLScXcj.js","/assets/SegmentedToggle-BPDMK41l.js","/assets/SetupTimes-B1TuGS9P.js","/assets/ShiftDaily-lYRn_oO2.js","/assets/Staff-B6Hny1Mm.js","/assets/StatusBadge-BnrJ_LMz.js","/assets/TargetGoal-DFJHCYrF.js","/assets/Targets-ITBXYFov.js","/assets/Tasks-CVFqyuKD.js","/assets/TimeWheelPicker-DnohgbVs.js","/assets/Tooltip-7uQPKiYZ.js","/assets/TrendChart-DpEJjvAm.js","/assets/TripleSpeedometer-B9H4LLzY.js","/assets/Trudoyomkost-C_blIfns.js","/assets/UploadDropzone--A_qNVk5.js","/assets/UsersActivity-Ba0pimaQ.js","/assets/VerdictBlock-CiBUsHLo.js","/assets/WatchProgress-Ds2-ich7.js","/assets/WebLogin-D_BQqxTj.js","/assets/WorkerConcerns-BE4ETdK4.js","/assets/Workers-CycmgQO5.js","/assets/Zagruzka-DR85gqRM.js","/assets/ZagruzkaCell-7sBy28LO.js","/assets/api-CKT7lilM.js","/assets/archive-petWgtHe.js","/assets/archive-restore-B0DcCCHW.js","/assets/arrow-down-DrKzQ2UB.js","/assets/arrow-left-CKHN3_ZH.js","/assets/arrow-left-right-D_iRGvgZ.js","/assets/arrow-up-DQPZmdLX.js","/assets/arrow-up-narrow-wide-B4YlBjKl.js","/assets/arrow-up-right-DxqeFcmq.js","/assets/award-CtB5HFfB.js","/assets/ban-MDoMtRmU.js","/assets/bot-BFLsSRQE.js","/assets/boxes-Cf3ZB5Lt.js","/assets/brigadirFilters-DRcQp-2-.js","/assets/broadcastTree-Dp-oYAwy.js","/assets/building-2-CIcFNn8W.js","/assets/calendar-C3du1U0j.js","/assets/calendar-clock-D1YXCV7V.js","/assets/calendar-days-BTg_PlMO.js","/assets/calendar-range-BWlX7yZn.js","/assets/camera-CInWG7lp.js","/assets/categories-Cg3_ed-i.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Ck8aSJlC.js","/assets/chart-line-DRkXe4iB.js","/assets/chart-pie-DL_smDo0.js","/assets/chartRange-BAIj66ew.js","/assets/chevron-left-CGqRfX-i.js","/assets/chevrons-up-down-DRVnaTnJ.js","/assets/circle-BgPSqZLG.js","/assets/circle-check-big-DKGAIRjt.js","/assets/circle-dot-CdFM7-rq.js","/assets/circle-minus-Cp04Zy-4.js","/assets/circle-slash-ByZ9x8Ro.js","/assets/circle-user-round-6ekVimLp.js","/assets/cloud-off-CyKJkLk3.js","/assets/cloud-upload-CGQkjpyw.js","/assets/compass-MGtfKM8b.js","/assets/concernCategories-D84eoIXD.js","/assets/copy-DbxohtU0.js","/assets/corner-down-right-B5zTyZLs.js","/assets/createLucideIcon-BoiZc62D.js","/assets/es-B9gH91Zv.js","/assets/exportXlsx-D9scLB_7.js","/assets/external-link-9lzfA8Cj.js","/assets/file-clock-BdCWH0Ze.js","/assets/file-exclamation-point-DXWBbaFQ.js","/assets/file-spreadsheet-B9DE1c9b.js","/assets/file-text-DZYCN_5R.js","/assets/flag-Cr7Y5BPR.js","/assets/flame-CKkAz3EG.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C_5BDlSZ.js","/assets/hash-C267kR5I.js","/assets/history-M9AJx8sB.js","/assets/hourglass-D4t6wUMx.js","/assets/image-COkcM9KH.js","/assets/image-off-CNM-RC0g.js","/assets/index-Bnc-KKbv.css","/assets/index-C-Zzw4xS.js","/assets/key-round-BRnxPEjl.js","/assets/keyboard-D_s69sJl.js","/assets/languages-oBQ--RCb.js","/assets/layers-DpBSNhYf.js","/assets/lightbulb-BE-cT6q0.js","/assets/link-2-CwPBcOzF.js","/assets/link-2-off-Cr_577mK.js","/assets/list-checks-toGipRAg.js","/assets/list-ordered-wgKgDEY5.js","/assets/list-tree-D_tJjclg.js","/assets/lock-open-BchoxGT3.js","/assets/log-in-CtMc3DVi.js","/assets/maximize-2-Bv-U6C1m.js","/assets/message-square-C7K0Iw22.js","/assets/minimize-2-CvMrUJgY.js","/assets/package-check-CID9acxF.js","/assets/paperclip-DdxgysnV.js","/assets/pencil-CWjLqU05.js","/assets/percent-Bw4T96eo.js","/assets/personName-CogOuS3K.js","/assets/pin-BuxXHcBj.js","/assets/pin-off-BwU0YyJd.js","/assets/play-B7kMZQAJ.js","/assets/presentation-CNTnaBGj.js","/assets/prop-types-BRywMx17.js","/assets/radio-DeCB6mWq.js","/assets/react-apexcharts.esm-ZwKDBtpN.js","/assets/repeat-6tydzOct.js","/assets/rotate-ccw-CAbmJcru.js","/assets/rotate-cw-D0CIgcr9.js","/assets/save-DWYWjbHz.js","/assets/scale-DDWCcDeP.js","/assets/scopeLinks-CR0r-0P-.js","/assets/scroll-text-D9XKMfb1.js","/assets/search-x-DYowUBs0.js","/assets/segments-Du-xYUN5.js","/assets/send-ByqsWvFC.js","/assets/settings-2-nNYWShiX.js","/assets/shield-BFre3JgC.js","/assets/shield-alert-CEYy0MY3.js","/assets/shield-check-BmdqmAMG.js","/assets/shield-question-mark-B_ybNrks.js","/assets/siren-B8PEvgNx.js","/assets/snowflake-BpsYtG3M.js","/assets/square-Dk7p6yTJ.js","/assets/square-check-big-DxVKwcUG.js","/assets/star-zXrgE54U.js","/assets/statusBands-DLxDnuQv.js","/assets/store-BXDTXm3u.js","/assets/table-2-Bzr0A1lJ.js","/assets/table-properties-BrzhBBFW.js","/assets/tag-BP033daO.js","/assets/timer-off-BHo3RpFs.js","/assets/trending-down-SGmbR02q.js","/assets/trending-up-CKdUhnsa.js","/assets/undo-2-DoawngiJ.js","/assets/useChartTheme-Yl8V8Ok3.js","/assets/useElementWidth-CBCpJCsf.js","/assets/useIsMobile-DzdVS2hi.js","/assets/useMutation-BqkQ8VX9.js","/assets/useStatusBands-CJWztIoV.js","/assets/useUrlScope-BnBANnp3.js","/assets/user-FB5-inLG.js","/assets/user-cog-BeoC7JQ8.js","/assets/user-minus-DYm9lldh.js","/assets/users-Bat4EJxv.js","/assets/video-MPwV34Cx.js","/assets/wallet-D8AWuVdG.js","/assets/warehouse-BoxNp9m6.js","/assets/zap-IrI4E2ga.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
