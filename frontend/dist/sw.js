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

const BUILD = "2026-10-14T16:18:15.244Z";
const PRECACHE = ["/","/assets/AdminPanel-CkDvr-6Y.js","/assets/AnalysisBoard-DOn0J_Yo.js","/assets/Arc-XnfcHSAJ.js","/assets/Assistant-DEKWSXcr.js","/assets/BrigadirProfile-DNh1uhGP.js","/assets/BroadcastReceivers-DeSxkMwr.js","/assets/BroadcastRecord-tn_xIx0M.js","/assets/Button-DS0ICz12.js","/assets/CatLockNotice-CbVrq8XH.js","/assets/CategoryLegendModal-wnVnTd33.js","/assets/CellConcerns-CqsVp92z.js","/assets/CellDetails-CK7VkuMk.js","/assets/CellFormModal-CAdCwaiM.js","/assets/CellIdent-DHSA2VYX.js","/assets/CellLink-BWvS5FzS.js","/assets/Cells-CiReDNN6.js","/assets/ColumnFilter-DsmVUL-w.js","/assets/ColumnsPicker-BwsCoIZF.js","/assets/CommentsModal-CtQXgOey.js","/assets/ComparisonTable-CeDOCCtb.js","/assets/Concerns-CGpU4VnC.js","/assets/CountStepper-DH5maYGh.js","/assets/Daily-DpPOItoW.js","/assets/DataTable-DO_mqjqB.js","/assets/DateRangePicker-DGVkZ3bd.js","/assets/DayReportView-BtXCfiX2.js","/assets/DayStepper-D5nArImm.js","/assets/DifferenceBreakdown-BaYDkLaX.js","/assets/Downtime-C6o1Pv6A.js","/assets/Education-DpdUY6EI.js","/assets/EducationLesson-D3VQ4EKO.js","/assets/EmptyState-Bbod8DIZ.js","/assets/Exam-C5an1FuC.js","/assets/FactorySelect-CVq7yshJ.js","/assets/Gamification-HjQn1D0F.js","/assets/GroupBadge-DzRNBs0D.js","/assets/HeatmapChart-Da_4o_H2.js","/assets/IdleCell-CZszPBFm.js","/assets/KPICard-gHnk78Tw.js","/assets/Kaizen-B71VP0qF.js","/assets/Kelish-CYGfibBq.js","/assets/KpiDeltaCard-aB_-aflR.js","/assets/LangTextInput-DfU27VgU.js","/assets/Layout-BEvf4EMp.js","/assets/LeaderAppeal-DWZ7dDUW.js","/assets/LeaderDayReport-CTT4US7d.js","/assets/LeaderUnitReport-CsnTYFOv.js","/assets/Leaderboard-BcnhAZmM.js","/assets/Leaders-CAtvtbuC.js","/assets/Lightbox-BRvt4URu.js","/assets/LiveOverview-C5_Y75cB.js","/assets/Login-4HSDWmLh.js","/assets/NotFound-Drm-0HM2.js","/assets/Notifications-DFn2YyT8.js","/assets/Overview-BZti24c0.js","/assets/Pagination-CqphuhqR.js","/assets/PerenaladkaFactTable-BcbZduj9.js","/assets/PersonCard-Ci8dMWf4.js","/assets/PlanFulfillment-DMuAqfR8.js","/assets/Production-B7socqFm.js","/assets/Profile-DoenzbOH.js","/assets/ProofCamera-BGhSAGDP.js","/assets/Quality-Bpyp26eb.js","/assets/RawRows-DYC_NCIu.js","/assets/RequestStateChip-BljfEFVR.js","/assets/RichTextEditor-ql61NfU6.js","/assets/SaveState-C6aOrTYP.js","/assets/SearchInput-BGSHotBM.js","/assets/SeasonalityHeatmap-CApXvh6p.js","/assets/SegmentedToggle-CEWqiVX6.js","/assets/SetupTimes-pMFzlx0M.js","/assets/ShiftDaily-BIac_KR9.js","/assets/Staff-Bj72-5L2.js","/assets/StaffListAtCheck-CDhilBuM.js","/assets/StatusBadge-DLQMg-Lv.js","/assets/TargetGoal-DKw64R4E.js","/assets/Targets-CeD4UgC1.js","/assets/Tasks-CEEQaUjf.js","/assets/TimeWheelPicker-B3f8jXVb.js","/assets/Toast-CHs7SBCv.js","/assets/Tooltip-DK8dtNhk.js","/assets/TrendChart-CtdfpX0d.js","/assets/TripleSpeedometer-B8xLBdU7.js","/assets/Trudoyomkost-CGJ8YdLj.js","/assets/Turnover-B2tnOr2V.js","/assets/UploadDropzone-CRHupLn5.js","/assets/UsersActivity-9TjThtyv.js","/assets/VerdictBlock-ClL974Go.js","/assets/VfxApiMap-BedtJQoX.js","/assets/VfxDictionaries-Rg4_jbkY.js","/assets/VfxEmployees-BnNgA5e9.js","/assets/VfxHrMoves-BmIOAtjp.js","/assets/VfxJobs-BeU1RKxr.js","/assets/VfxPhoto-C0hvfftr.js","/assets/VfxShifts-D8zb4-AD.js","/assets/VfxState-DvzIhNEa.js","/assets/VfxTimebooks-B6k0uHig.js","/assets/VfxTimesheet-B6EfsviB.js","/assets/WatchProgress-B6pyZxDX.js","/assets/WebLogin-Dl1RE6FW.js","/assets/WorkerConcerns-qLCR5qmq.js","/assets/Workers-C1PY-jpo.js","/assets/Zagruzka-Dzr9qQHr.js","/assets/ZagruzkaCell-Wk0u3hCH.js","/assets/api-yzvq3Q12.js","/assets/archive-DMo1m5-y.js","/assets/archive-restore-DHVq-l-f.js","/assets/arrow-down-BRPBie_R.js","/assets/arrow-down-wide-narrow-f98U1g5X.js","/assets/arrow-up-narrow-wide-CmESWSf_.js","/assets/award-usogips-.js","/assets/ban-CsawIIB5.js","/assets/boxes-ChrBNMHV.js","/assets/braces-N4RSFA5K.js","/assets/brigadirFilters-v38AcFht.js","/assets/broadcastTree-DHa9mqrD.js","/assets/building-2-BPe0YL_V.js","/assets/calculator-B9Ct0fKP.js","/assets/calendar-days-SYBFmvI1.js","/assets/calendar-vR6MjAnD.js","/assets/camera-B7UL4ugI.js","/assets/categories-CCjkyC81.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DI04vkyC.js","/assets/chart-line-BpxkbUkU.js","/assets/chart-pie-BIVVadjm.js","/assets/chartRange-BdFyY9Gg.js","/assets/check-check-Cpu6sJVm.js","/assets/chevron-left-D1zNOaHb.js","/assets/chevrons-up-down-zJSoSfqq.js","/assets/circle-Cxf72Xes.js","/assets/circle-alert-CBjWBBLa.js","/assets/circle-check-big-BlIb_REe.js","/assets/circle-dashed-BsnlrokZ.js","/assets/circle-minus-zMNpS_X3.js","/assets/circle-question-mark-BsIoggAe.js","/assets/circle-slash-DYYpk9Nl.js","/assets/circle-user-round-wMpdDoes.js","/assets/clock-3-R7iOe2hN.js","/assets/cloud-off-3jN-Vlpa.js","/assets/cloud-upload-B-zTbuDA.js","/assets/compass-wUKa7GJr.js","/assets/concernCategories-DLuKuvT6.js","/assets/copy-DsXApSXj.js","/assets/corner-down-right-F9vVZL9v.js","/assets/createLucideIcon-Cr2P2xcp.js","/assets/es-Bn3FPYPU.js","/assets/external-link-CwBEbsyv.js","/assets/file-clock-DqvnFnK8.js","/assets/file-exclamation-point-HWP0pZC7.js","/assets/flag-usj2D7tJ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Ba7ACejT.js","/assets/hash-BbIlxiTp.js","/assets/hourglass-DgueeDcY.js","/assets/image-OBSzgyqI.js","/assets/image-off-DsX0lmku.js","/assets/inbox-DfTJzXjS.js","/assets/index-BoxRoxN5.js","/assets/index-DWCq5gUB.css","/assets/keyboard-BdxJKNa_.js","/assets/languages-DIfsMWZ9.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-nYe-pRC3.js","/assets/lightbulb-DhaoVcCn.js","/assets/link-2-DZN8dvRG.js","/assets/link-2-off-Dr8N0G4g.js","/assets/list-ordered-DQd6RnCc.js","/assets/list-tree-BAaTSn1g.js","/assets/lock-open-BvtMI3Ky.js","/assets/log-in-TkcP3MKs.js","/assets/marks-BHJAmPSw.js","/assets/minimize-2-CPzbIZ8g.js","/assets/package-check-u30e7ld0.js","/assets/pencil-Cyh93ML0.js","/assets/percent-c-KKqnZo.js","/assets/pin-Ck_KldzG.js","/assets/pin-off-DaCjxeUa.js","/assets/play-DEdLPtsO.js","/assets/plug-zap-DQgkX_uQ.js","/assets/prop-types-DESPOUrU.js","/assets/radio-DuXcqKmO.js","/assets/react-apexcharts.esm-CR9Rz5m-.js","/assets/registers-BwgOErvW.js","/assets/repeat-fvZ8aNA7.js","/assets/save-DxYoWaqV.js","/assets/scopeLinks-DM1XXHqn.js","/assets/scroll-text-BGwT35yI.js","/assets/search-x-QFnTwaJ0.js","/assets/segments-DWg82Hlp.js","/assets/send-Bn2C0aLs.js","/assets/settings-2-Bj1q5wQp.js","/assets/shield-Bet-DK7_.js","/assets/shield-alert-DQYgHrk_.js","/assets/shield-question-mark-DHxCgbqr.js","/assets/siren-7uX01pua.js","/assets/snowflake-Del6NjTN.js","/assets/split-BL2YwPGj.js","/assets/square-check-big-CiSJgGi1.js","/assets/star-BI5yMtOL.js","/assets/statusBands-CWi7k08E.js","/assets/store-w_ejBI13.js","/assets/table-2-BqvynpHA.js","/assets/table-properties-B_k1oNlI.js","/assets/tag-ywNQlD9I.js","/assets/timer-off-5_ov1Xnt.js","/assets/trending-down-CgBF2ZSz.js","/assets/trending-up-DvOT_UzK.js","/assets/undo-2-9QtmJNxz.js","/assets/useChartTheme-B-0YBdoT.js","/assets/useElementWidth-CRi-EU2i.js","/assets/useIsMobile-Dx_Xq0Mb.js","/assets/useOpenParam-dH7IApsx.js","/assets/useStatusBands-DId6X_lE.js","/assets/useUrlScope-DfLydsyt.js","/assets/user-Dq2BjN57.js","/assets/user-cog-DrOb8Ymq.js","/assets/users-Cbg8s6P6.js","/assets/vfx-Cd_uPc9z.js","/assets/video-ebwyqoUK.js","/assets/wallet-Bjdj7ghY.js","/assets/warehouse-BZZD1Ncw.js","/assets/workflow-dUrbO3cJ.js","/assets/x-DbQHb2vv.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
