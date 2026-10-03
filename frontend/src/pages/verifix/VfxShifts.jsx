import { useMemo, useState } from "react";
import { CalendarClock, Users, Clock, UserX, Layers, GitPullRequestDraft, Building2, CircleDot } from "lucide-react";
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
import { VfxError, FetchedAt, RefreshButton, Chip, StatusDot } from "../../components/verifix/VfxState";
import { vfxError, fill, num, dmy, hm } from "../../components/verifix/vfx";
import { RangePicker, SectionNote, Who, Node } from "../../components/verifix/registers";
import {
  useRegister, useRange, facet, optsSection, pickSection, minutesHM, sk, dash, C_OK, C_WARN, C_NONE,
} from "../../components/verifix/registerKit";

/* «Smenalar» — Verifix's own shift planning (the «Управление сменами»
 * module): the shifts of a period with who works them, the shift groups
 * they are cut from, and the draft changes not yet published. A shift with
 * nobody on it is OPEN — said by the data, not guessed from a status letter. */

const TABS = ["shift", "groups", "changes"];
const FORMS = { shift: "Смена", groups: "Группа смен", changes: "Управление сменами" };

function GroupDot({ color, name }) {
  const { tx } = useTranslit();
  if (!name) return dash;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color || C_NONE }} />
      <span className="truncate max-w-[160px]">{tx(name)}</span>
    </span>
  );
}

const clock = (r) => (r.begin ? `${hm(r.begin)}–${hm(r.end)}` : "—");

