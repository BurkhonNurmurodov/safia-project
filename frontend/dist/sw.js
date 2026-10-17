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

const BUILD = "2026-10-17T09:20:28.775Z";
const PRECACHE = ["/","/assets/AdminPanel-CnYVGHpP.js","/assets/AnalysisBoard-DWaFHhHF.js","/assets/Arc-BZxBMas5.js","/assets/Assistant-BXAVqK4y.js","/assets/BrigadirProfile-37XHqyM5.js","/assets/BroadcastReceivers-Dz14Jh1G.js","/assets/BroadcastRecord-Bx7XVd1-.js","/assets/Button-BwwvfPu9.js","/assets/CatLockNotice-CU9o3r16.js","/assets/CategoryLegendModal-CTY7AOz4.js","/assets/CellConcerns-XozvsudH.js","/assets/CellDetails-yh4Ngel-.js","/assets/CellFormModal-DMZLBuQW.js","/assets/CellIdent-DgVCD-qk.js","/assets/CellLink-DBMcvomM.js","/assets/Cells-DWrKa9yO.js","/assets/ColumnFilter-BYeJmFai.js","/assets/ColumnsPicker-CD-RgiPc.js","/assets/CommentsModal-DNHxbMfe.js","/assets/ComparisonTable-Bqv3lgjB.js","/assets/Concerns-B_Weuiz6.js","/assets/CountStepper-DCV2r7kt.js","/assets/Daily-CgAYteoa.js","/assets/DataTable-BR6Gaxl5.js","/assets/DateRangePicker-D8k3EJJ-.js","/assets/DayReportView-Du0JALme.js","/assets/DayStepper-C1dLeuzu.js","/assets/DifferenceBreakdown-UtEqGuZf.js","/assets/Downtime-Dbrii2cf.js","/assets/Education-DDBRdLCg.js","/assets/EducationLesson-soneg7vf.js","/assets/EmptyState-CRQACQjb.js","/assets/Exam-C_U-ATrf.js","/assets/FactorySelect-oEzL3vB8.js","/assets/ForeignObjects-C15BZcP7.js","/assets/Gamification-CW-2M9B9.js","/assets/GroupBadge-B3FHFTCN.js","/assets/HeatmapChart-PLBFZhrK.js","/assets/IdleCell-B0-QH7nE.js","/assets/KPICard-4Z58rIgd.js","/assets/Kaizen-DES7jvl2.js","/assets/Kelish-CzagUthW.js","/assets/KpiDeltaCard-94vVRiuy.js","/assets/LangTextInput-aiGYcJUe.js","/assets/Layout-DNpHqy8S.js","/assets/LeaderAppeal-DiI3a1G5.js","/assets/LeaderDayReport-BDDudhhc.js","/assets/LeaderUnitReport-CuNEc_DT.js","/assets/Leaderboard-CAEHs86i.js","/assets/Leaders-DEaPEiYi.js","/assets/Lightbox-BMPPcxXw.js","/assets/LiveOverview-D0wQLPhq.js","/assets/Login-CpAN84tR.js","/assets/NotFound-Dm7jNIMl.js","/assets/Notifications-p1_E-B8m.js","/assets/Overview-cMYy6Gep.js","/assets/Pagination-Ce1YcCVC.js","/assets/PerenaladkaFactTable-0PUTsh7d.js","/assets/PersonCard-C92HjEIt.js","/assets/PlanFulfillment-BOO3prYg.js","/assets/Production-Dp4wZvak.js","/assets/Profile-DU4z9ce-.js","/assets/ProofCamera-txIp4glG.js","/assets/Quality-Cg_i3V73.js","/assets/RawRows-x9IMj6V1.js","/assets/RequestStateChip-C64fAQqv.js","/assets/RichTextEditor-BKrVg_wP.js","/assets/SaveState-CgcIH4b2.js","/assets/SearchInput-BamzaYYO.js","/assets/SeasonalityHeatmap-BMHOwU9N.js","/assets/SegmentedToggle-2vs84IEg.js","/assets/SetupTimes-BdTJOm7x.js","/assets/ShiftDaily-_kJem1ZA.js","/assets/Staff-BHHNSw02.js","/assets/StaffListAtCheck-Bg0_ED5I.js","/assets/StatusBadge-3-Dt-xP7.js","/assets/TargetGoal-DdTRyhGw.js","/assets/Targets-DQ5Zqqri.js","/assets/Tasks-CJ6pafcY.js","/assets/TimeWheelPicker-De52gCOd.js","/assets/Toast-DOgjE3j3.js","/assets/Tooltip-BCxWRrQk.js","/assets/TrendChart-BQ42T65N.js","/assets/TripleSpeedometer-BRytY1Ry.js","/assets/Trudoyomkost-Bdr3flw4.js","/assets/Turnover-BagFXi3v.js","/assets/TurnoverBits-3V93b3hP.js","/assets/UploadDropzone-DGgn5cFh.js","/assets/UsersActivity-CM7MN2qg.js","/assets/VerdictBlock-BsWsMSxA.js","/assets/VfxApiMap-CqummX58.js","/assets/VfxDictionaries-BEFa6TRo.js","/assets/VfxEmployees-BBA7gBxe.js","/assets/VfxHrMoves-9ZbOlzdG.js","/assets/VfxJobs-CsR6tAY1.js","/assets/VfxPhoto-DvtDc2Tz.js","/assets/VfxShifts-BKieZBHN.js","/assets/VfxState-ChlItGKj.js","/assets/VfxTimebooks-D0zUzHc2.js","/assets/VfxTimesheet-4LssPGcx.js","/assets/WatchProgress-g2ObTWnQ.js","/assets/WebLogin-6co7yk9S.js","/assets/WorkerConcerns-B1ga4mds.js","/assets/Workers-BkRqe71-.js","/assets/Zagruzka-iGPHfQIX.js","/assets/ZagruzkaCell-DOrGaHzW.js","/assets/api-BpyNU_yg.js","/assets/archive-CeTns3ke.js","/assets/archive-restore-DYR6rDa3.js","/assets/arrow-down-CIdRPbUN.js","/assets/arrow-down-wide-narrow-gpbLiAmw.js","/assets/arrow-up-narrow-wide-CZIJvL6T.js","/assets/award-CBkRTz_p.js","/assets/ban-CIbQVumH.js","/assets/boxes-BPPC_jkt.js","/assets/braces-DRbg1tTR.js","/assets/brigadirFilters-Dpe3-S1h.js","/assets/broadcastTree-CJyF9h7X.js","/assets/building-2-BK753Ql-.js","/assets/calculator-BQy5wRls.js","/assets/calendar-Ov2EAOiS.js","/assets/calendar-days-nfqV8cta.js","/assets/camera-CRODW9Xj.js","/assets/categories-Xc8bJvZA.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DBCi8Dlq.js","/assets/chart-line-BEbo8i4n.js","/assets/chart-pie-C8Qg3Y_I.js","/assets/chartRange-CraRZdRH.js","/assets/check-check-Po3Dudll.js","/assets/chevron-left-C-rrayut.js","/assets/chevrons-up-down-DW6DUFPP.js","/assets/circle-CDzSx1Pq.js","/assets/circle-alert-DKne05m4.js","/assets/circle-check-big-B50MvTJF.js","/assets/circle-dashed-Bom_LKLU.js","/assets/circle-minus-BV3gg2tz.js","/assets/circle-question-mark-CdzmLNw6.js","/assets/circle-slash-Cm6yDOz_.js","/assets/circle-user-round-DTEGqLBz.js","/assets/cloud-off-BGXOsQMW.js","/assets/cloud-upload-D-3u8fnO.js","/assets/compass-BF774hT9.js","/assets/concernCategories-CY40j-Vm.js","/assets/corner-down-right-vbWXcxEx.js","/assets/createLucideIcon-DfehTclk.js","/assets/es-C0ui5vVr.js","/assets/external-link-CZXsb4mq.js","/assets/file-clock-D26ia4TF.js","/assets/file-exclamation-point-DXaCeN2j.js","/assets/flag-CYviRMti.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-D8yaG8cX.js","/assets/hash-pWWOsosW.js","/assets/hourglass-5ssGDdP_.js","/assets/image-CRyEo6kX.js","/assets/image-off-BAIQHN9v.js","/assets/inbox-DxmMqPrX.js","/assets/index-ByhNoNK_.css","/assets/index-CGtKloBW.js","/assets/keyboard-cs8V65x3.js","/assets/languages-TvrJBoO7.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-B-HO7Utk.js","/assets/lightbulb-FR_a49BU.js","/assets/link-2-Bdk6oQsT.js","/assets/link-2-off-BB5EYmGH.js","/assets/list-ordered-DIqgQEEf.js","/assets/list-tree-B5hpf8XN.js","/assets/lock-open-CoU_hqte.js","/assets/log-in-ELoa-Rlh.js","/assets/marks-C_f3voH_.js","/assets/minimize-2-ByyUCiw5.js","/assets/package-check-BBoDUTNJ.js","/assets/pencil-CdNmTqNv.js","/assets/percent-nyflTqYz.js","/assets/pin-D42MzbqV.js","/assets/pin-off-DYQmAMLT.js","/assets/play-BToWXwp4.js","/assets/plug-zap-DFmDsuPN.js","/assets/prop-types-4efuz_SQ.js","/assets/radio-C1QrawBJ.js","/assets/react-apexcharts.esm-4legdB6R.js","/assets/registers-wDKh6kH7.js","/assets/repeat-BV1oaZRh.js","/assets/save-D3vZ4rMU.js","/assets/scopeLinks-CDcuyCA7.js","/assets/scroll-text-xXk1iuP9.js","/assets/search-x-CsIFyET9.js","/assets/segments-k8fiwHxV.js","/assets/send-CHJgoDyl.js","/assets/settings-2-hXy4aYe8.js","/assets/shield-DB-b3lDZ.js","/assets/shield-alert-aFfOaXBN.js","/assets/shield-question-mark-BRxTOc4i.js","/assets/siren-DUjU_tFt.js","/assets/snowflake-ukGFHaW7.js","/assets/split-COz0Fb3Z.js","/assets/square-check-big-QKqRmxvd.js","/assets/star-CWvpoTnF.js","/assets/statusBands-DZQY4Fzn.js","/assets/store-CNqARe0S.js","/assets/table-2-DRRBwR5s.js","/assets/table-properties-BZtQN4pZ.js","/assets/tag-D5WUFcVX.js","/assets/timer-off-CvTEkR72.js","/assets/trending-down-DJuC2ZRy.js","/assets/trending-up-DYYn4iOv.js","/assets/undo-2-N_Z6TWyb.js","/assets/useChartTheme-Bdl8x3MX.js","/assets/useElementWidth-Bydxku45.js","/assets/useIsMobile-CTETAir1.js","/assets/useOpenParam-D-LmUDs8.js","/assets/useStatusBands-BeFVLrwk.js","/assets/useUrlScope-DOEgjXRf.js","/assets/user-Bc3DoCfs.js","/assets/user-cog-8kZyzJQA.js","/assets/users-QKn1p35f.js","/assets/vfx-DpPLPCea.js","/assets/video-CK2kZn2V.js","/assets/wallet-CElJVHVH.js","/assets/warehouse-BTEoR0Zj.js","/assets/workflow-Crr2VZyC.js","/assets/x-KpfBRIMX.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
