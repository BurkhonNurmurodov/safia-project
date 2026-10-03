import { useMemo, useState } from "react";
import {
  IdCard, Users, Grid3x3, ScanFace, Stethoscope, CircleDot, Building2, FolderTree, Briefcase, CalendarClock, Camera,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { FilterPanel, OptsFilter, PickFilter } from "../../components/ui/ColumnFilter";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import VfxPhoto from "../../components/verifix/VfxPhoto";
import PersonCard from "../../components/verifix/PersonCard";
import { VfxError, StatusDot, CellChip, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import { useVfx, vfxError, fill, num, dmy, C_OK, C_BAD, C_NONE } from "../../components/verifix/vfx";

/* «Xodimlar» — everybody Verifix holds (working by default): their photo,
 * department and org unit (and our cell, where the unit is one), job,
 * schedule, hiring date and medical check. Filtering is on the page; the
 * server sends one status at a time. A row opens the person's card. */

const EMP_TONE = { W: C_OK, D: C_NONE, U: C_NONE };

function facet(rows, keyOf, nameOf) {
  const counts = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n, name: nameOf(value) }));
}

function optsSection({ key, icon, label, opts, sel, setSel, t }) {
  const byVal = new Map(opts.map((o) => [o.value, o]));
  return {
    key, icon, label, active: sel.length > 0,
    display: sel.length === 1 ? (byVal.get(sel[0])?.name || sel[0]) : `${sel.length} ${t("filter.selected2")}`,
    onClear: () => setSel([]),
    render: () => (
      <OptsFilter searchable={opts.length > 8} opts={opts.map((o) => o.value)} sel={sel} onChange={setSel}
        labelOf={(v) => byVal.get(v)?.name || v}
        render={(v) => (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span className="truncate">{byVal.get(v)?.name || v}</span>
            <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{byVal.get(v)?.n ?? 0}</span>
          </span>
        )} />
    ),
  };
}

