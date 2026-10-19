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

const BUILD = "2026-10-19T12:34:14.381Z";
const PRECACHE = ["/","/assets/AdminPanel-Df3hwAkA.js","/assets/AnalysisBoard-Ce3WvUmb.js","/assets/Arc-DjKrHTPv.js","/assets/Assistant-B-JySjaC.js","/assets/BrigadirProfile-DySY3z4a.js","/assets/BroadcastReceivers-CwprUeXd.js","/assets/BroadcastRecord-DWGt8AQf.js","/assets/Button-DOH5HutF.js","/assets/CatLockNotice-C1N9LYZG.js","/assets/CategoryLegendModal-Cet-rht1.js","/assets/CellConcerns-TRVCWCeX.js","/assets/CellDetails-BlyyxDBS.js","/assets/CellFormModal-9XY3Bywk.js","/assets/CellIdent-Duwn05eX.js","/assets/CellLink-DbUPyOtt.js","/assets/Cells-O2LYruut.js","/assets/ColumnFilter-BDhO_kVJ.js","/assets/ColumnsPicker-DOA-LZDz.js","/assets/CommentsModal-DgRKUj7z.js","/assets/ComparisonTable-BcwqQSH4.js","/assets/Concerns-DgvC5ApO.js","/assets/CountStepper-CQ_vmHjS.js","/assets/Daily-JXHL68wX.js","/assets/DataTable-CEs03uYk.js","/assets/DateRangePicker-B4suL70J.js","/assets/DayReportView-DL80iiYy.js","/assets/DayStepper-MC-mvpI6.js","/assets/DifferenceBreakdown-Cg8-rgOa.js","/assets/Downtime-aQ5qIQge.js","/assets/Education-iLGFKcYw.js","/assets/EducationLesson-79-KGF1f.js","/assets/EmptyState-1qlEYLEs.js","/assets/Exam-Bv5EMer4.js","/assets/FactorySelect-ChseROD_.js","/assets/Gamification-BAqsjfF9.js","/assets/GroupBadge-CTyQ_r58.js","/assets/HeatmapChart-BpL-plNS.js","/assets/IdleCell-Bq11b_y6.js","/assets/KPICard-B60SlUa6.js","/assets/Kaizen-DHSFVKt8.js","/assets/Kelish-BO5llw60.js","/assets/KpiDeltaCard-C5pTorjs.js","/assets/LangTextInput-D92l3S-i.js","/assets/Layout-BA-88RVO.js","/assets/LeaderAppeal-BJ0Rru7G.js","/assets/LeaderDayReport-79hkraBj.js","/assets/LeaderUnitReport-Dwbk7W5X.js","/assets/Leaderboard-mH1Xm57I.js","/assets/Leaders-BzyU-5bm.js","/assets/LeadersKpi-BoQsmpKC.js","/assets/Lightbox-Bl6ha1F9.js","/assets/LiveOverview-DG6IVdta.js","/assets/Login-OUNyjgAk.js","/assets/NotFound-Cf2EWR0P.js","/assets/Notifications-4dKD9Hof.js","/assets/Overview-DiG6FNkM.js","/assets/Pagination-Dy14VTuk.js","/assets/PerenaladkaFactTable-JBY1qB8n.js","/assets/PersonCard-CZdnOorq.js","/assets/PlanFulfillment-BD7s_I3k.js","/assets/Production-qbjkQfsN.js","/assets/Profile-BYVJ7KpF.js","/assets/ProofCamera-C-RI30BU.js","/assets/ProofPhoto-DetXlSbu.js","/assets/Quality-IBBMyKNy.js","/assets/RawRows-B08RqCP_.js","/assets/RequestStateChip-yURr5-qw.js","/assets/RichTextEditor-DA7B-SC6.js","/assets/SaveState-CRZR0UpE.js","/assets/SearchInput-DeSNrYbB.js","/assets/SeasonalityHeatmap-C7fjyz4u.js","/assets/SegmentedToggle-BENn8RW9.js","/assets/SetupTimes-C21yTS4s.js","/assets/ShiftDaily-LLMvrzVp.js","/assets/Staff-BKXRDCS0.js","/assets/StaffListAtCheck-Cz4H_Nad.js","/assets/StatusBadge-BsErj-ov.js","/assets/TargetGoal-DUS0x-oZ.js","/assets/Targets-2CI3w8Km.js","/assets/Tasks-wL2gsEDz.js","/assets/TimeWheelPicker-BmmqcWf7.js","/assets/Toast-C8RrZO7H.js","/assets/Tooltip-Dqn8QgNl.js","/assets/TrendChart-BLlLi20f.js","/assets/TripleSpeedometer-BV6MkDU8.js","/assets/Trudoyomkost-Z-cv1GP6.js","/assets/UploadDropzone-CkRKRBm7.js","/assets/UsersActivity-CkpH4tsC.js","/assets/VerdictBlock-h4uDHvAL.js","/assets/VfxApiMap-voXvg5vw.js","/assets/VfxDictionaries-CFJeJ-W9.js","/assets/VfxEmployees-DtiDrXgK.js","/assets/VfxHrMoves-DAuicH_S.js","/assets/VfxJobs-Cbmcv62e.js","/assets/VfxPhoto-d1xGPdY1.js","/assets/VfxShifts-7Hxu0BS3.js","/assets/VfxState-BnbpqS9N.js","/assets/VfxTimebooks-k8ZuglM7.js","/assets/VfxTimesheet-DDS1PrjD.js","/assets/WatchProgress-CYRppCv5.js","/assets/WebLogin-NOEwhmQi.js","/assets/Workers-B2cJskNO.js","/assets/Zagruzka-CoogrtgH.js","/assets/ZagruzkaCell-BT7rt84D.js","/assets/api-BL7uh08y.js","/assets/archive-DTw8VZAG.js","/assets/archive-restore-CjYVZCtS.js","/assets/arrow-down-Clb3Obxn.js","/assets/arrow-down-right-BBZ590hV.js","/assets/arrow-down-wide-narrow-BAvSDQ0a.js","/assets/arrow-up-narrow-wide-CC9xd1kL.js","/assets/ban-BI0tAfkb.js","/assets/boxes-CYwEwb-s.js","/assets/braces-IFrvWrgK.js","/assets/brigadirFilters-YcwvKnxn.js","/assets/broadcastTree-BN3oS2GP.js","/assets/building-2-C5Ebd7iU.js","/assets/calculator-CKqttf1a.js","/assets/calendar-55zsSQj6.js","/assets/calendar-days-BDNXDJfC.js","/assets/camera-BvvqDFit.js","/assets/categories-DiWVe6Xf.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-B3E6tUig.js","/assets/chart-line-D9osmjeP.js","/assets/chart-pie-DjsfJfn_.js","/assets/chartRange-SaX-o5Ye.js","/assets/check-check-fNg0yf0f.js","/assets/chevron-left-D_sab0E_.js","/assets/chevrons-up-down-9CK7kcnZ.js","/assets/circle-DYn8iK9h.js","/assets/circle-alert-he-fnUdg.js","/assets/circle-check-big-DpvXLBrY.js","/assets/circle-dashed-ChwKindV.js","/assets/circle-minus-BrtQEwGn.js","/assets/circle-question-mark-k82ORKmg.js","/assets/circle-slash-Bohpeohg.js","/assets/circle-user-round-BdxA1yP5.js","/assets/cloud-off-Cc_71FyZ.js","/assets/cloud-upload-DyIeEuYl.js","/assets/compass-KxOrPxCW.js","/assets/concernCategories-DB3Igw7K.js","/assets/corner-down-right-CT6WjZ6j.js","/assets/createLucideIcon-BxXIqRMu.js","/assets/es-CoO6oKfY.js","/assets/external-link-DENXdLfd.js","/assets/file-clock-BvK2mKKm.js","/assets/file-exclamation-point-CUgVR7GU.js","/assets/flag-C9mmakV-.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C14iQtSs.js","/assets/hash-CSpO5cg2.js","/assets/hourglass-WNI417rB.js","/assets/image-Cb2RkfOP.js","/assets/image-off-CBFz3l3T.js","/assets/inbox-rFCjNIuZ.js","/assets/index-CCSAGVA1.js","/assets/index-DemTQruw.css","/assets/keyboard-XlKc6IDK.js","/assets/languages-CPJ-KAih.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BFjxHY-3.js","/assets/lightbulb-DD_1PykT.js","/assets/link-2-DuobmLtQ.js","/assets/link-2-off-CLV2VsY5.js","/assets/list-ordered-CyF7294C.js","/assets/list-tree-B9yFK7bg.js","/assets/lock-open-DvCQlI0k.js","/assets/log-in-D8fVokz4.js","/assets/marks-DJML2aal.js","/assets/minimize-2-BzfDZ3-8.js","/assets/package-check-9pwKeu4F.js","/assets/pencil-CdrH1b-o.js","/assets/percent-BAx5oUtz.js","/assets/pin-BxFyCCF2.js","/assets/pin-off-yddgW1oq.js","/assets/play-CcpvPypV.js","/assets/plug-zap-Dz-PA2s3.js","/assets/prop-types-m9rBWn-p.js","/assets/radio-DQdLxk6H.js","/assets/react-apexcharts.esm-D3LK9_me.js","/assets/registers-UPrax6hh.js","/assets/repeat-BNZe7T2A.js","/assets/save-CoRp5GRm.js","/assets/scopeLinks-rY2G2HvI.js","/assets/scroll-text-QzSkdffO.js","/assets/search-x-N0ehKhx8.js","/assets/segments-DI502nw_.js","/assets/send-CuGxNTf_.js","/assets/settings-2-CJ5BfuQK.js","/assets/shield-BVfOXJ5t.js","/assets/shield-alert-BelgxYCN.js","/assets/shield-question-mark-BnXjk8VE.js","/assets/siren-CATkVcx5.js","/assets/snowflake-BviFz93a.js","/assets/split-_JhMR-_r.js","/assets/square-check-big-fjgY0zzg.js","/assets/star-n9VwUGqo.js","/assets/statusBands-BZJ2Kb9-.js","/assets/store-Dr6kJFdC.js","/assets/table-2-B-V7uUv9.js","/assets/table-properties-BFUZi6j0.js","/assets/tag-CI9lyOw6.js","/assets/timer-off-txKr80H2.js","/assets/trending-down-CM8q0cZJ.js","/assets/trending-up-HfUET7_t.js","/assets/undo-2-Xg_KleKI.js","/assets/useChartTheme-CBBfuudP.js","/assets/useElementWidth-Chtza9J-.js","/assets/useIsMobile-BqeHrzx8.js","/assets/useOpenParam-DInSIfKb.js","/assets/useStatusBands-ClO2m2t1.js","/assets/useUrlScope-wyPIl7fY.js","/assets/user-DYIPxZEj.js","/assets/user-cog-DqJSvyxA.js","/assets/user-minus-HE_qVnsY.js","/assets/users-D9Lay4Ld.js","/assets/vfx-Z09HVfvu.js","/assets/video-CQelc46z.js","/assets/wallet-COB65yen.js","/assets/warehouse-BptVmFBF.js","/assets/workflow-Cfs_FnYG.js","/assets/x-Cw68EBRu.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
