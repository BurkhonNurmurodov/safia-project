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

const BUILD = "2026-10-04T14:12:35.476Z";
const PRECACHE = ["/","/assets/AdminPanel-Cc34qaKY.js","/assets/AnalysisBoard-DHWYrCLq.js","/assets/Arc-BwwA2ZM5.js","/assets/ArcLegacy-X7XXFqMR.js","/assets/BrigadirProfile-C20Pku8d.js","/assets/BroadcastReceivers-YzApr7-y.js","/assets/BroadcastRecord-Cg-zW7ze.js","/assets/CatLockNotice-DrrMRaIP.js","/assets/CategoryLegendModal-DOHldZdi.js","/assets/CellConcerns-DnxQtuKH.js","/assets/CellDetails-CjJ4vmtO.js","/assets/CellFormModal-CcessuNj.js","/assets/CellIdent-BIP7hzXa.js","/assets/CellLink-WSDeGVpD.js","/assets/Cells-DqJDMomX.js","/assets/ColumnFilter-DQgouFR_.js","/assets/ColumnsPicker-CbmZwnN_.js","/assets/CommentsModal-D-AYmgIP.js","/assets/ComparisonTable-BIwPDoVv.js","/assets/Concerns-BtpFOnXZ.js","/assets/ConfirmDialog-CBz3Xx1Z.js","/assets/Daily-CfY3MeXX.js","/assets/DataTable-S2MLeINP.js","/assets/DateRangePicker-C8Jj7czr.js","/assets/DayReportView-CLVvmWK6.js","/assets/DayStepper-LsHzp_P-.js","/assets/DifferenceBreakdown-CNBeERZz.js","/assets/Downtime-Bm2ZpjLR.js","/assets/Education-D43yhgaL.js","/assets/EducationLesson-v9KNRLMM.js","/assets/EmptyState-BCyTAJ6v.js","/assets/Exam-C_9BXvwJ.js","/assets/FactorySelect-By5b1KRd.js","/assets/Gamification-g6cJVqDR.js","/assets/GroupBadge-DXdrK2ZK.js","/assets/HeatmapChart-Q_Rkbkou.js","/assets/IdleCell-BCPQ6SSK.js","/assets/KPICard-C2oKfaCA.js","/assets/Kaizen-BIQy00e3.js","/assets/Kelish-CMZ-PB4G.js","/assets/KpiDeltaCard-BNRCFpbq.js","/assets/LangTextInput-L_hc4CDq.js","/assets/Layout-CRC1RTyA.js","/assets/LeaderAppeal-B-PAmB3p.js","/assets/LeaderDayReport-DMAzmJa7.js","/assets/LeaderUnitReport-PjOgXHfj.js","/assets/Leaderboard-VjrzMhUZ.js","/assets/Leaders-FZM_syvZ.js","/assets/Lightbox-BTzNFh05.js","/assets/LiveOverview-MRYPOGto.js","/assets/Login-2TMEMhk1.js","/assets/NotFound-CxTU72le.js","/assets/Notifications-DfXAsDiF.js","/assets/Overview-DgFfo5U9.js","/assets/Pagination-B6U1boW9.js","/assets/PerenaladkaFactTable-CwLaUXlC.js","/assets/PersonCard-cBMXp5x8.js","/assets/PlanFulfillment-JpW_oOkf.js","/assets/Production-BpKwpGSG.js","/assets/Profile-CVa8WWUb.js","/assets/ProofCamera-DBFoWZTA.js","/assets/ProofPhoto-CzUyStqu.js","/assets/Quality-Bp7i903_.js","/assets/RawRows-CGAQZXd1.js","/assets/RequestStateChip-BO8jdzZE.js","/assets/RichTextEditor-Bt5ApKjF.js","/assets/SaveState-Bzvtlg2g.js","/assets/SearchInput-C_kvcOqd.js","/assets/SeasonalityHeatmap-BzUm_073.js","/assets/SegmentedToggle-8OwM_Aya.js","/assets/SetupTimes-BYSMutc6.js","/assets/ShiftDaily-DztHv_Vs.js","/assets/Staff-B1OnLZeC.js","/assets/StaffLive-BKxZ-hdF.js","/assets/StatusBadge-T8Ep9bbx.js","/assets/TargetGoal-DD8sO8F4.js","/assets/Targets-CL4VRtBd.js","/assets/Tasks-VrfjZEfw.js","/assets/TimeWheelPicker-BhZtCFfc.js","/assets/Toast-2a6oq3eM.js","/assets/Tooltip-CRzlIz0Y.js","/assets/TrendChart-DHCqDMSM.js","/assets/TripleSpeedometer-2DnuydZo.js","/assets/Trudoyomkost-COGX6UFg.js","/assets/UploadDropzone-DHENRjCX.js","/assets/UsersActivity-BURHgqfS.js","/assets/VerdictBlock-DU3Sugz2.js","/assets/VfxApiMap-C3eKU3NP.js","/assets/VfxDictionaries-bIdlj4lr.js","/assets/VfxEmployees-BhTyziV3.js","/assets/VfxHrMoves-VKXAa0e0.js","/assets/VfxJobs-DVQmjW5L.js","/assets/VfxPhoto-BaruhelK.js","/assets/VfxShifts-BlGX62QB.js","/assets/VfxState-dqHkZmnT.js","/assets/VfxTimebooks-C0Hz7D2r.js","/assets/VfxTimesheet-BRFoRwby.js","/assets/WatchProgress-DB1hgyLz.js","/assets/WebLogin-CrnLLpxZ.js","/assets/WorkerConcerns-DYGfHIky.js","/assets/Workers-Cq8Qmj-N.js","/assets/Zagruzka-DZFM_DTf.js","/assets/ZagruzkaCell-DkkWkCCk.js","/assets/api-CEzfqjlY.js","/assets/archive-Cfyzbtxr.js","/assets/archive-restore-B96SmHF5.js","/assets/arrow-down-ul_51CjX.js","/assets/arrow-left-DH4Ii-QQ.js","/assets/arrow-up-CGnsDaOw.js","/assets/arrow-up-narrow-wide-C58Rhw51.js","/assets/arrow-up-right-CRKWek0R.js","/assets/award-BHaTjGMI.js","/assets/ban-BOsSExVo.js","/assets/bot-BF06qyzO.js","/assets/boxes-BM_GLRr-.js","/assets/braces-eWo-q3Ft.js","/assets/brigadirFilters-Cm3L527B.js","/assets/broadcastTree-CFXEAJLJ.js","/assets/building-2-YGF2_mmj.js","/assets/calendar-CK6RH4j6.js","/assets/calendar-days-BJFy-y5M.js","/assets/camera-BIFu2pTQ.js","/assets/categories-rMkkYP0t.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-eED0uWah.js","/assets/chart-line-BcpsFrW0.js","/assets/chart-pie-l2W5g58-.js","/assets/chartRange-D_VZdEVX.js","/assets/check-check-B4fmB0wR.js","/assets/chevron-left-mrs0I4uW.js","/assets/chevrons-up-down-BSyFDaty.js","/assets/circle-alert-BfJWl8LC.js","/assets/circle-check-big-1nKfVasg.js","/assets/circle-dashed-DCFb-MDr.js","/assets/circle-minus-CmMoyUXR.js","/assets/circle-question-mark-B-tJaNOl.js","/assets/circle-slash-BV7-dAqJ.js","/assets/circle-user-round-C1ILNatS.js","/assets/circle-wqU9ysA6.js","/assets/clock-3-4taY9St1.js","/assets/cloud-off-BWJnll6Q.js","/assets/cloud-upload-C0F6eP-D.js","/assets/compass-ugp0Y-x8.js","/assets/concernCategories-DYFIvw3W.js","/assets/copy-BlKSfkCe.js","/assets/corner-down-right-4uCl2Y6D.js","/assets/createLucideIcon-B79g-xJY.js","/assets/es-B5PxiIE_.js","/assets/exportXlsx-C4RV4E_G.js","/assets/external-link-c1VNwBQ8.js","/assets/file-clock-C95AFUir.js","/assets/file-exclamation-point-BfrCaHa6.js","/assets/file-spreadsheet-Crb8kDv-.js","/assets/file-text-KjE1_NIs.js","/assets/flag-BImc6neg.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-DLKrgZcP.js","/assets/hash-Bkg3WcX5.js","/assets/history-H1dlOSGS.js","/assets/hourglass-CQbc0DV4.js","/assets/image-off-DOHZdbVn.js","/assets/image-vnUPMCk6.js","/assets/inbox-78h2UtYF.js","/assets/index-CB75UkY_.js","/assets/index-DzDT26XC.css","/assets/key-round-sV8azx3E.js","/assets/keyboard-CL4GtgXd.js","/assets/languages-BEE0Tan_.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BAyQu8gU.js","/assets/lightbulb-D-hPBuvl.js","/assets/link-2-DhfZvS15.js","/assets/link-2-off-CnshtTY6.js","/assets/list-ordered-DB36qUKy.js","/assets/list-tree-TSbqRosW.js","/assets/lock-open-ILJw3eMB.js","/assets/log-in-BNmzETR3.js","/assets/maximize-2-CSb6Kr1T.js","/assets/message-square-84Lgnm6H.js","/assets/minimize-2-CEeiNz4M.js","/assets/package-check-Dp5E_gHU.js","/assets/paperclip-D303vWgq.js","/assets/pencil-BIPHw9-k.js","/assets/percent-BhHyTdn_.js","/assets/pin-D9kAFnMP.js","/assets/pin-off-BBVmpM37.js","/assets/play-C2FPMzd0.js","/assets/plug-zap-knkSW4rZ.js","/assets/presentation-BIa17P-E.js","/assets/prop-types-DR2v_S_J.js","/assets/radio-B9OxsN12.js","/assets/react-apexcharts.esm-Di4mABDc.js","/assets/registers-B6QSDEu3.js","/assets/repeat-aXxRPV9R.js","/assets/rotate-ccw-DDkiVnHW.js","/assets/rotate-cw-BbsPz4lC.js","/assets/save-B9T0C9Z7.js","/assets/scopeLinks-B0kgZr7k.js","/assets/scroll-text-D0178lts.js","/assets/search-x-BKLHleox.js","/assets/segments-BxOuXA_J.js","/assets/send-DUjTfd2E.js","/assets/settings-2-DNX9St-U.js","/assets/shield-BxGkw-AL.js","/assets/shield-alert-0gnjaE-9.js","/assets/shield-check-ciJDo10S.js","/assets/shield-question-mark-BhoSrW8j.js","/assets/siren-DsGNVpo3.js","/assets/snowflake-DAYn6W3k.js","/assets/split-DhL7iZg3.js","/assets/square-YifKUy0o.js","/assets/square-check-big-Bi_gYZ2y.js","/assets/star-D6EPL6x_.js","/assets/statusBands-CeW6ncv_.js","/assets/store-CnbhrKxH.js","/assets/table-2-BfHttL9v.js","/assets/table-properties-B_j3ztJa.js","/assets/tag-CtV03XDw.js","/assets/timer-off-QPGSWu2u.js","/assets/trending-down-YwUebxVg.js","/assets/trending-up-uU-Ee6yh.js","/assets/undo-2-DYw99QlB.js","/assets/useChartTheme-CeIxV8I5.js","/assets/useElementWidth-DzrkwasU.js","/assets/useIsMobile-D1I7jP9L.js","/assets/useOpenParam-a87ao2M2.js","/assets/useStatusBands-BrVqCA_P.js","/assets/useUrlScope-JV450r6m.js","/assets/user-DnlYXLrP.js","/assets/user-cog-Da0IfB5i.js","/assets/user-minus-CqdwYqJ8.js","/assets/users-1Ft6_JYc.js","/assets/vfx-C2iMQN6h.js","/assets/video-BEGxUNPW.js","/assets/wallet-Cg2XmkUC.js","/assets/warehouse-CiO3kp59.js","/assets/x-Aehp03jk.js","/assets/zap-BTzemJ38.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
