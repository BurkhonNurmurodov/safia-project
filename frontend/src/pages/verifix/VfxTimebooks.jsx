import { useMemo, useState } from "react";
import { BookOpenCheck, FileCheck2, CalendarDays, Users, ChevronLeft, CalendarRange } from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import { FilterPanel } from "../../components/ui/ColumnFilter";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import PersonCard from "../../components/verifix/PersonCard";
import { VfxError, FetchedAt, RefreshButton, Chip } from "../../components/verifix/VfxState";
import { vfxError, fill, num, dmy, C_NONE } from "../../components/verifix/vfx";
import { SectionNote, Who, Node, Posted } from "../../components/verifix/registers";
import {
  useRegister, facet, optsSection, pickSection, monthLabel, span, pct, sk, dash,
} from "../../components/verifix/registerKit";

/* «Tabel» — Verifix's timebooks (Pro): for each period and department, every
 * person's planned days and hours against what they worked, by time kind. A
 * timebook opens to its people, and a person to their days. */

const hrs = (h) => (h == null ? "—" : `${Math.round(h * 10) / 10}`);

export default function VfxTimebooks() {
  const { t } = useLang();
  const { tx } = useTranslit();
  const [q, refresh] = useRegister(["timebooks"], "/timebooks");
  const d = q.data;
  const [search, setSearch] = useState("");
  const [monthSel, setMonthSel] = usePersistentState("vfx_tb_month", []);
  const [posted, setPosted] = usePersistentState("vfx_tb_posted", "all");
  const [open, setOpen] = useState(null);

  const all = useMemo(() => d?.rows || [], [d]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (!monthSel.length || monthSel.includes(r.month))
      && (posted === "all" || (posted === "yes") === !!r.posted)
      && (!needle || `${r.num || ""} ${r.div_name || ""}`.toLowerCase().includes(needle)));
  }, [all, monthSel, posted, search]);

  const latest = all.reduce((m, r) => (r.month && r.month > m ? r.month : m), "");
  const latestPeople = all.filter((r) => r.month === latest).reduce((a, r) => a + r.people, 0);
  const monthOpts = useMemo(() => facet(all, (r) => r.month, (v) => monthLabel(t, v)).sort((a, b) => (a.value < b.value ? 1 : -1)), [all, t]);
  const sections = [
    optsSection({ key: "month", icon: CalendarDays, label: t("vfx.tb.f.month"), opts: monthOpts, sel: monthSel, setSel: setMonthSel, t }),
    pickSection({ key: "posted", icon: FileCheck2, label: t("vfx.r.posted"), value: posted, set: setPosted,
      opts: [["all", t("vfx.all")], ["yes", t("vfx.r.posted")], ["no", t("vfx.r.draft")]] }),
  ];

  const columns = [
    { key: "num", label: t("vfx.tb.col.num"), sort: (r) => Number(r.num) || r.num,
      render: (r) => (
        <div>
          <div className="font-medium tabular-nums" style={{ color: "var(--text-1)" }}>№{String(r.num || "").replace(/^0+/, "") || r.id}</div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{r.date ? dmy(r.date) : ""}</div>
        </div>
      ) },
    { key: "month", label: t("vfx.tb.col.month"), firstDir: "desc", sort: (r) => r.month, render: (r) => monthLabel(t, r.month) },
    { key: "period", label: t("vfx.r.period"), sort: (r) => r.begin,
      render: (r) => <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{span(r.begin, r.end)}</span> },
    { key: "div", label: t("vfx.tb.col.div"), sort: (r) => r.div_name,
      render: (r) => (r.div_name ? <span className="truncate block max-w-[220px]">{tx(r.div_name)}</span> : <span style={{ color: "var(--text-3)" }}>{t("vfx.tb.allDivs")}</span>) },
    { key: "people", label: t("vfx.tb.col.people"), align: "right", firstDir: "desc", sort: (r) => r.people, render: (r) => num(r.people) },
    { key: "plan", label: t("vfx.tb.col.plan"), align: "right", firstDir: "desc", sort: (r) => r.plan_h, render: (r) => hrs(r.plan_h) },
    { key: "fact", label: t("vfx.tb.col.fact"), align: "right", firstDir: "desc", sort: (r) => r.fact_h,
      render: (r) => (
        <span className="tabular-nums whitespace-nowrap">
          {hrs(r.fact_h)}
          {r.plan_h ? <span className="text-[11px] ml-1" style={{ color: "var(--text-3)" }}>{pct(r.fact_h || 0, r.plan_h)}%</span> : null}
        </span>
      ) },
    { key: "posted", label: t("vfx.r.status"), sort: (r) => r.posted, render: (r) => <Posted v={r.posted} /> },
  ];

  return (
    <Layout title={t("nav.vfx.timebooks")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm flex-1 min-w-[240px] max-w-3xl" style={{ color: "var(--text-2)" }}>{t("vfx.tb.lead")}</p>
          <FetchedAt at={d?.section?.at} today={d?.today} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("vfx.tb.k.count")} icon={BookOpenCheck} value={d ? num(all.length) : sk} />
              <KPICard label={t("vfx.tb.k.posted")} icon={FileCheck2} value={d ? num(all.filter((r) => r.posted).length) : sk}
                sub={d && all.length ? `${pct(all.filter((r) => r.posted).length, all.length)}%` : null} />
              <KPICard label={t("vfx.tb.k.latest")} icon={CalendarDays} value={d ? (latest ? monthLabel(t, latest) : "—") : sk}
                onValueClick={latest ? () => setMonthSel([latest]) : undefined} />
              <KPICard label={t("vfx.tb.k.people")} icon={Users} value={d ? num(latestPeople) : sk} tooltip={t("vfx.tb.k.peopleHint")} />
            </div>
            <SectionNote s={d?.section} form="Табель" />
            <VfxTable icon={BookOpenCheck} title={t("vfx.tb.title")}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.tb.search")} className="w-full sm:w-64" />
                <FilterPanel sections={sections} />
              </>}
              rows={rows} columns={columns} rowKey={(r) => r.id} loading={q.isLoading}
              defaultSort={{ key: "month", dir: "desc" }} sortStoreKey="vfx_tb_sort"
              empty={all.length ? t("vfx.noMatch") : t("vfx.tb.empty")}
              onRowClick={(r) => setOpen(r.id)} />
          </>
        )}
      </div>
      {open && <TimebookModal id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}

