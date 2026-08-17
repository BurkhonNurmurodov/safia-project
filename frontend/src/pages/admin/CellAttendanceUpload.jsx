import { useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutGrid, AlertTriangle, CalendarDays, FlaskConical, TableProperties, ArrowRight,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import TableCard, { Th, SectionHead } from "../../components/ui/DataTable";
import UploadDropzone, { FileStateList, useFileStates } from "../../components/ui/UploadDropzone";

const ACCEPT = { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] };

/** dd.mm.yyyy — the format ru/uz operators actually read, not raw ISO. */
function fmtDay(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

// Small status chip for a parsed day cell: worked = green, day-off/excused
// markers = neutral slate (never brand gold — traffic-light convention).
function StatusChip({ status }) {
  const { t } = useLang();
  const worked = status === "worked";
  const color = worked ? "#22c55e" : "#64748b";
  // The raw backend enum used to print straight into an otherwise localized
  // table; the value stays in `title` so it's still debuggable.
  const label = worked ? t("admin.cellAtt.stWorked") : t("admin.cellAtt.stOff");
  return (
    <span
      title={status}
      className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ color, background: `${color}1f` }}
    >
      {label}
    </span>
  );
}

export default function CellAttendanceUpload() {
  const { t } = useLang();
  const { states, begin, patch, addRejections, clear } = useFileStates();
  const [uploading, setUploading] = useState(false);
  const [previewId, setPreviewId] = useState(null);

  async function uploadFiles(files) {
    const entries = begin(files);
    setUploading(true);

    for (const { id, file } of entries) {
      patch(id, { status: "uploading", progress: 0 });
      const form = new FormData();
      form.append("files", file);
      try {
        const { data } = await api.post("/admin/cell-attendance/upload", form, {
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 50;
            patch(id, { progress: pct, status: pct >= 100 ? "processing" : "uploading" });
          },
        });
        const result = data.results[0];
        if (result.status === "ok") {
          patch(id, {
            status: "ok",
            progress: 100,
            result,
            detail: `${result.rows_inserted} ${t("admin.cellAtt.rows")}`,
          });
          setPreviewId(id);
        } else {
          patch(id, { status: "error", progress: 100, detail: result.detail });
        }
      } catch (err) {
        // The sibling tabs extract the server's reason; this one used to throw
        // it away and show a generic string on exactly the failures that matter.
        patch(id, {
          status: "error",
          progress: 100,
          detail: err?.response?.data?.detail || t("admin.uploadFailed"),
        });
      }
    }
    setUploading(false);
  }

  const selected = states.find((f) => f.id === previewId && f.result?.sample?.length)
    ?? [...states].reverse().find((f) => f.status === "ok" && f.result?.sample?.length);
  const preview = selected?.result;

  /** Period / covered cells / unmatched codes, per uploaded file. */
  function renderResult(f) {
    if (f.status !== "ok" || !f.result) return null;
    const r = f.result;
    return (
      <>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mb-1.5" style={{ color: "var(--text-3)" }}>
          <span className="inline-flex items-center gap-1">
            <CalendarDays size={12} style={{ color: "var(--text-4)" }} />
            {t("admin.cellAtt.period")}:{" "}
            <span style={{ color: "var(--text-2)" }}>
              {fmtDay(r.period_from)}
              {r.period_to !== r.period_from ? ` — ${fmtDay(r.period_to)}` : ""}
            </span>
            {r.days > 1 && <span style={{ color: "var(--text-4)" }}>({r.days} {t("admin.cellAtt.days")})</span>}
          </span>
          <span>
            {t("admin.cellAtt.cells")}: <span style={{ color: "var(--text-2)" }}>{r.cells.join(", ") || "—"}</span>
          </span>
        </div>

        {r.unmatched_codes?.length > 0 && (
          <div className="flex items-start gap-1.5 text-[11px] mb-1.5" style={{ color: "#a16207" }}>
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              {t("admin.cellAtt.unmatched")}: {r.unmatched_codes.join(", ")}
              {/* The warning used to name codes the cell register doesn't know,
                  then leave the operator with no route to fix them. */}
              <Link
                to="/cells"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-0.5 ml-1.5 font-semibold underline"
              >
                {t("admin.cellAtt.openCells")} <ArrowRight size={11} />
              </Link>
            </span>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead
          icon={LayoutGrid}
          title={t("admin.cellAtt.title")}
          right={
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold"
              style={{ color: "#a16207", background: "#eab30820" }}
            >
              <FlaskConical size={11} /> {t("admin.cellAtt.test")}
            </span>
          }
        />

        <div className="p-4">
          <UploadDropzone
            accept={ACCEPT}
            busy={uploading}
            onFiles={uploadFiles}
            onRejected={(r) => addRejections(r, t("admin.upload.onlyXlsx"))}
            // Spells out the two rules that used to be invisible until after the
            // damage: the day comes from the «Период» date INSIDE the sheet, and
            // re-uploading a covered date replaces it wholesale.
            hint={t("admin.cellAtt.hint")}
          />

          <FileStateList
            states={states}
            busy={uploading}
            onClear={clear}
            renderExtra={renderResult}
            onSelect={(f) => f.result?.sample?.length && setPreviewId(f.id)}
            selectedId={selected?.id}
            className="mt-4"
          />

          {/* The workflow spans three pages; this one is where uploads happen,
              so it should say where the other two are: the cell register that
              gives a «Код подразделения» a name, and the Staff (verifix) page
              that browses the rows this upload lands. */}
          <div className="mt-4 pt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ borderTop: "1px solid var(--border)", color: "var(--text-3)" }}>
            <Link to="/cells" className="inline-flex items-center gap-1 hover:underline">
              {t("admin.cellAtt.linkCells")} <ArrowRight size={11} />
            </Link>
            <Link to="/staff" className="inline-flex items-center gap-1 hover:underline">
              {t("admin.cellAtt.linkStaff")} <ArrowRight size={11} />
            </Link>
          </div>
        </div>
      </div>

      {/* Parsed preview — a spot-check of what landed in the test table */}
      {preview && (
        <TableCard
          icon={TableProperties}
          title={t("admin.cellAtt.preview")}
          right={
            <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {t("admin.cellAtt.previewCount")
                .replace("{n}", preview.sample.length)
                .replace("{total}", preview.rows_inserted)}
            </span>
          }
        >
          <thead>
            <tr>
              <Th label={t("admin.cellAtt.colDate")} />
              <Th label={t("admin.cellAtt.colCell")} />
              <Th label={t("admin.cellAtt.colWorker")} />
              {/* Low-value columns fold away on a phone so Hours/Status — the
                  point of a spot-check — are reachable without side-scrolling. */}
              <Th label={t("admin.cellAtt.colTitle")} cls="hidden md:table-cell" />
              <Th label={t("admin.cellAtt.colDay")} cls="hidden sm:table-cell" />
              <Th label={t("admin.cellAtt.colHours")} align="right" />
              <Th label={t("admin.cellAtt.colStatus")} align="center" />
            </tr>
          </thead>
          <tbody>
            {preview.sample.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{fmtDay(r.date)}</td>
                <td className="px-3 py-2 font-mono" style={{ color: "var(--text-2)" }}>{r.verifix_code || "—"}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{r.worker_name}</td>
                <td className="px-3 py-2 hidden md:table-cell" style={{ color: "var(--text-3)" }}>{r.job_title || "—"}</td>
                <td className="px-3 py-2 hidden sm:table-cell font-mono text-[11px]" style={{ color: "var(--text-3)" }}>{r.day_raw}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{r.hours_worked != null ? r.hours_worked : "—"}</td>
                <td className="px-3 py-2 text-center"><StatusChip status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}
