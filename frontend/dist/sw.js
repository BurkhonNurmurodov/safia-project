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

const BUILD = "2026-10-01T11:24:57.613Z";
const PRECACHE = ["/","/assets/AdminPanel-BZUCSW4f.js","/assets/AnalysisBoard-x0GO5rzu.js","/assets/Arc-BsyA9rie.js","/assets/ArcLegacy-DHOGbdR6.js","/assets/BrigadirProfile-GchREac9.js","/assets/BroadcastReceivers-DiiEXMaH.js","/assets/BroadcastRecord-n-zXwFVM.js","/assets/CatLockNotice-DxtIGH28.js","/assets/CategoryLegendModal-DgVobCyy.js","/assets/CellConcerns-CtDSyj93.js","/assets/CellDetails-CVGow_jI.js","/assets/CellFormModal-CZouXSKv.js","/assets/CellIdent-aiPdbaxs.js","/assets/CellLink-D81kXh8U.js","/assets/Cells-C12Q0iyT.js","/assets/ColumnFilter-DT4ivW7p.js","/assets/ColumnsPicker-Dplsy_3U.js","/assets/CommentsModal-D-MXCybc.js","/assets/ComparisonTable-BG1gw3TC.js","/assets/Concerns-zs7xIKjV.js","/assets/ConfirmDialog-ROkoaFuA.js","/assets/Daily-DTywby-O.js","/assets/DataTable-LYgfVh4k.js","/assets/DateRangePicker-U1YAJfBU.js","/assets/DayReportView-P7hZOQCD.js","/assets/DayStepper-CEAVcLNE.js","/assets/DifferenceBreakdown-DFCfnDaU.js","/assets/Downtime-B3qBqI_1.js","/assets/Education-u4Vbsa3R.js","/assets/EducationLesson-DBICwi_r.js","/assets/EmptyState-yvZK0I1M.js","/assets/Exam-Bz-5zNqU.js","/assets/FactorySelect-_UsMtGoq.js","/assets/Gamification-BtcrwaXy.js","/assets/GroupBadge-5_6tLTmv.js","/assets/HeatmapChart-CabmTp0D.js","/assets/IdleCell-CFSLvDTi.js","/assets/KPICard-DLoJRKN4.js","/assets/Kaizen-BGgUsD9Q.js","/assets/Kelish-Dr4q5cZZ.js","/assets/KpiDeltaCard-Z6rCFjr0.js","/assets/LangTextInput-BHSZh33Z.js","/assets/Layout-Buebz1Po.js","/assets/LeaderAppeal-09GakwoO.js","/assets/LeaderDayReport-C-MaPHLM.js","/assets/LeaderUnitReport-B7X5lGzA.js","/assets/Leaderboard-BPlQfjoA.js","/assets/Leaders-D5t9Cocw.js","/assets/Lightbox-CPaqKrz4.js","/assets/LiveOverview-D6tiz_Rv.js","/assets/Login-BOP2R1gb.js","/assets/NotFound-Cyyf6f1c.js","/assets/Overview-BYK5rWE1.js","/assets/Pagination-BPAcZAFE.js","/assets/PerenaladkaFactTable-cRWWt6B5.js","/assets/PlanFulfillment-3cPX9t_q.js","/assets/Production-DNf52uuk.js","/assets/Profile-Dn3wi7Ah.js","/assets/ProofCamera-CoQFwepS.js","/assets/ProofPhoto-28dnLjKE.js","/assets/Quality-OrswboV9.js","/assets/RequestStateChip-BgVr4Jie.js","/assets/RichTextEditor-CkNfCAXD.js","/assets/SaveState-CSN2d_I3.js","/assets/SearchInput-BzhQSmgT.js","/assets/SeasonalityHeatmap-qycJPBVC.js","/assets/SegmentedToggle-Bes6mWPr.js","/assets/SetupTimes-DMhI55R2.js","/assets/ShiftDaily-BeexryB7.js","/assets/Staff-Roufh97U.js","/assets/StaffLive-BSbI6uWV.js","/assets/StatusBadge-rPPKBLCO.js","/assets/TargetGoal-CQUImg6G.js","/assets/Targets-C5Oz4m5X.js","/assets/Tasks-CYMZhZ50.js","/assets/TimeWheelPicker-C3Br2wb4.js","/assets/Tooltip-COP8Ebee.js","/assets/TrendChart-BYvwLLin.js","/assets/TripleSpeedometer-CXnjhAI7.js","/assets/Trudoyomkost-DShc_gbJ.js","/assets/UploadDropzone-Cg31Pvad.js","/assets/UsersActivity-C_XmTdgm.js","/assets/VerdictBlock-BBUWMxhP.js","/assets/WatchProgress-BEifG0Pa.js","/assets/WebLogin-C42K-IDl.js","/assets/WorkerConcerns-C4MCgPW8.js","/assets/Workers-CbTXGSoi.js","/assets/Zagruzka-iLkqbLJz.js","/assets/ZagruzkaCell-CZIWSPGL.js","/assets/api-Q7LAG_wp.js","/assets/archive-cMfvN0yd.js","/assets/archive-restore-DMNrmOk_.js","/assets/arrow-down-BpcPzf62.js","/assets/arrow-left-98k7Lizm.js","/assets/arrow-left-right-B4h42alN.js","/assets/arrow-right-left-BMUPRUr6.js","/assets/arrow-up-B10UdZGj.js","/assets/arrow-up-narrow-wide-0sono3h_.js","/assets/arrow-up-right-C10qkMFe.js","/assets/award-BcJfsKBj.js","/assets/ban-Cny1LMA1.js","/assets/bot-i9_OiVAR.js","/assets/boxes-OEnFfYP1.js","/assets/brigadirFilters-DhDiDixF.js","/assets/broadcastTree-DIBaIFVa.js","/assets/building-2-B9Fa-a0v.js","/assets/calendar-BFK1KoNe.js","/assets/calendar-clock-FMAqEuUB.js","/assets/calendar-days-DGOFCuaj.js","/assets/calendar-range-z2AclJ8z.js","/assets/camera-B7TG6V9i.js","/assets/categories-BgWO8djb.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B7dpclto.js","/assets/chart-line-CqAGW_Vw.js","/assets/chart-pie-vKTToT38.js","/assets/chartRange-ppLsEsGc.js","/assets/chevron-left-B7AGeCnU.js","/assets/chevrons-up-down-DmGK-QHt.js","/assets/circle-Dh-d2V15.js","/assets/circle-check-big-U6SHcYti.js","/assets/circle-dot-Cskj8FNB.js","/assets/circle-minus-l9UI7Vy3.js","/assets/circle-slash-7hlHgCqp.js","/assets/circle-user-round-CPMO9XTq.js","/assets/cloud-off-BlHdDbEs.js","/assets/cloud-upload-DyMUl9zd.js","/assets/compass-CFkPZalY.js","/assets/concernCategories-CFdws0mh.js","/assets/copy-BczRM87A.js","/assets/corner-down-right-louugD47.js","/assets/createLucideIcon-jGPhhFCk.js","/assets/es-DJKM-Mb9.js","/assets/exportXlsx-DBEo62Qw.js","/assets/external-link-DmlBE6jx.js","/assets/file-clock-tBpvWsvC.js","/assets/file-exclamation-point-Cx6DIPPn.js","/assets/file-spreadsheet-tfnngvMl.js","/assets/file-text-IN5iXxr-.js","/assets/flag-C2ROjmlQ.js","/assets/flame-CGGX56gv.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BkfYiom3.js","/assets/hash-CufOqgRW.js","/assets/history-2G0evHAi.js","/assets/hourglass-CyVwxUeN.js","/assets/id-card-NFkj4Aox.js","/assets/image-B8op1Yly.js","/assets/image-off-90A5AhT3.js","/assets/index-CpcmgZLp.css","/assets/index-Dv_bzPGF.js","/assets/key-round-BmS1ucFb.js","/assets/keyboard-DM6v9VJ2.js","/assets/languages-8bYUtyf6.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Ci7uonH_.js","/assets/lightbulb-BfVbvDz5.js","/assets/link-2-2K2nULoK.js","/assets/link-2-off-Cy3Kba4B.js","/assets/list-checks-CJdwsNXT.js","/assets/list-ordered-C7crjKDS.js","/assets/list-tree-B4XgeXfS.js","/assets/lock-open-5eEjflUu.js","/assets/log-in-D7OLjnwx.js","/assets/maximize-2-YTzna8cK.js","/assets/message-square-rlYapWQd.js","/assets/minimize-2-05k2VZgj.js","/assets/package-check-CQ9yjFI2.js","/assets/paperclip-CP7_njqC.js","/assets/pencil-XSYpeAFA.js","/assets/percent-DMkW-qCo.js","/assets/personName-CogOuS3K.js","/assets/pin-B2Lzh7ut.js","/assets/pin-off-B5atcexg.js","/assets/play-DucjlVcs.js","/assets/plug-zap-D7Lq2Ju3.js","/assets/presentation-Bs3axn1X.js","/assets/prop-types-DWV-8uU5.js","/assets/radio-CAU0RSON.js","/assets/react-apexcharts.esm-Dkrk2Aiz.js","/assets/repeat-CGjQxMlY.js","/assets/rotate-ccw-5JuETDU0.js","/assets/rotate-cw-fcArIiWI.js","/assets/save-BwTmeInU.js","/assets/scale-3fsbYD6b.js","/assets/scopeLinks-BSHmqGRA.js","/assets/scroll-text-DQkeX_7F.js","/assets/search-x-CG1MkjMb.js","/assets/segments-CayexS5b.js","/assets/send-aYLDm7ga.js","/assets/settings-2-Cq8JzC9g.js","/assets/shield-D9IVHkHQ.js","/assets/shield-alert-B42H5XCw.js","/assets/shield-check-C2_C49yY.js","/assets/shield-question-mark-R2lYjr-q.js","/assets/siren-BFHxunmT.js","/assets/snowflake-C2uMhYg5.js","/assets/split-C-lym0q9.js","/assets/square-DJoyOkK5.js","/assets/square-check-big-DPUpsy7E.js","/assets/star-BUIPJMWe.js","/assets/statusBands-C4Ac5ZX1.js","/assets/store-CfgEsPEI.js","/assets/table-2-D4WsBsd9.js","/assets/table-properties-Bd-U2NVj.js","/assets/tag-B3vhKeOk.js","/assets/timer-off-CUENY-Cx.js","/assets/trending-down-C7yk6lLr.js","/assets/trending-up-CHlzf9dW.js","/assets/undo-2-CFwLzaLc.js","/assets/useChartTheme-Cp0rfFfV.js","/assets/useElementWidth-Bu9gbOTu.js","/assets/useIsMobile-Cr97LTAS.js","/assets/useMutation-CK6LjsJd.js","/assets/useStatusBands-Dgoszh5U.js","/assets/useUrlScope-CNFnGqhN.js","/assets/user-cog-CPzfUycn.js","/assets/user-minus-BM4KQEBD.js","/assets/user-rzqZRkq9.js","/assets/users-CWARFaLY.js","/assets/video-RK1opYKC.js","/assets/wallet-CRSHEeZX.js","/assets/warehouse-LshnlBdB.js","/assets/zap-Br0HkmIc.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
