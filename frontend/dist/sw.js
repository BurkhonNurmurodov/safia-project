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

const BUILD = "2026-10-10T09:37:16.842Z";
const PRECACHE = ["/","/assets/AdminPanel-CNiHcnk-.js","/assets/AnalysisBoard-79kSY6pz.js","/assets/Arc-CGCCH5sY.js","/assets/Assistant-DUGlAgfK.js","/assets/BrigadirProfile-B-LkZk13.js","/assets/BroadcastReceivers-DNfrtZ4X.js","/assets/BroadcastRecord-zX-rwnkp.js","/assets/Button-D4Nh8ipC.js","/assets/CatLockNotice-DHUdqDyX.js","/assets/CategoryLegendModal-y4zOVDVX.js","/assets/CellConcerns-5DIkaQWT.js","/assets/CellDetails-CrtXB4KF.js","/assets/CellFormModal-DOc1VqOO.js","/assets/CellIdent-QY_MOCwV.js","/assets/CellLink-Cwpox0GM.js","/assets/Cells-BDepA0oB.js","/assets/ColumnFilter-D2YFqoTT.js","/assets/ColumnsPicker-J28khaET.js","/assets/CommentsModal-DBaZ53PG.js","/assets/ComparisonTable-Cv4T-1k4.js","/assets/Concerns-Bl5XgFFZ.js","/assets/Daily-Ckq8XhzG.js","/assets/DataTable-B2YCJO3v.js","/assets/DateRangePicker-DryTZ-94.js","/assets/DayReportView-DS-nInYh.js","/assets/DayStepper-5ysOPvPb.js","/assets/DifferenceBreakdown-DAUS1nVI.js","/assets/Downtime-Cx9_TjzA.js","/assets/Education-CNuFDh7a.js","/assets/EducationLesson-DAGD_TxG.js","/assets/EmptyState-NkCX87oc.js","/assets/Exam-BvD9xOBR.js","/assets/FactorySelect-BC3wOnUg.js","/assets/Gamification-Cw_pWePE.js","/assets/GroupBadge-Dgc8aQbw.js","/assets/HeatmapChart-DdOVyzyS.js","/assets/IdleCell-DZWBvMYS.js","/assets/KPICard-wPD1k0Il.js","/assets/Kaizen-DQkKXPpT.js","/assets/Kelish-Dj-ucv8G.js","/assets/KpiDeltaCard-DC0ZB6Nz.js","/assets/LangTextInput-CQCI3-hs.js","/assets/Layout-B6xsLlui.js","/assets/LeaderAppeal-B7SIORoj.js","/assets/LeaderDayReport-D7ffWvdj.js","/assets/LeaderUnitReport-_4nF91VE.js","/assets/Leaderboard-C9suYHrY.js","/assets/Leaders-gF9gBDjw.js","/assets/Lightbox-BPzaMHXd.js","/assets/LiveOverview-DA4Njy1Z.js","/assets/Login-C7LP_tRd.js","/assets/NotFound-DrUhBlwh.js","/assets/Notifications-Vrh0dxVK.js","/assets/Overview-RJvLkyIQ.js","/assets/Pagination-NA46ciOE.js","/assets/PerenaladkaFactTable-BEx2jKRJ.js","/assets/PersonCard-BcYQFhG0.js","/assets/PlanFulfillment-D-ckvwDK.js","/assets/Production-Cwbj9Nf-.js","/assets/Profile-1zu7u0kO.js","/assets/ProofCamera-CNLSxtTL.js","/assets/ProofPhoto-Bf_m-_JX.js","/assets/Quality-DRR77ZHI.js","/assets/RawRows-Dp9GQckn.js","/assets/RequestStateChip-Bks9BkXe.js","/assets/RichTextEditor-DYX_E_xl.js","/assets/SaveState-a4gsCBMO.js","/assets/SearchInput-C1QFJNxR.js","/assets/SeasonalityHeatmap-BEXjusvJ.js","/assets/SegmentedToggle-BAx0G8wk.js","/assets/SetupTimes-CfnxkW7G.js","/assets/ShiftDaily-Bc2u1Yl1.js","/assets/Staff-Brg2QE9S.js","/assets/StatusBadge-CMIk4UVA.js","/assets/TargetGoal-BYeVBtI_.js","/assets/Targets-Bsj6sjvA.js","/assets/Tasks-BNuElATJ.js","/assets/TimeWheelPicker-B8vIWWbl.js","/assets/Toast-DeH6yO1U.js","/assets/Tooltip-Df6gnToB.js","/assets/TrendChart-CUlT9lo8.js","/assets/TripleSpeedometer-7slrBOG4.js","/assets/Trudoyomkost-CjUn0QZf.js","/assets/Turnover-l1R1C5-z.js","/assets/UploadDropzone-ik8ly-Ve.js","/assets/UsersActivity-BSUfuiT3.js","/assets/VerdictBlock-BZd6D8iE.js","/assets/VfxApiMap-QIP6EPQs.js","/assets/VfxDictionaries-BB_5WFdp.js","/assets/VfxEmployees-DA8P0Q0I.js","/assets/VfxHrMoves-fvW4jvQb.js","/assets/VfxJobs-D19svxoD.js","/assets/VfxPhoto-Bt81iVp5.js","/assets/VfxShifts-ClYU6Ybz.js","/assets/VfxState-CrcBUaqr.js","/assets/VfxTimebooks-B6Hl8pDE.js","/assets/VfxTimesheet-CwiwTNEE.js","/assets/WatchProgress-DcHkMi6Z.js","/assets/WebLogin-ZMWhNXc1.js","/assets/WorkerConcerns-GFvrzJt-.js","/assets/Workers-CDXTT-M7.js","/assets/Zagruzka-eYw73WKe.js","/assets/ZagruzkaCell-hMctl_IT.js","/assets/api-CLUvbWTo.js","/assets/archive-ByNeiEa_.js","/assets/archive-restore-Cd1dsEYW.js","/assets/arrow-down-FKbU_VMh.js","/assets/arrow-down-wide-narrow-BT-ZeiKl.js","/assets/arrow-up-narrow-wide-DGG72CGZ.js","/assets/award-Bh3cI8li.js","/assets/ban-C89bVAjd.js","/assets/boxes-BwjYnqYF.js","/assets/braces-B7rB_zBh.js","/assets/brigadirFilters-BfysTyAG.js","/assets/broadcastTree-BvKBrq7V.js","/assets/building-2-C_ODSeDs.js","/assets/calculator-DCWhOBj1.js","/assets/calendar-C4gDiNDq.js","/assets/calendar-days-D_61tr91.js","/assets/camera-CWtx8JDY.js","/assets/categories-BCpoiD77.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Jah3yBjr.js","/assets/chart-line-D0dEsM21.js","/assets/chart-pie-FqZGD8L_.js","/assets/chartRange-Dma5ee66.js","/assets/check-check-CWWtnVMv.js","/assets/chevron-left-Cve6Ylcs.js","/assets/chevrons-up-down-DzL4IQV3.js","/assets/circle-DRVjr-_z.js","/assets/circle-alert-CuAgGvz1.js","/assets/circle-check-big-Bv-lUyM3.js","/assets/circle-dashed-SGJ8YKH3.js","/assets/circle-minus-DITwl7xE.js","/assets/circle-question-mark-C9okhR3I.js","/assets/circle-slash-C5Us5B36.js","/assets/circle-user-round-DCn09qf1.js","/assets/clock-3-DM9Xt_GY.js","/assets/cloud-off-BglPByYz.js","/assets/cloud-upload-jmwMJZD7.js","/assets/compass-DOz09mJA.js","/assets/concernCategories-CrYX68wS.js","/assets/copy-91MPtVQM.js","/assets/corner-down-right-CWCXRoLS.js","/assets/createLucideIcon-nM71SjT3.js","/assets/es-Dni9ITqy.js","/assets/external-link-cuEtyOu-.js","/assets/file-clock-Deo-ZEVE.js","/assets/file-exclamation-point-D_1ZrbEv.js","/assets/flag-jrqK6nzS.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BTVETRKN.js","/assets/hash-Cfqv7cMA.js","/assets/hourglass-qMi0B3C5.js","/assets/image-34uJ4b5m.js","/assets/image-off-yI3IwGZg.js","/assets/inbox-D6DGeSOD.js","/assets/index-DD8ZJtYw.css","/assets/index-DnnZlsPu.js","/assets/keyboard-BCSa41TO.js","/assets/languages-Lp_79C6T.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-C2unpH9B.js","/assets/lightbulb-QR9lakeJ.js","/assets/link-2-CEqC4bJC.js","/assets/link-2-off-C_0RB5zV.js","/assets/list-ordered-DytmsyNn.js","/assets/list-tree-boAgl4q9.js","/assets/lock-open-B2NVjLME.js","/assets/log-in-x23BXIy2.js","/assets/minimize-2-FFVjiouG.js","/assets/package-check-BRQkjsn8.js","/assets/pencil-uH9a2-ni.js","/assets/percent-JtNnBqBz.js","/assets/pin-Cr3YSabv.js","/assets/pin-off-DLSY9KJR.js","/assets/play-BBupMCtQ.js","/assets/plug-zap-r0H_OrxM.js","/assets/prop-types-Dlx7u9Cl.js","/assets/radio-L_j0jbNQ.js","/assets/react-apexcharts.esm-93T-qzE3.js","/assets/registers-CMhxbGCh.js","/assets/repeat-CqFyMwdg.js","/assets/save-B5PfqrUX.js","/assets/scopeLinks-CtE5DX_3.js","/assets/scroll-text-CxonRAia.js","/assets/search-x-C5dYs9WZ.js","/assets/segments-DiV5Xvtu.js","/assets/send-B2DEf34f.js","/assets/settings-2-Daer1vci.js","/assets/shield-Dtu5oQ6u.js","/assets/shield-alert-CGX7opnt.js","/assets/shield-question-mark-Bb_98bBZ.js","/assets/siren-CjJK6QgJ.js","/assets/snowflake-COY5eovi.js","/assets/split-aXabD4za.js","/assets/square-check-big-lh2DgC0z.js","/assets/star-CZWosE9n.js","/assets/statusBands-DWCxLrKL.js","/assets/store-BSQNZJL6.js","/assets/table-2-DVl4W9Ho.js","/assets/table-properties-BQy5q2su.js","/assets/tag-yd8V1a7x.js","/assets/timer-off-s4H92whS.js","/assets/trending-down-CflhduZh.js","/assets/trending-up-DjStd7RA.js","/assets/undo-2-BOFn152c.js","/assets/useChartTheme-CSS2E6jb.js","/assets/useElementWidth-DiXxZdBq.js","/assets/useIsMobile-BZ9iBRDX.js","/assets/useOpenParam-DTPW10UM.js","/assets/useStatusBands-DJWH9C51.js","/assets/useUrlScope-BOSHnyUj.js","/assets/user-DlBBQWuj.js","/assets/user-cog-D69mwwEx.js","/assets/users-C3TNgY27.js","/assets/vfx-BskoLIa5.js","/assets/video-vvdtTedA.js","/assets/wallet-Ko7_MfoA.js","/assets/warehouse-BIu0bmbF.js","/assets/x-bSx_qgjq.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
