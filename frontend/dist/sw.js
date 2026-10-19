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

const BUILD = "2026-10-19T13:10:40.765Z";
const PRECACHE = ["/","/assets/AdminPanel-Dd_gfS7P.js","/assets/AnalysisBoard-BRPe_-wb.js","/assets/Arc-EHopAShD.js","/assets/Assistant-DUJAd3pp.js","/assets/BrigadirProfile-CHV5MlhP.js","/assets/BroadcastReceivers-CZ9iSc0U.js","/assets/BroadcastRecord-Dv5L9WmY.js","/assets/Button-BChNYVXi.js","/assets/CatLockNotice-BINFN1hQ.js","/assets/CategoryLegendModal-DReJReKZ.js","/assets/CellConcerns-C7hiEqMA.js","/assets/CellDetails-lSB2zNau.js","/assets/CellFormModal-D4nxCjr9.js","/assets/CellIdent-LcrgI5Au.js","/assets/CellLink-D2rTC7Ns.js","/assets/Cells-BHYgm69S.js","/assets/ColumnFilter-D6icbh7A.js","/assets/ColumnsPicker-B3EjNHj0.js","/assets/CommentsModal-DviShsmU.js","/assets/ComparisonTable-DgYwj4YH.js","/assets/Concerns-YndHAUEO.js","/assets/CountStepper-C7NX3wPt.js","/assets/Daily-B7l_ocXF.js","/assets/DataTable-DQFn8J7E.js","/assets/DateRangePicker-Dbd2kody.js","/assets/DayReportView-BZTD2EF-.js","/assets/DayStepper-D230kFpE.js","/assets/DifferenceBreakdown-CbYEeL3f.js","/assets/Downtime-CC9b9VUW.js","/assets/Education-4QARRxxi.js","/assets/EducationLesson-B9plFza_.js","/assets/EmptyState-ByneyG9w.js","/assets/Exam-DmQac7so.js","/assets/FactorySelect-DyUjSjbt.js","/assets/Gamification-Bxw9lPsb.js","/assets/GroupBadge-Cuk_1xWe.js","/assets/HeatmapChart-CH7OigAE.js","/assets/IdleCell-udHGgweY.js","/assets/KPICard-966xmhkl.js","/assets/Kaizen-DNcLr4c0.js","/assets/Kelish-rBbhsPWb.js","/assets/KpiDeltaCard-C4w-YvDc.js","/assets/LangTextInput-DthxxSVJ.js","/assets/Layout-B920HuuJ.js","/assets/LeaderAppeal-CE2x2cCh.js","/assets/LeaderDayReport-76F1Jm1-.js","/assets/LeaderUnitReport-D47z4T5_.js","/assets/Leaderboard-KQOCxbt6.js","/assets/Leaders-C6sI66o5.js","/assets/LeadersKpi-BENRjV-S.js","/assets/Lightbox-Bt8s3PPi.js","/assets/LiveOverview-Dt095apG.js","/assets/Login-DbIuWSko.js","/assets/NotFound-M1ZN7MbX.js","/assets/Notifications-B_tTrMbs.js","/assets/Overview-BN0ba9ro.js","/assets/Pagination-BclMK6SA.js","/assets/PerenaladkaFactTable-CKS1tZuo.js","/assets/PersonCard-2kXKgava.js","/assets/PlanFulfillment-c1dd0x9N.js","/assets/Production-t0WFJ3pP.js","/assets/Profile-NXEOKmNx.js","/assets/ProofCamera-DY1YMSey.js","/assets/ProofPhoto-D_LJUi28.js","/assets/Quality-CH8WeRei.js","/assets/RawRows-BvjwrOcs.js","/assets/RequestStateChip-BUzLTLMy.js","/assets/RichTextEditor-C0NX72RP.js","/assets/SaveState-DiHUbhrv.js","/assets/SearchInput-BGF1SjP4.js","/assets/SeasonalityHeatmap-BixZAkqt.js","/assets/SegmentedToggle-Ctnz0Cnd.js","/assets/SetupTimes-BzdgTpDH.js","/assets/ShiftDaily-B3AimUNB.js","/assets/Staff-BpwPxUGJ.js","/assets/StaffListAtCheck-CCx3pZGQ.js","/assets/StatusBadge-CsroPeVp.js","/assets/TargetGoal-jr4293pV.js","/assets/Targets-CC9fa9y2.js","/assets/Tasks-BBzBn-UW.js","/assets/TimeWheelPicker-DxCzv2ox.js","/assets/Toast-MSJMUvkz.js","/assets/Tooltip-BaWwhJs2.js","/assets/TrendChart--FfclTlC.js","/assets/TripleSpeedometer-B5K9H2FH.js","/assets/Trudoyomkost-Duj8pVKQ.js","/assets/UploadDropzone-B7syVI3L.js","/assets/UsersActivity-CQp5fOtr.js","/assets/VerdictBlock-CM49kkcA.js","/assets/VfxApiMap-DZcwu88O.js","/assets/VfxDictionaries-AX09Lwn2.js","/assets/VfxEmployees-5YamIsFu.js","/assets/VfxHrMoves-Bgslsorq.js","/assets/VfxJobs-BR0Ciu_6.js","/assets/VfxPhoto-DMhVzHmL.js","/assets/VfxShifts-CvB-exx6.js","/assets/VfxState-BcVSznBE.js","/assets/VfxTimebooks-BWnOTUfx.js","/assets/VfxTimesheet-CCvxGYA_.js","/assets/WatchProgress-Bu-a2p-n.js","/assets/WebLogin-58otV51j.js","/assets/Workers-CBwlv3Qd.js","/assets/Zagruzka-CuEcPeUq.js","/assets/ZagruzkaCell-DoHWU0sc.js","/assets/api-Fcwgb5jF.js","/assets/archive-Crw8mbfX.js","/assets/archive-restore-xTtEV-TJ.js","/assets/arrow-down-CR2IFni_.js","/assets/arrow-down-right-CoQs63L8.js","/assets/arrow-down-wide-narrow-Ch5wI4Qe.js","/assets/arrow-up-narrow-wide-swsJO4NI.js","/assets/ban-BOwX0u0I.js","/assets/boxes-CtqHxpBr.js","/assets/braces-CtoAz3I6.js","/assets/brigadirFilters-BmyilPAf.js","/assets/broadcastTree-BrmETi7l.js","/assets/building-2-CWoQ4CVu.js","/assets/calculator-Dbvfo14T.js","/assets/calendar-ExTf0GzH.js","/assets/calendar-days-LLi1RYms.js","/assets/camera-LNUzQbWT.js","/assets/categories-D41OXe_q.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-3L7md8dr.js","/assets/chart-line-BlHyKHRj.js","/assets/chart-pie-CeYSPXSQ.js","/assets/chartRange-BetCiyWx.js","/assets/check-check-DO9IGcQX.js","/assets/chevron-left-Bvy_kHl-.js","/assets/chevrons-up-down-frvNEeF5.js","/assets/circle-alert-DK_53cG9.js","/assets/circle-check-big-CSU5NxoQ.js","/assets/circle-dashed-CcYzSlug.js","/assets/circle-minus-DCPr1DND.js","/assets/circle-question-mark-DiQnOUD1.js","/assets/circle-slash-BQFYfos4.js","/assets/circle-user-round-byXGR839.js","/assets/circle-wWNWgdb3.js","/assets/cloud-off-BBY-DGOh.js","/assets/cloud-upload-ESHjE-1S.js","/assets/compass-CoJ-emv0.js","/assets/concernCategories-CdASdtDl.js","/assets/corner-down-right-CHH4Xy64.js","/assets/createLucideIcon-CVWtzZ2r.js","/assets/es-Co8DkLKu.js","/assets/external-link-DiIaccil.js","/assets/file-clock-AH4ESRBW.js","/assets/file-exclamation-point-Dgl-_7JM.js","/assets/flag-BdF-oxAB.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-DPRsPbAl.js","/assets/funnel-B58nOnLQ.js","/assets/hash-9AAaVslf.js","/assets/hourglass-D99-elDF.js","/assets/image-off-CjLNjs9s.js","/assets/image-rdCVq8CL.js","/assets/inbox-DDMYNyaV.js","/assets/index-C1gmdC3J.js","/assets/index-DemTQruw.css","/assets/keyboard-Cxez5FE0.js","/assets/languages-C1056pAX.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D4TpHM3s.js","/assets/lightbulb-DfkVAjyk.js","/assets/link-2-4Gotkw5E.js","/assets/link-2-off-CsDhA4Gz.js","/assets/list-ordered-NJk2l2mO.js","/assets/list-tree-DrqzDKUI.js","/assets/lock-open-DefVxe6j.js","/assets/log-in-B_T2BuYI.js","/assets/marks-BgP62RBL.js","/assets/minimize-2-BaWOVDQW.js","/assets/package-check-C9q7-SeJ.js","/assets/pencil-DnW6pbh5.js","/assets/percent-Dxn7gpgm.js","/assets/pin-BS9sCmkk.js","/assets/pin-off-CoqMKbDX.js","/assets/play-BuDazr3p.js","/assets/plug-zap-BylcAI5z.js","/assets/prop-types-BUj934lP.js","/assets/radio-B2KLsamL.js","/assets/react-apexcharts.esm-BFfozDyp.js","/assets/registers-CFOpmlD-.js","/assets/repeat-LNKaL_YY.js","/assets/save-DwnYcTUk.js","/assets/scopeLinks-wbGkgwiM.js","/assets/scroll-text-DFGZw2xt.js","/assets/search-x-DwP3WVqU.js","/assets/segments-IvarIUYw.js","/assets/send-B73RdfGU.js","/assets/settings-2-BAzcJLBh.js","/assets/shield-Vuf3l8DF.js","/assets/shield-alert-gk8gzICI.js","/assets/shield-question-mark-Db25Kkcd.js","/assets/siren-C6S51Sin.js","/assets/snowflake-DB3Or_cg.js","/assets/split-c37PxwST.js","/assets/square-check-big-rCUcmGYh.js","/assets/star-7RhjPu8T.js","/assets/statusBands-B1dKNhKS.js","/assets/store-B1MDwH8k.js","/assets/table-2-BaLity-E.js","/assets/table-properties-CCp1n8A8.js","/assets/tag-Ct1Q5xZg.js","/assets/timer-off-Cb7mUKeJ.js","/assets/trending-down-LlPUDCWr.js","/assets/trending-up-BHhd1Pb6.js","/assets/undo-2-u12XS0hS.js","/assets/useChartTheme-CYDUz5BW.js","/assets/useElementWidth-Te8LDgMV.js","/assets/useIsMobile-CLI_tk6F.js","/assets/useOpenParam-w-yOyJ0U.js","/assets/useStatusBands-DKYmpAAI.js","/assets/useUrlScope-BNrUjCjb.js","/assets/user-TQ2ReiVC.js","/assets/user-cog-Bs-8hpg4.js","/assets/user-minus-BPV0uJGM.js","/assets/users-8vi7R6Tt.js","/assets/vfx-Cm3oOszx.js","/assets/video-Ddj3Pc7g.js","/assets/wallet-BEdENhQI.js","/assets/warehouse-B0pOafug.js","/assets/workflow-dFLk9zSm.js","/assets/x-DAUG04ec.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
