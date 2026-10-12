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

const BUILD = "2026-10-12T07:06:59.609Z";
const PRECACHE = ["/","/assets/AdminPanel-DduJ8qEc.js","/assets/AnalysisBoard-4e-ghT7H.js","/assets/Arc-DKaijwPw.js","/assets/Assistant-Bs8xr07K.js","/assets/BrigadirProfile-x_dVv77l.js","/assets/BroadcastReceivers-kDJ8RK3c.js","/assets/BroadcastRecord-CdwMsWZz.js","/assets/Button-DfQirGnG.js","/assets/CatLockNotice-nECDRmdG.js","/assets/CategoryLegendModal-B4NZ3N9l.js","/assets/CellConcerns-VXdj6X2s.js","/assets/CellDetails-BShlYrIc.js","/assets/CellFormModal-yX7KY4_S.js","/assets/CellIdent-D3nG3alm.js","/assets/CellLink-CkCxXeyk.js","/assets/Cells-fRpncmiH.js","/assets/ColumnFilter-BlQycChi.js","/assets/ColumnsPicker-B1EUzVZD.js","/assets/CommentsModal-Xe_bdHqh.js","/assets/ComparisonTable-u09vdiNr.js","/assets/Concerns-DcXSLZFX.js","/assets/Daily-7o4UmRwx.js","/assets/DataTable-C9OE94al.js","/assets/DateRangePicker-CcF-W1o1.js","/assets/DayReportView-D7uED2Qi.js","/assets/DayStepper-C3ttq_FW.js","/assets/DifferenceBreakdown-BY4HFI8r.js","/assets/Downtime-DYcFIki0.js","/assets/Education-BRVBnlw8.js","/assets/EducationLesson-CBHyG19A.js","/assets/EmptyState-3LMBztvZ.js","/assets/Exam-BoeybWq-.js","/assets/FactorySelect-2OpcoHho.js","/assets/Gamification-BBGRgSC9.js","/assets/GroupBadge-DJKgfg5X.js","/assets/HeatmapChart-CN8tlMFB.js","/assets/IdleCell-B1pGeo0Q.js","/assets/KPICard-YnLdLvdn.js","/assets/Kaizen-xB07zds1.js","/assets/Kelish-BPR4jkRu.js","/assets/KpiDeltaCard-CVND-k8i.js","/assets/LangTextInput-C74Alk8P.js","/assets/Layout-DN8If7zy.js","/assets/LeaderAppeal-CB2G7MEk.js","/assets/LeaderDayReport-ZaeBbKha.js","/assets/LeaderUnitReport-H5cJ9x1g.js","/assets/Leaderboard-_9f4eq67.js","/assets/Leaders-BwuYwVDW.js","/assets/Lightbox-CyTXQjFS.js","/assets/LiveOverview-uehBfFYJ.js","/assets/Login-6I14cKo-.js","/assets/NotFound-Czr0nxaD.js","/assets/Notifications-BbCN8S7k.js","/assets/Overview-CGIWS30a.js","/assets/Pagination-DceZWDq5.js","/assets/PerenaladkaFactTable-JU550KPu.js","/assets/PersonCard-DT3Vodm5.js","/assets/PlanFulfillment-CuYX70ps.js","/assets/Production-BBFnBTwR.js","/assets/Profile-D7TxLeyV.js","/assets/ProofCamera-Dx0M_2S_.js","/assets/ProofPhoto-RxNKFVbB.js","/assets/Quality-B2KKQPKC.js","/assets/RawRows-CYnJ93pB.js","/assets/RequestStateChip-BEJ_cftf.js","/assets/RichTextEditor-D3h8vXGM.js","/assets/SaveState-DiyTygmV.js","/assets/SearchInput-BbpJYcyh.js","/assets/SeasonalityHeatmap-JHGGrG3Q.js","/assets/SegmentedToggle-DyqFemeK.js","/assets/SetupTimes-DvzXsKOV.js","/assets/ShiftDaily-B8MtC3DN.js","/assets/Staff-B10sjNnY.js","/assets/StatusBadge-DjUk3wO-.js","/assets/TargetGoal-DIZubxAe.js","/assets/Targets-BCjvMRjd.js","/assets/Tasks-DtHvhVLV.js","/assets/TimeWheelPicker-C-KRRTaj.js","/assets/Toast-BxSxeNfE.js","/assets/Tooltip-D-OvR-he.js","/assets/TrendChart-D-47t0v4.js","/assets/TripleSpeedometer-DbS7jKb4.js","/assets/Trudoyomkost-CCP0NPWh.js","/assets/Turnover-Vni0GFpN.js","/assets/UploadDropzone-BO5iSMYk.js","/assets/UsersActivity-BkmAvCTy.js","/assets/VerdictBlock-Nysme4Q0.js","/assets/VfxApiMap-DxHr8FKL.js","/assets/VfxDictionaries-Da1ztuLg.js","/assets/VfxEmployees-C7bc4nWy.js","/assets/VfxHrMoves-Btl1hJ_p.js","/assets/VfxJobs-18mjeqMC.js","/assets/VfxPhoto-D_Ba_5pG.js","/assets/VfxShifts-DP0m7B5f.js","/assets/VfxState-Dy0Gt_uW.js","/assets/VfxTimebooks-CdCVEmqh.js","/assets/VfxTimesheet-nABKI7yx.js","/assets/WatchProgress-eE6NryA9.js","/assets/WebLogin-C3JTOzoN.js","/assets/WorkerConcerns-BaQTuoTW.js","/assets/Workers-DfU9myH9.js","/assets/Zagruzka-BY87ryRM.js","/assets/ZagruzkaCell-xL3LY4by.js","/assets/api-DowkrDRu.js","/assets/archive-restore-C1orBaKs.js","/assets/archive-uurSTdZW.js","/assets/arrow-down-M2LCJ5Pd.js","/assets/arrow-down-wide-narrow-qFd64aK3.js","/assets/arrow-up-narrow-wide-CXDVUECd.js","/assets/award-z-hqJFZY.js","/assets/ban-OUmT7-dI.js","/assets/boxes-BadetWo6.js","/assets/braces-7PaLukCX.js","/assets/brigadirFilters-DG0SpJFY.js","/assets/broadcastTree-_4WKfQYq.js","/assets/building-2-DA9_p4gO.js","/assets/calculator-qu-r0Qu0.js","/assets/calendar-HEgOoz3f.js","/assets/calendar-days-k3cfp5EG.js","/assets/camera-NI1wBMPO.js","/assets/categories-DlL7cZZe.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-taHP3UQE.js","/assets/chart-line-CSs6hwf7.js","/assets/chart-pie-DpP_SDJr.js","/assets/chartRange-D-h5cS8N.js","/assets/check-check-BYzeY__k.js","/assets/chevron-left-BRZc2AAD.js","/assets/chevrons-up-down-BZT5E9fJ.js","/assets/circle-alert-DAqRGZuh.js","/assets/circle-check-big-DPiIzxUc.js","/assets/circle-dashed-BtoFw8xS.js","/assets/circle-minus-BRG9tL4o.js","/assets/circle-question-mark-DBaDXmNQ.js","/assets/circle-slash-B32teaTu.js","/assets/circle-tRqXfAUY.js","/assets/circle-user-round-DTyi-xKf.js","/assets/clock-3-BoKFwVRh.js","/assets/cloud-off-CP3JcIZN.js","/assets/cloud-upload-DG7bWTmx.js","/assets/compass-COui17WB.js","/assets/concernCategories-DQp6v0Fn.js","/assets/copy-Dtj_sEMm.js","/assets/corner-down-right-DMwGZzK9.js","/assets/createLucideIcon-uozslv21.js","/assets/es-BUllbIzx.js","/assets/external-link-Ci1XWe_C.js","/assets/file-clock-BPnexW_b.js","/assets/file-exclamation-point-CM7wn8LK.js","/assets/flag--8RCJLP0.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BeePqwV4.js","/assets/hash-cAdCXOCM.js","/assets/hourglass-wIAJ7e9O.js","/assets/image-CYHlHaus.js","/assets/image-off-p-Z702Jc.js","/assets/inbox-BFI3w59w.js","/assets/index-BWtdNB5k.js","/assets/index-CI1cZ1SD.css","/assets/keyboard-EI_0fE3p.js","/assets/languages-CeW-01wr.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BOn_vKBR.js","/assets/lightbulb-BloCfx-4.js","/assets/link-2-CtHEOsPC.js","/assets/link-2-off-BLgomZ6C.js","/assets/list-ordered-DnZfaQYC.js","/assets/list-tree-CDleQDgF.js","/assets/lock-open-DGolNXmf.js","/assets/log-in-CW3rQlxr.js","/assets/minimize-2-Cggc_Cat.js","/assets/package-check-BgzNliqc.js","/assets/pencil-olF-78ij.js","/assets/percent-Ch9UwNYC.js","/assets/pin-ClM59hdt.js","/assets/pin-off-BR4SoWUn.js","/assets/play-Bogi9uIY.js","/assets/plug-zap-f2EbUGbK.js","/assets/prop-types-YYeMwoXJ.js","/assets/radio-B74lAcvf.js","/assets/react-apexcharts.esm-DjVftoHQ.js","/assets/registers-DHtwFnNm.js","/assets/repeat-Bfv_STXV.js","/assets/save-CXRqDK5k.js","/assets/scopeLinks-CrE-anN1.js","/assets/scroll-text-BAkwmeK0.js","/assets/search-x-BSmG4Z2z.js","/assets/segments-CZaSRcv6.js","/assets/send-DihbUF3H.js","/assets/settings-2-BTxL1hE_.js","/assets/shield-DiH1Ybqh.js","/assets/shield-alert-ByjyTmbj.js","/assets/shield-question-mark-DgbsZzA5.js","/assets/siren-B3Ht8ECJ.js","/assets/snowflake-B-fLRilf.js","/assets/split-CubgFcp6.js","/assets/square-check-big-L72YKXsK.js","/assets/star-CsTCxLR2.js","/assets/statusBands-BVDi7k8j.js","/assets/store-C9yPynl1.js","/assets/table-2-DKBzx6QH.js","/assets/table-properties-C-20ZFll.js","/assets/tag-DvY0soCE.js","/assets/timer-off-A7I5OnAw.js","/assets/trending-down-BJS2fjsR.js","/assets/trending-up-CzkJF8xm.js","/assets/undo-2-BGKkkrH9.js","/assets/useChartTheme-Bsf4GvSk.js","/assets/useElementWidth-GnhQ4ou-.js","/assets/useIsMobile-DrMVqtzB.js","/assets/useOpenParam-VtBiRrPX.js","/assets/useStatusBands-De-HM0Nm.js","/assets/useUrlScope-Dh4pBEzH.js","/assets/user-cog-DOSOLWbC.js","/assets/user-iSg02IJi.js","/assets/users-DUi5Kpgk.js","/assets/vfx-lrCvsn1J.js","/assets/video-B5z-RnXz.js","/assets/wallet-DIa26nDF.js","/assets/warehouse-XPRam8rf.js","/assets/workflow-CKGE-n5G.js","/assets/x-B39k9-av.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
