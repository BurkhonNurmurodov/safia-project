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

const BUILD = "2026-10-16T13:17:16.107Z";
const PRECACHE = ["/","/assets/AdminPanel-W_R_OmsV.js","/assets/AnalysisBoard-Cnt2C9S3.js","/assets/Arc-BQTA-0p_.js","/assets/Assistant-DltwzmVD.js","/assets/BrigadirProfile-D0dTG8RN.js","/assets/BroadcastReceivers-BoLFVFje.js","/assets/BroadcastRecord-C-J0d11K.js","/assets/Button-Cu9YOY9B.js","/assets/CatLockNotice-xU3g2bLw.js","/assets/CategoryLegendModal-DzG91f7g.js","/assets/CellConcerns-BHayG0RS.js","/assets/CellDetails-DKURFJdu.js","/assets/CellFormModal-BtQuyyDS.js","/assets/CellIdent-B-Gir6iQ.js","/assets/CellLink-BarqEyvs.js","/assets/Cells-Dx4Bgock.js","/assets/ColumnFilter-D1bIB2Ma.js","/assets/ColumnsPicker-CXKo4IN_.js","/assets/CommentsModal-Kx0IL9Ue.js","/assets/ComparisonTable-4BQiolil.js","/assets/Concerns-BEFe8jL0.js","/assets/CountStepper-CqwTbMbj.js","/assets/Daily-lf3nKSCO.js","/assets/DataTable-CZOTRXdh.js","/assets/DateRangePicker-lv67cEvP.js","/assets/DayReportView-Bwu8zXx_.js","/assets/DayStepper-BsyJZ3iV.js","/assets/DifferenceBreakdown-BQuKkmL7.js","/assets/Downtime-BIZd08RU.js","/assets/Education-CdvE--07.js","/assets/EducationLesson-B20zX8YA.js","/assets/EmptyState-CUeuvoC-.js","/assets/Exam-BinvrIfw.js","/assets/FactorySelect-AiiW3mAi.js","/assets/ForeignObjects-7dw-ltxW.js","/assets/Gamification-CLlA1YjF.js","/assets/GroupBadge-B_-AQQvM.js","/assets/HeatmapChart-DnO34lq_.js","/assets/IdleCell-BqB7CiOk.js","/assets/KPICard-q4-m6ZUp.js","/assets/Kaizen-DCU57wIi.js","/assets/Kelish-bN-GWXnv.js","/assets/KpiDeltaCard-Bd39r3lC.js","/assets/LangTextInput-B5RFyTKJ.js","/assets/Layout-DKYW7KmV.js","/assets/LeaderAppeal-B5euFFIu.js","/assets/LeaderDayReport-BVyh6BCn.js","/assets/LeaderUnitReport-DPHZYTcS.js","/assets/Leaderboard-PSsZd-AM.js","/assets/Leaders-BCRfY9G5.js","/assets/Lightbox-5zn7VO7G.js","/assets/LiveOverview-CwNQHU3D.js","/assets/Login-RnTrTivY.js","/assets/NotFound-BSC7FYHC.js","/assets/Notifications-CETevalT.js","/assets/Overview-Cbp6DyVp.js","/assets/Pagination-CnFGWyrm.js","/assets/PerenaladkaFactTable-CuPklixl.js","/assets/PersonCard-DP9wElku.js","/assets/PlanFulfillment-DjXdyX63.js","/assets/Production-DBQPcYHR.js","/assets/Profile-CNOs6rv8.js","/assets/ProofCamera-DtkM8VmD.js","/assets/Quality-BePBPOqK.js","/assets/RawRows-FgjyftQ7.js","/assets/RequestStateChip-D_njwul4.js","/assets/RichTextEditor-CcTJdlCV.js","/assets/SaveState-CUZ9knrA.js","/assets/SearchInput-Dq3pebHV.js","/assets/SeasonalityHeatmap-DH9jXez7.js","/assets/SegmentedToggle-CMbdbHF4.js","/assets/SetupTimes-DvmxfAkq.js","/assets/ShiftDaily-TUjJQPaZ.js","/assets/Staff-BXqD-9Kj.js","/assets/StaffListAtCheck-BhpMbrTI.js","/assets/StatusBadge-f9vlOdiT.js","/assets/TargetGoal-D9z1Vu2J.js","/assets/Targets-DDZs6g-U.js","/assets/Tasks-CUVbQWW5.js","/assets/TimeWheelPicker-DmZD8SA1.js","/assets/Toast-D8VgfkLm.js","/assets/Tooltip-Bu1gD8TR.js","/assets/TrendChart-CG9QNPTl.js","/assets/TripleSpeedometer-CwdLNvxH.js","/assets/Trudoyomkost-CIw8bwq8.js","/assets/Turnover-oGDHChG1.js","/assets/TurnoverBits-BwrMoR6O.js","/assets/UploadDropzone-kWctJfQg.js","/assets/UsersActivity-YlpD5EQJ.js","/assets/VerdictBlock-KlF9CY1s.js","/assets/VfxApiMap-BeO5lM-y.js","/assets/VfxDictionaries-B9VQ3OwO.js","/assets/VfxEmployees-CAnMfPRu.js","/assets/VfxHrMoves-C-by_cew.js","/assets/VfxJobs-D-oD_dR2.js","/assets/VfxPhoto-BUO_a9VL.js","/assets/VfxShifts-CMtPGH4v.js","/assets/VfxState-CfASi6uK.js","/assets/VfxTimebooks-ChV7tRYA.js","/assets/VfxTimesheet-BC3oeOBL.js","/assets/WatchProgress-Ck9SPiV0.js","/assets/WebLogin-DhCqet8r.js","/assets/WorkerConcerns-BpmdFkVe.js","/assets/Workers-DA4O_yoS.js","/assets/Zagruzka-BpyZbw7g.js","/assets/ZagruzkaCell-DLRXi4cd.js","/assets/api-Dh7hxfC4.js","/assets/archive-DOBxFa5V.js","/assets/archive-restore-IgPsp0Yi.js","/assets/arrow-down-B561pa0m.js","/assets/arrow-down-wide-narrow-zjZnjhEY.js","/assets/arrow-up-narrow-wide-DoCDK54d.js","/assets/award-BDOHmjbH.js","/assets/ban-jMjagc3k.js","/assets/boxes-CDqEmbNr.js","/assets/braces-B0jF7ogK.js","/assets/brigadirFilters-CgM6oE5d.js","/assets/broadcastTree-CLahd-Qa.js","/assets/building-2-DBOE2EGO.js","/assets/calculator-DcnkWI3_.js","/assets/calendar-SNgyrZLT.js","/assets/calendar-days-C5Xv2X60.js","/assets/camera-BvzOnRi5.js","/assets/categories-CWULZKMZ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DdCrc9GV.js","/assets/chart-line-C4UnvCmB.js","/assets/chart-pie-C9bKUuX5.js","/assets/chartRange-DdNWU6Zk.js","/assets/check-check-NV2pigov.js","/assets/chevron-left-BQSVqEfO.js","/assets/chevrons-up-down-CROlz9N3.js","/assets/circle-CkCNMVF9.js","/assets/circle-alert-BBlp6Ii-.js","/assets/circle-check-big-DP3EqAZT.js","/assets/circle-dashed-C9DgEk89.js","/assets/circle-minus-CWrirBd5.js","/assets/circle-question-mark-B4DnQKMz.js","/assets/circle-slash-D42RpiPl.js","/assets/circle-user-round-BrnD_c_t.js","/assets/clock-3-DXqE3eJC.js","/assets/cloud-off-Bfjvbgp4.js","/assets/cloud-upload-DdRCoT-2.js","/assets/compass-D2cFQv50.js","/assets/concernCategories-Cn7EoQ58.js","/assets/copy-uhwsuo1d.js","/assets/corner-down-right-B2OCJsny.js","/assets/createLucideIcon-BwwyTeG1.js","/assets/es-IfeLvCf4.js","/assets/external-link-oQRqwHlB.js","/assets/file-clock-B4JPBouW.js","/assets/file-exclamation-point-CQKzrK9J.js","/assets/flag-DQV0xdd3.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DzCNswqv.js","/assets/hash-XuIsAPc9.js","/assets/hourglass-P4HXKsjE.js","/assets/image-B1n_uj2T.js","/assets/image-off-CbJzoowh.js","/assets/inbox-CEPV6D29.js","/assets/index-CjWd7Ymy.js","/assets/index-DqsFM9e_.css","/assets/keyboard-AMCLifmX.js","/assets/languages-D5PRnCil.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Bpvai_c2.js","/assets/lightbulb-CJzfIVUx.js","/assets/link-2-COMc7UQq.js","/assets/link-2-off-BI7U5DLv.js","/assets/list-ordered-Cvb2mNiM.js","/assets/list-tree-LIhVdrEZ.js","/assets/lock-open-YxpzP4aH.js","/assets/log-in-jEaN2m3q.js","/assets/marks-tNqpzUZl.js","/assets/minimize-2-DhTeBOZ1.js","/assets/package-check-Bw5zTzch.js","/assets/pencil-Cz5vct0L.js","/assets/percent-TNJB8eBt.js","/assets/pin-Sqe2RmyB.js","/assets/pin-off-yydkPbJY.js","/assets/play-4aNF1IA9.js","/assets/plug-zap-Rr_ri9iH.js","/assets/prop-types-DEe5SgmL.js","/assets/radio-CJed3-ou.js","/assets/react-apexcharts.esm-DR5JLlYJ.js","/assets/registers-CBZZ3StS.js","/assets/repeat-C0OzkfCw.js","/assets/save-BAXiasOz.js","/assets/scopeLinks-D1WLtdRd.js","/assets/scroll-text-CgYuC-9R.js","/assets/search-x-RMcwcwyD.js","/assets/segments-DRPuIq53.js","/assets/send--ZFzSK_8.js","/assets/settings-2-BhsDDyM-.js","/assets/shield-5KTjca6p.js","/assets/shield-alert-DzQl3VXB.js","/assets/shield-question-mark-C6rmUS0M.js","/assets/siren-BEqi4tWQ.js","/assets/snowflake-B74lQx9_.js","/assets/split-CbwXigGE.js","/assets/square-check-big-C1ubvOLo.js","/assets/star-COAz2Fxc.js","/assets/statusBands-7uv-sJL9.js","/assets/store-BchKbfBa.js","/assets/table-2-BTDuNBx3.js","/assets/table-properties-DNSJBlLV.js","/assets/tag-DpzdOs4k.js","/assets/timer-off-dfwgUhP_.js","/assets/trending-down-COfqzstB.js","/assets/trending-up-Dycs2oEh.js","/assets/undo-2-ChEW-sR5.js","/assets/useChartTheme-BIaanQ7R.js","/assets/useElementWidth-dkwbt-fq.js","/assets/useIsMobile-a_DXff4n.js","/assets/useOpenParam-D4rO7K1P.js","/assets/useStatusBands-BoaO22iy.js","/assets/useUrlScope-CfWhcWpF.js","/assets/user-CN3zY3Q4.js","/assets/user-cog-DENW91Z4.js","/assets/users-DGtqEIFK.js","/assets/vfx-jnnCbGel.js","/assets/video-qDwnlwsW.js","/assets/wallet-e7PMzzjm.js","/assets/warehouse-DMgnDN9-.js","/assets/workflow-B6s9Cu_F.js","/assets/x-CFTBkwHe.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
