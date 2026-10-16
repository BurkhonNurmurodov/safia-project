/**
 * The band under the header while the server cannot be reached: the pages go
 * on showing what they loaded last (utils/offlineCache.js), and this says so —
 * «Internet yo'q · 14:05 dan beri · oxirgi yuklangan ma'lumotlar
 * ko'rsatilmoqda», with how many sections on screen have nothing cached yet,
 * and a Retry that probes the server now. When the connection is back it
 * turns green for a moment («Aloqa tiklandi — ma'lumotlar yangilanmoqda»)
 * while every page on screen re-reads (App.jsx), then goes away.
 *
 * A band and not a Toast: a toast is for something that happened, this is a
 * STATE the reader must keep in mind for as long as it lasts, and the top
 * right already holds the update prompt. Same shape as ExamBand («nothing
 * here is real»), rendered by Layout right under it.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw, Wifi, WifiOff } from "lucide-react";
import { useLang } from "../../context/LangContext";
import Button from "../ui/Button";
import { probeNow, useConnectivity } from "../../utils/connectivity";
import { cacheable } from "../../utils/offlineCache";

const FLASH_MS = 3_500;
const pad = (n) => String(n).padStart(2, "0");
const clock = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const bandStyle = (ok) => ({
  minHeight: 36,
  background: ok ? "rgba(34,197,94,0.14)" : "rgba(234,179,8,0.16)",
  color: "var(--text-1)",
  borderBottom: "1px solid var(--border)",
});

/** Sections on screen that have never loaded — a query somebody is watching,
 *  still pending, with nothing cached to show. Re-counted as the cache moves,
 *  a beat late so a burst of mounts is one count. */
function usePendingSections(qc) {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const cache = qc.getQueryCache();
    let timer = null;
    const recount = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const n = cache
          .findAll({ type: "active" })
          .filter((q) => cacheable(q) && q.state.status === "pending" && q.state.data === undefined).length;
        setPending(n);
      }, 300);
    };
    recount();
    const unsub = cache.subscribe(recount);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [qc]);
  return pending;
}

function DownBand({ reason, since }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const pending = usePendingSections(qc);
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    setRetrying(true);
    try {
      await probeNow();
    } finally {
      setRetrying(false);
    }
  };
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 px-4 md:px-6 py-1.5" style={bandStyle(false)}>
      <WifiOff size={15} className="flex-shrink-0" style={{ color: "var(--status-warn)" }} />
      <span className="text-xs leading-snug min-w-0 line-clamp-2">
        <span className="font-semibold">{t(reason === "server" ? "offline.server" : "offline.net")}</span>
        {since ? <span style={{ color: "var(--text-3)" }}> · {t("offline.since").replace("{t}", clock(since))}</span> : null}
        <span style={{ color: "var(--text-2)" }}> · {t("offline.cached")}</span>
        {pending > 0 && (
          <span style={{ color: "var(--text-2)" }}> · {t("offline.pending").replace("{n}", String(pending))}</span>
        )}
      </span>
      <span className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        icon={<RotateCw size={14} className={retrying ? "animate-spin" : ""} />}
        onClick={retry}
        disabled={retrying}
      >
        {t("common.retry")}
      </Button>
    </div>
  );
}

/** The green moment after a recovery; remounted (keyed) per recovery, so it
 *  times itself out and needs no state in the parent. */
function RestoredBand() {
  const { t } = useLang();
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setShown(false), FLASH_MS);
    return () => clearTimeout(id);
  }, []);
  if (!shown) return null;
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 px-4 md:px-6 py-1.5" style={bandStyle(true)}>
      <Wifi size={15} className="flex-shrink-0" style={{ color: "var(--status-ok)" }} />
      <span className="text-xs leading-snug min-w-0 line-clamp-2 font-semibold">{t("offline.restored")}</span>
    </div>
  );
}

export default function OfflineBand() {
  const { down, reason, since, restoredAt } = useConnectivity();
  if (down) return <DownBand reason={reason} since={since} />;
  if (restoredAt) return <RestoredBand key={restoredAt} />;
  return null;
}
