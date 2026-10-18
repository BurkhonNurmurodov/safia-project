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

const BUILD = "2026-10-18T18:48:13.092Z";
const PRECACHE = ["/","/assets/AdminPanel-BkE1nYCJ.js","/assets/AnalysisBoard-DMCbQX_G.js","/assets/Arc-BDEgHwQm.js","/assets/Assistant-BUMG12TG.js","/assets/BrigadirProfile-DwD2njP_.js","/assets/BroadcastReceivers-BdSpiVSW.js","/assets/BroadcastRecord-CqEpmzDT.js","/assets/Button-Brm1ksR3.js","/assets/CatLockNotice-BoUAnYUq.js","/assets/CategoryLegendModal-DVdmc1Bn.js","/assets/CellConcerns-Cb4Cx9rf.js","/assets/CellDetails-CPJJ7639.js","/assets/CellFormModal-BBm5gpyy.js","/assets/CellIdent-SQlDo2j1.js","/assets/CellLink-CH4N4_Tr.js","/assets/Cells-CKdxzZQ_.js","/assets/ColumnFilter-DnBjmWjG.js","/assets/ColumnsPicker-CvNmBqWH.js","/assets/CommentsModal-BMq2goRo.js","/assets/ComparisonTable-CIWYoqis.js","/assets/Concerns-CE-gRdqq.js","/assets/CountStepper-CUVjm38k.js","/assets/Daily-CFAQ7AOQ.js","/assets/DataTable-VRfJjipI.js","/assets/DateRangePicker-BaXOYtZf.js","/assets/DayReportView-C9o-hgFS.js","/assets/DayStepper-DsX2tfx3.js","/assets/DifferenceBreakdown-BqKw9FdA.js","/assets/Downtime-BTC1Cw56.js","/assets/Education-D8ha9z4I.js","/assets/EducationLesson-DMFkKgGP.js","/assets/EmptyState-W2zQiNcO.js","/assets/Exam-Soj4BNoc.js","/assets/FactorySelect-6-2p5PJz.js","/assets/ForeignObjects-CBJLAnk5.js","/assets/Gamification-8XjH6aA9.js","/assets/GroupBadge-BbsJBmie.js","/assets/HeatmapChart-Dl3CFfFr.js","/assets/IdleCell-yn5G43FU.js","/assets/KPICard-CMY32tLu.js","/assets/Kaizen-CEAfCvbb.js","/assets/Kelish-DsYysWqY.js","/assets/KpiDeltaCard-DwmQ91f7.js","/assets/LangTextInput-0otwy23O.js","/assets/Layout-iS7G-wd2.js","/assets/LeaderAppeal-BzYSJh4d.js","/assets/LeaderDayReport-ClXAZPL0.js","/assets/LeaderUnitReport-D5cINDpp.js","/assets/Leaderboard-Bl_TGdck.js","/assets/Leaders-Bab93370.js","/assets/Lightbox-E35MNYn8.js","/assets/LiveOverview-BHET4Lcw.js","/assets/Login-BxBT6jIg.js","/assets/NotFound-BZlZQghh.js","/assets/Notifications-B-aa5Pcb.js","/assets/Overview-CLvAlAEW.js","/assets/Pagination-DAo9yUVV.js","/assets/PerenaladkaFactTable-V3F2ZOXq.js","/assets/PersonCard-xU_3aWrO.js","/assets/PlanFulfillment-CI980R2f.js","/assets/Production-Bhv5xlZq.js","/assets/Profile-DPDr8jxy.js","/assets/ProofCamera-DYx5Xq2a.js","/assets/ProofPhoto-BlsPlZDt.js","/assets/Quality-BMFdFNi3.js","/assets/RawRows-Da3lhZJY.js","/assets/RequestStateChip-DSnTnXwD.js","/assets/RichTextEditor-Ck5T6luF.js","/assets/SaveState-Ci1TBoVK.js","/assets/SearchInput-Do3UakAT.js","/assets/SeasonalityHeatmap-bTXyrdGH.js","/assets/SegmentedToggle-Iq76Vneb.js","/assets/SetupTimes-ClAgwo6o.js","/assets/ShiftDaily-DJpNU4tp.js","/assets/Staff-Is6Wpr1o.js","/assets/StaffListAtCheck-Bfoxexzq.js","/assets/StatusBadge-CW8fqDQX.js","/assets/TargetGoal-Bfidew8T.js","/assets/Targets-DigEiKaX.js","/assets/Tasks-CohnFzSO.js","/assets/TimeWheelPicker-Bv7emID9.js","/assets/Toast-BU9RWxQa.js","/assets/Tooltip-_i23rvde.js","/assets/TrendChart-Tkh-Fj6W.js","/assets/TripleSpeedometer-BQ7HtCA_.js","/assets/Trudoyomkost-D2BbMqlB.js","/assets/Turnover-CP7qlJnW.js","/assets/TurnoverBits-Dok8usR0.js","/assets/UploadDropzone-cWMGRMID.js","/assets/UsersActivity-BsYxWQfE.js","/assets/VerdictBlock-DKt4NUv0.js","/assets/VfxApiMap-Dyznj3Lf.js","/assets/VfxDictionaries-DvRi91_o.js","/assets/VfxEmployees-DmmnoQKq.js","/assets/VfxHrMoves-DesJoJM6.js","/assets/VfxJobs-5qDkrqSW.js","/assets/VfxPhoto-D1T3mQ30.js","/assets/VfxShifts-CiT9Lqq-.js","/assets/VfxState-Dcz0yt1d.js","/assets/VfxTimebooks-7SR-D2ay.js","/assets/VfxTimesheet-BYjVzlcv.js","/assets/WatchProgress-C_gMn49D.js","/assets/WebLogin-uK-zLNCR.js","/assets/WorkerConcerns-BQU-sVCn.js","/assets/Workers-BSvAIhEL.js","/assets/Zagruzka-BXqwCQJD.js","/assets/ZagruzkaCell-B40D9ca_.js","/assets/api-DIl1sWMc.js","/assets/archive-D4hBelEZ.js","/assets/archive-restore-CcuKoQM5.js","/assets/arrow-down-Bo_w73zE.js","/assets/arrow-down-wide-narrow-BYiXSks_.js","/assets/arrow-up-narrow-wide-DRO9KJHs.js","/assets/award-BnYzZ7YB.js","/assets/ban-DY7wGkFW.js","/assets/boxes-rONf8JXx.js","/assets/braces-Cm711M0u.js","/assets/brigadirFilters-CJaxpPYP.js","/assets/broadcastTree-CFHF5VNe.js","/assets/building-2-B4cBlNeZ.js","/assets/calculator-BPCjHSFz.js","/assets/calendar-days-BbG6jlCo.js","/assets/calendar-wOv9euhH.js","/assets/camera-CuxuzgP2.js","/assets/categories-owiJxkCs.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-D0RljGT_.js","/assets/chart-line-I2RgnDYX.js","/assets/chart-pie-BlaptFiS.js","/assets/chartRange-DlkiBX_f.js","/assets/check-check-D2JyN4NX.js","/assets/chevron-left-Dnbz__Zl.js","/assets/chevrons-up-down-DG3p03D4.js","/assets/circle-Bwsvkkh_.js","/assets/circle-alert-BBm3aNcO.js","/assets/circle-check-big-BtzyNKAJ.js","/assets/circle-dashed-DiIWhbWw.js","/assets/circle-minus-DVjWKMrG.js","/assets/circle-question-mark-OTly60_O.js","/assets/circle-slash-B2smsMsw.js","/assets/circle-user-round-BEMxR_3e.js","/assets/cloud-off-CNip9QJC.js","/assets/cloud-upload-545-oWAj.js","/assets/compass-EJQMOLC2.js","/assets/concernCategories-BzE2Hpt9.js","/assets/corner-down-right-DIQPemy2.js","/assets/createLucideIcon-USc-qM1-.js","/assets/es-BWSTXGkY.js","/assets/external-link-Dt_LmKvu.js","/assets/file-clock-4jSDQwP0.js","/assets/file-exclamation-point-B3h2ZRyv.js","/assets/flag-BBSGOJ_C.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BCciw7Q_.js","/assets/hash-PY0g9pFu.js","/assets/hourglass-BZx2hkj0.js","/assets/image-Cjolo9V7.js","/assets/image-off-PF6Ygz6q.js","/assets/inbox-CqEU6-z1.js","/assets/index-ByhNoNK_.css","/assets/index-CfPK7blz.js","/assets/keyboard-DbehVHY5.js","/assets/languages-OIOd2HOP.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DjyQ-bXk.js","/assets/lightbulb-CaXN0YAw.js","/assets/link-2-DyCJWPyM.js","/assets/link-2-off-DoLlwE3v.js","/assets/list-ordered-Iu5W1xZs.js","/assets/list-tree-Calws6uG.js","/assets/lock-open-GTyZPWTo.js","/assets/log-in-dKE0iEmA.js","/assets/marks-DBx4zjlu.js","/assets/minimize-2-0n0VmC1-.js","/assets/package-check-D0qT7oYd.js","/assets/pencil-CX36kr27.js","/assets/percent-mpfpN7py.js","/assets/pin-B72i90St.js","/assets/pin-off-D_AgVSY8.js","/assets/play-CPvZjXpJ.js","/assets/plug-zap-BTq1NL0_.js","/assets/prop-types-Bzxln8ll.js","/assets/radio-D8JpVZqX.js","/assets/react-apexcharts.esm-CNGEVXAM.js","/assets/registers-cqUMKrbd.js","/assets/repeat-asKXx_kq.js","/assets/save-Df4lseJq.js","/assets/scopeLinks-p6aVMYEt.js","/assets/scroll-text-DGnPRuV7.js","/assets/search-x-DJ3VyAFK.js","/assets/segments-Njcq07U1.js","/assets/send-DayIFm6K.js","/assets/settings-2-DQW5ICpJ.js","/assets/shield-alert-DJ5oQ87s.js","/assets/shield-question-mark-D5-Y9dbi.js","/assets/shield-x5uBg3q0.js","/assets/siren-BVXhY3Sk.js","/assets/snowflake-CodkcAyN.js","/assets/split-BPh27MB6.js","/assets/square-check-big-ZXJb4_yg.js","/assets/star-Hv5sPs73.js","/assets/statusBands-cYoIe6mf.js","/assets/store-TnROX1Wa.js","/assets/table-2-0Q99yy0_.js","/assets/table-properties-BPMct9jh.js","/assets/tag-XDJJrT82.js","/assets/timer-off-B8a_gK1Q.js","/assets/trending-down-BLeI8o7m.js","/assets/trending-up-CoTCgji2.js","/assets/undo-2-pHG5ERBY.js","/assets/useChartTheme-BMRMSB9h.js","/assets/useElementWidth-CAyESgkD.js","/assets/useIsMobile-tRu2N2sh.js","/assets/useOpenParam-CXwOQIQ_.js","/assets/useStatusBands-DcLymR2S.js","/assets/useUrlScope-CTrpu2GN.js","/assets/user-Dtk_2Eg3.js","/assets/user-cog-BRII8g-r.js","/assets/users-DTr8DKs8.js","/assets/vfx-BiHkNtCR.js","/assets/video-BVCEGDUc.js","/assets/wallet-Dx73KAgv.js","/assets/warehouse-BJDJ5r9l.js","/assets/workflow-CrkMj7c4.js","/assets/x-Ciunt0rB.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
