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

const BUILD = "2026-10-05T11:02:33.249Z";
const PRECACHE = ["/","/assets/AdminPanel-DwFXYN8o.js","/assets/AnalysisBoard-0ovhI0n_.js","/assets/Arc-ChJW5nAZ.js","/assets/ArcLegacy-rwimfL5j.js","/assets/BrigadirProfile-nLUi_tXJ.js","/assets/BroadcastReceivers-zTHJFaeZ.js","/assets/BroadcastRecord-BAhxptqB.js","/assets/Button-C8MCRlnM.js","/assets/CatLockNotice-CslaPiDm.js","/assets/CategoryLegendModal-BP145_jw.js","/assets/CellConcerns-CrtM6BQg.js","/assets/CellDetails-D0B9hFZi.js","/assets/CellFormModal-Br-9VFfx.js","/assets/CellIdent-DwEyoN87.js","/assets/CellLink-C3ZvWH6g.js","/assets/Cells-DohNuAU7.js","/assets/ColumnFilter-D11Et_sl.js","/assets/ColumnsPicker-CJrINiXe.js","/assets/CommentsModal-B6XbhuGh.js","/assets/ComparisonTable-CIXO7MwI.js","/assets/Concerns-7BmNw8AW.js","/assets/Daily-DaHPQpbW.js","/assets/DataTable-DsP86l1q.js","/assets/DateRangePicker-CNkEJnYb.js","/assets/DayReportView-DcRwB9Ca.js","/assets/DayStepper-Bmv1T2yV.js","/assets/DifferenceBreakdown-WKdW9tkg.js","/assets/Downtime-CDwkQOrD.js","/assets/Education-CEcJW02t.js","/assets/EducationLesson-BtgTYGSH.js","/assets/EmptyState-t0XJpobW.js","/assets/Exam-BbKRqx3_.js","/assets/FactorySelect-DeQn1S_5.js","/assets/Gamification-CltfnBGF.js","/assets/GroupBadge-C3162Ibg.js","/assets/HeatmapChart-BQcbrHz8.js","/assets/IdleCell-BKmhizty.js","/assets/KPICard-BavQgK5t.js","/assets/Kaizen-v89lffr6.js","/assets/Kelish-DV8bhzST.js","/assets/KpiDeltaCard-mdUX3MSS.js","/assets/LangTextInput-BzqoMIHK.js","/assets/Layout-DpHBi6ug.js","/assets/LeaderAppeal-BtGJW3bN.js","/assets/LeaderDayReport-DO49X06g.js","/assets/LeaderUnitReport-GHYK9W7q.js","/assets/Leaderboard-CodaMEW_.js","/assets/Leaders-DJ24YGsQ.js","/assets/Lightbox-DKKPtudZ.js","/assets/LiveOverview-BIGvUJsq.js","/assets/Login-BTw63xYO.js","/assets/NotFound-BGYZlGLL.js","/assets/Notifications-Ctxahn44.js","/assets/Overview-CLhFoJOz.js","/assets/Pagination-CgMY9RoZ.js","/assets/PerenaladkaFactTable-BFLZax7C.js","/assets/PersonCard-BkhexMb1.js","/assets/PlanFulfillment-BywpZKmn.js","/assets/Production-Dxy2f7Rg.js","/assets/Profile-DC9L1N3N.js","/assets/ProofCamera-tqqb5eWK.js","/assets/ProofPhoto-Dzm76Fj_.js","/assets/Quality-Bwa2vAm8.js","/assets/RawRows-DoWL0UtW.js","/assets/RequestStateChip-BS6J1MvT.js","/assets/RichTextEditor-B-dnX5uf.js","/assets/SaveState-CFJAd24-.js","/assets/SearchInput-DBxo3gyk.js","/assets/SeasonalityHeatmap-ClozGDup.js","/assets/SegmentedToggle-DlP8dERW.js","/assets/SetupTimes-Bbp27hu4.js","/assets/ShiftDaily-BaeoXP8B.js","/assets/Staff-D0ZnVIOj.js","/assets/StaffLive-dfEh5nHv.js","/assets/StatusBadge-BomZmnr4.js","/assets/TargetGoal-DxfFWPzO.js","/assets/Targets-Dgr-Whrt.js","/assets/Tasks-DpAkQKr0.js","/assets/TimeWheelPicker-DupGfYb-.js","/assets/Toast-C2juwCd_.js","/assets/Tooltip-DDt3zsAl.js","/assets/TrendChart-Cmx5pQPE.js","/assets/TripleSpeedometer-DHiuD_Dn.js","/assets/Trudoyomkost-DzG6e4pP.js","/assets/Turnover-J8yfSQKo.js","/assets/UploadDropzone-Bhn9FIPW.js","/assets/UsersActivity-kLPimXjl.js","/assets/VerdictBlock-DDiBeIKI.js","/assets/VfxApiMap-ScEuIF8h.js","/assets/VfxDictionaries-Ccablz7S.js","/assets/VfxEmployees-CuPLliyo.js","/assets/VfxHrMoves-BJFBIYlG.js","/assets/VfxJobs-ncJwsG8i.js","/assets/VfxPhoto-DQUWa468.js","/assets/VfxShifts-CrFY6ozJ.js","/assets/VfxState-DfxEOQX7.js","/assets/VfxTimebooks-BnKFN1TT.js","/assets/VfxTimesheet-w0A4T0bt.js","/assets/WatchProgress-Cm_lOkxc.js","/assets/WebLogin-DGXccwNy.js","/assets/WorkerConcerns-BOzwHC6m.js","/assets/Workers-BvtDuRFc.js","/assets/Zagruzka-DvhoCCMT.js","/assets/ZagruzkaCell-OjlIvKWq.js","/assets/api-BMiOXWex.js","/assets/archive-BZJks05K.js","/assets/archive-restore-BQrVVZjd.js","/assets/arrow-down-CkiQKEGF.js","/assets/arrow-left-B0r3tDBq.js","/assets/arrow-up-BhUM383n.js","/assets/arrow-up-narrow-wide-0DKdNXRD.js","/assets/arrow-up-right-D7SVCYe-.js","/assets/award-D99vspVf.js","/assets/ban-BXi6vRnF.js","/assets/book-open-jYPpmveJ.js","/assets/bot-BbT2SbS1.js","/assets/boxes-c7DKAHit.js","/assets/braces-DMqZf_EV.js","/assets/brigadirFilters-C94yDzcD.js","/assets/broadcastTree-D_pdFatz.js","/assets/building-2-qW9VA_TA.js","/assets/calculator-QQso50SA.js","/assets/calendar-B-6LDV03.js","/assets/calendar-days-GMLcLBJD.js","/assets/camera-9bpU4pxC.js","/assets/categories-BsOq0HUW.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DHjHuMx2.js","/assets/chart-line-C-hblKlP.js","/assets/chart-pie-6nuCCW4c.js","/assets/chartRange-Do1Lxhn2.js","/assets/check-check-DDrC8Qp8.js","/assets/chevron-left-D9sHGCIE.js","/assets/chevrons-up-down-CYK86z8U.js","/assets/circle-Bh0fCeqU.js","/assets/circle-alert-BWboAnZQ.js","/assets/circle-check-big-UxoWTO0H.js","/assets/circle-dashed-ChytMiKN.js","/assets/circle-minus-610I1gkX.js","/assets/circle-question-mark-kpIfn2Mi.js","/assets/circle-slash-BazYIJwf.js","/assets/circle-user-round-BcG7ooBu.js","/assets/clock-3-CnqazLmT.js","/assets/cloud-off-DbpaSEuI.js","/assets/cloud-upload-CuVvF4or.js","/assets/compass-D2UrXYrB.js","/assets/concernCategories-BDU-dqsC.js","/assets/copy-C65ssrjq.js","/assets/corner-down-right-CXKzDImS.js","/assets/createLucideIcon-CMibbAGS.js","/assets/es-BU9eaoos.js","/assets/exportXlsx-0UR4UtNL.js","/assets/external-link-kB9giFy9.js","/assets/file-clock-BGiH6qmQ.js","/assets/file-exclamation-point-CFhdcMac.js","/assets/file-spreadsheet-BZW7mdkU.js","/assets/file-text-D0UQssch.js","/assets/flag-CooTax_r.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-B8zDbRis.js","/assets/hash-C3BCiz7O.js","/assets/history-Dl7nYuZW.js","/assets/hourglass-CbgnUhS_.js","/assets/image-BKpos3V6.js","/assets/image-off-CuXi6lIo.js","/assets/inbox-jEWnYkDb.js","/assets/index-BarTLmz_.css","/assets/index-D6cZ5Gjc.js","/assets/key-round-DXmV-5p7.js","/assets/keyboard-BfFOL46e.js","/assets/languages-B_yAAO-K.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-bzo18OuW.js","/assets/lightbulb-BKeD1CkN.js","/assets/link-2-BTJJKIUc.js","/assets/link-2-off-BqIdGX9Y.js","/assets/list-ordered-BTB_K7mt.js","/assets/list-tree-fYXvjcLm.js","/assets/lock-open-Bf9k4HLi.js","/assets/log-in-CpaOJN6p.js","/assets/maximize-2-DVfWjihB.js","/assets/message-square-BowVyksu.js","/assets/minimize-2-DhQz0v_Q.js","/assets/package-check-CvV8f3eI.js","/assets/paperclip-DgprtLC7.js","/assets/pencil-Dv2pK2R7.js","/assets/percent-BbF5MlQA.js","/assets/pin-BUu5ydHD.js","/assets/pin-off-D3bFRAh8.js","/assets/play-D97i5ryu.js","/assets/plug-zap-DDogpKJo.js","/assets/presentation-CjeZxHoM.js","/assets/prop-types-DKe72xbg.js","/assets/radio-6sc5r98g.js","/assets/react-apexcharts.esm-CQzAEFkm.js","/assets/registers-ClQ6P3Vl.js","/assets/repeat-Dtraehhj.js","/assets/rotate-ccw-mGQwyW2V.js","/assets/rotate-cw-Kmw-elg0.js","/assets/save-BGOuzT5g.js","/assets/scopeLinks-Cn7VpgOM.js","/assets/scroll-text-CwaoSNLl.js","/assets/search-x-C-cdkyYi.js","/assets/segments-BU6WCX8K.js","/assets/send-BdK7rUm5.js","/assets/settings-2-C0Bxp4PL.js","/assets/shield-CDUikE8e.js","/assets/shield-alert-DD1tqDJx.js","/assets/shield-check-Bf83m-bG.js","/assets/shield-question-mark-DCXKknLg.js","/assets/siren-CDxgvhEd.js","/assets/snowflake-YE26r63M.js","/assets/split-CeJQ-crD.js","/assets/square-CIE0dgfM.js","/assets/square-check-big-uRcXE6Lh.js","/assets/star-Bgn3Dd8k.js","/assets/statusBands-53Vk2KIi.js","/assets/store-k9JZvUkp.js","/assets/table-2-CXD5bfaO.js","/assets/table-properties-D-0A-S45.js","/assets/tag-BbfeiQXg.js","/assets/timer-off-DnOYU01n.js","/assets/trending-down-DF9hQEYS.js","/assets/trending-up-rBk2g8Hz.js","/assets/undo-2-CzrGNoRL.js","/assets/useChartTheme-BmCNmeed.js","/assets/useElementWidth-DrEUDx5B.js","/assets/useIsMobile-C78mTOMI.js","/assets/useOpenParam-CpNOh8l5.js","/assets/useStatusBands-DOQFR5r2.js","/assets/useUrlScope-aRpe7GAW.js","/assets/user-DwnVWMiN.js","/assets/user-cog-CApr_YVY.js","/assets/users-DTGzqUgQ.js","/assets/vfx-D9ImJiVB.js","/assets/video-BEhdfnCQ.js","/assets/wallet-BHng2fg0.js","/assets/warehouse-nBrqatpm.js","/assets/x-fhfvvWWX.js","/assets/zap-DqdKrfR4.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
