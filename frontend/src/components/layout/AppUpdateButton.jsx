import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownCircle, CheckCircle2, Info, Loader2, RefreshCw, Smartphone,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import {
  APK_DOWNLOAD_URL, apkPercent, apkUpdate, apkUpdateNative, apkUpdateShown, apkVersionName,
  checkLatest, compareVersions, useApkUpdate,
} from "../../utils/androidUpdate";
import { fmtStamp } from "../../utils/version";

/**
 * «Yangilanishni tekshirish» — the Android app's own update, one row above
 * «Versiya» at the foot of the sidebar (CLAUDE.md «The Android app» → «The
 * update button»). The pages follow every deploy by themselves; the APK
 * around them does not, and this is where a person asks whether a newer one
 * is published and watches it arrive.
 *
 * The row turns gold and says «Yangilanish bor» (with a dot) once the app
 * knows of a newer APK, and «Yuklanmoqda… 42%» while one downloads — the
 * window can be closed mid-download, and the row is then the only trace of
 * it. The window states ONE thing at a time: checking · up to date · nothing
 * published · a new version (or one already downloaded, ready to install) ·
 * the download's progress · what failed. On a 1.7.0+ APK the app does the
 * work and reports every step (utils/androidUpdate.js ↔ AppUpdates.java); on
 * an older one the page checks by itself and hands the file to the phone's
 * browser, which is all such an app can do.
 */
export default function AppUpdateButton({ expanded = true }) {
  // Fixed for the page's whole life (the user agent, the kind of session), so
  // the early return never changes the hooks that run below it.
  if (!apkUpdateShown()) return null;
  return <UpdateRow expanded={expanded} />;
}

const fill = (s, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, v), s);

function UpdateRow({ expanded }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const app = useApkUpdate();
  const downloading = app?.phase === "downloading";
  const available = app?.phase === "available";
  const pct = downloading ? apkPercent(app) : null;
  const lit = available || downloading;
  // The label follows what the app knows: a question, then the answer — and
  // the row stays the same row in the same place, whichever it says.
  const label = t(downloading ? "ui.apkUpdate.rowDownloading"
    : available ? "ui.apkUpdate.rowAvailable" : "ui.apkUpdate.check");
  const spoken = downloading ? `${label} ${pct}%` : label;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={!expanded ? spoken : undefined}
        aria-label={spoken}
        className="nav-item w-full flex items-center rounded-lg text-sm transition-colors"
        style={{
          gap: "12px",
          padding: "10px",
          color: "var(--text-3)",
          justifyContent: !expanded ? "center" : undefined,
        }}
      >
        <span className="relative flex-shrink-0">
          <RefreshCw size={16} style={lit ? { color: "var(--brand)" } : undefined} />
          {lit && !expanded && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: "var(--brand)" }} />
          )}
        </span>
        <span
          className="flex-1 min-w-0 truncate whitespace-nowrap text-left transition-all duration-200"
          style={{ opacity: expanded ? 1 : 0, maxWidth: expanded ? 200 : 0, overflow: "hidden", display: "block" }}
        >
          {label}
        </span>
        {expanded && downloading && (
          <span
            className="flex-shrink-0 text-[11px] font-semibold tabular-nums text-right"
            style={{ color: "var(--brand)", minWidth: 34 }}
          >
            {pct}%
          </span>
        )}
        {expanded && available && (
          <span aria-hidden className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: "var(--brand)" }} />
        )}
      </button>

      {open && <UpdateModal onClose={() => setOpen(false)} />}
    </>
  );
}

/** How long the app has to answer before the window checks by itself instead. */
const ANSWER_MS = 4000;

function UpdateModal({ onClose }) {
  const app = useApkUpdate();
  const [silent, setSilent] = useState(false);
  const answered = useRef(false);
  // An APK without the bridge, a screen with no updater (it says
  // «unavailable»), or an app that never answered: the page checks by itself.
  const legacy = !apkUpdateNative() || silent || app?.phase === "unavailable";

  useEffect(() => {
    if (app) answered.current = true;
  }, [app]);

  useEffect(() => {
    if (legacy) return undefined;
    // The window is open: the app keeps its own update dialog out of the way,
    // and asks the server NOW rather than at its next half-hourly check.
    apkUpdate("watch");
    apkUpdate("check");
    const timer = setTimeout(() => {
      if (!answered.current) setSilent(true);
    }, ANSWER_MS);
    return () => {
      clearTimeout(timer);
      apkUpdate("unwatch");
    };
  }, [legacy]);

  return legacy
    ? <LegacyWindow onClose={onClose} />
    : <Window view={nativeView(app)} onClose={onClose} />;
}

