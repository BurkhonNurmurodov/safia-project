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

const BUILD = "2026-10-07T06:22:33.672Z";
const PRECACHE = ["/","/assets/AdminPanel-BafCK5kI.js","/assets/AnalysisBoard-BEx1fQ_R.js","/assets/Arc-KFGc7tJa.js","/assets/Assistant-JYP1WPLj.js","/assets/BrigadirProfile-CdoiY0Mk.js","/assets/BroadcastReceivers-DnqJ-5mY.js","/assets/BroadcastRecord-CAGG3_L2.js","/assets/Button-DYl675Ae.js","/assets/CatLockNotice-Ba2-ZHrE.js","/assets/CategoryLegendModal-D523TeMO.js","/assets/CellConcerns-LC4U-Wa2.js","/assets/CellDetails-CIElhFID.js","/assets/CellFormModal-B6DY4xq0.js","/assets/CellIdent-DDRoHB8R.js","/assets/CellLink-DynZidi2.js","/assets/Cells-PCNMaeTb.js","/assets/ColumnFilter-Bj_CJNKj.js","/assets/ColumnsPicker-CjBCAtvN.js","/assets/CommentsModal-C_A8WhWv.js","/assets/ComparisonTable-Ca6U-0ag.js","/assets/Concerns-CEgxoK25.js","/assets/Daily-d6e1Mxhw.js","/assets/DataTable-rZ_yvsMj.js","/assets/DateRangePicker-B7NvJJAq.js","/assets/DayReportView-CYIJAkV1.js","/assets/DayStepper-Dk0rgAMR.js","/assets/DifferenceBreakdown-DdK28e7j.js","/assets/Downtime-CeoK60-_.js","/assets/Education-C2Ul6K5x.js","/assets/EducationLesson-Cort_Iny.js","/assets/EmptyState-CVptysc0.js","/assets/Exam-B2hdQJ6C.js","/assets/FactorySelect-DSgQYkIy.js","/assets/Gamification-9KtZTBjG.js","/assets/GroupBadge-DQ_wYC4h.js","/assets/HeatmapChart-w57OLXM_.js","/assets/IdleCell-pp3b-nHM.js","/assets/KPICard-B3kEfc2Y.js","/assets/Kaizen-B6UZUXrj.js","/assets/Kelish-C0oOFO2r.js","/assets/KpiDeltaCard-DQ2kGakg.js","/assets/LangTextInput-DH3WT0LE.js","/assets/Layout-DEvbGgJB.js","/assets/LeaderAppeal-CRDAmVwE.js","/assets/LeaderDayReport-TMor-ypx.js","/assets/LeaderUnitReport-CjELv4Nh.js","/assets/Leaderboard-R_RVwGos.js","/assets/Leaders-BBXrY3Zd.js","/assets/Lightbox-DhVOvFdY.js","/assets/LiveOverview-DLp6KNYY.js","/assets/Login-CvKChfEf.js","/assets/NotFound-DLoxmv_i.js","/assets/Notifications-BCdujeJq.js","/assets/Overview-CmN_hNmO.js","/assets/Pagination-Om_zpmOq.js","/assets/PerenaladkaFactTable-BIfKODgp.js","/assets/PersonCard-CVvcIG4P.js","/assets/PlanFulfillment-DAcuGttL.js","/assets/Production-siCZvBvA.js","/assets/Profile-tDwvoGjE.js","/assets/ProofCamera-p83MHG48.js","/assets/ProofPhoto-DnEbLRh_.js","/assets/Quality-CFZEKr5C.js","/assets/RawRows-y_hxgt6D.js","/assets/RequestStateChip-VQL62jSD.js","/assets/RichTextEditor-qXVF_EaI.js","/assets/SaveState-Df88Xoxb.js","/assets/SearchInput-DTSy4qpZ.js","/assets/SeasonalityHeatmap-DwN5dbWx.js","/assets/SegmentedToggle-URe24nL9.js","/assets/SetupTimes-CgkLDdXk.js","/assets/ShiftDaily-B8v4-6od.js","/assets/Staff-B9MSDEfL.js","/assets/StatusBadge-9JIYRf18.js","/assets/TargetGoal-CRO9cVUb.js","/assets/Targets-UtDB2nH0.js","/assets/Tasks-DFailJFi.js","/assets/TimeWheelPicker-DcWmHMOA.js","/assets/Toast-CoEkBq_N.js","/assets/Tooltip-PDxWgFUS.js","/assets/TrendChart-DyDQ8DZN.js","/assets/TripleSpeedometer-D2G1oJ5m.js","/assets/Trudoyomkost-2kLSMC04.js","/assets/Turnover-pn-fiZkn.js","/assets/UploadDropzone-CS0XDx97.js","/assets/UsersActivity-Cm_x0HgC.js","/assets/VerdictBlock-B7V4oSsa.js","/assets/VfxApiMap-DUF4Yron.js","/assets/VfxDictionaries-Bcmt35eB.js","/assets/VfxEmployees-BP3HeF1N.js","/assets/VfxHrMoves-DjcdcRrQ.js","/assets/VfxJobs-_kOKSTm6.js","/assets/VfxPhoto-CCApZHyJ.js","/assets/VfxShifts-DBNYBqAC.js","/assets/VfxState-B4KNUh-u.js","/assets/VfxTimebooks-C5G21_FC.js","/assets/VfxTimesheet-D_kxVIuU.js","/assets/WatchProgress-B_ORAewE.js","/assets/WebLogin-B2ynxqTV.js","/assets/WorkerConcerns-DVM8sS4V.js","/assets/Workers-DkEvs0nn.js","/assets/Zagruzka-L3pDPlfe.js","/assets/ZagruzkaCell-48J6NTGD.js","/assets/api-DR4VLgZe.js","/assets/archive-BCaQraZM.js","/assets/archive-restore-Bx5BNkwf.js","/assets/arrow-down-DLTZKuSb.js","/assets/arrow-up-narrow-wide-BqfCFG46.js","/assets/award-BdXV_08z.js","/assets/ban-DgKHoXDA.js","/assets/boxes-DnwQEhPA.js","/assets/braces-mPSmevuD.js","/assets/brigadirFilters-Dq8TnCUC.js","/assets/broadcastTree-B5dMDvVH.js","/assets/building-2-Bu5TNZx0.js","/assets/calculator-RrOWdNM0.js","/assets/calendar-DlkcV5sV.js","/assets/calendar-days-BmFf8WzL.js","/assets/camera-9xOqaHW-.js","/assets/categories-2nz7RA8S.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DX0xnLRJ.js","/assets/chart-line-B5qQ2kk2.js","/assets/chart-pie-Ba3Z4Eng.js","/assets/chartRange-9caM0M-i.js","/assets/check-check-ChiU8n36.js","/assets/chevron-left-9CvFXs18.js","/assets/chevrons-up-down-DTEgvTnX.js","/assets/circle-alert-CkEGR4w5.js","/assets/circle-check-big-CCYnP3At.js","/assets/circle-dashed-DSlfabPu.js","/assets/circle-minus-B4TGO9vc.js","/assets/circle-nxfiBA1q.js","/assets/circle-question-mark-DFIxzTF_.js","/assets/circle-slash-B9fVi4e2.js","/assets/circle-user-round-CJef3Qlc.js","/assets/clock-3-BbrH2xZn.js","/assets/cloud-off-_7_vIW7l.js","/assets/cloud-upload-CI7Mi64-.js","/assets/compass-sWfZjA7C.js","/assets/concernCategories-COpVNTFN.js","/assets/copy-DtMG0GWH.js","/assets/corner-down-right-34MJtlLF.js","/assets/createLucideIcon-DmNftE_W.js","/assets/es-DUjLJXUF.js","/assets/external-link-CL1vwEpp.js","/assets/file-clock-BZ-EBNBB.js","/assets/file-exclamation-point-CQoU_fWa.js","/assets/flag-D9MEjo0-.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BLEQfs05.js","/assets/hash-Byd4ZSLI.js","/assets/hourglass-C8uQi4d6.js","/assets/image-DVx87l33.js","/assets/image-off-DPcK1OXv.js","/assets/inbox-Do2ce1Tz.js","/assets/index-B7yzqq84.css","/assets/index-Bc5EKmnV.js","/assets/keyboard-CkH7TwcU.js","/assets/languages-DUf7Sb2S.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BezyrLIM.js","/assets/lightbulb-CUE5euV8.js","/assets/link-2-Dp6_DJ1c.js","/assets/link-2-off-BopDvBMs.js","/assets/list-ordered-BE9ZO6kA.js","/assets/list-tree-CGMVMYry.js","/assets/lock-open-2lqkzR0k.js","/assets/log-in-JbeHmd2s.js","/assets/minimize-2-B-lm2JFm.js","/assets/package-check-DFrko0iq.js","/assets/pencil-oj6u5Ia1.js","/assets/percent-BZKGaCxY.js","/assets/pin-CV5ec72o.js","/assets/pin-off-HOuXf1Dj.js","/assets/play-BgsP-vep.js","/assets/plug-zap-CcecBX2B.js","/assets/prop-types-C779FmLu.js","/assets/radio-CMLCbB5J.js","/assets/react-apexcharts.esm-C285CYjC.js","/assets/registers-DUzOuDpZ.js","/assets/repeat-DRNdsU0T.js","/assets/save-D1HErrsS.js","/assets/scopeLinks-Caqy0Z2j.js","/assets/scroll-text--ewRSzep.js","/assets/search-x-ikc0Px8_.js","/assets/segments-DtwW07fF.js","/assets/send-DyKoSA5t.js","/assets/settings-2-CfHc2zqk.js","/assets/shield-YoqMyo9w.js","/assets/shield-alert-DoKDlA8e.js","/assets/shield-question-mark-DGCS3V8P.js","/assets/siren-CrAXWfhx.js","/assets/snowflake-Cs2ACq1w.js","/assets/split-D8x0sRmn.js","/assets/square-check-big-DyYsFpGG.js","/assets/star-Bbgn2BXK.js","/assets/statusBands-DVVQUoUK.js","/assets/store-Bs18UJ_v.js","/assets/table-2-YrZqVNyP.js","/assets/table-properties-BFaU7K1x.js","/assets/tag-C8_r02dY.js","/assets/timer-off-kDcA5cJg.js","/assets/trending-down-CgtnyqxT.js","/assets/trending-up-B2YZmQn-.js","/assets/undo-2-CnbYwdrI.js","/assets/useChartTheme-CBFCG0F8.js","/assets/useElementWidth-DLunSqv4.js","/assets/useIsMobile-DooWc8bN.js","/assets/useOpenParam-TA3OdIAl.js","/assets/useStatusBands-DSfYZaGC.js","/assets/useUrlScope-BONYgEnU.js","/assets/user-DGcgLulS.js","/assets/user-cog-Cr3HpgZ5.js","/assets/users-CBbFa0lN.js","/assets/vfx-BPLAarxK.js","/assets/video-HtdvhrK3.js","/assets/wallet-DA2-wPRG.js","/assets/warehouse-BWk_Jju7.js","/assets/x-DERr8rMO.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
