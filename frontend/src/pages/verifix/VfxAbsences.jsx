import { useMemo, useState } from "react";
import { Palmtree, Thermometer, Plane, Undo2, CalendarRange, CircleDot, FileCheck2 } from "lucide-react";
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
import { VfxError, FetchedAt, RefreshButton, Chip } from "../../components/verifix/VfxState";
import { vfxError, fill, num, dmy } from "../../components/verifix/vfx";
import { RangePicker, SectionNote, Who, Posted, Journal, Muted } from "../../components/verifix/registers";
import {
  useRegister, useRange, pickSection, span, sk, dash, C_OK, C_WARN,
} from "../../components/verifix/registerKit";

/* «Yo'qliklar» — vacations (and the recalls that cut them short), sick leaves
 * and business trips that touch a period, from the Pro module's journals. The
 * three headline numbers are who is away TODAY, whatever the period. */

const TABS = ["vacation", "sick", "trip", "recall"];
const FORMS = { vacation: "Отпуск", sick: "Больничный лист", trip: "Командировка", recall: "Отзыв из отпуска" };
const ICONS = { vacation: Palmtree, sick: Thermometer, trip: Plane, recall: Undo2 };

export default function VfxAbsences() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [from, to, setFrom, setTo] = useRange("vfx_ab", 15, 15);
  const [q, refresh] = useRegister(["absences"], "/absences", { begin: from, end: to });
  const d = q.data;
  const [tab, setTab] = usePersistentState("vfx_ab_tab", "vacation");
  const [search, setSearch] = useState("");
  const [now, setNow] = usePersistentState("vfx_ab_now", "all");
  const [posted, setPosted] = usePersistentState("vfx_ab_posted", "all");
  const [open, setOpen] = useState(null);

  const sec = d?.[tab];
  const all = useMemo(() => sec?.rows || [], [sec]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (now === "all" || tab === "recall" || r.now)
      && (posted === "all" || (posted === "yes") === !!r.posted)
      && (!needle || `${r.name || ""} ${tl(r.name || "")} ${r.emp || ""} ${r.reason || ""} ${(r.regions || []).join(" ")}`
        .toLowerCase().includes(needle)));
  }, [all, now, posted, search, tab, tl]);
  const days = rows.reduce((a, r) => a + (r.days || 0), 0);

  const sections = [
    ...(tab !== "recall" ? [pickSection({ key: "now", icon: CircleDot, label: t("vfx.ab.f.now"), value: now, set: setNow,
      opts: [["all", t("vfx.all")], ["yes", t("vfx.ab.f.nowYes")]] })] : []),
    pickSection({ key: "posted", icon: FileCheck2, label: t("vfx.r.posted"), value: posted, set: setPosted,
      opts: [["all", t("vfx.all")], ["yes", t("vfx.r.posted")], ["no", t("vfx.r.draft")]] }),
  ];

  const who = { key: "who", label: t("vfx.r.person"), sort: (r) => tl(r.name || ""),
    render: (r) => <Who id={r.emp} name={r.name} staff={r.staff} frame={d} /> };
  const period = { key: "period", label: t("vfx.r.period"), firstDir: "desc", sort: (r) => r.begin,
    render: (r) => (
      <div className="text-xs tabular-nums whitespace-nowrap">
        <span>{span(r.begin, r.end)}</span>
        <span className="ml-1.5" style={{ color: "var(--text-3)" }}>{r.days ? fill(t("vfx.r.daysN"), { n: r.days }) : ""}</span>
        {r.now && <span className="ml-1.5"><Chip color={C_OK}>{t("vfx.ab.now")}</Chip></span>}
      </div>
    ) };
  const journal = { key: "journal", label: t("vfx.r.journal"), sort: (r) => r.jdate,
    render: (r) => <div className="flex flex-col gap-0.5"><Journal r={r} /><Posted v={r.posted} /></div> };
  const COLS = {
    vacation: [
      who, period,
      { key: "kind", label: t("vfx.ab.col.kind"), sort: (r) => d?.kinds?.[r.tk], render: (r) => <Muted max={180}>{tx(d?.kinds?.[r.tk] || "")}</Muted> },
      { key: "year", label: t("vfx.ab.col.year"), sort: (r) => r.pbegin, hint: t("vfx.ab.col.yearHint"),
        render: (r) => <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{span(r.pbegin, r.pend)}</span> },
      { key: "recalled", label: t("vfx.ab.col.recalled"), sort: (r) => r.recalled,
        render: (r) => (r.recalled ? <Chip color={C_WARN}>{fill(t("vfx.ab.recalledOn"), { d: dmy(r.recalled) })}</Chip> : dash) },
      journal,
    ],
    sick: [
      who, period,
      { key: "reason", label: t("vfx.ab.col.reason"), sort: (r) => r.reason, render: (r) => <Muted max={220}>{tx(r.reason || "")}</Muted> },
      { key: "coef", label: t("vfx.ab.col.coef"), align: "right", sort: (r) => r.coef, hint: t("vfx.ab.col.coefHint"),
        render: (r) => (r.coef != null ? r.coef : dash) },
      journal,
    ],
    trip: [
      who, period,
      { key: "regions", label: t("vfx.ab.col.regions"), sort: (r) => r.regions?.[0],
        render: (r) => (r.regions?.length ? <Muted max={220}>{r.regions.map((x) => tx(x)).join(", ")}</Muted> : dash) },
      { key: "legal", label: t("vfx.ab.col.legal"), sort: (r) => r.legal, render: (r) => <Muted max={200}>{tx(r.legal || "")}</Muted> },
      { key: "reason", label: t("vfx.ab.col.reason"), sort: (r) => r.reason, render: (r) => <Muted max={200}>{tx(r.reason || "")}</Muted> },
      journal,
    ],
    recall: [
      who,
      { key: "date", label: t("vfx.ab.col.recallDate"), firstDir: "desc", sort: (r) => r.date,
        render: (r) => <span className="text-xs tabular-nums">{r.date ? dmy(r.date) : "—"}</span> },
      { key: "vac", label: t("vfx.ab.col.vacation"), sort: (r) => r.vbegin,
        render: (r) => <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{span(r.vbegin, r.vend)}</span> },
      { key: "vnum", label: t("vfx.ab.col.vnum"), sort: (r) => r.vnum,
        render: (r) => (r.vnum ? <span className="text-xs tabular-nums">№{String(r.vnum).replace(/^0+/, "")}</span> : dash) },
      journal,
    ],
  };

  return (
    <Layout title={t("nav.vfx.absences")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <p className="text-sm flex-1 min-w-[200px] max-w-2xl" style={{ color: "var(--text-2)" }}>{t("vfx.ab.lead")}</p>
          <FetchedAt at={sec?.at} today={d?.today} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("vfx.ab.k.vacation")} icon={Palmtree} value={d ? num(d.away?.vacation || 0) : sk}
                tooltip={t("vfx.ab.k.todayHint")} onValueClick={d?.away?.vacation ? () => { setTab("vacation"); setNow("yes"); } : undefined} />
              <KPICard label={t("vfx.ab.k.sick")} icon={Thermometer} value={d ? num(d.away?.sick || 0) : sk}
                tooltip={t("vfx.ab.k.todayHint")} onValueClick={d?.away?.sick ? () => { setTab("sick"); setNow("yes"); } : undefined} />
              <KPICard label={t("vfx.ab.k.trip")} icon={Plane} value={d ? num(d.away?.trip || 0) : sk}
                tooltip={t("vfx.ab.k.todayHint")} onValueClick={d?.away?.trip ? () => { setTab("trip"); setNow("yes"); } : undefined} />
              <KPICard label={t("vfx.ab.k.shown")} icon={CalendarRange} value={d ? num(rows.length) : sk}
                sub={d && tab !== "recall" ? fill(t("vfx.ab.k.shownSub"), { n: num(days) }) : null} />
            </div>

            <SegmentedToggle asTabs value={tab} onChange={setTab} options={TABS.map((k) => ({
              value: k, label: `${t(`vfx.ab.tab.${k}`)}${d ? ` · ${num(d[k]?.rows?.length || 0)}` : ""}`,
            }))} />
            <SectionNote s={sec} form={FORMS[tab]} />

            <VfxTable key={tab} icon={ICONS[tab]} title={t(`vfx.ab.tab.${tab}`)}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.r.searchPerson")} className="w-full sm:w-64" />
                <FilterPanel sections={sections} />
              </>}
              rows={rows} columns={COLS[tab]} rowKey={(r) => `${r.j}:${r.id}:${r.emp || r.staff}`} loading={q.isLoading}
              defaultSort={{ key: tab === "recall" ? "date" : "period", dir: "desc" }}
              empty={all.length ? t("vfx.noMatch") : t("vfx.ab.empty")}
              onRowClick={(r) => r.emp && setOpen(r.emp)} />
          </>
        )}
      </div>
      {open && <PersonCard id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}
