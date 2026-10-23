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

const BUILD = "2026-10-23T13:17:03.398Z";
const PRECACHE = ["/","/assets/AdminPanel-BTC5f29T.js","/assets/AnalysisBoard-Ca1mboyD.js","/assets/Arc-UubQdrB5.js","/assets/Assistant-BieOvH_G.js","/assets/BrigadirProfile-BC441Tl0.js","/assets/BroadcastReceivers-XsNP4bzl.js","/assets/BroadcastRecord-Dracb7uK.js","/assets/Button-BMBoxgdM.js","/assets/CatLockNotice-B3nVUNBq.js","/assets/CategoryLegendModal-DkuY61vD.js","/assets/CellConcerns-B3N28eMh.js","/assets/CellDetails-B8rdQZHO.js","/assets/CellFormModal-C4XnNZD3.js","/assets/CellIdent-trerb_2X.js","/assets/CellLink-DrDbCvEc.js","/assets/Cells-X_y0Rjme.js","/assets/ColumnFilter-DDyxh6Jz.js","/assets/ColumnsPicker-B-VWNTgW.js","/assets/CommentsModal-DSJEFVkC.js","/assets/ComparisonTable-BOt58a4G.js","/assets/Concerns-ymOrtVSf.js","/assets/CountStepper-CIhDUj5k.js","/assets/Daily-D-R0z8zU.js","/assets/DataTable-Bl2OWG9L.js","/assets/DateRangePicker-SywXVpKi.js","/assets/DayReportView-BY9UXIVB.js","/assets/DayStepper-BkIdeFcG.js","/assets/DayStrip-CubGi9yT.js","/assets/DifferenceBreakdown-CNO14L8e.js","/assets/Downtime-BsgDQelk.js","/assets/Education-BT1SIEu_.js","/assets/EducationLesson-DbBXPMfz.js","/assets/EmptyState-CCgy8iha.js","/assets/Exam-CAQwDXyk.js","/assets/FactorySelect-De3KZ7Su.js","/assets/Gamification-Lm4RkgRf.js","/assets/GroupBadge-aNjwHZhs.js","/assets/HeatmapChart-CD0x7ca9.js","/assets/IdleCell-DJsGv-_I.js","/assets/KPICard-D-8c6SK3.js","/assets/Kaizen-CISb0Era.js","/assets/Kelish-DQi31B1Q.js","/assets/KpiDeltaCard-B4RmwrND.js","/assets/LangTextInput-Cqy-HNsT.js","/assets/Layout-CYDKKRnS.js","/assets/LeaderAppeal-B3-rJLpq.js","/assets/LeaderDayReport-Do1xqTBk.js","/assets/LeaderUnitReport-BvZ5VrsV.js","/assets/Leaderboard-C7SN-1t9.js","/assets/Leaders-BseauuTz.js","/assets/LeadersKpi-D4k4mZyC.js","/assets/Lightbox--4nqkYnv.js","/assets/LiveOverview-DbNkPVRH.js","/assets/Login-BFc-sE3P.js","/assets/NotFound-CSp_w91U.js","/assets/Notifications-B0NSnpEK.js","/assets/Ontime-3WV5wReV.js","/assets/Overview-FZz8Zh0u.js","/assets/Pagination-ZuJwvqfP.js","/assets/PerenaladkaFactTable-Gmr0XDLy.js","/assets/PersonCard-CtfNGq7J.js","/assets/PlanFulfillment-DZbjfMxb.js","/assets/Production-C_ZF-qo_.js","/assets/Profile-C6YIGNgH.js","/assets/ProofCamera-CMUSJGfW.js","/assets/ProofPhoto-QNa8r8qS.js","/assets/Quality-CYuZVCFF.js","/assets/RawRows-5UjgKle-.js","/assets/RequestStateChip-twjYn41u.js","/assets/RichTextEditor-B7WIo7Ud.js","/assets/SaveState-CmRIqvYw.js","/assets/SearchInput-BbhDXZIG.js","/assets/SeasonalityHeatmap-C28saqZT.js","/assets/SegmentedToggle-CLlR6AZ4.js","/assets/SetupTimes-BX7rLSME.js","/assets/ShiftDaily-lnd-X0qO.js","/assets/Staff-5m6GOMcE.js","/assets/StaffListAtCheck-gst3fZS1.js","/assets/StatusBadge-uNDKfvyF.js","/assets/StatusBandsModal-CQmoG6ea.js","/assets/TargetGoal-p6q4NkLS.js","/assets/Targets-CtGxQAL3.js","/assets/Tasks-CTnDwNLV.js","/assets/TimeWheelPicker-CEacUeLd.js","/assets/Toast-trdjjnof.js","/assets/Tooltip-Cl1WYENj.js","/assets/TrendChart-nOi4kAqX.js","/assets/TripleSpeedometer-BzWAqFOo.js","/assets/Trudoyomkost-DMjcnNQt.js","/assets/UploadDropzone-BY6z4tHh.js","/assets/UsersActivity-88WiIsR-.js","/assets/VerdictBlock-BFwMKoh-.js","/assets/VfxApiMap-Cck3ptJu.js","/assets/VfxDictionaries-Dxp_9D7h.js","/assets/VfxEmployees-BbMq-Iu3.js","/assets/VfxHrMoves-CC2tWVMN.js","/assets/VfxJobs-v7GatoOB.js","/assets/VfxPhoto-EPJEP9OE.js","/assets/VfxShifts-B01PSg05.js","/assets/VfxState-B64DJrxr.js","/assets/VfxTimebooks-CNH2TtC6.js","/assets/VfxTimesheet-CZdtf_Ta.js","/assets/WatchProgress-CciFHX6s.js","/assets/WebLogin-x4xwAAod.js","/assets/Workers-Cv_T2ygm.js","/assets/Zagruzka-DodgRoC_.js","/assets/ZagruzkaCell-Dyh1ZXz4.js","/assets/api-Zwl4t42G.js","/assets/archive-CE3nLhOt.js","/assets/archive-restore-aO0xL3S0.js","/assets/arrow-down-right-CaAR6Ns2.js","/assets/arrow-down-vw51Vg5V.js","/assets/arrow-down-wide-narrow-A6HHU2Fm.js","/assets/arrow-up-narrow-wide-NleWi2Nu.js","/assets/ban-BQ_v6Kwa.js","/assets/boxes-Ch4fDckV.js","/assets/braces-4kKAZy-S.js","/assets/brigadirFilters-BRhZ7-H_.js","/assets/broadcastTree-CYnC8A0Y.js","/assets/building-2-De93H6i5.js","/assets/calendar-ChygwEWF.js","/assets/calendar-days-CrqaTPlf.js","/assets/camera-D3qUFGG8.js","/assets/categories-ZBW0EykX.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-xlpOzwcB.js","/assets/chart-line-CChwip9N.js","/assets/chart-pie-BfbG4pc-.js","/assets/chartRange-ghnYYCIb.js","/assets/check-check-BUYeMOoX.js","/assets/chevron-left-DfhQ06dy.js","/assets/chevrons-up-down-BmEY8H5i.js","/assets/circle-C59SeK3k.js","/assets/circle-alert-DqGNYjPa.js","/assets/circle-check-big-BJ4nsmUL.js","/assets/circle-dashed-xvWvENHF.js","/assets/circle-minus-BH_Tv0WO.js","/assets/circle-question-mark-Csa0mDZp.js","/assets/circle-slash-ivhtMKqP.js","/assets/circle-user-round-vCrNzzn5.js","/assets/cloud-off-D3C3xR9B.js","/assets/cloud-upload-DjuqV_Oo.js","/assets/compass-v5QvniHm.js","/assets/concernCategories-ByeiDYcm.js","/assets/corner-down-right-Dc4Re2Ce.js","/assets/createLucideIcon-SYZWhNX4.js","/assets/es-BcUWG2Fx.js","/assets/external-link-xW2COCx9.js","/assets/file-clock-Lbkk8M3U.js","/assets/file-exclamation-point-DScB3qgZ.js","/assets/flag-Bjen7E83.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BG6QRJTj.js","/assets/funnel-GW6MwWsI.js","/assets/hash-C_is3BLl.js","/assets/hourglass-HgN7Tbt4.js","/assets/image-gtiFwlC4.js","/assets/image-off-CnJafowI.js","/assets/inbox-BCSHEfJ_.js","/assets/index-DFvJry-Q.css","/assets/index-QMwI8GEp.js","/assets/keyboard-Cg_5w-ct.js","/assets/languages-Dvtr-kmz.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BfCHGSel.js","/assets/leaderBoard-BMNBI3z1.js","/assets/lightbulb-DRQbsXf1.js","/assets/link-2-DFSdJbXO.js","/assets/link-2-off-WM2qCPxr.js","/assets/list-ordered-DRdLuPFV.js","/assets/list-tree-CBRwvs8w.js","/assets/lock-open-Bz9P5rOT.js","/assets/log-in-Bmq8Ldt6.js","/assets/map-pin-CocwmUOe.js","/assets/marks-DgfoS_7I.js","/assets/minimize-2-DCXy3Pmx.js","/assets/package-check-BfNHc13f.js","/assets/pencil-C0XNNmU7.js","/assets/percent-0TvbB4S8.js","/assets/pin-B9387xN8.js","/assets/pin-off-BM9flzkx.js","/assets/play-Cah5yZaD.js","/assets/plug-zap-CSK0jzwn.js","/assets/prop-types-DJ-dx-J8.js","/assets/radio-iXfHb6rX.js","/assets/react-apexcharts.esm-Dw2-NfE6.js","/assets/registers-C6SDQeOw.js","/assets/repeat-Bcm1vYcy.js","/assets/save-C1zdr0VY.js","/assets/scopeLinks-UegSojvX.js","/assets/scroll-text-CrImEkyn.js","/assets/search-x-C_EO1-PE.js","/assets/segments-BLq0wj-X.js","/assets/send-K-32A3vO.js","/assets/settings-2--tNH8JsO.js","/assets/shield-BwrM_uzS.js","/assets/shield-alert-Dc5mUia2.js","/assets/shield-question-mark-4MKRLg5n.js","/assets/sigma-BYjDdfOr.js","/assets/siren-DC2DfGcr.js","/assets/snowflake-xuXJ_3bj.js","/assets/split-BQldfATm.js","/assets/square-check-big-Mmu49ONI.js","/assets/star-2OyzaLFS.js","/assets/statusBands-BllegpgP.js","/assets/store-DaWieRdk.js","/assets/table-2-BhD2k62A.js","/assets/table-properties-CeJ_U-7e.js","/assets/tag-C42dmx1b.js","/assets/timer-off-BtCnlkQC.js","/assets/trendBuckets-BpelgwmH.js","/assets/trending-down-BWRCRnJS.js","/assets/trending-up-D1U6EQ4D.js","/assets/undo-2-DqNn2Ee6.js","/assets/useChartTheme-k_HVPwdU.js","/assets/useElementWidth-f_xmEx23.js","/assets/useIsMobile-DTIwZGqU.js","/assets/useOpenParam-CaFEZ4fx.js","/assets/useStatusBands-qVcJcBWg.js","/assets/useUrlScope-CT-BGn4z.js","/assets/user-27CirczG.js","/assets/user-cog-B5Yo19l6.js","/assets/user-minus-MzQyXqeV.js","/assets/users-BmrNBm3S.js","/assets/vfx-DmopdTaG.js","/assets/video-CfXZJtqI.js","/assets/wallet-D35Uh3hr.js","/assets/warehouse-DRUbzyxa.js","/assets/workflow-DhSdnAEX.js","/assets/x-Ujs_e02S.js","/assets/zap-Bp33qlkG.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