const DAY_TONE = { W: "#64748b", R: C_NONE, H: "#8b5cf6", A: "#0ea5e9", N: C_NONE };

function TimebookModal({ id, onClose }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [q] = useRegister(["timebook", id], `/timebooks/${id}`);
  const d = q.data;
  const [who, setWho] = useState(null);
  const [person, setPerson] = useState(null);
  const h = d?.head;
  const kind = (k) => tx(d?.kinds?.[k] || "") || `#${k}`;
  const staff = who ? d?.staffs?.find((s) => s.staff === who) : null;

  const columns = [
    { key: "who", label: t("vfx.r.person"), sort: (r) => tl(r.name || ""),
      render: (r) => <Who id={r.emp} name={r.name} staff={r.staff} frame={d} /> },
    { key: "unit", label: t("vfx.hr.col.where"), sort: (r) => r.unit_name || r.div_name,
      render: (r) => <Node id={r.unit || r.div} name={r.unit_name || r.div_name} frame={d} /> },
    { key: "plan", label: t("vfx.tb.col.planDH"), align: "right", firstDir: "desc", sort: (r) => r.plan_h,
      render: (r) => <span className="tabular-nums whitespace-nowrap">{num(r.plan_d)} · {hrs(r.plan_h)}</span> },
    { key: "fact", label: t("vfx.tb.col.factDH"), align: "right", firstDir: "desc", sort: (r) => r.fact_h,
      render: (r) => <span className="tabular-nums whitespace-nowrap">{num(r.fact_d)} · {hrs(r.fact_h)}</span> },
    { key: "kinds", label: t("vfx.tb.col.kinds"),
      render: (r) => {
        const e = Object.entries(r.facts || {}).filter(([, v]) => v);
        return e.length ? (
          <span className="flex flex-wrap gap-1 max-w-[280px]">
            {e.map(([k, v]) => <Chip key={k} color="#64748b">{kind(k)} {hrs(v)}</Chip>)}
          </span>
        ) : dash;
      } },
  ];

  return (
    <Modal onClose={onClose} icon={BookOpenCheck} maxWidth="max-w-5xl"
      title={h ? fill(t("vfx.tb.modalTitle"), { n: String(h.num || "").replace(/^0+/, "") || h.id }) : t("vfx.loading")}
      subtitle={h ? `${monthLabel(t, h.month)} · ${span(h.begin, h.end)}${h.div_name ? ` · ${tx(h.div_name)}` : ""}` : null}
      footer={<Button variant="secondary" onClick={onClose}>{t("vfx.close")}</Button>}>
      {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} />
        : d?.error && !h ? <SectionNote s={{ error: d.error }} form="Табель" />
        : !d || (d.loading && !h) ? <SkeletonTable rows={6} cols={5} />
        : staff ? (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" icon={<ChevronLeft size={14} />} onClick={() => setWho(null)}>{t("vfx.tb.back")}</Button>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Who id={staff.emp} name={staff.name} staff={staff.staff} frame={d} px={36} />
              {staff.emp && <Button variant="secondary" size="sm" onClick={() => setPerson(staff.emp)}>{t("vfx.ts.d.person")}</Button>}
            </div>
            <SectionNote s={d.days_section} form="Табель" />
            {staff.days?.length ? (
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                {staff.days.map(([date, k, facts]) => {
                  const total = Object.values(facts || {}).reduce((a, v) => a + (v || 0), 0);
                  return (
                    <div key={date} className="rounded-lg px-2 py-1.5 text-[11px]"
                      title={Object.entries(facts || {}).map(([fk, m]) => `${kind(fk)}: ${Math.round((m || 0) / 6) / 10} h`).join("\n") || undefined}
                      style={{ background: "var(--bg-inner)", border: `1px solid ${DAY_TONE[k] || C_NONE}55` }}>
                      <div className="flex items-center justify-between gap-1">
                        <b className="tabular-nums" style={{ color: "var(--text-1)" }}>{date ? `${date.slice(8, 10)}.${date.slice(5, 7)}` : "—"}</b>
                        <span style={{ color: DAY_TONE[k] || C_NONE }}>{k || ""}</span>
                      </div>
                      <div className="tabular-nums" style={{ color: total ? "var(--text-2)" : "var(--text-4)" }}>
                        {total ? `${Math.round(total / 6) / 10} h` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-xs" style={{ color: "var(--text-3)" }}>{d.days_section?.loading ? t("vfx.loadingVfx") : t("vfx.tb.noDays")}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[[t("vfx.tb.col.people"), num(h.people)], [t("vfx.tb.col.plan"), hrs(h.plan_h)], [t("vfx.tb.col.fact"), hrs(h.fact_h)]].map(([l, v]) => (
                <div key={l} className="rounded-xl py-2" style={{ background: "var(--bg-inner)" }}>
                  <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-3)" }}>{l}</div>
                  <div className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{v}</div>
                </div>
              ))}
            </div>
            <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-3)" }}><CalendarRange size={12} />{t("vfx.tb.pickHint")}</p>
            <VfxTable icon={Users} title={t("vfx.tb.people")} rows={d.staffs || []} columns={columns}
              rowKey={(r) => r.staff || r.emp} maxHeight="50vh" pageSize={100}
              defaultSort={{ key: "who", dir: "asc" }} onRowClick={(r) => setWho(r.staff)} />
          </div>
        )}
      {person && <PersonCard id={person} onClose={() => setPerson(null)} zIndex={60} />}
    </Modal>
  );
}
