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

const BUILD = "2026-10-09T09:01:18.925Z";
const PRECACHE = ["/","/assets/AdminPanel-DvPwLYz2.js","/assets/AnalysisBoard-CIPPSieS.js","/assets/Arc-z8ADiaMQ.js","/assets/Assistant-D38zgj7j.js","/assets/BrigadirProfile-BcV66HLq.js","/assets/BroadcastReceivers-CqMSfoXS.js","/assets/BroadcastRecord-l3_H9Rc1.js","/assets/Button-BMO4BNum.js","/assets/CatLockNotice-DN3ZEg9p.js","/assets/CategoryLegendModal-4VPbzNJp.js","/assets/CellConcerns-DKBH8PxG.js","/assets/CellDetails--B8A4uf4.js","/assets/CellFormModal-DC-FKQmw.js","/assets/CellIdent-DpfkSfMX.js","/assets/CellLink-BMihoSQX.js","/assets/Cells-CIUvMQYr.js","/assets/ColumnFilter-CIuGKFxG.js","/assets/ColumnsPicker-CyJgayiN.js","/assets/CommentsModal-BzmLxkDW.js","/assets/ComparisonTable-B-LEWjKT.js","/assets/Concerns-Csix0Cb_.js","/assets/Daily-DCoivxri.js","/assets/DataTable-DcP9-MEf.js","/assets/DateRangePicker-2FyZkVvu.js","/assets/DayReportView-DASANlPd.js","/assets/DayStepper-sWJdL44R.js","/assets/DifferenceBreakdown-Du8KRerw.js","/assets/Downtime-kuZpEDFN.js","/assets/Education-DZY5oqEc.js","/assets/EducationLesson-DMt9prki.js","/assets/EmptyState-BuNtEAyA.js","/assets/Exam-bSOSoor3.js","/assets/FactorySelect-CLG9FY2T.js","/assets/Gamification-N2IK5KeD.js","/assets/GroupBadge-k2Rl6mPT.js","/assets/HeatmapChart-Wh7zRt_P.js","/assets/IdleCell-DllJdmhj.js","/assets/KPICard-C1857Xgt.js","/assets/Kaizen-D6zwWZ0j.js","/assets/Kelish-Dnp0ZzMl.js","/assets/KpiDeltaCard-DPLFXYD_.js","/assets/LangTextInput-DqIX2Zqm.js","/assets/Layout-CPKOBPiM.js","/assets/LeaderAppeal-BvaLh6-f.js","/assets/LeaderDayReport-BBZw0BSJ.js","/assets/LeaderUnitReport-C0wwI6t2.js","/assets/Leaderboard-XUF2X06z.js","/assets/Leaders-BL-685w_.js","/assets/Lightbox-YjO9u2tb.js","/assets/LiveOverview-RnE4mG_5.js","/assets/Login-DuHN79Wn.js","/assets/NotFound-BF_Dqou_.js","/assets/Notifications-QMIYWk6z.js","/assets/Overview-D0h_2peQ.js","/assets/Pagination-D3IVahbt.js","/assets/PerenaladkaFactTable-lGK2MVfH.js","/assets/PersonCard-Dve9nbvq.js","/assets/PlanFulfillment-xSoIVD1b.js","/assets/Production-BP25Mdx6.js","/assets/Profile-C5IeuQxl.js","/assets/ProofCamera-C4NGYtLp.js","/assets/ProofPhoto-Buekvknp.js","/assets/Quality-uleyaM_2.js","/assets/RawRows-NtFUKEPa.js","/assets/RequestStateChip-CQFlMOMx.js","/assets/RichTextEditor-BxBf-BUz.js","/assets/SaveState-BAGngnfN.js","/assets/SearchInput-BLkA7ZRw.js","/assets/SeasonalityHeatmap-DFNtW4dP.js","/assets/SegmentedToggle-B8v_q22q.js","/assets/SetupTimes-Di7x9nAZ.js","/assets/ShiftDaily-Dze1venZ.js","/assets/Staff-WiPbhamS.js","/assets/StatusBadge-Dbpr_biG.js","/assets/TargetGoal-BUkD-k3R.js","/assets/Targets-D65_m9Lf.js","/assets/Tasks-CA_WYNG-.js","/assets/TimeWheelPicker-Dtksrszi.js","/assets/Toast-BvipVlYu.js","/assets/Tooltip-dSRxLUeX.js","/assets/TrendChart-BJjZuyzM.js","/assets/TripleSpeedometer-ComlujKy.js","/assets/Trudoyomkost-CC5P0vmI.js","/assets/Turnover-OFMsLS3h.js","/assets/UploadDropzone-DeaTEeAd.js","/assets/UsersActivity-DL9rUAoF.js","/assets/VerdictBlock-DZGRz6Un.js","/assets/VfxApiMap-B2aSJ-dq.js","/assets/VfxDictionaries-oZ04EGTs.js","/assets/VfxEmployees-DVMGQ2lJ.js","/assets/VfxHrMoves-BWHIb7a3.js","/assets/VfxJobs-CJFl6zhO.js","/assets/VfxPhoto-CAYnTdj5.js","/assets/VfxShifts-CrSNO-rG.js","/assets/VfxState-Dr19Ll-W.js","/assets/VfxTimebooks-C37FVd1s.js","/assets/VfxTimesheet-C8HL1RM8.js","/assets/WatchProgress-DqQJRv7L.js","/assets/WebLogin-CgBHFAL9.js","/assets/WorkerConcerns-CDHiFoVb.js","/assets/Workers-B4pCNAmI.js","/assets/Zagruzka-5lgJd1sp.js","/assets/ZagruzkaCell-BIot07Fv.js","/assets/api-6pAXi0pP.js","/assets/archive-Dyo2UQ4h.js","/assets/archive-restore-BUVCO4Ty.js","/assets/arrow-down-B8hwQmY5.js","/assets/arrow-down-wide-narrow-D7aYM6F8.js","/assets/arrow-up-narrow-wide-DA4t2foU.js","/assets/award-6JXiESI5.js","/assets/ban-BTAwn4R7.js","/assets/boxes-CUgQpoL3.js","/assets/braces-UDQQZYSJ.js","/assets/brigadirFilters-DoRS6VLN.js","/assets/broadcastTree-CFJL4qiA.js","/assets/building-2-qzrVgg8P.js","/assets/calculator-BBfBYqxc.js","/assets/calendar-XpwEpLt3.js","/assets/calendar-days-ogYVdURO.js","/assets/camera-D1ybUWSQ.js","/assets/categories-Crx2_Ho7.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-NAh1qpnN.js","/assets/chart-line-C_hrXYVc.js","/assets/chart-pie---MM6Zcn.js","/assets/chartRange-vFqWsfFz.js","/assets/check-check-Ci4bLceC.js","/assets/chevron-left-L5bk6WVs.js","/assets/chevrons-up-down-C5H8CMi5.js","/assets/circle-CY5ZAnCH.js","/assets/circle-alert-BGXEPoBo.js","/assets/circle-check-big-BWTujY7H.js","/assets/circle-dashed-B3cBgpBz.js","/assets/circle-minus-CN3UN_oZ.js","/assets/circle-question-mark-uIzm3_no.js","/assets/circle-slash-Ci9Pa7yT.js","/assets/circle-user-round-COjuPwjH.js","/assets/clock-3-CZal1YQL.js","/assets/cloud-off-CHhQUr46.js","/assets/cloud-upload-CIE_pl6N.js","/assets/compass-C_zYVZ55.js","/assets/concernCategories-CTvXP4so.js","/assets/copy-CfE3gd0c.js","/assets/corner-down-right-Yix73Gpr.js","/assets/createLucideIcon-DtZyvba1.js","/assets/es-Dk2T7hqs.js","/assets/external-link-RYdWQERx.js","/assets/file-clock-D8QFlEBQ.js","/assets/file-exclamation-point-ZTaD5ix0.js","/assets/flag-Bn0-dnyx.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DIIWICsC.js","/assets/hash-dMs46_sE.js","/assets/hourglass-DnCfxYgR.js","/assets/image-ByDkVcq0.js","/assets/image-off-B7OetPlg.js","/assets/inbox-2augSq_X.js","/assets/index-DFfGVOG_.css","/assets/index-gB3CbWO-.js","/assets/keyboard-Dpf9TFC2.js","/assets/languages-Mxz-xMMN.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CF9GCCP8.js","/assets/lightbulb-4LAxwc76.js","/assets/link-2-CMl7dagg.js","/assets/link-2-off-Bn63Np9c.js","/assets/list-ordered-BCZjAMUY.js","/assets/list-tree-DqDxElN5.js","/assets/lock-open-C6TQ-aFc.js","/assets/log-in-Bts5Xx5u.js","/assets/minimize-2-MyJk-zTU.js","/assets/package-check-B44qPN6V.js","/assets/pencil-BgqBqjMh.js","/assets/percent-CeqZvPcV.js","/assets/pin-Boiv-9J9.js","/assets/pin-off-KuGR79SN.js","/assets/play-IqeXgEa1.js","/assets/plug-zap-CbLAyE0f.js","/assets/prop-types-SMahzO4H.js","/assets/radio-DE00KWUs.js","/assets/react-apexcharts.esm-BMn67L2Q.js","/assets/registers-WFo3m8mc.js","/assets/repeat-BdhveZpo.js","/assets/save-CNOUFX0d.js","/assets/scopeLinks-B_14dgul.js","/assets/scroll-text-DEC3g6vR.js","/assets/search-x-DSjg4iOn.js","/assets/segments-INDYeHiD.js","/assets/send-Di-qdGDc.js","/assets/settings-2-BVtaltk2.js","/assets/shield-2M5q0ETO.js","/assets/shield-alert-D3ax8cec.js","/assets/shield-question-mark-5kSkZBIu.js","/assets/siren-CFxQaDoq.js","/assets/snowflake-CL2M6xWp.js","/assets/split-7YHvfZ34.js","/assets/square-check-big-Djn4oKIR.js","/assets/star-CceJiCmH.js","/assets/statusBands-BbYJdTUv.js","/assets/store-CuOcjY4G.js","/assets/table-2-y6vBDh1v.js","/assets/table-properties-B2PR8SGr.js","/assets/tag-DB_xDQRs.js","/assets/timer-off-E7jsntl4.js","/assets/trending-down-D2VKMXUw.js","/assets/trending-up-BgJ8hfkw.js","/assets/undo-2-BwvBOiUv.js","/assets/useChartTheme-A8q2HFRC.js","/assets/useElementWidth-BRB6wr3J.js","/assets/useIsMobile-DRNaSqdE.js","/assets/useOpenParam-COvi1JzN.js","/assets/useStatusBands-CD1Fzjnm.js","/assets/useUrlScope-Bb_g-ORM.js","/assets/user-bK5qFG49.js","/assets/user-cog-C1zT5oPF.js","/assets/users-D6zsnF3A.js","/assets/vfx-DCtnf364.js","/assets/video-D-57Ynx-.js","/assets/wallet-Cf57tQ_2.js","/assets/warehouse-BTeJ2VD3.js","/assets/x-BTWk4riQ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
