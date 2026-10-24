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

const BUILD = "2026-10-24T12:42:23.724Z";
const PRECACHE = ["/","/assets/AdminPanel-BT3iVu9l.js","/assets/AnalysisBoard-CV7tN_sH.js","/assets/Arc-B-YJPckK.js","/assets/Assistant-BP-0Aq9R.js","/assets/BrigadirProfile-BQ0Wkt6g.js","/assets/BroadcastReceivers-CKejOijp.js","/assets/BroadcastRecord-Bnv39uaL.js","/assets/Button-BiQCA9E_.js","/assets/CatLockNotice-CjUwC_h4.js","/assets/CategoryLegendModal-CyJE9FKq.js","/assets/CellConcerns-BDYG_YNk.js","/assets/CellDetails-DIzbwUWM.js","/assets/CellFormModal-DWE4FP55.js","/assets/CellIdent-BaWzzENz.js","/assets/CellLink-DJrHBBQa.js","/assets/Cells-5mzpYeev.js","/assets/ColumnFilter-DxDJHdRL.js","/assets/ColumnsPicker-CuAm6YZX.js","/assets/CommentsModal-CJibHO6b.js","/assets/ComparisonTable-C4JS8LJ1.js","/assets/Concerns-DwhTjX6G.js","/assets/CountStepper-CR_gBDfu.js","/assets/Daily-CxA0S1qy.js","/assets/DataTable-Dh3oZUu4.js","/assets/DateRangePicker-Dsi6xIXc.js","/assets/DayReportView-CHy-thWu.js","/assets/DayStepper-tXI2NEkI.js","/assets/DayStrip-DI107LH7.js","/assets/DifferenceBreakdown-Bc8UoneJ.js","/assets/Downtime-C1dEStEP.js","/assets/Education-DDJTfDG5.js","/assets/EducationLesson-C9CCrtKt.js","/assets/EmptyState-CZzXyNDV.js","/assets/Exam-CHTOvquz.js","/assets/FactorySelect-Ch6pYaT6.js","/assets/Gamification-BaTOLBnD.js","/assets/GroupBadge-qUvQ_rxC.js","/assets/HeatmapChart-BBhn15gZ.js","/assets/IdleCell-CLTaEiX3.js","/assets/KPICard-C11-t_xa.js","/assets/Kaizen-josw6PPL.js","/assets/Kelish-Cb_dG3BP.js","/assets/KpiDeltaCard-D9LAkQ7e.js","/assets/LangTextInput-DB5Ri6xp.js","/assets/Layout-c6Ny2Mwi.js","/assets/LeaderAppeal-ySENqWnf.js","/assets/LeaderDayReport-CSmYC3wt.js","/assets/LeaderUnitReport-C73_1Sxt.js","/assets/Leaderboard-BXmnpdug.js","/assets/Leaders-2LZ_E1Tm.js","/assets/LeadersKpi-CqFQtQoU.js","/assets/Lightbox-D_WFu3da.js","/assets/LiveOverview-CaLh-lwp.js","/assets/Login-w_wVGg2L.js","/assets/NotFound-8ME8v1zy.js","/assets/Notifications-DxicJgl6.js","/assets/Ontime-iVyRo1Ep.js","/assets/Overview-Dl4ixf7e.js","/assets/Pagination-CajayW40.js","/assets/PerenaladkaFactTable-DVIM2EWb.js","/assets/PersonCard-D_zo9saf.js","/assets/PlanFulfillment-BeaEKc-e.js","/assets/Production-BDH8MtVD.js","/assets/Profile-DmCInMud.js","/assets/ProofCamera-D1Ls5VMN.js","/assets/ProofPhoto-Cz1MXnwT.js","/assets/Quality-BMdE32QM.js","/assets/RawRows-BKiY7DNS.js","/assets/RequestStateChip-DJasopuO.js","/assets/RichTextEditor-sdbosMC3.js","/assets/SaveState-DOaxkaxl.js","/assets/SearchInput-C9QyXH5m.js","/assets/SeasonalityHeatmap-Dqxfb5jp.js","/assets/SegmentedToggle-B_1OGGkz.js","/assets/SetupTimes-COJR5HPp.js","/assets/ShiftDaily-0NBa12Df.js","/assets/Staff-D9C9Rgk7.js","/assets/StaffListAtCheck-DatiSmfn.js","/assets/StatusBadge-BRnGxxcv.js","/assets/StatusBandsModal-CpPQuIsl.js","/assets/TargetGoal-BsthNgff.js","/assets/Targets-C9JrxV_X.js","/assets/Tasks-y5ors4w2.js","/assets/TimeWheelPicker-B2chF75-.js","/assets/Toast-mN0LR6-B.js","/assets/Tooltip-Dmlglyjn.js","/assets/TrendChart-DBcpahh5.js","/assets/TripleSpeedometer-CbFnE205.js","/assets/Trudoyomkost-DW0rGi2V.js","/assets/UploadDropzone-C9qFPQAa.js","/assets/UsersActivity-CIM7Ojk8.js","/assets/VerdictBlock-Bi2BNBxG.js","/assets/VfxApiMap-Ba3Bj0YF.js","/assets/VfxDictionaries-DmvXEn-r.js","/assets/VfxEmployees-8dIChclz.js","/assets/VfxHrMoves-Cs27YnOV.js","/assets/VfxJobs-Da65Ph3z.js","/assets/VfxPhoto-BO8Ig1O9.js","/assets/VfxShifts-Da2g41Za.js","/assets/VfxState-BCdpehRF.js","/assets/VfxTimebooks-B0sbfgDg.js","/assets/VfxTimesheet-Cw9eOb4M.js","/assets/WatchProgress-jrI0g-c7.js","/assets/WebLogin-DdnOK1xX.js","/assets/Workers-BrlPdkQH.js","/assets/Zagruzka-DnUVxckn.js","/assets/ZagruzkaCell-x6fXTItW.js","/assets/api-BFm7MSgf.js","/assets/archive-CTUVl1CP.js","/assets/archive-restore-yt7LdZlU.js","/assets/arrow-down-D5kqA_YG.js","/assets/arrow-down-right-BTZDUl5W.js","/assets/arrow-down-wide-narrow-B1sYWUch.js","/assets/arrow-up-narrow-wide-y-fCWmU5.js","/assets/ban-CrOffyll.js","/assets/boxes-BuyJlnIe.js","/assets/braces-CkBy6byp.js","/assets/brigadirFilters-BQt3U7VO.js","/assets/broadcastTree-C1byGNig.js","/assets/building-2-BHPGN7wf.js","/assets/calendar-D_n4copd.js","/assets/calendar-days-BJxAE48P.js","/assets/camera-CLEST-cV.js","/assets/categories-DLKv3kRN.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-b0VTfu00.js","/assets/chart-line-BTTC9oEZ.js","/assets/chart-pie-lUfDsSca.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-DfQuQzqi.js","/assets/chevron-left-Lf3zARaw.js","/assets/chevrons-up-down-BxNVemlE.js","/assets/circle-CxQJ28ws.js","/assets/circle-alert-B4EHirCE.js","/assets/circle-check-big-BmQQWLic.js","/assets/circle-dashed-CNLHXPwS.js","/assets/circle-minus-DnNr0Efk.js","/assets/circle-question-mark-PoDys5f7.js","/assets/circle-slash-B-bNvstS.js","/assets/circle-user-round-nw7ogB5x.js","/assets/cloud-off-CI3gMHsi.js","/assets/cloud-upload-0VYnFEMz.js","/assets/compass-VPpq4XjD.js","/assets/concernCategories-C73XnAw7.js","/assets/corner-down-right-CO2J6rbm.js","/assets/createLucideIcon-B_vbTC8x.js","/assets/en-Ft4DxMLd.js","/assets/es-Dtgc5NM1.js","/assets/external-link-DyE-GPn4.js","/assets/file-clock-DMw-1lBu.js","/assets/file-exclamation-point-DwEKo8RN.js","/assets/flag-T7eFR2EQ.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-D_CwrzmB.js","/assets/funnel-BLNELGNi.js","/assets/hash-qmHi7n8N.js","/assets/hourglass-Bpl8svre.js","/assets/image-DQCUBJt0.js","/assets/image-off-SLK4DhkT.js","/assets/inbox-CLFyfehb.js","/assets/index-B-xlMnEH.css","/assets/index-C4uXQahM.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-CWMXWqzE.js","/assets/languages-BAuYBEt4.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-CCWWP1ov.js","/assets/leaderBoard-BF4W-VAI.js","/assets/lightbulb-BNHkr7xA.js","/assets/link-2-DZ7JFwan.js","/assets/link-2-off-DHI8ZXOl.js","/assets/list-ordered-BGAV7NID.js","/assets/list-tree-BmnwXayS.js","/assets/lock-open-YQy4i5TS.js","/assets/log-in-Dm-JZTNr.js","/assets/map-pin-kL5K_fbn.js","/assets/marks-C94SK-kM.js","/assets/minimize-2-zlzkAyW1.js","/assets/package-check-CsmA1Ui7.js","/assets/pencil-DO6-uKNy.js","/assets/percent-B6E4_oTJ.js","/assets/pin-BV0DKnOG.js","/assets/pin-off-Beopv0ad.js","/assets/play-DlzUrt2i.js","/assets/plug-zap-CBIRTFzm.js","/assets/prop-types-RD3fbola.js","/assets/radio-e9hfvF1k.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-BW6ozRgC.js","/assets/repeat-QsdMOFEw.js","/assets/ru-BUyzLbRf.js","/assets/save-D5u_Gwfu.js","/assets/scopeLinks-Dezk3Bo5.js","/assets/scroll-text-BF1weZtm.js","/assets/search-x-DTC8KVI2.js","/assets/segments-D5Uiedtv.js","/assets/send-CKf2bpC3.js","/assets/settings-2-C_OlsSNE.js","/assets/shield-CwHyQECi.js","/assets/shield-alert-B7yGGjtR.js","/assets/shield-question-mark-CEPxS0bw.js","/assets/sigma-BmBgK1iN.js","/assets/siren-B2siadQR.js","/assets/snowflake-DtuJbWtB.js","/assets/split-D8By_Wfo.js","/assets/square-check-big-D7CC8_d_.js","/assets/star-B_5oH0eT.js","/assets/statusBands-DVBZcBq3.js","/assets/store-SRdw5KOF.js","/assets/table-2-DTG4E-Fq.js","/assets/table-properties-DF9HBy7q.js","/assets/tag-u3MrcK_S.js","/assets/timer-off-Bu62NFXT.js","/assets/translations-BpBE_Ud2.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-D_7m56E_.js","/assets/trending-up-CTVJg-bE.js","/assets/undo-2-DZ3f4tkt.js","/assets/useChartTheme-CZdh1YCA.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-Dp-gikq0.js","/assets/useStatusBands-DpOmNU0B.js","/assets/useUrlScope-BeXtvbZs.js","/assets/user-C3F5s0MN.js","/assets/user-cog-BO7lpdmU.js","/assets/user-minus-DvCtVCj2.js","/assets/users-4-p15z04.js","/assets/uz-CdBxiWsh.js","/assets/uz_cyrl-DxDpAYYR.js","/assets/vfx-C_LLP4Ux.js","/assets/video-CU5A7KK3.js","/assets/wallet-D-7AtFmY.js","/assets/warehouse-CdefA-fb.js","/assets/workflow-BDKssAuQ.js","/assets/x-B4LS_c-g.js","/assets/zap-lcJ0fEP8.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
