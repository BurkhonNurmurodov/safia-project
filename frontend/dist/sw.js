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

const BUILD = "2026-10-12T11:20:22.495Z";
const PRECACHE = ["/","/assets/AdminPanel-BAZq3DbE.js","/assets/AnalysisBoard-DXbBOayz.js","/assets/Arc-xNqbj-9L.js","/assets/Assistant-D9-VTOmQ.js","/assets/BrigadirProfile-oHKG1lby.js","/assets/BroadcastReceivers-DLLGRoRV.js","/assets/BroadcastRecord-B-6WOWYc.js","/assets/Button-DsVS11dP.js","/assets/CatLockNotice-CCHM8K5W.js","/assets/CategoryLegendModal-CtEZPohm.js","/assets/CellConcerns-R6-JzhEB.js","/assets/CellDetails-BIXNtwA6.js","/assets/CellFormModal-Ca6lPV14.js","/assets/CellIdent-CnawfTUk.js","/assets/CellLink-BwaKEmZf.js","/assets/Cells-Cy-Nf6_X.js","/assets/ColumnFilter-SGLqILhX.js","/assets/ColumnsPicker-B_aKR7JS.js","/assets/CommentsModal-ahN7W5pi.js","/assets/ComparisonTable-Bg9RbePm.js","/assets/Concerns-6uCfqWH9.js","/assets/Daily-DtSibIDN.js","/assets/DataTable-BjnexADT.js","/assets/DateRangePicker-dlhPwq-T.js","/assets/DayReportView-DaHOTh9G.js","/assets/DayStepper-3Ke5BtrB.js","/assets/DifferenceBreakdown-DKZa9sV3.js","/assets/Downtime-BdHmBKpb.js","/assets/Education-DpYO2PFw.js","/assets/EducationLesson-3sCENaRy.js","/assets/EmptyState-Bx9mmoZX.js","/assets/Exam-DwqcqTnb.js","/assets/FactorySelect-BlCcl_wF.js","/assets/Gamification-BnU7QAK1.js","/assets/GroupBadge-DZTZf6jd.js","/assets/HeatmapChart-E8t0Dg1v.js","/assets/IdleCell-DcdGiN16.js","/assets/KPICard-DLA7-GxK.js","/assets/Kaizen-CrXFbFBe.js","/assets/Kelish-B6yZr8G_.js","/assets/KpiDeltaCard-BVb_kYHf.js","/assets/LangTextInput-C1AT_0V9.js","/assets/Layout-BOfPo2n8.js","/assets/LeaderAppeal-Dab1qmhg.js","/assets/LeaderDayReport-CCqUPAKj.js","/assets/LeaderUnitReport-BgqGdqmz.js","/assets/Leaderboard-1GaSP-5E.js","/assets/Leaders-Cx5DL8Aq.js","/assets/Lightbox-lWXAzpvH.js","/assets/LiveOverview-6_oojrff.js","/assets/Login-CwyXbRZs.js","/assets/NotFound-gNIcQhTm.js","/assets/Notifications-BkpGhawE.js","/assets/Overview-DIz48xlE.js","/assets/Pagination-BxkAQAqm.js","/assets/PerenaladkaFactTable-Ddro8wBN.js","/assets/PersonCard-CkudX5p5.js","/assets/PlanFulfillment-CMq_TAF0.js","/assets/Production-CwyBcbcN.js","/assets/Profile-B_8tDtwv.js","/assets/ProofCamera-_beaO8I4.js","/assets/Quality-CFpoDVUV.js","/assets/RawRows-Dw20hi6w.js","/assets/RequestStateChip-DafSJW-6.js","/assets/RichTextEditor-CyUF0YfQ.js","/assets/SaveState-BRiINBju.js","/assets/SearchInput-Bd2XV7SS.js","/assets/SeasonalityHeatmap-CH-e15-1.js","/assets/SegmentedToggle-DnBmGA_5.js","/assets/SetupTimes-S8GZOzYr.js","/assets/ShiftDaily-CL4M2OlJ.js","/assets/Staff-CerKBzzS.js","/assets/StaffListAtCheck-h1NQiNbF.js","/assets/StatusBadge-CIMJ23S2.js","/assets/TargetGoal-Du82wWwB.js","/assets/Targets-B8WdKaqG.js","/assets/Tasks-DDT3WY7F.js","/assets/TimeWheelPicker-Ho6k5L8r.js","/assets/Toast-DqhyUJCC.js","/assets/Tooltip-CVQunSJs.js","/assets/TrendChart-JJt4gtL8.js","/assets/TripleSpeedometer-BEr9Hb83.js","/assets/Trudoyomkost-BxTTRHnv.js","/assets/Turnover-wlY9DShL.js","/assets/UploadDropzone-BwFk7g3y.js","/assets/UsersActivity-BknwUed9.js","/assets/VerdictBlock-uFkpKqjQ.js","/assets/VfxApiMap-D1ej-yU5.js","/assets/VfxDictionaries-Dd8WxuAV.js","/assets/VfxEmployees-BZXzozZr.js","/assets/VfxHrMoves-BlDsdLJU.js","/assets/VfxJobs-CWPUvfa0.js","/assets/VfxPhoto-DOmg0G3J.js","/assets/VfxShifts-DZtKxFsC.js","/assets/VfxState-03yX13Jf.js","/assets/VfxTimebooks-BZYa-ZBX.js","/assets/VfxTimesheet-7DBGq2Rr.js","/assets/WatchProgress-VuiU5d8o.js","/assets/WebLogin-DXzRW6mT.js","/assets/WorkerConcerns-D13E3EVw.js","/assets/Workers-BLZ9Kk8W.js","/assets/Zagruzka-Dwl9PZ2y.js","/assets/ZagruzkaCell-D5maghsk.js","/assets/api-Bmb56IyW.js","/assets/archive-DWAA3Jdg.js","/assets/archive-restore-CtkHDxXF.js","/assets/arrow-down-COxXP9IU.js","/assets/arrow-down-wide-narrow-DgN-ztfP.js","/assets/arrow-up-narrow-wide-DTSWdc6z.js","/assets/award-CWIkCZU-.js","/assets/ban-D9b6tOiW.js","/assets/boxes-Bc93bwoG.js","/assets/braces-Dc5bH5Kd.js","/assets/brigadirFilters-CY45RZLe.js","/assets/broadcastTree-CB2sLV5c.js","/assets/building-2-BjttUAMy.js","/assets/calculator-BlwFR5II.js","/assets/calendar-B-Fyn9B7.js","/assets/calendar-days-BeHdpyRE.js","/assets/camera-B7jTcbIn.js","/assets/categories-g54hOD39.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-WHg_xHbW.js","/assets/chart-line-D8TXG8W8.js","/assets/chart-pie-kOk2PVaf.js","/assets/chartRange-Dad-rWSx.js","/assets/check-check-DSAkfx-M.js","/assets/chevron-left-BuWx8zBI.js","/assets/chevrons-up-down-B2zNLX1S.js","/assets/circle-BnhZ3gzx.js","/assets/circle-alert-Df5tdlxj.js","/assets/circle-check-big-Dgx1ztka.js","/assets/circle-dashed-B6T6KqUE.js","/assets/circle-minus-DYSDUQVP.js","/assets/circle-question-mark-a399bXUJ.js","/assets/circle-slash-yUxpA9Us.js","/assets/circle-user-round-Dmu3JOe1.js","/assets/clock-3-CUnYcY7X.js","/assets/cloud-off-4v3zUuyl.js","/assets/cloud-upload-TQZdEKkd.js","/assets/compass-AkXnT154.js","/assets/concernCategories-5y07kTbd.js","/assets/copy-DZPBHyNv.js","/assets/corner-down-right-C547wO3S.js","/assets/createLucideIcon-hzsLSMOv.js","/assets/es-BzHKN39h.js","/assets/external-link-DQ-nc5Ue.js","/assets/file-clock-Dc-uc4nd.js","/assets/file-exclamation-point-BXhLk_b2.js","/assets/flag-bYD41pf0.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-zrU9nafw.js","/assets/hash-CLpFOPfU.js","/assets/hourglass-BB8AVyxH.js","/assets/image-Bm5BZrFA.js","/assets/image-off-pmzSFZWw.js","/assets/inbox-5jPRP5QB.js","/assets/index-CI1cZ1SD.css","/assets/index-DKvYfo0R.js","/assets/keyboard-BUsCBS9c.js","/assets/languages-S2ZGk0S-.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-EtH_T9SZ.js","/assets/lightbulb-BnzadZQJ.js","/assets/link-2-W6lLyetC.js","/assets/link-2-off-Bhj5TuQn.js","/assets/list-ordered-B0C1BZE7.js","/assets/list-tree-CesdRNTe.js","/assets/lock-open-Cc29TISL.js","/assets/log-in-DnbBQh0C.js","/assets/marks-CRGPNWSq.js","/assets/minimize-2-O1p9Yrs-.js","/assets/package-check-DBPm7rsT.js","/assets/pencil-CF6yNKlp.js","/assets/percent-ChMYEOhi.js","/assets/pin-3OKr2jvf.js","/assets/pin-off-DDUJjYYu.js","/assets/play-Bw5f55Am.js","/assets/plug-zap-DRdPykki.js","/assets/prop-types-B3nzfRF0.js","/assets/radio-JsZHFppI.js","/assets/react-apexcharts.esm-CrNSISBf.js","/assets/registers-fRkvBcEY.js","/assets/repeat-DudWBDR-.js","/assets/save-BJ1ur-sW.js","/assets/scopeLinks-DTC21DfQ.js","/assets/scroll-text-BMfTgqSN.js","/assets/search-x-BfcRhPz5.js","/assets/segments-BFMfO2Pr.js","/assets/send-0Fof2Yju.js","/assets/settings-2-BgO7WByN.js","/assets/shield-alert-DwGyE_tx.js","/assets/shield-euO8ueLn.js","/assets/shield-question-mark-s5QdiRG1.js","/assets/siren-CI63WxXx.js","/assets/snowflake-DPkqP5v7.js","/assets/split-C7DUi1hY.js","/assets/square-check-big-CXKWyqJS.js","/assets/star-0aStVqS6.js","/assets/statusBands-CMqHL6Ko.js","/assets/store-SvfM4yVT.js","/assets/table-2-DVcSyUL-.js","/assets/table-properties-CmOcNPLf.js","/assets/tag-BOdd3JqU.js","/assets/timer-off-lrNjjz5v.js","/assets/trending-down-BBmFyXgE.js","/assets/trending-up-673Fb_3s.js","/assets/undo-2-BfqofH2w.js","/assets/useChartTheme-BuT1QZiJ.js","/assets/useElementWidth-DUq-2NzS.js","/assets/useIsMobile-D8BvnUcc.js","/assets/useOpenParam-DMkPfo7e.js","/assets/useStatusBands-DqOs8xY8.js","/assets/useUrlScope-Dy4Wvmf-.js","/assets/user-cog-3qJMVCBp.js","/assets/user-iK5tOOoP.js","/assets/users-Co1geXZ6.js","/assets/vfx-CULEPJTS.js","/assets/video-_oa4O0a5.js","/assets/wallet-DA6D7T_e.js","/assets/warehouse-C4VUCGcf.js","/assets/workflow-CtE3H3OH.js","/assets/x-tgBt5tKD.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
