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

const BUILD = "2026-10-07T04:22:25.202Z";
const PRECACHE = ["/","/assets/AdminPanel-Cm_Il2SU.js","/assets/AnalysisBoard-CZja4I7U.js","/assets/Arc-BehP8Qfk.js","/assets/Assistant-fE1fC4Jd.js","/assets/BrigadirProfile-CYXBgxqc.js","/assets/BroadcastReceivers-D60PBhqm.js","/assets/BroadcastRecord-CO1O0-bN.js","/assets/Button-Cg5dOtAC.js","/assets/CatLockNotice-LA8AGZsK.js","/assets/CategoryLegendModal-DBNKoWRp.js","/assets/CellConcerns-DSw8vJIY.js","/assets/CellDetails-ClQUQJzu.js","/assets/CellFormModal-BhnkHhPR.js","/assets/CellIdent-CghAuyyV.js","/assets/CellLink-DVCte-bm.js","/assets/Cells-Bfah1fLn.js","/assets/ColumnFilter-CgMoUREw.js","/assets/ColumnsPicker-B2gciXQg.js","/assets/CommentsModal-DlSTgaQK.js","/assets/ComparisonTable-Bgvoe4SG.js","/assets/Concerns-DKd1W6SN.js","/assets/Daily-BRIA8nvE.js","/assets/DataTable-CB1JMzmQ.js","/assets/DateRangePicker-C1JkV0Od.js","/assets/DayReportView-qy-OEvT5.js","/assets/DayStepper-C5XAPe3v.js","/assets/DifferenceBreakdown-BSebkYI4.js","/assets/Downtime-BNQRvQlP.js","/assets/Education-D1bi1-5k.js","/assets/EducationLesson-D408SVww.js","/assets/EmptyState-MDS6xDIM.js","/assets/Exam-Ck00YSnz.js","/assets/FactorySelect-Kgc5LU3z.js","/assets/Gamification-Bl2AsMqM.js","/assets/GroupBadge-CRH1vcNG.js","/assets/HeatmapChart-CsQtut2g.js","/assets/IdleCell-CKA3as1Q.js","/assets/KPICard-DcvLJwP7.js","/assets/Kaizen-CwWDyvXR.js","/assets/Kelish-l7fHkcWT.js","/assets/KpiDeltaCard-VC79qbBZ.js","/assets/LangTextInput-ATQUc6OQ.js","/assets/Layout-Cq_bz_8P.js","/assets/LeaderAppeal-BHfLiumU.js","/assets/LeaderDayReport-C6YeOOZW.js","/assets/LeaderUnitReport-CsHcuxUP.js","/assets/Leaderboard-CybMX_cd.js","/assets/Leaders-CcBtzq6L.js","/assets/Lightbox-Bj05sr4o.js","/assets/LiveOverview-HTV3MAFD.js","/assets/Login-Dajeqrye.js","/assets/NotFound-C33R4u7E.js","/assets/Notifications-CV6xcYre.js","/assets/Overview-BDAcpFHS.js","/assets/Pagination-Ch9pKIDz.js","/assets/PerenaladkaFactTable-B7PqOxsB.js","/assets/PersonCard-h-eGfPXa.js","/assets/PlanFulfillment-OXU2ky4x.js","/assets/Production-Q_9x5pSm.js","/assets/Profile-ISxDClqN.js","/assets/ProofCamera-BZLRJ62F.js","/assets/ProofPhoto-DHH4m8dt.js","/assets/Quality-DXgrG8TN.js","/assets/RawRows-CS-SnRaM.js","/assets/RequestStateChip-BjW4e-F9.js","/assets/RichTextEditor-Csx2y1j2.js","/assets/SaveState-B1YMQVow.js","/assets/SearchInput-8-TtjzaB.js","/assets/SeasonalityHeatmap-1zzt_Lmy.js","/assets/SegmentedToggle-DMQBf1cS.js","/assets/SetupTimes-DNNYuiXX.js","/assets/ShiftDaily-CtaBpvPD.js","/assets/Staff-MxT3jI1J.js","/assets/StatusBadge-CmiyQXAI.js","/assets/TargetGoal-D569qUFy.js","/assets/Targets-zygARrAu.js","/assets/Tasks-wFAFrL4B.js","/assets/TimeWheelPicker-BVkzdQzw.js","/assets/Toast-Dgkn3ja-.js","/assets/Tooltip-qE6rIJMn.js","/assets/TrendChart-DYeI02V-.js","/assets/TripleSpeedometer-C_H0OlLv.js","/assets/Trudoyomkost-CBHiI5Om.js","/assets/Turnover-SeQtrieS.js","/assets/UploadDropzone-COqJgTYe.js","/assets/UsersActivity-DJGaFyTM.js","/assets/VerdictBlock-BkcaRYm9.js","/assets/VfxApiMap-ZCYQllod.js","/assets/VfxDictionaries-WHA5NGtr.js","/assets/VfxEmployees-CPmSG56m.js","/assets/VfxHrMoves-DzeKcsWA.js","/assets/VfxJobs-B5X_pUzV.js","/assets/VfxPhoto-Ck292oE5.js","/assets/VfxShifts-D_62-55g.js","/assets/VfxState-5wlQmrDr.js","/assets/VfxTimebooks-D2-6u_Un.js","/assets/VfxTimesheet-CNWtn6a1.js","/assets/WatchProgress-XoQ0qWQ2.js","/assets/WebLogin-DOv8N12h.js","/assets/WorkerConcerns-CYyYhCuU.js","/assets/Workers-D5Koesef.js","/assets/Zagruzka-CE3_emKh.js","/assets/ZagruzkaCell-DnLxke5C.js","/assets/api-a6EMyoUO.js","/assets/archive-C2ljrdna.js","/assets/archive-restore-C-M46Rwg.js","/assets/arrow-down-DU7fPJph.js","/assets/arrow-up-narrow-wide-PFE7sqXY.js","/assets/award-wXSamzUG.js","/assets/ban-ByoGttNn.js","/assets/boxes-DXkbXgDN.js","/assets/braces-B2_BG5C6.js","/assets/brigadirFilters-Co0I6HKT.js","/assets/broadcastTree-CqcVeNDl.js","/assets/building-2-B8JUdZpf.js","/assets/calculator-fwP3gR4f.js","/assets/calendar-Db1IE1wh.js","/assets/calendar-days-C2IejeUa.js","/assets/camera-yV063RGA.js","/assets/categories-DBGAQzFo.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-EQ-9hL__.js","/assets/chart-line-BhPhOGSL.js","/assets/chart-pie-BPqg4wqG.js","/assets/chartRange-BENOeanu.js","/assets/check-check-CcNF7lPZ.js","/assets/chevron-left-dhv-iq45.js","/assets/chevrons-up-down-BJ1J_mPg.js","/assets/circle-OeBFe0Dd.js","/assets/circle-alert-B40fqzvP.js","/assets/circle-check-big-DgvNQY8h.js","/assets/circle-dashed-Dr5gk9KU.js","/assets/circle-minus-Dx6HK2o7.js","/assets/circle-question-mark-DtttLL4z.js","/assets/circle-slash-B18HFNVy.js","/assets/circle-user-round-BUk4MMqi.js","/assets/clock-3-UTCy1dJh.js","/assets/cloud-off-BJk1E22T.js","/assets/cloud-upload-v2jwk2Dd.js","/assets/compass-DLA9nLnz.js","/assets/concernCategories-D1cFztlj.js","/assets/copy-DusIPH8q.js","/assets/corner-down-right-CdRyWYiT.js","/assets/createLucideIcon-CwwlrF5U.js","/assets/es-DB7mNXSq.js","/assets/external-link-uISTjdIQ.js","/assets/file-clock-Cz7OPkgd.js","/assets/file-exclamation-point-nSvtW8F_.js","/assets/flag-CEglQgAq.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-HrZe4ygn.js","/assets/hash-BgQjXkG3.js","/assets/hourglass-BOH0fWaN.js","/assets/image-Dy1SnWMa.js","/assets/image-off-Da28-NOy.js","/assets/inbox-fjnGXvhe.js","/assets/index-BYLu8eK_.css","/assets/index-gCEFQHJk.js","/assets/keyboard-DK3_SN_n.js","/assets/languages-BnBoGxXx.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-3JDBUzoc.js","/assets/lightbulb-DqMyzCBB.js","/assets/link-2-Cbsxr_H5.js","/assets/link-2-off-8RWLCThD.js","/assets/list-ordered-DWPc_yIz.js","/assets/list-tree-DeOrGvx8.js","/assets/lock-open-BgA8Tt9L.js","/assets/log-in-BKC9fqeb.js","/assets/minimize-2-DH22SGhr.js","/assets/package-check-BXGx4mg4.js","/assets/pencil-C9DCGoFw.js","/assets/percent-qT8TmX-4.js","/assets/pin-DgQAI6mO.js","/assets/pin-off-Ldtfbqzs.js","/assets/play-BrQ8OX8p.js","/assets/plug-zap-Uqx4E9gU.js","/assets/prop-types-DVEhp_Us.js","/assets/radio-U9_-iflx.js","/assets/react-apexcharts.esm-B1FwFjrF.js","/assets/registers-Da2TJS16.js","/assets/repeat-B8mTB6Ti.js","/assets/rotate-cw-D5luLYha.js","/assets/save-BGbWUv4Y.js","/assets/scopeLinks-P3BGExxs.js","/assets/scroll-text-DzU3aQj9.js","/assets/search-x-DdKwW2XD.js","/assets/segments-D7pMXepp.js","/assets/send-C9QCRv1R.js","/assets/settings-2-DdKMhGIi.js","/assets/shield-XizmT4w5.js","/assets/shield-alert-CTuPIRAw.js","/assets/shield-question-mark-C5UiRORm.js","/assets/siren-RDc2rKvX.js","/assets/snowflake-CBjG0bfS.js","/assets/split-DYOEiWAW.js","/assets/square-check-big-DX8DwHTL.js","/assets/star-CIJtZVto.js","/assets/statusBands-DIZTRh7c.js","/assets/store-DWHi_o3N.js","/assets/table-2-Bs1I8OJt.js","/assets/table-properties-CSEfbeTJ.js","/assets/tag-B8FvRu7-.js","/assets/timer-off-BBhElHA1.js","/assets/trending-down-Cd15d45D.js","/assets/trending-up-DWKyS_Tg.js","/assets/undo-2-BFWIifEy.js","/assets/useChartTheme-Bks_VLok.js","/assets/useElementWidth-C3mvzMKk.js","/assets/useIsMobile-BD4G9M2a.js","/assets/useOpenParam-CqilqSuM.js","/assets/useStatusBands-DTm4d_m8.js","/assets/useUrlScope-DEYdEshc.js","/assets/user-D-WvSaPZ.js","/assets/user-cog-CinVNVpQ.js","/assets/users-CW5Euikp.js","/assets/vfx-DsMXqJP0.js","/assets/video-DJk_-9N7.js","/assets/wallet-BG4O9n2h.js","/assets/warehouse-B7FPAYtM.js","/assets/x-Bo9H4kzJ.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
