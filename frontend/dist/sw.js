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

const BUILD = "2026-10-02T09:55:22.527Z";
const PRECACHE = ["/","/assets/AdminPanel-Clgsmqi8.js","/assets/AnalysisBoard-DO3YCbd2.js","/assets/Arc-yN90ACTR.js","/assets/ArcLegacy-3Xb35chd.js","/assets/BrigadirProfile-Dux8i9A8.js","/assets/BroadcastReceivers-DyBFoj4n.js","/assets/BroadcastRecord-BCsYnu4C.js","/assets/CatLockNotice-NqO2yEnb.js","/assets/CategoryLegendModal-CKDkovPN.js","/assets/CellConcerns-DcSsG4ye.js","/assets/CellDetails-BQjtm0nX.js","/assets/CellFormModal-DIyRw40B.js","/assets/CellIdent-DNJWE_4q.js","/assets/CellLink-C5WEy8z4.js","/assets/Cells-DfDch9zP.js","/assets/ColumnFilter-B7mAwwKT.js","/assets/ColumnsPicker-CdtxgmSE.js","/assets/CommentsModal-UUqTBGM8.js","/assets/ComparisonTable-mj8sW4NF.js","/assets/Concerns-BmKrodsi.js","/assets/ConfirmDialog-DDghjY8o.js","/assets/Daily-BNs6smu5.js","/assets/DataTable-CkOlBBDV.js","/assets/DateRangePicker-ByT1Zp38.js","/assets/DayReportView-D_psddUU.js","/assets/DayStepper-CDuNMusj.js","/assets/DifferenceBreakdown-BOOoskNR.js","/assets/Downtime-0NRdGq2G.js","/assets/Education-C1fX3s63.js","/assets/EducationLesson-Dpnvb8af.js","/assets/EmptyState-CGED3R-s.js","/assets/Exam-DL3tQFuA.js","/assets/FactorySelect-DVMApG0w.js","/assets/Gamification-DpnVdgMz.js","/assets/GroupBadge-Dge2EMUH.js","/assets/HeatmapChart-RiQthio-.js","/assets/IdleCell-CMVPJHS8.js","/assets/KPICard-Cp2MUS_2.js","/assets/Kaizen-BVboYuqD.js","/assets/Kelish-CAXKiH4H.js","/assets/KpiDeltaCard-B4Mehr7E.js","/assets/LangTextInput-DSebjUCp.js","/assets/Layout-SrMAk9Kt.js","/assets/LeaderAppeal-Cenu2DCe.js","/assets/LeaderDayReport-AIJjDDXo.js","/assets/LeaderUnitReport-BzOxR2E5.js","/assets/Leaderboard-C82_n2_q.js","/assets/Leaders-ifnI7wFI.js","/assets/Lightbox-BiNcds4f.js","/assets/LiveOverview-Dwi2w2TA.js","/assets/Login-Dx8fR_yA.js","/assets/NotFound-wqCqVcSw.js","/assets/Notifications-EPQozDGR.js","/assets/Overview-vEOpxwgw.js","/assets/Pagination-B8IbZ6fM.js","/assets/PerenaladkaFactTable-W0VDadvV.js","/assets/PlanFulfillment-DUFoSEIx.js","/assets/Production-DDGbtgZq.js","/assets/Profile-LLcnJEGj.js","/assets/ProofCamera-wotNd2nO.js","/assets/ProofPhoto-CfaWpa0b.js","/assets/Quality-DQOdmRPX.js","/assets/RequestStateChip-DEIi8bFY.js","/assets/RichTextEditor-B7J6gU-E.js","/assets/SaveState-CQ1M98tH.js","/assets/SearchInput-NSWc7rmc.js","/assets/SeasonalityHeatmap-C7ffEQ8Z.js","/assets/SegmentedToggle-COgBfl9t.js","/assets/SetupTimes-DFbWyCRh.js","/assets/ShiftDaily-D2DRfyhn.js","/assets/Staff-CE7lma00.js","/assets/StaffLive-C66Q9Y7q.js","/assets/StatusBadge-DV9oogHV.js","/assets/TargetGoal-CfcwPdeK.js","/assets/Targets-yp8o5uHA.js","/assets/Tasks-BlhfIGrD.js","/assets/TimeWheelPicker-B5yRyWkS.js","/assets/Toast-DpQW4zI8.js","/assets/Tooltip-DCLzYu9e.js","/assets/TrendChart-eOiIXr6X.js","/assets/TripleSpeedometer-0JzuA_39.js","/assets/Trudoyomkost-DIuLvKpj.js","/assets/UploadDropzone-D0iN19ry.js","/assets/UsersActivity-TdjprR_q.js","/assets/VerdictBlock-Bgc9X_t1.js","/assets/WatchProgress-8dy233lW.js","/assets/WebLogin-m7pRT4r7.js","/assets/WorkerConcerns-DLd0XkUy.js","/assets/Workers-oBar2KnM.js","/assets/Zagruzka-BzGOkAgm.js","/assets/ZagruzkaCell-CmmDIdxs.js","/assets/api-q_2_iJcn.js","/assets/archive-D3LpfxXs.js","/assets/archive-restore-DEzCpc8W.js","/assets/arrow-down-DaZ_0_t_.js","/assets/arrow-left-CNavYu-H.js","/assets/arrow-right-left-CCl6VfXl.js","/assets/arrow-up-BdPPQ5Mz.js","/assets/arrow-up-narrow-wide-BcpHtjmI.js","/assets/arrow-up-right-C0Eo4a2h.js","/assets/award-CqA47g_o.js","/assets/ban-Ceane2hi.js","/assets/bot-DZ1IYi8X.js","/assets/boxes-Cvkp4_7Z.js","/assets/brigadirFilters-DjWzD_zL.js","/assets/broadcastTree-e-Muuz3A.js","/assets/building-2-CsCEyX0U.js","/assets/calendar-days-B8KAJRS8.js","/assets/calendar-e59ivJHR.js","/assets/calendar-range-8JMpnPyW.js","/assets/camera-mf0G5Y-F.js","/assets/categories-pxthHpv0.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DeoAJjWt.js","/assets/chart-line-CcUp-1Ji.js","/assets/chart-pie-DRo8Jsa-.js","/assets/chartRange-BO-1_Ylc.js","/assets/chevron-left-CDjKqOzw.js","/assets/chevrons-up-down-C-Zr-euR.js","/assets/circle-alert-DFIDGmVs.js","/assets/circle-check-big-BJaWQstd.js","/assets/circle-hHribboS.js","/assets/circle-minus-DtXyoltJ.js","/assets/circle-question-mark-Bi0wl2mB.js","/assets/circle-slash-CP-tTOL7.js","/assets/circle-user-round-ub6dJm6l.js","/assets/cloud-off-Cr_V1-F2.js","/assets/cloud-upload-B9vIAybx.js","/assets/compass-9m7o8E9k.js","/assets/concernCategories-D9_niZul.js","/assets/copy-Bas8ZRgq.js","/assets/corner-down-right-Dt9wxIo_.js","/assets/createLucideIcon-CtfNwMje.js","/assets/es-BMI5cMqd.js","/assets/exportXlsx-ClPu1zt2.js","/assets/external-link-ukh7iPF3.js","/assets/file-clock-CTF-opzh.js","/assets/file-exclamation-point-B_jsFjpT.js","/assets/file-spreadsheet-BjqAvuNj.js","/assets/file-text-B4TppiD2.js","/assets/flag-ZB6YbrRA.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-FAzpBh03.js","/assets/hash-BIFk73zP.js","/assets/history-ChR171W3.js","/assets/hourglass-DE0_-OUI.js","/assets/id-card-D2reY4v0.js","/assets/image-DCiwkeJR.js","/assets/image-off--4H58XE1.js","/assets/inbox-Dmmf26ju.js","/assets/index-50ERQB6y.js","/assets/index-bv1wZ_fI.css","/assets/key-round-U1Kb8R7h.js","/assets/keyboard-BCNPYxI7.js","/assets/languages-DUQfM_Ah.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-p9ywsLbf.js","/assets/lightbulb-CmWLQjBy.js","/assets/link-2--6kyWlMd.js","/assets/link-2-off-BgOYTSri.js","/assets/list-ordered-Dc_yUY-h.js","/assets/list-tree-BBvZKVpu.js","/assets/lock-open-D8p41lE7.js","/assets/log-in-_IdIEGk1.js","/assets/maximize-2-BHEk5I_S.js","/assets/message-square-C5Qnah59.js","/assets/minimize-2-BquFrrgp.js","/assets/package-check-CwwH3RM1.js","/assets/paperclip-BBkUqYfp.js","/assets/pencil-BoPqLSmw.js","/assets/percent-CL09Aly1.js","/assets/pin-I2LRlzTe.js","/assets/pin-off-DAPoFq8e.js","/assets/play-Crfs--fc.js","/assets/plug-zap-B-7lCt0J.js","/assets/presentation-CkdNttnF.js","/assets/prop-types-tMPvA085.js","/assets/radio-CK9_Sm7N.js","/assets/react-apexcharts.esm-PTs5nUR-.js","/assets/repeat-FAaP8WIE.js","/assets/rotate-ccw-DCT3iZzf.js","/assets/rotate-cw-BD5Gtdq0.js","/assets/save-C2T9Lssa.js","/assets/scopeLinks-B7Iwa7qk.js","/assets/scroll-text-BqMH5gmw.js","/assets/search-x-CxZLluxU.js","/assets/segments-CehLZK8Q.js","/assets/send-zVd5KCcv.js","/assets/settings-2-D71JK1ar.js","/assets/shield-C3L9kSs4.js","/assets/shield-alert-E8YYnvRw.js","/assets/shield-check-DoiUtl3q.js","/assets/shield-question-mark-BR_wEWGh.js","/assets/siren-mY5d82hm.js","/assets/snowflake-Co8BBtHV.js","/assets/split-BElqCfs4.js","/assets/square-6ztzc8gb.js","/assets/square-check-big-lfcwNYgT.js","/assets/star-D5fiah4J.js","/assets/statusBands-BJb9f4Hp.js","/assets/store-Dz5gOEDL.js","/assets/table-2-9ApGyE42.js","/assets/table-properties-DSNe0aOn.js","/assets/tag-3M_smCn1.js","/assets/timer-off-CkUemy-U.js","/assets/trending-down-BLndC5Kx.js","/assets/trending-up-Ue48mB7A.js","/assets/undo-2-CFmA_fgh.js","/assets/useChartTheme-D5VK0X1i.js","/assets/useElementWidth-B9sVSEvF.js","/assets/useIsMobile-BzJXmO_t.js","/assets/useOpenParam-Cnd9ux--.js","/assets/useStatusBands-CfHQ7eCu.js","/assets/useUrlScope-CKP5CoTB.js","/assets/user-YJ5rbdwI.js","/assets/user-cog-BxzSuzso.js","/assets/user-minus-tiEK1GmX.js","/assets/users-bk7Imt_Q.js","/assets/video-B5cwtDPu.js","/assets/wallet-ByC_P-RV.js","/assets/warehouse-_fbqLX6D.js","/assets/x-CvTitmjs.js","/assets/zap-DNY7_eqw.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
