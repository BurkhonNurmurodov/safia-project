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

const BUILD = "2026-10-12T05:36:03.635Z";
const PRECACHE = ["/","/assets/AdminPanel-DlEG4hAf.js","/assets/AnalysisBoard-CGGX_LAx.js","/assets/Arc-CB3qz0OT.js","/assets/Assistant-TKS4_Zuz.js","/assets/BrigadirProfile-p0mR6iGi.js","/assets/BroadcastReceivers-DTUHksJb.js","/assets/BroadcastRecord-CAXuRgHl.js","/assets/Button-DYXcqy3P.js","/assets/CatLockNotice-DH3zgxe9.js","/assets/CategoryLegendModal-BqoHmOAp.js","/assets/CellConcerns-CZQCXbC7.js","/assets/CellDetails-RAPm8Pnj.js","/assets/CellFormModal-Bd4BmQXz.js","/assets/CellIdent-kdyzMw9k.js","/assets/CellLink-BnSUXhXI.js","/assets/Cells-ujlv1MGJ.js","/assets/ColumnFilter-BqL5radU.js","/assets/ColumnsPicker-CVaN8uJC.js","/assets/CommentsModal-CYYzsvbX.js","/assets/ComparisonTable-Bb2x38l5.js","/assets/Concerns-CfI-39_i.js","/assets/Daily-CxGZ1dV2.js","/assets/DataTable-vcQeSxRu.js","/assets/DateRangePicker-Dn7dirUV.js","/assets/DayReportView-B_urQc1k.js","/assets/DayStepper-BT_kaRvd.js","/assets/DifferenceBreakdown-Dn-2Q_WJ.js","/assets/Downtime-CBulgvGf.js","/assets/Education-D820NxFD.js","/assets/EducationLesson-D2-3dSyi.js","/assets/EmptyState-B5lvmaYT.js","/assets/Exam-DnvsyhIA.js","/assets/FactorySelect-BuUD6MZj.js","/assets/Gamification-CxxX0Fzz.js","/assets/GroupBadge-BpXKoGpQ.js","/assets/HeatmapChart-zbB-3_wZ.js","/assets/IdleCell-DGv1wI8d.js","/assets/KPICard-BUt894CM.js","/assets/Kaizen-8ptOP1dE.js","/assets/Kelish-C1jJ3meh.js","/assets/KpiDeltaCard-DeC2IEoz.js","/assets/LangTextInput-CW8H7mp9.js","/assets/Layout-Ctk75hpC.js","/assets/LeaderAppeal-DNObiPrE.js","/assets/LeaderDayReport-B9Vcb-Z2.js","/assets/LeaderUnitReport-CKkGvL9r.js","/assets/Leaderboard-Dpj7Jcg3.js","/assets/Leaders-DtIixXYB.js","/assets/Lightbox-DlvfX7A0.js","/assets/LiveOverview-DjA8RUXK.js","/assets/Login-DpaF4gbu.js","/assets/NotFound-Dpx-TEpG.js","/assets/Notifications-DtTMUcAZ.js","/assets/Overview-BoVpwd93.js","/assets/Pagination-CVVDkS5-.js","/assets/PerenaladkaFactTable-Br0kJfY8.js","/assets/PersonCard-DRvR_Dky.js","/assets/PlanFulfillment-CLB_Hi4J.js","/assets/Production-DPIiRl-x.js","/assets/Profile-B-gFV212.js","/assets/ProofCamera-BTRTRps2.js","/assets/ProofPhoto-D6tj9pml.js","/assets/Quality-DfTEO_uy.js","/assets/RawRows-VtWTK_hp.js","/assets/RequestStateChip-sHiwf_83.js","/assets/RichTextEditor-DgR7DAEc.js","/assets/SaveState-CZA_eGjE.js","/assets/SearchInput-B9KFG96R.js","/assets/SeasonalityHeatmap-eTDtUYbm.js","/assets/SegmentedToggle-7_I0UIQl.js","/assets/SetupTimes-DQWyqsNE.js","/assets/ShiftDaily-wr4wdPR9.js","/assets/Staff-BVfLu6tq.js","/assets/StatusBadge-B4FWq0ZS.js","/assets/TargetGoal--W0IBVGr.js","/assets/Targets-9zzDqNaS.js","/assets/Tasks-B2IJyAx8.js","/assets/TimeWheelPicker-DrjQKPDb.js","/assets/Toast-DROe7x8k.js","/assets/Tooltip-C1n89Moa.js","/assets/TrendChart-D7HcGi3f.js","/assets/TripleSpeedometer-BIK_UAbv.js","/assets/Trudoyomkost-DTxwR5LD.js","/assets/Turnover-6soAMHGL.js","/assets/UploadDropzone-CvXJPpzA.js","/assets/UsersActivity-D2y8rfb6.js","/assets/VerdictBlock-BxGSaZQH.js","/assets/VfxApiMap-BLq47Vkx.js","/assets/VfxDictionaries-DfQzgukG.js","/assets/VfxEmployees-BL5nRk88.js","/assets/VfxHrMoves-Cs3WVfKv.js","/assets/VfxJobs-CIpqyvtq.js","/assets/VfxPhoto-CXf_1Rch.js","/assets/VfxShifts-D5MRcD9p.js","/assets/VfxState-3q0i0b2h.js","/assets/VfxTimebooks-sKE26ZeP.js","/assets/VfxTimesheet-DYfad_VT.js","/assets/WatchProgress-DV0rM3BX.js","/assets/WebLogin-D58NDot9.js","/assets/WorkerConcerns-DpFgZwDe.js","/assets/Workers-RAg4__PO.js","/assets/Zagruzka-iBU4uLJH.js","/assets/ZagruzkaCell-DoTntGvF.js","/assets/api-BEFi7CAH.js","/assets/archive-C4eP0rwA.js","/assets/archive-restore-Kw6V_bUP.js","/assets/arrow-down-H-U1OTUZ.js","/assets/arrow-down-wide-narrow-BzjEvISQ.js","/assets/arrow-up-narrow-wide-B2sjkxhX.js","/assets/award-BuAhOIHc.js","/assets/ban-BE2pDxGa.js","/assets/boxes-Dacm4Njo.js","/assets/braces-CSFBZRY6.js","/assets/brigadirFilters-88Qx_qf4.js","/assets/broadcastTree-DH39O_yF.js","/assets/building-2-BOvTcN-V.js","/assets/calculator-z3cjqmAJ.js","/assets/calendar-DARPsivA.js","/assets/calendar-days-DOcIPBLs.js","/assets/camera-VcOA5ht3.js","/assets/categories-kfdUeV22.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-DEC7hIwi.js","/assets/chart-line-DwOqN05Y.js","/assets/chart-pie-C8CRDSEx.js","/assets/chartRange-Cic-l5S5.js","/assets/check-check-20Gl538T.js","/assets/chevron-left-D4XPRRNM.js","/assets/chevrons-up-down-BRetJTk2.js","/assets/circle-BNS0Gbkh.js","/assets/circle-alert-BPfEbVSh.js","/assets/circle-check-big-Lm-dK6r6.js","/assets/circle-dashed-CNxkZoRl.js","/assets/circle-minus-DKjMw1EQ.js","/assets/circle-question-mark-rpABIVY-.js","/assets/circle-slash-BhHSJNw4.js","/assets/circle-user-round-B-wp44yY.js","/assets/clock-3-3NntfMZr.js","/assets/cloud-off-CoEAmDxg.js","/assets/cloud-upload-DgyRWCB7.js","/assets/compass-DgL_8UNT.js","/assets/concernCategories-B8L623Y2.js","/assets/copy-DpP3XGOs.js","/assets/corner-down-right-DIis9Lq1.js","/assets/createLucideIcon-Cc4AUy98.js","/assets/es-HabQqgOG.js","/assets/external-link-C22uP4hS.js","/assets/file-clock-AzdjJWYi.js","/assets/file-exclamation-point-PHzuF533.js","/assets/flag-Bv9R7d84.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BfF3QGZG.js","/assets/hash-BVi8uK9H.js","/assets/hourglass-B20OCIlw.js","/assets/image-D8IZfAFP.js","/assets/image-off-D68Myxwh.js","/assets/inbox-Bn0FXp9u.js","/assets/index-C4SvDEN9.js","/assets/index-CZpO2q3C.css","/assets/keyboard-CpNfASp1.js","/assets/languages-CEE3gL_U.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-D2OzWWMg.js","/assets/lightbulb-Dta2cDOm.js","/assets/link-2-Fpjll0AU.js","/assets/link-2-off-HzsrNt4U.js","/assets/list-ordered-C1ZYwAEG.js","/assets/list-tree-tsaXUEoE.js","/assets/lock-open-CGwd14ja.js","/assets/log-in-DlWQKEqA.js","/assets/minimize-2-CcCREUcE.js","/assets/package-check-ChpSz18B.js","/assets/pencil-BHR2IuLJ.js","/assets/percent-Ci9O2odF.js","/assets/pin-Clm-jErN.js","/assets/pin-off-CPPaZWfv.js","/assets/play-itzpnMqq.js","/assets/plug-zap-DllFeSn1.js","/assets/prop-types-CFpHAfXD.js","/assets/radio-BzrOb_98.js","/assets/react-apexcharts.esm-Bp_cgqVO.js","/assets/registers-BOKv_iLF.js","/assets/repeat-DmMWOcqW.js","/assets/save-M9PqKPHj.js","/assets/scopeLinks-CYFF3DrS.js","/assets/scroll-text-BGh8wOYw.js","/assets/search-x-8ZPyhm1R.js","/assets/segments-Ckq3_QXj.js","/assets/send-C1Ao8ZT9.js","/assets/settings-2-CtHWgbYi.js","/assets/shield-DGU2rCAU.js","/assets/shield-alert-Cqh5X7oM.js","/assets/shield-question-mark-ePXWhetZ.js","/assets/siren-Bdz1ymAn.js","/assets/snowflake-DZiLglLq.js","/assets/split-Byvt8CeT.js","/assets/square-check-big-6COK0JRo.js","/assets/star-B14kaai_.js","/assets/statusBands-DDpjvuBK.js","/assets/store-BeWJ5PF4.js","/assets/table-2-CnRyF71-.js","/assets/table-properties-DD0kSTKn.js","/assets/tag-Js6Ir1Td.js","/assets/timer-off-B9oQ2hGu.js","/assets/trending-down-D1-2VhXg.js","/assets/trending-up-DUHVnZqC.js","/assets/undo-2-DG1Zta8b.js","/assets/useChartTheme-Dsz3SNkZ.js","/assets/useElementWidth-D4UM5Gjy.js","/assets/useIsMobile-CUm12Dh5.js","/assets/useOpenParam-Cs5sUcvg.js","/assets/useStatusBands-CdZ8siMu.js","/assets/useUrlScope-OCOLutjJ.js","/assets/user-D4-jOvmU.js","/assets/user-cog-B28v8z8o.js","/assets/users-sG81gVXS.js","/assets/vfx-Bg1GiBCm.js","/assets/video-BJIFMBJK.js","/assets/wallet-DYbqCSCD.js","/assets/warehouse-Busw_3en.js","/assets/workflow-C2Mcdkma.js","/assets/x-B1gHO4fM.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
