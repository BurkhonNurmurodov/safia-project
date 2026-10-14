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

const BUILD = "2026-10-14T17:41:19.415Z";
const PRECACHE = ["/","/assets/AdminPanel-OsqDeA09.js","/assets/AnalysisBoard-BZ1aNm-7.js","/assets/Arc-DqccCHef.js","/assets/Assistant-D-WwclPF.js","/assets/BrigadirProfile-CM6iaGDI.js","/assets/BroadcastReceivers-DuRdl2KF.js","/assets/BroadcastRecord-CJ01-9kn.js","/assets/Button-Pjs8h76u.js","/assets/CatLockNotice-DygJnIpX.js","/assets/CategoryLegendModal-ACjyoeBT.js","/assets/CellConcerns-CQSLCO-5.js","/assets/CellDetails-ZMwdzC9X.js","/assets/CellFormModal-BSr3EkDe.js","/assets/CellIdent-BtD62TQN.js","/assets/CellLink-Ccfka_Bc.js","/assets/Cells-C0Z7uRZu.js","/assets/ColumnFilter-Ob9db8O7.js","/assets/ColumnsPicker-0253_ggB.js","/assets/CommentsModal-D15eFy-M.js","/assets/ComparisonTable-sNEHzpWz.js","/assets/Concerns-DNxoAalW.js","/assets/CountStepper-DT6jTj3F.js","/assets/Daily-iLelALEV.js","/assets/DataTable-qtxrAsNs.js","/assets/DateRangePicker-D45d3F3U.js","/assets/DayReportView-ps0Qtyhy.js","/assets/DayStepper-CDKZDrAg.js","/assets/DifferenceBreakdown-BScQZNlY.js","/assets/Downtime-DkDfjaRW.js","/assets/Education-DM05fVMI.js","/assets/EducationLesson-pcWEQmvV.js","/assets/EmptyState-DvmHUU3v.js","/assets/Exam-CFEFzsLK.js","/assets/FactorySelect-DM3raprY.js","/assets/Gamification-95i5idDY.js","/assets/GroupBadge-Cqawb_JR.js","/assets/HeatmapChart-DxmUoVz9.js","/assets/IdleCell-B6anFeYd.js","/assets/KPICard-Ds2o7rWq.js","/assets/Kaizen-OamGs0aL.js","/assets/Kelish-jlp618V4.js","/assets/KpiDeltaCard-CR52cPis.js","/assets/LangTextInput-DPCldRH1.js","/assets/Layout-C0c-2Gcm.js","/assets/LeaderAppeal-PH25-3y7.js","/assets/LeaderDayReport-BlFRJsWG.js","/assets/LeaderUnitReport-B8eRJWkj.js","/assets/Leaderboard-BY4GpD2T.js","/assets/Leaders-CPRCxgBL.js","/assets/Lightbox-CbkIizl0.js","/assets/LiveOverview-CMdR6Cip.js","/assets/Login-Dp81q2Sx.js","/assets/NotFound-Dcur91WV.js","/assets/Notifications-Dc5K5F20.js","/assets/Overview-DFGz_mES.js","/assets/Pagination-tY68pYN1.js","/assets/PerenaladkaFactTable-CZjK6ndh.js","/assets/PersonCard-53h3evtN.js","/assets/PlanFulfillment-BQ6idSgr.js","/assets/Production-k3e6ZcVt.js","/assets/Profile-DJtpkJ9u.js","/assets/ProofCamera-DcedqTQg.js","/assets/Quality-Q0J7nw6q.js","/assets/RawRows-BpwXlE0o.js","/assets/RequestStateChip-B6lnGjlT.js","/assets/RichTextEditor-DBS-8DGk.js","/assets/SaveState-ziHPp0gu.js","/assets/SearchInput-CQPl9FqY.js","/assets/SeasonalityHeatmap-t91zl5sW.js","/assets/SegmentedToggle-4ltvnCfi.js","/assets/SetupTimes-Hd_bvDO_.js","/assets/ShiftDaily-BbTq6Ayl.js","/assets/Staff-DzzRlXNt.js","/assets/StaffListAtCheck-CpTp6RnL.js","/assets/StatusBadge-0sf4heQD.js","/assets/TargetGoal-CRmfoBFE.js","/assets/Targets-o6qMm43H.js","/assets/Tasks-B4LrT6dR.js","/assets/TimeWheelPicker-NKdV85oL.js","/assets/Toast-Cnn_dl3O.js","/assets/Tooltip-_-M35tUu.js","/assets/TrendChart-B-v5nwqM.js","/assets/TripleSpeedometer-CijUpRV7.js","/assets/Trudoyomkost-9-tuhpi6.js","/assets/Turnover-D0fFmQne.js","/assets/UploadDropzone-BVZ2Zkmg.js","/assets/UsersActivity-BfvkSQGp.js","/assets/VerdictBlock-CIjsADFM.js","/assets/VfxApiMap-Bwh2TRzz.js","/assets/VfxDictionaries-DcH3DSTP.js","/assets/VfxEmployees-DPdFIbFA.js","/assets/VfxHrMoves-Dglk7mLm.js","/assets/VfxJobs-Be63SxVg.js","/assets/VfxPhoto-CdYKSAFP.js","/assets/VfxShifts-DQd3oF4o.js","/assets/VfxState-CFrRJ-7P.js","/assets/VfxTimebooks-BuzFQZF1.js","/assets/VfxTimesheet-BJhdCJbr.js","/assets/WatchProgress-pPm6jQfw.js","/assets/WebLogin-BhzuXcBG.js","/assets/WorkerConcerns-CiULE0NX.js","/assets/Workers-DwLlstMC.js","/assets/Zagruzka-CbESEWdE.js","/assets/ZagruzkaCell-BEoOWAvy.js","/assets/api-egiY5mpV.js","/assets/archive-CzjuRrkF.js","/assets/archive-restore-7khNg8oO.js","/assets/arrow-down-DBY4vSE4.js","/assets/arrow-down-wide-narrow-BDDf6sGa.js","/assets/arrow-up-narrow-wide-DT-J-7v2.js","/assets/award-SDwpNVau.js","/assets/ban-DMCaCcgL.js","/assets/boxes-COszRX1k.js","/assets/braces-CZWWKjsM.js","/assets/brigadirFilters-CxcTIHP4.js","/assets/broadcastTree-BDE5-zqw.js","/assets/building-2-CinUGfwe.js","/assets/calculator-C1meDChW.js","/assets/calendar-B6cYx9F5.js","/assets/calendar-days-DuDi3jK7.js","/assets/camera-BIRNpnhP.js","/assets/categories-DKnZCk2t.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BW8t81ob.js","/assets/chart-line-Dg0wr-dR.js","/assets/chart-pie-BnfCe1-Z.js","/assets/chartRange-jhY_g6Qg.js","/assets/check-check-CPBFz8EQ.js","/assets/chevron-left-CZK2DXr0.js","/assets/chevrons-up-down-DDYY6xML.js","/assets/circle-RfJK0HFb.js","/assets/circle-alert-D5H9t2HX.js","/assets/circle-check-big-DY643k8l.js","/assets/circle-dashed-BGXIjx5c.js","/assets/circle-minus-Du5yRqsQ.js","/assets/circle-question-mark-BdGU4zvc.js","/assets/circle-slash-CTbCXviv.js","/assets/circle-user-round-s1yn44aZ.js","/assets/clock-3-BgyiJ9o5.js","/assets/cloud-off-G1PKQ9g3.js","/assets/cloud-upload-BoPN8WmG.js","/assets/compass-CX1iQVJO.js","/assets/concernCategories-B5-dFlWl.js","/assets/copy-fsNFo6vO.js","/assets/corner-down-right-B6VkEeQH.js","/assets/createLucideIcon-DrFp8nnt.js","/assets/es-d8YljK1e.js","/assets/external-link-DZvvL3UG.js","/assets/file-clock-OZOUiRxI.js","/assets/file-exclamation-point-42Nck9-E.js","/assets/flag-PCPBIx4s.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BOSzRim-.js","/assets/hash-Dtf8_V_v.js","/assets/hourglass-DVSH9Rm3.js","/assets/image-8u_8X_8Q.js","/assets/image-off-BOeLhD77.js","/assets/inbox-BijmcHrr.js","/assets/index-DcrhyH78.js","/assets/index-oN3ajqAx.css","/assets/keyboard-D-frw2ug.js","/assets/languages-DR_0MdD3.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-4UdtF3Wb.js","/assets/lightbulb-D-pmeJ7i.js","/assets/link-2-Add0qEGm.js","/assets/link-2-off-BlC18yI1.js","/assets/list-ordered-wvtgC0AT.js","/assets/list-tree-DtIsiH2k.js","/assets/lock-open-Bj4BAyvK.js","/assets/log-in-DHt0RCWs.js","/assets/marks-DKBbO5SP.js","/assets/minimize-2-oYaNET5p.js","/assets/package-check-DdS8cfh-.js","/assets/pencil-yMmeYaaZ.js","/assets/percent-BRIVsZvM.js","/assets/pin-Chce2i4o.js","/assets/pin-off-n9lOwiga.js","/assets/play-BaJy4-rm.js","/assets/plug-zap-B6Equk6G.js","/assets/prop-types-CfHsO2i6.js","/assets/radio-CnCHN4Da.js","/assets/react-apexcharts.esm-CAeX1tTo.js","/assets/registers-q0PpfOnn.js","/assets/repeat-BGBaSZ-B.js","/assets/save-D7Vkf-6l.js","/assets/scopeLinks-SAR1XPQq.js","/assets/scroll-text-BYbf3r6S.js","/assets/search-x-DXcNSTkP.js","/assets/segments-cOD_VXrR.js","/assets/send-Dq3b-8q5.js","/assets/settings-2-CmuePmwM.js","/assets/shield-DQENgRa7.js","/assets/shield-alert-DuJMRt5k.js","/assets/shield-question-mark-e2k4uAOP.js","/assets/siren-C2hSWqAp.js","/assets/snowflake-BTXAfV1p.js","/assets/split-Carr7G96.js","/assets/square-check-big-u3YlF6rO.js","/assets/star-BVGtWemD.js","/assets/statusBands-UKOINT1w.js","/assets/store-D_J1r-wm.js","/assets/table-2-Bae-Mj0U.js","/assets/table-properties-BRO1G_tW.js","/assets/tag-BFNt8odW.js","/assets/timer-off-Ds_e6lvd.js","/assets/trending-down-CUdjuB7y.js","/assets/trending-up-Cp6MEsNr.js","/assets/undo-2-DLpcLYR_.js","/assets/useChartTheme-VQEg6ycJ.js","/assets/useElementWidth-CZvDWDZ-.js","/assets/useIsMobile-BhDhOSKR.js","/assets/useOpenParam-6CsZaZq8.js","/assets/useStatusBands-DEb-xpog.js","/assets/useUrlScope-C9dLxXtE.js","/assets/user-C-NL8LqR.js","/assets/user-cog-COeykM30.js","/assets/users-WLQSUxjj.js","/assets/vfx-Db87oLDm.js","/assets/video-BcJuxGh3.js","/assets/wallet-zD5J9s-8.js","/assets/warehouse-BgNA9YgM.js","/assets/workflow-3wP6m-RS.js","/assets/x-CNhZr9p2.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
