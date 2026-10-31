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

const BUILD = "2026-10-31T06:32:53.820Z";
const PRECACHE = ["/","/assets/AdminPanel-Bv4w8NCs.js","/assets/AnalysisBoard-BwAZ-CHK.js","/assets/Arc-DumECcVx.js","/assets/Assessment-BFAsaV0_.js","/assets/AssessmentGrade-CCt6qq-o.js","/assets/Assistant-BgvgrHtG.js","/assets/BrigadirProfile-DzvH-4JS.js","/assets/BroadcastReceivers-IgdIZWyi.js","/assets/BroadcastRecord-FxZikr0I.js","/assets/Button-DMHg0JsO.js","/assets/CatLockNotice-BKRd5C_y.js","/assets/CategoryLegendModal-DjFruF2V.js","/assets/CellConcerns-DUH-P3u2.js","/assets/CellDetails-eZanic2c.js","/assets/CellFormModal-d4gYHpDM.js","/assets/CellIdent-bIyA1Bvd.js","/assets/CellLink-DgsS-SEf.js","/assets/Cells-XUkwY7N2.js","/assets/ColumnFilter-CWUpxny4.js","/assets/ColumnsPicker-3yolWjwz.js","/assets/CommentsModal-BQ2MZhee.js","/assets/ComparisonTable-EKkhz8Cy.js","/assets/Concerns-CA7SRB_u.js","/assets/CountStepper-DmY7jX0_.js","/assets/Daily-KiZapbuW.js","/assets/DataTable-DnoMOoB7.js","/assets/DateRangePicker-BZk_EwDK.js","/assets/DayReportView-BbkHnFpn.js","/assets/DayStepper-xsvQZfqU.js","/assets/DayStrip-CDRLcCBr.js","/assets/DifferenceBreakdown-xvxERR4c.js","/assets/Downtime-BHV4uDVm.js","/assets/Education-BDaePOzh.js","/assets/EducationLesson-Bxx2G01q.js","/assets/EmptyState-ChM6y_3p.js","/assets/Exam-HTiptWnK.js","/assets/FactorySelect-CKA5TSRa.js","/assets/Gamification-CNXGGjRX.js","/assets/HeatmapChart-D6X7fFGy.js","/assets/IdleCell-DDMEf4y9.js","/assets/KPICard-DIvt-dGY.js","/assets/Kaizen-BJR0e9Lm.js","/assets/Kelish-BIprx4QU.js","/assets/KpiDeltaCard-BcEANfLg.js","/assets/LangTextInput-B-a0Qvs7.js","/assets/Layout-DwNpaAxC.js","/assets/LeaderAppeal-Ejmiqeue.js","/assets/LeaderDayReport-DOF_NpMN.js","/assets/LeaderUnitReport-xpQ2ypqO.js","/assets/Leaderboard-CU-acaRt.js","/assets/Leaders-BKjmunwV.js","/assets/LeadersKpi-DtZIyMem.js","/assets/Lightbox-D3MHxzbZ.js","/assets/LiveOverview-BHaUIKXu.js","/assets/Login-BM2VWm_K.js","/assets/NotFound-Dn5Xjzj5.js","/assets/Notifications-CuzWqDOh.js","/assets/Ontime-Cdr-NMfh.js","/assets/Overview-y-6I_Ujc.js","/assets/Pagination-CbV0W0Xd.js","/assets/PerenaladkaFactTable-z1ij5_oc.js","/assets/PersonCard-BtpflhEd.js","/assets/PlanFulfillment-BfeROC6d.js","/assets/Production-BUoXpq9N.js","/assets/Profile-CTYFGGNk.js","/assets/ProofCamera-x2cJoroT.js","/assets/ProofPhoto-DcIbpxGJ.js","/assets/Quality-BQkKCwxK.js","/assets/RawRows-C8H674dD.js","/assets/Reports-BhuNSGzF.js","/assets/RequestStateChip-wnBff6GF.js","/assets/RichTextEditor-B1hM2pof.js","/assets/SaveState-CbQCcGWa.js","/assets/SearchInput-BFPyEOic.js","/assets/SeasonalityHeatmap-BP440oq8.js","/assets/SegmentedToggle-BJKc1d1x.js","/assets/SetupTimes-vjdNGzSq.js","/assets/ShiftDaily-Wm-JXKuo.js","/assets/Staff-DfJ12Hks.js","/assets/StaffListAtCheck-DJSgns5L.js","/assets/StatusBadge-DfZmVLBs.js","/assets/StatusBandsModal-DMIDZytm.js","/assets/TargetGoal-DhleNRFr.js","/assets/Targets-CI1capRL.js","/assets/Tasks-C1zP-0qo.js","/assets/TimeWheelPicker-hqY3LdH_.js","/assets/Toast-Dh8Q_dN1.js","/assets/Tooltip-Dtiayfq8.js","/assets/TrendChart-ukroQiKG.js","/assets/TripleSpeedometer-BDh-57lh.js","/assets/Trudoyomkost-Cr3-cCjq.js","/assets/UploadDropzone-Bho8mfKM.js","/assets/UsersActivity-CrvIh7qg.js","/assets/VerdictBlock-BTb6VAlL.js","/assets/VfxApiMap-DJB6x5Hr.js","/assets/VfxDictionaries-IZOuAs3C.js","/assets/VfxEmployees-CZNAocfS.js","/assets/VfxHrMoves-CclCyH1B.js","/assets/VfxJobs-CZO8UZn8.js","/assets/VfxPhoto-LLD7_Uso.js","/assets/VfxShifts-CH6klsqw.js","/assets/VfxState-fqusGpH-.js","/assets/VfxTimebooks-B3M8EPG1.js","/assets/VfxTimesheet-BYmqaJjg.js","/assets/WatchProgress-C7QtCx45.js","/assets/WebLogin-BEyHEasm.js","/assets/Workers-Dnmgz-y4.js","/assets/Zagruzka-CA7IQOF4.js","/assets/ZagruzkaCell-CuKAPBq6.js","/assets/api-BFm7MSgf.js","/assets/archive-JCmsG_Mn.js","/assets/archive-restore-eLQXaVJQ.js","/assets/arrow-down-BuAdEzZJ.js","/assets/arrow-down-right-EEf_OWqW.js","/assets/arrow-down-wide-narrow-CTkFm96g.js","/assets/arrow-up-narrow-wide-Cby_aEE9.js","/assets/assessmentUtil-C976Mhjk.js","/assets/ban-DvrwYCvE.js","/assets/boxes-hdm5l53F.js","/assets/braces-BYJe3kPd.js","/assets/brigadirFilters-cNsnMtl8.js","/assets/broadcastTree-DZBky0O3.js","/assets/calendar-BP6Y59TT.js","/assets/calendar-days-tyGReq6q.js","/assets/camera-CsHaEK1E.js","/assets/categories-C_hZB1yp.js","/assets/cellMoveRefusal-BeuKdwem.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CHchdbAI.js","/assets/chart-line-BrMWXp_H.js","/assets/chart-pie-BMRExKqo.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-R8bllcVy.js","/assets/chevron-left-BDs3wvGT.js","/assets/chevrons-up-down-DuVe3RXR.js","/assets/circle-alert-CzNskSmM.js","/assets/circle-check-big-Bpfqwsr_.js","/assets/circle-dashed-C1nvPTFb.js","/assets/circle-minus-CFLPY9I_.js","/assets/circle-question-mark-CzG_iccb.js","/assets/circle-user-round-t9_Ga0av.js","/assets/circle-zCLZXztW.js","/assets/cloud-off-9sfDob3H.js","/assets/cloud-upload-L2SqBFJy.js","/assets/coins-Cc72Fi0q.js","/assets/compass-DX5xjVoE.js","/assets/concernCategories-ChMaIpNW.js","/assets/corner-down-right-B7-3h8Nm.js","/assets/createLucideIcon-BHSpyGl2.js","/assets/en-Dqzi16nL.js","/assets/es-Dtgc5NM1.js","/assets/external-link-Cj1AapL_.js","/assets/file-exclamation-point-WCcwzl1s.js","/assets/flag-DL-MDVke.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BbOwwXCe.js","/assets/funnel-CsLoYcw_.js","/assets/hard-hat-BdPit4p0.js","/assets/hash-DnJxWHjR.js","/assets/hourglass-BGLFWS20.js","/assets/idleTime-CHPnJRpw.js","/assets/image-Df-nlwAS.js","/assets/image-off-CWxPIIiQ.js","/assets/inbox-o3tPbuE4.js","/assets/index-RKIo6lSU.css","/assets/index-noZhVK31.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-D0nRxUFm.js","/assets/layers-Dqju0bFX.js","/assets/leaderBoard-OwvdQnJZ.js","/assets/lightbulb-P3t7HSpr.js","/assets/link-2-DAdnB_mg.js","/assets/link-2-off-ygGdYKIW.js","/assets/list-ordered-Ca0cfA9j.js","/assets/list-tree-C5OTIpjg.js","/assets/lock-open-mTqXoZFw.js","/assets/log-in-iV_tvTxP.js","/assets/map-pin-DSx5-V1G.js","/assets/marks-tVTpT7ah.js","/assets/message-square-text-DrBvYrGr.js","/assets/minimize-2-R_Grhlkw.js","/assets/package-10yBIHr1.js","/assets/package-check-C_EfOR_B.js","/assets/pencil-BJS1cGBt.js","/assets/percent-DuknvxvI.js","/assets/pin-DVJxfA94.js","/assets/pin-off-BB5VsCLA.js","/assets/play-Cst1ard2.js","/assets/plug-zap-CsuvDZmF.js","/assets/prop-types-RD3fbola.js","/assets/radio-BKnq_2s4.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-EiyRGwb8.js","/assets/repeat-D1MPrTRe.js","/assets/ru-Be9hlZtZ.js","/assets/save-COeCkaav.js","/assets/scopeLinks-DyJbfzfm.js","/assets/search-x-C7KauJZe.js","/assets/segments-D5Uiedtv.js","/assets/send-BC3E2gcT.js","/assets/shield-CWk0PGV0.js","/assets/shield-alert-D-6VWJfw.js","/assets/sigma-BS_CqdS7.js","/assets/siren-CvA1MFZy.js","/assets/snowflake-Pvo6N7-b.js","/assets/split-asGJaZll.js","/assets/square-check-big-DJnCpDe2.js","/assets/star-BPaD7WdL.js","/assets/statusBands-DVBZcBq3.js","/assets/store-CXaOF5ea.js","/assets/table-2-CMfBxYfM.js","/assets/table-properties-4ntYnSa-.js","/assets/tag-BISc5SiE.js","/assets/timer-off-C3FmGFHk.js","/assets/translations-CQejUNHw.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-DgjiNbXM.js","/assets/trending-up-BUyCSDgm.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-DMD5G9iw.js","/assets/useChartTheme-R3kwHmMS.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-DiCDNu5w.js","/assets/useStatusBands-DuIEgdG6.js","/assets/useUrlScope-Dboe36vI.js","/assets/user-DbE2BgfK.js","/assets/user-cog-CH4pjHi8.js","/assets/uz-Ce5c9CVC.js","/assets/uz_cyrl-Co27p_yq.js","/assets/vfx-eHg5pp6W.js","/assets/video-DLLgtgAt.js","/assets/wallet-DbHUhqKG.js","/assets/warehouse-CGfF1KGJ.js","/assets/workflow-BiWoRmay.js","/assets/x-kkmccof5.js","/assets/zap-DviyViwa.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
