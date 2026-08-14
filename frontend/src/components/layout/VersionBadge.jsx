import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { APP_VERSION, BUILD_TIME, fmtStamp } from "../../utils/version";

/**
 * The build stamp at the foot of the sidebar rail, and the «Versiya» dialog
 * behind it.
 *
 * A push to main deploys straight to production — no staging step, no review
 * window — and nobody has a shell on the box, so "is this the build I just
 * pushed?" had no answer from inside the app. The rail answers the cheap half
 * (version + when this bundle was built); tapping it adds the server's own
 * readout, which is the half that catches the interesting failure: a UI that
 * shipped while the backend still runs older code, because a commit touching
 * only frontend/dist restarts nothing.
 */
export default function VersionBadge({ expanded = true }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  // Fetched only once the dialog is opened — the rail itself costs no request.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["app-version"],
    queryFn: async () => (await api.get("/api/version")).data,
    enabled: open,
    staleTime: 60_000,
  });

  const built = fmtStamp(BUILD_TIME);
  const serverVersion = data?.version;
  const mismatch = Boolean(serverVersion) && serverVersion !== APP_VERSION;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={!expanded ? `v${APP_VERSION}${built ? ` · ${built}` : ""}` : undefined}
        className="nav-item w-full flex items-center rounded-lg transition-colors"
        style={{
          gap: "12px",
          padding: "8px 10px",
          justifyContent: !expanded ? "center" : undefined,
        }}
      >
        <Info size={14} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
        <div
          className="text-[10px] leading-tight whitespace-nowrap transition-all duration-200 text-left"
          style={{
            color: "var(--text-4)",
            opacity: expanded ? 1 : 0,
            maxWidth: expanded ? 200 : 0,
            overflow: "hidden",
            display: "block",
          }}
        >
          {t("ui.version.label")} <span style={{ color: "var(--text-3)" }}>v{APP_VERSION}</span>
        </div>
      </button>

      {/* z 70: the rail itself climbs to z-50 while it hovers open, and the
          mobile drawer sits at z-40 — the default 50 would tie with both. */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("ui.version.title")}
        icon={<Info size={16} />}
        maxWidth="max-w-sm"
        zIndex={70}
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t("ui.version.close")}
          </Button>
        }
      >
        <Row label={t("ui.version.app")} value={`v${APP_VERSION}`} />
        <Row label={t("ui.version.built")} value={built || "—"} />

        <div className="pt-3 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
          {isLoading ? (
            <>
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-2/3" />
            </>
          ) : isError ? (
            <div className="text-[11px]" style={{ color: "var(--text-4)" }}>
              {t("ui.version.serverUnavailable")}
            </div>
          ) : (
            <>
              <Row label={t("ui.version.server")} value={serverVersion ? `v${serverVersion}` : "—"} />
              <Row label={t("ui.version.commit")} value={data?.commit || "—"} mono />
              <Row label={t("ui.version.started")} value={fmtStamp(data?.started_at) || "—"} />
            </>
          )}
        </div>

        {mismatch && (
          <div
            className="text-[11px] rounded-lg px-2.5 py-2 leading-snug"
            style={{
              background: "rgba(234,179,8,0.12)",
              border: "1px solid rgba(234,179,8,0.35)",
              color: "var(--text-2)",
            }}
          >
            {t("ui.version.mismatch")}
          </div>
        )}
      </Modal>
    </>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{label}</span>
      <span
        className={`text-xs font-medium truncate ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--text-1)" }}
      >
        {value}
      </span>
    </div>
  );
}
