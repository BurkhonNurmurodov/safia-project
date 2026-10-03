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

const BUILD = "2026-10-03T10:14:37.191Z";
const PRECACHE = ["/","/assets/AdminPanel-Dk6oLdzU.js","/assets/AnalysisBoard-DCd2tLut.js","/assets/Arc-BuLT_PDI.js","/assets/ArcLegacy-DADNfwh3.js","/assets/BrigadirProfile-CC0vXvcI.js","/assets/BroadcastReceivers-D0V7nZH8.js","/assets/BroadcastRecord-D351ePb-.js","/assets/CatLockNotice-C9O0U96r.js","/assets/CategoryLegendModal-B4UtEkE1.js","/assets/CellConcerns-BWmOx42G.js","/assets/CellDetails-bo6qYdjM.js","/assets/CellFormModal-CGUmwgNA.js","/assets/CellIdent-CZFtOjMO.js","/assets/CellLink-Dbpi22e2.js","/assets/Cells-CVMBmvyw.js","/assets/ColumnFilter-Bhb246ug.js","/assets/ColumnsPicker-D1dlaM5n.js","/assets/CommentsModal-DAd-fdNy.js","/assets/ComparisonTable-U7Akrsxl.js","/assets/Concerns-B4mAm0-Z.js","/assets/ConfirmDialog-iPbkfR_c.js","/assets/Daily-B3MLaNAl.js","/assets/DataTable-BtLnWjb9.js","/assets/DateRangePicker-zFtqAfHu.js","/assets/DayReportView-C9YX0Wpm.js","/assets/DayStepper-r7ZCWMDL.js","/assets/DifferenceBreakdown-BNNL2leR.js","/assets/Downtime-BGfEfgDC.js","/assets/Education-BmmMUbTz.js","/assets/EducationLesson-SrLZTLx4.js","/assets/EmptyState-DpAeUFl5.js","/assets/Exam-CUs-wqb1.js","/assets/FactorySelect-CEHfYkgw.js","/assets/Gamification-Cwg8E0o9.js","/assets/GroupBadge-Cjdd8pZ4.js","/assets/HeatmapChart-0S0v2zbC.js","/assets/IdleCell-DwDNoCki.js","/assets/KPICard-czQXH9_-.js","/assets/Kaizen-DcSLMY9x.js","/assets/Kelish-TlHM_40L.js","/assets/KpiDeltaCard-CIO3lu0j.js","/assets/LangTextInput-CPZf4fTL.js","/assets/Layout-Qo2WObC1.js","/assets/LeaderAppeal-Dd41PNOO.js","/assets/LeaderDayReport-C7pstB9I.js","/assets/LeaderUnitReport-DT16D8Kw.js","/assets/Leaderboard-BX-QI9q4.js","/assets/Leaders-Btae5Gzc.js","/assets/Lightbox-CpYUWgK3.js","/assets/LiveOverview-Bjr9Oq7a.js","/assets/Login-CqHdWkj-.js","/assets/NotFound-Cv7QUgFD.js","/assets/Notifications-CuI_zXjG.js","/assets/Overview-B2u0EVc1.js","/assets/Pagination-CIoJdQqY.js","/assets/PerenaladkaFactTable-g5F7_j43.js","/assets/PersonCard-2yZpaQ3W.js","/assets/PlanFulfillment-DkKbfd-Z.js","/assets/Production-Ju_h8d0T.js","/assets/Profile-C04ddCnc.js","/assets/ProofCamera-BmjUBS0w.js","/assets/ProofPhoto-UcM6UJnn.js","/assets/Quality-CRGEqBTA.js","/assets/RawRows-BLbs_moA.js","/assets/RequestStateChip-DzPxfoAr.js","/assets/RichTextEditor-BezeqMh5.js","/assets/SaveState-BFEz-VD0.js","/assets/SearchInput-COU7p5j7.js","/assets/SeasonalityHeatmap-6Xdi6am7.js","/assets/SegmentedToggle-DAnuqm1C.js","/assets/SetupTimes-DsVSog7u.js","/assets/ShiftDaily-CWJtWI2z.js","/assets/Staff-BxIz6QJU.js","/assets/StaffLive-czGQMQBC.js","/assets/StatusBadge-DPH6U-P_.js","/assets/TargetGoal-DNzuyu1V.js","/assets/Targets-D32miZie.js","/assets/Tasks-V0ZScs43.js","/assets/TimeWheelPicker-DKf6Odts.js","/assets/Toast-C4WeDqAu.js","/assets/Tooltip-C1MIIOci.js","/assets/TrendChart-BKvHV_7d.js","/assets/TripleSpeedometer-dxKXMDy7.js","/assets/Trudoyomkost-C3giBy6g.js","/assets/UploadDropzone-BspWHM9F.js","/assets/UsersActivity-B9m6d1Yn.js","/assets/VerdictBlock-BNBb__i1.js","/assets/VfxApiMap-Bjv6QZZ9.js","/assets/VfxEmployees-C3YImrz9.js","/assets/VfxJobs-DXcf4JP9.js","/assets/VfxMarks-cnbEJ3n9.js","/assets/VfxOnSite-DTXnSbon.js","/assets/VfxPhoto-CGZTnk78.js","/assets/VfxState-Q3j2MeKn.js","/assets/VfxStructure-Sdw48KZy.js","/assets/VfxTable-Nq9eDKpD.js","/assets/VfxTimesheet-DTuD0dRU.js","/assets/WatchProgress-B75uYGM6.js","/assets/WebLogin-CJBkWJCT.js","/assets/WorkerConcerns-18VhP7zt.js","/assets/Workers-CggWHNpH.js","/assets/Zagruzka-CJSR--r6.js","/assets/ZagruzkaCell-DXHhIZXf.js","/assets/api-Pv-AejUw.js","/assets/archive-CZAgjzLf.js","/assets/archive-restore-D-MfcRtz.js","/assets/arrow-down-BvcNKYK6.js","/assets/arrow-left-D_m7M1uW.js","/assets/arrow-right-left-CtkomCA8.js","/assets/arrow-up-Cov63irD.js","/assets/arrow-up-narrow-wide-Byn0Popz.js","/assets/arrow-up-right-CM27ceRn.js","/assets/award-DK2NOsKe.js","/assets/ban-B4EHzzSh.js","/assets/bot-BUxxBFlw.js","/assets/boxes-DjV1iWRp.js","/assets/braces-D_W_i5E8.js","/assets/brigadirFilters-InY8Bh6W.js","/assets/broadcastTree-DTNELbwC.js","/assets/building-2-DjmezvfJ.js","/assets/calendar-D4_pvIr0.js","/assets/calendar-days-Bs9U4nfp.js","/assets/camera-B7a5TEmm.js","/assets/categories-Nz1rokfu.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-07lrNtOw.js","/assets/chart-line-DAnBJhud.js","/assets/chart-pie-CuzT-ZM9.js","/assets/chartRange-GZROsWOI.js","/assets/chevron-left-DoyNmud1.js","/assets/chevrons-up-down-B4Tnu_7l.js","/assets/circle-B_dVFSsO.js","/assets/circle-alert-DpFom7LD.js","/assets/circle-check-big-NQCeBz-H.js","/assets/circle-dashed-CtXLcmJm.js","/assets/circle-minus-UbyAF_tC.js","/assets/circle-question-mark-BNN_ooT7.js","/assets/circle-slash-DjFcJKlr.js","/assets/circle-user-round-B9rAZslL.js","/assets/clock-3-A7zCHQtE.js","/assets/cloud-off-BWgaINd8.js","/assets/cloud-upload-C0eKOgV2.js","/assets/compass-Dd5VN92J.js","/assets/concernCategories-S2tnq2A4.js","/assets/copy-DelHJA62.js","/assets/corner-down-right-DUJFBs03.js","/assets/createLucideIcon-Daq-VnVM.js","/assets/door-open-CGY3z-VM.js","/assets/es-CDJN7iiJ.js","/assets/exportXlsx-pBZKxdGU.js","/assets/external-link-BU-wqZn2.js","/assets/file-clock-Bv1kO4xs.js","/assets/file-exclamation-point-DNAV0jDG.js","/assets/file-spreadsheet-Bm1-3IAF.js","/assets/file-text-a57QJHf9.js","/assets/flag-BF0eolVt.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-8_gnVdeO.js","/assets/hash-Rgvngz1H.js","/assets/history-BlgQkBSf.js","/assets/hourglass-DifsWEpD.js","/assets/image-DV4DyHUj.js","/assets/image-off-BKY5tmz9.js","/assets/inbox-CmDJlEBk.js","/assets/index-CNf0918Y.js","/assets/index-CPVGdSVZ.css","/assets/key-round-C61BA7pp.js","/assets/keyboard-DklEOMia.js","/assets/languages-DRDffFpZ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CU_9M673.js","/assets/lightbulb-Chr7KF_y.js","/assets/link-2-iwX1z7X_.js","/assets/link-2-off-B1KPTtXW.js","/assets/list-ordered-BtCvrHU-.js","/assets/list-tree-QRfHED0W.js","/assets/lock-open-BPYJSDSZ.js","/assets/log-in-D3vUqgqy.js","/assets/maximize-2-CNSG_J8g.js","/assets/message-square-DDz-2Adb.js","/assets/minimize-2-A6i0knbY.js","/assets/package-check-CManM7bC.js","/assets/paperclip-DYtNG7VR.js","/assets/pencil-izANwUa3.js","/assets/percent-DrjEqYDf.js","/assets/phone-RHGkpfw7.js","/assets/pin-CHepbY3Y.js","/assets/pin-off-D0_C9Ts2.js","/assets/play-DVjEXrxD.js","/assets/plug-zap-By2zpzkg.js","/assets/presentation-CPqWJ_JY.js","/assets/prop-types-PemwzVxE.js","/assets/radio-Bq-x9zEa.js","/assets/react-apexcharts.esm-DS2_EHdJ.js","/assets/repeat-D8dvDfM-.js","/assets/rotate-ccw-C5EyPzFa.js","/assets/rotate-cw-CeApkDIg.js","/assets/save-Q20EC02j.js","/assets/scopeLinks-Cu4ueAxf.js","/assets/scroll-text-F7hJWJrp.js","/assets/search-x-BzBpMd6x.js","/assets/segments-D64m_f1h.js","/assets/send-BUn79TmD.js","/assets/settings-2-BFDVSfgd.js","/assets/shield-D59ugbJS.js","/assets/shield-alert-CWMXoyIr.js","/assets/shield-check-rdzcpGhk.js","/assets/shield-question-mark-C67QK_1Y.js","/assets/siren-CQO1Sy8Q.js","/assets/snowflake-D4w99pE3.js","/assets/split-BCSiefno.js","/assets/square-BQH-pHuf.js","/assets/square-check-big-Clit7fsw.js","/assets/star-BNzR3Vy-.js","/assets/statusBands-a8DY-Kf1.js","/assets/store-IfVqedqj.js","/assets/table-2-DmdUolUK.js","/assets/table-properties-B1PVDZu4.js","/assets/tag-CIS2Ship.js","/assets/timer-off-UtERCVrE.js","/assets/trending-down-350aoVxU.js","/assets/trending-up-BIdgkAUF.js","/assets/undo-2-CvJ2_nAF.js","/assets/useChartTheme-DxQrnfGh.js","/assets/useElementWidth-mEOT9lhq.js","/assets/useIsMobile-eCixtpc5.js","/assets/useOpenParam-BDn-cG7m.js","/assets/useStatusBands-yFj1nB2k.js","/assets/useUrlScope-CfYh20o5.js","/assets/user-cog-B_TBGJ2J.js","/assets/user-minus-A6lqJShB.js","/assets/user-trACRppM.js","/assets/users-qitF1oli.js","/assets/video-BsIY1T8F.js","/assets/wallet-CfTUYNNi.js","/assets/warehouse-6x7csiS5.js","/assets/x-DeDeZgS2.js","/assets/zap-CfRwrZKu.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
