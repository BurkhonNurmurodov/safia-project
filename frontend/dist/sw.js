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

const BUILD = "2026-10-19T13:26:42.973Z";
const PRECACHE = ["/","/assets/AdminPanel-Dtz5BWsE.js","/assets/AnalysisBoard-DIeYrvoo.js","/assets/Arc-DXOkzs46.js","/assets/Assistant-tSvl3ezC.js","/assets/BrigadirProfile-BAC32LeU.js","/assets/BroadcastReceivers-BJh04N2I.js","/assets/BroadcastRecord-MRiQdAtF.js","/assets/Button-CDekvHMw.js","/assets/CatLockNotice-v_fo-pqQ.js","/assets/CategoryLegendModal-ZrRXViZA.js","/assets/CellConcerns-BRjsaaM_.js","/assets/CellDetails-DuBnOFOv.js","/assets/CellFormModal-CMXLc0f5.js","/assets/CellIdent-MbHdUvoj.js","/assets/CellLink-B-2olf9C.js","/assets/Cells-BqF4vBgK.js","/assets/ColumnFilter-CFBYuQvp.js","/assets/ColumnsPicker-Dg2aXK-9.js","/assets/CommentsModal-PUjyUeVE.js","/assets/ComparisonTable-D6NUxuaq.js","/assets/Concerns-t0OOBiSK.js","/assets/CountStepper-D1tO6YcJ.js","/assets/Daily-CeCS4QQO.js","/assets/DataTable-fVki-8EH.js","/assets/DateRangePicker-MawHgf2F.js","/assets/DayReportView-CsBrLaHF.js","/assets/DayStepper-BNv4CYnO.js","/assets/DifferenceBreakdown-D41xU_tF.js","/assets/Downtime-C0BTu2dQ.js","/assets/Education-D1iDC6du.js","/assets/EducationLesson-alqdG45E.js","/assets/EmptyState-CwKBzD1D.js","/assets/Exam-DhBnCy3_.js","/assets/FactorySelect-DQjd5M3o.js","/assets/Gamification-Cm6sC-Ek.js","/assets/GroupBadge-DpXVOkjK.js","/assets/HeatmapChart-DO56H1bQ.js","/assets/IdleCell-CIc0MELg.js","/assets/KPICard-DbQK2d6u.js","/assets/Kaizen-oHAwYWGD.js","/assets/Kelish-CwCHNlZX.js","/assets/KpiDeltaCard-CvVvc7yf.js","/assets/LangTextInput-DnwPCdc9.js","/assets/Layout-CVDUqdbS.js","/assets/LeaderAppeal-Dgz8UkDj.js","/assets/LeaderDayReport-BmKr7Qov.js","/assets/LeaderUnitReport-DZ_Xh1j-.js","/assets/Leaderboard-Dm_Tp-pW.js","/assets/Leaders-CiirRf1s.js","/assets/LeadersKpi-ByTpEBaj.js","/assets/Lightbox-uJBHYvfx.js","/assets/LiveOverview-DeJvI7u-.js","/assets/Login-BSC-A_z4.js","/assets/NotFound-j9rMpo5P.js","/assets/Notifications-CbVT_TID.js","/assets/Overview-ByDsIArj.js","/assets/Pagination-Bae7MwFW.js","/assets/PerenaladkaFactTable-B-ehmTtd.js","/assets/PersonCard-oESe1idM.js","/assets/PlanFulfillment-Bzyz-bn_.js","/assets/Production-D4e3auuz.js","/assets/Profile-VXHKxAnQ.js","/assets/ProofCamera-Dq_odt28.js","/assets/ProofPhoto-B9PZ_Xyk.js","/assets/Quality-CM8800k4.js","/assets/RawRows-D2dUXiFR.js","/assets/RequestStateChip-BDlfNfqF.js","/assets/RichTextEditor-DTk6DJUO.js","/assets/SaveState-O4o7q7oQ.js","/assets/SearchInput-n69yDdR1.js","/assets/SeasonalityHeatmap-CqLQmbgk.js","/assets/SegmentedToggle-BCpjpE2e.js","/assets/SetupTimes-BfmIbsBq.js","/assets/ShiftDaily-dGRFTcAm.js","/assets/Staff-rG1bY_-9.js","/assets/StaffListAtCheck-FbuAOcbJ.js","/assets/StatusBadge-BSkfKUJZ.js","/assets/TargetGoal-wkK6yEpD.js","/assets/Targets-DYd7dq5V.js","/assets/Tasks-D-eRdGmD.js","/assets/TimeWheelPicker-CXGdqBVB.js","/assets/Toast-Cw7JxcBz.js","/assets/Tooltip-DxHbEoye.js","/assets/TrendChart-BwP2hDQD.js","/assets/TripleSpeedometer-DIanKixN.js","/assets/Trudoyomkost-DSr8AzGN.js","/assets/UploadDropzone-BwTKk6Hb.js","/assets/UsersActivity-CwZt4yi5.js","/assets/VerdictBlock--RN24PJ6.js","/assets/VfxApiMap-D62F639R.js","/assets/VfxDictionaries-CU3Xk-0o.js","/assets/VfxEmployees-BnfsGrC6.js","/assets/VfxHrMoves-BPNaBlfL.js","/assets/VfxJobs-B1_2WgGz.js","/assets/VfxPhoto-CvsRNOHN.js","/assets/VfxShifts-DWpghOD3.js","/assets/VfxState-BRSANOID.js","/assets/VfxTimebooks-DMXBI1LA.js","/assets/VfxTimesheet-Cnguh21b.js","/assets/WatchProgress-C5BngzTO.js","/assets/WebLogin-Ut8E5XQc.js","/assets/Workers-DfOoTOo8.js","/assets/Zagruzka-IIhTKR4B.js","/assets/ZagruzkaCell-C08CSWGz.js","/assets/api-CWFHRyaf.js","/assets/archive-CGAcPkof.js","/assets/archive-restore-iJH3MPhQ.js","/assets/arrow-down-Dn-q-nWJ.js","/assets/arrow-down-right-w6IUgy4B.js","/assets/arrow-down-wide-narrow-CIKlIgpy.js","/assets/arrow-up-narrow-wide-BZV3m7w4.js","/assets/ban-Cl_QwONq.js","/assets/boxes-B60Jk-LQ.js","/assets/braces-BSnGZo_1.js","/assets/brigadirFilters-OMQa76z2.js","/assets/broadcastTree-CHDkQ0RU.js","/assets/building-2-DONxCD_3.js","/assets/calculator-B5-2Rp1V.js","/assets/calendar-CVNu8DMv.js","/assets/calendar-days-CZSl6U4A.js","/assets/camera-J3migt7E.js","/assets/categories-Dh0gGXlA.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Bn78WS9a.js","/assets/chart-line-Cm9pe-gm.js","/assets/chart-pie-BZvdesqy.js","/assets/chartRange-CoAvL8vr.js","/assets/check-check-BNIgl_P-.js","/assets/chevron-left-BV6pca9Q.js","/assets/chevrons-up-down-DYtCwNU6.js","/assets/circle-B569KtNh.js","/assets/circle-alert-C8YwbXTQ.js","/assets/circle-check-big-AsM7NReN.js","/assets/circle-dashed-C1H2kPI5.js","/assets/circle-minus-C1hpTPzQ.js","/assets/circle-question-mark-UFBCP93Z.js","/assets/circle-slash-s_ySiluz.js","/assets/circle-user-round-CUX2B-SY.js","/assets/cloud-off-CI203QO_.js","/assets/cloud-upload-yNyery5Q.js","/assets/compass-D4zmwkjP.js","/assets/concernCategories-DE7RsmJz.js","/assets/corner-down-right-TRt8V0BH.js","/assets/createLucideIcon-B0EIsmOf.js","/assets/es-BVhsA7zi.js","/assets/external-link-ow_Pz0wS.js","/assets/file-clock-DenMkBob.js","/assets/file-exclamation-point-CYBbEcVJ.js","/assets/flag-Cw7VbhiQ.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-uMC3cniA.js","/assets/funnel-BTJ16nwX.js","/assets/hash-BhOayOzn.js","/assets/hourglass-BtXSTEj9.js","/assets/image-DxDh5mcg.js","/assets/image-off-DHgyMkyG.js","/assets/inbox-DjH-weH1.js","/assets/index-B-bGhMav.css","/assets/index-BhLDMpGI.js","/assets/keyboard-BI2zmaUb.js","/assets/languages-WbgSqUaF.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Ru42M3Yi.js","/assets/lightbulb-DiGkrby3.js","/assets/link-2-CNXtZqQA.js","/assets/link-2-off-zwoY5QCr.js","/assets/list-ordered-7tO2KMcp.js","/assets/list-tree-7ZZdvH9V.js","/assets/lock-open-D8opHpW_.js","/assets/log-in-DhmmJ-Kq.js","/assets/marks-BW-ZxQk1.js","/assets/minimize-2-D4bMKry_.js","/assets/package-check-bGPj77xt.js","/assets/pencil-CGOM-K9r.js","/assets/percent-Crv0DGfn.js","/assets/pin-Do_J3GAY.js","/assets/pin-off-BuDqDWK2.js","/assets/play-DPfGinzd.js","/assets/plug-zap-aAKEi9SN.js","/assets/prop-types-DNvWgYex.js","/assets/radio-C5bc8z7l.js","/assets/react-apexcharts.esm-Cfht8_Ku.js","/assets/registers-zHC73szn.js","/assets/repeat-Dm7Qfzaa.js","/assets/save-VRITVCXD.js","/assets/scopeLinks-DgKY1pFy.js","/assets/scroll-text-DDDIucNl.js","/assets/search-x-DoFYSM0I.js","/assets/segments-CzwndwAo.js","/assets/send-C4tVjCLP.js","/assets/settings-2-CrLAE2PN.js","/assets/shield-alert-C0lYi1CL.js","/assets/shield-kU440V82.js","/assets/shield-question-mark-Cv7jV_Fc.js","/assets/siren-CkR3uozP.js","/assets/snowflake-CN4t0j3_.js","/assets/split-BfrbR-dV.js","/assets/square-check-big-DWqWVDfV.js","/assets/star-Cx5vjvTp.js","/assets/statusBands-BSZ-q3nE.js","/assets/store-BS4Gk9hY.js","/assets/table-2-KKAPLu4U.js","/assets/table-properties-CpYsmi44.js","/assets/tag-CVT43ryM.js","/assets/timer-off-BT6mbz4E.js","/assets/trending-down-Bg_p-15H.js","/assets/trending-up-BpJXdYaO.js","/assets/undo-2-7rUQHHzZ.js","/assets/useChartTheme-nuHzFUrq.js","/assets/useElementWidth-CMJc0oTP.js","/assets/useIsMobile-Ct8OC0lY.js","/assets/useOpenParam-G0eOssHD.js","/assets/useStatusBands-BYwbB2Ie.js","/assets/useUrlScope-DFlS_Tns.js","/assets/user-Dfwui3Qc.js","/assets/user-cog-DQZfd8ds.js","/assets/user-minus-Dpc1I_7z.js","/assets/users-DpOfjGl5.js","/assets/vfx-zkeeN62w.js","/assets/video-VIcqulcg.js","/assets/wallet-CjnSJ7Hk.js","/assets/warehouse-DRcsYupC.js","/assets/workflow-BR3a1NZq.js","/assets/x-DyUlByeJ.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
