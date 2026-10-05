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

const BUILD = "2026-10-05T05:36:49.382Z";
const PRECACHE = ["/","/assets/AdminPanel-DomtjtVy.js","/assets/AnalysisBoard-CGJlrbH_.js","/assets/Arc-DdcgKYWx.js","/assets/ArcLegacy-DrQcps3S.js","/assets/BrigadirProfile-Cy15a8cs.js","/assets/BroadcastReceivers-BJJF3URF.js","/assets/BroadcastRecord-DsgJVTGc.js","/assets/CatLockNotice-BWJTeSwy.js","/assets/CategoryLegendModal-Brj5Nnl1.js","/assets/CellConcerns-DssIa_U2.js","/assets/CellDetails-ID--TOUm.js","/assets/CellFormModal-DDr0lwAv.js","/assets/CellIdent-CtFWXsTJ.js","/assets/CellLink-Cioa5oQ7.js","/assets/Cells-CHt3ir6R.js","/assets/ColumnFilter-CFvh46KM.js","/assets/ColumnsPicker-DgT1nqDK.js","/assets/CommentsModal-DXXng1LV.js","/assets/ComparisonTable-BWkn4bPi.js","/assets/Concerns-FSh3mq1R.js","/assets/ConfirmDialog-dy04i9D3.js","/assets/Daily-BVd1OCY7.js","/assets/DataTable-Cxtopkk_.js","/assets/DateRangePicker-BAQunFO8.js","/assets/DayReportView-DVHG45pw.js","/assets/DayStepper-CE6acTx5.js","/assets/DifferenceBreakdown-CGxKnCh3.js","/assets/Downtime-ySgQx--F.js","/assets/Education-CBCyNU9S.js","/assets/EducationLesson-CcrWGilq.js","/assets/EmptyState-BNcT1YMp.js","/assets/Exam-B2rvT1Y9.js","/assets/FactorySelect-BZ7AIpiX.js","/assets/Gamification-CM08gLio.js","/assets/GroupBadge-DUpSne0S.js","/assets/HeatmapChart-LNXYbCNx.js","/assets/IdleCell-CAfrE_hc.js","/assets/KPICard-CfY7ITD4.js","/assets/Kaizen-iJ2y3cFb.js","/assets/Kelish-Cn5hIb2g.js","/assets/KpiDeltaCard-DbDCLxT-.js","/assets/LangTextInput-CTz2EIbJ.js","/assets/Layout-CB5vJ2WH.js","/assets/LeaderAppeal-B6C8A4DV.js","/assets/LeaderDayReport-C63EaFtW.js","/assets/LeaderUnitReport-85LghN_W.js","/assets/Leaderboard-CIxTSMnv.js","/assets/Leaders-DpE47vaY.js","/assets/Lightbox-BhZqJtnl.js","/assets/LiveOverview-Chsjc5W5.js","/assets/Login-CZy2EJwg.js","/assets/NotFound-B21ZXRpn.js","/assets/Notifications-BbJPbZLx.js","/assets/Overview-DLd4yb-7.js","/assets/Pagination-D86087zg.js","/assets/PerenaladkaFactTable-CUPqF4j9.js","/assets/PersonCard-vEcBh1L8.js","/assets/PlanFulfillment-erPj9DkO.js","/assets/Production-B3viyOlC.js","/assets/Profile-Cgmq9rf1.js","/assets/ProofCamera-B3k7IPu9.js","/assets/ProofPhoto-jj70JSz_.js","/assets/Quality-DT5u5aGQ.js","/assets/RawRows-BdeTrgiG.js","/assets/RequestStateChip-WYinu_Or.js","/assets/RichTextEditor-Ce51vAkJ.js","/assets/SaveState-CaXnozzE.js","/assets/SearchInput-C_S_KlvJ.js","/assets/SeasonalityHeatmap-DLbwPzEy.js","/assets/SegmentedToggle-DFhOK87I.js","/assets/SetupTimes-DTLHqhQe.js","/assets/ShiftDaily-DcV1QDVR.js","/assets/Staff-C5XTmvAc.js","/assets/StaffLive-BtlaZj1y.js","/assets/StatusBadge-DggHdCR5.js","/assets/TargetGoal-CtpsYnph.js","/assets/Targets-C-Exhk1U.js","/assets/Tasks-Dw0yjaKn.js","/assets/TimeWheelPicker-BQt3MUVO.js","/assets/Toast-DyPJpeW9.js","/assets/Tooltip-Bg8EywH5.js","/assets/TrendChart-CqEPrtYB.js","/assets/TripleSpeedometer-Dhltg1Ey.js","/assets/Trudoyomkost-DZd25bQ4.js","/assets/Turnover-DA8AUo_i.js","/assets/UploadDropzone-TbPeaF0n.js","/assets/UsersActivity-XJATIUfE.js","/assets/VerdictBlock-RA_s9CZr.js","/assets/VfxApiMap-FRqbc-Gt.js","/assets/VfxDictionaries-DhXWYOYe.js","/assets/VfxEmployees--mbICeAg.js","/assets/VfxHrMoves-U6KBIoBW.js","/assets/VfxJobs-NGntiTdm.js","/assets/VfxPhoto-gDFvi-Id.js","/assets/VfxShifts-CLjqgSlP.js","/assets/VfxState-D7PQsrh6.js","/assets/VfxTimebooks-C2cO08SU.js","/assets/VfxTimesheet-Bsz_5a-u.js","/assets/WatchProgress-LZsCQGLQ.js","/assets/WebLogin-BVx5AmgW.js","/assets/WorkerConcerns-BzXR-vRK.js","/assets/Workers-kUYf0whr.js","/assets/Zagruzka-DUBJXDvx.js","/assets/ZagruzkaCell-SVxSB8DQ.js","/assets/api-uQuCJpjz.js","/assets/archive-DogAK_nR.js","/assets/archive-restore-C3k-cJ_I.js","/assets/arrow-down-DO1z-phV.js","/assets/arrow-left-ChnM2I8p.js","/assets/arrow-up-KsIlDGa_.js","/assets/arrow-up-narrow-wide-CqFnjFWb.js","/assets/arrow-up-right-BKS4zEix.js","/assets/award-2DVZ_3nN.js","/assets/ban-ZrWA9p-F.js","/assets/book-open-BK9igKTd.js","/assets/bot-C0wGfyWZ.js","/assets/boxes-DIXghoCl.js","/assets/braces-BlqGmVlg.js","/assets/brigadirFilters-X5O2HNKr.js","/assets/broadcastTree-CZft2wt1.js","/assets/building-2-DQoh6n8V.js","/assets/calculator-DVOZIhqz.js","/assets/calendar-DzsPbPiX.js","/assets/calendar-days-CL9l3hst.js","/assets/camera-LAiNqF6J.js","/assets/categories-CRh-M9Ez.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-C-8ptvTS.js","/assets/chart-line-C2-GX7ID.js","/assets/chart-pie-CjcbWikF.js","/assets/chartRange-BeKUff3C.js","/assets/check-check-DGV0W_tl.js","/assets/chevron-left-BKVYbUzi.js","/assets/chevrons-up-down-B23ExaOc.js","/assets/circle-D-e-M5mD.js","/assets/circle-alert-BKnNLl4j.js","/assets/circle-check-big-Cr7eEhae.js","/assets/circle-dashed-D2Ys56iQ.js","/assets/circle-minus-Bjvy9ke9.js","/assets/circle-question-mark-D6vQ7CWa.js","/assets/circle-slash-BEY0mmmL.js","/assets/circle-user-round-Bo1hMrid.js","/assets/clock-3-CrhuFohL.js","/assets/cloud-off-Ctkcdtio.js","/assets/cloud-upload-Ck0gud4S.js","/assets/compass-C0tCjqjV.js","/assets/concernCategories-BFst-PNt.js","/assets/copy-BuGZdzco.js","/assets/corner-down-right-CFxkbEhw.js","/assets/createLucideIcon-DDl6TVNQ.js","/assets/es-CVj3ZqAr.js","/assets/exportXlsx-Bb2SWdF7.js","/assets/external-link-Bp0T6brP.js","/assets/file-clock-Dy-0Qug6.js","/assets/file-exclamation-point-DlUbZJ9R.js","/assets/file-spreadsheet-BmBV2rsi.js","/assets/file-text-CPBfXpzP.js","/assets/flag-DqFEQ_RZ.js","/assets/formatters-YGHSWdVb.js","/assets/funnel-BwcMjWnv.js","/assets/hash-BTTC4W-7.js","/assets/history-BQjGP_mq.js","/assets/hourglass-D_Z3_Cqx.js","/assets/image-CFjpCBAg.js","/assets/image-off-CWkyR3fR.js","/assets/inbox-TI5fTysc.js","/assets/index-DD6X1EXF.css","/assets/index-JsyEDnCu.js","/assets/key-round-nCoJL2IK.js","/assets/keyboard-Dhw-H9PG.js","/assets/languages-Dd2EwITD.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-DLg-jbpk.js","/assets/lightbulb-DvdXL9u5.js","/assets/link-2-BGJV-QEm.js","/assets/link-2-off-B8bCwHkl.js","/assets/list-ordered-CFqzLsF4.js","/assets/list-tree-BfSGP6E6.js","/assets/lock-open-Cq1madhk.js","/assets/log-in-B22CN02c.js","/assets/maximize-2-DHKyLekG.js","/assets/message-square-Be2QmKYV.js","/assets/minimize-2-nzqX9vko.js","/assets/package-check-Bm9ocPNs.js","/assets/paperclip-BPIwWkQP.js","/assets/pencil-BpNBNvGS.js","/assets/percent-DPss0gYZ.js","/assets/pin-DQNmdQvZ.js","/assets/pin-off-DsItzEMe.js","/assets/play-BQK3DAS-.js","/assets/plug-zap-B4qZR-Vh.js","/assets/presentation-BXRU7Odv.js","/assets/prop-types-kZsJyBTJ.js","/assets/radio-BCrHeMq7.js","/assets/react-apexcharts.esm-C9Wm5Heq.js","/assets/registers-BoTQlSHo.js","/assets/repeat-CLESK5BU.js","/assets/rotate-ccw-DHuQ2mHz.js","/assets/rotate-cw-CKOfiYX6.js","/assets/save-DI0k4deQ.js","/assets/scopeLinks-BnlANvay.js","/assets/scroll-text-Bladf1nc.js","/assets/search-x-CvVr3J1B.js","/assets/segments-DaBZ0UBj.js","/assets/send-UR8aSXbu.js","/assets/settings-2-_WikRZEY.js","/assets/shield-C77UNTsY.js","/assets/shield-alert-QD9ea1jO.js","/assets/shield-check-Cpx0mfTK.js","/assets/shield-question-mark-w5XbOTxJ.js","/assets/siren-1G676DeX.js","/assets/snowflake-CLlqoR7h.js","/assets/split-SdpuAcKU.js","/assets/square-CU8_YOp8.js","/assets/square-check-big-CLhgzpkd.js","/assets/star-xBxsZslt.js","/assets/statusBands-BxeJ1Rdv.js","/assets/store-3oR5UU9Y.js","/assets/table-2-5-Lr9-OL.js","/assets/table-properties-DUhlz6rT.js","/assets/tag-D61gGsZY.js","/assets/timer-off-lbMdo1_j.js","/assets/trending-down-DAc5_HlZ.js","/assets/trending-up-C-NGtOcs.js","/assets/undo-2-BYzMVECq.js","/assets/useChartTheme-facnGIqb.js","/assets/useElementWidth-AUba8Yi7.js","/assets/useIsMobile-D0tG1fZ4.js","/assets/useOpenParam-BDYQTRQF.js","/assets/useStatusBands-DQAyQdHj.js","/assets/useUrlScope-Bfi9b34k.js","/assets/user-Bo_dTeze.js","/assets/user-cog-buAh8S5Y.js","/assets/users-CBYdL0Kg.js","/assets/vfx-AISWw6No.js","/assets/video-bjzMCqEn.js","/assets/wallet-CHyLUGKa.js","/assets/warehouse-DleDWO31.js","/assets/x-yB_9xtYY.js","/assets/zap-ecwPnrxd.js","/icons/icon-192-maskable.png","/icons/icon-192.png","/icons/icon-512-maskable.png","/icons/icon-512.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32.png","/favicon-192.png","/apple-touch-icon.png","/icons.svg","/logo.png"];
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
