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

const BUILD = "2026-10-12T10:33:11.340Z";
const PRECACHE = ["/","/assets/AdminPanel-DLGVOkPY.js","/assets/AnalysisBoard-_xkS8XLo.js","/assets/Arc-DCZI6S8X.js","/assets/Assistant-DPf4_4MB.js","/assets/BrigadirProfile-C5o6Q2Gf.js","/assets/BroadcastReceivers-BAsZvE2P.js","/assets/BroadcastRecord-C7EQRX4t.js","/assets/Button-BBZlTmjC.js","/assets/CatLockNotice-CDoiuTTe.js","/assets/CategoryLegendModal-BOgQRy7b.js","/assets/CellConcerns-CfA8qxo5.js","/assets/CellDetails-B2WP0Ocj.js","/assets/CellFormModal-MgY7zBBC.js","/assets/CellIdent-50Ng4bLZ.js","/assets/CellLink-BbzGr-xW.js","/assets/Cells-DYiXRoQP.js","/assets/ColumnFilter-DU54jdJj.js","/assets/ColumnsPicker-CDMcgrID.js","/assets/CommentsModal-Bte8Ix2k.js","/assets/ComparisonTable-CW9XI1-s.js","/assets/Concerns-Cdsdnbt8.js","/assets/Daily-OIau12hd.js","/assets/DataTable-Wa7O80YY.js","/assets/DateRangePicker-D2-5br79.js","/assets/DayReportView-BMbNSiHR.js","/assets/DayStepper-CXS4wKVw.js","/assets/DifferenceBreakdown-CvuvzqUe.js","/assets/Downtime-BNbPMiEY.js","/assets/Education-CdxHCQNN.js","/assets/EducationLesson-BXeEtGKi.js","/assets/EmptyState-1Rs8phxn.js","/assets/Exam-WvKA7WgR.js","/assets/FactorySelect-C6gpymYz.js","/assets/Gamification-Iv1UFJsF.js","/assets/GroupBadge-CrbHkimA.js","/assets/HeatmapChart-CquKm8IA.js","/assets/IdleCell-CcewiFxa.js","/assets/KPICard-nIEMbsfz.js","/assets/Kaizen-9p87h_a6.js","/assets/Kelish-BxbLIW7u.js","/assets/KpiDeltaCard-DIewS29J.js","/assets/LangTextInput-md0QUavp.js","/assets/Layout-B00KT-Xf.js","/assets/LeaderAppeal-fFCNIiyv.js","/assets/LeaderDayReport-CdxdgBHo.js","/assets/LeaderUnitReport-BSz5otos.js","/assets/Leaderboard-BX6HofxZ.js","/assets/Leaders-BMRPGBgB.js","/assets/Lightbox-7sOc1vkD.js","/assets/LiveOverview-CG3--PPW.js","/assets/Login-BN-5CaWf.js","/assets/NotFound-Bh-IS2nG.js","/assets/Notifications-DG2QaO32.js","/assets/Overview-BjSPWhR8.js","/assets/Pagination-C7T7UBJd.js","/assets/PerenaladkaFactTable-CMnnuRCr.js","/assets/PersonCard-BV-jdzie.js","/assets/PlanFulfillment-DnT-kkp2.js","/assets/Production-CbSLQ4Kr.js","/assets/Profile-Bev1Ly9o.js","/assets/ProofCamera-CPDvmvEQ.js","/assets/ProofPhoto-BFBFOyF6.js","/assets/Quality-Dv8x0_WF.js","/assets/RawRows-CULeFITm.js","/assets/RequestStateChip-C6cN9T50.js","/assets/RichTextEditor-Dvwv5q5x.js","/assets/SaveState-BuXUu99l.js","/assets/SearchInput-XbAaKc4q.js","/assets/SeasonalityHeatmap-B9856vTb.js","/assets/SegmentedToggle-BQFkyUdH.js","/assets/SetupTimes-PhZfo1s5.js","/assets/ShiftDaily-oe8oR0f8.js","/assets/Staff-B8nCgsyB.js","/assets/StatusBadge-pwzdKEuV.js","/assets/TargetGoal-DwD9tA4c.js","/assets/Targets-CrXeruz4.js","/assets/Tasks-BIBOAprd.js","/assets/TimeWheelPicker-DS59iaf9.js","/assets/Toast-CdO86mqZ.js","/assets/Tooltip-Cq63XgVU.js","/assets/TrendChart-Cpn1tnz-.js","/assets/TripleSpeedometer-DgzaTGgu.js","/assets/Trudoyomkost-C7YKHRFX.js","/assets/Turnover-BYB6HEBU.js","/assets/UploadDropzone-CS8vYdRY.js","/assets/UsersActivity-BIZDyX-z.js","/assets/VerdictBlock-CH-n_62M.js","/assets/VfxApiMap-CyYe02Zt.js","/assets/VfxDictionaries-CcZbI-y1.js","/assets/VfxEmployees-D_Yemfv4.js","/assets/VfxHrMoves-DR4RjykU.js","/assets/VfxJobs-Cglh_Eya.js","/assets/VfxPhoto-DkVwVsBW.js","/assets/VfxShifts-ortD0rr8.js","/assets/VfxState-C-6-uVxA.js","/assets/VfxTimebooks-CoE9ij4b.js","/assets/VfxTimesheet-BJK26fbc.js","/assets/WatchProgress-Bg79p8zG.js","/assets/WebLogin-C2ZJW_2d.js","/assets/WorkerConcerns-CPDcTUap.js","/assets/Workers-DExyq1Rt.js","/assets/Zagruzka-B_pmTXeW.js","/assets/ZagruzkaCell-BzRIHQgP.js","/assets/api-CMBruHi8.js","/assets/archive-CIV5U3T2.js","/assets/archive-restore-C2dO2kAP.js","/assets/arrow-down-D6-P7Zfw.js","/assets/arrow-down-wide-narrow-N_agE753.js","/assets/arrow-up-narrow-wide-C2NbzfYv.js","/assets/award-DcPpwX8Z.js","/assets/ban-BiElqJwO.js","/assets/boxes-B67WeU2d.js","/assets/braces-BtOxvEoM.js","/assets/brigadirFilters-DJSYn6WD.js","/assets/broadcastTree-BmPIHiIp.js","/assets/building-2-B6iiaByz.js","/assets/calculator-CVVaMkzh.js","/assets/calendar-DEft7756.js","/assets/calendar-days-BUYIWZ24.js","/assets/camera-BMpUBzuw.js","/assets/categories-DDcJVr3H.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DWkQmD73.js","/assets/chart-line-BhFX1-Gj.js","/assets/chart-pie-DTZ8BhDm.js","/assets/chartRange-CFvuSOsb.js","/assets/check-check-CimbZWeo.js","/assets/chevron-left-Hb3J5gVB.js","/assets/chevrons-up-down-DSkCctLp.js","/assets/circle-DN8fsNST.js","/assets/circle-alert-RYPRX0yK.js","/assets/circle-check-big-CpGOYxBV.js","/assets/circle-dashed-UrOlHaRi.js","/assets/circle-minus-BY2J7Skt.js","/assets/circle-question-mark-Duz1DdxD.js","/assets/circle-slash-76O0vMEf.js","/assets/circle-user-round-S7hP_ej3.js","/assets/clock-3-BYXMQD_b.js","/assets/cloud-off-B18dmwfI.js","/assets/cloud-upload-3JdSGKte.js","/assets/compass-D4nl8hbu.js","/assets/concernCategories-CipKEYRV.js","/assets/copy-BHmFd_f6.js","/assets/corner-down-right-Dhw0THLr.js","/assets/createLucideIcon-DNcavtP9.js","/assets/es-0DNqAhdc.js","/assets/external-link-BfW9YmLj.js","/assets/file-clock-OcXWegmc.js","/assets/file-exclamation-point-B6mdF9fi.js","/assets/flag-D6WBMmYE.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Cb2I7Btz.js","/assets/hash-udkbH-ac.js","/assets/hourglass-Bn5Q_kk8.js","/assets/image-BeY_PlzS.js","/assets/image-off-U-M_M-Vt.js","/assets/inbox-B9rmHsyb.js","/assets/index-Ba4ENk7b.js","/assets/index-CI1cZ1SD.css","/assets/keyboard-BkZo6dEA.js","/assets/languages-CrP1vZ01.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CzXH7p5N.js","/assets/lightbulb-BK4SfWud.js","/assets/link-2-DNkkRr2u.js","/assets/link-2-off-DZ7Xuaqu.js","/assets/list-ordered-jVNDxvhQ.js","/assets/list-tree-DE_OuF-9.js","/assets/lock-open-BB81Gd9F.js","/assets/log-in-D0FeiWHa.js","/assets/minimize-2-DrkL_Hba.js","/assets/package-check-BL9bUG2l.js","/assets/pencil-D2q4uo96.js","/assets/percent-Cptl_QBl.js","/assets/pin-fv7cMU5T.js","/assets/pin-off-Bh0qs6B0.js","/assets/play-DQvQX_T7.js","/assets/plug-zap-CspXva23.js","/assets/prop-types-H42F5vYZ.js","/assets/radio-qTQLBD6e.js","/assets/react-apexcharts.esm-m8lKkOrW.js","/assets/registers-CqeL62Xv.js","/assets/repeat-BYBX6nGN.js","/assets/save-5BkLVFzf.js","/assets/scopeLinks-BsOKSkK1.js","/assets/scroll-text-B2vwp1VV.js","/assets/search-x-ouWsfsq4.js","/assets/segments-DthAogC4.js","/assets/send-DirPqVZk.js","/assets/settings-2-BX0DX5b-.js","/assets/shield-C4cOWXgq.js","/assets/shield-alert-DQdUcewB.js","/assets/shield-question-mark-CzqqNWOP.js","/assets/siren-pAmSvbsT.js","/assets/snowflake-BJDeq_tJ.js","/assets/split-BI2ohZob.js","/assets/square-check-big-drReQwLp.js","/assets/star-CSofxSY1.js","/assets/statusBands-C-p4Amtp.js","/assets/store-XdHxryg3.js","/assets/table-2-DG_eZy4P.js","/assets/table-properties-DVYl66dP.js","/assets/tag-XZ1q9_At.js","/assets/timer-off-ChF4Ywfg.js","/assets/trending-down-C8y5QKG8.js","/assets/trending-up-BhwpCCAQ.js","/assets/undo-2-I55a-i12.js","/assets/useChartTheme-CqYv2gdR.js","/assets/useElementWidth-Be-NVG4M.js","/assets/useIsMobile-BEIzLh2u.js","/assets/useOpenParam-DQYAExsp.js","/assets/useStatusBands-wgptrQRd.js","/assets/useUrlScope-p-7QpR24.js","/assets/user-BbiOp2E4.js","/assets/user-cog-DLjeZxmk.js","/assets/users-B7NcD6YF.js","/assets/vfx-BmOVrv2I.js","/assets/video-B2qUJ2ZS.js","/assets/wallet-Bbbcf-p8.js","/assets/warehouse-C-KOdumK.js","/assets/workflow-BhD-GVno.js","/assets/x-DNIbM_nC.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
