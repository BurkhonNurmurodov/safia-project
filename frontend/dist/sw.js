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

const BUILD = "2026-10-27T03:03:05.424Z";
const PRECACHE = ["/","/assets/AdminPanel-CrG8YNd8.js","/assets/AnalysisBoard-VDYuhu1o.js","/assets/Arc-D8-rVd53.js","/assets/Assistant-C0Bo8VGK.js","/assets/BrigadirProfile-Hvzec6Yc.js","/assets/BroadcastReceivers-VqY7LeF_.js","/assets/BroadcastRecord-DicZaXC6.js","/assets/Button-DEYnoJud.js","/assets/CatLockNotice-DepCDV6_.js","/assets/CategoryLegendModal-MkpfrGRQ.js","/assets/CellConcerns-CDDlbjgk.js","/assets/CellDetails-Bid5Ob1G.js","/assets/CellFormModal-BGOzZ4yc.js","/assets/CellIdent-C94LnPpn.js","/assets/CellLink-MbTkf7cM.js","/assets/Cells-DWLKvWbh.js","/assets/ColumnFilter-C-e2dM9y.js","/assets/ColumnsPicker-BrNak6Ia.js","/assets/CommentsModal-D8fb2hFS.js","/assets/ComparisonTable-CjueqLzL.js","/assets/Concerns-DbdkCYUO.js","/assets/CountStepper-DY0u35kU.js","/assets/Daily-BThU0mZt.js","/assets/DataTable-Ckqew1h6.js","/assets/DateRangePicker-GqwhWC91.js","/assets/DayReportView-nkvySG0p.js","/assets/DayStepper-B4wEOv5z.js","/assets/DayStrip-NG2YWPnY.js","/assets/DifferenceBreakdown-IPxZ7gGL.js","/assets/Downtime-Djgt3Gu3.js","/assets/Education-CFpznRCn.js","/assets/EducationLesson-BflXqL0g.js","/assets/EmptyState-ZjvRxcuX.js","/assets/Exam-BEBW0bOM.js","/assets/FactorySelect-C4DYdRYD.js","/assets/Gamification-Bza781q6.js","/assets/GroupBadge-Sm5m4-3T.js","/assets/HeatmapChart-DFq_IZ45.js","/assets/IdleCell-Ci7RIVQl.js","/assets/KPICard-qIs0driH.js","/assets/Kaizen-By4UZSL1.js","/assets/Kelish-CV_xznH3.js","/assets/KpiDeltaCard-A7EFVfIk.js","/assets/LangTextInput-DfcLA_w-.js","/assets/Layout-CY8Peatz.js","/assets/LeaderAppeal-iNWNbHTf.js","/assets/LeaderDayReport-CivgoevO.js","/assets/LeaderUnitReport-BYNi8VKf.js","/assets/Leaderboard-8JivTRmv.js","/assets/Leaders-iTUvsHJZ.js","/assets/LeadersKpi-EODtImsM.js","/assets/Lightbox-ypm_49H3.js","/assets/LiveOverview-DUlBfZjM.js","/assets/Login-C734G7OQ.js","/assets/NotFound-iTNG0Wka.js","/assets/Notifications--Npbn2ts.js","/assets/Ontime-BjPIez2q.js","/assets/Overview-DvvL-dvC.js","/assets/Pagination-DToa83Rf.js","/assets/PerenaladkaFactTable-DLQC6-u4.js","/assets/PersonCard-DNHjcDxc.js","/assets/PlanFulfillment-4yfl6rm7.js","/assets/Production-Cr1NkxWQ.js","/assets/Profile-DqB92AvO.js","/assets/ProofCamera-C6DEyoWj.js","/assets/ProofPhoto-CGaKsF0X.js","/assets/Quality-BRLd05QT.js","/assets/RawRows-oMXj44ES.js","/assets/Reports-C8CCjBHy.js","/assets/RequestStateChip-0GeeQxvV.js","/assets/RichTextEditor-an4J2IKe.js","/assets/SaveState-CrbvgWmc.js","/assets/SearchInput-BRgqD6Md.js","/assets/SeasonalityHeatmap-CYGUMtrA.js","/assets/SegmentedToggle-CBG00G0G.js","/assets/SetupTimes-BOOtsMI-.js","/assets/ShiftDaily-B0uXF0mR.js","/assets/Staff-MQlhoQIW.js","/assets/StaffListAtCheck-DzMC7YTk.js","/assets/StatusBadge-CORkOfs3.js","/assets/StatusBandsModal-DnijH-sx.js","/assets/TargetGoal-Drqh9FuZ.js","/assets/Targets-Ds4ncLZK.js","/assets/Tasks-SKailB2m.js","/assets/TimeWheelPicker-CUVpk5d7.js","/assets/Toast-C3YWaPou.js","/assets/Tooltip-KMV8fEu6.js","/assets/TrendChart-CT_eRDT7.js","/assets/TripleSpeedometer-Buc3KhVS.js","/assets/Trudoyomkost-BSECApIK.js","/assets/UploadDropzone-C-cyTndR.js","/assets/UsersActivity-IbJJunEu.js","/assets/VerdictBlock-DUcQ_jLY.js","/assets/VfxApiMap-DhDUcmtC.js","/assets/VfxDictionaries-BNZPkymH.js","/assets/VfxEmployees-iSwMvXWy.js","/assets/VfxHrMoves-BhLAjn9R.js","/assets/VfxJobs-IkTwJguS.js","/assets/VfxPhoto-CozwxGL6.js","/assets/VfxShifts-B_Zim0MD.js","/assets/VfxState-Dz9hhjSv.js","/assets/VfxTimebooks-C1ejjAhm.js","/assets/VfxTimesheet-73T8akVY.js","/assets/WatchProgress-BN4tX3VZ.js","/assets/WebLogin-DJBxjF9_.js","/assets/Workers-DTzR4AiJ.js","/assets/Zagruzka-BkGN-Vjj.js","/assets/ZagruzkaCell-Dkkp1mWM.js","/assets/api-BFm7MSgf.js","/assets/archive-Dg-2RmzN.js","/assets/archive-restore-Bnaz0Yyl.js","/assets/arrow-down-DPiYJCvc.js","/assets/arrow-down-right-Dx6bN7VH.js","/assets/arrow-down-wide-narrow-Ct0hX1ju.js","/assets/arrow-up-narrow-wide-COfKN6Oy.js","/assets/ban-BSPPKreb.js","/assets/boxes-BJPpV2Ia.js","/assets/braces-BjDdmvHg.js","/assets/brigadirFilters-zXi063G7.js","/assets/broadcastTree-ButrEMal.js","/assets/building-2-DUAnwRoH.js","/assets/calendar-BUcFDwlP.js","/assets/calendar-days-HU8OaEMI.js","/assets/camera-Di0q7HpZ.js","/assets/categories-UYiejH-i.js","/assets/cellMoveRefusal-Dx28RZvQ.js","/assets/cellName-BTmmfvZn.js","/assets/chart-column-BRWf92pv.js","/assets/chart-line-CtI_IYcD.js","/assets/chart-pie-C3UWhNln.js","/assets/chartRange-C6O0bNxR.js","/assets/check-check-DTuQUyiH.js","/assets/chevron-left-D0n239TI.js","/assets/chevrons-up-down-BVEla2Tg.js","/assets/circle-DePv7vh_.js","/assets/circle-alert-B1_bxXOF.js","/assets/circle-check-big-BsJStzgU.js","/assets/circle-dashed-BcqCJfiB.js","/assets/circle-minus-DRlXvtoK.js","/assets/circle-question-mark-nKMXTS7s.js","/assets/circle-slash-mNSQIfpq.js","/assets/circle-user-round-Dv5NCmIr.js","/assets/cloud-off-2Ukb6VVY.js","/assets/cloud-upload-B6TBb5rR.js","/assets/coins-BbixfWcb.js","/assets/compass-Bqtiz-0j.js","/assets/concernCategories-jKZwzuit.js","/assets/corner-down-right-DppeuNJP.js","/assets/createLucideIcon-BHNllaTg.js","/assets/en-RAlwp2tS.js","/assets/es-Dtgc5NM1.js","/assets/external-link-D8F9wIi5.js","/assets/file-clock-Bmf_KXtk.js","/assets/file-exclamation-point-C1Jh2zHY.js","/assets/flag-BnEDxe9F.js","/assets/formatters-YGHSWdVb.js","/assets/formulas-ClUANLBI.js","/assets/funnel-0nTSVidR.js","/assets/hash-CbcCEXTX.js","/assets/hourglass-DpMSrTOS.js","/assets/idleTime-CHPnJRpw.js","/assets/image-B0NO-Ndq.js","/assets/image-off-CwcVaKIg.js","/assets/inbox-CFTHplme.js","/assets/index-BtYmuUYW.css","/assets/index-CPwxXnAU.js","/assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2","/assets/inter-cyrillic-wght-normal-DqGufNeO.woff2","/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2","/assets/inter-latin-wght-normal-Dx4kXJAl.woff2","/assets/keyboard-DUKc6J-k.js","/assets/languages-wQEmnmK_.js","/assets/latinCode-DckTgOCZ.js","/assets/layers-BZjRfKBY.js","/assets/leaderBoard-HXTnGU8b.js","/assets/lightbulb-Dl-pe6EC.js","/assets/link-2-B1-g9-sL.js","/assets/link-2-off-C_mTjf62.js","/assets/list-ordered-Dkw_kObY.js","/assets/list-tree-RxelI11T.js","/assets/lock-open-CCcm8xge.js","/assets/log-in-CdNROnDX.js","/assets/map-pin-BQEkyUV3.js","/assets/marks-CXg8zrOF.js","/assets/minimize-2-D81_3VSD.js","/assets/package-check-CUNCsErM.js","/assets/pencil-CP3rXt4d.js","/assets/percent-k0fDSkKR.js","/assets/pin-CpT2R5h_.js","/assets/pin-off-x6nOfLIe.js","/assets/play-CyNpyPGU.js","/assets/plug-zap-C7O9hQcY.js","/assets/prop-types-RD3fbola.js","/assets/radio-Dy3B2NYK.js","/assets/react-apexcharts.esm-CYfFGqCr.js","/assets/registers-CFl8El1Q.js","/assets/repeat-DtwUeFhM.js","/assets/ru-RUoQIucl.js","/assets/save-_mdNYlzR.js","/assets/scopeLinks-CyKqq-ks.js","/assets/scroll-text-CVd4vX4o.js","/assets/search-x-CU8LG57r.js","/assets/segments-D5Uiedtv.js","/assets/send-CCMn413p.js","/assets/settings-2-h5xDETKP.js","/assets/shield-DmW7T6DV.js","/assets/shield-alert-DrruOZnv.js","/assets/shield-question-mark-B8UmoJ8D.js","/assets/sigma-Cm4azrT_.js","/assets/siren-ZS9dgD5H.js","/assets/snowflake-DBGRxYRH.js","/assets/split-CdMHkoZ1.js","/assets/square-check-big-5hORykZX.js","/assets/star-DMB26_CI.js","/assets/statusBands-DVBZcBq3.js","/assets/store-DQ5jhWLV.js","/assets/table-2-CRQ6M9ci.js","/assets/table-properties-DvmElYdc.js","/assets/tag-B98LpMDW.js","/assets/timer-off-DRbSZUmL.js","/assets/translations-BYm6QkQo.js","/assets/trendBuckets-V--Bl7ln.js","/assets/trending-down-DPnIuqax.js","/assets/trending-up-DcYfcMPh.js","/assets/turnoverUtil-D2bwyxDa.js","/assets/undo-2-BByUibKK.js","/assets/useChartTheme-DxuhNLhw.js","/assets/useElementWidth-Bmccqr7G.js","/assets/useIsMobile-DH1aA341.js","/assets/useOpenParam-Bh0MWgKp.js","/assets/useStatusBands-xwRQaX7D.js","/assets/useUrlScope-CBrsfw7O.js","/assets/user-D6v7w4Cr.js","/assets/user-cog-M4v3Wzrx.js","/assets/user-minus-bb0gDR4s.js","/assets/users-Bqt1Cr7C.js","/assets/uz-Cu3l-EXj.js","/assets/uz_cyrl-BhoUlSF7.js","/assets/vfx-BP6X-vwB.js","/assets/video-D3JdDOzh.js","/assets/wallet-qqzplxAu.js","/assets/warehouse-CfSLsOAl.js","/assets/workflow-DEkGlGER.js","/assets/x-CigRPOSZ.js","/assets/zap-DmMOwQ-Y.js","/icons/icon-192-maskable-v2.png","/icons/icon-192-v2.png","/icons/icon-512-maskable-v2.png","/icons/icon-512-v2.png","/manifest.webmanifest","/telegram-web-app.js","/favicon.ico","/favicon-32-v2.png","/favicon-192-v2.png","/apple-touch-icon-v2.png","/icons.svg","/logo.png","/logo-light-v2.png"];
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
