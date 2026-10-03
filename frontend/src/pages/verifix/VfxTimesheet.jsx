import { useMemo, useState } from "react";
import {
  CalendarRange, CalendarCheck, LogIn, UserX, Timer, DoorOpen, CircleDot, Building2, Grid3x3, Clock3,
  UserRound, Check,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import DayStepper from "../../components/ui/DayStepper";
import { localISO } from "../../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter, PickFilter } from "../../components/ui/ColumnFilter";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import VfxPhoto from "../../components/verifix/VfxPhoto";
import PersonCard from "../../components/verifix/PersonCard";
import { VfxError, StatusDot, CellChip, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import {
  useVfx, vfxError, fill, num, hm, hmm, clockOn, shiftISO, isCame, DAY_STATUS, C_OK, C_BAD, C_WARN, C_NONE,
} from "../../components/verifix/vfx";

/* «Davomat hisoboti» — Verifix's «Отчёт по посещениям» for one day, for
 * everybody it holds. Every row is read by the live page's own rule
 * (`verifix_live._person`): the report's clock-in and clock-out, the plan,
 * late and early, hours by the «Отработано» time kinds the parity check found.
 * A row opens the day's breakdown by time kind — the facts Verifix counted. */

const STATUSES = ["inside", "break", "left", "no_out", "absent", "not_yet", "off"];

export default function VfxTimesheet() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [day, setDay] = useState(() => shiftISO(localISO(new Date()), -1));
  const [q, refresh] = useVfx(["timesheet"], "/timesheet", { day });
  const [search, setSearch] = useState("");
  const [stSel, setStSel] = usePersistentState("vfx_ts_st", []);
  const [divSel, setDivSel] = usePersistentState("vfx_ts_div", []);
  const [inCell, setInCell] = usePersistentState("vfx_ts_cell", "all");
  const [late, setLate] = usePersistentState("vfx_ts_late", "all");
  const [open, setOpen] = useState(null);
  const [person, setPerson] = useState(null);
  const d = q.data;
  const all = useMemo(() => d?.rows || [], [d]);
  const unitName = (r) => tx(d?.divisions?.[r.unit]) || "—";

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (!stSel.length || stSel.includes(r.status))
      && (!divSel.length || divSel.includes(r.div))
      && (inCell === "all" || (inCell === "yes") === !!d?.cells?.[r.unit])
      && (late === "all" || (late === "late" ? r.late > 0 : r.early_out > 0))
      && (!needle || `${r.name} ${tl(r.name)} ${r.id} ${d?.cells?.[r.unit]?.code || ""}`.toLowerCase().includes(needle)));
  }, [all, stSel, divSel, inCell, late, search, d, tl]);

  const k = useMemo(() => ({
    planned: all.filter((r) => r.kind === "W").length,
    came: all.filter((r) => isCame(r.status)).length,
    absent: all.filter((r) => r.status === "absent").length,
    late: all.filter((r) => r.late > 0).length,
    noOut: all.filter((r) => r.status === "no_out").length,
  }), [all]);

  const divOpts = useMemo(() => {
    const m = new Map();
    for (const r of all) if (r.div) m.set(r.div, (m.get(r.div) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const sections = [
    {
      key: "st", icon: CircleDot, label: t("vfx.ts.f.status"), pinned: true, active: stSel.length > 0,
      display: stSel.length === 1 ? t(`staffLive.st.${stSel[0]}`) : `${stSel.length} ${t("filter.selected2")}`,
      onClear: () => setStSel([]),
      render: () => (
        <OptsFilter opts={STATUSES.filter((s) => all.some((r) => r.status === s))} sel={stSel} onChange={setStSel}
          labelOf={(v) => t(`staffLive.st.${v}`)}
          render={(v) => (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: DAY_STATUS[v] }} />{t(`staffLive.st.${v}`)}
              <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{all.filter((r) => r.status === v).length}</span>
            </span>
          )} />
      ),
    },
    {
      key: "div", icon: Building2, label: t("vfx.emp.f.div"), active: divSel.length > 0,
      display: divSel.length === 1 ? tx(d?.divisions?.[divSel[0]]) : `${divSel.length} ${t("filter.selected2")}`,
      onClear: () => setDivSel([]),
      render: () => (
        <OptsFilter searchable opts={divOpts.map(([v]) => v)} sel={divSel} onChange={setDivSel}
          labelOf={(v) => tx(d?.divisions?.[v]) || v}
          render={(v) => (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="truncate">{tx(d?.divisions?.[v]) || `#${v}`}</span>
              <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{divOpts.find(([x]) => x === v)?.[1]}</span>
            </span>
          )} />
      ),
    },
    {
      key: "cell", icon: Grid3x3, label: t("vfx.emp.f.cell"), active: inCell !== "all",
      display: t(inCell === "yes" ? "vfx.emp.f.cellYes" : "vfx.emp.f.cellNo"), onClear: () => setInCell("all"),
      render: ({ close }) => <PickFilter close={close} value={inCell} onChange={setInCell} opts={[
        { value: "all", label: t("vfx.all") }, { value: "yes", label: t("vfx.emp.f.cellYes") }, { value: "no", label: t("vfx.emp.f.cellNo") }]} />,
    },
    {
      key: "late", icon: Clock3, label: t("vfx.ts.f.time"), active: late !== "all",
      display: t(late === "late" ? "vfx.ts.f.late" : "vfx.ts.f.early"), onClear: () => setLate("all"),
      render: ({ close }) => <PickFilter close={close} value={late} onChange={setLate} opts={[
        { value: "all", label: t("vfx.all") }, { value: "late", label: t("vfx.ts.f.late") }, { value: "early", label: t("vfx.ts.f.early") }]} />,
    },
  ];

  const columns = [
    {
      key: "name", label: t("vfx.emp.col.name"), sort: (r) => tl(r.name),
      render: (r) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <VfxPhoto sha={r.photo} name={tl(r.name)} px={28} />
          <span className="truncate font-medium max-w-[220px]" style={{ color: "var(--text-1)" }}>{tl(r.name)}</span>
        </div>
      ),
    },
    {
      key: "unit", label: t("vfx.emp.col.unit"), sort: (r) => d?.cells?.[r.unit]?.code || unitName(r),
      render: (r) => (d?.cells?.[r.unit] ? <CellChip cell={d.cells[r.unit]} compact />
        : <span className="truncate block max-w-[200px]" style={{ color: "var(--text-2)" }}>{unitName(r)}</span>),
    },
    {
      key: "sched", label: t("vfx.ts.col.sched"), sort: (r) => r.begin,
      render: (r) => (
        <div className="min-w-0">
          <div className="tabular-nums">{r.begin ? `${hm(r.begin)}–${hm(r.end)}` : "—"}</div>
          <div className="text-[11px] truncate max-w-[160px]" style={{ color: "var(--text-3)" }}>{r.kind && r.kind !== "W" ? t(`vfx.day.${r.kind}`) : tx(r.sched)}</div>
        </div>
      ),
    },
    {
      key: "in", label: t("vfx.ts.col.in"), sort: (r) => r.in,
      render: (r) => (r.in ? (
        <span className="tabular-nums whitespace-nowrap">{clockOn(r.in, d.day)}
          {r.late ? <span className="ml-1.5 text-[11px] font-semibold" style={{ color: C_BAD }}>+{r.late}</span> : null}</span>
      ) : <span style={{ color: "var(--text-4)" }}>—</span>),
    },
    {
      key: "out", label: t("vfx.ts.col.out"), sort: (r) => r.out,
      render: (r) => (r.out ? (
        <span className="tabular-nums whitespace-nowrap">{clockOn(r.out, d.day)}
          {r.early_out ? <span className="ml-1.5 text-[11px] font-semibold" style={{ color: C_WARN }}>−{r.early_out}</span> : null}</span>
      ) : <span style={{ color: "var(--text-4)" }}>—</span>),
    },
    {
      key: "hours", label: t("vfx.ts.col.hours"), align: "right", firstDir: "desc", sort: (r) => r.hours,
      hint: t("vfx.ts.col.hoursHint"),
      render: (r) => (r.hours != null ? `${hmm(r.hours)}${r.so_far ? "*" : ""}` : <span style={{ color: "var(--text-4)" }}>—</span>),
    },
    {
      key: "status", label: t("vfx.ts.col.status"), sort: (r) => STATUSES.indexOf(r.status),
      render: (r) => <StatusDot color={DAY_STATUS[r.status] || C_NONE} label={t(`staffLive.st.${r.status}`)} />,
    },
  ];

  const sk = <SkeletonBlock className="h-7 w-14 mt-1" />;
  const filterTo = (list) => () => setStSel(list);
  const openRow = all.find((r) => r.id === open);

  return (
    <Layout title={t("nav.vfx.timesheet")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <DayStepper value={day} onChange={setDay} />
          <p className="text-sm flex-1 min-w-[220px]" style={{ color: "var(--text-2)" }}>
            {day === d?.today ? t("vfx.ts.leadToday") : t("vfx.ts.lead")}
          </p>
          <FetchedAt at={d?.fetched_at} today={d?.today} />
          <RefreshButton busy={q.isFetching} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              <KPICard label={t("vfx.ts.k.planned")} icon={CalendarCheck} value={d ? num(k.planned) : sk}
                sub={d ? fill(t("vfx.ts.k.plannedSub"), { n: num(all.length) }) : null} />
              <KPICard label={t("vfx.ts.k.came")} icon={LogIn} color={C_OK} value={d ? num(k.came) : sk}
                onValueClick={d ? filterTo(["inside", "break", "left", "no_out"]) : undefined} />
              <KPICard label={t("vfx.ts.k.absent")} icon={UserX} color={k.absent ? C_BAD : undefined} value={d ? num(k.absent) : sk}
                onValueClick={d ? filterTo(["absent"]) : undefined} />
              <KPICard label={t("vfx.ts.k.late")} icon={Timer} color={k.late ? C_WARN : undefined} value={d ? num(k.late) : sk}
                onValueClick={d ? () => setLate("late") : undefined} />
              <KPICard label={t("vfx.ts.k.noOut")} icon={DoorOpen} color={k.noOut ? C_BAD : undefined} value={d ? num(k.noOut) : sk}
                tooltip={t("vfx.ts.k.noOutHint")} onValueClick={d ? filterTo(["no_out"]) : undefined} />
            </div>

            <VfxTable
              icon={CalendarRange} title={t("vfx.ts.title")}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.ts.search")} className="w-full sm:w-64" />
                <FilterPanel sections={sections} />
              </>}
              rows={rows} columns={columns} rowKey={(r) => r.id} loading={q.isLoading}
              defaultSort={{ key: "in", dir: "asc" }} sortStoreKey="vfx_ts_sort"
              empty={all.length ? t("vfx.noMatch") : t("vfx.ts.empty")}
              onRowClick={(r) => setOpen(r.id)}
            />
            {q.isLoading && <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("vfx.ts.slow")}</p>}
          </>
        )}
      </div>
      {openRow && (
        <DayModal r={openRow} d={d} onClose={() => setOpen(null)} onPerson={() => setPerson(openRow.id)} />
      )}
      {person && <PersonCard id={person} onClose={() => setPerson(null)} zIndex={60} />}
    </Layout>
  );
}

