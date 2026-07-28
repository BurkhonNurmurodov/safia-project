import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload, CheckCircle2, XCircle, Loader2, LayoutGrid,
  AlertTriangle, CalendarDays, FlaskConical, TableProperties,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import TableCard, { Th } from "../../components/ui/DataTable";

// Small status chip for a parsed day cell: worked = green, day-off/excused
// markers = neutral slate (never brand gold — traffic-light convention).
function statusChip(status) {
  const worked = status === "worked";
  const color = worked ? "#22c55e" : "#94a3b8";
  return (
    <span
      className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color, background: `${color}1f` }}
    >
      {status}
    </span>
  );
}

export default function CellAttendanceUpload() {
  const { t } = useLang();
  const [fileStates, setFileStates] = useState([]);
  const [uploading, setUploading] = useState(false);

  function setFileState(name, patch) {
    setFileStates((prev) => prev.map((f) => (f.name === name ? { ...f, ...patch } : f)));
  }

  async function uploadFiles(files) {
    setFileStates(files.map((f) => ({ name: f.name, status: "pending", progress: 0 })));
    setUploading(true);

    for (const file of files) {
      setFileState(file.name, { status: "uploading", progress: 0 });
      const form = new FormData();
      form.append("files", file);
      try {
        const { data } = await api.post("/admin/cell-attendance/upload", form, {
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 50;
            setFileState(file.name, { progress: pct });
          },
        });
        const result = data.results[0];
        if (result.status === "ok") {
          setFileState(file.name, { status: "ok", progress: 100, result });
        } else {
          setFileState(file.name, { status: "error", progress: 100, detail: result.detail });
        }
      } catch {
        setFileState(file.name, { status: "error", progress: 100, detail: t("admin.uploadFailed") });
      }
    }
    setUploading(false);
  }

  const onDrop = useCallback((accepted) => { if (accepted.length) uploadFiles(accepted); }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: true,
    disabled: uploading,
  });

  // Newest successful upload with a sample → drives the preview table.
  const preview = [...fileStates].reverse().find((f) => f.status === "ok" && f.result?.sample?.length)?.result;

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Upload drop zone */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <LayoutGrid size={15} className="text-[var(--brand-text)]" />
            <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">{t("admin.cellAtt.title")}</div>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold"
            style={{ color: "#eab308", background: "#eab30820" }}
          >
            <FlaskConical size={11} /> {t("admin.cellAtt.test")}
          </span>
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            uploading    ? "border-[var(--border)] opacity-50 cursor-not-allowed"      :
            isDragActive ? "border-[var(--brand)] bg-[var(--brand-bg)] cursor-pointer" :
                           "border-[var(--border-md)] hover:border-[var(--brand-border)] cursor-pointer"
          }`}
        >
          <input {...getInputProps()} />
          <Upload size={32} className="mx-auto mb-3 text-[var(--text-3)]" />
          <div className="text-sm text-[var(--text-2)]">
            {uploading ? t("admin.uploading") : isDragActive ? t("admin.dropActive") : t("admin.dropzone")}
          </div>
          <div className="text-[11px] text-[var(--text-4)] mt-1.5 max-w-md mx-auto">{t("admin.cellAtt.hint")}</div>
        </div>

        {fileStates.length > 0 && (
          <div className="mt-5 space-y-3">
            {fileStates.map((f) => (
              <div key={f.name} className="bg-[var(--bg-inner)] rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  {f.status === "uploading" && <Loader2 size={13} className="text-[var(--brand-text)] animate-spin flex-shrink-0" />}
                  {f.status === "ok"        && <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />}
                  {f.status === "error"     && <XCircle size={13} className="text-red-400 flex-shrink-0" />}
                  {f.status === "pending"   && <div className="w-3 h-3 rounded-full border border-[var(--border-md)] flex-shrink-0" />}
                  <span className="font-mono text-xs text-[var(--text-2)] flex-1 truncate">{f.name}</span>
                  <span className={`text-[11px] flex-shrink-0 ${
                    f.status === "ok"        ? "text-green-400"        :
                    f.status === "error"     ? "text-red-400"          :
                    f.status === "uploading" ? "text-[var(--brand-text)]" : "text-[var(--text-4)]"
                  }`}>
                    {f.status === "ok"        ? `${f.result.rows_inserted} ${t("admin.cellAtt.rows")}` :
                     f.status === "error"     ? f.detail                                                :
                     f.status === "uploading" ? `${f.progress}%`                                        : t("admin.waiting")}
                  </span>
                </div>

                {/* Success summary chips */}
                {f.status === "ok" && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-3)] mt-2">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays size={12} className="text-[var(--text-4)]" />
                      {t("admin.cellAtt.period")}: <span className="text-[var(--text-2)]">{f.result.period_from}{f.result.period_to !== f.result.period_from ? ` — ${f.result.period_to}` : ""}</span>
                      {f.result.days > 1 && <span className="text-[var(--text-4)]">({f.result.days} {t("admin.cellAtt.days")})</span>}
                    </span>
                    <span>{t("admin.cellAtt.cells")}: <span className="text-[var(--text-2)]">{f.result.cells.join(", ") || "—"}</span></span>
                  </div>
                )}

                {/* Unmatched cell codes warning */}
                {f.status === "ok" && f.result.unmatched_codes?.length > 0 && (
                  <div className="flex items-start gap-1.5 text-[11px] mt-1.5" style={{ color: "#eab308" }}>
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                    <span>{t("admin.cellAtt.unmatched")}: {f.result.unmatched_codes.join(", ")}</span>
                  </div>
                )}

                <div className="h-1 bg-[var(--bg-accent)] rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      f.status === "ok" ? "bg-green-500" : f.status === "error" ? "bg-red-500" : "bg-[var(--brand)]"
                    }`}
                    style={{ width: `${f.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Parsed preview — a spot-check of what landed in the test table */}
      {preview && (
        <TableCard
          icon={TableProperties}
          title={t("admin.cellAtt.preview")}
          right={<span className="text-[11px] text-[var(--text-3)]">{preview.sample.length} / {preview.rows_inserted}</span>}
        >
          <thead>
            <tr>
              <Th label={t("admin.cellAtt.colDate")} />
              <Th label={t("admin.cellAtt.colCell")} />
              <Th label={t("admin.cellAtt.colWorker")} />
              <Th label={t("admin.cellAtt.colTitle")} />
              <Th label={t("admin.cellAtt.colDay")} />
              <Th label={t("admin.cellAtt.colHours")} align="right" />
              <Th label={t("admin.cellAtt.colStatus")} align="center" />
            </tr>
          </thead>
          <tbody>
            {preview.sample.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-[var(--text-3)] tabular-nums">{r.date}</td>
                <td className="px-3 py-2 font-mono text-[var(--text-2)]">{r.verifix_code || "—"}</td>
                <td className="px-3 py-2 text-[var(--text-1)]">{r.worker_name}</td>
                <td className="px-3 py-2 text-[var(--text-3)]">{r.job_title || "—"}</td>
                <td className="px-3 py-2 text-[var(--text-3)] font-mono text-[11px]">{r.day_raw}</td>
                <td className="px-3 py-2 text-right tabular-nums text-[var(--text-2)]">{r.hours_worked != null ? r.hours_worked : "—"}</td>
                <td className="px-3 py-2 text-center">{statusChip(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}
