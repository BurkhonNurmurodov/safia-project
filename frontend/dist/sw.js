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

const BUILD = "2026-10-10T13:27:34.258Z";
const PRECACHE = ["/","/assets/AdminPanel-Bn1OKUfQ.js","/assets/AnalysisBoard-DImDmYfx.js","/assets/Arc-B_BD1NT2.js","/assets/Assistant-DhPG_IQE.js","/assets/BrigadirProfile-CSa98IOM.js","/assets/BroadcastReceivers-BTlpMPYh.js","/assets/BroadcastRecord-YeewXn67.js","/assets/Button-CxLeu-jT.js","/assets/CatLockNotice-BbOl5Kix.js","/assets/CategoryLegendModal-5419QGno.js","/assets/CellConcerns-B0Il3wey.js","/assets/CellDetails-az2i2K-h.js","/assets/CellFormModal-B_lcwqDJ.js","/assets/CellIdent-ZT7NOu1i.js","/assets/CellLink-bQhoSdNY.js","/assets/Cells-9y8Ix93S.js","/assets/ColumnFilter-BDyl9pia.js","/assets/ColumnsPicker-C4b-ki-y.js","/assets/CommentsModal-CBRrCoua.js","/assets/ComparisonTable-yVbzUmNX.js","/assets/Concerns-fTo6MfbX.js","/assets/Daily-BhO4rdli.js","/assets/DataTable-pjG7K8fk.js","/assets/DateRangePicker-Bc_7rkWe.js","/assets/DayReportView-OkxzMZxZ.js","/assets/DayStepper-DJne3faL.js","/assets/DifferenceBreakdown-BU4OcXw0.js","/assets/Downtime-Qjmme3ii.js","/assets/Education-D_uPcOwz.js","/assets/EducationLesson-B5bX_mMV.js","/assets/EmptyState-DXqEuW_G.js","/assets/Exam-BDL8SZdz.js","/assets/FactorySelect-3QfvCOFj.js","/assets/Gamification-Bq8tv86g.js","/assets/GroupBadge-_fM3z6Pe.js","/assets/HeatmapChart-BI3uiSJN.js","/assets/IdleCell-ZyF3CXDx.js","/assets/KPICard-BITZ9fgZ.js","/assets/Kaizen-Bu-HK0XO.js","/assets/Kelish-Dz_u03S2.js","/assets/KpiDeltaCard-DOP22M7B.js","/assets/LangTextInput-BgHIsvmq.js","/assets/Layout-BEa9Zt9t.js","/assets/LeaderAppeal-BmdBsRRA.js","/assets/LeaderDayReport-C8tn4wmo.js","/assets/LeaderUnitReport-Cu-34Zc0.js","/assets/Leaderboard-BP-Ck6cc.js","/assets/Leaders-B8kgC9UC.js","/assets/Lightbox-gsiRaUrV.js","/assets/LiveOverview-dWE0P5cS.js","/assets/Login-B4CWGt63.js","/assets/NotFound-eIjbA_lR.js","/assets/Notifications-C4eWi82I.js","/assets/Overview-BNThOd1k.js","/assets/Pagination-CF_RSCWl.js","/assets/PerenaladkaFactTable-BemnZXyQ.js","/assets/PersonCard-dY0KoVCo.js","/assets/PlanFulfillment-C0tEbbnW.js","/assets/Production-Dw3I-B0y.js","/assets/Profile-BHuclCCE.js","/assets/ProofCamera-BFuZWv9p.js","/assets/ProofPhoto-DuxeK03i.js","/assets/Quality-BIHC5AJU.js","/assets/RawRows-BOpo8LQQ.js","/assets/RequestStateChip-DrL9h-7S.js","/assets/RichTextEditor-BdUM2nc_.js","/assets/SaveState-CiQY5d4N.js","/assets/SearchInput-CDCeqeId.js","/assets/SeasonalityHeatmap-B1ddp-Ws.js","/assets/SegmentedToggle-DOZZktVJ.js","/assets/SetupTimes-CdU3wuQF.js","/assets/ShiftDaily-FNE2OGP8.js","/assets/Staff-BbzcACXn.js","/assets/StatusBadge-CwW4hYAZ.js","/assets/TargetGoal-OZ-W6KWU.js","/assets/Targets-COlRXEK-.js","/assets/Tasks-m19wpTZL.js","/assets/TimeWheelPicker-BolM_nxC.js","/assets/Toast-Bd3jkf1H.js","/assets/Tooltip-YNlS4zH8.js","/assets/TrendChart-yVY1yshv.js","/assets/TripleSpeedometer-DBV6Kwri.js","/assets/Trudoyomkost-B5leXTgh.js","/assets/Turnover-DT8Ldb-x.js","/assets/UploadDropzone-B72DcJTr.js","/assets/UsersActivity-CFcBRrhx.js","/assets/VerdictBlock-DwmqIgIe.js","/assets/VfxApiMap-FX_VhQov.js","/assets/VfxDictionaries-zM7swQDz.js","/assets/VfxEmployees-DniVX4sf.js","/assets/VfxHrMoves-8tyd2Ok2.js","/assets/VfxJobs-DVlMde3Q.js","/assets/VfxPhoto-o-lrCPSM.js","/assets/VfxShifts-DJDdRoq-.js","/assets/VfxState-C-Gdx4lQ.js","/assets/VfxTimebooks-dXT6cN1Y.js","/assets/VfxTimesheet-BKDgzC3c.js","/assets/WatchProgress-Bg6jXnPJ.js","/assets/WebLogin-CdlcGRa4.js","/assets/WorkerConcerns-CjJL1tj7.js","/assets/Workers-DZDF2_6t.js","/assets/Zagruzka-BzrOn8p2.js","/assets/ZagruzkaCell-Dw5E7SYz.js","/assets/api-89tEmA_q.js","/assets/archive-restore-DV4byojG.js","/assets/archive-wm6_phGK.js","/assets/arrow-down-3jm8NPCe.js","/assets/arrow-down-wide-narrow-BzuqGRfR.js","/assets/arrow-up-narrow-wide-C7KCTgov.js","/assets/award-CbRT6IRY.js","/assets/ban-Dw-U65NQ.js","/assets/boxes-DjWUf78i.js","/assets/braces-BC2FKOSw.js","/assets/brigadirFilters-BH-312fi.js","/assets/broadcastTree-BLDYuIzu.js","/assets/building-2-Dimf6DST.js","/assets/calculator-BKgi21xT.js","/assets/calendar-DE9zwM0E.js","/assets/calendar-days-W5AFIB25.js","/assets/camera-DAX5OS8B.js","/assets/categories-D2fI26MX.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-h6JfUpEs.js","/assets/chart-line-2oCaZWpf.js","/assets/chart-pie-Ckch36TO.js","/assets/chartRange-CsNVBj3H.js","/assets/check-check-CA7ToEsr.js","/assets/chevron-left-BWI1hSUd.js","/assets/chevrons-up-down-CpbynzaY.js","/assets/circle-Ezkiy19R.js","/assets/circle-alert-1u1b2qYj.js","/assets/circle-check-big-SmbCesKj.js","/assets/circle-dashed-B9-pjkQ4.js","/assets/circle-minus-CN7yrumB.js","/assets/circle-question-mark-UmXzj9r1.js","/assets/circle-slash-B86ZA9eZ.js","/assets/circle-user-round-CULQFSuQ.js","/assets/clock-3-COTO0vlp.js","/assets/cloud-off-BTYCMVbr.js","/assets/cloud-upload--EM44jo_.js","/assets/compass-6rTsBHf0.js","/assets/concernCategories-Cu3uTAcz.js","/assets/copy-Bnqrpc2Y.js","/assets/corner-down-right-V0TgvapN.js","/assets/createLucideIcon-BFMBbfzf.js","/assets/es-CToJGXYx.js","/assets/external-link-D0Jl6wON.js","/assets/file-clock-BueEpUV7.js","/assets/file-exclamation-point-CU2wYx4u.js","/assets/flag-BXpijEEL.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D9vij8P0.js","/assets/hash-Dcogr-89.js","/assets/hourglass-DKl7KkCg.js","/assets/image-BOPM9aP_.js","/assets/image-off-Bd0mV0w8.js","/assets/inbox-B_7fgVRj.js","/assets/index-4398keYK.css","/assets/index-CcrXEQoa.js","/assets/keyboard-rW8GmDJ6.js","/assets/languages-DHchFCbx.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Dltg8kDf.js","/assets/lightbulb-65Wo2-fx.js","/assets/link-2-O0ilOU09.js","/assets/link-2-off-CuBOGWZ5.js","/assets/list-ordered-BqiI_ipa.js","/assets/list-tree-DKBg8q4D.js","/assets/lock-open-DHrINhAq.js","/assets/log-in-DX5WfM8G.js","/assets/minimize-2-BHwiRzw7.js","/assets/package-check-CVNXYj_m.js","/assets/pencil-BEsHpfGs.js","/assets/percent-BlBzQ0rt.js","/assets/pin-Cq2nNy9Q.js","/assets/pin-off-DktYdKoh.js","/assets/play-CxvRQDnr.js","/assets/plug-zap-B4nmoZ9Q.js","/assets/prop-types-BDu_vk5U.js","/assets/radio-u6Mt13Sy.js","/assets/react-apexcharts.esm-BBD9JA_P.js","/assets/registers-CKnEVDdg.js","/assets/repeat-C9H4QS-u.js","/assets/save-bSd7gzF3.js","/assets/scopeLinks-CjhBMjBg.js","/assets/scroll-text-BmEdxX-D.js","/assets/search-x-BSbQCvTi.js","/assets/segments-DQXv4HC5.js","/assets/send-Q58fQMNL.js","/assets/settings-2-Bk76Bv2h.js","/assets/shield-BQzIahis.js","/assets/shield-alert-CPe7fRre.js","/assets/shield-question-mark-C47CBW8G.js","/assets/siren-DkroUFdV.js","/assets/snowflake-lepZoiKw.js","/assets/split-DEwRhKA2.js","/assets/square-check-big-C5sSBmeR.js","/assets/star-DEHRyHH_.js","/assets/statusBands-Cj-_Duy-.js","/assets/store-FQKPvtQX.js","/assets/table-2-yS44Ufq5.js","/assets/table-properties-AljULgN9.js","/assets/tag-HleQ0oqR.js","/assets/timer-off-SnP-pevL.js","/assets/trending-down-ipHKj-fY.js","/assets/trending-up-CIz1Ff_x.js","/assets/undo-2-C3khYiLL.js","/assets/useChartTheme-BsyQa77d.js","/assets/useElementWidth-BWfnalF4.js","/assets/useIsMobile-DeTlMxvA.js","/assets/useOpenParam-DfEqIlEE.js","/assets/useStatusBands-RA6SO18Q.js","/assets/useUrlScope-CVMErQOs.js","/assets/user-BnktrhTe.js","/assets/user-cog-4satYjY1.js","/assets/users-Cp98Ra83.js","/assets/vfx-CfpNiPfA.js","/assets/video-CLuT9Mj1.js","/assets/wallet-CJYAmzFB.js","/assets/warehouse-BgWj5ZvG.js","/assets/workflow-DhnuJw52.js","/assets/x-BiGE3T73.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
