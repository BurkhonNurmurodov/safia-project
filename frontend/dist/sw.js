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

const BUILD = "2026-10-29T06:57:07.312Z";
const PRECACHE = ["/","/assets/AdminPanel-DrIPje5M.js","/assets/AnalysisBoard-DLKdUpzh.js","/assets/Arc-CHMRFep0.js","/assets/Assistant-CL4sHmoW.js","/assets/BrigadirProfile-DLdKVCyc.js","/assets/BroadcastReceivers-Ml9g2QKA.js","/assets/BroadcastRecord-D0LQOSaU.js","/assets/Button-CQCUM6Mq.js","/assets/CatLockNotice-C5XzM_qL.js","/assets/CategoryLegendModal-BAnNUBSq.js","/assets/CellConcerns-Dsx-IhXu.js","/assets/CellDetails-CdgGySJI.js","/assets/CellFormModal-BQeWxHHm.js","/assets/CellIdent-CldZjAHz.js","/assets/CellLink-CM4Rvh5V.js","/assets/Cells-CWNAcXCw.js","/assets/ColumnFilter-CMYtBOaR.js","/assets/ColumnsPicker-D8CKuxhq.js","/assets/CommentsModal-BwUwC-eR.js","/assets/ComparisonTable-BbVaEc6c.js","/assets/Concerns-WB6Z9Okd.js","/assets/CountStepper-C7gGUmjS.js","/assets/Daily-BGJLZxh0.js","/assets/DataTable-DODbCDow.js","/assets/DateRangePicker-nMrluPdI.js","/assets/DayReportView-uaPd6jOH.js","/assets/DayStepper-YmNiyG1w.js","/assets/DayStrip-DSvgPoXh.js","/assets/DifferenceBreakdown-CqQ70vIA.js","/assets/Downtime-CVxZNkHY.js","/assets/Education-B1f2przT.js","/assets/EducationLesson-nCEom7Ex.js","/assets/EmptyState-189RApMm.js","/assets/Exam-hwo2oU9R.js","/assets/FactorySelect-BTvSk79_.js","/assets/Gamification-K7CdoqSH.js","/assets/GroupBadge-BkDSV8dO.js","/assets/HeatmapChart-oql4Vv55.js","/assets/IdleCell-Cgak0zN5.js","/assets/KPICard-BNA-0-ei.js","/assets/Kaizen--aB-QQ5h.js","/assets/Kelish-B-zJ94dw.js","/assets/KpiDeltaCard-BeD_CvrX.js","/assets/LangTextInput-BYbWmVHs.js","/assets/Layout-BqIhjJJ_.js","/assets/LeaderAppeal-D7GPcNo8.js","/assets/LeaderDayReport-CZVlOy4F.js","/assets/LeaderUnitReport-CRtjaBKI.js","/assets/Leaderboard-iIgWv2mb.js","/assets/Leaders-CTGRc3qM.js","/assets/LeadersKpi-B7RMcQeY.js","/assets/Lightbox-BbCs9n_r.js","/assets/LiveOverview-DJ6Rs1si.js","/assets/Login-DNb9qwae.js","/assets/NotFound-DperaaXa.js","/assets/Notifications-DnvQ2Sk6.js","/assets/Ontime-BvvK9ujj.js","/assets/Overview-BA9VoZUz.js","/assets/Pagination-CFXtLFkt.js","/assets/PerenaladkaFactTable-B3NsHhcT.js","/assets/PersonCard-zEFJyhnt.js","/assets/PlanFulfillment-VFAL_C3-.js","/assets/Production-CguxZ-3k.js","/assets/Profile-CJu7fPkM.js","/assets/ProofCamera-BVQUOC49.js","/assets/ProofPhoto-CkUtfwbA.js","/assets/Quality-Bj1_xlAT.js","/assets/RawRows-DK50Duf_.js","/assets/Reports-CKyhKdee.js","/assets/RequestStateChip-Mw1WhHHS.js","/assets/RichTextEditor-LRkKncin.js","/assets/SaveState-duW_ZeAt.js","/assets/SearchInput-Bcp9YJcB.js","/assets/SeasonalityHeatmap-Cnv31TPD.js","/assets/SegmentedToggle-BcRDw1Tx.js","/assets/SetupTimes-DRzf6LdF.js","/assets/ShiftDaily-CrTjH_Uf.js","/assets/Staff-D2JkohIj.js","/assets/StaffListAtCheck-Du6MhtrC.js","/assets/StatusBadge-CghfbhvI.js","/assets/StatusBandsModal-B9TfpdcM.js","/assets/TargetGoal-BoG6ISoa.js","/assets/Targets-DdfH9kPL.js","/assets/Tasks-dxXERky4.js","/assets/TimeWheelPicker-RShxnqCs.js","/assets/Toast-BHx_Opcn.js","/assets/Tooltip-Bly0Hi4V.js","/assets/TrendChart-DtWFn1uj.js","/assets/TripleSpeedometer-DOR2bB9p.js","/assets/Trudoyomkost-BieG595h.js","/assets/UploadDropzone-qJiQ61id.js","/assets/UsersActivity-D-c3OBjb.js","/assets/VerdictBlock-DZ67rX27.js","/assets/VfxApiMap-DKIedVaf.js","/assets/VfxDictionaries-Bw8E5Ar8.js","/assets/VfxEmployees-Bxo-NyVs.js","/assets/VfxHrMoves-Br51dptr.js","/assets/VfxJobs-yudzP0qw.js","/assets/VfxPhoto-CpTtP3HY.js","/assets/VfxShifts-D-tfZ3TG.js","/assets/VfxState-DlVsVAp2.js","/assets/VfxTimebooks-CYwF_WR-.js","/assets/VfxTimesheet-mCsZxopK.js","/assets/WatchProgress-DPDR-y9Z.js","/assets/WebLogin-XlkFbn-L.js","/assets/Workers--4dzp72S.js","/assets/Zagruzka-BTx-L_ut.js","/assets/ZagruzkaCell-Dkq-pzDr.js","/assets/api-BFm7MSgf.js","/assets/archive-Bf-7d8gv.js","/assets/archive-restore-C154oxR-.js","/assets/arrow-down-CGplhEB_.js","/assets/arrow-down-right-C51ro_F1.js","/assets/arrow-down-wide-narrow-DvSxq1oy.js","/assets/arrow-up-narrow-wide-D7G6plzZ.js","/assets/ban-zek2QTNF.js","/assets/boxes-CYdKOCOT.js","/assets/braces-B6uNfyB4.js","/assets/brigadirFilters-BOuk-Q6p.js","/assets/broadcastTree-COKkNbD9.js","/assets/building-2-D0uJPjt4.js","/assets/calendar-SaYiUnt3.js","/assets/calendar-days-m4lJ17hB.js","/assets/camera-z1AXqNMs.js","/assets/categories-Bydgeryu.js","/assets/cellMoveRefusal-DqAFn2Aj.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CN--pnuU.js","/assets/chart-line-B2OketT_.js","/assets/chart-pie-NMV8J5wa.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-BoQzLf74.js","/assets/chevron-left-DOrLcMWJ.js","/assets/chevrons-up-down-CNwhKXwU.js","/assets/circle-BPkkDG6H.js","/assets/circle-alert-DPUc45NC.js","/assets/circle-check-big-CYIZSAX-.js","/assets/circle-dashed-DrWPBBnY.js","/assets/circle-minus-0MMgOYTL.js","/assets/circle-question-mark-BhP_GQlH.js","/assets/circle-slash-ChlfheO6.js","/assets/circle-user-round-B3YMdGYY.js","/assets/cloud-off-BYM1xayf.js","/assets/cloud-upload-C7aCmxnp.js","/assets/coins-DeNOFKZ6.js","/assets/compass-4aKz0zvE.js","/assets/concernCategories-QxjoEkHE.js","/assets/corner-down-right-3xpHKrG9.js","/assets/createLucideIcon-D7Z5gO_C.js","/assets/en-Cvprt0j8.js","/assets/es-Dtgc5NM1.js","/assets/external-link-DtxOqhlL.js","/assets/file-clock-Dg_mPMVz.js","/assets/file-exclamation-point-C4KipQZd.js","/assets/flag-DuHf8VfX.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-Bbm7PNdO.js","/assets/funnel-DjqFLGK3.js","/assets/hash-Dq35zIs6.js","/assets/hourglass-utvqbiUI.js","/assets/idleTime-CHPnJRpw.js","/assets/image-BPaJDGWS.js","/assets/image-off-BcUoT2qJ.js","/assets/inbox-B5CN3zJc.js","/assets/index-BH6xiOzs.js","/assets/index-BtYmuUYW.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DeoPCGpI.js","/assets/languages-B8uCyJYI.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-V68GUnj1.js","/assets/leaderBoard-DBUgDyTK.js","/assets/lightbulb-DSYVRNpZ.js","/assets/link-2-DKr9X5ck.js","/assets/link-2-off-CuhauMSe.js","/assets/list-ordered-D9etWlss.js","/assets/list-tree-Uspaa2n7.js","/assets/lock-open-CFY92QX4.js","/assets/log-in-BnbaZxzc.js","/assets/map-pin-CbASmaPa.js","/assets/marks-CL70NNTB.js","/assets/minimize-2-LdZL-PGW.js","/assets/package-check-4Si4CS3A.js","/assets/pencil-DAaEYBbs.js","/assets/percent-Ck-xxUAn.js","/assets/pin-BoTgBLD3.js","/assets/pin-off-ugUS3xLv.js","/assets/play-BJkeo7hF.js","/assets/plug-zap-BUFyemTI.js","/assets/prop-types-RD3fbola.js","/assets/radio-Ctvae0Ks.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BvWdJaZk.js","/assets/repeat-DGeZPx5d.js","/assets/ru-BrBa2d5k.js","/assets/save-B0ocYMfC.js","/assets/scopeLinks-D2ZP3FF6.js","/assets/scroll-text-ChS_MfMC.js","/assets/search-x-S7-Zijb8.js","/assets/segments-D5Uiedtv.js","/assets/send-BETG3wT9.js","/assets/settings-2-7Ho91Go5.js","/assets/shield-UKS9fV7M.js","/assets/shield-alert-BfHQ2e5N.js","/assets/shield-question-mark-CIMD9Vvq.js","/assets/sigma-DkYemaCO.js","/assets/siren-D0C5AxKE.js","/assets/snowflake-DtUbnGvO.js","/assets/split-CMb1kUKg.js","/assets/square-check-big-DWp-4T6D.js","/assets/star-x8H-qPiT.js","/assets/statusBands-DVBZcBq3.js","/assets/store-B-Mb5XzV.js","/assets/table-2-C_N3gitG.js","/assets/table-properties-D3LQXBwX.js","/assets/tag-BcrQVVgu.js","/assets/timer-off-CuVYRvVa.js","/assets/translations-DrATVe7p.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-Dfrkg8qB.js","/assets/trending-up-CgMC3y6U.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-BdPWTk7A.js","/assets/useChartTheme-Cb6598Ea.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-BrDepCW0.js","/assets/useStatusBands-CqrzQW1n.js","/assets/useUrlScope-CwntKK5E.js","/assets/user-AovWto7b.js","/assets/user-cog-BGy-jXFL.js","/assets/user-minus-B0OVEjZY.js","/assets/users-CeFkwfeR.js","/assets/uz-Cu_4etPH.js","/assets/uz_cyrl-Cps9c4tI.js","/assets/vfx-BwbIvFMg.js","/assets/video-CoPziaa2.js","/assets/wallet-BrAYXIuP.js","/assets/warehouse-D3VqalxX.js","/assets/workflow-DZG9T1UW.js","/assets/x-nzWPon3k.js","/assets/zap-Zzo3vmsx.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
