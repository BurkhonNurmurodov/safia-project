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

const BUILD = "2026-10-26T07:06:24.884Z";
const PRECACHE = ["/","/assets/AdminPanel-B9OaIZfi.js","/assets/AnalysisBoard-fIrW3zK4.js","/assets/Arc-rgn6YD5U.js","/assets/Assistant-DtjXagHb.js","/assets/BrigadirProfile-CvBMen1B.js","/assets/BroadcastReceivers-DobPjXsu.js","/assets/BroadcastRecord-a66m2wFV.js","/assets/Button-CRz_CJgi.js","/assets/CatLockNotice-BP0HGy4L.js","/assets/CategoryLegendModal-gwCy6A6r.js","/assets/CellConcerns-DIt6Jnz0.js","/assets/CellDetails-35JUiPBp.js","/assets/CellFormModal-B9gdAx1_.js","/assets/CellIdent-DXdJ2QK4.js","/assets/CellLink-CUyxwDaz.js","/assets/Cells-CXKhldWk.js","/assets/ColumnFilter-CVUjEDY8.js","/assets/ColumnsPicker-DG_npX7o.js","/assets/CommentsModal-CVRD4ChA.js","/assets/ComparisonTable-_dJyI04z.js","/assets/Concerns-Bx4c8KWH.js","/assets/CountStepper-C4nU_kd-.js","/assets/Daily-CQLlr0Ed.js","/assets/DataTable-QoIFN_pc.js","/assets/DateRangePicker-BSBZdJkZ.js","/assets/DayReportView-DWY4xL2g.js","/assets/DayStepper-BABmFLSR.js","/assets/DayStrip-Dp7Gbpjp.js","/assets/DifferenceBreakdown-DcRp-u6e.js","/assets/Downtime-DZxHZagQ.js","/assets/Education-CK5HsykJ.js","/assets/EducationLesson-CU5d2Gmv.js","/assets/EmptyState-HsL4KCtO.js","/assets/Exam-BH1Fx5dz.js","/assets/FactorySelect-Blg5VtW-.js","/assets/Gamification-B7hNdDD0.js","/assets/GroupBadge-CQICz5aQ.js","/assets/HeatmapChart-B_qFfUU6.js","/assets/IdleCell-CSwaH8LQ.js","/assets/KPICard-B80dlLwY.js","/assets/Kaizen-sICBRYyD.js","/assets/Kelish-SNcWttkf.js","/assets/KpiDeltaCard-BcBD15uX.js","/assets/LangTextInput-BMj-On30.js","/assets/Layout-CiIo3dlv.js","/assets/LeaderAppeal-v5gUmJp3.js","/assets/LeaderDayReport-fqy8q1R-.js","/assets/LeaderUnitReport-CvW_lP_u.js","/assets/Leaderboard-BEkuAAqg.js","/assets/Leaders-C-Q9AFA4.js","/assets/LeadersKpi-BT5B2SOH.js","/assets/Lightbox-CFj_7SPq.js","/assets/LiveOverview-0csGbGUu.js","/assets/Login-Dq0qxsA1.js","/assets/NotFound-BlEKhCqS.js","/assets/Notifications-DLUWo2Gx.js","/assets/Ontime-D1nj7nh0.js","/assets/Overview-DlgduMjp.js","/assets/Pagination-ByGiftwT.js","/assets/PerenaladkaFactTable-CHD1Fcby.js","/assets/PersonCard-C2t6E_tS.js","/assets/PlanFulfillment-BQQ4Tf9i.js","/assets/Production-rNXYTxAQ.js","/assets/Profile-4P90xdWC.js","/assets/ProofCamera-DDfXRysM.js","/assets/ProofPhoto-5swKAjCR.js","/assets/Quality-n6-YIXKV.js","/assets/RawRows-CgUsK2Cy.js","/assets/Reports-3us0bpO_.js","/assets/RequestStateChip-D_k670jR.js","/assets/RichTextEditor-CzV6zN2c.js","/assets/SaveState-qF9Q80hH.js","/assets/SearchInput-DFZj_ZrR.js","/assets/SeasonalityHeatmap-BUXd-dqZ.js","/assets/SegmentedToggle-Dt4JVrJT.js","/assets/SetupTimes-ClkZogn1.js","/assets/ShiftDaily-Di1cQy61.js","/assets/Staff-DD36A3ZV.js","/assets/StaffListAtCheck-BZWxGSrs.js","/assets/StatusBadge-Bwst1MvE.js","/assets/StatusBandsModal-T63N25-K.js","/assets/TargetGoal-D-pwKCOI.js","/assets/Targets-enNROUj3.js","/assets/Tasks-DhgOMCkJ.js","/assets/TimeWheelPicker-BhdIG-w0.js","/assets/Toast-tKrF958o.js","/assets/Tooltip-Cx3kNa0j.js","/assets/TrendChart-BZiR6ETg.js","/assets/TripleSpeedometer-DmCW4Uek.js","/assets/Trudoyomkost-CE_rayde.js","/assets/UploadDropzone-DrvaamWD.js","/assets/UsersActivity-Co8Bnea4.js","/assets/VerdictBlock-CyFLYpvC.js","/assets/VfxApiMap-6niVYCqO.js","/assets/VfxDictionaries-DcR8dtX1.js","/assets/VfxEmployees-CP7z2AoH.js","/assets/VfxHrMoves-axptGlkK.js","/assets/VfxJobs-BygPx_UA.js","/assets/VfxPhoto-C6dqBrK8.js","/assets/VfxShifts-M_IYr6Ay.js","/assets/VfxState-BtCOw78q.js","/assets/VfxTimebooks-x9GPr4-r.js","/assets/VfxTimesheet-BMF3cepB.js","/assets/WatchProgress-aAgFv-N2.js","/assets/WebLogin-C6hcDJPI.js","/assets/Workers-B6LmpM1p.js","/assets/Zagruzka-C98Wdg1G.js","/assets/ZagruzkaCell-BqnB9nKJ.js","/assets/api-BFm7MSgf.js","/assets/archive-DhCsRzfe.js","/assets/archive-restore-E0a6qQG2.js","/assets/arrow-down-q3qu2-9n.js","/assets/arrow-down-right-CsteUosz.js","/assets/arrow-down-wide-narrow-Ca1EExOI.js","/assets/arrow-up-narrow-wide-Th7xjONG.js","/assets/ban--NNgLjr0.js","/assets/boxes-B_62f-b9.js","/assets/braces-DVFZdSJv.js","/assets/brigadirFilters-DzxDIL1Q.js","/assets/broadcastTree-C73G-dzF.js","/assets/building-2-SHE1lER7.js","/assets/calendar-CotA_ht3.js","/assets/calendar-days-N3BNZfDJ.js","/assets/camera-18nc_beR.js","/assets/categories-DcUT6Iii.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-pCCSb6aw.js","/assets/chart-line-CpLMeGf_.js","/assets/chart-pie-BJBVkhj7.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-1QYIbG-G.js","/assets/chevron-left-lE652Dy5.js","/assets/chevrons-up-down-BYziIONA.js","/assets/circle-HCc89grH.js","/assets/circle-alert-BDGS7Vl3.js","/assets/circle-check-big-BKRPVU8w.js","/assets/circle-dashed-CZ-Mq7Vv.js","/assets/circle-minus-Cbh0YDl3.js","/assets/circle-question-mark-B1KAwCHN.js","/assets/circle-slash-AlEpWJn3.js","/assets/circle-user-round-BpLoPi4h.js","/assets/cloud-off-CcsfETQ0.js","/assets/cloud-upload-D0-z8SKv.js","/assets/coins-BXJhXcf7.js","/assets/compass-DgmGbw5d.js","/assets/concernCategories-CHwsNX-0.js","/assets/corner-down-right-DAE-K-Vp.js","/assets/createLucideIcon-B6Sn1FLH.js","/assets/en-Ce1-Kn3O.js","/assets/es-Dtgc5NM1.js","/assets/external-link-B_iLe9-R.js","/assets/file-clock-CHkg4kAN.js","/assets/file-exclamation-point-DRAx8ACs.js","/assets/flag-DFJh8_SK.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-iIa4PE8N.js","/assets/funnel-DCWohM96.js","/assets/hash-6XmuutL0.js","/assets/hourglass-DCMVoR7F.js","/assets/image-BAkCW0aQ.js","/assets/image-off-Dc73KLwV.js","/assets/inbox-BslRvkWq.js","/assets/index-CLYWTX-j.js","/assets/index-DLxHG_Om.css","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-Dge7CyH1.js","/assets/languages-BlChBMFO.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DRdth8xU.js","/assets/leaderBoard-DQeRQ0Oi.js","/assets/lightbulb-Czfkq3SX.js","/assets/link-2-CoFw166X.js","/assets/link-2-off-BbWlFpfb.js","/assets/list-ordered-C5IBtCV_.js","/assets/list-tree-DUivUIWK.js","/assets/lock-open-DthXBCDz.js","/assets/log-in-D2cnK5ql.js","/assets/map-pin-C66kN3R-.js","/assets/marks-BKVEFQjS.js","/assets/minimize-2-sdBhwpNM.js","/assets/package-check-K5BaTaCH.js","/assets/pencil-CXiPZwPB.js","/assets/percent-BepjIGNf.js","/assets/pin-BeBjaVAd.js","/assets/pin-off-DJHpPMCe.js","/assets/play-DGfVhzPz.js","/assets/plug-zap-C4FiSnj1.js","/assets/prop-types-RD3fbola.js","/assets/radio-Wvt7ssqv.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BYsPJNUd.js","/assets/repeat-4jjknq-J.js","/assets/ru-B71m0fAs.js","/assets/save-rNMdlBf9.js","/assets/scopeLinks-_AeLP4UG.js","/assets/scroll-text-HQrypoTe.js","/assets/search-x-BeLh4wNl.js","/assets/segments-D5Uiedtv.js","/assets/send-C-LL15bZ.js","/assets/settings-2-Brdn-0Xf.js","/assets/shield-DKW6Gnuh.js","/assets/shield-alert-BrWrLpWO.js","/assets/shield-question-mark-Bg7eBvxL.js","/assets/sigma-DcuN7nVd.js","/assets/siren-DpZdxX6a.js","/assets/snowflake-DfO5B0w8.js","/assets/split-DYZDPoGS.js","/assets/square-check-big-DU_ZcVOg.js","/assets/star-Bm2v1G59.js","/assets/statusBands-DVBZcBq3.js","/assets/store-BiUc4pB4.js","/assets/table-2-r-7AECtB.js","/assets/table-properties-Brwp8xDO.js","/assets/tag-Bf65EB15.js","/assets/timer-off-BHcWaqpR.js","/assets/translations-OsoGFgg8.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-BhTQzyJu.js","/assets/trending-up-BdRp_uo2.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-d8Mq0M-k.js","/assets/useChartTheme-BafoKR2N.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-k65PtXyL.js","/assets/useStatusBands-BJ8-yM3h.js","/assets/useUrlScope-J4IkHQY1.js","/assets/user-7J3tl6CY.js","/assets/user-cog-B06gMiY9.js","/assets/user-minus-94roq2Ae.js","/assets/users-jpKpgVz-.js","/assets/uz-ATQd_ZNg.js","/assets/uz_cyrl-DUQUyq2n.js","/assets/vfx--9jQgzBF.js","/assets/video-ygouVkzk.js","/assets/wallet-CPxtGhJm.js","/assets/warehouse-6fm5DgjA.js","/assets/workflow-D_E1M3vP.js","/assets/x-DSOHe6wh.js","/assets/zap-hQGPPkvB.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