/** The app's state as the window shows it. */
function nativeView(app) {
  const phase = !app || app.phase === "idle" || app.phase === "unavailable" ? "checking" : app.phase;
  return {
    phase,
    error: app?.error || "",
    installed: app?.running?.name || apkVersionName(),
    latest: app?.latest
      ? { name: app.latest.name, size: app.latest.size, publishedAt: app.latest.publishedAt }
      : null,
    pct: apkPercent(app),
    got: Number(app?.got) || 0,
    total: Number(app?.total) || 0,
    downloaded: !!app?.downloaded,
    installerOpened: !!app?.installerOpened,
    canInstall: app?.canInstall !== false,
    act: {
      start: () => apkUpdate("start"),
      cancel: () => apkUpdate("cancel"),
      check: () => apkUpdate("check"),
      retry: () => apkUpdate(app?.error === "check" ? "check" : "start"),
    },
  };
}

/** 1.4.0–1.6.x: the page asks the server, and the phone's browser downloads. */
function LegacyWindow({ onClose }) {
  const [handedOff, setHandedOff] = useState(false);
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ["apk-latest"],
    queryFn: checkLatest,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const installed = apkVersionName();
  const cmp = data ? compareVersions(data.version_name, installed) : null;
  const phase = isFetching ? "checking"
    : isError ? "failed"
      : data === null ? "none"
        : data && cmp !== null && cmp <= 0 ? "current"
          : data ? "available" : "checking";
  const view = {
    phase,
    error: isError ? "check" : "",
    installed,
    latest: data ? { name: data.version_name, size: data.size, publishedAt: data.published_at } : null,
    legacy: true,
    handedOff,
    canInstall: true,
    act: {
      check: () => refetch(),
      retry: () => refetch(),
      // The web view gives a download to the phone's browser (MainActivity's
      // download listener): Android shows its progress, and its file installs.
      // A link rather than a navigation, so no page's «leave?» guard fires.
      download: () => {
        setHandedOff(true);
        const a = document.createElement("a");
        a.href = data?.url || APK_DOWNLOAD_URL;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
    },
  };
  return <Window view={view} onClose={onClose} />;
}

const mbOf = (bytes) => (Math.max(0, Number(bytes) || 0) / 1048576).toFixed(1);

const TONES = {
  ok: { ink: "var(--status-ok)", bg: "rgba(34,197,94,0.12)" },
  bad: { ink: "var(--status-bad)", bg: "rgba(239,68,68,0.12)" },
  brand: { ink: "var(--brand)", bg: "var(--brand-bg)" },
  neutral: { ink: "var(--text-3)", bg: "var(--bg-inner)" },
};

const FAILED = {
  check: ["ui.apkUpdate.failCheck", "ui.apkUpdate.failText"],
  download: ["ui.apkUpdate.failDownload", "ui.apkUpdate.failText"],
  mismatch: ["ui.apkUpdate.failMismatch", "ui.apkUpdate.failMismatchText"],
  install: ["ui.apkUpdate.failInstall", "ui.apkUpdate.failText"],
  settings: ["ui.apkUpdate.failSettings", "ui.apkUpdate.failSettingsText"],
};

function Window({ view, onClose }) {
  const { t } = useLang();
  const { phase, latest } = view;
  const mb = (bytes) => fill(t("ui.apkUpdate.mb"), { n: mbOf(bytes) });
  const vName = latest?.name ? `v${latest.name}` : "";
  const ready = phase === "available" && view.downloaded;

  let hero;
  if (phase === "checking") {
    hero = { tone: "neutral", Icon: Loader2, spin: true, title: t("ui.apkUpdate.checking"), text: t("ui.apkUpdate.checkingText") };
  } else if (phase === "current") {
    hero = {
      tone: "ok", Icon: CheckCircle2, title: t("ui.apkUpdate.current"),
      text: fill(t("ui.apkUpdate.currentText"), { v: view.installed ? `v${view.installed}` : "" }),
    };
  } else if (phase === "none") {
    hero = { tone: "neutral", Icon: Info, title: t("ui.apkUpdate.none"), text: t("ui.apkUpdate.noneText") };
  } else if (phase === "downloading") {
    hero = { tone: "brand", Icon: ArrowDownCircle, title: t("ui.apkUpdate.downloading"), text: t("ui.apkUpdate.downloadingText") };
  } else if (ready) {
    hero = {
      tone: "brand", Icon: ArrowDownCircle, title: t("ui.apkUpdate.ready"),
      text: view.installerOpened ? t("ui.apkUpdate.openedText") : fill(t("ui.apkUpdate.readyText"), { v: vName }),
    };
  } else if (phase === "available") {
    hero = {
      tone: "brand", Icon: ArrowDownCircle, title: t("ui.apkUpdate.available"),
      text: fill(t("ui.apkUpdate.availableText"), { v: vName, size: mb(latest?.size) }),
    };
  } else {
    const [title, text] = FAILED[view.error] || FAILED.download;
    hero = { tone: "bad", Icon: AlertTriangle, title: t(title), text: t(text) };
  }
  const tone = TONES[hero.tone];

  // One primary action per state, on the right; the way out on the left.
  let footer;
  if (phase === "downloading") {
    footer = (
      <>
        <Button variant="secondary" onClick={view.act.cancel}>{t("ui.apkUpdate.stop")}</Button>
        <Button variant="primary" onClick={onClose}>{t("ui.apkUpdate.close")}</Button>
      </>
    );
  } else {
    let action = null;
    if (phase === "available") {
      action = view.legacy
        ? <Button variant="primary" onClick={view.act.download}>{t("ui.apkUpdate.download")}</Button>
        : (
          <Button variant="primary" onClick={view.act.start}>
            {t(ready ? "ui.apkUpdate.install" : "ui.apkUpdate.update")}
          </Button>
        );
    } else if (phase === "failed") {
      action = <Button variant="primary" onClick={view.act.retry}>{t("ui.apkUpdate.retry")}</Button>;
    } else if (phase === "current" || phase === "none") {
      action = (
        <Button variant="secondary" icon={<RefreshCw size={13} />} onClick={view.act.check}>
          {t("ui.apkUpdate.recheck")}
        </Button>
      );
    }
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>{t("ui.apkUpdate.close")}</Button>
        {action}
      </>
    );
  }

  const hint = phase === "available" && view.legacy
    ? t(view.handedOff ? "ui.apkUpdate.legacyStarted" : "ui.apkUpdate.legacyHint")
    : phase === "available" && !ready && !view.canInstall
      ? t("ui.apkUpdate.permissionHint")
      : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={t("ui.apkUpdate.title")}
      icon={<Smartphone size={16} />}
      maxWidth="max-w-sm"
      // The rail climbs to z-50 while it hovers open and the phone drawer sits
      // at z-40 — the «Versiya» dialog's reasoning, the same number.
      zIndex={70}
      footer={footer}
    >
      <div className="flex items-start gap-3" role="status" aria-live="polite">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: tone.bg, color: tone.ink }}
        >
          <hero.Icon size={20} className={hero.spin ? "animate-spin" : undefined} />
        </span>
        <div className="min-w-0 pt-0.5">
          <div className="text-sm font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
            {hero.title}
          </div>
          <div className="text-xs mt-1 leading-snug" style={{ color: "var(--text-2)" }}>{hero.text}</div>
        </div>
      </div>

      {phase === "downloading" && (
        <div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "var(--bg-accent)" }}
            role="progressbar"
            aria-valuenow={view.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("ui.apkUpdate.progress")}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${view.pct}%`, background: "var(--brand)" }}
            />
          </div>
          <div className="flex items-baseline justify-between mt-1.5 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            <span className="font-semibold" style={{ color: "var(--text-1)" }}>{view.pct}%</span>
            <span>{mbOf(view.got)} / {mb(view.total)}</span>
          </div>
        </div>
      )}

      <div
        className="rounded-xl px-3 py-2.5 space-y-2"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
      >
        <Row label={t("ui.apkUpdate.installed")} value={view.installed ? `v${view.installed}` : "—"} />
        <Row
          label={t("ui.apkUpdate.latest")}
          value={
            // The size only matters for a version still to be downloaded.
            latest ? (phase === "current" ? vName : `${vName} · ${mb(latest.size)}`)
              : phase === "checking" ? <SkeletonBlock className="h-3.5 w-24" /> : "—"
          }
        />
        {latest?.publishedAt && fmtStamp(latest.publishedAt) && (
          <Row label={t("ui.apkUpdate.published")} value={fmtStamp(latest.publishedAt).slice(0, 10)} />
        )}
      </div>

      {hint && (
        <div className="flex items-start gap-2 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
          <Info size={13} className="flex-shrink-0 mt-px" />
          <span>{hint}</span>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[18px]">
      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{label}</span>
      <div className="text-xs font-medium tabular-nums truncate" style={{ color: "var(--text-1)" }}>{value}</div>
    </div>
  );
}
