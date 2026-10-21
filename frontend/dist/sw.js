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

const BUILD = "2026-10-21T06:04:56.017Z";
const PRECACHE = ["/","/assets/AdminPanel-DGYp7DcI.js","/assets/AnalysisBoard-B7XXDPGn.js","/assets/Arc-CiM2cTcN.js","/assets/Assistant-BQdbqeLD.js","/assets/BrigadirProfile-Df0Wh7YB.js","/assets/BroadcastReceivers-DxNPcgMs.js","/assets/BroadcastRecord-D9-BrrkA.js","/assets/Button-tk_jD3a1.js","/assets/CatLockNotice-CQOEsdAm.js","/assets/CategoryLegendModal-DO6uE2z_.js","/assets/CellConcerns-BTyR3gGo.js","/assets/CellDetails-DIoz7hHF.js","/assets/CellFormModal-BczuUJpt.js","/assets/CellIdent-DzCRNvmy.js","/assets/CellLink-bJScAX0v.js","/assets/Cells-CqPg9QP2.js","/assets/ColumnFilter-Cc1sDQAz.js","/assets/ColumnsPicker-DsLi40TP.js","/assets/CommentsModal-Dibm9fia.js","/assets/ComparisonTable-BAUI6J3R.js","/assets/Concerns-CWI0PUN1.js","/assets/CountStepper-BSxhm16X.js","/assets/Daily-azOpvaSm.js","/assets/DataTable-C31eidIY.js","/assets/DateRangePicker-LvKjamhK.js","/assets/DayReportView-D-nJCLse.js","/assets/DayStepper-DwRER4qO.js","/assets/DayStrip-DvrE2tG2.js","/assets/DifferenceBreakdown-BnLII_G_.js","/assets/Downtime-1lq3w6Te.js","/assets/Education-CVyoE_Sy.js","/assets/EducationLesson-D-dTFGIh.js","/assets/EmptyState-GPN6oBSv.js","/assets/Exam-EuWIG8cI.js","/assets/FactorySelect-CJIVUcec.js","/assets/Gamification-BdNiIcad.js","/assets/GroupBadge-rOoqERYx.js","/assets/HeatmapChart-CeG4BYp0.js","/assets/IdleCell-CP9djATy.js","/assets/KPICard-CxTWIaN4.js","/assets/Kaizen-HmWJzfJk.js","/assets/Kelish-Ce9-5t7c.js","/assets/KpiDeltaCard-QvBX1ChA.js","/assets/LangTextInput-CN5aMmrI.js","/assets/Layout-BdtRYRAj.js","/assets/LeaderAppeal-BU04XEMp.js","/assets/LeaderDayReport-DJdftWB2.js","/assets/LeaderUnitReport-BRW9Wqmw.js","/assets/Leaderboard-2zfGP2fz.js","/assets/Leaders-CO9LP_nw.js","/assets/LeadersKpi-B46kSHp2.js","/assets/Lightbox-ClZU6Tb6.js","/assets/LiveOverview-R21WOs1C.js","/assets/Login-DPlrEYQO.js","/assets/NotFound-5foh-Geg.js","/assets/Notifications-CRPpXEzR.js","/assets/Ontime-BrqaGrJg.js","/assets/Overview-BNJZwSip.js","/assets/Pagination-BfamIoBX.js","/assets/PerenaladkaFactTable-CQ2Ca6iO.js","/assets/PersonCard-jMmT3eWu.js","/assets/PlanFulfillment-F2VZxYAN.js","/assets/Production-DiafXBBO.js","/assets/Profile-BTIrjyHP.js","/assets/ProofCamera-B4hMTx-j.js","/assets/ProofPhoto-B4Q8vY5U.js","/assets/Quality-Y-wpG4Ah.js","/assets/RawRows-BJli_Chi.js","/assets/RequestStateChip-TA2EKqCS.js","/assets/RichTextEditor-BOJedXiU.js","/assets/SaveState-BnmqkYNQ.js","/assets/SearchInput-C5HSZTnp.js","/assets/SeasonalityHeatmap-C8HJxSAy.js","/assets/SegmentedToggle-BRPHt0MA.js","/assets/SetupTimes-QaZA1oNh.js","/assets/ShiftDaily-B6Pv4Wrv.js","/assets/Staff-C8BA_fLs.js","/assets/StaffListAtCheck-BkEtI_mE.js","/assets/StatusBadge-CZw4T5Fc.js","/assets/StatusBandsModal-J69YH0cv.js","/assets/TargetGoal-BVTzMTz3.js","/assets/Targets-ojiDNALy.js","/assets/Tasks-DHISB61j.js","/assets/TimeWheelPicker-C3xlJz6n.js","/assets/Toast-BdMmgdDn.js","/assets/Tooltip-DTIpFsxZ.js","/assets/TrendChart-Dyzy8VfF.js","/assets/TripleSpeedometer-BblSouf1.js","/assets/Trudoyomkost-DhZkuGrS.js","/assets/UploadDropzone-DFwx5MFQ.js","/assets/UsersActivity-CCvdLH0V.js","/assets/VerdictBlock-Cgdx6fk0.js","/assets/VfxApiMap-CF0JDV2i.js","/assets/VfxDictionaries-CAOMDbDU.js","/assets/VfxEmployees-DyxmpdqQ.js","/assets/VfxHrMoves-EaTyn2h_.js","/assets/VfxJobs-B76J0mhB.js","/assets/VfxPhoto-D0DqourC.js","/assets/VfxShifts-BtxWgF3f.js","/assets/VfxState-C92WHb0U.js","/assets/VfxTimebooks-BDd1uKvo.js","/assets/VfxTimesheet-mB9g_nfa.js","/assets/WatchProgress-CM4PRL58.js","/assets/WebLogin-BBLhr7ZR.js","/assets/Workers-D2PsjaxM.js","/assets/Zagruzka-B1jDZKub.js","/assets/ZagruzkaCell-B2XoZ9HD.js","/assets/api-2kJaLY6O.js","/assets/archive-DRsLW8zu.js","/assets/archive-restore-DYn4yu2j.js","/assets/arrow-down-ayy-Qa0I.js","/assets/arrow-down-right-CrbYu4rl.js","/assets/arrow-down-wide-narrow-BoU8qz6k.js","/assets/arrow-up-narrow-wide-BYgVxsxe.js","/assets/ban-BYwrG7jR.js","/assets/boxes-D-PJs8t3.js","/assets/braces-XBrk-uXL.js","/assets/brigadirFilters-C-1Bj4ko.js","/assets/broadcastTree-BkAups8Q.js","/assets/building-2-Dwm_vy_U.js","/assets/calendar-Cj82T9Py.js","/assets/calendar-days-D3VoDgSm.js","/assets/camera-zfH-pQIg.js","/assets/categories-OJ8WUClB.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BcHuCzHH.js","/assets/chart-line-Bsxj1GH-.js","/assets/chart-pie-lsavXZhQ.js","/assets/chartRange-CSYxSe0b.js","/assets/check-check-DneapaC6.js","/assets/chevron-left-B6d8D7JT.js","/assets/chevrons-up-down-BXmdh5f7.js","/assets/circle-D8tMtaqK.js","/assets/circle-alert-ExPvumsT.js","/assets/circle-check-big-DYXulfeG.js","/assets/circle-dashed--E_ACVwl.js","/assets/circle-minus-BhT7Ln0c.js","/assets/circle-question-mark-BJInrfva.js","/assets/circle-slash-BKZpke9-.js","/assets/circle-user-round-CPNtgNuj.js","/assets/cloud-off-DssPbpJn.js","/assets/cloud-upload-BEQES30p.js","/assets/compass-BUakYKHg.js","/assets/concernCategories-DQHVOUqk.js","/assets/corner-down-right-BJiB9TM9.js","/assets/createLucideIcon-CrzTefZG.js","/assets/es-CUAnUeR-.js","/assets/external-link-CxQakN4i.js","/assets/file-clock-ZLFyN45f.js","/assets/file-exclamation-point-CsNCKkP2.js","/assets/flag-CgyYPeo1.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-YCVFTAcf.js","/assets/funnel-ze1yJ2qt.js","/assets/hash-BWz9rO3L.js","/assets/hourglass-BD4buCBM.js","/assets/image-DqE9Du-0.js","/assets/image-off-BwgiEB2l.js","/assets/inbox-Bz0siY0i.js","/assets/index-CUmHS10b.js","/assets/index-DLT_vDJq.css","/assets/keyboard-BpreeRc1.js","/assets/languages-BhF2Eupa.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-G_f3MttI.js","/assets/lightbulb-CZlxesnx.js","/assets/link-2-off-BWQk4Th4.js","/assets/link-2-tv0Ami0f.js","/assets/list-ordered-Dib2rEuh.js","/assets/list-tree-SJgre_tc.js","/assets/lock-open-D47KxfAC.js","/assets/log-in-CzowwbXV.js","/assets/marks-CFOQN1-L.js","/assets/minimize-2-CjTGK_7i.js","/assets/package-check-DUGZDWzD.js","/assets/pencil-DARfsRji.js","/assets/percent-o0VX0-XM.js","/assets/pin-off-BrVf-Pyp.js","/assets/pin-zh03OwpW.js","/assets/play-Bcxt64dL.js","/assets/plug-zap-DJ53DoEQ.js","/assets/prop-types-rwGU9gWV.js","/assets/radio-Bu4ldjRQ.js","/assets/react-apexcharts.esm-9eTmH2aY.js","/assets/registers-Dzb6rZ5J.js","/assets/repeat-JambJF1U.js","/assets/save-Bsz8GZZ0.js","/assets/scopeLinks-Mav3_ODG.js","/assets/scroll-text-BZAAlUer.js","/assets/search-x-C7RIgmrd.js","/assets/segments-Dn_FDTkf.js","/assets/send-DppKEoFW.js","/assets/settings-2-CWTZQVxG.js","/assets/shield-BeZIWGUQ.js","/assets/shield-alert-BUhf4YZq.js","/assets/shield-question-mark-NIAIQJhI.js","/assets/sigma-D0W5pUdP.js","/assets/siren-BYiJo21Y.js","/assets/snowflake-VV1VAHD7.js","/assets/split-DnSJke1Q.js","/assets/square-check-big-6Hof1rpN.js","/assets/star-D3dLRNug.js","/assets/statusBands-DqcgAdqg.js","/assets/store-C2btoi81.js","/assets/table-2-BNdfS7ZE.js","/assets/table-properties-CJLH3yrm.js","/assets/tag-Du7K3qUm.js","/assets/timer-off-DuRR1Ygc.js","/assets/trending-down-BmIQgh40.js","/assets/trending-up-DcDm1KYg.js","/assets/undo-2-4HBqr9cI.js","/assets/useChartTheme-D4rdPfRE.js","/assets/useElementWidth-BGG0TwDi.js","/assets/useIsMobile-CecHI9Q9.js","/assets/useOpenParam-DY_6QTXd.js","/assets/useStatusBands-DyRgRW4A.js","/assets/useUrlScope-BZPiKvAW.js","/assets/user-CCIcZvzJ.js","/assets/user-cog-3nX2efNO.js","/assets/user-minus-DFdJcQI9.js","/assets/users-Cp7v46Mc.js","/assets/vfx-cHNZew9z.js","/assets/video-CDKqatSp.js","/assets/wallet-Dh7P4aiw.js","/assets/warehouse-CzwKvVKG.js","/assets/workflow-B41hdUKf.js","/assets/x-CzvpQZpD.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