export default function VfxShifts() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [from, to, setFrom, setTo] = useRange("vfx_sh", 3, 3);
  const [q, refresh] = useRegister(["shifts"], "/shifts", { begin: from, end: to });
  const d = q.data;
  const [tab, setTab] = usePersistentState("vfx_sh_tab", "shift");
  const [search, setSearch] = useState("");
  const [grpSel, setGrpSel] = useState([]);
  const [wpSel, setWpSel] = useState([]);
  const [openOnly, setOpenOnly] = usePersistentState("vfx_sh_open", "all");
  const [open, setOpen] = useState(null);

  const colors = useMemo(() => Object.fromEntries((d?.groups?.rows || []).map((g) => [g.id, g.color])), [d]);
  const sec = d?.[tab];
  const all = useMemo(() => sec?.rows || [], [sec]);
  const rows = useMemo(() => {
    if (tab === "groups") {
      const needle = search.trim().toLowerCase();
      return all.filter((g) => !needle || `${g.name || ""} ${g.code || ""}`.toLowerCase().includes(needle));
    }
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (!grpSel.length || grpSel.includes(r.group))
      && (!wpSel.length || wpSel.includes(r.wp))
      && (openOnly === "all" || !r.emp)
      && (!needle || `${r.name || ""} ${tl(r.name || "")} ${r.emp || ""} ${r.wp_name || ""} ${r.job || ""}`.toLowerCase().includes(needle)));
  }, [all, grpSel, wpSel, openOnly, search, tab, tl]);

  const shiftsAll = d?.shift?.rows || [];
  const people = new Set(shiftsAll.map((r) => r.emp).filter(Boolean)).size;
  const planned = shiftsAll.reduce((a, r) => a + (r.plan || 0), 0) / 60;
  const openN = shiftsAll.filter((r) => !r.emp).length;

  const grpOpts = useMemo(() => facet(all.filter((r) => r.group), (r) => r.group,
    (v) => tx(all.find((r) => r.group === v)?.group_name || "") || `#${v}`), [all, tx]);
  const wpOpts = useMemo(() => facet(all.filter((r) => r.wp), (r) => r.wp, (v) => {
    const c = d?.cells?.[v];
    const n = tx(all.find((r) => r.wp === v)?.wp_name || d?.divisions?.[v] || "") || `#${v}`;
    return c ? `${c.code} · ${n}` : n;
  }), [all, d, tx]);
  const sections = tab === "groups" ? [] : [
    optsSection({ key: "grp", icon: Layers, label: t("vfx.sh.f.group"), opts: grpOpts, sel: grpSel, setSel: setGrpSel, t }),
    optsSection({ key: "wp", icon: Building2, label: t("vfx.sh.f.wp"), opts: wpOpts, sel: wpSel, setSel: setWpSel, t }),
    pickSection({ key: "open", icon: CircleDot, label: t("vfx.sh.f.open"), value: openOnly, set: setOpenOnly,
      opts: [["all", t("vfx.all")], ["open", t("vfx.sh.f.openOnly")]] }),
  ];

  const date = { key: "date", label: t("vfx.r.date"), sort: (r) => `${r.date}${r.begin || ""}`,
    render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{r.date ? dmy(r.date) : "—"}</span> };
  const time = { key: "time", label: t("vfx.sh.col.time"), sort: (r) => r.begin,
    render: (r) => (
      <div className="text-xs tabular-nums whitespace-nowrap">
        <div>{clock(r)}</div>
        {r.bb && <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{fill(t("vfx.sh.break"), { t: `${hm(r.bb)}–${hm(r.be)}` })}</div>}
      </div>
    ) };
  const who = { key: "who", label: t("vfx.r.person"), sort: (r) => tl(r.name || "") || "~",
    render: (r) => (r.emp ? <Who id={r.emp} name={r.name} frame={d} /> : <Chip color={C_WARN}>{t("vfx.sh.open")}</Chip>) };
  const group = { key: "group", label: t("vfx.sh.col.group"), sort: (r) => r.group_name,
    render: (r) => <GroupDot color={colors[r.group]} name={r.group_name} /> };
  const wp = { key: "wp", label: t("vfx.sh.col.wp"), sort: (r) => r.wp_name, render: (r) => <Node id={r.wp} name={r.wp_name} frame={d} /> };
  const plan = { key: "plan", label: t("vfx.sh.col.plan"), align: "right", sort: (r) => r.plan, render: (r) => minutesHM(r.plan) };
  const job = { key: "job", label: t("vfx.hr.col.job"), sort: (r) => r.job, render: (r) => <span className="truncate block max-w-[180px] text-xs">{tx(r.job || "") || "—"}</span> };
  const status = { key: "status", label: t("vfx.r.status"), sort: (r) => r.status,
    render: (r) => (r.status ? <Chip color="#64748b" mono title={t("vfx.sh.statusHint")}>{r.status}</Chip> : dash) };
  const COLS = {
    shift: [date, time, who, group, wp, job, plan, status],
    changes: [date, time, who, group, wp, plan,
      { key: "kind", label: t("vfx.sh.col.kind"), sort: (r) => r.kind,
        render: (r) => (r.kind ? <Chip color="#64748b" mono title={t("vfx.sh.statusHint")}>{r.kind}</Chip> : dash) },
      { key: "pub", label: t("vfx.sh.col.pub"), sort: (r) => r.pub,
        render: (r) => (r.pub ? <StatusDot color={r.pub === "P" ? C_OK : C_NONE} label={r.pub === "P" ? t("vfx.sh.published") : r.pub} /> : dash) },
      status],
    groups: [
      { key: "name", label: t("vfx.sh.col.group"), sort: (g) => g.name, render: (g) => <GroupDot color={g.color} name={g.name || `#${g.id}`} /> },
      { key: "time", label: t("vfx.sh.col.time"), sort: (g) => g.begin,
        render: (g) => <span className="text-xs tabular-nums whitespace-nowrap">{g.begin ? `${g.begin}–${g.end}` : "—"}</span> },
      { key: "plan", label: t("vfx.sh.col.plan"), align: "right", sort: (g) => g.plan, render: (g) => minutesHM(g.plan) },
      { key: "flex", label: t("vfx.sh.col.flex"), sort: (g) => g.flex, hint: t("vfx.sh.col.flexHint"),
        render: (g) => (g.flex == null ? dash : g.flex ? t("vfx.yes") : t("vfx.no")) },
      { key: "code", label: t("vfx.sh.col.code"), sort: (g) => g.code, render: (g) => (g.code ? <span className="font-mono text-xs">{g.code}</span> : dash) },
      { key: "state", label: t("vfx.r.status"), sort: (g) => g.state,
        render: (g) => <StatusDot color={g.state === "A" ? C_OK : C_NONE} label={t(g.state === "A" ? "vfx.active" : "vfx.passive")} /> },
    ],
  };

  return (
    <Layout title={t("nav.vfx.shifts")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <p className="text-sm flex-1 min-w-[200px] max-w-2xl" style={{ color: "var(--text-2)" }}>{t("vfx.sh.lead")}</p>
          <FetchedAt at={sec?.at} today={d?.today} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("vfx.sh.k.shifts")} icon={CalendarClock} value={d ? num(shiftsAll.length) : sk} />
              <KPICard label={t("vfx.sh.k.people")} icon={Users} value={d ? num(people) : sk} />
              <KPICard label={t("vfx.sh.k.hours")} icon={Clock} value={d ? num(Math.round(planned)) : sk} tooltip={t("vfx.sh.k.hoursHint")} />
              <KPICard label={t("vfx.sh.k.open")} icon={UserX} color={openN ? C_WARN : undefined} value={d ? num(openN) : sk}
                tooltip={t("vfx.sh.k.openHint")} onValueClick={openN ? () => { setTab("shift"); setOpenOnly("open"); } : undefined} />
            </div>

            <SegmentedToggle asTabs value={tab} onChange={(v) => { setTab(v); setGrpSel([]); setWpSel([]); }} options={TABS.map((k) => ({
              value: k, label: `${t(`vfx.sh.tab.${k}`)}${d ? ` · ${num(d[k]?.rows?.length || 0)}` : ""}`,
            }))} />
            <SectionNote s={sec} form={FORMS[tab]} />

            <VfxTable key={tab} icon={tab === "groups" ? Layers : tab === "changes" ? GitPullRequestDraft : CalendarClock}
              title={t(`vfx.sh.tab.${tab}`)}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t(tab === "groups" ? "vfx.sh.searchGroup" : "vfx.r.searchPerson")} className="w-full sm:w-64" />
                {sections.length > 0 && <FilterPanel sections={sections} />}
              </>}
              rows={rows} columns={COLS[tab]} rowKey={(r) => `${r.change || ""}:${r.id}`} loading={q.isLoading}
              defaultSort={{ key: tab === "groups" ? "time" : "date", dir: "asc" }}
              empty={all.length ? t("vfx.noMatch") : t("vfx.sh.empty")}
              onRowClick={tab === "groups" ? undefined : (r) => r.emp && setOpen(r.emp)} />
          </>
        )}
      </div>
      {open && <PersonCard id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}
