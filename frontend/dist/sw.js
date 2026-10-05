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

const BUILD = "2026-10-05T04:56:42.969Z";
const PRECACHE = ["/","/assets/AdminPanel-BGL3KH1p.js","/assets/AnalysisBoard-Bbki5541.js","/assets/Arc-Bff4cav-.js","/assets/ArcLegacy-O9ELdp8v.js","/assets/BrigadirProfile-CQGj9ke7.js","/assets/BroadcastReceivers-DQhkYaAL.js","/assets/BroadcastRecord-BPObIjrH.js","/assets/CatLockNotice-DkWouumT.js","/assets/CategoryLegendModal-CZ6tAiPX.js","/assets/CellConcerns-CyKL7ajo.js","/assets/CellDetails-QfSHsf7D.js","/assets/CellFormModal-KuW8F1pj.js","/assets/CellIdent-S6NNP9mz.js","/assets/CellLink-Bnr7Beal.js","/assets/Cells-DnThpnnr.js","/assets/ColumnFilter-B5ua-SwO.js","/assets/ColumnsPicker-B-djEvhy.js","/assets/CommentsModal-CSMTyzD7.js","/assets/ComparisonTable-D7J-kcq4.js","/assets/Concerns-DOtbmLfB.js","/assets/ConfirmDialog-BE8H2s-5.js","/assets/Daily-BszbD-qS.js","/assets/DataTable-mh4b43AG.js","/assets/DateRangePicker-7Gs5mb0n.js","/assets/DayReportView-8WEmIDHc.js","/assets/DayStepper-CuEdHIeD.js","/assets/DifferenceBreakdown-DfztnH4R.js","/assets/Downtime-6gihyQSO.js","/assets/Education-Dyakn4qe.js","/assets/EducationLesson-CWiW6I4n.js","/assets/EmptyState-WhPbnjdc.js","/assets/Exam-D8Lsh2en.js","/assets/FactorySelect-BAxxYbXb.js","/assets/Gamification-DziBuVeC.js","/assets/GroupBadge-DjhOr8RZ.js","/assets/HeatmapChart-9lz8YwYj.js","/assets/IdleCell-B6n89JmX.js","/assets/KPICard-CbZrXx73.js","/assets/Kaizen-B2ojurBH.js","/assets/Kelish-C2ygfXLK.js","/assets/KpiDeltaCard-_5ZcWs80.js","/assets/LangTextInput-GKzP_wMw.js","/assets/Layout-zkLz56Va.js","/assets/LeaderAppeal-BakWvhIP.js","/assets/LeaderDayReport-DgKNqaqO.js","/assets/LeaderUnitReport-nukrNYr1.js","/assets/Leaderboard-Dii7PYYJ.js","/assets/Leaders-B9OGmOAx.js","/assets/Lightbox-DYxyNw21.js","/assets/LiveOverview-CKy2LvgU.js","/assets/Login-CtHb03zQ.js","/assets/NotFound-CL8ffnYc.js","/assets/Notifications-_d_bKuwk.js","/assets/Overview-DjGmP1VI.js","/assets/Pagination-BcZ1BNNy.js","/assets/PerenaladkaFactTable-C9tuItDG.js","/assets/PersonCard-CYiqGt3s.js","/assets/PlanFulfillment-C3kipBJF.js","/assets/Production-C-D0VQDr.js","/assets/Profile-CKpMk8_L.js","/assets/ProofCamera-C71xzQDx.js","/assets/ProofPhoto-DqdpErDv.js","/assets/Quality-BDu6EGPw.js","/assets/RawRows-DzgsYoB4.js","/assets/RequestStateChip-CKsOItKU.js","/assets/RichTextEditor-Cpw1qcbf.js","/assets/SaveState-D4KlNgAG.js","/assets/SearchInput-D5kJ6nYF.js","/assets/SeasonalityHeatmap-C5eDaeqv.js","/assets/SegmentedToggle-DFWjsj9V.js","/assets/SetupTimes-BSM765vV.js","/assets/ShiftDaily-Cizyx8cq.js","/assets/Staff-B-PaXx4S.js","/assets/StaffLive-CzmKbI23.js","/assets/StatusBadge-DqEeG2Wo.js","/assets/TargetGoal-Bcl1U3Kj.js","/assets/Targets-CFPPcFWK.js","/assets/Tasks-CZ_eH7Ia.js","/assets/TimeWheelPicker-C-OCaXeh.js","/assets/Toast-DaU4BxEC.js","/assets/Tooltip-DEeAeKDs.js","/assets/TrendChart-w76uKx4P.js","/assets/TripleSpeedometer-C2vhQruY.js","/assets/Trudoyomkost-D_b5m1nN.js","/assets/Turnover--9nLKNPT.js","/assets/UploadDropzone-l9zkQ4eE.js","/assets/UsersActivity-BT7uRhrd.js","/assets/VerdictBlock-C8APVTNn.js","/assets/VfxApiMap-DhpJUxzK.js","/assets/VfxDictionaries-CT5mnIka.js","/assets/VfxEmployees-CIbmxqo9.js","/assets/VfxHrMoves-CMQlQeDH.js","/assets/VfxJobs-xRO9wpl-.js","/assets/VfxPhoto-BtSrv4EV.js","/assets/VfxShifts-BROY4Xhp.js","/assets/VfxState-33MX-C2n.js","/assets/VfxTimebooks-DndCx3UL.js","/assets/VfxTimesheet-BwavYUEf.js","/assets/WatchProgress-_vRvtB2q.js","/assets/WebLogin-Do4FR1j7.js","/assets/WorkerConcerns-8Q5ggWLa.js","/assets/Workers-DNqrxlj1.js","/assets/Zagruzka-Ds_QE33-.js","/assets/ZagruzkaCell-B83mdqh8.js","/assets/api-BrsFIaKK.js","/assets/archive-Htm0l6J2.js","/assets/archive-restore-Dw0v8a4M.js","/assets/arrow-down-BvxADFmr.js","/assets/arrow-left-e4YcR1DA.js","/assets/arrow-up-Dn_aV3Al.js","/assets/arrow-up-narrow-wide-DFWZrgiq.js","/assets/arrow-up-right-xRJ6K3RX.js","/assets/award-Cqv6W6ma.js","/assets/ban-DoFd640A.js","/assets/book-open-9Y2I6fsc.js","/assets/bot-BpPDvMCz.js","/assets/boxes-DO17LzkE.js","/assets/braces-B52XkmVT.js","/assets/brigadirFilters-VrV3qlL3.js","/assets/broadcastTree-CKjZoTgO.js","/assets/building-2-CupwMCo7.js","/assets/calculator-C-CyueRv.js","/assets/calendar-CGeIPtsc.js","/assets/calendar-days-BzC1xzLx.js","/assets/camera-C-U2wUyU.js","/assets/categories-D0TBOYGg.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cxf02pLS.js","/assets/chart-line-9ZrilR-Q.js","/assets/chart-pie-6dRssTLb.js","/assets/chartRange-IdaNhywq.js","/assets/check-check-BICnwUM2.js","/assets/chevron-left-DybCLEqz.js","/assets/chevrons-up-down-BFOLVOWL.js","/assets/circle-alert-DyNwW4Vr.js","/assets/circle-check-big-BXePR9cq.js","/assets/circle-dashed-BbvvDltX.js","/assets/circle-minus-BVGC835p.js","/assets/circle-question-mark-DrIDDUvi.js","/assets/circle-slash-DAxnY4L1.js","/assets/circle-tQqYJxzG.js","/assets/circle-user-round-Btst34Iz.js","/assets/clock-3-CjQMtwGX.js","/assets/cloud-off-B09Na6YA.js","/assets/cloud-upload-VVPWid26.js","/assets/compass-eiijn-fg.js","/assets/concernCategories-CXLBU1aX.js","/assets/copy-DmXynqZ5.js","/assets/corner-down-right-AfvGZ9qJ.js","/assets/createLucideIcon-DML8tBvD.js","/assets/es--QoRTWNP.js","/assets/exportXlsx-g4LGOQhI.js","/assets/external-link-4YCWc7rL.js","/assets/file-clock-BT88CM_O.js","/assets/file-exclamation-point-D1IjSrv5.js","/assets/file-spreadsheet-DcZxlwie.js","/assets/file-text-C06noaLy.js","/assets/flag-D_zssz0e.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-CT6Oj6oh.js","/assets/hash-BOuPArGw.js","/assets/history-BvcAlY-i.js","/assets/hourglass-BPVN7gO_.js","/assets/image-DOZ345ok.js","/assets/image-off-z5O1DJ0Z.js","/assets/inbox-BZlKEJrv.js","/assets/index-CT8TK1c-.css","/assets/index-DEITpnH1.js","/assets/key-round-DuD7mZyF.js","/assets/keyboard-DSSrA-Rs.js","/assets/languages-8ptBdhDO.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CuXKyu_h.js","/assets/lightbulb-qNTKfosp.js","/assets/link-2-9jUf8qRf.js","/assets/link-2-off-C8aHnOhA.js","/assets/list-ordered-6YP1qQi2.js","/assets/list-tree-DFUzHVMQ.js","/assets/lock-open-XTvw2BZj.js","/assets/log-in-J3Sy4i4C.js","/assets/maximize-2-XWDgvTNC.js","/assets/message-square-Cx5MCFMw.js","/assets/minimize-2-Br9vNH3G.js","/assets/package-check-AiEZczie.js","/assets/paperclip-BddEj1dU.js","/assets/pencil-MEnU4imu.js","/assets/percent-BeCxPY3z.js","/assets/pin-Cekrxx2v.js","/assets/pin-off-CRTLkQs1.js","/assets/play-cjZSOXcI.js","/assets/plug-zap-BI_s7AeT.js","/assets/presentation-CBz6OqTQ.js","/assets/prop-types-DnwHYQ_B.js","/assets/radio-B_jR-pax.js","/assets/react-apexcharts.esm-CHUxaUUy.js","/assets/registers-B-At9sep.js","/assets/repeat-DSGM5asv.js","/assets/rotate-ccw-bby8t-Xf.js","/assets/rotate-cw-Cc8J5oxc.js","/assets/save-DnyvL7Ly.js","/assets/scopeLinks-1BzO16mF.js","/assets/scroll-text-CE7zBKbV.js","/assets/search-x-DXDED0po.js","/assets/segments-klUysmo9.js","/assets/send-C-LNeO42.js","/assets/settings-2-BAQ8Q3v8.js","/assets/shield-Bu9TyTho.js","/assets/shield-alert-B-GbjN6e.js","/assets/shield-check-ho4nK21l.js","/assets/shield-question-mark-DFABlmzp.js","/assets/siren-B76lF2IN.js","/assets/snowflake-DWwRDnPm.js","/assets/split-BXYwuE1b.js","/assets/square-CAf_GaXO.js","/assets/square-check-big-DZu2XLh1.js","/assets/star-B7r_IpXX.js","/assets/statusBands-CbsmIRbO.js","/assets/store-8ftNAVMs.js","/assets/table-2-Cu9lOI6j.js","/assets/table-properties-DqnhCGo0.js","/assets/tag-vJbSaObW.js","/assets/timer-off-DxbYsRSp.js","/assets/trending-down-BB7mWjgg.js","/assets/trending-up-Nlnc96Kq.js","/assets/undo-2-BBy3Kyqw.js","/assets/useChartTheme-CXZ0Dg8_.js","/assets/useElementWidth-DvS2jpfX.js","/assets/useIsMobile-Db21k2RE.js","/assets/useOpenParam-CXqtiJsh.js","/assets/useStatusBands-BiKkTylT.js","/assets/useUrlScope-DoQahZL_.js","/assets/user-CBoCza2W.js","/assets/user-cog-Z39t46_A.js","/assets/users-CP8nVSQU.js","/assets/vfx-BE2BOZd6.js","/assets/video-BvIUhg0O.js","/assets/wallet-BuUw1FUj.js","/assets/warehouse-kS-mWVE2.js","/assets/x-DIMGYa2c.js","/assets/zap-CJKdO-IK.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