export default function VfxEmployees() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [status, setStatus] = usePersistentState("vfx_emp_status", "W");
  const [q, refresh] = useVfx(["employees"], "/employees", { status });
  const [search, setSearch] = useState("");
  const [divSel, setDivSel] = usePersistentState("vfx_emp_div", []);
  const [unitSel, setUnitSel] = usePersistentState("vfx_emp_unit", []);
  const [jobSel, setJobSel] = usePersistentState("vfx_emp_job", []);
  const [schedSel, setSchedSel] = usePersistentState("vfx_emp_sched", []);
  const [inCell, setInCell] = usePersistentState("vfx_emp_cell", "all");
  const [face, setFace] = usePersistentState("vfx_emp_face", "all");
  const [med, setMed] = usePersistentState("vfx_emp_med", "all");
  const [open, setOpen] = useState(null);
  const d = q.data;
  const today = d?.today;
  const name = (map, id) => tx(map?.[id]) || (id ? `#${id}` : "—");

  const all = d?.rows || [];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (!divSel.length || divSel.includes(r.div))
      && (!unitSel.length || unitSel.includes(r.unit))
      && (!jobSel.length || jobSel.includes(r.job))
      && (!schedSel.length || schedSel.includes(r.sched))
      && (inCell === "all" || (inCell === "yes") === !!d?.cells?.[r.unit])
      && (face === "all" || (face === "yes") === r.face)
      && (med === "all" || (med === "overdue" ? r.med_next && r.med_next < today
        : r.med_next && r.med_next >= today && r.med_next <= addDays(today, 30)))
      && (!needle || `${r.name} ${tl(r.name)} ${r.id} ${r.code || ""} ${r.phone || ""}`.toLowerCase().includes(needle)));
  }, [all, divSel, unitSel, jobSel, schedSel, inCell, face, med, search, d, today, tl]);

  const divOpts = useMemo(() => facet(all, (r) => r.div, (v) => name(d?.divisions, v)), [all, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const unitOpts = useMemo(() => facet(all, (r) => r.unit, (v) => {
    const c = d?.cells?.[v];
    return c ? `${c.code} · ${name(d?.divisions, v)}` : name(d?.divisions, v);
  }), [all, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const jobOpts = useMemo(() => facet(all, (r) => r.job, (v) => name(d?.jobs, v)), [all, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const schedOpts = useMemo(() => facet(all, (r) => r.sched, (v) => name(d?.schedules, v)), [all, d]); // eslint-disable-line react-hooks/exhaustive-deps

  const tri = (value, set, keys) => ({
    active: value !== "all",
    display: t(keys[value]),
    onClear: () => set("all"),
    render: ({ close }) => (
      <PickFilter close={close} value={value} onChange={set}
        opts={Object.entries(keys).map(([v, k]) => ({ value: v, label: t(k) }))} />
    ),
  });

  const grpWho = t("vfx.emp.grpWhere");
  const grpWhat = t("vfx.emp.grpWhat");
  const sections = [
    {
      key: "status", icon: CircleDot, label: t("vfx.emp.f.status"), group: grpWhat, pinned: true,
      active: status !== "W", display: t(`vfx.emp.stAll.${status}`), onClear: () => setStatus("W"),
      render: ({ close }) => (
        <PickFilter close={close} value={status} onChange={setStatus} opts={["W", "D", "U", "all"].map((s) => ({
          value: s, label: `${t(`vfx.emp.stAll.${s}`)}${d?.counts ? ` · ${num(s === "all" ? Object.values(d.counts).reduce((a, b) => a + b, 0) : d.counts[s] || 0)}` : ""}`,
        }))} />
      ),
    },
    { ...optsSection({ key: "div", icon: Building2, label: t("vfx.emp.f.div"), opts: divOpts, sel: divSel, setSel: setDivSel, t }), group: grpWho },
    { ...optsSection({ key: "unit", icon: FolderTree, label: t("vfx.emp.f.unit"), opts: unitOpts, sel: unitSel, setSel: setUnitSel, t }), group: grpWho },
    { key: "cell", icon: Grid3x3, label: t("vfx.emp.f.cell"), group: grpWho,
      ...tri(inCell, setInCell, { all: "vfx.all", yes: "vfx.emp.f.cellYes", no: "vfx.emp.f.cellNo" }) },
    { ...optsSection({ key: "job", icon: Briefcase, label: t("vfx.emp.f.job"), opts: jobOpts, sel: jobSel, setSel: setJobSel, t }), group: grpWhat },
    { ...optsSection({ key: "sched", icon: CalendarClock, label: t("vfx.emp.f.sched"), opts: schedOpts, sel: schedSel, setSel: setSchedSel, t }), group: grpWhat },
    { key: "face", icon: Camera, label: t("vfx.emp.f.face"), group: grpWhat,
      ...tri(face, setFace, { all: "vfx.all", yes: "vfx.emp.f.faceYes", no: "vfx.emp.f.faceNo" }) },
    { key: "med", icon: Stethoscope, label: t("vfx.emp.f.med"), group: grpWhat,
      ...tri(med, setMed, { all: "vfx.all", overdue: "vfx.emp.f.medOverdue", soon: "vfx.emp.f.medSoon" }) },
  ];

  const columns = [
    {
      key: "name", label: t("vfx.emp.col.name"), sort: (r) => tl(r.name),
      render: (r) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <VfxPhoto sha={r.photo} name={tl(r.name)} px={32} />
          <div className="min-w-0">
            <div className="truncate font-medium max-w-[220px]" style={{ color: "var(--text-1)" }}>{tl(r.name)}</div>
            <div className="text-[11px] font-mono" style={{ color: "var(--text-4)" }}>{r.id}{r.code ? ` · ${r.code}` : ""}</div>
          </div>
        </div>
      ),
    },
    {
      key: "unit", label: t("vfx.emp.col.unit"), sort: (r) => d?.cells?.[r.unit]?.code || name(d?.divisions, r.unit),
      render: (r) => {
        const c = d?.cells?.[r.unit];
        return (
          <div className="min-w-0 max-w-[240px]">
            {c ? <CellChip cell={c} compact /> : null}
            <div className={`truncate ${c ? "text-[11px]" : ""}`} style={{ color: c ? "var(--text-3)" : "var(--text-2)" }}>{name(d?.divisions, r.unit)}</div>
          </div>
        );
      },
    },
    { key: "div", label: t("vfx.emp.col.div"), sort: (r) => name(d?.divisions, r.div),
      render: (r) => <span className="truncate block max-w-[200px]" style={{ color: "var(--text-2)" }}>{name(d?.divisions, r.div)}</span> },
    { key: "job", label: t("vfx.emp.col.job"), sort: (r) => name(d?.jobs, r.job),
      render: (r) => <span className="truncate block max-w-[200px]">{name(d?.jobs, r.job)}</span> },
    { key: "sched", label: t("vfx.emp.col.sched"), sort: (r) => name(d?.schedules, r.sched),
      render: (r) => <span className="truncate block max-w-[160px]" style={{ color: "var(--text-2)" }}>{name(d?.schedules, r.sched)}</span> },
    { key: "hired", label: t("vfx.emp.col.hired"), firstDir: "desc", sort: (r) => r.hired,
      render: (r) => <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{r.hired ? dmy(r.hired) : "—"}</span> },
    { key: "status", label: t("vfx.emp.col.status"), sort: (r) => r.status,
      render: (r) => (
        <span className="inline-flex flex-col">
          <StatusDot color={EMP_TONE[r.status] || C_NONE} label={t(`vfx.emp.st.${r.status}`)} />
          {r.dismissed && <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{dmy(r.dismissed)}</span>}
        </span>
      ) },
    { key: "med", label: t("vfx.emp.col.med"), sort: (r) => r.med_next,
      hint: t("vfx.emp.col.medHint"),
      render: (r) => (r.med_next
        ? <span className="tabular-nums" style={{ color: r.med_next < today ? C_BAD : "var(--text-2)" }}>{dmy(r.med_next)}</span>
        : <span style={{ color: "var(--text-4)" }}>—</span>) },
  ];

  const inCells = rows.filter((r) => d?.cells?.[r.unit]).length;
  const withFace = rows.filter((r) => r.face).length;
  const overdue = rows.filter((r) => r.status === "W" && r.med_next && r.med_next < today).length;
  const sk = <SkeletonBlock className="h-7 w-16 mt-1" />;

  return (
    <Layout title={t("nav.vfx.employees")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm flex-1 min-w-[240px] max-w-3xl" style={{ color: "var(--text-2)" }}>{t("vfx.emp.lead")}</p>
          <FetchedAt at={d?.fetched_at} today={today} />
          <RefreshButton busy={q.isFetching} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("vfx.emp.k.shown")} icon={Users} value={d ? num(rows.length) : sk}
                sub={d ? fill(t("vfx.emp.k.shownSub"), { w: num(d.counts?.W || 0), d: num(d.counts?.D || 0) }) : null} />
              <KPICard label={t("vfx.emp.k.cells")} icon={Grid3x3} value={d ? num(inCells) : sk}
                sub={d && rows.length ? `${Math.round((inCells / rows.length) * 100)}%` : null} tooltip={t("vfx.emp.k.cellsHint")} />
              <KPICard label={t("vfx.emp.k.face")} icon={ScanFace} value={d ? num(withFace) : sk}
                sub={d && rows.length ? `${Math.round((withFace / rows.length) * 100)}%` : null} tooltip={t("vfx.emp.k.faceHint")} />
              <KPICard label={t("vfx.emp.k.med")} icon={Stethoscope} color={overdue ? C_BAD : undefined}
                value={d ? num(overdue) : sk} tooltip={t("vfx.emp.k.medHint")}
                onValueClick={overdue ? () => setMed("overdue") : undefined} />
            </div>

            <VfxTable
              icon={IdCard} title={t("vfx.emp.title")}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.emp.search")} className="w-full sm:w-64" />
                <FilterPanel sections={sections} />
              </>}
              rows={rows} columns={columns} rowKey={(r) => r.id} loading={q.isLoading}
              defaultSort={{ key: "name", dir: "asc" }} sortStoreKey="vfx_emp_sort"
              empty={all.length ? t("vfx.noMatch") : t("vfx.emp.empty")}
              onRowClick={(r) => setOpen(r.id)}
            />
            {q.isLoading && <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("vfx.slowFirst")}</p>}
          </>
        )}
      </div>
      {open && <PersonCard id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}

function addDays(iso, n) {
  if (!iso) return iso;
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
