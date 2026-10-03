import { useMemo, useState } from "react";
import { UserPlus, ArrowRightLeft, UserMinus, TrendingUp, CalendarClock, Award, Building2, Tags } from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { FilterPanel } from "../../components/ui/ColumnFilter";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import PersonCard from "../../components/verifix/PersonCard";
import { VfxError, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import { localISO } from "../../components/ui/DateRangePicker";
import { vfxError, fill, num, dmy } from "../../components/verifix/vfx";
import {
  RangePicker, SectionNote, SourceNote, Who, Node, Posted, Journal, Muted, GenericTable,
} from "../../components/verifix/registers";
import {
  useRegister, useRange, facet, optsSection, money, sk, dash, C_OK, C_BAD,
} from "../../components/verifix/registerKit";

/* «Kadr harakati» — the HR journals of a period: hirings, transfers (which
 * carry the org unit a person moved to, by date — the history the live feed
 * lacks), dismissals with their reasons, schedule and rank changes. The Pro
 * module's journals are read first; where the role does not open them, the
 * Start module's view of the same journals is. */

const TABS = ["hire", "transfer", "dismissal", "schedule", "rank"];
const FORMS = {
  hire: "Прием на работу", transfer: "Кадровый перевод", dismissal: "Увольнение",
  schedule: "Изменение рабочего графика", rank: "Изменение разряда",
};
const ICONS = { hire: UserPlus, transfer: ArrowRightLeft, dismissal: UserMinus, schedule: CalendarClock, rank: Award };

export default function VfxHrMoves() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [from, to, setFrom, setTo] = useRange("vfx_hr", 30);
  const [q, refresh] = useRegister(["hr"], "/hr", { begin: from, end: to });
  const d = q.data;
  const [tab, setTab] = usePersistentState("vfx_hr_tab", "hire");
  const [search, setSearch] = useState("");
  const [nodeSel, setNodeSel] = useState([]);
  const [reasonSel, setReasonSel] = useState([]);
  const [open, setOpen] = useState(null);

  const sec = d?.[tab];
  const all = useMemo(() => sec?.rows || [], [sec]);
  const nodeOf = (r) => r.unit || r.div;
  const nodeName = (id) => {
    const c = d?.cells?.[id];
    const row = all.find((r) => nodeOf(r) === id);
    const label = tx(row?.unit_name || row?.div_name || d?.divisions?.[id] || "") || `#${id}`;
    return c ? `${c.code} · ${label}` : label;
  };
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (!nodeSel.length || nodeSel.includes(nodeOf(r)))
      && (tab !== "dismissal" || !reasonSel.length || reasonSel.includes(r.reason))
      && (!needle || `${r.name || ""} ${tl(r.name || "")} ${r.emp || ""} ${r.job || ""} ${r.reason || ""}`
        .toLowerCase().includes(needle)));
  }, [all, nodeSel, reasonSel, search, tab, tl]);

  const people = (k) => new Set((d?.[k]?.rows || []).map((r) => r.emp || r.staff || r.name)).size;
  const hired = people("hire");
  const moved = people("transfer");
  const left = people("dismissal");
  const net = hired - left;

  const nodeOpts = useMemo(() => (tab === "rank" ? [] : facet(all, nodeOf, nodeName)), [all, tab, d]); // eslint-disable-line react-hooks/exhaustive-deps
  const reasonOpts = useMemo(() => facet(d?.dismissal?.rows || [], (r) => r.reason, (v) => tx(v)), [d, tx]);
  const sections = tab === "rank" ? [] : [
    optsSection({ key: "node", icon: Building2, label: t("vfx.hr.f.node"), opts: nodeOpts, sel: nodeSel, setSel: setNodeSel, t }),
    ...(tab === "dismissal" ? [optsSection({ key: "reason", icon: Tags, label: t("vfx.hr.col.reason"), opts: reasonOpts, sel: reasonSel, setSel: setReasonSel, t })] : []),
  ];

  const date = { key: "date", label: t("vfx.r.date"), firstDir: "desc", sort: (r) => r.date,
    render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{r.date ? dmy(r.date) : "—"}</span> };
  const who = { key: "who", label: t("vfx.r.person"), sort: (r) => tl(r.name || ""),
    render: (r) => <Who id={r.emp} name={r.name} staff={r.staff} frame={d} sub={r.position ? tx(r.position) : null} /> };
  const where = { key: "where", label: t("vfx.hr.col.where"), sort: (r) => nodeName(nodeOf(r) || ""),
    render: (r) => <Node id={nodeOf(r)} name={r.unit_name || r.div_name} frame={d} /> };
  const job = { key: "job", label: t("vfx.hr.col.job"), sort: (r) => r.job,
    render: (r) => (
      <div className="min-w-0 max-w-[220px]">
        <div className="truncate">{tx(r.job || "") || "—"}</div>
        {(r.fte || r.rank) && <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{[tx(r.fte || ""), tx(r.rank || "")].filter(Boolean).join(" · ")}</div>}
      </div>
    ) };
  const sched = { key: "sched", label: t("vfx.hr.col.sched"), sort: (r) => r.sched, render: (r) => <Muted max={170}>{tx(r.sched || "")}</Muted> };
  const pay = { key: "pay", label: t("vfx.hr.col.pay"), align: "right", firstDir: "desc", hint: t("vfx.hr.col.payHint"),
    sort: (r) => r.salary?.value ?? r.pay?.[0]?.value,
    render: (r) => {
      const list = r.salary ? [{ name: null, value: r.salary.value, type: r.salary.type }] : r.pay || [];
      if (!list.length) return dash;
      return (
        <div className="flex flex-col items-end gap-0.5">
          {list.slice(0, 2).map((p, i) => (
            <span key={i} className="tabular-nums whitespace-nowrap" title={p.type ? `Verifix: ${p.type}` : undefined}>
              {p.name && <span className="text-[11px] mr-1" style={{ color: "var(--text-3)" }}>{tx(p.name)}</span>}{money(p.value)}
            </span>
          ))}
        </div>
      );
    } };
  const journal = { key: "journal", label: t("vfx.r.journal"), sort: (r) => r.jdate,
    render: (r) => (r.jnum || r.jdate ? <div className="flex flex-col gap-0.5"><Journal r={r} /><Posted v={r.posted} /></div> : dash) };
  const COLS = {
    hire: [date, who, where, job, sched, pay,
      { key: "contract", label: t("vfx.hr.col.contract"), sort: (r) => r.expiry,
        render: (r) => (r.fixed ? <span className="text-xs tabular-nums">{fill(t("vfx.hr.until"), { d: r.expiry ? dmy(r.expiry) : "—" })}</span>
          : r.trial ? <span className="text-xs">{fill(t("vfx.hr.trial"), { n: r.trial })}</span> : dash) },
      journal],
    transfer: [date, who, where, job, sched, pay,
      { key: "until", label: t("vfx.hr.col.until"), sort: (r) => r.until,
        render: (r) => (r.until ? <span className="text-xs tabular-nums">{dmy(r.until)}</span> : dash) },
      journal],
    dismissal: [date, who,
      { key: "reason", label: t("vfx.hr.col.reason"), sort: (r) => r.reason, render: (r) => <Muted max={240}>{tx(r.reason || "")}</Muted> },
      { key: "note", label: t("vfx.r.note"), sort: (r) => r.note, render: (r) => <Muted max={240}>{r.note}</Muted> },
      journal],
    schedule: [date, who, sched, where,
      { key: "until", label: t("vfx.hr.col.until"), sort: (r) => r.until,
        render: (r) => (r.until ? <span className="text-xs tabular-nums">{dmy(r.until)}</span> : dash) },
      journal],
  };

  return (
    <Layout title={t("nav.vfx.hr")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} max={localISO(new Date())} />
          <p className="text-sm flex-1 min-w-[200px] max-w-2xl" style={{ color: "var(--text-2)" }}>{t("vfx.hr.lead")}</p>
          <FetchedAt at={sec?.at} today={d?.today} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("vfx.hr.k.hired")} icon={UserPlus} value={d ? num(hired) : sk}
                onValueClick={hired ? () => setTab("hire") : undefined} />
              <KPICard label={t("vfx.hr.k.moved")} icon={ArrowRightLeft} value={d ? num(moved) : sk}
                onValueClick={moved ? () => setTab("transfer") : undefined} />
              <KPICard label={t("vfx.hr.k.left")} icon={UserMinus} value={d ? num(left) : sk}
                onValueClick={left ? () => setTab("dismissal") : undefined} />
              <KPICard label={t("vfx.hr.k.net")} icon={TrendingUp} color={net > 0 ? C_OK : net < 0 ? C_BAD : undefined}
                value={d ? `${net > 0 ? "+" : ""}${num(net)}` : sk} tooltip={t("vfx.hr.k.netHint")} />
            </div>

            <SegmentedToggle asTabs value={tab} onChange={(v) => { setTab(v); setNodeSel([]); }} options={TABS.map((k) => ({
              value: k, label: `${t(`vfx.hr.tab.${k}`)}${d ? ` · ${num(d[k]?.rows?.length || 0)}` : ""}`,
            }))} />
            <div className="flex items-start gap-3 flex-wrap justify-between">
              <div className="flex-1 min-w-[240px]"><SectionNote s={sec} form={FORMS[tab]} /></div>
              {sec && !sec.error && <SourceNote s={sec} />}
            </div>

            {tab === "rank" ? (
              <GenericTable icon={Award} title={t("vfx.hr.tab.rank")} rows={rows} loading={q.isLoading}
                right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
                toolbar={<SearchInput value={search} onChange={setSearch} placeholder={t("vfx.r.searchPerson")} className="w-full sm:w-64" />}
                empty={all.length ? t("vfx.noMatch") : t("vfx.hr.empty")} />
            ) : (
              <VfxTable key={tab} icon={ICONS[tab]} title={t(`vfx.hr.tab.${tab}`)}
                right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
                toolbar={<>
                  <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.r.searchPerson")} className="w-full sm:w-64" />
                  <FilterPanel sections={sections} />
                </>}
                rows={rows} columns={COLS[tab]} rowKey={(r) => `${r.j || ""}:${r.page || ""}:${r.emp || r.staff}:${r.date}`}
                loading={q.isLoading} defaultSort={{ key: "date", dir: "desc" }}
                empty={all.length ? t("vfx.noMatch") : t("vfx.hr.empty")}
                onRowClick={(r) => r.emp && setOpen(r.emp)} />
            )}
          </>
        )}
      </div>
      {open && <PersonCard id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}
