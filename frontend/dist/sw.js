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

const BUILD = "2026-10-29T06:40:36.857Z";
const PRECACHE = ["/","/assets/AdminPanel-D3FGIbYa.js","/assets/AnalysisBoard-CR-ezeta.js","/assets/Arc-vt6UCo-S.js","/assets/Assistant-DAE1aS48.js","/assets/BrigadirProfile-Bip7ddf-.js","/assets/BroadcastReceivers-AHhYZIbp.js","/assets/BroadcastRecord-CbjSpvOO.js","/assets/Button-irJtf810.js","/assets/CatLockNotice-dwe0j0rn.js","/assets/CategoryLegendModal-zWETlz1Z.js","/assets/CellConcerns-CCL8Pzcl.js","/assets/CellDetails-DPLQDcn8.js","/assets/CellFormModal-DYK8hpbP.js","/assets/CellIdent-D6yeTa-i.js","/assets/CellLink-QgSFgY2B.js","/assets/Cells-BJsdwpxX.js","/assets/ColumnFilter-Bv1kR3fg.js","/assets/ColumnsPicker-ghxJ4OUM.js","/assets/CommentsModal-B1GA4pZA.js","/assets/ComparisonTable-CcuzDMiv.js","/assets/Concerns-Cc-dDR-6.js","/assets/CountStepper-CQCesqqy.js","/assets/Daily-Wl88mMzS.js","/assets/DataTable-Byla8luU.js","/assets/DateRangePicker-B-xYAEL-.js","/assets/DayReportView-vbpP9hBh.js","/assets/DayStepper-TQu4CuF0.js","/assets/DayStrip-rEMNWJV6.js","/assets/DifferenceBreakdown-DKPDAi_Q.js","/assets/Downtime-D-cXfinH.js","/assets/Education-Dpii7G3U.js","/assets/EducationLesson-BGA_Agh_.js","/assets/EmptyState-DiCTOCVj.js","/assets/Exam-CqizNuoA.js","/assets/FactorySelect-DxCrC6tS.js","/assets/Gamification-CEaENSCj.js","/assets/GroupBadge-DbO2xXun.js","/assets/HeatmapChart-BBEADSf0.js","/assets/IdleCell-DQqK4paq.js","/assets/KPICard-Dvg_98zv.js","/assets/Kaizen-C0RufI-k.js","/assets/Kelish-JsHHakLq.js","/assets/KpiDeltaCard-BC_coN5Y.js","/assets/LangTextInput-DOYBgT5m.js","/assets/Layout-DWhfwO2n.js","/assets/LeaderAppeal-Wu8MHKaB.js","/assets/LeaderDayReport-B-n76mw4.js","/assets/LeaderUnitReport-BBpqLJtv.js","/assets/Leaderboard-LaHsLCiT.js","/assets/Leaders-B6jybGxm.js","/assets/LeadersKpi-Cv2z1Ajv.js","/assets/Lightbox-DcD50tAQ.js","/assets/LiveOverview-kHBrpz4_.js","/assets/Login-DuJe2DMl.js","/assets/NotFound-Da4lH8ZA.js","/assets/Notifications-2tOhmFj8.js","/assets/Ontime-BjtS807f.js","/assets/Overview-i82x-Xyq.js","/assets/Pagination-BZtz3Qch.js","/assets/PerenaladkaFactTable-DLoBkUoK.js","/assets/PersonCard-hUBfbpVW.js","/assets/PlanFulfillment-C6KREYYQ.js","/assets/Production-BomJrMqc.js","/assets/Profile-B7ONM75r.js","/assets/ProofCamera-DY86GwHq.js","/assets/ProofPhoto-DL87b9uK.js","/assets/Quality-Bdh12Fgx.js","/assets/RawRows-svbAsWqV.js","/assets/Reports-DIvUwHRb.js","/assets/RequestStateChip-EdH8KAU4.js","/assets/RichTextEditor-C4iYuIag.js","/assets/SaveState-Bzousm16.js","/assets/SearchInput-BMleastr.js","/assets/SeasonalityHeatmap-Dc-KeNY7.js","/assets/SegmentedToggle-DNvo_Lx1.js","/assets/SetupTimes-BYfH3qkJ.js","/assets/ShiftDaily-D4HwZV0_.js","/assets/Staff-ByGRmheb.js","/assets/StaffListAtCheck-yMfEZ1mV.js","/assets/StatusBadge-DKDRB6dY.js","/assets/StatusBandsModal-BN7qrbxj.js","/assets/TargetGoal-B7pEapPd.js","/assets/Targets-IFbmGZI9.js","/assets/Tasks-QVMADLWx.js","/assets/TimeWheelPicker-8Roao5Ym.js","/assets/Toast-MKBCRjMS.js","/assets/Tooltip-BOgsdQep.js","/assets/TrendChart-D3HwjbGp.js","/assets/TripleSpeedometer-B_QvkuSo.js","/assets/Trudoyomkost-Cl84uB68.js","/assets/UploadDropzone-BfkNZzN2.js","/assets/UsersActivity-kbNHpY6B.js","/assets/VerdictBlock-dbtZWWqK.js","/assets/VfxApiMap-CIN0a6Dl.js","/assets/VfxDictionaries-ReouSwMu.js","/assets/VfxEmployees-C8JKDAtw.js","/assets/VfxHrMoves-CUXizkOj.js","/assets/VfxJobs-DgqSXrPo.js","/assets/VfxPhoto-vuWBAqJt.js","/assets/VfxShifts-CWKDxVPi.js","/assets/VfxState-DSUCXOVv.js","/assets/VfxTimebooks-CVeMJkGB.js","/assets/VfxTimesheet-CIahof8a.js","/assets/WatchProgress-BDCu_uKt.js","/assets/WebLogin-BagvsBo4.js","/assets/Workers-DsOwnUA3.js","/assets/Zagruzka-DAxhu5uo.js","/assets/ZagruzkaCell-CgBabONR.js","/assets/api-BFm7MSgf.js","/assets/archive-BH3141ss.js","/assets/archive-restore--AWSZ-Ud.js","/assets/arrow-down-BvZuEc6y.js","/assets/arrow-down-right-9zqzYAXd.js","/assets/arrow-down-wide-narrow-CoA4kFhL.js","/assets/arrow-up-narrow-wide-mvwN9-vG.js","/assets/ban-n7v79bLa.js","/assets/boxes-GLiHaONd.js","/assets/braces-BytkiPnk.js","/assets/brigadirFilters-CADPAvQT.js","/assets/broadcastTree-BS0hTMXD.js","/assets/building-2-Dv3R3e_I.js","/assets/calendar-0qPlbCE1.js","/assets/calendar-days-ruvCofVM.js","/assets/camera-r1HpmNdc.js","/assets/categories-BfSTwHhu.js","/assets/cellMoveRefusal-BpvhZ8vc.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CUzHYTEK.js","/assets/chart-line-C_6b-IG_.js","/assets/chart-pie-Bx_iX3jk.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-C9URW4u-.js","/assets/chevron-left-Dq2AEBSE.js","/assets/chevrons-up-down-DEEvynBH.js","/assets/circle--QM23S4V.js","/assets/circle-alert-nHqC9dxD.js","/assets/circle-check-big-Cw4uR5p_.js","/assets/circle-dashed-CLGORXOq.js","/assets/circle-minus-BkIsS5XQ.js","/assets/circle-question-mark-Cl9ms0S5.js","/assets/circle-slash-Cp7f82LR.js","/assets/circle-user-round-jTH17R3m.js","/assets/cloud-off-v88TV00L.js","/assets/cloud-upload-BkfBdT4M.js","/assets/coins-B9__Dv3v.js","/assets/compass-Dgj3Kzb0.js","/assets/concernCategories-Dv6GGuWO.js","/assets/corner-down-right-cJmV63eK.js","/assets/createLucideIcon-CKcvL74V.js","/assets/en-DKG03SaL.js","/assets/es-Dtgc5NM1.js","/assets/external-link-ClosA-s3.js","/assets/file-clock-BMoL2WuW.js","/assets/file-exclamation-point-B3-pMcjy.js","/assets/flag-qNi9Ilw1.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-C40dE2I-.js","/assets/funnel-CH9fvGfk.js","/assets/hash-CJi9WHd_.js","/assets/hourglass-DYwDdG0S.js","/assets/idleTime-CHPnJRpw.js","/assets/image-DgY35QoL.js","/assets/image-off-DbIOe8fQ.js","/assets/inbox-BlS6hEY6.js","/assets/index-BtYmuUYW.css","/assets/index-C0dRt_OC.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-Bx8rVjwJ.js","/assets/languages-gIEekfTo.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-xTMqW5C0.js","/assets/leaderBoard-CggehKUX.js","/assets/lightbulb-dJ4pNpMG.js","/assets/link-2-DdKfXJJX.js","/assets/link-2-off-ZxGA1bh7.js","/assets/list-ordered-CzdGEiF8.js","/assets/list-tree-CJgikMOa.js","/assets/lock-open-Bytozi-2.js","/assets/log-in-DOiP69Kp.js","/assets/map-pin-L6YBCe7T.js","/assets/marks-O3xsUyPJ.js","/assets/minimize-2-DKrg6ws9.js","/assets/package-check-hjx6YYe6.js","/assets/pencil-B_lIR_s3.js","/assets/percent-De0AqWLw.js","/assets/pin-CM_j-jmi.js","/assets/pin-off-8KFgHF0l.js","/assets/play-CFI1y7pR.js","/assets/plug-zap-QVnWw2CK.js","/assets/prop-types-RD3fbola.js","/assets/radio-p3htf7kk.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BFb296Z2.js","/assets/repeat-xhfFEgNm.js","/assets/ru-B_kTKNlV.js","/assets/save-BSzr-qJM.js","/assets/scopeLinks-DRnLmNqG.js","/assets/scroll-text-Bza3S7tZ.js","/assets/search-x-BaYThReH.js","/assets/segments-D5Uiedtv.js","/assets/send-l3DsMOjx.js","/assets/settings-2-CrADr7CD.js","/assets/shield-Cn8iQdiY.js","/assets/shield-alert-C_cpQ6fC.js","/assets/shield-question-mark-Z9O_mJWd.js","/assets/sigma-kBCf9E4C.js","/assets/siren-CDTOYmsY.js","/assets/snowflake-Dx9dVr_8.js","/assets/split-Cf8SINsl.js","/assets/square-check-big-C9CxC5u6.js","/assets/star-DqP52oiW.js","/assets/statusBands-DVBZcBq3.js","/assets/store-rG5X2kw4.js","/assets/table-2-BLZvBY9j.js","/assets/table-properties-C5HXiyOr.js","/assets/tag-Bp_77bKi.js","/assets/timer-off-q3qHjEri.js","/assets/translations-U-CrKp3F.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-C5LVyx2r.js","/assets/trending-up-D55xBSn4.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-ONYnxK2Q.js","/assets/useChartTheme-DGcTVUOR.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-CjkjKk_X.js","/assets/useStatusBands-BW5dlmPF.js","/assets/useUrlScope-BkmuEOk8.js","/assets/user-CKmeYtpD.js","/assets/user-cog-B49L_aaN.js","/assets/user-minus-CDBS6mgo.js","/assets/users-DWoGj2ZP.js","/assets/uz-B5Fy42h5.js","/assets/uz_cyrl-CE9gIgax.js","/assets/vfx-rzOksQwM.js","/assets/video-pPKl6yDT.js","/assets/wallet-De_ZkR1x.js","/assets/warehouse-C-6McqTX.js","/assets/workflow-CQ63HilF.js","/assets/x-Cb9GlkMS.js","/assets/zap-CJdgtHx2.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
