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

const BUILD = "2026-10-01T09:19:52.588Z";
const PRECACHE = ["/","/assets/AdminPanel-Cuf6_Uc7.js","/assets/AnalysisBoard-C9gAzfqQ.js","/assets/Arc-Dkls-Bli.js","/assets/ArcLegacy-DNM-p-8f.js","/assets/BrigadirProfile-C5lBn3G4.js","/assets/BroadcastReceivers-B7nu82zl.js","/assets/BroadcastRecord-CW_CFRvB.js","/assets/CatLockNotice-TyfM0qh4.js","/assets/CategoryLegendModal-CUIVzdB8.js","/assets/CellConcerns-3TVkROGb.js","/assets/CellDetails-DakcdWAZ.js","/assets/CellFormModal-DPdkbPAm.js","/assets/CellIdent-DOsbaKFc.js","/assets/CellLink-BAPd5v02.js","/assets/Cells-BZ-zuuGB.js","/assets/ColumnFilter-1-6T4iXb.js","/assets/ColumnsPicker-BpEZ8OOa.js","/assets/CommentsModal-Ba6r6mv-.js","/assets/ComparisonTable-CQMlc0iD.js","/assets/Concerns-0cvh_9Vs.js","/assets/ConfirmDialog-BfIuHOck.js","/assets/Daily-Bcc50cNk.js","/assets/DataTable-RMVqbG3J.js","/assets/DateRangePicker-CGlrL0Hy.js","/assets/DayReportView-DbWY0R2m.js","/assets/DayStepper-CXtMuYni.js","/assets/DifferenceBreakdown-B1W6r8Th.js","/assets/Downtime-qUsGYuhw.js","/assets/Education-BfH9Ur_o.js","/assets/EducationLesson-7eXh2ivs.js","/assets/EmptyState-CsooR7CH.js","/assets/Exam-CcuTgdd5.js","/assets/FactorySelect-y074EZNZ.js","/assets/Gamification-BNSLyT_u.js","/assets/GroupBadge-w0qGRoNy.js","/assets/HeatmapChart-BZrPNnIK.js","/assets/IdleCell-BCzZz76E.js","/assets/KPICard-DNzbDHC4.js","/assets/Kaizen-B8qtj5bJ.js","/assets/Kelish-BLgs9pcy.js","/assets/KpiDeltaCard-Btdv129g.js","/assets/LangTextInput-Bl6V-Msq.js","/assets/Layout-BTuhbLsc.js","/assets/LeaderAppeal-Wy6folGs.js","/assets/LeaderDayReport-CCENgf7O.js","/assets/LeaderUnitReport-DS1-rFzd.js","/assets/Leaderboard-BCnpXJmF.js","/assets/Leaders-DoatLVNd.js","/assets/Lightbox-DgmFVWFD.js","/assets/LiveOverview-Cvi61KSB.js","/assets/Login-B9qv0lVJ.js","/assets/NotFound-DjVKZwZY.js","/assets/Overview-DFlKhqd2.js","/assets/Pagination-ByB3M-9C.js","/assets/PerenaladkaFactTable-BmfJv5of.js","/assets/PlanFulfillment-CDWvxnxi.js","/assets/Production-Cn8b1BRc.js","/assets/Profile-Va6kTyUO.js","/assets/ProofCamera-B_wB6Kmg.js","/assets/ProofPhoto-twpZ9w-V.js","/assets/Quality-eRXKMPe7.js","/assets/RequestStateChip-BHCPBd_B.js","/assets/RichTextEditor-BjXNBAix.js","/assets/SaveState-DmV_wu0-.js","/assets/SearchInput-DKzN-My4.js","/assets/SeasonalityHeatmap-B3KcUCm_.js","/assets/SegmentedToggle-DyldiHNK.js","/assets/SetupTimes-DBRBMgvA.js","/assets/ShiftDaily-vbWCls58.js","/assets/Staff-DPzpvXAX.js","/assets/StaffLive-KcLR1aQq.js","/assets/StatusBadge-FlCxSqMf.js","/assets/TargetGoal-CtKrrNX1.js","/assets/Targets-DV2HTVoz.js","/assets/Tasks-CXdKwIF1.js","/assets/TimeWheelPicker-DFvz2sUH.js","/assets/Tooltip-D3thc67a.js","/assets/TrendChart-BssJfC7F.js","/assets/TripleSpeedometer-CekqzrGI.js","/assets/Trudoyomkost-Bxi5qJmS.js","/assets/UploadDropzone-B0qUn67M.js","/assets/UsersActivity-e7Q7FUrj.js","/assets/VerdictBlock-DUGVysZ1.js","/assets/WatchProgress-Cqke-p9e.js","/assets/WebLogin-D_0UQZD1.js","/assets/WorkerConcerns-OipLFozV.js","/assets/Workers-DwxiLSri.js","/assets/Zagruzka-BTuc7y98.js","/assets/ZagruzkaCell-DqkjJlVz.js","/assets/api-DPwAHFyI.js","/assets/archive-DdveRky0.js","/assets/archive-restore-Bs5nDoP-.js","/assets/arrow-down-C1zy2BSq.js","/assets/arrow-left-BS1c65eR.js","/assets/arrow-left-right-C-jh7Pxn.js","/assets/arrow-right-left-DUuBvLPS.js","/assets/arrow-up-DbQ-iio_.js","/assets/arrow-up-narrow-wide-BdKUcrrF.js","/assets/arrow-up-right-DBLAMLP2.js","/assets/award-vtm6ygJN.js","/assets/ban-DvL_Gpha.js","/assets/bot-BrExjRWU.js","/assets/boxes-vaWCHy3l.js","/assets/brigadirFilters-COkubySS.js","/assets/broadcastTree-C4J4F6L7.js","/assets/building-2-jeH4sIYs.js","/assets/calendar-BFleM8yO.js","/assets/calendar-clock-Q7Y5Sn1o.js","/assets/calendar-days-CpzE7sJ6.js","/assets/calendar-range-Ch7VUCpR.js","/assets/camera-87n-pK1W.js","/assets/categories-DlzKTp7E.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-OFrhLAyx.js","/assets/chart-line-DMgtRWJa.js","/assets/chart-pie-CgCHMAhf.js","/assets/chartRange-fiSqDues.js","/assets/chevron-left-D4MlIjOl.js","/assets/chevrons-up-down-UgB8tgqe.js","/assets/circle-DQYXzP0r.js","/assets/circle-check-big-CQJJxflg.js","/assets/circle-dot-BBhi4sOI.js","/assets/circle-minus-DW4UrXad.js","/assets/circle-slash-C6blGiG9.js","/assets/circle-user-round-FjwfWsgo.js","/assets/cloud-off-ffzB8TUY.js","/assets/cloud-upload-kc31WGFf.js","/assets/compass-Z_S5uz5Z.js","/assets/concernCategories-Bi71nXYB.js","/assets/copy-STrWvYtH.js","/assets/corner-down-right-OVstwQez.js","/assets/createLucideIcon-Cxc4uy-l.js","/assets/es-CUrvFyjz.js","/assets/exportXlsx-CtV-f8b3.js","/assets/external-link-BPFRW63f.js","/assets/file-clock-DWabsPyg.js","/assets/file-exclamation-point-Bv0GXJ7T.js","/assets/file-spreadsheet-B-EGWjFn.js","/assets/file-text-DAF9uIXU.js","/assets/flag-DQbxOi4d.js","/assets/flame-BkoqwdC9.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-Biebxu70.js","/assets/hash-6TRX27k3.js","/assets/history-BHQc6ger.js","/assets/hourglass-C91uRlAt.js","/assets/id-card-Cwbl7Av2.js","/assets/image-C2HnhfJg.js","/assets/image-off-BlzqOEnl.js","/assets/index-6rNv2tEv.css","/assets/index-YZ6wdVS1.js","/assets/key-round-B3PdEKpa.js","/assets/keyboard-C5I5-ZN5.js","/assets/languages-DImOiDdZ.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BwWxN5KX.js","/assets/lightbulb-DUME7JfN.js","/assets/link-2-CvpdGut9.js","/assets/link-2-off-8LfCDfiD.js","/assets/list-checks-B-Qj0e5T.js","/assets/list-ordered-D7QTwnrG.js","/assets/list-tree-CpUW6EIa.js","/assets/lock-open-CcNq8l-7.js","/assets/log-in-GPiubfor.js","/assets/maximize-2-BA8N6hX7.js","/assets/message-square-BR6bEet3.js","/assets/minimize-2-BSOVIILi.js","/assets/package-check-Ds30hYpe.js","/assets/paperclip-82k9DWkX.js","/assets/pencil-BsHhvmYb.js","/assets/percent-C5QUaRja.js","/assets/personName-CogOuS3K.js","/assets/pin-0pgGGTmz.js","/assets/pin-off-s3E7kOms.js","/assets/play-B_A5henr.js","/assets/plug-zap-DkxYdwob.js","/assets/presentation-BZOVi1R6.js","/assets/prop-types-CR268xvx.js","/assets/radio-G1dLdZjr.js","/assets/react-apexcharts.esm-Ca3TBLn2.js","/assets/repeat-B2w2tPGo.js","/assets/rotate-ccw-BKEJxN0E.js","/assets/rotate-cw-QcQw3d_V.js","/assets/save-Bmtc4HKm.js","/assets/scale-Cd9xq9t0.js","/assets/scopeLinks-SW-bXN0x.js","/assets/scroll-text-bu-oyjnL.js","/assets/search-x-CDdzVYf8.js","/assets/segments-DTVEb9xR.js","/assets/send-D0zFzBxP.js","/assets/settings-2-YxYWBCLm.js","/assets/shield-C-Uzx3po.js","/assets/shield-alert-QWmp63SW.js","/assets/shield-check-dHnpypPg.js","/assets/shield-question-mark-BC34JIvJ.js","/assets/siren-8Cl46CwM.js","/assets/snowflake-D0bs5Jm1.js","/assets/split-BYNqiF28.js","/assets/square-BGYCn0pY.js","/assets/square-check-big-Ds80uGf4.js","/assets/star-CYYlyhyY.js","/assets/statusBands-B9nK_Jey.js","/assets/store-BeRn-wI5.js","/assets/table-2-B1-9gkP3.js","/assets/table-properties-DzYQ0WfK.js","/assets/tag-DSqvAwrv.js","/assets/timer-off-CFPZwQnt.js","/assets/trending-down-D9EbTg1d.js","/assets/trending-up-CuESHcf_.js","/assets/undo-2-B0nRa-kU.js","/assets/useChartTheme-DyO-d0Rc.js","/assets/useElementWidth-DtszoVbQ.js","/assets/useIsMobile-aV7xluhe.js","/assets/useMutation-DjbY5SI_.js","/assets/useStatusBands-BaTs5BiD.js","/assets/useUrlScope-C-udafbZ.js","/assets/user-C0-LFTiq.js","/assets/user-cog-RDvSne0z.js","/assets/user-minus-BvBAN96O.js","/assets/users-Qqfm_0ai.js","/assets/video-D8ru7hu8.js","/assets/wallet-Dify-jba.js","/assets/warehouse-3PDWbUrC.js","/assets/zap-Ce-B_hYf.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
