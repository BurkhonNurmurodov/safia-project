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

const BUILD = "2026-10-19T14:10:00.177Z";
const PRECACHE = ["/","/assets/AdminPanel-CGKsrS_z.js","/assets/AnalysisBoard-BjVev-Fh.js","/assets/Arc-ByvB-h0u.js","/assets/Assistant-CEMez6yE.js","/assets/BrigadirProfile-DoZXoxos.js","/assets/BroadcastReceivers-CbsJzdRY.js","/assets/BroadcastRecord-1MWYCLh3.js","/assets/Button-CVl7ibp3.js","/assets/CatLockNotice-DNTRls4k.js","/assets/CategoryLegendModal-Cj1KgOtC.js","/assets/CellConcerns-DHL0SKo2.js","/assets/CellDetails-DtdnOWS_.js","/assets/CellFormModal-vbeSVVdR.js","/assets/CellIdent-DLo3k-Lb.js","/assets/CellLink-DVUPIxno.js","/assets/Cells-UyoRGRhJ.js","/assets/ColumnFilter-UHY0-eRs.js","/assets/ColumnsPicker-BI5G4OEl.js","/assets/CommentsModal-xlFNQwff.js","/assets/ComparisonTable-DbRJVJxJ.js","/assets/Concerns-BM4ONBa3.js","/assets/CountStepper-CsXxy9pi.js","/assets/Daily-COgZsi3G.js","/assets/DataTable-iwphtAnE.js","/assets/DateRangePicker-DxgA-c3N.js","/assets/DayReportView-ByxsG8h-.js","/assets/DayStepper-D9eUvFqn.js","/assets/DifferenceBreakdown-Bsud5Hm2.js","/assets/Downtime-CxE6OaLy.js","/assets/Education-DBmkc-q9.js","/assets/EducationLesson-CiUiWTxK.js","/assets/EmptyState-4gxj5QWe.js","/assets/Exam-CcpPyBJw.js","/assets/FactorySelect-Cun_oiVn.js","/assets/Gamification-BLiFiyAd.js","/assets/GroupBadge-DdmZqklu.js","/assets/HeatmapChart-DS6vldGB.js","/assets/IdleCell-vUCXJMNu.js","/assets/KPICard-DHzqobNP.js","/assets/Kaizen-0-Uysbjx.js","/assets/Kelish-DthGiAgw.js","/assets/KpiDeltaCard-Cc3RzdfB.js","/assets/LangTextInput-CC0IN-Tu.js","/assets/Layout-CSrWVY9q.js","/assets/LeaderAppeal-rnoNAmtV.js","/assets/LeaderDayReport-pN-Q-C7f.js","/assets/LeaderUnitReport-BIcH2P4j.js","/assets/Leaderboard-CaJvbPng.js","/assets/Leaders-IpPGxvDZ.js","/assets/LeadersKpi-C-Bf_pRB.js","/assets/Lightbox-DumH0O3J.js","/assets/LiveOverview-DOVtECKA.js","/assets/Login-D78XjTy3.js","/assets/NotFound-CrZs4mBo.js","/assets/Notifications-DZfFOiWj.js","/assets/Overview-CyWG2JHe.js","/assets/Pagination-Dx_Z0SuT.js","/assets/PerenaladkaFactTable-DAVttxRr.js","/assets/PersonCard-CwtXDxaX.js","/assets/PlanFulfillment-BBrLgcJo.js","/assets/Production-E1LrogEk.js","/assets/Profile-C6xkM-4b.js","/assets/ProofCamera-B7zJrJIe.js","/assets/ProofPhoto-JJaRbcId.js","/assets/Quality-Ba2HibE_.js","/assets/RawRows-BDxBxDo8.js","/assets/RequestStateChip-jaFBe14T.js","/assets/RichTextEditor-CGEAkxpp.js","/assets/SaveState-BL2PgyYe.js","/assets/SearchInput-DioCuJU_.js","/assets/SeasonalityHeatmap-DdQX2J97.js","/assets/SegmentedToggle-DaLxuaQA.js","/assets/SetupTimes-ClXy6Kk6.js","/assets/ShiftDaily-bXgkW0Z7.js","/assets/Staff-kT69ijeu.js","/assets/StaffListAtCheck-DdItRA6f.js","/assets/StatusBadge-BgiQ7kxV.js","/assets/TargetGoal--_y168AL.js","/assets/Targets-9TEeyeOe.js","/assets/Tasks-BaoJaQDn.js","/assets/TimeWheelPicker-B894w7D3.js","/assets/Toast-CfRH255w.js","/assets/Tooltip-BKDpE1n_.js","/assets/TrendChart--tYWLSmS.js","/assets/TripleSpeedometer-COWnGpAN.js","/assets/Trudoyomkost-CFxtUVVY.js","/assets/UploadDropzone-urTI7YHq.js","/assets/UsersActivity-fsVMYrrv.js","/assets/VerdictBlock-BLgA1ljR.js","/assets/VfxApiMap-BiJ9BbGw.js","/assets/VfxDictionaries-0q2QX_Ei.js","/assets/VfxEmployees-CtdYGS1l.js","/assets/VfxHrMoves-Dkm0JAU2.js","/assets/VfxJobs-CI-hoFFY.js","/assets/VfxPhoto-DM1n3LuG.js","/assets/VfxShifts-BN632LQE.js","/assets/VfxState-DhaGt2Ng.js","/assets/VfxTimebooks-C5_V-a46.js","/assets/VfxTimesheet-_NNl2a0O.js","/assets/WatchProgress-3JxtFM8i.js","/assets/WebLogin-BvzilKAf.js","/assets/Workers-BLDP9q__.js","/assets/Zagruzka-C44IqGU4.js","/assets/ZagruzkaCell-CNRzvcio.js","/assets/api-CrkhaWr2.js","/assets/archive-BJyZzjjc.js","/assets/archive-restore-BdyobENk.js","/assets/arrow-down-CDz39DKl.js","/assets/arrow-down-right-BBA17sDZ.js","/assets/arrow-down-wide-narrow-0oD7kd7A.js","/assets/arrow-up-narrow-wide-DjPHPxKv.js","/assets/ban-tQaPT9U9.js","/assets/boxes-D2efewSN.js","/assets/braces-BJ4XhJD5.js","/assets/brigadirFilters-BIOIQw4S.js","/assets/broadcastTree-D6qVCSSG.js","/assets/building-2-B8sKVgmA.js","/assets/calendar-KcX-x6VB.js","/assets/calendar-days-ORLMuSJ-.js","/assets/camera-ByLJdHCH.js","/assets/categories-CS8lQ3_B.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-ycccc40Q.js","/assets/chart-line-DaaT5HNo.js","/assets/chart-pie-DtxVxcFs.js","/assets/chartRange-CqzrKAK7.js","/assets/check-check-C5xxZPNU.js","/assets/chevron-left-HDO5-s_e.js","/assets/chevrons-up-down-D-uDJbCv.js","/assets/circle-0VfVY5ev.js","/assets/circle-alert-CeH0wTpq.js","/assets/circle-check-big-Bl0sMHWj.js","/assets/circle-dashed-K6UphdsS.js","/assets/circle-minus-D-8JnNfb.js","/assets/circle-question-mark-Bn0I5uhe.js","/assets/circle-slash-DSoOqBjM.js","/assets/circle-user-round-DLu17YT_.js","/assets/cloud-off-CO-aPc4a.js","/assets/cloud-upload-BODK512i.js","/assets/compass-BT0bLICC.js","/assets/concernCategories-C3fDfIVe.js","/assets/corner-down-right-BpDMGpqQ.js","/assets/createLucideIcon-C95664vs.js","/assets/es-CCZxh1Ia.js","/assets/external-link-BKJNAdWN.js","/assets/file-clock-DPS0Bxzl.js","/assets/file-exclamation-point-BrCI7omi.js","/assets/flag-DXVQn-HO.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-jKGfdgIR.js","/assets/funnel-C90A4r15.js","/assets/hash-DXoCPr3N.js","/assets/hourglass-Dj8op6ek.js","/assets/image-BJZEvNwh.js","/assets/image-off-qC64CCi1.js","/assets/inbox-BNMqZ6Dh.js","/assets/index-BBqg5bSC.js","/assets/index-DemTQruw.css","/assets/keyboard-DHkplZIJ.js","/assets/languages-CBC9wWIC.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-UsYKuXqZ.js","/assets/lightbulb-CgLd4NFn.js","/assets/link-2-DBrxENc3.js","/assets/link-2-off-Tmnvj_Dt.js","/assets/list-ordered-B888-qoh.js","/assets/list-tree-CE0ALJVN.js","/assets/lock-open-lkBKBjB8.js","/assets/log-in-W_J8tDj8.js","/assets/marks-7X0GzjkZ.js","/assets/minimize-2-CPzeIbrZ.js","/assets/package-check-GKzbVLDS.js","/assets/pencil-DNptm1FE.js","/assets/percent-B0D5TdlT.js","/assets/pin-5rpG6dv6.js","/assets/pin-off-OGXnD2Bz.js","/assets/play-B0Qg3dgR.js","/assets/plug-zap-BuOLlWkD.js","/assets/prop-types-C5nN3M7B.js","/assets/radio-DQsaVWac.js","/assets/react-apexcharts.esm-DJivgWMO.js","/assets/registers-DT4S1Puq.js","/assets/repeat-CtBJlh4E.js","/assets/save--QfIhq6f.js","/assets/scopeLinks-HsQUAx_K.js","/assets/scroll-text-BVghBeIN.js","/assets/search-x-DreF78ND.js","/assets/segments-BmMcFRY9.js","/assets/send-BTa8u1Nc.js","/assets/settings-2-BeESjx8d.js","/assets/shield-Dd2DH_TX.js","/assets/shield-alert-DYnMTe5o.js","/assets/shield-question-mark-CN6dm6EI.js","/assets/siren-xL1aAcUz.js","/assets/snowflake-DSTZIzmk.js","/assets/split-GhruSOsG.js","/assets/square-check-big-B01thfZu.js","/assets/star-CCQAu8TE.js","/assets/statusBands-CpWiMBJ8.js","/assets/store-BX-5q7fp.js","/assets/table-2-CkL-FYwu.js","/assets/table-properties-D6DNCKuU.js","/assets/tag-djdZP4Mr.js","/assets/timer-off-C6OqRmcP.js","/assets/trending-down-BM7ax75o.js","/assets/trending-up-BsW9-hBF.js","/assets/undo-2-DSqQsDcQ.js","/assets/useChartTheme-BSKRc6jY.js","/assets/useElementWidth-Df8TR75U.js","/assets/useIsMobile-CloWzDVD.js","/assets/useOpenParam-DkTdxSoA.js","/assets/useStatusBands-DLNkeaAi.js","/assets/useUrlScope-JQ1mNWbw.js","/assets/user-DkpN4mKA.js","/assets/user-cog-kjRMsY1s.js","/assets/user-minus-s54dEQyD.js","/assets/users-Czsucgu8.js","/assets/vfx-BUFDkr7T.js","/assets/video-BBf5L4cx.js","/assets/wallet-bj9-m32f.js","/assets/warehouse-CEt-BTw_.js","/assets/workflow-BbNdqXI5.js","/assets/x-DOohr7u3.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
