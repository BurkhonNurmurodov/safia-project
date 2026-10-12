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

const BUILD = "2026-10-12T10:49:51.900Z";
const PRECACHE = ["/","/assets/AdminPanel-CSA2RMRi.js","/assets/AnalysisBoard-BSClHWYH.js","/assets/Arc-BQtoiIj_.js","/assets/Assistant-Bblh7dmR.js","/assets/BrigadirProfile-K23qrsWD.js","/assets/BroadcastReceivers-OVEG7PKL.js","/assets/BroadcastRecord-B87Zo4_N.js","/assets/Button-C1uAEu4r.js","/assets/CatLockNotice-BCxSMq5B.js","/assets/CategoryLegendModal-B3cFSw0Y.js","/assets/CellConcerns-DXlDkkey.js","/assets/CellDetails-CMfgfapk.js","/assets/CellFormModal-B7Iim_Xb.js","/assets/CellIdent-Bk_PYqjk.js","/assets/CellLink-DkeCJBr-.js","/assets/Cells-C9TfmCVF.js","/assets/ColumnFilter-D3SxK-TC.js","/assets/ColumnsPicker-BG0-_99U.js","/assets/CommentsModal-4crlgHWa.js","/assets/ComparisonTable-iZlwsMVb.js","/assets/Concerns-Bbyx-iRd.js","/assets/Daily-CrB51wYD.js","/assets/DataTable-KX_usReH.js","/assets/DateRangePicker-MG1Ag3YU.js","/assets/DayReportView-DeQYOfOR.js","/assets/DayStepper-B4ToAGRt.js","/assets/DifferenceBreakdown-Csxw8E_p.js","/assets/Downtime-lLFCENZ2.js","/assets/Education-CHSPP9c1.js","/assets/EducationLesson-Cv50f5J5.js","/assets/EmptyState-2l_hI2rD.js","/assets/Exam-D0Ekm8Yz.js","/assets/FactorySelect-BJTcKFMk.js","/assets/Gamification-D3_Qx3Rt.js","/assets/GroupBadge-GeFmg3Ry.js","/assets/HeatmapChart-DvuQQFei.js","/assets/IdleCell-7Gy7Wh-X.js","/assets/KPICard-B-S3SJN_.js","/assets/Kaizen-BSoOyYcv.js","/assets/Kelish-CdfjyBYS.js","/assets/KpiDeltaCard-Be5Ml480.js","/assets/LangTextInput-BHst1aF6.js","/assets/Layout-CW6QEK7O.js","/assets/LeaderAppeal-DbXpYBcE.js","/assets/LeaderDayReport-DHG1mYAs.js","/assets/LeaderUnitReport-BZehWfGm.js","/assets/Leaderboard-B3zH276z.js","/assets/Leaders-CujN3ZIk.js","/assets/Lightbox-bkLndkJ_.js","/assets/LiveOverview-CmVid6Bx.js","/assets/Login-ZdHj4KxG.js","/assets/NotFound-K99lvJ-u.js","/assets/Notifications-B_Yv838q.js","/assets/Overview-yNI8UwBO.js","/assets/Pagination-qwK1IiBc.js","/assets/PerenaladkaFactTable-HL6Ps69F.js","/assets/PersonCard-B0jyqom1.js","/assets/PlanFulfillment-sZAmd9FK.js","/assets/Production-DWRxALaK.js","/assets/Profile-BpPTqBSZ.js","/assets/ProofCamera-CRQVK-Pz.js","/assets/ProofPhoto-Dy6Fl08F.js","/assets/Quality-BWHRg1Qb.js","/assets/RawRows--hfUaGlV.js","/assets/RequestStateChip-6TLOCwf-.js","/assets/RichTextEditor-R4idF8Mx.js","/assets/SaveState-Bo5r_55m.js","/assets/SearchInput-BY2pcn0x.js","/assets/SeasonalityHeatmap-DGhP06G8.js","/assets/SegmentedToggle-uiL49KlK.js","/assets/SetupTimes-Der3igeH.js","/assets/ShiftDaily-CGPPKLYA.js","/assets/Staff-B2rCI1Zl.js","/assets/StatusBadge-e0-ptfcJ.js","/assets/TargetGoal-_MwuynJj.js","/assets/Targets-DH06xwk3.js","/assets/Tasks-CRoyGkR3.js","/assets/TimeWheelPicker-DoJtA60p.js","/assets/Toast-B1oDbOnW.js","/assets/Tooltip-leGVneFV.js","/assets/TrendChart-u_J-FEpa.js","/assets/TripleSpeedometer-BeJp6tTZ.js","/assets/Trudoyomkost-tQkS7byw.js","/assets/Turnover-UaJCCBSu.js","/assets/UploadDropzone-Bbz78S7m.js","/assets/UsersActivity-de3GoqmZ.js","/assets/VerdictBlock-DW3jYtJ7.js","/assets/VfxApiMap-BN9W9GKI.js","/assets/VfxDictionaries-DS9P3YXh.js","/assets/VfxEmployees-DqesXM1X.js","/assets/VfxHrMoves-mJZxrwrY.js","/assets/VfxJobs-C2t1rTSk.js","/assets/VfxPhoto-DrhcOO-T.js","/assets/VfxShifts-CVNDqmol.js","/assets/VfxState-By_2zEzs.js","/assets/VfxTimebooks-CMwF0ynV.js","/assets/VfxTimesheet-DeRtCN4d.js","/assets/WatchProgress-DT4eZIXk.js","/assets/WebLogin-E3S34h5W.js","/assets/WorkerConcerns-Wv3ffWXO.js","/assets/Workers-CXyFAlqG.js","/assets/Zagruzka-D4gBl54E.js","/assets/ZagruzkaCell-Ctb_1D2e.js","/assets/api-B4fM-3Pa.js","/assets/archive-CP-aN6C8.js","/assets/archive-restore-DqrUKM1K.js","/assets/arrow-down-C9hFS1Ph.js","/assets/arrow-down-wide-narrow-BFwQFXpW.js","/assets/arrow-up-narrow-wide-CSFbLuz3.js","/assets/award-U343J3jH.js","/assets/ban-D6WYj6Rx.js","/assets/boxes-BuqAR3MP.js","/assets/braces-irBfzTV7.js","/assets/brigadirFilters-BX390m2Q.js","/assets/broadcastTree-Bo8PcySV.js","/assets/building-2-Cn9YIzjT.js","/assets/calculator-CAOa84bq.js","/assets/calendar-BLRoQr9n.js","/assets/calendar-days-YPavvBMp.js","/assets/camera-CoyO1G3n.js","/assets/categories-u2fkNitI.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-HYF_r9Nc.js","/assets/chart-line-BHEv4eB9.js","/assets/chart-pie-DN5A4KzL.js","/assets/chartRange-DWw4d2Ga.js","/assets/check-check-Balbt-l2.js","/assets/chevron-left-DHK7o7KZ.js","/assets/chevrons-up-down-DW1HRe3G.js","/assets/circle-CaYuFo4c.js","/assets/circle-alert-BjDRlo5h.js","/assets/circle-check-big-BmbVZC9e.js","/assets/circle-dashed-BWfYR7Wy.js","/assets/circle-minus-DrdetBai.js","/assets/circle-question-mark-BGzMnpq_.js","/assets/circle-slash-pxkZXC5B.js","/assets/circle-user-round-Cnk8cFSG.js","/assets/clock-3-Cn07bW3U.js","/assets/cloud-off-BSBmhjHF.js","/assets/cloud-upload-Dccg7xIE.js","/assets/compass-DqNaAyRQ.js","/assets/concernCategories-B7E_0rVd.js","/assets/copy-CYFHBibx.js","/assets/corner-down-right-C7KZyTUD.js","/assets/createLucideIcon-BewHpdre.js","/assets/es-Doa-7kze.js","/assets/external-link-C0hbjAvV.js","/assets/file-clock-C0pbvxZu.js","/assets/file-exclamation-point-CTl1yY2K.js","/assets/flag-B667--_p.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-3H37L11u.js","/assets/hash-qo5VlYsh.js","/assets/hourglass-xZtD6KbY.js","/assets/image-HEXkyHRc.js","/assets/image-off-BLnQHpOk.js","/assets/inbox-DhyBGXTk.js","/assets/index-BOQAIyUS.js","/assets/index-CI1cZ1SD.css","/assets/keyboard-cTBsetsQ.js","/assets/languages-aqHixF8l.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-ZXdz5AIv.js","/assets/lightbulb-VRzVg6g4.js","/assets/link-2-CCwijauV.js","/assets/link-2-off-CHRRUEPq.js","/assets/list-ordered-CnUDsLhZ.js","/assets/list-tree-D9NJ4Z9Q.js","/assets/lock-open-LXF8AvHP.js","/assets/log-in-DNm2p4pU.js","/assets/minimize-2-Db2g3fH0.js","/assets/package-check-tE4WpeOk.js","/assets/pencil-DcYF-pYx.js","/assets/percent-zxZVmCWA.js","/assets/pin-C2APvhyn.js","/assets/pin-off-D3o9a8RG.js","/assets/play-DQEvQwx0.js","/assets/plug-zap-BXE7Dgt2.js","/assets/prop-types-5jc16tIH.js","/assets/radio-BJ0-ad60.js","/assets/react-apexcharts.esm-gUhkZfO2.js","/assets/registers-BFupMsnq.js","/assets/repeat-DT-7DzRW.js","/assets/save-CtFosFj3.js","/assets/scopeLinks-4AzM-7SU.js","/assets/scroll-text-C30UhNwf.js","/assets/search-x-C9PApUp3.js","/assets/segments-BlCX1Uci.js","/assets/send-DtQPqBcB.js","/assets/settings-2-BVZCdi0u.js","/assets/shield-D-NXx0fw.js","/assets/shield-alert-BvrJrtq_.js","/assets/shield-question-mark-CpC_d4Nb.js","/assets/siren-C5OhGiIe.js","/assets/snowflake-D327rWaq.js","/assets/split-BBbNd4vy.js","/assets/square-check-big-CPVL3PYr.js","/assets/star-Cf9ucVSV.js","/assets/statusBands-CTkMRkgq.js","/assets/store-CvDIcVow.js","/assets/table-2-5uRJ2k-N.js","/assets/table-properties-B_AjGnML.js","/assets/tag-B-1XEjKz.js","/assets/timer-off-DqDtPAl7.js","/assets/trending-down-DhLgfNOw.js","/assets/trending-up-x_mK-D9m.js","/assets/undo-2-dyjFPENa.js","/assets/useChartTheme-B_GyI73j.js","/assets/useElementWidth-BCjqPYHB.js","/assets/useIsMobile-BqjJl1XI.js","/assets/useOpenParam-BQo0t1Jd.js","/assets/useStatusBands-DP8QAZMv.js","/assets/useUrlScope-BXOi1Nk0.js","/assets/user-cog-I6QYj7TA.js","/assets/user-vtQ4xU2b.js","/assets/users-CtlWDIj7.js","/assets/vfx-C5XZMC1b.js","/assets/video-BACMwAgH.js","/assets/wallet-CFwg9Pmj.js","/assets/warehouse-1443FKly.js","/assets/workflow-Ci-ZCFW-.js","/assets/x-CnqYBtG3.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
