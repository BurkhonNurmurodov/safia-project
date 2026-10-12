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

const BUILD = "2026-10-12T11:19:48.346Z";
const PRECACHE = ["/","/assets/AdminPanel-CXG1Ez6e.js","/assets/AnalysisBoard-2S_DmtRy.js","/assets/Arc-J3heKNhp.js","/assets/Assistant-CFzBlFnQ.js","/assets/BrigadirProfile-CndguWZL.js","/assets/BroadcastReceivers-Dyl0J-8k.js","/assets/BroadcastRecord-Cih80yW1.js","/assets/Button-JplXmldz.js","/assets/CatLockNotice-Bslzb1Rg.js","/assets/CategoryLegendModal-U3dcA8Ll.js","/assets/CellConcerns-C3Z7-1Zx.js","/assets/CellDetails-_nlLfMS1.js","/assets/CellFormModal-Cz59RkKe.js","/assets/CellIdent-dD5qm5m2.js","/assets/CellLink-hm041hK8.js","/assets/Cells-D09lhl2Y.js","/assets/ColumnFilter-CpgvPfsN.js","/assets/ColumnsPicker-DlxMXsEU.js","/assets/CommentsModal-DcboicRP.js","/assets/ComparisonTable-DMx2Ahp3.js","/assets/Concerns-DQfG5vs_.js","/assets/Daily-BuJuUTaj.js","/assets/DataTable-C02FHGH0.js","/assets/DateRangePicker-DYG0NkWf.js","/assets/DayReportView-BAj5gUMn.js","/assets/DayStepper-Dqv9WdHq.js","/assets/DifferenceBreakdown-DK5t00vp.js","/assets/Downtime-DUUTGrbQ.js","/assets/Education-DV76411D.js","/assets/EducationLesson-iKKkiool.js","/assets/EmptyState-Cmv-Ym4p.js","/assets/Exam-v2V39lfd.js","/assets/FactorySelect-MuGReWB0.js","/assets/Gamification-bdUCs_cS.js","/assets/GroupBadge-CyOlslsJ.js","/assets/HeatmapChart-DP7PBBnJ.js","/assets/IdleCell-Dvckpis7.js","/assets/KPICard-DaLQjssz.js","/assets/Kaizen-cq_mrk-2.js","/assets/Kelish-BBgB-nUY.js","/assets/KpiDeltaCard-DX7Kx9vd.js","/assets/LangTextInput-Du8FPbWw.js","/assets/Layout-RlcLkPmp.js","/assets/LeaderAppeal-DhJxMDQa.js","/assets/LeaderDayReport-BslRprfn.js","/assets/LeaderUnitReport-Bj4Z4aBf.js","/assets/Leaderboard-DONfR5xM.js","/assets/Leaders-DjpY-QAT.js","/assets/Lightbox-HnoGeJPL.js","/assets/LiveOverview-Bj_VGW82.js","/assets/Login-C5x6CYCH.js","/assets/NotFound-Dl-mEmf-.js","/assets/Notifications-C2DfxLum.js","/assets/Overview-CArvD2OG.js","/assets/Pagination-CczoEJ7g.js","/assets/PerenaladkaFactTable-NzS3cvn0.js","/assets/PersonCard-BqX0w-f7.js","/assets/PlanFulfillment-BCVOgcK8.js","/assets/Production-RjP9Q5xk.js","/assets/Profile-CxBTpq1R.js","/assets/ProofCamera-BEDrCczc.js","/assets/Quality-CcIiPt2D.js","/assets/RawRows-CAe4-3WC.js","/assets/RequestStateChip-Cy4Qu_ts.js","/assets/RichTextEditor-NGF73X5x.js","/assets/SaveState-DdoKDwyL.js","/assets/SearchInput-DKLktYOY.js","/assets/SeasonalityHeatmap-Ba_B4PMP.js","/assets/SegmentedToggle-BjfYalqr.js","/assets/SetupTimes-DNN6CNMe.js","/assets/ShiftDaily-CYPCIS_l.js","/assets/Staff-CPraHe0a.js","/assets/StaffListAtCheck-CtiFt-hU.js","/assets/StatusBadge-BoA-FYYi.js","/assets/TargetGoal-MbvRumpT.js","/assets/Targets-CIUf9sqG.js","/assets/Tasks-DRI2oKu_.js","/assets/TimeWheelPicker-CpIBx199.js","/assets/Toast-C5sSi-wN.js","/assets/Tooltip-DsoIdOLt.js","/assets/TrendChart-DjcQB407.js","/assets/TripleSpeedometer-B2XsFYqe.js","/assets/Trudoyomkost-BjbnOoC9.js","/assets/Turnover-DEWv-eeW.js","/assets/UploadDropzone-BCcbGzcu.js","/assets/UsersActivity-DwvLG7WA.js","/assets/VerdictBlock-C8-fl_63.js","/assets/VfxApiMap-C8Jj9f26.js","/assets/VfxDictionaries-aJv8EVg4.js","/assets/VfxEmployees-BUqJydcH.js","/assets/VfxHrMoves-DsbpNFSG.js","/assets/VfxJobs-l6VckEZf.js","/assets/VfxPhoto-DNuZiLta.js","/assets/VfxShifts-Cy-KNrnu.js","/assets/VfxState-BNcqwcgV.js","/assets/VfxTimebooks-D4gSJPVN.js","/assets/VfxTimesheet-7qgDYT_z.js","/assets/WatchProgress-iSXnZ56a.js","/assets/WebLogin-DZUEYGBT.js","/assets/WorkerConcerns-B1r9u4aI.js","/assets/Workers-Cz2JyFkw.js","/assets/Zagruzka-DWUI5uIT.js","/assets/ZagruzkaCell-DBMZbyKB.js","/assets/api-BuOd0dRz.js","/assets/archive-Bj5fBEsX.js","/assets/archive-restore-4G8kLc5h.js","/assets/arrow-down-CBGEpV3c.js","/assets/arrow-down-wide-narrow-CRz73OU2.js","/assets/arrow-up-narrow-wide-CR0DIrSJ.js","/assets/award-gAVtPE6w.js","/assets/ban-B3-NVW8Y.js","/assets/boxes-CTkv_ab-.js","/assets/braces-7B3H1B-u.js","/assets/brigadirFilters-D64_T5KS.js","/assets/broadcastTree-DXiS6ool.js","/assets/building-2-BicOs75z.js","/assets/calculator-CPuTTt4v.js","/assets/calendar-days-FgRgly8x.js","/assets/calendar-efnpGLUb.js","/assets/camera-S6jtc2El.js","/assets/categories-CcO6Hja_.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-1wYoBKdy.js","/assets/chart-line-bXaWuoe7.js","/assets/chart-pie-0-RU4ZoU.js","/assets/chartRange-Dm4iJ0qG.js","/assets/check-check-B1t2oLjS.js","/assets/chevron-left-DHGrQNc5.js","/assets/chevrons-up-down-BU4-9bNI.js","/assets/circle-COu26DAU.js","/assets/circle-alert-yvKMRWPM.js","/assets/circle-check-big-CVIrpQUO.js","/assets/circle-dashed-CCEAicet.js","/assets/circle-minus-C1iypIcQ.js","/assets/circle-question-mark-DwgZIBfo.js","/assets/circle-slash-Cc3JjIMe.js","/assets/circle-user-round-D1U2Hc1f.js","/assets/clock-3-CbvrlPWG.js","/assets/cloud-off-8KuJ1i2Z.js","/assets/cloud-upload-BFDw9hu9.js","/assets/compass-CxundsUL.js","/assets/concernCategories-CNilwVhL.js","/assets/copy-WExv2l8S.js","/assets/corner-down-right-DhIsbcuc.js","/assets/createLucideIcon-CAxbG32C.js","/assets/es-BszXq0MJ.js","/assets/external-link-DC0HkIva.js","/assets/file-clock-C80Gv2yo.js","/assets/file-exclamation-point-IxiUffKO.js","/assets/flag-DP2xYjcf.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-9POMB03F.js","/assets/hash-m3oG10iS.js","/assets/hourglass-Bkggj32_.js","/assets/image-Bxv8OaG5.js","/assets/image-off-DQb6Wmtl.js","/assets/inbox-eb_6E0Il.js","/assets/index-BVOvhKop.js","/assets/index-CI1cZ1SD.css","/assets/keyboard-ADSIn4a5.js","/assets/languages-D9dP4MJ8.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-TrBMcTpm.js","/assets/lightbulb-D9kwx2XN.js","/assets/link-2-B_YUGvDc.js","/assets/link-2-off-CZQTY769.js","/assets/list-ordered-CwZbDWex.js","/assets/list-tree-BxvmMRFE.js","/assets/lock-open-C6eCUcRj.js","/assets/log-in-CsWmPm9L.js","/assets/marks-BccbpgDK.js","/assets/minimize-2-D6K3pX7E.js","/assets/package-check-BV-eoSue.js","/assets/pencil-D0qUK83y.js","/assets/percent-xvf6_bt5.js","/assets/pin-ChyuV8Jx.js","/assets/pin-off-CTJjQqPF.js","/assets/play-QacEqpmp.js","/assets/plug-zap-BJSNferr.js","/assets/prop-types-CAg2sFoo.js","/assets/radio-BhkZNTuW.js","/assets/react-apexcharts.esm-Bbfh1J71.js","/assets/registers-B2YQjh4G.js","/assets/repeat-16jDIKpN.js","/assets/save-D8oixahk.js","/assets/scopeLinks-BZiHqFKD.js","/assets/scroll-text-Dq4J1A_n.js","/assets/search-x-z1TuwqUp.js","/assets/segments-DOV3d2Ua.js","/assets/send-DrqW22gG.js","/assets/settings-2-DR4rUF3b.js","/assets/shield-Cg-CrWk9.js","/assets/shield-alert-I02GBl3G.js","/assets/shield-question-mark-DnfAkNAI.js","/assets/siren-DduS6P4m.js","/assets/snowflake-wlig3JL4.js","/assets/split-CQPzDGQt.js","/assets/square-check-big-D2AqoEoK.js","/assets/star-CdKlx61G.js","/assets/statusBands-DsJUAh-d.js","/assets/store-CRHWIBIJ.js","/assets/table-2-Co0wtsDn.js","/assets/table-properties-DIm5vCAR.js","/assets/tag-Qxn-Qdm_.js","/assets/timer-off-DbMYE-Re.js","/assets/trending-down-7eEKl0Fb.js","/assets/trending-up-D9sWC0qj.js","/assets/undo-2-WfPIL9vQ.js","/assets/useChartTheme-BGMQUKfQ.js","/assets/useElementWidth-D2kjd2Ro.js","/assets/useIsMobile-mgfPbUHa.js","/assets/useOpenParam-BQQdzfKh.js","/assets/useStatusBands-DO7Gp67M.js","/assets/useUrlScope-85cC6Mv2.js","/assets/user-Ci0f7Zkz.js","/assets/user-cog-CjJD89dM.js","/assets/users-D1nm5ToE.js","/assets/vfx-CvVJE27d.js","/assets/video-D-N2kHCi.js","/assets/wallet-Cil36eZa.js","/assets/warehouse-Cl0d9BeN.js","/assets/workflow-D0VxCWPI.js","/assets/x-CqxSMGdA.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