function DayModal({ r, d, onClose, onPerson }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const worked = new Set(d.worked_kinds || []);
  const div = d.fact_unit === "min" ? 60 : 3600;
  const facts = Object.entries(r.facts || {}).sort((a, b) => b[1] - a[1]);
  const cell = d.cells?.[r.unit];
  const rowsList = [
    [t("vfx.ts.d.sched"), r.begin ? `${hm(r.begin)}–${hm(r.end)}${r.plan ? ` · ${fill(t("vfx.ts.d.plan"), { h: hmm(r.plan / 60) })}` : ""}` : (r.kind ? t(`vfx.day.${r.kind}`) : "—")],
    [t("vfx.ts.col.in"), r.in ? `${clockOn(r.in, d.day)}${r.in_loc ? ` · ${tx(d.locations?.[r.in_loc]) || r.in_loc}` : ""}` : "—"],
    [t("vfx.ts.col.out"), r.out ? `${clockOn(r.out, d.day)}${r.out_loc ? ` · ${tx(d.locations?.[r.out_loc]) || r.out_loc}` : ""}` : "—"],
    [t("vfx.ts.d.late"), r.late ? fill(t("vfx.min"), { n: r.late }) : "—"],
    [t("vfx.ts.d.early"), r.early_out ? fill(t("vfx.min"), { n: r.early_out }) : "—"],
    [t("vfx.ts.col.hours"), r.hours != null ? `${hmm(r.hours)}${r.so_far ? ` (${t("vfx.ts.d.soFar")})` : ""}` : "—"],
    r.marks_planned ? [t("vfx.ts.d.marks"), `${r.marks_done ?? 0} / ${r.marks_planned}`] : null,
  ].filter(Boolean);
  return (
    <Modal onClose={onClose} title={tl(r.name)} icon={CalendarRange} maxWidth="max-w-xl"
      subtitle={[d.day.split("-").reverse().join("."), cell ? cell.code : tx(d.divisions?.[r.unit])].filter(Boolean).join(" · ")}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t("vfx.close")}</Button>
        <Button variant="primary" icon={<UserRound size={13} />} onClick={onPerson}>{t("vfx.ts.d.person")}</Button>
      </>}>
      <div className="flex items-center gap-2">
        <StatusDot color={DAY_STATUS[r.status] || C_NONE} label={t(`staffLive.st.${r.status}`)} />
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rowsList.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{k}</dt>
            <dd style={{ color: "var(--text-1)" }}>{v}</dd>
          </div>
        ))}
      </dl>
      <div>
        <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>{t("vfx.ts.d.facts")}</div>
        {facts.length ? (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full text-xs">
              <tbody>
                {facts.map(([kid, v]) => {
                  const kind = d.kinds?.[kid];
                  return (
                    <tr key={kid} className="border-t first:border-t-0 border-[var(--border)]">
                      <td className="px-3 py-1.5 font-mono font-semibold w-12">{kind?.letter || "—"}</td>
                      <td className="px-3 py-1.5">{tx(kind?.name) || `#${kid}`}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{hmm(v / div)}</td>
                      <td className="px-3 py-1.5 w-8 text-center" title={worked.has(kid) ? t("vfx.jobs.col.workedHint") : undefined}>
                        {worked.has(kid) && <Check size={13} style={{ color: C_OK }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("vfx.ts.d.noFacts")}</p>}
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>{t(d.fact_unit === "min" ? "vfx.ts.d.unitMin" : "vfx.ts.d.unitSec")}</p>
      </div>
    </Modal>
  );
}
