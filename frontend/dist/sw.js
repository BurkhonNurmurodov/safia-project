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

const BUILD = "2026-10-21T13:34:43.156Z";
const PRECACHE = ["/","/assets/AdminPanel-Z_Rr5TwU.js","/assets/AnalysisBoard-D1-Umiiq.js","/assets/Arc-ChDZpibM.js","/assets/Assistant-ui0eWO4p.js","/assets/BrigadirProfile-ByA7KAPz.js","/assets/BroadcastReceivers-BqmKPjDL.js","/assets/BroadcastRecord-CQbU4wgv.js","/assets/Button-rk5tQZn4.js","/assets/CatLockNotice-yIV8pWpC.js","/assets/CategoryLegendModal-pcHrJTVU.js","/assets/CellConcerns-bl5UUV8R.js","/assets/CellDetails-DqsHLh-n.js","/assets/CellFormModal-BQmo_g6q.js","/assets/CellIdent-BQgjdXzI.js","/assets/CellLink-Bg6lQE-b.js","/assets/Cells-ChasgF2f.js","/assets/ColumnFilter-DjI1rKfD.js","/assets/ColumnsPicker-BR4Y9rCd.js","/assets/CommentsModal-D7olg-yI.js","/assets/ComparisonTable-CFFxhi_7.js","/assets/Concerns-CGXwkq24.js","/assets/CountStepper-F97knNUW.js","/assets/Daily-DKovp0FE.js","/assets/DataTable-sV491UWG.js","/assets/DateRangePicker-C62kKxxy.js","/assets/DayReportView-DKJcnylU.js","/assets/DayStepper-0vmtUTIb.js","/assets/DayStrip-Cxud_xQQ.js","/assets/DifferenceBreakdown-De1WrzkU.js","/assets/Downtime-B8f-DS85.js","/assets/Education-DNgl85V9.js","/assets/EducationLesson-CjLcUvm1.js","/assets/EmptyState-CG659Cpq.js","/assets/Exam-C2J9hR1z.js","/assets/FactorySelect-DjxFKpEe.js","/assets/Gamification-DIzPXJf-.js","/assets/GroupBadge-umy7RRLh.js","/assets/HeatmapChart-VVx6HM9V.js","/assets/IdleCell-DAIhgL6s.js","/assets/KPICard-BMmeBU5l.js","/assets/Kaizen-DArp3yvW.js","/assets/Kelish-nOe_fOxN.js","/assets/KpiDeltaCard-BZKQMZ9D.js","/assets/LangTextInput-Bi3wcLWY.js","/assets/Layout-Dbmf0xpp.js","/assets/LeaderAppeal-CKRDv512.js","/assets/LeaderDayReport-CPxITiVP.js","/assets/LeaderUnitReport-DP83yy2-.js","/assets/Leaderboard-BVM9fiMT.js","/assets/Leaders-Dn5epSQ9.js","/assets/LeadersKpi-BoHiqdyG.js","/assets/Lightbox-sAIwRA8T.js","/assets/LiveOverview-uJ9GyH3o.js","/assets/Login-CIX7LBUa.js","/assets/NotFound-BojSTYCe.js","/assets/Notifications-Q0Ayz3oT.js","/assets/Ontime-CA4-6UM3.js","/assets/Overview-B053CURQ.js","/assets/Pagination-CexfRQR_.js","/assets/PerenaladkaFactTable-Dz3a4c2y.js","/assets/PersonCard-4vOlpahh.js","/assets/PlanFulfillment-DyaBybFD.js","/assets/Production-IWZXRT9T.js","/assets/Profile-x9RH1mFL.js","/assets/ProofCamera-BhwdFqI6.js","/assets/ProofPhoto--b_yzJuV.js","/assets/Quality-DZQdpywK.js","/assets/RawRows-CghU6qYP.js","/assets/RequestStateChip-Dt-q0B0A.js","/assets/RichTextEditor-4iUUp1af.js","/assets/SaveState-Cr3S2T4s.js","/assets/SearchInput-BlzPFaI9.js","/assets/SeasonalityHeatmap-CBOypmtm.js","/assets/SegmentedToggle-CsOtAvZz.js","/assets/SetupTimes-CfIfi6-C.js","/assets/ShiftDaily-BjP2_OU2.js","/assets/Staff-ZDMnbVpm.js","/assets/StaffListAtCheck-9da1BjM2.js","/assets/StatusBadge-LY03e-AP.js","/assets/StatusBandsModal-CaewvAtx.js","/assets/TargetGoal-DXYm0zyj.js","/assets/Targets-CdZKqJSE.js","/assets/Tasks-CuJIt6XA.js","/assets/TimeWheelPicker-DOXu3sXo.js","/assets/Toast-BJudAweZ.js","/assets/Tooltip-CknFilV8.js","/assets/TrendChart-DGn-XgQu.js","/assets/TripleSpeedometer-V8UFuxyz.js","/assets/Trudoyomkost-CZRK2kZe.js","/assets/UploadDropzone-a3ts6aq4.js","/assets/UsersActivity-IbzZXRif.js","/assets/VerdictBlock-Bv8OaEXu.js","/assets/VfxApiMap-CupuLILC.js","/assets/VfxDictionaries-CGdIZRlz.js","/assets/VfxEmployees-j5H6jhbo.js","/assets/VfxHrMoves-EIou9Zwk.js","/assets/VfxJobs-Bgs405bb.js","/assets/VfxPhoto-G279Ic2S.js","/assets/VfxShifts-DGFsUW5s.js","/assets/VfxState-Df97HiLi.js","/assets/VfxTimebooks-pf0VWJdR.js","/assets/VfxTimesheet-BJt0N1R8.js","/assets/WatchProgress-Cjs1tuJ0.js","/assets/WebLogin-BSoSINb3.js","/assets/Workers-9TtGOpLT.js","/assets/Zagruzka-CE20SEmv.js","/assets/ZagruzkaCell-BfXmVUMy.js","/assets/api-DahGS0Np.js","/assets/archive-BB2ausz_.js","/assets/archive-restore-b0NRW-VM.js","/assets/arrow-down-8dPNkRqX.js","/assets/arrow-down-right-Dt5QU-ei.js","/assets/arrow-down-wide-narrow-D7VbGXuj.js","/assets/arrow-up-narrow-wide-Dm03aPXt.js","/assets/ban-DTgnYgLb.js","/assets/boxes-Bm0FBTib.js","/assets/braces-BZmrGk4h.js","/assets/brigadirFilters-keLg80uD.js","/assets/broadcastTree-DJy7xzkw.js","/assets/building-2-ICHj0Uam.js","/assets/calendar-BSNgiHHI.js","/assets/calendar-days-BO97KIgZ.js","/assets/camera-DyZIAMI_.js","/assets/categories-OB34xDn3.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-CrfTAg1B.js","/assets/chart-line-ah6JCnes.js","/assets/chart-pie-BbMGtUCX.js","/assets/chartRange-Bev3OlJ2.js","/assets/check-check-DzEzYSB4.js","/assets/chevron-left-bpW-s3V9.js","/assets/chevrons-up-down-BOy3Bc--.js","/assets/circle-CWE98P5g.js","/assets/circle-alert-UtVZGcLr.js","/assets/circle-check-big-Cul9hkrZ.js","/assets/circle-dashed-CQfhj0w7.js","/assets/circle-minus-BkP7jGcv.js","/assets/circle-question-mark-Canv6Jal.js","/assets/circle-slash-BKxIfy5u.js","/assets/circle-user-round-1THb0qf3.js","/assets/cloud-off-CHvM3spy.js","/assets/cloud-upload-Bu0ZC-p-.js","/assets/compass-CQsF-MJC.js","/assets/concernCategories-uuwkNJPR.js","/assets/corner-down-right-h0cSAau0.js","/assets/createLucideIcon-DxvmIdD5.js","/assets/es-cvJR9VS1.js","/assets/external-link-DPWsBdLd.js","/assets/file-clock-B_SY6Z5f.js","/assets/file-exclamation-point-Cn0h9-Tr.js","/assets/flag-C0vKSKNL.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-By9GLGxR.js","/assets/funnel-CxLdEI4V.js","/assets/hash-DjTn3zL3.js","/assets/hourglass-Ckv7Ou9r.js","/assets/image-BmNwiI8v.js","/assets/image-off-CyhwtzAl.js","/assets/inbox-DrljTEUY.js","/assets/index-BLphj3AR.js","/assets/index-Ct9WqSVA.css","/assets/keyboard-DoNzyOWj.js","/assets/languages-BrkUWTtX.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D4BlyldY.js","/assets/lightbulb-CyUQfgu_.js","/assets/link-2-BPskdnaP.js","/assets/link-2-off-Dkzw10Bd.js","/assets/list-ordered-Bl6eZkWu.js","/assets/list-tree-OUjV9zYt.js","/assets/lock-open-BWhJaPaP.js","/assets/log-in-DrqOf2RO.js","/assets/marks-BRVF_HVI.js","/assets/minimize-2-fz_WX5Sx.js","/assets/package-check-CwGODgIS.js","/assets/pencil-D1Dh1loh.js","/assets/percent-XIBzkkDi.js","/assets/pin-Bnpl4P2M.js","/assets/pin-off-DvYM-Pa4.js","/assets/play-DG_Yw5BA.js","/assets/plug-zap-CpZwctcQ.js","/assets/prop-types-CmzB7w5E.js","/assets/radio-CqrUyBoN.js","/assets/react-apexcharts.esm-DeLsnCbq.js","/assets/registers-Vlmb-INj.js","/assets/repeat-BWn24hTc.js","/assets/save-19VKuEFu.js","/assets/scopeLinks-Da2OTODx.js","/assets/scroll-text-LizheHe1.js","/assets/search-x-9N91p3ha.js","/assets/segments-DpOioGFS.js","/assets/send-vTpIRv50.js","/assets/settings-2-BOaV3nGH.js","/assets/shield-VN07u8Cz.js","/assets/shield-alert-DVW_JGzD.js","/assets/shield-question-mark-C1jpYCYo.js","/assets/sigma-D2x7R8Kf.js","/assets/siren-_7bmmZw5.js","/assets/snowflake-KouVnY8v.js","/assets/split-2O5igtzH.js","/assets/square-check-big-C9wA3ngy.js","/assets/star-ZYdKgQnU.js","/assets/statusBands-Bq43ldMt.js","/assets/store-DDochAUF.js","/assets/table-2-CMgN4n_R.js","/assets/table-properties-LrzhKwue.js","/assets/tag-Cpbbsiol.js","/assets/timer-off-BjEB15kB.js","/assets/trendBuckets-C46-WsQx.js","/assets/trending-down-DIcTkpHE.js","/assets/trending-up-B9skZfra.js","/assets/undo-2-Cky6obDr.js","/assets/useChartTheme-BfvfyJH-.js","/assets/useElementWidth-BMCx16OR.js","/assets/useIsMobile-DQSySqut.js","/assets/useOpenParam-cDxlBFWW.js","/assets/useStatusBands-DxyfCvqO.js","/assets/useUrlScope-DNEEU8OY.js","/assets/user-Dz-kmTml.js","/assets/user-cog-DahAVfPO.js","/assets/user-minus-CfxHmFLK.js","/assets/users-DAUVnpDA.js","/assets/vfx-Dfz_LMCK.js","/assets/video-41Q7sRci.js","/assets/wallet-DoEeATPV.js","/assets/warehouse-64UhMrlN.js","/assets/workflow-kzv_h2ZC.js","/assets/x-DpWOkEXp.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
