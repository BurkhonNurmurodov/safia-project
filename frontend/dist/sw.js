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

const BUILD = "2026-10-21T11:17:30.619Z";
const PRECACHE = ["/","/assets/AdminPanel-Ce8UivgN.js","/assets/AnalysisBoard-D6ew6zV5.js","/assets/Arc-CMfPLVvV.js","/assets/Assistant-DuljdWuh.js","/assets/BrigadirProfile-DZ_V39pg.js","/assets/BroadcastReceivers-BK2e8uwl.js","/assets/BroadcastRecord-BnhldO3e.js","/assets/Button-CSGvdoNl.js","/assets/CatLockNotice-xUl2ug3j.js","/assets/CategoryLegendModal-BHDFdZw1.js","/assets/CellConcerns-qhy8KBcc.js","/assets/CellDetails-DoDDERbU.js","/assets/CellFormModal-K-2DpL1X.js","/assets/CellIdent-CXaKtLGa.js","/assets/CellLink-ymmWCddq.js","/assets/Cells-OVC9Pfcu.js","/assets/ColumnFilter-DrxVCMp_.js","/assets/ColumnsPicker-yTUvDyAh.js","/assets/CommentsModal-_BE2DuNd.js","/assets/ComparisonTable-C15IbyNW.js","/assets/Concerns-rxYoPqMk.js","/assets/CountStepper-Dc6-_V7-.js","/assets/Daily-CorI6V__.js","/assets/DataTable-DXFY_l3z.js","/assets/DateRangePicker-ycaYNBh9.js","/assets/DayReportView-CIQwMJjq.js","/assets/DayStepper-BHiO-CZc.js","/assets/DayStrip-C2S0guJI.js","/assets/DifferenceBreakdown-iCldMc1H.js","/assets/Downtime-Dd-j0rdn.js","/assets/Education-DtmOUpW9.js","/assets/EducationLesson-4yiF9Y1O.js","/assets/EmptyState-CxmS7gxp.js","/assets/Exam-YqsC0X6L.js","/assets/FactorySelect-j4V5Kf-E.js","/assets/Gamification-C0lI5QPS.js","/assets/GroupBadge-JJijYVCA.js","/assets/HeatmapChart-63WFnIdw.js","/assets/IdleCell-1LhSaJFv.js","/assets/KPICard-CZRX_i7E.js","/assets/Kaizen-D1bDFgGD.js","/assets/Kelish-BE7GFdRT.js","/assets/KpiDeltaCard-BIRvphmg.js","/assets/LangTextInput-BzTEiGKQ.js","/assets/Layout-CaY14R_2.js","/assets/LeaderAppeal-DztzCAHH.js","/assets/LeaderDayReport-Bche7_ve.js","/assets/LeaderUnitReport-BChoUMuF.js","/assets/Leaderboard-Rjz313nR.js","/assets/Leaders-D_KJzyWT.js","/assets/LeadersKpi-BzlRFJ4L.js","/assets/Lightbox-CbGa7yWG.js","/assets/LiveOverview-p24S-kIp.js","/assets/Login-B0cq9x5r.js","/assets/NotFound-YAXqlL6G.js","/assets/Notifications-D_TjWATE.js","/assets/Ontime-ENpxt_lX.js","/assets/Overview-B9K7HCDF.js","/assets/Pagination-Dr4PzfFR.js","/assets/PerenaladkaFactTable-CJBDqXJh.js","/assets/PersonCard-DF1yBRYF.js","/assets/PlanFulfillment-A8BybBMU.js","/assets/Production-D9iMbh6-.js","/assets/Profile-DtoreTEf.js","/assets/ProofCamera-X2uvgJII.js","/assets/ProofPhoto-D5FeAmbH.js","/assets/Quality-C2ee9F26.js","/assets/RawRows-DfHJTmS7.js","/assets/RequestStateChip-7bii9ZI3.js","/assets/RichTextEditor-BAtMmaxt.js","/assets/SaveState-DWfamM6A.js","/assets/SearchInput-BXShiGGv.js","/assets/SeasonalityHeatmap-WXzMPy-2.js","/assets/SegmentedToggle-C9S_2IPo.js","/assets/SetupTimes-B0gHYEhh.js","/assets/ShiftDaily-DlOL9eAF.js","/assets/Staff-DhRMBzSW.js","/assets/StaffListAtCheck-BhFDsEqb.js","/assets/StatusBadge-CGUsa1Tu.js","/assets/StatusBandsModal-Cs7owlZI.js","/assets/TargetGoal-DcteO2no.js","/assets/Targets-CEH-sc5q.js","/assets/Tasks-DMZVJAGt.js","/assets/TimeWheelPicker-CPUy5FP7.js","/assets/Toast-CfvSsST7.js","/assets/Tooltip-DNIyzcgJ.js","/assets/TrendChart-BCVmekFq.js","/assets/TripleSpeedometer-BdBj8dp7.js","/assets/Trudoyomkost-DtNRi24v.js","/assets/UploadDropzone-CBbpbQmI.js","/assets/UsersActivity-BghrUgg5.js","/assets/VerdictBlock-CjMLu4TJ.js","/assets/VfxApiMap-d-O1_IvQ.js","/assets/VfxDictionaries-BMzLFVfY.js","/assets/VfxEmployees-ikDgWbKv.js","/assets/VfxHrMoves-DCD9iUqN.js","/assets/VfxJobs-C1dOSV7P.js","/assets/VfxPhoto-DPJkkQ7Q.js","/assets/VfxShifts-DyLTUhj4.js","/assets/VfxState-F5m6Yf1z.js","/assets/VfxTimebooks-CtilL-vW.js","/assets/VfxTimesheet-ehGVT8-3.js","/assets/WatchProgress-EwChDCPG.js","/assets/WebLogin-Dr4KfQmd.js","/assets/Workers-Dplby7Dl.js","/assets/Zagruzka-BYVoZONK.js","/assets/ZagruzkaCell-C4dy5PlY.js","/assets/api-EKjN0eAu.js","/assets/archive-BrtOkf65.js","/assets/archive-restore-DkDDd3rd.js","/assets/arrow-down-DwhGI-8i.js","/assets/arrow-down-right-CryuuL4I.js","/assets/arrow-down-wide-narrow-BVfBSUVF.js","/assets/arrow-up-narrow-wide-C1ZvsW1l.js","/assets/ban-DXCk47W1.js","/assets/boxes-D_4_AiyK.js","/assets/braces-Dkiu35Uw.js","/assets/brigadirFilters-CWlek14w.js","/assets/broadcastTree-CbHhZhD-.js","/assets/building-2-98YK4pXZ.js","/assets/calendar-CnjMqxfd.js","/assets/calendar-days-ChgRkALJ.js","/assets/camera-Bkph9qAl.js","/assets/categories-BhjuCE-T.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-kF0Zlkgv.js","/assets/chart-line-D0KQGt9x.js","/assets/chart-pie-Cmb8X_6J.js","/assets/chartRange-CFu_WZdj.js","/assets/check-check-CyiJLX3_.js","/assets/chevron-left-uC_cx8v2.js","/assets/chevrons-up-down-AiZuIaMt.js","/assets/circle-CSUu4XQA.js","/assets/circle-alert-B5fKxrb8.js","/assets/circle-check-big-DmgwMBa5.js","/assets/circle-dashed-B41mKUFv.js","/assets/circle-minus-DxztpXj2.js","/assets/circle-question-mark-CEftfBTN.js","/assets/circle-slash-BFHf7G_4.js","/assets/circle-user-round-BMxnQ87A.js","/assets/cloud-off-Bg9Cr_l0.js","/assets/cloud-upload-CuilHG6p.js","/assets/compass-iomVgOcd.js","/assets/concernCategories-Bg28h8YA.js","/assets/corner-down-right-BTB4CTFD.js","/assets/createLucideIcon-CGuqhu9B.js","/assets/es-B82tvzcK.js","/assets/external-link-6FOR76xy.js","/assets/file-clock-E3FJSe2n.js","/assets/file-exclamation-point-BSj07hFx.js","/assets/flag-DotZPROV.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-BNqlSjd9.js","/assets/funnel-vTcfUsZ2.js","/assets/hash-WRdjYqGF.js","/assets/hourglass-BoosODNc.js","/assets/image-D57_Vaj4.js","/assets/image-off-CiG-prsk.js","/assets/inbox-D34XMdnv.js","/assets/index-BBwY_JxR.js","/assets/index-Ct9WqSVA.css","/assets/keyboard-DPsa2PCJ.js","/assets/languages-BIPKv8_u.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-c9e-EIOh.js","/assets/lightbulb-eSe4h2ui.js","/assets/link-2-DSCcnW1h.js","/assets/link-2-off-DazfZ0y1.js","/assets/list-ordered-CkZaIzxD.js","/assets/list-tree-Cyx7BZe4.js","/assets/lock-open-sVKk_C09.js","/assets/log-in-BRNnA4ac.js","/assets/marks-hQOHtgEF.js","/assets/minimize-2-CjJGNG0P.js","/assets/package-check-SY0AfueV.js","/assets/pencil-DXe2RMQZ.js","/assets/percent-AmTiueh1.js","/assets/pin-hqGtTh5D.js","/assets/pin-off-DLeRVU8g.js","/assets/play-C8PYpca8.js","/assets/plug-zap-BY6onfoV.js","/assets/prop-types-C5ZzMgJO.js","/assets/radio-DjYZ4dBw.js","/assets/react-apexcharts.esm-BmD0mQVW.js","/assets/registers-pCkWcpOV.js","/assets/repeat-z7eZ5js-.js","/assets/save-Dx0bVKi6.js","/assets/scopeLinks-BApp6mTF.js","/assets/scroll-text-CXFnRd2Y.js","/assets/search-x-CB5T2g70.js","/assets/segments-BOlllOLB.js","/assets/send-qMSCLGDH.js","/assets/settings-2-CVJJCiEf.js","/assets/shield-Bx55jyvJ.js","/assets/shield-alert-BS0Wewse.js","/assets/shield-question-mark-xS37_Syi.js","/assets/sigma-orXpBwgO.js","/assets/siren-DqTNfB1N.js","/assets/snowflake-BmX_Mzyp.js","/assets/split-Q_Zays2W.js","/assets/square-check-big-ChwoXtE9.js","/assets/star-IJszP-2Y.js","/assets/statusBands-BPgl_tyX.js","/assets/store-DamkjgIe.js","/assets/table-2-B8rdCJdm.js","/assets/table-properties-CZtnAiGE.js","/assets/tag-oYwqTlL9.js","/assets/timer-off-lzWa0Gzd.js","/assets/trendBuckets-DIaqSghV.js","/assets/trending-down-BxOTqRaZ.js","/assets/trending-up-CrEZvPL6.js","/assets/undo-2-DLFWA2Xy.js","/assets/useChartTheme-B308n1bH.js","/assets/useElementWidth-BC599iDR.js","/assets/useIsMobile-HLYo1_ve.js","/assets/useOpenParam-B_g-5nbs.js","/assets/useStatusBands-CPcMp0fq.js","/assets/useUrlScope-CtZgsHUV.js","/assets/user-DbW1RIl3.js","/assets/user-cog-D1J7TWfi.js","/assets/user-minus-Cq_faOrC.js","/assets/users-OjyW_gNR.js","/assets/vfx-C0oJ8oYP.js","/assets/video-B6zG2wrP.js","/assets/wallet-Bjwv76EK.js","/assets/warehouse-C0x_iYPu.js","/assets/workflow-BJCHPoPe.js","/assets/x-BiWXyL6a.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
