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

const BUILD = "2026-10-05T13:41:47.622Z";
const PRECACHE = ["/","/assets/AdminPanel-Cy5Q8Wxf.js","/assets/AnalysisBoard-DdX7qCZK.js","/assets/Arc-CocJx309.js","/assets/BrigadirProfile-B98LBCEV.js","/assets/BroadcastReceivers-CSXsJ5VG.js","/assets/BroadcastRecord-By6PuSBd.js","/assets/Button-D4-K-5Kx.js","/assets/CatLockNotice-CZk3Mlu_.js","/assets/CategoryLegendModal-C9vBje5k.js","/assets/CellConcerns-Cepe3S9D.js","/assets/CellDetails-CkFIZcwn.js","/assets/CellFormModal-DhrEmlL0.js","/assets/CellIdent-B_eiL6u-.js","/assets/CellLink-D74jr1yH.js","/assets/Cells-Fjs1f0TQ.js","/assets/ColumnFilter-DbW7RSaR.js","/assets/ColumnsPicker-DYGgRyO5.js","/assets/CommentsModal-Z-uFaaPb.js","/assets/ComparisonTable-DS5SOXTf.js","/assets/Concerns-CIzFUN5M.js","/assets/Daily-DltALYAa.js","/assets/DataTable-D-MmI-Cl.js","/assets/DateRangePicker-Dllz74_O.js","/assets/DayReportView-Bu40gWcZ.js","/assets/DayStepper-DS6uV_96.js","/assets/DifferenceBreakdown-BDrLtFfd.js","/assets/Downtime-CJF6e4EM.js","/assets/Education-Bx9dQ2ix.js","/assets/EducationLesson-BYxRKyXw.js","/assets/EmptyState-CI9m4ea6.js","/assets/Exam-BXKwa-CI.js","/assets/FactorySelect-BgVcMKPN.js","/assets/Gamification-gMaaHT4e.js","/assets/GroupBadge-unaqpMFO.js","/assets/HeatmapChart-1H3WbGwL.js","/assets/IdleCell-CZwhS9o5.js","/assets/KPICard-DXsX3nbu.js","/assets/Kaizen-UqxqH8bp.js","/assets/Kelish-D0PGAzWB.js","/assets/KpiDeltaCard-VUW2n907.js","/assets/LangTextInput-CsMzXBhq.js","/assets/Layout-awmAn5BR.js","/assets/LeaderAppeal--us5fTrR.js","/assets/LeaderDayReport-B5JoJF7D.js","/assets/LeaderUnitReport-DPXH_Zbh.js","/assets/Leaderboard-DHl64fDD.js","/assets/Leaders-B2TbUIC0.js","/assets/Lightbox-qwhjxp7S.js","/assets/LiveOverview-BeNWhl5Z.js","/assets/Login-C-CqfW5u.js","/assets/NotFound-CbLDYsPn.js","/assets/Notifications-B6C7edEm.js","/assets/Overview-gAEQHhjX.js","/assets/Pagination-COMKC0Lx.js","/assets/PerenaladkaFactTable-Z3bp56Rh.js","/assets/PersonCard-D8prUeUj.js","/assets/PlanFulfillment-CCMciXle.js","/assets/Production-DRv5UR78.js","/assets/Profile-DGThIAxo.js","/assets/ProofCamera-C9kFlLmY.js","/assets/ProofPhoto-BQwvSg23.js","/assets/Quality-Hzx2a4MO.js","/assets/RawRows-KlBwXUpj.js","/assets/RequestStateChip-PiitKWjW.js","/assets/RichTextEditor-EknlHXqz.js","/assets/SaveState-DsPlZ4It.js","/assets/SearchInput-CGac4htO.js","/assets/SeasonalityHeatmap-CMPhpAlf.js","/assets/SegmentedToggle-BHA0XmeU.js","/assets/SetupTimes-U8kFlCfN.js","/assets/ShiftDaily-Msfm8zTq.js","/assets/Staff-C1CD94A2.js","/assets/StaffLive-Ov3-V4wZ.js","/assets/StatusBadge-Ch0Tukwq.js","/assets/TargetGoal-B0jfgk6A.js","/assets/Targets-DcO7vj-X.js","/assets/Tasks-DJ2Qykkt.js","/assets/TimeWheelPicker-C2894ROH.js","/assets/Toast-aiDUQQdA.js","/assets/Tooltip-CqICyRov.js","/assets/TrendChart-Cxow1EwV.js","/assets/TripleSpeedometer-CLI_DiKS.js","/assets/Trudoyomkost-KNGV6Mym.js","/assets/Turnover-DJLDOawp.js","/assets/UploadDropzone-D14am52V.js","/assets/UsersActivity-DajHavej.js","/assets/VerdictBlock-RUee_TGQ.js","/assets/VfxApiMap-BVkAOzUA.js","/assets/VfxDictionaries-B4NuG3gt.js","/assets/VfxEmployees-DjSjo4-E.js","/assets/VfxHrMoves-BtCZHZSD.js","/assets/VfxJobs-CppqxMJw.js","/assets/VfxPhoto-CJy7KkoX.js","/assets/VfxShifts-Ch4KeN7C.js","/assets/VfxState-B5vTxpb1.js","/assets/VfxTimebooks-DJVcTYa4.js","/assets/VfxTimesheet-ChIv8ZhK.js","/assets/WatchProgress-B940dYrb.js","/assets/WebLogin-B61SIA5t.js","/assets/WorkerConcerns-C2X3DRIx.js","/assets/Workers-DYyhcI2p.js","/assets/Zagruzka-CDJ1rWGz.js","/assets/ZagruzkaCell-DtlEWGBw.js","/assets/api-gayZIg0t.js","/assets/archive-Bhcxyu2g.js","/assets/archive-restore-CMdftvtl.js","/assets/arrow-down-DiReTx7R.js","/assets/arrow-left-DFdjduD7.js","/assets/arrow-up-BTCv6pD1.js","/assets/arrow-up-narrow-wide-Dimyx-wG.js","/assets/arrow-up-right-D9UA9oiR.js","/assets/award-BwOBKdUv.js","/assets/ban-u_wdTsvO.js","/assets/book-open-BAmOGq_q.js","/assets/boxes-meTRwiTf.js","/assets/braces-BJwJyePf.js","/assets/brigadirFilters-1KLAjzPa.js","/assets/broadcastTree-BtFd-T5G.js","/assets/building-2-CxnoGg3T.js","/assets/calculator-DZSukPsZ.js","/assets/calendar-DJP1gNQI.js","/assets/calendar-days-DB2Si5Rw.js","/assets/camera-CqTwnZW1.js","/assets/categories-BciQX5Gb.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CGmCKCts.js","/assets/chart-line-BdOX61av.js","/assets/chart-pie-CIQNU9OX.js","/assets/chartRange-9sh3Xwsw.js","/assets/check-check-CcNRQRk4.js","/assets/chevron-left-Dury5hUR.js","/assets/chevrons-up-down-CGwv9aax.js","/assets/circle-Nr11Cy32.js","/assets/circle-alert-jn5aoiNi.js","/assets/circle-check-big-Bi8g1Xqo.js","/assets/circle-dashed-B7RwPQu-.js","/assets/circle-minus-CdU2uc-t.js","/assets/circle-question-mark-DyoUYL5I.js","/assets/circle-slash-CWCF24I-.js","/assets/circle-user-round-CDUV4Cff.js","/assets/clock-3-3W6Tf9cK.js","/assets/cloud-off-CFkKRyAD.js","/assets/cloud-upload-BHb0UMS-.js","/assets/compass-C0JewVMk.js","/assets/concernCategories-CQBJGvLH.js","/assets/copy-BWC8CCA8.js","/assets/corner-down-right-ByQtUH2z.js","/assets/createLucideIcon-CI5XYsHP.js","/assets/es-aE3vstbW.js","/assets/exportXlsx-DQ2BSfd9.js","/assets/external-link-Di3aZVgp.js","/assets/file-clock-Ba5vjImI.js","/assets/file-exclamation-point-CP4CKnpA.js","/assets/file-spreadsheet-CLOi-eWj.js","/assets/file-text-Day8b_im.js","/assets/flag-D07y-1vW.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BLc-yXbU.js","/assets/hash-4VCl3JVI.js","/assets/history-VMkxnVAj.js","/assets/hourglass-CP9pJ8ag.js","/assets/image-off-wTvMGAYL.js","/assets/image-sdvmjnMU.js","/assets/inbox-Mzg7ZmH3.js","/assets/index-CCQoDNa6.css","/assets/index-DlHzT5CB.js","/assets/key-round-CZsuJvwd.js","/assets/keyboard-BcvscV85.js","/assets/languages-Dk0zS5C-.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CB-Qhugt.js","/assets/lightbulb-BZEnq7ps.js","/assets/link-2-BLyHRUXo.js","/assets/link-2-off-BR_l3JYG.js","/assets/list-ordered-C3PapRBX.js","/assets/list-tree-lrD7l68h.js","/assets/lock-open-DK6e89uU.js","/assets/log-in-BCpDjXgH.js","/assets/maximize-2-UOm-gF21.js","/assets/message-square-C6HDUYNG.js","/assets/minimize-2-CBBAfrmW.js","/assets/package-check-BnVi-NMf.js","/assets/paperclip-CcNvxt9A.js","/assets/pencil--1vmJWpa.js","/assets/percent-B1Xi6gM0.js","/assets/pin-B1W-p9oD.js","/assets/pin-off-De7qyWBv.js","/assets/play-VKUzylnL.js","/assets/plug-zap-Dgxh3L1U.js","/assets/presentation-BTzapHCh.js","/assets/prop-types-BoHpnQqK.js","/assets/radio-DWhcAu_F.js","/assets/react-apexcharts.esm-CtzS865T.js","/assets/registers-C-WtGivm.js","/assets/repeat-5GgHUkUy.js","/assets/rotate-ccw-D7bz_OD2.js","/assets/rotate-cw-DjZMKVBg.js","/assets/save-ns1-uV15.js","/assets/scopeLinks-BPVHAN-j.js","/assets/scroll-text-q6-7rbps.js","/assets/search-x-DNRHmzfW.js","/assets/segments-B3OOPJVk.js","/assets/send-CiXy_gkV.js","/assets/settings-2-C_U8JPc6.js","/assets/shield-DL_tq_mc.js","/assets/shield-alert-DSVD0yZe.js","/assets/shield-check-BWxlxqR6.js","/assets/shield-question-mark-CQpcL8C8.js","/assets/siren-BoeUvSLi.js","/assets/snowflake-CPvWFtQs.js","/assets/split-CXM03vr7.js","/assets/square-C5M1Mytz.js","/assets/square-check-big-BolzgYow.js","/assets/star-Cyq_nPIT.js","/assets/statusBands-DK7aKfs4.js","/assets/store-EQF0lZRW.js","/assets/table-2-BH9tIoAr.js","/assets/table-properties-C61PK1E6.js","/assets/tag-Dv8abita.js","/assets/timer-off-Xo9LAaNZ.js","/assets/trending-down-jygU3To-.js","/assets/trending-up-CP_aE2qm.js","/assets/undo-2-D32L5Evl.js","/assets/useChartTheme-BvybTiVP.js","/assets/useElementWidth-txPSvZhH.js","/assets/useIsMobile-DhJfgzmI.js","/assets/useOpenParam-zHvqa0sy.js","/assets/useStatusBands-DIiS_Qta.js","/assets/useUrlScope-CqSsjSxH.js","/assets/user-DVqNnZwq.js","/assets/user-cog-BflMNWYo.js","/assets/users-BoIBiC07.js","/assets/vfx-DMelR94h.js","/assets/video-BeNAEoYu.js","/assets/wallet-CJL3RMQe.js","/assets/warehouse-Br-q7mp-.js","/assets/x-RQgK8b3d.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
