import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileSpreadsheet, Loader2 } from "lucide-react";
import api from "../../utils/api";
import { exportXlsx } from "../../utils/exportXlsx";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import StyledSelect from "../ui/StyledSelect";
import Pagination from "../ui/Pagination";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { clock } from "./WatchProgress";

const PAGE_SIZE = 50;

/**
 * Who was given which lesson, who opened it, and how much of it they watched.
 *
 * **The roster is the AUDIENCE, never the progress rows.** Somebody who never
 * opened a lesson leaves no progress row at all, so a register built from what
 * was watched can only list the people who watched — precisely the half an admin
 * does not need. Every target is a row here, and «Ochmagan» is not an absence of
 * data but the answer. Same lesson `leader_exclusions` learned once: a day
 * nobody filed needs a second source, because the register has no trace of it.
 *
 * Only 100% is watched (`services/education_progress`), so every state carries
 * its percentage. A 99% watch and a lesson nobody opened are both "not watched"
 * and are not the same fact about a person.
 */
export default function WatchReport() {
  const { t } = useLang();
  const toast = useToast();
  const [lessonId, setLessonId] = usePersistentState("edu_report_lesson", "");
  const [status, setStatus] = usePersistentState("edu_report_status", "all");
  const [q, setQ] = useState("");
  const [sort, setSort] = usePersistentState("edu_report_sort", { k: "pct", dir: "asc" });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["education-report"],
    queryFn: () => api.get("/api/education/report").then((r) => r.data),
  });

  const lessons = data?.lessons || [];
  const allRows = data?.rows || [];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = allRows.filter((r) => {
      if (lessonId && String(r.lesson_id) !== String(lessonId)) return false;
      if (status === "done" && !r.complete) return false;
      if (status === "partial" && (r.complete || !r.opened_at)) return false;
      if (status === "never" && r.opened_at) return false;
      if (!needle) return true;
      return `${r.name} ${r.unit} ${r.lesson}`.toLowerCase().includes(needle);
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const va = a[sort.k], vb = b[sort.k];
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true }) * dir;
    });
    return out;
  }, [allRows, lessonId, status, q, sort]);

  const stats = useMemo(() => {
    const done = rows.filter((r) => r.complete).length;
    const opened = rows.filter((r) => r.opened_at).length;
    return { total: rows.length, done, opened, never: rows.length - opened };
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const shown = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const onSort = (k) =>
    setSort((s) => ({ k, dir: s.k === k && s.dir === "asc" ? "desc" : "asc" }));

  const download = async () => {
    setBusy(true);
    try {
      // The server sends no word it did not compute and the client sends no
      // figure at all — the file speaks the language the reader was reading.
      const where = await exportXlsx("/api/education/report.xlsx", {
        body: {
          lesson_id: lessonId ? Number(lessonId) : null,
          labels: {
            title: t("education.report.title"),
            subtitle: t("education.report.subtitle"),
            "tab.lessons": t("education.report.tab.lessons"),
            "tab.people": t("education.report.tab.people"),
            "tab.owed": t("education.report.tab.owed"),
            "h.lesson": t("education.report.h.lesson"),
            "h.name": t("education.report.h.name"),
            "h.role": t("education.report.h.role"),
            "h.unit": t("education.report.h.unit"),
            "h.shift": t("education.report.h.shift"),
            "h.opened_at": t("education.report.h.opened"),
            "h.pct": t("education.report.h.pct"),
            "h.watched": t("education.report.h.watched"),
            "h.status": t("education.report.h.status"),
            "h.last": t("education.report.h.last"),
            "h.flags": t("education.report.h.flags"),
            "h.provider": t("education.report.h.provider"),
            "h.duration": t("education.report.h.duration"),
            "h.audience": t("education.report.h.audience"),
            "h.opened": t("education.report.st.opened"),
            "h.done": t("education.report.st.done"),
            "h.owed": t("education.report.st.owed"),
            "h.mean": t("education.report.h.mean"),
            "v.done": t("education.report.st.done"),
            "v.partial": t("education.report.st.partial"),
            "v.never": t("education.report.st.never"),
            note: t("education.watch.rule"),
            empty: t("filter.noData"),
          },
        },
        fallbackName: "talim-hisobot.xlsx",
      });
      toast.show(where === "telegram" ? t("staff.exportToast") : t("staff.exportDownloaded"), "success");
    } catch {
      toast.show(t("common.requestFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <SkeletonBlock className="h-64 w-full rounded-2xl" />;
  if (isError) return <EmptyState title={t("common.loadFailed")} />;
  if (!lessons.length) {
    return <EmptyState icon={ClipboardList} title={t("education.report.empty")} />;
  }

  const statusCell = (r) => {
    const tone = r.complete ? "#22c55e" : r.opened_at ? "var(--brand)" : "#ef4444";
    const label = r.complete ? t("education.report.st.done")
      : r.opened_at ? t("education.report.st.partial")
      : t("education.report.st.never");
    return (
      <span
        className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{
          background: `color-mix(in srgb, ${tone} 13%, transparent)`,
          border: `1px solid color-mix(in srgb, ${tone} 40%, transparent)`,
          color: tone,
        }}
      >
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-3">
      <TableCard
        icon={ClipboardList}
        title={t("education.report.title")}
        subtitle={t("education.report.counts")
          .replace("{done}", stats.done)
          .replace("{total}", stats.total)
          .replace("{never}", stats.never)}
        right={
          <Button size="lg" variant="secondary" onClick={download} disabled={busy}>
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden />
                  : <FileSpreadsheet size={15} aria-hidden />}
            <span className="hidden sm:inline">Excel</span>
          </Button>
        }
        toolbar={
          <>
            <SearchInput
              value={q}
              onChange={(v) => { setQ(v); setPage(1); }}
              placeholder={t("education.report.search")}
              className="min-w-[180px] max-w-xs flex-1"
              inputClassName="text-sm pl-8 pr-7 py-2"
            />
            <StyledSelect
              value={lessonId}
              onChange={(v) => { setLessonId(v); setPage(1); }}
              options={[{ value: "", label: t("education.report.allLessons") },
                        ...lessons.map((l) => ({ value: String(l.id), label: l.title }))]}
              searchable
              className="min-w-[180px]"
            />
            <SegmentedToggle
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={[
                { value: "all", label: t("filter.all") },
                { value: "done", label: t("education.report.st.done") },
                { value: "partial", label: t("education.report.st.partial") },
                { value: "never", label: t("education.report.st.never") },
              ]}
            />
          </>
        }
      >
        <thead>
          <tr>
            <Th label={t("education.report.h.name")} k="name" sort={sort} onSort={onSort} />
            <Th label={t("education.report.h.lesson")} k="lesson" sort={sort} onSort={onSort} />
            <Th label={t("education.report.h.unit")} k="unit" sort={sort} onSort={onSort} />
            <Th label={t("education.report.h.pct")} k="pct" sort={sort} onSort={onSort} align="center" />
            <Th label={t("education.report.h.watched")} k="covered_s" sort={sort} onSort={onSort} align="center" />
            <Th label={t("education.report.h.status")} k="complete" sort={sort} onSort={onSort} align="center" />
            <Th label={t("education.report.h.last")} k="last_at" sort={sort} onSort={onSort} align="center" />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
                {t("common.noMatch")}
              </td>
            </tr>
          ) : shown.map((r) => (
            <tr key={`${r.lesson_id}:${r.profile_key}`}>
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.lesson}</td>
              <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{r.unit || "—"}</td>
              <td className="px-3 py-2 text-center tabular-nums font-semibold">
                {Math.round((r.pct || 0) * 100)}%
              </td>
              <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>
                {clock(r.covered_s)}
              </td>
              <td className="px-3 py-2 text-center">{statusCell(r)}</td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-3)" }}>
                {r.last_at ? new Date(r.last_at).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <Pagination page={safePage} pageCount={pageCount} total={rows.length}
                  pageSize={PAGE_SIZE} onPage={setPage} />

      {/* The rule the «Holat» column is written under. A threshold nobody was
          told about reads as a broken register the first time somebody who
          clearly watched the lesson shows up red. */}
      <p className="px-1 text-[11px]" style={{ color: "var(--text-4)" }}>
        {t("education.watch.rule")}
      </p>
    </div>
  );
}
