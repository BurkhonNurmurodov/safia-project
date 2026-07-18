import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, CalendarDays, Users, CheckCircle, AlertTriangle } from "lucide-react";
import api from "../../utils/api";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DateRangePicker from "../../components/ui/DateRangePicker";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import EmptyState from "../../components/ui/EmptyState";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

const todayISO = () => new Date().toISOString().split("T")[0];

export default function AttendanceCleanup() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const [date, setDate]         = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter]     = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast]       = useState(null);   // { rows, count } | null

  const { data: supervisors = [], isLoading } = useQuery({
    queryKey: ["staff-supervisors"],
    queryFn: () => api.get("/api/staff/supervisors").then((r) => r.data),
    staleTime: 120_000,
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return supervisors;
    return supervisors.filter((s) => tl(s.full_name).toLowerCase().includes(q));
  }, [supervisors, filter, tl]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.manager_id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((s) => next.delete(s.manager_id));
      else                     filtered.forEach((s) => next.add(s.manager_id));
      return next;
    });
  }

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const delMut = useMutation({
    mutationFn: () =>
      api.post("/admin/delete-attendance", {
        date,
        manager_ids: [...selected],
      }).then((r) => r.data),
    onSuccess: (data) => {
      setConfirmOpen(false);
      setToast({ rows: data.rows_deleted ?? 0, count: selected.size });
      setTimeout(() => setToast(null), 4000);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["staff-attendance"] });
      qc.invalidateQueries({ queryKey: ["staff-deleted"] });
      qc.invalidateQueries({ queryKey: ["staff-documents"] });
    },
    onError: (e) => {
      setConfirmOpen(false);
      alert(e?.response?.data?.detail || t("admin.cleanup.fail"));
    },
  });

  const canDelete = !!date && selected.size > 0;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
      {/* Intro / date */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Trash2 size={15} className="text-[var(--brand-text)]" />
          <div className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wider">
            {t("admin.cleanup.title")}
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-[var(--text-3)] mb-4">
          {t("admin.cleanup.desc")}
        </p>
        <div className="flex items-center gap-2">
          <CalendarDays size={15} className="text-[var(--text-3)] flex-shrink-0" />
          <span className="text-xs text-[var(--text-2)]">{t("admin.cleanup.pickDate")}</span>
          <DateRangePicker
            single
            dateFrom={date}
            dateTo={date}
            setDateFrom={setDate}
            setDateTo={() => {}}
            max={todayISO()}
            triggerClassName="px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Supervisor picker */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl overflow-hidden">
        <SectionHead
          icon={Users}
          title={t("admin.cleanup.supervisors")}
          right={
            <span
              className="text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
              style={selected.size
                ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
                : { background: "var(--bg-inner)", color: "var(--text-4)" }}
            >
              {selected.size}/{supervisors.length}
            </span>
          }
        />
        <div className="px-3 py-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <SearchInput value={filter} onChange={setFilter} placeholder={t("admin.broadcast.searchPh")} />
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={!filtered.length} onClick={toggleAll}>
              {allFilteredSelected ? t("admin.broadcast.clearAll") : t("admin.broadcast.selectAll")}
            </Button>
          </div>
        </div>

        <div className="px-2 py-2 overflow-y-auto" style={{ maxHeight: 460 }}>
          {isLoading ? (
            <div className="space-y-2 px-2 py-1">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-8 w-full" />)}
            </div>
          ) : !filtered.length ? (
            <EmptyState icon={Users} title={t("admin.cleanup.noSupervisors")} />
          ) : (
            <div className="space-y-0.5">
              {filtered.map((s) => {
                const on = selected.has(s.manager_id);
                return (
                  <label
                    key={s.manager_id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer hover:bg-[var(--bg-inner)] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleOne(s.manager_id)}
                      className="w-4 h-4 accent-[var(--brand)] flex-shrink-0"
                    />
                    <span className="text-sm text-[var(--text-1)] flex-1 truncate">{tl(s.full_name)}</span>
                    {s.shift != null && s.shift !== "" && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 bg-[var(--bg-inner)] text-[var(--text-3)]">
                        {t("admin.cleanup.shiftN").replace("{n}", s.shift)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer action */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span className="text-xs" style={{ color: selected.size ? "var(--text-3)" : "var(--text-4)" }}>
            {t("admin.broadcast.selected").replace("{n}", selected.size)}
          </span>
          <Button
            variant="danger"
            size="lg"
            icon={<Trash2 size={14} />}
            disabled={!canDelete}
            loading={delMut.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {t("admin.cleanup.deleteBtn")}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        onCancel={() => !delMut.isPending && setConfirmOpen(false)}
        onConfirm={() => delMut.mutate()}
        title={t("admin.cleanup.confirmTitle")}
        message={t("admin.cleanup.confirmMsg")
          .replace("{n}", selected.size)
          .replace("{date}", date)}
        confirmLabel={t("admin.cleanup.deleteBtn")}
        cancelLabel={t("admin.broadcast.cancel")}
        loading={delMut.isPending}
      />

      {toast && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: "#22c55e", color: "#fff", maxWidth: 340,
            boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
          }}
        >
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span>
            {t("admin.cleanup.successToast")
              .replace("{rows}", toast.rows)
              .replace("{n}", toast.count)}
          </span>
        </div>
      )}
    </div>
  );
}
