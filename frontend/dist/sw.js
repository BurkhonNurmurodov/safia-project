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

const BUILD = "2026-10-05T08:19:52.311Z";
const PRECACHE = ["/","/assets/AdminPanel-jAHt-ux7.js","/assets/AnalysisBoard-CCaXIteq.js","/assets/Arc-BCYeSF9Y.js","/assets/ArcLegacy-C_rWR_sb.js","/assets/BrigadirProfile-TcmtheTk.js","/assets/BroadcastReceivers-Dp-MGR7u.js","/assets/BroadcastRecord-Cjkmg9UE.js","/assets/Button-wKXZ1Oun.js","/assets/CatLockNotice-BcRVyizQ.js","/assets/CategoryLegendModal-BVZ3KXSa.js","/assets/CellConcerns-Cr2JGIHJ.js","/assets/CellDetails-x-oDKQRW.js","/assets/CellFormModal-CDlVfxmo.js","/assets/CellIdent-wOFTAlI1.js","/assets/CellLink-Ud3VoUYk.js","/assets/Cells-BZ-sFBEV.js","/assets/ColumnFilter-DOH4oyyX.js","/assets/ColumnsPicker-20wlyL-w.js","/assets/CommentsModal-BknjCPPV.js","/assets/ComparisonTable-C9B7DeYd.js","/assets/Concerns-B_J7SNQY.js","/assets/Daily-9J9177ol.js","/assets/DataTable-B1noBOSZ.js","/assets/DateRangePicker-C-8tSPEX.js","/assets/DayReportView-BONScTRr.js","/assets/DayStepper-DF_-cehN.js","/assets/DifferenceBreakdown-B-au0aM_.js","/assets/Downtime-ByteIDSi.js","/assets/Education-DIEjOwne.js","/assets/EducationLesson-DEAH1t8v.js","/assets/EmptyState-BhhXu_Uf.js","/assets/Exam-CgDjXcg4.js","/assets/FactorySelect-BSewUztq.js","/assets/Gamification-DpzNYr8B.js","/assets/GroupBadge-B-PdEvbY.js","/assets/HeatmapChart-Cze4rQPc.js","/assets/IdleCell-BU_A3X1S.js","/assets/KPICard-NljPN9l5.js","/assets/Kaizen-Ca03OnR6.js","/assets/Kelish-DpIZ5sdZ.js","/assets/KpiDeltaCard-n-t4BEwY.js","/assets/LangTextInput-DM70Al-P.js","/assets/Layout-Dj4w7LxF.js","/assets/LeaderAppeal-w_v4XNsv.js","/assets/LeaderDayReport-BP44mDKj.js","/assets/LeaderUnitReport-CrPNzmrG.js","/assets/Leaderboard-BMNVEJDz.js","/assets/Leaders-B49vhuPF.js","/assets/Lightbox-DC4BjrmJ.js","/assets/LiveOverview-CmfUa9mh.js","/assets/Login-BBXB4hEt.js","/assets/NotFound-cIUqSSdf.js","/assets/Notifications-BsBEOQqE.js","/assets/Overview-BRzDJ8eW.js","/assets/Pagination-fsJarHHT.js","/assets/PerenaladkaFactTable-BsOEdZWP.js","/assets/PersonCard-C_iKsJh6.js","/assets/PlanFulfillment-CrgX-_1t.js","/assets/Production-DD2HJGfQ.js","/assets/Profile-D9cKgn2s.js","/assets/ProofCamera-B9y6bbwm.js","/assets/ProofPhoto-DR3dbK1q.js","/assets/Quality-GZv5hVY-.js","/assets/RawRows-Bqxrtc52.js","/assets/RequestStateChip-Bdcg4LJF.js","/assets/RichTextEditor-CjoWIX_b.js","/assets/SaveState-TRpxpNyu.js","/assets/SearchInput-ajoHKdLW.js","/assets/SeasonalityHeatmap-mm3CVSdF.js","/assets/SegmentedToggle-2xFAV5GB.js","/assets/SetupTimes-UZTjlLDh.js","/assets/ShiftDaily-CnNYZdhd.js","/assets/Staff-a0Gs_-Mu.js","/assets/StaffLive-BQFn8wZs.js","/assets/StatusBadge-nI0MKlRK.js","/assets/TargetGoal-DQW3Qg_Q.js","/assets/Targets-BnA9IDm4.js","/assets/Tasks-BsDUaVgU.js","/assets/TimeWheelPicker-Ci96rYhm.js","/assets/Toast-pG88jepF.js","/assets/Tooltip-BMyQbpKs.js","/assets/TrendChart-D3VSH7hj.js","/assets/TripleSpeedometer-B7qxk7qO.js","/assets/Trudoyomkost-CaXCAV-a.js","/assets/Turnover-CSy_X50f.js","/assets/UploadDropzone-CZBB-ABM.js","/assets/UsersActivity-CBt8M3ra.js","/assets/VerdictBlock-BLb4Sg3b.js","/assets/VfxApiMap-7tSNOFdg.js","/assets/VfxDictionaries-BXR_xrgu.js","/assets/VfxEmployees-Fe4bpOs5.js","/assets/VfxHrMoves-DNHQJZ_C.js","/assets/VfxJobs-CmdI1vb1.js","/assets/VfxPhoto-C2KCaM_g.js","/assets/VfxShifts-a1DaCC5z.js","/assets/VfxState-CgQgR2GD.js","/assets/VfxTimebooks-CHCUkxoX.js","/assets/VfxTimesheet-Cbtzwg5-.js","/assets/WatchProgress-DQEmvl0X.js","/assets/WebLogin-gSr6kgQS.js","/assets/WorkerConcerns-BUW_I8dr.js","/assets/Workers-PBqRI8Lp.js","/assets/Zagruzka-G4wzj7Ns.js","/assets/ZagruzkaCell-DPd3Dx4A.js","/assets/api-0SxXHHUY.js","/assets/archive-SJ19Es7D.js","/assets/archive-restore-BIDcP9li.js","/assets/arrow-down-Ci4tMxKd.js","/assets/arrow-left-ms46uMo3.js","/assets/arrow-up-BccbD4Em.js","/assets/arrow-up-narrow-wide-1aw__agE.js","/assets/arrow-up-right-EeIW6PE5.js","/assets/award-DBJ_ypyQ.js","/assets/ban-B9GaFDQD.js","/assets/book-open-qBq1Wfzw.js","/assets/bot-DaqTW-C8.js","/assets/boxes-eiMFCs8f.js","/assets/braces-DDcNKCmW.js","/assets/brigadirFilters-DIfvyuiy.js","/assets/broadcastTree-Bs4H7hdN.js","/assets/building-2-eLcS2N0T.js","/assets/calculator-B7-emw7K.js","/assets/calendar-ChUfDYSd.js","/assets/calendar-days-BSmD6mQl.js","/assets/camera-IVRk5dyx.js","/assets/categories-D3UDB2ud.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BZUmrR62.js","/assets/chart-line-CQ8uRTxv.js","/assets/chart-pie-CahNjA0j.js","/assets/chartRange-Cg9LJEoo.js","/assets/check-check-D35OGq8G.js","/assets/chevron-left-CGPbHF3k.js","/assets/chevrons-up-down-CtKKQzj3.js","/assets/circle-BS2ObzBK.js","/assets/circle-alert-DMiy_8-Y.js","/assets/circle-check-big-BDHCPPsn.js","/assets/circle-dashed-Di7Rwl7V.js","/assets/circle-minus-kWsrm_c5.js","/assets/circle-question-mark-CMTVpc0o.js","/assets/circle-slash-ijJ01RPo.js","/assets/circle-user-round-Lxl4ebFi.js","/assets/clock-3--wPT5lHi.js","/assets/cloud-off-Dy3fKw3v.js","/assets/cloud-upload-BrRy0Z2n.js","/assets/compass-CQoExJfl.js","/assets/concernCategories-BDTjOLE5.js","/assets/copy-DRINwW3Z.js","/assets/corner-down-right-Bip_okGU.js","/assets/createLucideIcon-BeSN2Jie.js","/assets/es-CBrJl4Za.js","/assets/exportXlsx-CUPmFenq.js","/assets/external-link-Dtf-Et80.js","/assets/file-clock-Dlexj8cV.js","/assets/file-exclamation-point-DFzP9F_P.js","/assets/file-spreadsheet-DXmqv-b4.js","/assets/file-text-FL2aXg2q.js","/assets/flag-B1nIF7JE.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-cyqWIluI.js","/assets/hash-C9lSvWJx.js","/assets/history-BSfriWzi.js","/assets/hourglass-BA7YPDEJ.js","/assets/image-BQDOtHZA.js","/assets/image-off-ChOtws8g.js","/assets/inbox-B_RmDh3W.js","/assets/index-BarTLmz_.css","/assets/index-CUrGbjVI.js","/assets/key-round-C0Wq4gO1.js","/assets/keyboard-GqdqTWG6.js","/assets/languages-BC3OoDkt.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Bs_8qR3t.js","/assets/lightbulb-xqLBkjjA.js","/assets/link-2-DVUqxteH.js","/assets/link-2-off-ClSH6fpI.js","/assets/list-ordered-D8yhQFGE.js","/assets/list-tree-JbhBGqu5.js","/assets/lock-open-BlY5K337.js","/assets/log-in-QAem-VVn.js","/assets/maximize-2-C8uABISs.js","/assets/message-square-B7MgU2rT.js","/assets/minimize-2-M_cVsetS.js","/assets/package-check-BLix05Jg.js","/assets/paperclip-DV3ud9GR.js","/assets/pencil-C7l0mgRw.js","/assets/percent-EKizDQVB.js","/assets/pin-C3STQzn_.js","/assets/pin-off-De41lUS_.js","/assets/play-B4aYue6W.js","/assets/plug-zap-iUlGuE-t.js","/assets/presentation-C-Fny5yQ.js","/assets/prop-types-Bjy_SZtk.js","/assets/radio-aiS2Y9_4.js","/assets/react-apexcharts.esm-CT5v5wOF.js","/assets/registers-qEK_nREq.js","/assets/repeat-CJX0UtKu.js","/assets/rotate-ccw-DvMDSNGJ.js","/assets/rotate-cw-jGf51gqm.js","/assets/save-DTswfMYE.js","/assets/scopeLinks-imalxo6f.js","/assets/scroll-text-BwXINxYd.js","/assets/search-x-DDkH_YYD.js","/assets/segments-BVs_CCiw.js","/assets/send-CFB8s0SD.js","/assets/settings-2-B943A-Ny.js","/assets/shield-BICGX1JZ.js","/assets/shield-alert-CgDMhrvr.js","/assets/shield-check-D8S5eF2q.js","/assets/shield-question-mark-1qK7yh_z.js","/assets/siren-Be5UbVI4.js","/assets/snowflake-DdTPSYtq.js","/assets/split-IPqDSE0N.js","/assets/square-Bk-cSvG0.js","/assets/square-check-big-Baj8z7hV.js","/assets/star-DMC_m2WC.js","/assets/statusBands-BbveBeeV.js","/assets/store-CoKtKDFO.js","/assets/table-2-Dnv5sCpM.js","/assets/table-properties-kN5Beb1g.js","/assets/tag-C5thQh0m.js","/assets/timer-off-Cg3fAeL7.js","/assets/trending-down-BGO7s7s-.js","/assets/trending-up-BrF2nRpI.js","/assets/undo-2-NKeBq6lN.js","/assets/useChartTheme-Cfz5cFO1.js","/assets/useElementWidth-G2i__b3t.js","/assets/useIsMobile-1E68tviK.js","/assets/useOpenParam-Bk6AVKLo.js","/assets/useStatusBands-Dh-wnWdF.js","/assets/useUrlScope-Dr9Lw4ni.js","/assets/user-cog-zTKDr-Zt.js","/assets/user-ft9Yc7AK.js","/assets/users-BD0PQVy5.js","/assets/vfx-Bj_MlD1l.js","/assets/video-IbZFnen3.js","/assets/wallet-Bry6vApG.js","/assets/warehouse-DHHr8Rt2.js","/assets/x-AEW8rxd_.js","/assets/zap-BRW0anbU.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
