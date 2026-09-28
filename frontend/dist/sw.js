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

const BUILD = "2026-09-28T14:32:42.307Z";
const PRECACHE = ["/","/assets/AdminPanel-D7i1eJbf.js","/assets/AnalysisBoard-DbQifSMm.js","/assets/Arc-BNvr4hdP.js","/assets/ArcLegacy-BOHKVCns.js","/assets/AttendanceModal-B2i826ZW.js","/assets/BrigadirProfile-B7PRdTQT.js","/assets/BroadcastReceivers-C17Gv9iy.js","/assets/BroadcastRecord-CnznQeYX.js","/assets/CatLockNotice-J66fbJkR.js","/assets/CategoryLegendModal-w5QppusQ.js","/assets/CellConcerns-CTXCwhfv.js","/assets/CellDetails-keRuPT1g.js","/assets/CellFormModal-CtQYWm3f.js","/assets/CellLink-Dlo2cbpW.js","/assets/Cells-wK1RVjgF.js","/assets/ColumnFilter-CUL_jt-Y.js","/assets/ColumnsPicker-CPozvNfN.js","/assets/CommentsModal-CytIrDo1.js","/assets/ComparisonTable-KKI9NIR2.js","/assets/Concerns-Mlp2zS3J.js","/assets/ConfirmDialog-DLvIlHDF.js","/assets/Daily-BLewNJfN.js","/assets/DataTable-Ch_pArLn.js","/assets/DateRangePicker-Ysne2yAN.js","/assets/DayReportView-DBOXvIY0.js","/assets/DayStepper-DLnJT2Hj.js","/assets/DifferenceBreakdown-BgdOb2q3.js","/assets/Downtime-BRRS9pBC.js","/assets/Education-BNEhRXfy.js","/assets/EducationLesson-hJV3fiK-.js","/assets/EmptyState-CVAhKfHL.js","/assets/Exam-Cqv1FxOv.js","/assets/FactorySelect-998zS7lx.js","/assets/Gamification-DB1WZxCA.js","/assets/GroupBadge-KwQ8pA-p.js","/assets/HeatmapChart-DkLj9Njc.js","/assets/IdleCell-Dm4uDozs.js","/assets/KPICard-DDu_S_HT.js","/assets/Kaizen-CqKyoLz1.js","/assets/KpiDeltaCard-D9rjMVt5.js","/assets/LangTextInput-BUifaYom.js","/assets/Layout-DTAycE-y.js","/assets/LeaderAppeal-DiQflJqp.js","/assets/LeaderDayReport-1TXo0qap.js","/assets/LeaderUnitReport-DgLvbMt9.js","/assets/Leaderboard-DYjB9vXc.js","/assets/Leaders-BCM27Y_L.js","/assets/Lightbox-CpqwE11d.js","/assets/LiveOverview-CI8M9qUV.js","/assets/Login-CsG1Z0Og.js","/assets/NotFound-vgQoNhaE.js","/assets/Overview-Br2a4XGQ.js","/assets/Pagination-CRs2XanB.js","/assets/PerenaladkaFactTable-D7YcNh0K.js","/assets/PlanFulfillment-D-71elSb.js","/assets/Production-MEOykWun.js","/assets/Profile-Kfyy_5Fm.js","/assets/ProofCamera-qQkOq3Wd.js","/assets/ProofPhoto-ClfTbxff.js","/assets/Quality-wXoPrP4C.js","/assets/RequestStateChip-B7Gv0OsT.js","/assets/RichTextEditor-BgPzV02Z.js","/assets/SaveState-BXIzNEP9.js","/assets/SearchInput-Duc4C8oN.js","/assets/SeasonalityHeatmap-BJbjHClZ.js","/assets/SegmentedToggle-0cAEkgHh.js","/assets/SetupTimes-DnXZ0iQg.js","/assets/ShiftDaily-CGfJXDTE.js","/assets/Staff-CCaz6FK4.js","/assets/StatusBadge-BU72VDG8.js","/assets/TargetGoal-DFv4-0Oo.js","/assets/Targets-Dw2s3jYA.js","/assets/Tasks-BmDhRc25.js","/assets/TimeWheelPicker-BcjvKx8M.js","/assets/Tooltip-BeKfwtBJ.js","/assets/TrendChart-feVM-_W_.js","/assets/TripleSpeedometer-C0Hq25sf.js","/assets/Trudoyomkost-BFk-aHdc.js","/assets/UploadDropzone-C5-BGoPE.js","/assets/UsersActivity-D6WbNybo.js","/assets/VerdictBlock-B_pwxSCo.js","/assets/WatchProgress-CojoXJlM.js","/assets/WebLogin-B_uYqaw3.js","/assets/WorkerConcerns-BxPWvswZ.js","/assets/Workers-DsQGh281.js","/assets/Zagruzka-Crc0fKuH.js","/assets/ZagruzkaCell-DhUgfnKR.js","/assets/api-DvJqqqNZ.js","/assets/archive-DEKrkd9F.js","/assets/archive-restore-B7aEW973.js","/assets/arrow-down-BlKzjEiw.js","/assets/arrow-left-VRDYO4Nx.js","/assets/arrow-left-right-CgzUBDum.js","/assets/arrow-up-F8vm6Qic.js","/assets/arrow-up-right-OFgIBP1_.js","/assets/award-CafG2zH7.js","/assets/ban-DBNIvgEp.js","/assets/bot-DiCYLU2-.js","/assets/boxes-jyINa-Ej.js","/assets/brigadirFilters-1gzCuvFj.js","/assets/broadcastTree-JEWTqcY7.js","/assets/building-2-DMHNB_B3.js","/assets/calendar-clock-BgkjJGdk.js","/assets/calendar-days-BM-DBNl8.js","/assets/calendar-jr5UR2q_.js","/assets/calendar-range-Cii-9x25.js","/assets/camera-CMDJnnx2.js","/assets/categories-D_D71EJv.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C-exVPRM.js","/assets/chart-line-BvW9bgZ9.js","/assets/chart-pie-DWafOcIK.js","/assets/chartRange-CBM2rAgM.js","/assets/chevron-left-CZw5ll1V.js","/assets/chevrons-up-down-DcSEh4Fi.js","/assets/circle-D30dnqJC.js","/assets/circle-check-big-79s0q0FJ.js","/assets/circle-dot-DCFg3gJu.js","/assets/circle-minus-C7v_DBPi.js","/assets/circle-slash-BqwfGIAf.js","/assets/circle-user-round-DCDYD2GN.js","/assets/cloud-off-Cp9Qo_n-.js","/assets/cloud-upload-BM5R77uq.js","/assets/compass-DZN2pLd_.js","/assets/concernCategories--BAb18PU.js","/assets/copy-BHc45otH.js","/assets/corner-down-right-eIqBn5mG.js","/assets/createLucideIcon-BxDGSQhu.js","/assets/es-DI2lPSPT.js","/assets/exportXlsx-ftLlAhB8.js","/assets/external-link-BRxpZuNw.js","/assets/file-clock-fUE4A7T3.js","/assets/file-exclamation-point-B7aWPafY.js","/assets/file-spreadsheet-qjEYAVnV.js","/assets/file-text-CDnoaBrn.js","/assets/flag-MwDBZu2c.js","/assets/flame-CjUwSrcc.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D5-RzQme.js","/assets/hash-UBIjrw5x.js","/assets/history-CGT4AlM2.js","/assets/hourglass-CuAMRXZq.js","/assets/image-DIs3jhIb.js","/assets/image-off-B0TRdmn2.js","/assets/index-BTLWv0-O.js","/assets/index-CVaWV_xD.css","/assets/key-round-D2d1cnfE.js","/assets/keyboard-CtacchTL.js","/assets/languages-CxVCv4EK.js","/assets/layers-FdkspYY0.js","/assets/lightbulb-D19rmh-u.js","/assets/link-2-CxMxF54N.js","/assets/list-checks-WhPSaeO6.js","/assets/list-ordered-BmfoMQ4s.js","/assets/list-tree-x802yHf9.js","/assets/lock-open-izfFPhDb.js","/assets/log-in-0x4X5qD3.js","/assets/message-square-20m5_wOx.js","/assets/minimize-2-CAMz9XfG.js","/assets/package-check-C8RFFk3y.js","/assets/paperclip-Cm883JP7.js","/assets/pencil-CdH4K7m7.js","/assets/percent-CVxakRn7.js","/assets/personName-B4KId4zS.js","/assets/pin-DvPCO0FH.js","/assets/pin-off-BO8ZQHwl.js","/assets/play-CGVd1jS9.js","/assets/presentation-tKreCgqT.js","/assets/prop-types-BmcQmS5L.js","/assets/radio-C4ylT1RP.js","/assets/react-apexcharts.esm-BTut2PY3.js","/assets/repeat-7Qd7eHsu.js","/assets/rotate-ccw-BO69lbfQ.js","/assets/rotate-cw-BPLeda3G.js","/assets/save-DNKrF8r9.js","/assets/scale-6CMzg0_3.js","/assets/scroll-text-D5EGpI5S.js","/assets/search-x-C_xdCVcQ.js","/assets/segments-DiMD7eX0.js","/assets/send-YvdLceXV.js","/assets/settings-2-1uuAPgNU.js","/assets/shield-B6py0GFu.js","/assets/shield-alert-Ckslgcue.js","/assets/shield-check-BHbtScXI.js","/assets/shield-question-mark-D5hXKOZx.js","/assets/siren-CQnfKf7Q.js","/assets/smartphone-BbEguCW_.js","/assets/snowflake-Cvp6a0We.js","/assets/square-Bicdrk2_.js","/assets/square-check-big-N31IcGX2.js","/assets/star-CS7l1wTQ.js","/assets/statusBands-FacMU0ny.js","/assets/store-DT34PUQA.js","/assets/table-2-ClBCbnUf.js","/assets/tag-CWX_HQki.js","/assets/timer-off-Co3VFlWu.js","/assets/trending-down-D1728rYA.js","/assets/trending-up-DOEPzB6x.js","/assets/undo-2-CF7ftZKg.js","/assets/useChartTheme-CENCc6av.js","/assets/useElementWidth-ZdTZNbSv.js","/assets/useIsMobile-6CwWBcZW.js","/assets/useMutation-CEGtb4Fj.js","/assets/useStatusBands-yA5BkuRp.js","/assets/user-BeW8sMgK.js","/assets/user-check-DTlmAlRD.js","/assets/user-cog-CSozEgqO.js","/assets/user-minus--6AJ0jB2.js","/assets/users-BKqkGZSU.js","/assets/video-DvTvlBrt.js","/assets/wallet-BmR9QLTA.js","/assets/warehouse-CcMYXebe.js","/assets/zap-C792xfQA.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
