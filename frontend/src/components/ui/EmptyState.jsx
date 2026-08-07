import { DatabaseZap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function EmptyState({
  title = "No data available",
  message = "Upload verifix files to see data here.",
  showUploadLink = true,
  height = "h-40",
}) {
  const navigate = useNavigate();
  return (
    <div className={`flex flex-col items-center justify-center ${height} gap-3`}>
      <DatabaseZap size={28} style={{ color: "var(--text-4)" }} />
      <div className="text-center">
        <div className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{message}</div>
      </div>
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
