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

const BUILD = "2026-10-19T07:21:19.753Z";
const PRECACHE = ["/","/assets/AdminPanel-pr7TpGgo.js","/assets/AnalysisBoard-C29wGb0w.js","/assets/Arc-DRP8tg9S.js","/assets/Assistant-CZgg7Wgk.js","/assets/BrigadirProfile-COxcl_o-.js","/assets/BroadcastReceivers-Bs1-6Bwf.js","/assets/BroadcastRecord-Bfhp4_BZ.js","/assets/Button-BAFVjYMe.js","/assets/CatLockNotice-1OCR6Seg.js","/assets/CategoryLegendModal-BUWhQRvP.js","/assets/CellConcerns-UwzhBWWu.js","/assets/CellDetails-BSIGWlBu.js","/assets/CellFormModal-BZ3B8HSR.js","/assets/CellIdent-BSDxcASt.js","/assets/CellLink-C8SJePvO.js","/assets/Cells-Dh0D7Mzn.js","/assets/ColumnFilter-CGaPkQ95.js","/assets/ColumnsPicker-BZ2gtqhJ.js","/assets/CommentsModal-CEXnGfM_.js","/assets/ComparisonTable-BhAKXNlC.js","/assets/Concerns-C5widC7J.js","/assets/CountStepper-BvWv7BV1.js","/assets/Daily-Cy7eJsZN.js","/assets/DataTable-Dt8pJSXn.js","/assets/DateRangePicker-C_6vwa6w.js","/assets/DayReportView-DHheI6kc.js","/assets/DayStepper-CEyFRo5Y.js","/assets/DifferenceBreakdown-DVbdfVGt.js","/assets/Downtime-DrEkfZ6t.js","/assets/Education-BuSH0UbC.js","/assets/EducationLesson-D3SBVSq7.js","/assets/EmptyState-iWCLXt67.js","/assets/Exam-CPZrBQC6.js","/assets/FactorySelect-tIb8Srqn.js","/assets/Gamification-WcYrlit1.js","/assets/GroupBadge-DlGiJSGe.js","/assets/HeatmapChart-CAGbK8GY.js","/assets/IdleCell-VdBzKsRR.js","/assets/KPICard-Cki3I6XL.js","/assets/Kaizen-DIe0-JCc.js","/assets/Kelish-OboakmLt.js","/assets/KpiDeltaCard-B1e4vXfR.js","/assets/LangTextInput-C3ncl2YH.js","/assets/Layout-CkfLUisi.js","/assets/LeaderAppeal-DyomiiCb.js","/assets/LeaderDayReport-BcHSkVFA.js","/assets/LeaderUnitReport-R-b9DDPC.js","/assets/Leaderboard-CLdsbCER.js","/assets/Leaders-BbuqctCD.js","/assets/LeadersKpi-BscxSLAG.js","/assets/Lightbox-C6iYqgeW.js","/assets/LiveOverview-CugDbKJv.js","/assets/Login-Bl_b5_SR.js","/assets/NotFound-1kp36fRV.js","/assets/Notifications-Cmn6FCeW.js","/assets/Overview-BGLzrYTI.js","/assets/Pagination-Df5svJpx.js","/assets/PerenaladkaFactTable-BPZvDFuh.js","/assets/PersonCard-Bw7yx3Rj.js","/assets/PlanFulfillment-BSHThqo9.js","/assets/Production-4GSnSIDI.js","/assets/Profile-DT0MspXh.js","/assets/ProofCamera-BxdNuZZ_.js","/assets/ProofPhoto-DsYpyTaL.js","/assets/Quality-BhwiCj5t.js","/assets/RawRows-Djf54Ay1.js","/assets/RequestStateChip-BPNvMLYc.js","/assets/RichTextEditor-Cp6qKHSg.js","/assets/SaveState-Djj1w__C.js","/assets/SearchInput-s7Dwcz93.js","/assets/SeasonalityHeatmap-CbB-CYRF.js","/assets/SegmentedToggle-B4JwLIeP.js","/assets/SetupTimes-BWbTqraZ.js","/assets/ShiftDaily-BOMEyhC4.js","/assets/Staff-tXR4hrox.js","/assets/StaffListAtCheck-BQvA0UP3.js","/assets/StatusBadge-Bm06rRYr.js","/assets/TargetGoal-D3d2npLt.js","/assets/Targets-DGluxjR1.js","/assets/Tasks-BKasQCZa.js","/assets/TimeWheelPicker-CEfr5W2I.js","/assets/Toast-roCeftqQ.js","/assets/Tooltip-AS4xcXVm.js","/assets/TrendChart-cnn6J08X.js","/assets/TripleSpeedometer-BnFFiNmm.js","/assets/Trudoyomkost-CYxddqW7.js","/assets/UploadDropzone-C7Y-AYvz.js","/assets/UsersActivity-DDjM-daH.js","/assets/VerdictBlock-BrU7MFkR.js","/assets/VfxApiMap-BKt6u3lV.js","/assets/VfxDictionaries-f0NVp3qf.js","/assets/VfxEmployees-D-14X4n3.js","/assets/VfxHrMoves-DgwbLdF5.js","/assets/VfxJobs-p39hOONx.js","/assets/VfxPhoto-Cmm2SvyU.js","/assets/VfxShifts-C6f8nYiX.js","/assets/VfxState-6am3ERZf.js","/assets/VfxTimebooks-Co9klRPP.js","/assets/VfxTimesheet-e8qr4OjP.js","/assets/WatchProgress-BXVYcfEL.js","/assets/WebLogin-DCSJiUr-.js","/assets/Workers-BlxND9TN.js","/assets/Zagruzka-DzK86Vxf.js","/assets/ZagruzkaCell-Clr2NYqP.js","/assets/api-DA2dmXGt.js","/assets/archive-C6iyll_I.js","/assets/archive-restore-DYLY5voF.js","/assets/arrow-down-CqsQ4P8v.js","/assets/arrow-down-wide-narrow-D59hJHy8.js","/assets/arrow-up-narrow-wide-WN96cPwC.js","/assets/ban-BTAOf7Uk.js","/assets/boxes-B_aQiwN0.js","/assets/braces-ZK6Uyvhc.js","/assets/brigadirFilters-CwjJSgT3.js","/assets/broadcastTree-CnHwfhkc.js","/assets/building-2-CVVoqzcD.js","/assets/calculator-imbdrNog.js","/assets/calendar-Cug-2HNC.js","/assets/calendar-days-BwAVgK9a.js","/assets/camera-kba2b3gV.js","/assets/categories-8IyukrTU.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Cz0EZfAA.js","/assets/chart-line-BLfXQeKu.js","/assets/chart-pie-DMHR_Q1N.js","/assets/chartRange-DT6auxbl.js","/assets/check-check-DaRvBBFs.js","/assets/chevron-left-B7XhrMqV.js","/assets/chevrons-up-down-Dlbp8vEk.js","/assets/circle-BZYOwZO6.js","/assets/circle-alert-BQNKGTSG.js","/assets/circle-check-big-UJQWM6za.js","/assets/circle-dashed-C98hB8t8.js","/assets/circle-minus-Xd7vizF7.js","/assets/circle-question-mark-B7UYFlCj.js","/assets/circle-slash-BfsiLn42.js","/assets/circle-user-round-C151zyXs.js","/assets/cloud-off-DCIIWqty.js","/assets/cloud-upload-7Zekq_cZ.js","/assets/compass-BXPPfMvg.js","/assets/concernCategories-BiBxmIVD.js","/assets/corner-down-right-BBrGr2P4.js","/assets/createLucideIcon-6psxVsR6.js","/assets/es-uM1xb2A-.js","/assets/external-link-BIiudvXJ.js","/assets/file-clock-DKXI0jwA.js","/assets/file-exclamation-point-5t02H0o1.js","/assets/flag-CvkkAVzV.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Dcsof3rL.js","/assets/hash-DkI9qx0l.js","/assets/hourglass-CGPEnZCC.js","/assets/image-DwIQ0rcl.js","/assets/image-off-C7LsQZ2a.js","/assets/inbox-D206pb9F.js","/assets/index-BHjaUGqk.js","/assets/index-gBwusEVA.css","/assets/keyboard-t2IcsQjs.js","/assets/languages-DIz163Jz.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DMiDdvlF.js","/assets/lightbulb-B5tfhL6W.js","/assets/link-2-BcTkwfWd.js","/assets/link-2-off-CbZ_8K7y.js","/assets/list-ordered-CF8_iUQ4.js","/assets/list-tree-wqzHwfLu.js","/assets/lock-open-DDjVmd6i.js","/assets/log-in-CUH5E9A3.js","/assets/marks-DcbIJhSt.js","/assets/minimize-2-CFcYwPca.js","/assets/package-check-DpuGR2KL.js","/assets/pencil-CNVc14g4.js","/assets/percent-D-uSa0Yq.js","/assets/pin-CJnJd9GP.js","/assets/pin-off-CR3RLbJX.js","/assets/play-chuFf9U9.js","/assets/plug-zap-BEGgQykD.js","/assets/prop-types-BKsrkzNU.js","/assets/radio-gmollb1h.js","/assets/react-apexcharts.esm-Dw9RPN81.js","/assets/registers-vVqYkg06.js","/assets/repeat-DzSB_M8y.js","/assets/save-vo1HQhun.js","/assets/scopeLinks-BTLnV_gd.js","/assets/scroll-text-kG2WoWSM.js","/assets/search-x-B60veNxr.js","/assets/segments-CG-1KPNP.js","/assets/send-DTDj2iyQ.js","/assets/settings-2-BcDJ_KdB.js","/assets/shield-B73ybZaH.js","/assets/shield-alert-xEbiVQsi.js","/assets/shield-question-mark-Cl7XcFE7.js","/assets/siren-BM9lEl2v.js","/assets/snowflake-kFzAGalN.js","/assets/split-DEFAkXAy.js","/assets/square-check-big-BaPTROux.js","/assets/star-WtJNLguE.js","/assets/statusBands-QTtl1vwS.js","/assets/store-I5WbKJ7b.js","/assets/table-2-CM0uKkm3.js","/assets/table-properties-Cg-A9lg1.js","/assets/tag-BSFRE0-P.js","/assets/timer-off-BfxDatvA.js","/assets/trending-down-ByWTEpWx.js","/assets/trending-up-Bi3CSvpz.js","/assets/undo-2-C9iT0qqD.js","/assets/useChartTheme-B5OODBpD.js","/assets/useElementWidth-Dr7My46R.js","/assets/useIsMobile-Bm0_kgJr.js","/assets/useOpenParam-BRfWf_Qk.js","/assets/useStatusBands-DZnJy0Zn.js","/assets/useUrlScope-BWjnlyKb.js","/assets/user-BRsFMH1j.js","/assets/user-cog-B_JQmd6l.js","/assets/user-minus-DXdN7nHN.js","/assets/users-gBeIXoHW.js","/assets/vfx-vGTupDee.js","/assets/video-Bun8q9b9.js","/assets/wallet-BSsjzasy.js","/assets/warehouse-BxoVxfYF.js","/assets/workflow-DBC_YZWc.js","/assets/x-CBVWXIQp.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
