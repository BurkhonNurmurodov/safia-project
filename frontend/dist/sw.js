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

const BUILD = "2026-10-09T07:19:26.136Z";
const PRECACHE = ["/","/assets/AdminPanel-lng9G9gO.js","/assets/AnalysisBoard-DoCCOZtc.js","/assets/Arc-DS9TZPiT.js","/assets/Assistant-DEPnpx4h.js","/assets/BrigadirProfile-w93KW_KI.js","/assets/BroadcastReceivers-DAqkAs50.js","/assets/BroadcastRecord-C0BOlTxd.js","/assets/Button-B01c06pG.js","/assets/CatLockNotice-DxQkRBaH.js","/assets/CategoryLegendModal-DU7qcXDl.js","/assets/CellConcerns-DDVraWki.js","/assets/CellDetails-qsKj1F9R.js","/assets/CellFormModal-Bt5VhDRT.js","/assets/CellIdent-C70OuiZR.js","/assets/CellLink-CiFsUBDc.js","/assets/Cells-B6OfL82o.js","/assets/ColumnFilter-BDW6a0hp.js","/assets/ColumnsPicker-BM69g6Ty.js","/assets/CommentsModal-BKwLikjT.js","/assets/ComparisonTable-B0EM3sBW.js","/assets/Concerns-CT-ubMp2.js","/assets/Daily-CZ0EiF8R.js","/assets/DataTable-D7_nZDqa.js","/assets/DateRangePicker-rn81Yfn7.js","/assets/DayReportView-D5mnA6t5.js","/assets/DayStepper-16T3Mt10.js","/assets/DifferenceBreakdown-DfdpA0oF.js","/assets/Downtime-UhFz7C7p.js","/assets/Education-DXKuoJ5H.js","/assets/EducationLesson-BKKXuIVP.js","/assets/EmptyState-g3k4k6ku.js","/assets/Exam-AD9Hswzf.js","/assets/FactorySelect-DQFVY-tz.js","/assets/Gamification-Bp0JDfTz.js","/assets/GroupBadge-D4dEXSDz.js","/assets/HeatmapChart-ieZ1e25E.js","/assets/IdleCell-jTgvkFgS.js","/assets/KPICard-eNenTo-e.js","/assets/Kaizen-Be5lqN1q.js","/assets/Kelish-DiTPfp_Z.js","/assets/KpiDeltaCard-CR7v-do-.js","/assets/LangTextInput-C7174K-Y.js","/assets/Layout-ylf_PDtr.js","/assets/LeaderAppeal-CbJYTz8C.js","/assets/LeaderDayReport-tfCl0ZMa.js","/assets/LeaderUnitReport-CgXH8Q5n.js","/assets/Leaderboard-BC7E5HbN.js","/assets/Leaders-Bwcbpcl3.js","/assets/Lightbox-CZkLDu08.js","/assets/LiveOverview-C5mhOVwx.js","/assets/Login-BY4y-Ozm.js","/assets/NotFound-Ca3hUkeS.js","/assets/Notifications-BBTpudXY.js","/assets/Overview-BQhO7aiV.js","/assets/Pagination-Bdi0qo-b.js","/assets/PerenaladkaFactTable-LPOkxIUI.js","/assets/PersonCard-DSs8kGZV.js","/assets/PlanFulfillment-BEdJVfru.js","/assets/Production-BPEVreOW.js","/assets/Profile-DHdHNmVE.js","/assets/ProofCamera-kh4Oq2gl.js","/assets/ProofPhoto-CP9xn6vY.js","/assets/Quality-DniRbBtn.js","/assets/RawRows-8MEUTgCV.js","/assets/RequestStateChip-DY2zuwIm.js","/assets/RichTextEditor-D-Cesoxr.js","/assets/SaveState-DEiPJZUU.js","/assets/SearchInput-7H4o1Jau.js","/assets/SeasonalityHeatmap-BznVxD9O.js","/assets/SegmentedToggle-DMmXR-7P.js","/assets/SetupTimes-C9lqeaQb.js","/assets/ShiftDaily-jHUnDmKM.js","/assets/Staff-DjySXfsT.js","/assets/StatusBadge-73Ql95E0.js","/assets/TargetGoal-BnfBAZ8i.js","/assets/Targets-B8ikGnz8.js","/assets/Tasks-R71AlIla.js","/assets/TimeWheelPicker-Cs_S3MmI.js","/assets/Toast-BVYKVf2Q.js","/assets/Tooltip-Du53oTUq.js","/assets/TrendChart-4HkkgPJC.js","/assets/TripleSpeedometer-BAMGtK48.js","/assets/Trudoyomkost-aERI5FQ3.js","/assets/Turnover-Cow9bV_c.js","/assets/UploadDropzone-CW4LOH-h.js","/assets/UsersActivity-Cwi0KCmV.js","/assets/VerdictBlock-CkQ0YGTr.js","/assets/VfxApiMap-Dmy3QqSy.js","/assets/VfxDictionaries-BM1aPOu9.js","/assets/VfxEmployees-7f_pGIPm.js","/assets/VfxHrMoves-DWtUONDB.js","/assets/VfxJobs-Bz2NhTek.js","/assets/VfxPhoto-Cwagp_2m.js","/assets/VfxShifts-C9DfJonU.js","/assets/VfxState-BEo0kF-D.js","/assets/VfxTimebooks-BSzRAd1h.js","/assets/VfxTimesheet-Ct1Yq_0V.js","/assets/WatchProgress-DkIZbdqQ.js","/assets/WebLogin-BTgvJ7tC.js","/assets/WorkerConcerns-BEt8NDiR.js","/assets/Workers-DUW3ncgd.js","/assets/Zagruzka-Ddq629Ed.js","/assets/ZagruzkaCell-DsqBZWvO.js","/assets/api-CQUtQokb.js","/assets/archive-CNkadyxd.js","/assets/archive-restore-BfZxrJn1.js","/assets/arrow-down-BeAUbAMh.js","/assets/arrow-down-wide-narrow-D9yXh2_Q.js","/assets/arrow-up-narrow-wide-BuaAnFTv.js","/assets/award-MsxYNwVV.js","/assets/ban-5bS0VeJe.js","/assets/boxes-BuZE0002.js","/assets/braces-DCboJ4eg.js","/assets/brigadirFilters-Ds88hdVq.js","/assets/broadcastTree-DDtvDQe5.js","/assets/building-2-7yX93fU3.js","/assets/calculator-DJBsK6rC.js","/assets/calendar-DPtbRsSA.js","/assets/calendar-days-CXA2B1Rx.js","/assets/camera-NfWIeOoL.js","/assets/categories-Cl6pleU1.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-Du-cAlkT.js","/assets/chart-line-Br8VWusM.js","/assets/chart-pie-QM2XEB5m.js","/assets/chartRange-DEDBRnNI.js","/assets/check-check-Dr-884aw.js","/assets/chevron-left-CQWTxr83.js","/assets/chevrons-up-down-9Hyxln3Z.js","/assets/circle-BVPOWSHP.js","/assets/circle-alert-ZBXzNMfu.js","/assets/circle-check-big-opIOeuG4.js","/assets/circle-dashed-CcQ996iH.js","/assets/circle-minus-Bz9mjJy9.js","/assets/circle-question-mark-Bb42Cqy3.js","/assets/circle-slash-xs_gpPD-.js","/assets/circle-user-round-BRgJIqv3.js","/assets/clock-3-VYyPvROs.js","/assets/cloud-off-BuFmQSVU.js","/assets/cloud-upload-CQ3AP0GX.js","/assets/compass-DpWggS_o.js","/assets/concernCategories-DUi8eG5P.js","/assets/copy-8t82yxUQ.js","/assets/corner-down-right-Cl1Ce0xP.js","/assets/createLucideIcon-DBYfTiPC.js","/assets/es-CW0RUbpW.js","/assets/external-link-C58i5Txa.js","/assets/file-clock-CSX5WwhO.js","/assets/file-exclamation-point--hStVaDz.js","/assets/flag-CCya9jRJ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-C_clI8Sy.js","/assets/hash-BRqEejpm.js","/assets/hourglass-DSFsJCf6.js","/assets/image-BAV6JAi-.js","/assets/image-off-BmpBzesV.js","/assets/inbox-B2Zm_MtX.js","/assets/index-DFfGVOG_.css","/assets/index-DvnDPMyt.js","/assets/keyboard-B_jVpP_j.js","/assets/languages-CXpbxyZ2.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-Dw0-_q0c.js","/assets/lightbulb-q49o6-22.js","/assets/link-2-C6d4WR5u.js","/assets/link-2-off-DGUPz5LI.js","/assets/list-ordered-WLkDFAVo.js","/assets/list-tree-DyvQmDT1.js","/assets/lock-open-w10jF4YO.js","/assets/log-in-B5jz49nX.js","/assets/minimize-2-DOOFDYxH.js","/assets/package-check-DDOeQfuV.js","/assets/pencil-DkeyHusl.js","/assets/percent-Car3_a-j.js","/assets/pin-CApkgdH4.js","/assets/pin-off-CRAyGYg_.js","/assets/play-Fc54rZGa.js","/assets/plug-zap-BUtvCSvR.js","/assets/prop-types-CyohVjDv.js","/assets/radio-CzkB2FfX.js","/assets/react-apexcharts.esm-CoaFA9xj.js","/assets/registers-D8JGb1TD.js","/assets/repeat-GutHCshr.js","/assets/save-DbqigFS5.js","/assets/scopeLinks-CfnwjB3i.js","/assets/scroll-text-DMdEUW0P.js","/assets/search-x-CK0J022X.js","/assets/segments-DdOFFIQN.js","/assets/send-Crw4ac6R.js","/assets/settings-2-Bx2qzj4y.js","/assets/shield-BOtJLZLk.js","/assets/shield-alert-CW-jK_Y7.js","/assets/shield-question-mark-CodYVitz.js","/assets/siren-BFaEoRLV.js","/assets/snowflake-CjhOncB7.js","/assets/split-Cqk44bgH.js","/assets/square-check-big-UhW_KGxt.js","/assets/star-XoK8EzMz.js","/assets/statusBands-DAeQ0tPv.js","/assets/store-DEoipCZW.js","/assets/table-2-SgAV8Bim.js","/assets/table-properties-D4Pw9sP0.js","/assets/tag-Bbsf0FGE.js","/assets/timer-off-CeinKZXn.js","/assets/trending-down-KHfbHNak.js","/assets/trending-up-DNpEKJ73.js","/assets/undo-2-Z76MG6YC.js","/assets/useChartTheme-CX0RIRhK.js","/assets/useElementWidth-Bgctf88z.js","/assets/useIsMobile-BbLmiAp9.js","/assets/useOpenParam-DFqKkZdZ.js","/assets/useStatusBands-71lPVgby.js","/assets/useUrlScope-DfBfl_z7.js","/assets/user-DM8DGnJk.js","/assets/user-cog-DV8mdYOM.js","/assets/users-ys4MJEdz.js","/assets/vfx-gz8TCRXN.js","/assets/video-DXYtRlBZ.js","/assets/wallet-Bry5UIPT.js","/assets/warehouse-CXuup8K0.js","/assets/x-DMjw8kPe.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
