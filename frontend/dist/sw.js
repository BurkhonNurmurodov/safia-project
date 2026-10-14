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

const BUILD = "2026-10-14T06:00:17.596Z";
const PRECACHE = ["/","/assets/AdminPanel-CnPtDuRL.js","/assets/AnalysisBoard-BPp7HYqN.js","/assets/Arc-BZ57qHOx.js","/assets/Assistant-D3ZfazC_.js","/assets/BrigadirProfile-DHv8DaRI.js","/assets/BroadcastReceivers-d1AwSKpI.js","/assets/BroadcastRecord-D5Bg8iFP.js","/assets/Button-BPS6sJqr.js","/assets/CatLockNotice-tTik9-cR.js","/assets/CategoryLegendModal-New77O6a.js","/assets/CellConcerns-Du5CruMN.js","/assets/CellDetails-BcDDMIe1.js","/assets/CellFormModal-CQMHbnEv.js","/assets/CellIdent-DUxCNm4v.js","/assets/CellLink-CmwmJbo5.js","/assets/Cells-RGVpb4Hk.js","/assets/ColumnFilter-B-OdAKZL.js","/assets/ColumnsPicker-BYeuexdK.js","/assets/CommentsModal-BQnhgYJf.js","/assets/ComparisonTable-BhfF060A.js","/assets/Concerns-intOQt2V.js","/assets/CountStepper-L3Xrv7EL.js","/assets/Daily-D2OZiPC_.js","/assets/DataTable-EmMnBhWW.js","/assets/DateRangePicker-DqZPlaii.js","/assets/DayReportView-BVSAFWLu.js","/assets/DayStepper-BHmzaS9v.js","/assets/DifferenceBreakdown-CG88Fm0k.js","/assets/Downtime-CYS-FUqe.js","/assets/Education-CbGtRfyE.js","/assets/EducationLesson-DZTOZVd4.js","/assets/EmptyState-BuVeq0JD.js","/assets/Exam-CGAPRaLd.js","/assets/FactorySelect-D4_vi2IV.js","/assets/Gamification-zq-sL_yj.js","/assets/GroupBadge-BZTGOhOh.js","/assets/HeatmapChart-D37rdxYw.js","/assets/IdleCell-BneJA5CG.js","/assets/KPICard-CPUeuK-P.js","/assets/Kaizen-6RzlfGbT.js","/assets/Kelish-C-OJL6Jb.js","/assets/KpiDeltaCard-CPHV9SXW.js","/assets/LangTextInput-CPOArxfa.js","/assets/Layout-jNZkG4Q9.js","/assets/LeaderAppeal-Cakwvd4P.js","/assets/LeaderDayReport-Bv4N2O1t.js","/assets/LeaderUnitReport-Ctba1tN9.js","/assets/Leaderboard-291z1jZy.js","/assets/Leaders-BRquXDsL.js","/assets/Lightbox-C8cPGdw1.js","/assets/LiveOverview-5oPAgGX5.js","/assets/Login-QMYAJ87i.js","/assets/NotFound-CP2xKYwp.js","/assets/Notifications-BMq0t2Nd.js","/assets/Overview-CtVKkz0c.js","/assets/Pagination-COG7TCin.js","/assets/PerenaladkaFactTable-WJWFJU6s.js","/assets/PersonCard-DCnnHzxR.js","/assets/PlanFulfillment-BvG3rtu7.js","/assets/Production-CUDcLyOe.js","/assets/Profile-Cyppe4YG.js","/assets/ProofCamera-B-hYK1Ve.js","/assets/Quality-C68WOVhz.js","/assets/RawRows-BS1zYD_b.js","/assets/RequestStateChip-NwKZSxjY.js","/assets/RichTextEditor-BIRa6Og9.js","/assets/SaveState-DU03ARjp.js","/assets/SearchInput-Dka_0jRp.js","/assets/SeasonalityHeatmap-BKWwS1Pe.js","/assets/SegmentedToggle-S44muk7E.js","/assets/SetupTimes-LUXuL5Bi.js","/assets/ShiftDaily-Ce2s8aKu.js","/assets/Staff-Db1TK4RA.js","/assets/StaffListAtCheck-BVxaQE4i.js","/assets/StatusBadge-K2IuEWLN.js","/assets/TargetGoal-B-JXNp7e.js","/assets/Targets-cuUG5vnK.js","/assets/Tasks-DXhrQpyl.js","/assets/TimeWheelPicker-jsL-PVZx.js","/assets/Toast-CGn6WeWk.js","/assets/Tooltip-DzzgL9F0.js","/assets/TrendChart-CpYfqQxB.js","/assets/TripleSpeedometer-DTtgqfrf.js","/assets/Trudoyomkost-CCTT0Hus.js","/assets/Turnover-8jfBJlyE.js","/assets/UploadDropzone-1KRJ9n8D.js","/assets/UsersActivity-BnL-PPny.js","/assets/VerdictBlock-BYznlr8_.js","/assets/VfxApiMap-BvU208BQ.js","/assets/VfxDictionaries-DUeUvHhi.js","/assets/VfxEmployees-DtR0KQe6.js","/assets/VfxHrMoves-eKXuXhua.js","/assets/VfxJobs-BjocYAMc.js","/assets/VfxPhoto-CzUSbs2r.js","/assets/VfxShifts-DQ94t2Hi.js","/assets/VfxState-TJtNuWj6.js","/assets/VfxTimebooks-CEL3wEjE.js","/assets/VfxTimesheet-Bfuku-Ym.js","/assets/WatchProgress-C902FeYi.js","/assets/WebLogin-B46YwaVN.js","/assets/WorkerConcerns-Uur58ggo.js","/assets/Workers-C2fXW6G9.js","/assets/Zagruzka-7e9GQELm.js","/assets/ZagruzkaCell-juaFPmkN.js","/assets/api-BDzkJkbu.js","/assets/archive-DgBxuFcJ.js","/assets/archive-restore-Bq77HAkP.js","/assets/arrow-down-DYIBsbwQ.js","/assets/arrow-down-wide-narrow-DIKVb2UR.js","/assets/arrow-up-narrow-wide-CtIALDFv.js","/assets/award-CFVtzTVX.js","/assets/ban-D7Rd2rFd.js","/assets/boxes-BoxcVdj5.js","/assets/braces-C1LGr0Sz.js","/assets/brigadirFilters-CXyGOcC9.js","/assets/broadcastTree-vQb5JfX-.js","/assets/building-2-BJP8Hwrd.js","/assets/calculator-CYsEPFEY.js","/assets/calendar-IozEheF1.js","/assets/calendar-days-DOprvJZZ.js","/assets/camera-D5PjQCVU.js","/assets/categories-B7aEGZID.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DxyGwaLc.js","/assets/chart-line-By2wYeCm.js","/assets/chart-pie-C8Mp1o-2.js","/assets/chartRange-DBNDyUqH.js","/assets/check-check-BkIhM6LE.js","/assets/chevron-left-CWaJoO1Z.js","/assets/chevrons-up-down-SW5y3SVA.js","/assets/circle-BnIsJuFJ.js","/assets/circle-alert-CPHp4jB0.js","/assets/circle-check-big-DSOYn2Pl.js","/assets/circle-dashed-DQQmL1NH.js","/assets/circle-minus-f2Pwmoku.js","/assets/circle-question-mark-9UdniFXL.js","/assets/circle-slash-CWoux8BX.js","/assets/circle-user-round-DwxH-f8E.js","/assets/clock-3-De9auEL-.js","/assets/cloud-off-Bahj1Jt0.js","/assets/cloud-upload-C8Shrzg1.js","/assets/compass-BWypawEu.js","/assets/concernCategories-AVvADQGg.js","/assets/copy-Dm6hbnIE.js","/assets/corner-down-right-Cm5AGUew.js","/assets/createLucideIcon-BulenixQ.js","/assets/es-CW94b2Ml.js","/assets/external-link-Buin49Gh.js","/assets/file-clock-C8TRxL9J.js","/assets/file-exclamation-point-9rMpKQxN.js","/assets/flag-CBlq2om2.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cey18Avy.js","/assets/hash-NFgvQ046.js","/assets/hourglass-7Ythj8Ig.js","/assets/image-C9L7npVR.js","/assets/image-off-6sjfromr.js","/assets/inbox-Rcoimbnz.js","/assets/index-BhqF3KEg.css","/assets/index-DdF6RooJ.js","/assets/keyboard-B4JMyHey.js","/assets/languages-E_O-ti9q.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Du6_0bFN.js","/assets/lightbulb-B3JXjf8X.js","/assets/link-2-C9B1v_8X.js","/assets/link-2-off-C7jj8_Yh.js","/assets/list-ordered-rdzu4I2e.js","/assets/list-tree-1wNi7fr4.js","/assets/lock-open-DSAit_TB.js","/assets/log-in-DAD_nay2.js","/assets/marks-DU1ZSpID.js","/assets/minimize-2-5yspyLm0.js","/assets/package-check-jZkrqPS5.js","/assets/pencil-DUzgPjGP.js","/assets/percent-B0manHQN.js","/assets/pin-Ud8q97Ix.js","/assets/pin-off-Cl2bcGIt.js","/assets/play-C_0uThHL.js","/assets/plug-zap-p3n6e_xC.js","/assets/prop-types-BjGDuCOt.js","/assets/radio-DjnhDtEH.js","/assets/react-apexcharts.esm-C7lsxO2D.js","/assets/registers-DyU2YrqX.js","/assets/repeat-BGcPRWjw.js","/assets/save-CPH0_Egc.js","/assets/scopeLinks-CRACUX_i.js","/assets/scroll-text-CzcSBsqg.js","/assets/search-x-DYYbArbJ.js","/assets/segments-BLcPnopj.js","/assets/send-DVCsQEhA.js","/assets/settings-2-DRsAGy5u.js","/assets/shield-CpP1hyXW.js","/assets/shield-alert-DYH9x2Q-.js","/assets/shield-question-mark-Dng4MQRX.js","/assets/siren-wzusW9Qp.js","/assets/snowflake-BIYAHhhO.js","/assets/split-o_jguVSZ.js","/assets/square-check-big-CrRPGlAi.js","/assets/star-Cc_Px5xM.js","/assets/statusBands-BDabMDLM.js","/assets/store-Bzw-VGoW.js","/assets/table-2-S-OwMB3o.js","/assets/table-properties-Bx_BcxqM.js","/assets/tag-DngnkkoM.js","/assets/timer-off-DnzxJewF.js","/assets/trending-down-Ct8FSCrA.js","/assets/trending-up-CivORJrK.js","/assets/undo-2-DTTD8O6G.js","/assets/useChartTheme-Blzx6pLC.js","/assets/useElementWidth-BN4AFda9.js","/assets/useIsMobile-C7IjP1gp.js","/assets/useOpenParam-CN61a6oL.js","/assets/useStatusBands-Cnr050dl.js","/assets/useUrlScope-DY0l3z4L.js","/assets/user-BP3ETLwJ.js","/assets/user-cog-DyGrp_jD.js","/assets/users-BVy26561.js","/assets/vfx-BbmhejyM.js","/assets/video-CuEjD1Th.js","/assets/wallet-CVen0KYN.js","/assets/warehouse-DtzcEvZ0.js","/assets/workflow-Dfe2hulF.js","/assets/x-BdLsEBXp.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png"];
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
