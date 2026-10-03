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

const BUILD = "2026-10-03T09:22:28.928Z";
const PRECACHE = ["/","/assets/AdminPanel-Dd8j9H1B.js","/assets/AnalysisBoard-Da1yFPDH.js","/assets/Arc-C6FxR2i4.js","/assets/ArcLegacy-BRtpPWXr.js","/assets/BrigadirProfile-COznCSPv.js","/assets/BroadcastReceivers-BFEzv6WT.js","/assets/BroadcastRecord-BLuRhQKq.js","/assets/CatLockNotice-CNzqu14A.js","/assets/CategoryLegendModal-CH_Xf4H-.js","/assets/CellConcerns-CMUcOxtU.js","/assets/CellDetails-yqSkgznO.js","/assets/CellFormModal-BX53QiD5.js","/assets/CellIdent-eLhCpXvR.js","/assets/CellLink-D_gSTCsg.js","/assets/Cells-DfRxtt59.js","/assets/ColumnFilter-Bu53mWL6.js","/assets/ColumnsPicker-DrZfupk1.js","/assets/CommentsModal-B5MMseg1.js","/assets/ComparisonTable-tmbyzjKs.js","/assets/Concerns-L8oe_Ve0.js","/assets/ConfirmDialog-DWRJUqdf.js","/assets/Daily-D-5xSxmV.js","/assets/DataTable-DkWog7de.js","/assets/DateRangePicker-DrgEMk5S.js","/assets/DayReportView-l3qMLwIA.js","/assets/DayStepper-5wOivfv_.js","/assets/DifferenceBreakdown-DifHECqv.js","/assets/Downtime-D8vqjoAQ.js","/assets/Education-y5gt7YC3.js","/assets/EducationLesson-BkVo3pGe.js","/assets/EmptyState-C6CNdlVM.js","/assets/Exam-8lUUyIHA.js","/assets/FactorySelect-DCEGAypV.js","/assets/Gamification-8Q9N6m5b.js","/assets/GroupBadge-DwWxYEnn.js","/assets/HeatmapChart-K7wG6ElO.js","/assets/IdleCell-C81azstf.js","/assets/KPICard-B2nfNymJ.js","/assets/Kaizen-CwF_N_Ep.js","/assets/Kelish-eSRARMqY.js","/assets/KpiDeltaCard-DGj4qETQ.js","/assets/LangTextInput-Cxpb7QTZ.js","/assets/Layout-CyfRi1qs.js","/assets/LeaderAppeal-CJneuCAF.js","/assets/LeaderDayReport-Dh9Xv5GO.js","/assets/LeaderUnitReport-BN7Ohd8v.js","/assets/Leaderboard-B5_i4BBo.js","/assets/Leaders-CO4tZfR7.js","/assets/Lightbox-CkODw82x.js","/assets/LiveOverview-Cok0Japp.js","/assets/Login-cEBrJoph.js","/assets/NotFound-BX5GrtV5.js","/assets/Notifications-NtXZ2j8o.js","/assets/Overview-gBK5PI0x.js","/assets/Pagination-CLWl_EIw.js","/assets/PerenaladkaFactTable-ByG1tOpR.js","/assets/PersonCard-bmwSmcNv.js","/assets/PlanFulfillment-BoMZRgfi.js","/assets/Production-CIZUxURs.js","/assets/Profile-o0RUsfmA.js","/assets/ProofCamera-CzUl-rX3.js","/assets/ProofPhoto-Dxu25Uvs.js","/assets/Quality-PRNHl0mN.js","/assets/RawRows-lQGRpCDf.js","/assets/RequestStateChip-CwBP4Geh.js","/assets/RichTextEditor-mlboZtMF.js","/assets/SaveState-kOEK0XeF.js","/assets/SearchInput-DZ-jy-6p.js","/assets/SeasonalityHeatmap-CQhz0NME.js","/assets/SegmentedToggle-CeqErzhH.js","/assets/SetupTimes-CYwDLNUu.js","/assets/ShiftDaily-BiiZKOE7.js","/assets/Staff-D5vDpNEY.js","/assets/StaffLive-tbaeQT-t.js","/assets/StatusBadge-Cnw5b4Qg.js","/assets/TargetGoal-EebNDwCl.js","/assets/Targets-Dblmt3yo.js","/assets/Tasks-CvG_t_U3.js","/assets/TimeWheelPicker-CPI8kuHI.js","/assets/Toast-Bf6unzqb.js","/assets/Tooltip-BFqj9oLi.js","/assets/TrendChart-Bi3GiHTb.js","/assets/TripleSpeedometer-1hD-zh1a.js","/assets/Trudoyomkost-B1LzlrVS.js","/assets/UploadDropzone-Ck35qGYh.js","/assets/UsersActivity-DNN0fjhr.js","/assets/VerdictBlock-CtqvQUqk.js","/assets/VfxApiMap-CemLC3A3.js","/assets/VfxEmployees-nLnBitpv.js","/assets/VfxJobs-BySUM_ia.js","/assets/VfxMarks-IBK82Fl3.js","/assets/VfxOnSite-Ds1Qzv0Z.js","/assets/VfxPhoto-DpPcJhFH.js","/assets/VfxState-C0fnM6MP.js","/assets/VfxStructure-y1uOpSpb.js","/assets/VfxTable-n7CnyS8e.js","/assets/VfxTimesheet-BimLHCd5.js","/assets/WatchProgress-DfOPDG_d.js","/assets/WebLogin-lGjVou7-.js","/assets/WorkerConcerns-CmCf1-W6.js","/assets/Workers-DkXXwy-c.js","/assets/Zagruzka-C221aEuh.js","/assets/ZagruzkaCell-DwVJEWju.js","/assets/api-B-cDTEPk.js","/assets/archive-DaIxjoTu.js","/assets/archive-restore-cJue1XiW.js","/assets/arrow-down-JWFcY9yv.js","/assets/arrow-left-CToVoi_w.js","/assets/arrow-right-left-D4QirzgX.js","/assets/arrow-up-B061C4M0.js","/assets/arrow-up-narrow-wide-DL4o_-DA.js","/assets/arrow-up-right-DhMpw0BH.js","/assets/award-BgdAzXHY.js","/assets/ban-CqRd1ZUv.js","/assets/bot-DksHaYID.js","/assets/boxes-CcrSTFlF.js","/assets/braces-BVFrZ2p-.js","/assets/brigadirFilters-B8DPzV4C.js","/assets/broadcastTree-CGTxRQJ6.js","/assets/building-2-DNWujyXR.js","/assets/calendar-KEjgeKkC.js","/assets/calendar-days-BBbcfGuB.js","/assets/camera-Byh6vd42.js","/assets/categories-BQe092Mx.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DnRBrU67.js","/assets/chart-line-D2hkgMiX.js","/assets/chart-pie-DIveesiq.js","/assets/chartRange-MVKNgaoB.js","/assets/chevron-left-4EsSgWF4.js","/assets/chevrons-up-down-C7ueMGoK.js","/assets/circle-BckROydZ.js","/assets/circle-alert-Coi5OinT.js","/assets/circle-check-big-CB9of1Du.js","/assets/circle-dashed-CmeHVkzm.js","/assets/circle-minus-DPr54NOu.js","/assets/circle-question-mark-CDB-eR32.js","/assets/circle-slash-CROfRj4P.js","/assets/circle-user-round-YECb1MR2.js","/assets/clock-3-RHCSdCY-.js","/assets/cloud-off-BnyrKJJw.js","/assets/cloud-upload-DWxZ-VzO.js","/assets/compass-DNdthRwS.js","/assets/concernCategories-CUqiE-lD.js","/assets/copy-GWohIYlP.js","/assets/corner-down-right-Bn-zQvLS.js","/assets/createLucideIcon-GyUQlmyT.js","/assets/door-open-DWZT5C7E.js","/assets/es-Cuejb2uQ.js","/assets/exportXlsx-Cst8c-s_.js","/assets/external-link-Z_WT3iI2.js","/assets/file-clock-Brtkkm_k.js","/assets/file-exclamation-point-6A7hAP0E.js","/assets/file-spreadsheet-ByuhsYPQ.js","/assets/file-text-oyNhCzrS.js","/assets/flag-BtW30gkm.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CD8hsJuf.js","/assets/hash-DRlP7f17.js","/assets/history-qoJlld3x.js","/assets/hourglass-DSHtm5kX.js","/assets/image-DKdkCKhf.js","/assets/image-off-DlJWyIuf.js","/assets/inbox-BCkAiQp8.js","/assets/index-Bc1m5P-9.css","/assets/index-Cvhemur8.js","/assets/key-round-BpxPBbjQ.js","/assets/keyboard-DfscN0Xa.js","/assets/languages-C0-veMER.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-XZL6zp51.js","/assets/lightbulb-Dgu2XZ6W.js","/assets/link-2-0md5fIyu.js","/assets/link-2-off-C9jQJovy.js","/assets/list-ordered-CwablPjE.js","/assets/list-tree-CgUn1Hn1.js","/assets/lock-open-VC4A9Hbp.js","/assets/log-in-MzVEqiO_.js","/assets/maximize-2-rAjsR5Yn.js","/assets/message-square-De4hGZxx.js","/assets/minimize-2-BbUh0_6P.js","/assets/package-check-C9dgKXK3.js","/assets/paperclip-B8k9W1Fu.js","/assets/pencil-B00rSxUj.js","/assets/percent-NgoXvkzB.js","/assets/phone-Du6_7MK1.js","/assets/pin-DXZzzdBI.js","/assets/pin-off-qsc7Y3a8.js","/assets/play-BYWD74po.js","/assets/plug-zap-BzdJoyty.js","/assets/presentation-DIPdJDRL.js","/assets/prop-types-8gQP3Rqr.js","/assets/radio-DfbXb00b.js","/assets/react-apexcharts.esm-YE_fs4AT.js","/assets/repeat-BN1kUWC2.js","/assets/rotate-ccw-D9q4X-uz.js","/assets/rotate-cw-DRWocFrA.js","/assets/save-BmFLm_yT.js","/assets/scopeLinks-AqpWIges.js","/assets/scroll-text-Ot8KzW0G.js","/assets/search-x-DxuZwX_T.js","/assets/segments-BVTPLWjH.js","/assets/send-Bat4VZCu.js","/assets/settings-2-CAyL1FX3.js","/assets/shield-D5Qo3hRz.js","/assets/shield-alert-CfYS0tNk.js","/assets/shield-check-D_q7oCB9.js","/assets/shield-question-mark-8pnA1PNZ.js","/assets/siren-DRsqBEfs.js","/assets/snowflake-DAny6ol7.js","/assets/split-BlMcFuV3.js","/assets/square-Ci1xvgM6.js","/assets/square-check-big-BrDq4te7.js","/assets/star-Bif3prsE.js","/assets/statusBands-CiUNQEFr.js","/assets/store-DTlULv6B.js","/assets/table-2-B0PBWmJg.js","/assets/table-properties-hPzST3cF.js","/assets/tag-tuSOOYfY.js","/assets/timer-off-WBQAC7cG.js","/assets/trending-down-B3IxBvbG.js","/assets/trending-up-_RPf8iPk.js","/assets/undo-2-Jvcpmom5.js","/assets/useChartTheme-I7dzbc14.js","/assets/useElementWidth-B0G9zorh.js","/assets/useIsMobile-B6LUcuXO.js","/assets/useOpenParam-BKqfNwYf.js","/assets/useStatusBands-BaL3XEq1.js","/assets/useUrlScope-Bu7N772W.js","/assets/user-BH-VDHSs.js","/assets/user-cog-DEFJmk6S.js","/assets/user-minus-D0tQ81du.js","/assets/users-CQXlgFYB.js","/assets/video-MfEVWBg4.js","/assets/wallet-D95fKNn8.js","/assets/warehouse-HkqWnonO.js","/assets/x-CEN0rtxg.js","/assets/zap-C7Smixwa.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
