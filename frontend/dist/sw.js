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

const BUILD = "2026-10-04T09:24:13.711Z";
const PRECACHE = ["/","/assets/AdminPanel-DXhrc9eB.js","/assets/AnalysisBoard-CR-kJiyU.js","/assets/Arc-CCBKh-J0.js","/assets/ArcLegacy-BGCogBAk.js","/assets/BrigadirProfile-DBBcxWcD.js","/assets/BroadcastReceivers-DErcToXv.js","/assets/BroadcastRecord-B_s-v9at.js","/assets/CatLockNotice-OuWQ7Akf.js","/assets/CategoryLegendModal-98ve4Pcy.js","/assets/CellConcerns-CYGogwjO.js","/assets/CellDetails-Fnoif1U2.js","/assets/CellFormModal-PFJ5hCnV.js","/assets/CellIdent-CgZbinbO.js","/assets/CellLink-Du6gfg_8.js","/assets/Cells-3sSbbh5_.js","/assets/ColumnFilter-1vQk3iQX.js","/assets/ColumnsPicker-B05GS8RU.js","/assets/CommentsModal-ClxydOfb.js","/assets/ComparisonTable-BlqXeCm_.js","/assets/Concerns-_CoSqPHU.js","/assets/ConfirmDialog-C6mKHuDv.js","/assets/Daily-SqK3NpP1.js","/assets/DataTable-BN3fB-tB.js","/assets/DateRangePicker-Cqs-Qgrc.js","/assets/DayReportView-7HLUQnOs.js","/assets/DayStepper-CV39k2kL.js","/assets/DifferenceBreakdown-CgPbWK1g.js","/assets/Downtime-DQj1TLif.js","/assets/Education-CHlWZ69t.js","/assets/EducationLesson-DuoYQVmu.js","/assets/EmptyState-CVFyxrjB.js","/assets/Exam-BkA1kOCU.js","/assets/FactorySelect-COUtDyM-.js","/assets/Gamification-O14IqvdI.js","/assets/GroupBadge-B77fAspO.js","/assets/HeatmapChart-CTHeAjrz.js","/assets/IdleCell-DY9HSBZ_.js","/assets/KPICard-yfHHwf4Z.js","/assets/Kaizen-BN4eKi1O.js","/assets/Kelish-DzJ1spgD.js","/assets/KpiDeltaCard-COEYNm-U.js","/assets/LangTextInput-DnfK4pls.js","/assets/Layout-DySllI0D.js","/assets/LeaderAppeal-DBtr0Lm5.js","/assets/LeaderDayReport-CA8UDY7u.js","/assets/LeaderUnitReport-CJq8FgVj.js","/assets/Leaderboard-CATQvEr0.js","/assets/Leaders-DDxXhJll.js","/assets/Lightbox-Bqmzrbow.js","/assets/LiveOverview--SFQQ152.js","/assets/Login-RlqdmucC.js","/assets/NotFound-CsNQDdnt.js","/assets/Notifications-AWQxBLOl.js","/assets/Overview-B84ra2WU.js","/assets/Pagination-BXMF29Sr.js","/assets/PerenaladkaFactTable-Sn3mTLRp.js","/assets/PersonCard-B-UjqQV-.js","/assets/PlanFulfillment-DVLPX8op.js","/assets/Production-oIxBjKu9.js","/assets/Profile-3YN0G7LS.js","/assets/ProofCamera-DAfxHrFP.js","/assets/ProofPhoto-BAb1JunE.js","/assets/Quality-BSRqN-pd.js","/assets/RawRows-Cy_YVuPq.js","/assets/RequestStateChip-DSb3WnUn.js","/assets/RichTextEditor-DFfa4iHf.js","/assets/SaveState-C1xSvJln.js","/assets/SearchInput-ClVpCx9i.js","/assets/SeasonalityHeatmap-xYMHg76B.js","/assets/SegmentedToggle-CNHwC0QK.js","/assets/SetupTimes-aNf9jkYb.js","/assets/ShiftDaily-BzIzxWyc.js","/assets/Staff-HsPC1kMY.js","/assets/StaffLive-CnqZ68sM.js","/assets/StatusBadge-CCVInIRy.js","/assets/TargetGoal-Cf3pzO5-.js","/assets/Targets-Ddx4Emzu.js","/assets/Tasks-DzQX-6wI.js","/assets/TimeWheelPicker-B319MiQL.js","/assets/Toast-DdL6v5kz.js","/assets/Tooltip-YdMKvtH0.js","/assets/TrendChart-C_TCVWe1.js","/assets/TripleSpeedometer-5chD9V1H.js","/assets/Trudoyomkost-Ca-J6-8h.js","/assets/UploadDropzone-CDtWNzIo.js","/assets/UsersActivity-CX9z5_cs.js","/assets/VerdictBlock-DaPIgFfB.js","/assets/VfxAbsences-DZ3yr9yd.js","/assets/VfxApiMap-CFCqTa79.js","/assets/VfxDevices-DJe_J3b-.js","/assets/VfxDictionaries-Dvx3XS7t.js","/assets/VfxEmployees-DC3oetL7.js","/assets/VfxHrMoves-D1b-TUaK.js","/assets/VfxIncidents-BTbArGBp.js","/assets/VfxJobs-C7xf9oP0.js","/assets/VfxMarks-zicBMBQV.js","/assets/VfxOnSite-DQQ41cgB.js","/assets/VfxPhoto-D2ogn-V2.js","/assets/VfxRequests-DD3T3wjE.js","/assets/VfxShifts-CEKVAHEy.js","/assets/VfxState-BlePJvVt.js","/assets/VfxStructure-C-3PLK04.js","/assets/VfxTable-CFgWz9ZI.js","/assets/VfxTimebooks-DUHXRKAB.js","/assets/VfxTimesheet-Df-n_FA7.js","/assets/WatchProgress-CwB86tcW.js","/assets/WebLogin-DVs4tNQG.js","/assets/WorkerConcerns-HeLVy9bc.js","/assets/Workers-3euY-EKA.js","/assets/Zagruzka-D3tjoPVO.js","/assets/ZagruzkaCell-Bk1DCg7n.js","/assets/api-BcDz5Gym.js","/assets/archive-restore-Cx07xNoW.js","/assets/archive-vvwNamnU.js","/assets/arrow-down-C7r4uarQ.js","/assets/arrow-left-a7aBOivt.js","/assets/arrow-up-Bov8AJN6.js","/assets/arrow-up-narrow-wide-CTXd-Grg.js","/assets/arrow-up-right-QC9ff1P2.js","/assets/award-DfcupzeI.js","/assets/ban-41MWQl0S.js","/assets/bot-CpC0G-Kn.js","/assets/boxes-DMOhXBE8.js","/assets/braces-BmgjDpu1.js","/assets/brigadirFilters-D0oIHmIq.js","/assets/broadcastTree-DT6oJ_-D.js","/assets/building-2-Dknr9rsr.js","/assets/calendar-SOTokfA7.js","/assets/calendar-days-BoDbMm15.js","/assets/camera-BKtxlnwf.js","/assets/categories-BIVtwfQQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-uSdNj195.js","/assets/chart-line-C2H5h7TU.js","/assets/chart-pie-Cx7QmzCB.js","/assets/chartRange-B1eyr747.js","/assets/check-check-BSeW-f9v.js","/assets/chevron-left-CqBtyTip.js","/assets/chevrons-up-down-cpS5RVmg.js","/assets/circle-CQWlCS3x.js","/assets/circle-alert-D6p2tefr.js","/assets/circle-check-big-Dsesrh7j.js","/assets/circle-dashed-B3sg_wuw.js","/assets/circle-minus-AX81pgJD.js","/assets/circle-question-mark-7eOKHRrQ.js","/assets/circle-slash-BBt2SOH0.js","/assets/circle-user-round-X1n21nwo.js","/assets/clock-3-D3UYpTBP.js","/assets/cloud-off-jxfaTau_.js","/assets/cloud-upload-CLm9QmGA.js","/assets/compass-er2MLhMY.js","/assets/concernCategories-BUIXOBj0.js","/assets/copy-8rf-5ykj.js","/assets/corner-down-right-Bc911ZZS.js","/assets/createLucideIcon-D7Z8HwAY.js","/assets/door-open-zaKJTACj.js","/assets/es-BkD6tXXX.js","/assets/exportXlsx-CmjpsxXq.js","/assets/external-link-BO_THMru.js","/assets/file-clock-BkPxlov6.js","/assets/file-exclamation-point-AWMUWp20.js","/assets/file-spreadsheet-gIM7y_j3.js","/assets/file-text-63tDKUrQ.js","/assets/flag-CW0_Xqhi.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DyVrwKVW.js","/assets/hash-sSxGiVGp.js","/assets/history-DJs41IjU.js","/assets/hourglass-apkWEC0o.js","/assets/image-BlUtcOPi.js","/assets/image-off-B7WaNmH1.js","/assets/index-B7RbwW6q.css","/assets/index-DHC-sx7P.js","/assets/key-round-DxdnxkBh.js","/assets/keyboard-CSKhhNJj.js","/assets/languages-Pn1gOuLm.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DGneEPhS.js","/assets/lightbulb-AGuvorF0.js","/assets/link-2-D_we8mW9.js","/assets/link-2-off-BdZwU4qi.js","/assets/list-filter-CdnJ4YAe.js","/assets/list-ordered-B06wx5TL.js","/assets/list-tree-BnX1EsxF.js","/assets/lock-open-CrcBHUZj.js","/assets/log-in-CLDMNiZY.js","/assets/maximize-2-ukyjPzbL.js","/assets/message-square-CStqsShF.js","/assets/minimize-2--DjXnoFS.js","/assets/package-check-_hQnaD9k.js","/assets/paperclip-B0f9Yq6c.js","/assets/pencil-XEL4ALIo.js","/assets/percent-DUJJYMbJ.js","/assets/phone-DXjvmfGR.js","/assets/pin-C1663v54.js","/assets/pin-off-B0qZPGAn.js","/assets/play-DlYiZwcU.js","/assets/plug-zap-Bbyh0iol.js","/assets/presentation-BjR7__mu.js","/assets/prop-types-Lrtlq2xd.js","/assets/radio-BTKymbJ0.js","/assets/react-apexcharts.esm-DXCUhkQb.js","/assets/registers-oqnHcuRl.js","/assets/repeat-sqKM9u2Z.js","/assets/rotate-ccw-DTYbD7FI.js","/assets/rotate-cw-CBq9g4-2.js","/assets/save-CvOKFGz0.js","/assets/scopeLinks-C43JLGwR.js","/assets/scroll-text-CJtPjqHh.js","/assets/search-x-C-cJWIAc.js","/assets/segments-BAcs9R6P.js","/assets/send-COphlzkJ.js","/assets/settings-2-CaXRGG-0.js","/assets/shield-BucFky5O.js","/assets/shield-alert-BXoJnRwO.js","/assets/shield-check-V--Suu1N.js","/assets/shield-question-mark-BoW6ebMV.js","/assets/snowflake-B35jylai.js","/assets/split-DxMm-grh.js","/assets/square-DZ0UsYXD.js","/assets/square-check-big-DSIhcHlZ.js","/assets/star-b7qAvb71.js","/assets/statusBands-CkG5VLme.js","/assets/store-B7vq1KDh.js","/assets/table-2-BL5-ZSdH.js","/assets/table-properties-CZ2kggqw.js","/assets/tag-GQ4VvpFP.js","/assets/tags-s1O2tKFg.js","/assets/timer-off-CZHe0zZo.js","/assets/trending-down-DKyA-Zv_.js","/assets/trending-up-Bv7wqSog.js","/assets/undo-2-Co7y1ES4.js","/assets/useChartTheme-B6QvM5A4.js","/assets/useElementWidth-DNf7aqJI.js","/assets/useIsMobile-D3-Qw0eW.js","/assets/useOpenParam-CiedOKCY.js","/assets/useStatusBands-DAFlymND.js","/assets/useUrlScope-BMyFkfnl.js","/assets/user-ChsyHwJu.js","/assets/user-cog-2idhmjCk.js","/assets/user-minus-CbC92dgU.js","/assets/users-Z6nUMMAe.js","/assets/video-BDXUrfiN.js","/assets/wallet-DESI_fsN.js","/assets/warehouse-Cr4ZEo27.js","/assets/x-BpEybZke.js","/assets/zap-FIrCI-p4.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
