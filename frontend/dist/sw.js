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

const BUILD = "2026-09-30T10:57:31.409Z";
const PRECACHE = ["/","/assets/AdminPanel-Dy8FlCHi.js","/assets/AnalysisBoard-LpR6orYc.js","/assets/Arc-BUJ2ZrDV.js","/assets/ArcLegacy-BXlPINal.js","/assets/AttendanceModal-PfITGnKT.js","/assets/BrigadirProfile-BzvDh1d_.js","/assets/BroadcastReceivers-DrddMCwP.js","/assets/BroadcastRecord-C4ClC6Iz.js","/assets/CatLockNotice-_-IVBsEJ.js","/assets/CategoryLegendModal-DrFfHHf-.js","/assets/CellConcerns-DWywocZ2.js","/assets/CellDetails-CoCJKcKJ.js","/assets/CellFormModal-D6v_Ljqs.js","/assets/CellLink-CCYG0g7-.js","/assets/Cells-D39QdQ-R.js","/assets/ColumnFilter-DW3UaO54.js","/assets/ColumnsPicker-DSKe1JiC.js","/assets/CommentsModal-CJFlHIhG.js","/assets/ComparisonTable-XvysMBzg.js","/assets/Concerns-BIcH3Uis.js","/assets/ConfirmDialog-Dov0zxOu.js","/assets/Daily-033EzRi1.js","/assets/DataTable-DQTcxWJq.js","/assets/DateRangePicker-Dvo8eutQ.js","/assets/DayReportView-BnvJZW4V.js","/assets/DayStepper-Cm3-GAHm.js","/assets/DifferenceBreakdown-BHK3akQP.js","/assets/Downtime-BpaR7Qse.js","/assets/Education-CpVw1HDI.js","/assets/EducationLesson-pV4vDd9x.js","/assets/EmptyState-BkCeTpyH.js","/assets/Exam-Ors-xd4L.js","/assets/FactorySelect-BPob3YSE.js","/assets/Gamification-CI-JGiGs.js","/assets/GroupBadge-6cjYj7mo.js","/assets/HeatmapChart-Ddljnupl.js","/assets/IdleCell-BXFAqO25.js","/assets/KPICard-1GQP8fxN.js","/assets/Kaizen-BjrXAgBB.js","/assets/Kelish-Cf3ypF4f.js","/assets/KpiDeltaCard-DoHy6NNe.js","/assets/LangTextInput-B9x-gH8d.js","/assets/Layout-Cgcwmgyo.js","/assets/LeaderAppeal-BuuosalX.js","/assets/LeaderDayReport-CTDeHXHq.js","/assets/LeaderUnitReport-D6Gkvio4.js","/assets/Leaderboard-DKgkPgh3.js","/assets/Leaders-f-chWgEf.js","/assets/Lightbox-B4i5yCdW.js","/assets/LiveOverview-XZdleDuL.js","/assets/Login-DZIL8WUB.js","/assets/NotFound-hbvErkyQ.js","/assets/Overview-Q1RNd9Xu.js","/assets/Pagination-Lk0W9Mnw.js","/assets/PerenaladkaFactTable-DyHa-7rm.js","/assets/PlanFulfillment-BauCiozr.js","/assets/Production-xlOxz4yd.js","/assets/Profile-CdN2JiDy.js","/assets/ProofCamera-Di_X2qEp.js","/assets/ProofPhoto-BCZTFEuo.js","/assets/Quality-TeXYDgkO.js","/assets/RequestStateChip-D4rbJWYn.js","/assets/RichTextEditor-DAYkN4cP.js","/assets/SaveState-CJXoiU1f.js","/assets/SearchInput-CblS5Lgc.js","/assets/SeasonalityHeatmap-DrdL0GBo.js","/assets/SegmentedToggle-BJc0tuFK.js","/assets/SetupTimes-lyctZpYs.js","/assets/ShiftDaily-BkhK5fqA.js","/assets/Staff-Dn3pUi2N.js","/assets/StatusBadge-CP9tksFk.js","/assets/TargetGoal-DnD6oAhB.js","/assets/Targets-DsyTmDDG.js","/assets/Tasks-CMIHvA-D.js","/assets/TimeWheelPicker-CIZcbf94.js","/assets/Tooltip-C1NXJ8To.js","/assets/TrendChart-B1rhGJEd.js","/assets/TripleSpeedometer-CPu2gbnU.js","/assets/Trudoyomkost-DhbYaX4i.js","/assets/UploadDropzone-C-NXUTTg.js","/assets/UsersActivity-CaK3ydvZ.js","/assets/VerdictBlock-CFVF6SVB.js","/assets/WatchProgress-B9ysQu_Q.js","/assets/WebLogin-g9Wg1CGm.js","/assets/WorkerConcerns-CdPs80Nm.js","/assets/Workers-DHqUWSJq.js","/assets/Zagruzka-DUSE759O.js","/assets/ZagruzkaCell-iKGhNiNi.js","/assets/api-BZS1brpe.js","/assets/archive-BRogZf8o.js","/assets/archive-restore-BlBKAN1Z.js","/assets/arrow-down-CoiFE0TK.js","/assets/arrow-left-DXRlOzyA.js","/assets/arrow-left-right-BBxtXp0_.js","/assets/arrow-up-BFVw4sSM.js","/assets/arrow-up-narrow-wide-Ci6BsRtR.js","/assets/arrow-up-right-qNkaaoz9.js","/assets/award-DzfgjLiU.js","/assets/ban-B0pzj-SL.js","/assets/bot-CwXyceaV.js","/assets/boxes-CeRMkpQJ.js","/assets/brigadirFilters-DjWWpegu.js","/assets/broadcastTree-C4ar5ELg.js","/assets/building-2-BpTE_A4P.js","/assets/calendar-DVIAvyIb.js","/assets/calendar-clock-CRkL9CNp.js","/assets/calendar-days-48rxDubv.js","/assets/calendar-range-DCtu38xw.js","/assets/camera-Co5b9zm2.js","/assets/categories-C-G7FrLo.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cktbpu5z.js","/assets/chart-line-BNaMfv06.js","/assets/chart-pie-B8HVxSHw.js","/assets/chartRange-DBVgikR7.js","/assets/chevron-left-DuqciO2c.js","/assets/chevrons-up-down-Bl2ZMq2e.js","/assets/circle-AsXK-pWe.js","/assets/circle-check-big-BAY3BOHo.js","/assets/circle-dot-D_ZqNLTa.js","/assets/circle-minus-BEyvtuC6.js","/assets/circle-slash-WTwo0Hwd.js","/assets/circle-user-round-D67ryNuw.js","/assets/cloud-off-BlAaqgSX.js","/assets/cloud-upload-BUjc8AWj.js","/assets/compass-D3-9bsuE.js","/assets/concernCategories-BQU7pShW.js","/assets/copy-m9QUkQDE.js","/assets/corner-down-right-DcitGtmr.js","/assets/createLucideIcon-DEig_xQu.js","/assets/es-DjxThrpG.js","/assets/exportXlsx-CQI_RWwe.js","/assets/external-link-BbHDKiIh.js","/assets/file-clock-DoAuDFES.js","/assets/file-exclamation-point-DRgOl1yk.js","/assets/file-spreadsheet-2s7ZGbxn.js","/assets/file-text-CCrRjv3-.js","/assets/flag-Df7lhFBN.js","/assets/flame-ulMIP5ms.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CiLMahaq.js","/assets/hash-B5L6LvqQ.js","/assets/history-BfAR694z.js","/assets/hourglass-DwQj9F46.js","/assets/image-DBqeoUQ-.js","/assets/image-off-M3odLoZC.js","/assets/index-2AQYepis.js","/assets/index-Bn5n-OZu.css","/assets/key-round-CydsXevJ.js","/assets/keyboard-DqbHR7lt.js","/assets/languages-BPYv8YWw.js","/assets/layers-CWnrgY9l.js","/assets/lightbulb-G0S7q93y.js","/assets/link-2-B7207xL-.js","/assets/link-2-off-BjpwJeSQ.js","/assets/list-checks-DDYK0ndr.js","/assets/list-ordered-D7SFz2Sm.js","/assets/list-tree-mc2SZdMV.js","/assets/lock-open-DM0853-p.js","/assets/log-in-B3qPgFYL.js","/assets/maximize-2-BnQScN5R.js","/assets/message-square-DdELL8i4.js","/assets/minimize-2-C5K7dbL4.js","/assets/package-check-dmnP_e2a.js","/assets/paperclip-_P136Bdr.js","/assets/pencil-CCdha5jp.js","/assets/percent-DmiWEM-0.js","/assets/personName-CogOuS3K.js","/assets/pin-R1v-2AMI.js","/assets/pin-off-CTnN-4wb.js","/assets/play-D9lXa_tc.js","/assets/presentation-B0W1BpeA.js","/assets/prop-types-BG4QDA1K.js","/assets/radio-5NjwQ7si.js","/assets/react-apexcharts.esm-D9-TlceA.js","/assets/repeat-BxrfqV9Y.js","/assets/rotate-ccw-B7UEM6DK.js","/assets/rotate-cw-_JHeP7Rs.js","/assets/save-CuHrDA3X.js","/assets/scale-DMe79xFN.js","/assets/scopeLinks-BLNuT3gJ.js","/assets/scroll-text-B629P1uJ.js","/assets/search-x-DgRBqEld.js","/assets/segments-C57Wz_FW.js","/assets/send-EDOEL_tJ.js","/assets/settings-2-C9Io1wFi.js","/assets/shield-DBuklrsr.js","/assets/shield-alert-DcyWVl2Y.js","/assets/shield-check-B2OyfLDN.js","/assets/shield-question-mark-BC0WMec0.js","/assets/siren-B52vmN8J.js","/assets/snowflake-D40epQR8.js","/assets/square-B6S8boPK.js","/assets/square-check-big-uoIH_4w3.js","/assets/star-K1VIawqP.js","/assets/statusBands-D7A2bs4P.js","/assets/store-CK3aWPux.js","/assets/table-2-DadUhnoj.js","/assets/table-properties-D4Tvog54.js","/assets/tag-JUww0f6r.js","/assets/timer-off-BWJQHKIL.js","/assets/trending-down-Co8k6ue1.js","/assets/trending-up-DRa6DD5l.js","/assets/undo-2-CRDOH_jn.js","/assets/useChartTheme-BnCbxLyN.js","/assets/useElementWidth-DWZ8kWJ_.js","/assets/useIsMobile-QWNeLc3B.js","/assets/useMutation-CguvAFgP.js","/assets/useStatusBands-BygTQ2ve.js","/assets/useUrlScope-BbR7RgXD.js","/assets/user-DBCSfzUX.js","/assets/user-cog-CDDboool.js","/assets/user-minus-CX-FDpQb.js","/assets/users-C8bQV0oQ.js","/assets/video-B82_sHu5.js","/assets/wallet-Cmqk8Nu8.js","/assets/warehouse-BHdRe8l-.js","/assets/zap-CESy_TQg.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
