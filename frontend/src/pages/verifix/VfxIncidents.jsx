import { useMemo, useState } from "react";
import { Siren, Users, Tags, TrendingUp } from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import SearchInput from "../../components/ui/SearchInput";
import { FilterPanel } from "../../components/ui/ColumnFilter";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import VfxTable from "../../components/verifix/VfxTable";
import PersonCard from "../../components/verifix/PersonCard";
import { localISO } from "../../components/ui/DateRangePicker";
import { VfxError, FetchedAt, RefreshButton, Chip } from "../../components/verifix/VfxState";
import { vfxError, num, dmy } from "../../components/verifix/vfx";
import { RangePicker, SectionNote, Who, Muted } from "../../components/verifix/registers";
import { useRegister, useRange, facet, optsSection, sk, dash } from "../../components/verifix/registerKit";

/* «Hodisalar» — Verifix's incident register (Pro): what happened, to whom,
 * who answered for it and what was done. */

export default function VfxIncidents() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [from, to, setFrom, setTo] = useRange("vfx_inc", 90);
  const [q, refresh] = useRegister(["incidents"], "/incidents", { begin: from, end: to });
  const d = q.data;
  const [search, setSearch] = useState("");
  const [typeSel, setTypeSel] = useState([]);
  const [open, setOpen] = useState(null);

  const all = useMemo(() => d?.rows || [], [d]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (!typeSel.length || typeSel.includes(r.type))
      && (!needle || `${r.name || ""} ${tl(r.name || "")} ${r.resp || ""} ${r.note || ""} ${r.num || ""}`.toLowerCase().includes(needle)));
  }, [all, typeSel, search, tl]);

  const types = useMemo(() => facet(all, (r) => r.type, (v) => tx(v)), [all, tx]);
  const people = new Set(all.map((r) => r.emp || r.name).filter(Boolean)).size;
  const top = types[0];
  const sections = [optsSection({ key: "type", icon: Tags, label: t("vfx.inc.col.type"), opts: types, sel: typeSel, setSel: setTypeSel, t })];

  const columns = [
    { key: "date", label: t("vfx.r.date"), firstDir: "desc", sort: (r) => r.date,
      render: (r) => (
        <div className="text-xs tabular-nums whitespace-nowrap">
          <div>{r.date ? dmy(r.date) : "—"}</div>
          {r.num && <div className="text-[11px]" style={{ color: "var(--text-3)" }}>№{String(r.num).replace(/^0+/, "")}</div>}
        </div>
      ) },
    { key: "type", label: t("vfx.inc.col.type"), sort: (r) => r.type,
      render: (r) => (r.type ? <Chip color="#64748b">{tx(r.type)}</Chip> : dash) },
    { key: "who", label: t("vfx.r.person"), sort: (r) => tl(r.name || ""), render: (r) => <Who id={r.emp} name={r.name} frame={d} /> },
    { key: "resp", label: t("vfx.inc.col.resp"), sort: (r) => tl(r.resp || ""),
      render: (r) => (r.resp ? <Who id={r.resp_id} name={r.resp} frame={d} px={24} /> : dash) },
    { key: "action", label: t("vfx.inc.col.action"), sort: (r) => r.action,
      render: (r) => (r.action ? <Chip color="#64748b" mono title={t("vfx.inc.col.actionHint")}>{r.action}</Chip> : dash) },
    { key: "note", label: t("vfx.r.note"), sort: (r) => r.note, render: (r) => <Muted max={320}>{r.note}</Muted> },
  ];

  return (
    <Layout title={t("nav.vfx.incidents")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} max={localISO(new Date())} />
          <p className="text-sm flex-1 min-w-[200px] max-w-2xl" style={{ color: "var(--text-2)" }}>{t("vfx.inc.lead")}</p>
          <FetchedAt at={d?.section?.at} today={d?.today} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>
        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("vfx.inc.k.count")} icon={Siren} value={d ? num(all.length) : sk} />
              <KPICard label={t("vfx.inc.k.people")} icon={Users} value={d ? num(people) : sk} />
              <KPICard label={t("vfx.inc.k.types")} icon={Tags} value={d ? num(types.length) : sk} />
              <KPICard label={t("vfx.inc.k.top")} icon={TrendingUp} value={d ? (top ? num(top.n) : "—") : sk}
                sub={top ? tx(top.name) : null} onValueClick={top ? () => setTypeSel([top.value]) : undefined} />
            </div>
            <SectionNote s={d?.section} form="Инциденты" />
            <VfxTable icon={Siren} title={t("vfx.inc.title")}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.inc.search")} className="w-full sm:w-64" />
                <FilterPanel sections={sections} />
              </>}
              rows={rows} columns={columns} rowKey={(r) => r.id} loading={q.isLoading}
              defaultSort={{ key: "date", dir: "desc" }} sortStoreKey="vfx_inc_sort"
              empty={all.length ? t("vfx.noMatch") : t("vfx.inc.empty")}
              onRowClick={(r) => r.emp && setOpen(r.emp)} />
          </>
        )}
      </div>
      {open && <PersonCard id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}
