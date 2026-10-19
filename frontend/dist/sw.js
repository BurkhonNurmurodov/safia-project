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

const BUILD = "2026-10-19T06:14:21.357Z";
const PRECACHE = ["/","/assets/AdminPanel-DmHK22-4.js","/assets/AnalysisBoard-C5DM2kID.js","/assets/Arc-CpwU-04l.js","/assets/Assistant-DyZGc_-c.js","/assets/BrigadirProfile-d1N7lBv2.js","/assets/BroadcastReceivers-CnY9wUSo.js","/assets/BroadcastRecord--MmGpNWw.js","/assets/Button-CyRHPT82.js","/assets/CatLockNotice-B6mzL6K_.js","/assets/CategoryLegendModal-BJuoMtOn.js","/assets/CellConcerns-DedsUKaA.js","/assets/CellDetails-Yhjczy5g.js","/assets/CellFormModal-CWeELqrV.js","/assets/CellIdent-Cwye5ct0.js","/assets/CellLink-BFLnuisI.js","/assets/Cells-DqpVpD3p.js","/assets/ColumnFilter-Dn00WuNN.js","/assets/ColumnsPicker-D22ZaAq5.js","/assets/CommentsModal-B8gOFRpH.js","/assets/ComparisonTable-NxBwGXH6.js","/assets/Concerns-xH8yFgzb.js","/assets/CountStepper-DMAE6HHR.js","/assets/Daily-hNeezHh7.js","/assets/DataTable-C76l1zzo.js","/assets/DateRangePicker-DhwyUspp.js","/assets/DayReportView-DqCl8a3T.js","/assets/DayStepper-B6QTJyS7.js","/assets/DifferenceBreakdown-DkaSg65N.js","/assets/Downtime-Btm-n20Q.js","/assets/Education-CbU7yJCR.js","/assets/EducationLesson-DfqMi8KV.js","/assets/EmptyState-D9gsCsZL.js","/assets/Exam-Cr_F1nug.js","/assets/FactorySelect-Crg6svMn.js","/assets/Gamification-BAF_Tcd8.js","/assets/GroupBadge-W0HUBCbR.js","/assets/HeatmapChart-CxebjO0l.js","/assets/IdleCell-DAHai8O4.js","/assets/KPICard-BoJX04yA.js","/assets/Kaizen-CFIlKCPV.js","/assets/Kelish-CcjA14X7.js","/assets/KpiDeltaCard-BAzsANbQ.js","/assets/LangTextInput-BYceHYmY.js","/assets/Layout-DRwFdPwY.js","/assets/LeaderAppeal-CDpdlhuD.js","/assets/LeaderDayReport-BsUVKudI.js","/assets/LeaderUnitReport-OJBNNl_n.js","/assets/Leaderboard-DKD4bX2I.js","/assets/Leaders-CCYUPsov.js","/assets/LeadersKpi-CrPnnaiO.js","/assets/Lightbox-BCZV4yhk.js","/assets/LiveOverview-BT8sVbJf.js","/assets/Login-C_CupuaE.js","/assets/NotFound-CCC4WVEK.js","/assets/Notifications-CElo8QOG.js","/assets/Overview-Dx_8_yez.js","/assets/Pagination-BnvIzpls.js","/assets/PerenaladkaFactTable-1OcUHB8o.js","/assets/PersonCard-DGNmDYbt.js","/assets/PlanFulfillment-DvQHCFVD.js","/assets/Production-BpumrUwU.js","/assets/Profile-BBf8dLOP.js","/assets/ProofCamera-cak2bfOt.js","/assets/ProofPhoto-CXqwzL3i.js","/assets/Quality-DBXgIspc.js","/assets/RawRows-DSHoeTSg.js","/assets/RequestStateChip-Bubfp4Km.js","/assets/RichTextEditor-BvTprw5A.js","/assets/SaveState-DJFUP7Ci.js","/assets/SearchInput-CTF38eOx.js","/assets/SeasonalityHeatmap-GzhYV4Yc.js","/assets/SegmentedToggle-BEckjuO_.js","/assets/SetupTimes-DZ6Bhxc6.js","/assets/ShiftDaily-v2JCShzc.js","/assets/Staff-QH2w0-Rs.js","/assets/StaffListAtCheck-D0-5CHc8.js","/assets/StatusBadge-Hs6i9qgJ.js","/assets/TargetGoal-BbfrmWBY.js","/assets/Targets-CFlHA9vm.js","/assets/Tasks-CG9YgKmU.js","/assets/TimeWheelPicker-C8Ydw_gq.js","/assets/Toast-CvknPqPd.js","/assets/Tooltip-0Ha3sEUK.js","/assets/TrendChart-BjqsYeWN.js","/assets/TripleSpeedometer-hy2lA1gp.js","/assets/Trudoyomkost-Ctv8KY6v.js","/assets/UploadDropzone-aFF_8L_9.js","/assets/UsersActivity-BHj5ErfR.js","/assets/VerdictBlock-CyWHPC2o.js","/assets/VfxApiMap-C6izo7QW.js","/assets/VfxDictionaries-Ck3sY_dT.js","/assets/VfxEmployees-BdGaZqQf.js","/assets/VfxHrMoves-BwDTSRUb.js","/assets/VfxJobs-jcd2drKC.js","/assets/VfxPhoto-CQOf-4Xs.js","/assets/VfxShifts-BnICCFUx.js","/assets/VfxState-BpHs-h9O.js","/assets/VfxTimebooks-DjCMr7ks.js","/assets/VfxTimesheet-BQOlDGG1.js","/assets/WatchProgress-BmrKUpie.js","/assets/WebLogin-BYmUK2QE.js","/assets/Workers-C2Q_PIPy.js","/assets/Zagruzka-Dq3TZEsO.js","/assets/ZagruzkaCell-MC81gqOD.js","/assets/api-D1bgFr4O.js","/assets/archive-0SvA6-fT.js","/assets/archive-restore-B2g0e8Ae.js","/assets/arrow-down-CbIS5MD2.js","/assets/arrow-down-wide-narrow-CwMWwLF2.js","/assets/arrow-up-narrow-wide-DYf6-jvq.js","/assets/ban-DQUmmprS.js","/assets/boxes-DElXJGDD.js","/assets/braces-C4BQGkdy.js","/assets/brigadirFilters-DYx0p3rD.js","/assets/broadcastTree-C2XfAA5G.js","/assets/building-2-Cv8stOz5.js","/assets/calculator-je5dTzZt.js","/assets/calendar-BAHI7fJO.js","/assets/calendar-days-_vOpX2bP.js","/assets/camera-Bz83YhH9.js","/assets/categories-aXCnTGyE.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DOAYsB6U.js","/assets/chart-line-C-QzPOAi.js","/assets/chart-pie-DgAQ2SDE.js","/assets/chartRange-x5jK0TRP.js","/assets/check-check-C3KaYUCE.js","/assets/chevron-left-DUjMNDjw.js","/assets/chevrons-up-down-DnR4nMN5.js","/assets/circle-C0OzHoeS.js","/assets/circle-alert-Borpvy1Z.js","/assets/circle-check-big-CTpd-_6h.js","/assets/circle-dashed-Bza-rTrW.js","/assets/circle-minus-XEy70m8A.js","/assets/circle-question-mark-yK9KWpOx.js","/assets/circle-slash-Dr7_lido.js","/assets/circle-user-round-BhYAXtiW.js","/assets/cloud-off-D0EEQ-13.js","/assets/cloud-upload-BxHMahig.js","/assets/compass-Bgc55wNc.js","/assets/concernCategories-CMnYT9ZF.js","/assets/corner-down-right-CZuJiibk.js","/assets/createLucideIcon-vqeaTWC5.js","/assets/es-DOZJFIVw.js","/assets/external-link-PtvTZr29.js","/assets/file-clock-B2lmlqPK.js","/assets/file-exclamation-point-BGtu67W3.js","/assets/flag-BUD3tYz-.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DnXfoesj.js","/assets/hash-BGi7ZOtT.js","/assets/hourglass-CTI6Iq4X.js","/assets/image-8TxYK_tn.js","/assets/image-off-aHjGK2qc.js","/assets/inbox-CvuCNwCR.js","/assets/index-CPRj64eN.js","/assets/index-L1D4X663.css","/assets/keyboard-DCz9en-4.js","/assets/languages-DsCUvH8a.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BNUJZAbX.js","/assets/lightbulb-DV-sOURe.js","/assets/link-2-Cex0wZE2.js","/assets/link-2-off-X9e56qqI.js","/assets/list-ordered-kHm7fYeH.js","/assets/list-tree-CI5jFChe.js","/assets/lock-open-Be56Tgad.js","/assets/log-in-CwVzpyWs.js","/assets/marks-CerxgvOc.js","/assets/minimize-2-BtVXvKHL.js","/assets/package-check-Bqhjn0Fv.js","/assets/pencil-FJEjxvrt.js","/assets/percent-Dte9tmbf.js","/assets/pin-6deM_-lO.js","/assets/pin-off-buMjBOaU.js","/assets/play-kMEWGTzd.js","/assets/plug-zap-D2Ducd1p.js","/assets/prop-types-DdpmfOLN.js","/assets/radio-0PDvfBHH.js","/assets/react-apexcharts.esm-CDxurVRX.js","/assets/registers-HvtLmVLq.js","/assets/repeat-DnWwJYLX.js","/assets/save-qyPiJFnc.js","/assets/scopeLinks-uvA2gpsB.js","/assets/scroll-text-CfcWD9vz.js","/assets/search-x-CvFW7ic-.js","/assets/segments--1QxdsJq.js","/assets/send-CLGnYPYY.js","/assets/settings-2-u-zkpT1M.js","/assets/shield-DJslJJZB.js","/assets/shield-alert-CKZf7IsZ.js","/assets/shield-question-mark-C-j7-IBp.js","/assets/siren-CJGDKd--.js","/assets/snowflake-D8-D7wAt.js","/assets/split-ve_S5V41.js","/assets/square-check-big-DGt2nqLY.js","/assets/star-C3ihEtQl.js","/assets/statusBands-BfkTd-3F.js","/assets/store-PZ-PTU9N.js","/assets/table-2-D9RjbBRV.js","/assets/table-properties-B9SIJIfj.js","/assets/tag-DE7pWt3m.js","/assets/timer-off-Dtla1koT.js","/assets/trending-down-DBJfYg7J.js","/assets/trending-up-BCZJ5TCj.js","/assets/undo-2-D3id1rsv.js","/assets/useChartTheme-abjxYpCy.js","/assets/useElementWidth-CXxEQIeZ.js","/assets/useIsMobile-7mkz6j68.js","/assets/useOpenParam-D8uuV6bL.js","/assets/useStatusBands-U5zZ8zQD.js","/assets/useUrlScope-BBNaF_Wm.js","/assets/user-D6tJBlVB.js","/assets/user-cog-BB-QvBCE.js","/assets/user-minus-df_60XyK.js","/assets/users-95pidM7j.js","/assets/vfx-9Qeif956.js","/assets/video-D40EvszJ.js","/assets/wallet-C2pcYkaF.js","/assets/warehouse-DtD_4T7C.js","/assets/workflow-BhILj7uD.js","/assets/x-DCsUNc7a.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
