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

const BUILD = "2026-10-01T09:35:38.996Z";
const PRECACHE = ["/","/assets/AdminPanel-DYqvs2Qz.js","/assets/AnalysisBoard-CLqiD93F.js","/assets/Arc-Bo3aTqCu.js","/assets/ArcLegacy-DiFnF5mR.js","/assets/BrigadirProfile-D_HRzWzH.js","/assets/BroadcastReceivers-Bqxk2iD3.js","/assets/BroadcastRecord-B9z0_Px2.js","/assets/CatLockNotice-EzZzC1iy.js","/assets/CategoryLegendModal-mobUrlud.js","/assets/CellConcerns-DnSuIUtn.js","/assets/CellDetails-SCiAXVql.js","/assets/CellFormModal-TYyj3AJZ.js","/assets/CellIdent-BEhYMylF.js","/assets/CellLink-DMRwnCRW.js","/assets/Cells-HAYdQJHx.js","/assets/ColumnFilter-BEVvYflq.js","/assets/ColumnsPicker-bB3M1xbt.js","/assets/CommentsModal-4O6J0D-z.js","/assets/ComparisonTable-CmaSEadS.js","/assets/Concerns-BcU4LnX_.js","/assets/ConfirmDialog-__9sYMEd.js","/assets/Daily-DeoeDTpy.js","/assets/DataTable-DPfZUmF1.js","/assets/DateRangePicker-pXvsH86t.js","/assets/DayReportView-4jp_1X46.js","/assets/DayStepper-Dl4Eb2w5.js","/assets/DifferenceBreakdown-BsiYzljD.js","/assets/Downtime-DNfK3M3L.js","/assets/Education-BpRK1nJe.js","/assets/EducationLesson-C2NBlBVo.js","/assets/EmptyState-CPYNDDNq.js","/assets/Exam-YYQc8EBO.js","/assets/FactorySelect-Cg2123rI.js","/assets/Gamification-Caq-jRZA.js","/assets/GroupBadge-DSU-qLHU.js","/assets/HeatmapChart-BZfpqX75.js","/assets/IdleCell-DKFQ-JA0.js","/assets/KPICard-B4cW4U6H.js","/assets/Kaizen-DO-oXBit.js","/assets/Kelish-mNbJuJ8k.js","/assets/KpiDeltaCard-DSkK5MNg.js","/assets/LangTextInput-Dw79mnYK.js","/assets/Layout-BLFcHON4.js","/assets/LeaderAppeal-BrbxWgr-.js","/assets/LeaderDayReport--vbhUoMp.js","/assets/LeaderUnitReport-CCjmb9j7.js","/assets/Leaderboard-CHFXxPEc.js","/assets/Leaders-CHFGnHLt.js","/assets/Lightbox-CeUlnswz.js","/assets/LiveOverview-DExWx9UA.js","/assets/Login-D0iuOFBV.js","/assets/NotFound-DOv6YjAA.js","/assets/Overview-B0iLyRoK.js","/assets/Pagination-C9X2mqp7.js","/assets/PerenaladkaFactTable-Deop1jzo.js","/assets/PlanFulfillment-DlsaP6Yl.js","/assets/Production-D7Z-n73i.js","/assets/Profile-BUsEpeCP.js","/assets/ProofCamera-j3NDmwdj.js","/assets/ProofPhoto-DW5QZDXL.js","/assets/Quality-DddF5k3q.js","/assets/RequestStateChip-BnPswzyp.js","/assets/RichTextEditor-593-IiIt.js","/assets/SaveState-BcgIjyLH.js","/assets/SearchInput-DmKypk8o.js","/assets/SeasonalityHeatmap-Brj8OSp1.js","/assets/SegmentedToggle-Dty-kPqT.js","/assets/SetupTimes-BaoMhN_q.js","/assets/ShiftDaily-Bf1xxpvj.js","/assets/Staff-BG1r0NBY.js","/assets/StaffLive-DlF5poCG.js","/assets/StatusBadge-CKkBUUFT.js","/assets/TargetGoal-97-EaY_G.js","/assets/Targets-B8sHNeyE.js","/assets/Tasks-C4ZSquK3.js","/assets/TimeWheelPicker-CklB_mnk.js","/assets/Tooltip-BthGMHra.js","/assets/TrendChart-SZLbpnXo.js","/assets/TripleSpeedometer-B3EOainL.js","/assets/Trudoyomkost-9ez4IAww.js","/assets/UploadDropzone-BQr6Nxgg.js","/assets/UsersActivity-BZPgwP4G.js","/assets/VerdictBlock-BsUaNevF.js","/assets/WatchProgress-BJ3U-7BC.js","/assets/WebLogin-xzkMvHHN.js","/assets/WorkerConcerns-Dmni7SH3.js","/assets/Workers-DcubqDiv.js","/assets/Zagruzka-C-hHLbDD.js","/assets/ZagruzkaCell-yd1AR2rp.js","/assets/api-BN1jSBTH.js","/assets/archive-DZ79z7mm.js","/assets/archive-restore-B38Mkd42.js","/assets/arrow-down-8BrLX_4a.js","/assets/arrow-left-DeWiRHj3.js","/assets/arrow-left-right-pho5skgP.js","/assets/arrow-right-left-DqzVYpG-.js","/assets/arrow-up-SerP9XKX.js","/assets/arrow-up-narrow-wide-DUT1LjEE.js","/assets/arrow-up-right-Cn4fa3uS.js","/assets/award-Nud9ujkF.js","/assets/ban-D2kex4SS.js","/assets/bot-6z3uTlw7.js","/assets/boxes-CpENShyG.js","/assets/brigadirFilters-Cx9gVLQ_.js","/assets/broadcastTree-lMjx4F_2.js","/assets/building-2-BY5D3CTp.js","/assets/calendar-OKB51Sr6.js","/assets/calendar-clock-CEM1qtAZ.js","/assets/calendar-days-CFpay1X1.js","/assets/calendar-range-CJpCXbAm.js","/assets/camera-BVrQdcOt.js","/assets/categories-BrBGfGjB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Bu3SLj6A.js","/assets/chart-line-CFkDVcf7.js","/assets/chart-pie-BBzP4Ukc.js","/assets/chartRange-BSif7Mhu.js","/assets/chevron-left-B0Q2KXRN.js","/assets/chevrons-up-down-CCSXORc0.js","/assets/circle-BjS0KfKx.js","/assets/circle-check-big-BixEdbLx.js","/assets/circle-dot-8bl_gK7Q.js","/assets/circle-minus-D9GNDFve.js","/assets/circle-slash-YdN3wnV_.js","/assets/circle-user-round-DRgYLLRV.js","/assets/cloud-off-Cspq77gL.js","/assets/cloud-upload-BupJJVWN.js","/assets/compass-BacyBMVE.js","/assets/concernCategories-CHOrXonJ.js","/assets/copy-CqLx2Ar_.js","/assets/corner-down-right-YKIx_I5-.js","/assets/createLucideIcon-Bkm_wSL0.js","/assets/es-BSRhY71O.js","/assets/exportXlsx-6AUPYmAt.js","/assets/external-link-Ckgu0l9v.js","/assets/file-clock-xv9b-WHu.js","/assets/file-exclamation-point-JWQLqeHU.js","/assets/file-spreadsheet-DgtxHeeD.js","/assets/file-text-BZ_OzSLb.js","/assets/flag-BXV3NuwH.js","/assets/flame-DMPb2qQ9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-85vHi3kW.js","/assets/hash-D31cn0Uq.js","/assets/history-XSSFyv3-.js","/assets/hourglass-UN4i4QNk.js","/assets/id-card-C8e49p9V.js","/assets/image-D1l7vVWN.js","/assets/image-off-stD2LNG3.js","/assets/index-6rNv2tEv.css","/assets/index-Cis47E7E.js","/assets/key-round-BS5rk2Sr.js","/assets/keyboard-C3Lyaw89.js","/assets/languages-BlIkmWcH.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CDkUkl9a.js","/assets/lightbulb-DU1gK3KA.js","/assets/link-2-Calb95ii.js","/assets/link-2-off-B77RsPWz.js","/assets/list-checks-DmfYhRTU.js","/assets/list-ordered-CEaJJQ2m.js","/assets/list-tree-GMdiZYlP.js","/assets/lock-open-BzXVq_hf.js","/assets/log-in-CbbJMzD1.js","/assets/maximize-2-D_SskWtq.js","/assets/message-square-wRePLA6g.js","/assets/minimize-2-CPWHnJtg.js","/assets/package-check-peioINsv.js","/assets/paperclip-CXp-qSjU.js","/assets/pencil-Kq78gtPU.js","/assets/percent-Cb_kGqdz.js","/assets/personName-CogOuS3K.js","/assets/pin-CHJuaxH7.js","/assets/pin-off-LgbsoJ2e.js","/assets/play-C9snWXk_.js","/assets/plug-zap-zyUb72cr.js","/assets/presentation-sflFHsnA.js","/assets/prop-types-2jmI-g9f.js","/assets/radio-BbnFctbI.js","/assets/react-apexcharts.esm-D_lKVKa4.js","/assets/repeat-q0kSTg14.js","/assets/rotate-ccw-BDA4gSQP.js","/assets/rotate-cw-JBU1-Jbg.js","/assets/save-kxj8qsSX.js","/assets/scale-V_mNfptW.js","/assets/scopeLinks-CeOKaduD.js","/assets/scroll-text-CP_aBS0v.js","/assets/search-x-CWQdtwNj.js","/assets/segments-Rs9Sf4Vp.js","/assets/send-BOBTFQnE.js","/assets/settings-2-CN3nKBCD.js","/assets/shield-BpnITBGo.js","/assets/shield-alert-BLo4c1XY.js","/assets/shield-check-CcskVzpt.js","/assets/shield-question-mark-vNsdZTIn.js","/assets/siren-CSJTgtqg.js","/assets/snowflake-BIhcLqHb.js","/assets/split-AGp3e_vU.js","/assets/square-CmUvx6pf.js","/assets/square-check-big-DlDVjv4t.js","/assets/star-BL63U1pQ.js","/assets/statusBands-nlH1dehM.js","/assets/store-BNuXHQrh.js","/assets/table-2-DFYx0XGw.js","/assets/table-properties-Cz5WP6o2.js","/assets/tag-CuPOSAVj.js","/assets/timer-off-MlXkLjNp.js","/assets/trending-down-DTQ5XH6t.js","/assets/trending-up-DjhUHOzn.js","/assets/undo-2-DiKNLrvE.js","/assets/useChartTheme-DRsJeQ40.js","/assets/useElementWidth-BiNZZ9k2.js","/assets/useIsMobile-CKet6B8R.js","/assets/useMutation-BG3KSfKr.js","/assets/useStatusBands-CecmiKlO.js","/assets/useUrlScope-DSc63qFu.js","/assets/user-DtJmbdSV.js","/assets/user-cog-DpZJ5CaO.js","/assets/user-minus-C-OcC8QC.js","/assets/users-CytnubTD.js","/assets/video-DdiyNubO.js","/assets/wallet-CRByFLKw.js","/assets/warehouse-BRuHtfgz.js","/assets/zap-CnsLc593.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
