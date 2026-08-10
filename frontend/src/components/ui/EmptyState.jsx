import { DatabaseZap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function EmptyState({
  title = "No data available",
  message = "Upload verifix files to see data here.",
  showUploadLink = true,
  height = "h-40",
  // The lead glyph. Defaults to the "no data yet" database icon this component
  // was born for; a section whose emptiness means something else says so with
  // its own icon (an emptied review queue is an achievement, not a gap).
  icon: Icon = DatabaseZap,
  // The way OUT of this emptiness, when there is one. An empty state caused by
  // the viewer's own filters has to hand back the control that caused it —
  // otherwise the only escape from "nothing matches" is guessing which of six
  // filters to reopen. Rendered under the message, above the upload link.
  action = null,
}) {
  const navigate = useNavigate();
  return (
    <div className={`flex flex-col items-center justify-center ${height} gap-3`}>
      <Icon size={28} style={{ color: "var(--text-4)" }} />
      <div className="text-center">
        <div className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{message}</div>
      </div>
      {action}
      {showUploadLink && (
        <button
          onClick={() => navigate("/admin/upload")}
          className="text-xs text-[var(--brand)] hover:text-[var(--brand-text)] underline underline-offset-2"
        >
          Go to Admin Upload →
        </button>
      )}
    </div>
  );
}
