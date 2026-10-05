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

const BUILD = "2026-10-05T19:16:26.438Z";
const PRECACHE = ["/","/assets/AdminPanel-BQjNredO.js","/assets/AnalysisBoard-Dq9ZMhr4.js","/assets/Arc-D-upl3xH.js","/assets/Assistant-B5hzq3JI.js","/assets/BrigadirProfile-sFfEQA5N.js","/assets/BroadcastReceivers-BLpFceSD.js","/assets/BroadcastRecord-BH8XCBqy.js","/assets/Button-1OFkrrV5.js","/assets/CatLockNotice-BTb1UUfM.js","/assets/CategoryLegendModal-CnRvfn7w.js","/assets/CellConcerns-C6_UIYov.js","/assets/CellDetails-CsKwi8CO.js","/assets/CellFormModal-FaolCFmk.js","/assets/CellIdent-B6MYtnhv.js","/assets/CellLink-CQZNRUoO.js","/assets/Cells-o32uGxUs.js","/assets/ColumnFilter-sSLApi6J.js","/assets/ColumnsPicker-nO8pKrxR.js","/assets/CommentsModal-BXsvm1_a.js","/assets/ComparisonTable-BNex2Tj2.js","/assets/Concerns-BB6aeDzT.js","/assets/Daily--K-QU8_u.js","/assets/DataTable-BIRIeqhZ.js","/assets/DateRangePicker-DroRIwOt.js","/assets/DayReportView-DRIwPq10.js","/assets/DayStepper-BD_EUBvk.js","/assets/DifferenceBreakdown-BQEbG9r7.js","/assets/Downtime-B_oUMVw-.js","/assets/Education-DTiiMktg.js","/assets/EducationLesson-BbEEE70r.js","/assets/EmptyState-j_c-TmeE.js","/assets/Exam-BUT6Ifs5.js","/assets/FactorySelect-Bh2ULJ2v.js","/assets/Gamification-D6SEPKvX.js","/assets/GroupBadge-FZ5JdneN.js","/assets/HeatmapChart-jQOwng9I.js","/assets/IdleCell-CCavACH2.js","/assets/KPICard-qgs9MpC2.js","/assets/Kaizen-CwoUNMh7.js","/assets/Kelish-DzbPd6PK.js","/assets/KpiDeltaCard-R8Z75pCG.js","/assets/LangTextInput-DteMrNlS.js","/assets/Layout-1nA1osN-.js","/assets/LeaderAppeal-XwQGkdao.js","/assets/LeaderDayReport-B7vwIkzw.js","/assets/LeaderUnitReport-DWSbHhB5.js","/assets/Leaderboard-BMZtlDjF.js","/assets/Leaders-vk4LDOCy.js","/assets/Lightbox-B4Lsm4O-.js","/assets/LiveOverview-DW6muAlO.js","/assets/Login-Chf0Vqm-.js","/assets/NotFound-Dp_LFkkO.js","/assets/Notifications-SsmTlqod.js","/assets/Overview-DBgnSzFn.js","/assets/Pagination-wmjpvT3T.js","/assets/PerenaladkaFactTable-BVdzl8Il.js","/assets/PersonCard-CUn8iNZF.js","/assets/PlanFulfillment-DWabO0PS.js","/assets/Production-Clt1F56r.js","/assets/Profile-CRo3xNFC.js","/assets/ProofCamera-BIJS8F9e.js","/assets/ProofPhoto-Bu9Gj1j6.js","/assets/Quality-DfjOZq_d.js","/assets/RawRows-C9RZ6XL9.js","/assets/RequestStateChip-ZgMvci2-.js","/assets/RichTextEditor-CthTIiVB.js","/assets/SaveState-CUDNMi6z.js","/assets/SearchInput-Bi4_QEEO.js","/assets/SeasonalityHeatmap-Bqrv_7GK.js","/assets/SegmentedToggle-aTrL46p4.js","/assets/SetupTimes-DtwbZDN6.js","/assets/ShiftDaily-BdZAg5Bz.js","/assets/Staff-BrJTDEDw.js","/assets/StaffLive-v9b5-FjH.js","/assets/StatusBadge-CK2QhjcI.js","/assets/TargetGoal-BBVijToN.js","/assets/Targets-BgMzbWpC.js","/assets/Tasks-Beg5UswG.js","/assets/TimeWheelPicker-CEd0yJcG.js","/assets/Toast-nHcN2JcB.js","/assets/Tooltip-B_UiJxmh.js","/assets/TrendChart-BOQ7v4WJ.js","/assets/TripleSpeedometer-BlUT6F5B.js","/assets/Trudoyomkost-eHFRlmo_.js","/assets/Turnover-DmiOJmg3.js","/assets/UploadDropzone-Df_7-CT-.js","/assets/UsersActivity-BxSI7uha.js","/assets/VerdictBlock-DrC3rkMZ.js","/assets/VfxApiMap-DT9FQNVi.js","/assets/VfxDictionaries-Bht9b-6a.js","/assets/VfxEmployees-CuDk7sjX.js","/assets/VfxHrMoves-9awiFVbF.js","/assets/VfxJobs-cGL_VjvL.js","/assets/VfxPhoto-CD5Ptd-K.js","/assets/VfxShifts-B0e_xd1q.js","/assets/VfxState-COBJu86b.js","/assets/VfxTimebooks-DuIok6YY.js","/assets/VfxTimesheet-DKeraIvk.js","/assets/WatchProgress-CUP83fy9.js","/assets/WebLogin-C2GSTSBS.js","/assets/WorkerConcerns-CKDTaux7.js","/assets/Workers-Dx_Ry7SW.js","/assets/Zagruzka-JOXQO9uo.js","/assets/ZagruzkaCell-DdlCKKSn.js","/assets/api-D62YfIcb.js","/assets/archive-1a2Fk7_Z.js","/assets/archive-restore-C3AlwhMZ.js","/assets/arrow-down-Dgep68ss.js","/assets/arrow-up-narrow-wide-DyUM3fqL.js","/assets/award-CUHiCcka.js","/assets/ban-CsDoUegy.js","/assets/boxes-Be7bkP3b.js","/assets/braces-B-8av9tz.js","/assets/brigadirFilters-BQEz0DIw.js","/assets/broadcastTree-BwiR-rPj.js","/assets/building-2-DjfJxqd9.js","/assets/calculator-D1q2Ek5e.js","/assets/calendar-B2A-V92I.js","/assets/calendar-days-DAevMEBx.js","/assets/camera-yvBidgbE.js","/assets/categories-C3IaG5J6.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B_kb_JfE.js","/assets/chart-line-_7FYIGbT.js","/assets/chart-pie-Dr6BpbBW.js","/assets/chartRange-CbyX_8_Q.js","/assets/check-check-BWd7Trpx.js","/assets/chevron-left-DZG67nlB.js","/assets/chevrons-up-down-WE2WlH9z.js","/assets/circle-D4QTK8ht.js","/assets/circle-alert-VuyRx1C-.js","/assets/circle-check-big-C7fY1dQM.js","/assets/circle-dashed-CPo73T1C.js","/assets/circle-minus-BJnYd1IR.js","/assets/circle-question-mark-BTzpXPQu.js","/assets/circle-slash-DgnMqUEJ.js","/assets/circle-user-round-Dq8NMVTi.js","/assets/clock-3-CgtWGOWX.js","/assets/cloud-off-CQ39MM2H.js","/assets/cloud-upload-BvNFAtNr.js","/assets/compass-Bw0c13IA.js","/assets/concernCategories-CTTWg2WI.js","/assets/copy-CDPlG5pe.js","/assets/corner-down-right-BDBDK8R3.js","/assets/createLucideIcon-DtLXJnoj.js","/assets/es-8Lvcuh6s.js","/assets/external-link-DB_6HRgX.js","/assets/file-clock-CuzSJvvt.js","/assets/file-exclamation-point-CPr40IYi.js","/assets/flag-q8XjaWk5.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BX2JRagA.js","/assets/hash-2DWnUsHr.js","/assets/hourglass-D3h0XCNW.js","/assets/image-D346Dis6.js","/assets/image-off-DUP7bCUB.js","/assets/inbox-syU1Z2Tg.js","/assets/index-B9kyoL5A.js","/assets/index-CLghnrO3.css","/assets/keyboard-BJxNGkJe.js","/assets/languages-TZekzxQ_.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DXZRTJhV.js","/assets/lightbulb-yYciHMqs.js","/assets/link-2-Di1Vhla-.js","/assets/link-2-off-DOHLtZcF.js","/assets/list-ordered-DdeBIb6o.js","/assets/list-tree-D0ENd77S.js","/assets/lock-open-DNcjZmQD.js","/assets/log-in-BLdMxwyQ.js","/assets/minimize-2-Euc0ELN_.js","/assets/package-check-Dwy5CKuY.js","/assets/pencil-Cp8CJbWz.js","/assets/percent-B4gcab9V.js","/assets/pin-eWvqu9-G.js","/assets/pin-off-O2AuBpvc.js","/assets/play-CxyxiaAh.js","/assets/plug-zap-Deevv-hT.js","/assets/prop-types-CcEBXpla.js","/assets/react-apexcharts.esm-DzeeVaSq.js","/assets/registers-BFItDnFB.js","/assets/repeat-D0cuU4Xb.js","/assets/rotate-cw-Y8TZU0aa.js","/assets/save-D9Yit6JJ.js","/assets/scopeLinks-BrNc1lDq.js","/assets/scroll-text-LX5993JS.js","/assets/search-x-FuCZAtpn.js","/assets/segments-PAkgqI4h.js","/assets/send-BZNZ4sqw.js","/assets/settings-2-Spllh2Cq.js","/assets/shield-BDbdFL2B.js","/assets/shield-alert-DFm4Omho.js","/assets/shield-question-mark-Bnl1PTe5.js","/assets/siren-CvNDYqxS.js","/assets/snowflake-C0vXEkmj.js","/assets/split-D1mpQLFw.js","/assets/square-check-big-C1pfLorw.js","/assets/star-BIfN8ksj.js","/assets/statusBands-DQD4h5BY.js","/assets/store-RY7Qet4c.js","/assets/table-2-C3OhPx19.js","/assets/table-properties-Btb0f4MK.js","/assets/tag-bqx4_Xam.js","/assets/timer-off-DopqH0kD.js","/assets/trending-down-UdR_12FO.js","/assets/trending-up-CYmb_Cl8.js","/assets/undo-2-p-SnWnKg.js","/assets/useChartTheme-BSLY5GaY.js","/assets/useElementWidth-tXPqVLrQ.js","/assets/useIsMobile-CTvYRoYJ.js","/assets/useOpenParam-CvsyIib4.js","/assets/useStatusBands-DAwiluhO.js","/assets/useUrlScope-B9FB82lW.js","/assets/user-DpLW7RTC.js","/assets/user-cog-DFtlddHm.js","/assets/users-BPrDE9mf.js","/assets/vfx-DL_5wlRr.js","/assets/video-CzH9HxD5.js","/assets/wallet-UhhZ5BBR.js","/assets/warehouse-0bVwjHE2.js","/assets/x-Kut7pH8E.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
