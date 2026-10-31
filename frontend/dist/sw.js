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

const BUILD = "2026-10-31T06:38:11.883Z";
const PRECACHE = ["/","/assets/AdminPanel-BEFKmaa3.js","/assets/AnalysisBoard-ClzpC83f.js","/assets/Arc-DnObLRpa.js","/assets/Assessment-XyAfgM1_.js","/assets/AssessmentGrade-C42oVF3H.js","/assets/Assistant-C5hDcms9.js","/assets/BrigadirProfile-DI5kZWlD.js","/assets/BroadcastReceivers-DkPAkVKk.js","/assets/BroadcastRecord-BK9DJzeG.js","/assets/Button-DMHg0JsO.js","/assets/CatLockNotice-Com8gSkW.js","/assets/CategoryLegendModal-BluXNxrk.js","/assets/CellConcerns-eT0UPdGC.js","/assets/CellDetails-BR_FOvDO.js","/assets/CellFormModal-W_vQpNoo.js","/assets/CellIdent-bIyA1Bvd.js","/assets/CellLink-jf2SBqLi.js","/assets/Cells-TeluSX-m.js","/assets/ColumnFilter-CT-_oPmT.js","/assets/ColumnsPicker-CPFZ2vn9.js","/assets/CommentsModal-BaNF_zOx.js","/assets/ComparisonTable-PNAAcdoo.js","/assets/Concerns-1Mzqxc6Q.js","/assets/CountStepper-DeTyNZ-H.js","/assets/Daily-B5qRlYpO.js","/assets/DataTable-i9bbKcR5.js","/assets/DateRangePicker-3TcwRJhi.js","/assets/DayReportView-qVMT1F9z.js","/assets/DayStepper-jQfDNXGV.js","/assets/DayStrip-CWxs9JCX.js","/assets/DifferenceBreakdown-APaHAzDS.js","/assets/Downtime-BbmfKgnI.js","/assets/Education-CKBj6PwO.js","/assets/EducationLesson-Pk_XgeNI.js","/assets/EmptyState-DClhV3nI.js","/assets/Exam-oXBePN8P.js","/assets/FactorySelect-C7IFtNc6.js","/assets/Gamification-Cl7LckY0.js","/assets/HeatmapChart-DV7MWQ3p.js","/assets/IdleCell-Dz4JhnUc.js","/assets/KPICard-DIvt-dGY.js","/assets/Kaizen-Duyy3vt_.js","/assets/Kelish-DSErel5f.js","/assets/KpiDeltaCard-DXY8BdND.js","/assets/LangTextInput-B-a0Qvs7.js","/assets/Layout-DO_rEF_W.js","/assets/LeaderAppeal-adTAuQ_l.js","/assets/LeaderDayReport-NzqTxZJc.js","/assets/LeaderUnitReport-vtFgtz9s.js","/assets/Leaderboard-DxJsqK1m.js","/assets/Leaders-BsvBsp9k.js","/assets/LeadersKpi-Bk3JC9L_.js","/assets/Lightbox-D3MHxzbZ.js","/assets/LiveOverview-CYFjJifB.js","/assets/Login-CN3tSs2X.js","/assets/NotFound-DC0qE9zl.js","/assets/Notifications-guKhk77o.js","/assets/Ontime-BTzeZheQ.js","/assets/Overview-BDzgnN4_.js","/assets/Pagination-CpUmnSy1.js","/assets/PerenaladkaFactTable-NCjPGk_q.js","/assets/PersonCard-BGby2-OE.js","/assets/PlanFulfillment-7C1FiJkv.js","/assets/Production-BMn-Tzao.js","/assets/Profile-Bn323f9X.js","/assets/ProofCamera-B730s3k2.js","/assets/ProofPhoto-CBpkq8H9.js","/assets/Quality-BJIER4pE.js","/assets/RawRows-BAYbVlfW.js","/assets/Reports-DAtL9H0E.js","/assets/RequestStateChip-7lqql1aw.js","/assets/RichTextEditor-Cp4yV4R9.js","/assets/SaveState-DIbWbQn4.js","/assets/SearchInput-Bj5Tjss_.js","/assets/SeasonalityHeatmap-BP440oq8.js","/assets/SegmentedToggle-BJKc1d1x.js","/assets/SetupTimes-D1K7Qy4X.js","/assets/ShiftDaily-4jlaRZZi.js","/assets/Staff-BPXt42Tf.js","/assets/StaffListAtCheck-BV8qxHLm.js","/assets/StatusBadge-B1JD00bW.js","/assets/StatusBandsModal-CoC_eGDM.js","/assets/TargetGoal-CSVCjTGB.js","/assets/Targets-8t8g_kuY.js","/assets/Tasks-DADNIpSD.js","/assets/TimeWheelPicker-hqY3LdH_.js","/assets/Toast-Dh8Q_dN1.js","/assets/Tooltip-Dtiayfq8.js","/assets/TrendChart-BuQL6Cyf.js","/assets/TripleSpeedometer-CT7IKoCJ.js","/assets/Trudoyomkost-Cc333zOu.js","/assets/UploadDropzone-Bho8mfKM.js","/assets/UsersActivity-CcwUbYGs.js","/assets/VerdictBlock-BAn1bMHa.js","/assets/VfxApiMap-BovIfW-P.js","/assets/VfxDictionaries-CBbYCmvi.js","/assets/VfxEmployees-BdjIarsY.js","/assets/VfxHrMoves-DELzwR6u.js","/assets/VfxJobs-u41pwb6G.js","/assets/VfxPhoto-LLD7_Uso.js","/assets/VfxShifts-D7FU_xu1.js","/assets/VfxState-B-UgzARm.js","/assets/VfxTimebooks-Bz5FTCE1.js","/assets/VfxTimesheet-BDv5vTtQ.js","/assets/WatchProgress-Dxsy2FXZ.js","/assets/WebLogin-C_-OgLdl.js","/assets/Workers-C6BLi7Dc.js","/assets/Zagruzka-ZB9-bfap.js","/assets/ZagruzkaCell-CitS9idi.js","/assets/api-BFm7MSgf.js","/assets/archive-JCmsG_Mn.js","/assets/archive-restore-eLQXaVJQ.js","/assets/arrow-down-BuAdEzZJ.js","/assets/arrow-down-right-EEf_OWqW.js","/assets/arrow-down-wide-narrow-CTkFm96g.js","/assets/arrow-up-narrow-wide-Cby_aEE9.js","/assets/assessmentUtil-I9eos-WL.js","/assets/ban-DvrwYCvE.js","/assets/boxes-hdm5l53F.js","/assets/braces-BYJe3kPd.js","/assets/brigadirFilters-omMiU-Up.js","/assets/broadcastTree-C4OUMwNq.js","/assets/calendar-BP6Y59TT.js","/assets/calendar-days-tyGReq6q.js","/assets/camera-CsHaEK1E.js","/assets/categories-D_oBKpcM.js","/assets/cellMoveRefusal-DCcMIU1p.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CHchdbAI.js","/assets/chart-line-BrMWXp_H.js","/assets/chart-pie-BMRExKqo.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-R8bllcVy.js","/assets/chevron-left-BDs3wvGT.js","/assets/chevrons-up-down-DuVe3RXR.js","/assets/circle-alert-CzNskSmM.js","/assets/circle-check-big-Bpfqwsr_.js","/assets/circle-dashed-C1nvPTFb.js","/assets/circle-minus-CFLPY9I_.js","/assets/circle-question-mark-CzG_iccb.js","/assets/circle-user-round-t9_Ga0av.js","/assets/circle-zCLZXztW.js","/assets/cloud-off-9sfDob3H.js","/assets/cloud-upload-L2SqBFJy.js","/assets/coins-Cc72Fi0q.js","/assets/compass-DX5xjVoE.js","/assets/concernCategories-DO9PXvaS.js","/assets/corner-down-right-B7-3h8Nm.js","/assets/createLucideIcon-BHSpyGl2.js","/assets/en-Dqzi16nL.js","/assets/es-Dtgc5NM1.js","/assets/external-link-Cj1AapL_.js","/assets/file-exclamation-point-WCcwzl1s.js","/assets/flag-DL-MDVke.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BbOwwXCe.js","/assets/funnel-CsLoYcw_.js","/assets/hard-hat-BdPit4p0.js","/assets/hash-DnJxWHjR.js","/assets/hourglass-BGLFWS20.js","/assets/idleTime-CHPnJRpw.js","/assets/image-Df-nlwAS.js","/assets/image-off-CWxPIIiQ.js","/assets/inbox-o3tPbuE4.js","/assets/index-CzGodcOO.js","/assets/index-RKIo6lSU.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-D0nRxUFm.js","/assets/layers-Dqju0bFX.js","/assets/leaderBoard-D7OujJuI.js","/assets/lightbulb-P3t7HSpr.js","/assets/link-2-DAdnB_mg.js","/assets/link-2-off-ygGdYKIW.js","/assets/list-ordered-Ca0cfA9j.js","/assets/list-tree-C5OTIpjg.js","/assets/lock-open-mTqXoZFw.js","/assets/log-in-iV_tvTxP.js","/assets/map-pin-DSx5-V1G.js","/assets/marks-tVTpT7ah.js","/assets/message-square-text-DrBvYrGr.js","/assets/minimize-2-R_Grhlkw.js","/assets/package-10yBIHr1.js","/assets/package-check-C_EfOR_B.js","/assets/pencil-BJS1cGBt.js","/assets/percent-DuknvxvI.js","/assets/pin-DVJxfA94.js","/assets/pin-off-BB5VsCLA.js","/assets/play-Cst1ard2.js","/assets/plug-zap-CsuvDZmF.js","/assets/prop-types-RD3fbola.js","/assets/radio-BKnq_2s4.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BhUbzCvO.js","/assets/repeat-D1MPrTRe.js","/assets/ru-Be9hlZtZ.js","/assets/save-COeCkaav.js","/assets/scopeLinks-lJ_-bZMM.js","/assets/search-x-C7KauJZe.js","/assets/segments-D5Uiedtv.js","/assets/send-BC3E2gcT.js","/assets/shield-CWk0PGV0.js","/assets/shield-alert-D-6VWJfw.js","/assets/sigma-BS_CqdS7.js","/assets/siren-CvA1MFZy.js","/assets/snowflake-Pvo6N7-b.js","/assets/split-asGJaZll.js","/assets/square-check-big-DJnCpDe2.js","/assets/star-BPaD7WdL.js","/assets/statusBands-DVBZcBq3.js","/assets/store-CXaOF5ea.js","/assets/table-2-CMfBxYfM.js","/assets/table-properties-4ntYnSa-.js","/assets/tag-BISc5SiE.js","/assets/timer-off-C3FmGFHk.js","/assets/translations-CQejUNHw.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-DgjiNbXM.js","/assets/trending-up-BUyCSDgm.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-DMD5G9iw.js","/assets/useChartTheme-BRxdJbYW.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useOpenParam-BNePYrPh.js","/assets/useStatusBands-DuIEgdG6.js","/assets/useUrlScope-BOa77k9G.js","/assets/user-DbE2BgfK.js","/assets/user-cog-0rUmP-S1.js","/assets/uz-Ce5c9CVC.js","/assets/uz_cyrl-Co27p_yq.js","/assets/vfx-eHg5pp6W.js","/assets/video-DLLgtgAt.js","/assets/wallet-DbHUhqKG.js","/assets/warehouse-CGfF1KGJ.js","/assets/workflow-BiWoRmay.js","/assets/x-kkmccof5.js","/assets/zap-DviyViwa.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
