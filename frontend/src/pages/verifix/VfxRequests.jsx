import { useMemo, useState } from "react";
import { Inbox, Hourglass, CheckCircle2, XCircle, CircleDot, Tags, ScanLine, Timer, CalendarClock, CalendarOff } from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import { FilterPanel } from "../../components/ui/ColumnFilter";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import PersonCard, { TrackType } from "../../components/verifix/PersonCard";
import { VfxError, FetchedAt, RefreshButton, Chip } from "../../components/verifix/VfxState";
import { vfxError, fill, num, dm, hm } from "../../components/verifix/vfx";
import { RangePicker, SectionNote, Who, ReqStatus, Muted } from "../../components/verifix/registers";
import {
  useRegister, useRange, reqLabel, facet, optsSection, span, when, minutesHM, sk, dash, C_OK, C_WARN, C_BAD,
} from "../../components/verifix/registerKit";

/* «So'rovlar» — what people asked Verifix for in a period, with where each
 * request stands: absences, mark corrections, overtime and schedule changes.
 * An absence or schedule change names only a staff record; the server says
 * whose it is. */

const TABS = ["absence", "track", "overtime", "plan"];
const FORMS = {
  absence: "Запрос на отсутствие", track: "Запросы на отметки",
  overtime: "Запросы на сверхурочные (виды времени)", plan: "Запросы на изменение графика",
};
const ICONS = { absence: CalendarOff, track: ScanLine, overtime: Timer, plan: CalendarClock };
const APPROVED = new Set(["A", "C"]);

export default function VfxRequests() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [from, to, setFrom, setTo] = useRange("vfx_rq", 30);
  const [q, refresh] = useRegister(["requests"], "/requests", { begin: from, end: to });
  const d = q.data;
  const [tab, setTab] = usePersistentState("vfx_rq_tab", "absence");
  const [search, setSearch] = useState("");
  const [stSel, setStSel] = useState([]);
  const [kindSel, setKindSel] = useState([]);
  const [open, setOpen] = useState(null);

  const sec = d?.[tab];
  const all = useMemo(() => sec?.rows || [], [sec]);
  const nameOf = (r) => tl(r.name || d?.people?.[r.emp]?.name || "");
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (!stSel.length || stSel.includes(r.status))
      && (tab !== "absence" || !kindSel.length || kindSel.includes(r.kind))
      && (!needle || `${r.name || ""} ${nameOf(r)} ${r.emp || ""} ${r.staff || ""} ${r.note || ""} ${r.mnote || ""}`
        .toLowerCase().includes(needle)));
  }, [all, stSel, kindSel, search, tab, d]); // eslint-disable-line react-hooks/exhaustive-deps

  const every = TABS.flatMap((k) => d?.[k]?.rows || []);
  const waiting = every.filter((r) => r.status === "N").length;
  const approved = every.filter((r) => APPROVED.has(r.status)).length;
  const denied = every.filter((r) => r.status === "D").length;

  const kindName = (id) => tx(d?.kinds?.[id]?.name || "") || (id ? `#${id}` : "—");
  const stOpts = useMemo(() => facet(all, (r) => r.status, (v) => reqLabel(t, v)), [all, t]);
  const kindOpts = useMemo(() => facet(d?.absence?.rows || [], (r) => r.kind, kindName), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = [
    optsSection({ key: "st", icon: CircleDot, label: t("vfx.r.status"), opts: stOpts, sel: stSel, setSel: setStSel, t }),
    ...(tab === "absence" ? [optsSection({ key: "kind", icon: Tags, label: t("vfx.rq.f.kind"), opts: kindOpts, sel: kindSel, setSel: setKindSel, t })] : []),
  ];

  const who = { key: "who", label: t("vfx.r.person"), sort: (r) => nameOf(r) || r.staff,
    render: (r) => <Who id={r.emp} name={r.name} staff={r.staff} frame={d} /> };
  const status = { key: "status", label: t("vfx.r.status"), sort: (r) => r.status, render: (r) => <ReqStatus code={r.status} /> };
  const notes = { key: "note", label: t("vfx.r.note"), sort: (r) => r.note || r.mnote,
    render: (r) => (r.note || r.mnote ? (
      <div className="min-w-0 max-w-[280px] text-xs">
        {r.note && <div className="truncate" title={r.note} style={{ color: "var(--text-2)" }}>{r.note}</div>}
        {r.mnote && <div className="truncate" title={r.mnote} style={{ color: "var(--text-3)" }}>{fill(t("vfx.rq.mnote"), { s: r.mnote })}</div>}
      </div>
    ) : dash) };
  const COLS = {
    absence: [
      who,
      { key: "kind", label: t("vfx.rq.col.kind"), sort: (r) => kindName(r.kind), render: (r) => <Muted max={200}>{kindName(r.kind)}</Muted> },
      { key: "span", label: t("vfx.r.period"), firstDir: "desc", sort: (r) => r.begin,
        render: (r) => <span className="tabular-nums text-xs whitespace-nowrap" title={r.type ? `Verifix: ${r.type}` : undefined}>{span(r.begin, r.end)}</span> },
      status, notes,
    ],
    track: [
      who,
      { key: "at", label: t("vfx.rq.col.at"), firstDir: "desc", sort: (r) => r.at,
        render: (r) => <span className="tabular-nums text-xs whitespace-nowrap">{when(r.at)}</span> },
      { key: "type", label: t("vfx.m.col.type"), sort: (r) => r.type, render: (r) => <TrackType type={r.type} /> },
      status, notes,
    ],
    overtime: [
      who,
      { key: "date", label: t("vfx.r.date"), firstDir: "desc", sort: (r) => r.date,
        render: (r) => <span className="tabular-nums text-xs">{when(r.date)}</span> },
      { key: "min", label: t("vfx.rq.col.overtime"), align: "right", firstDir: "desc", sort: (r) => r.minutes,
        hint: t("vfx.rq.col.overtimeHint"), render: (r) => <span className="tabular-nums">{minutesHM(r.minutes)}</span> },
      { key: "kinds", label: t("vfx.rq.col.kinds"),
        render: (r) => (r.kinds.length ? (
          <span className="flex flex-wrap gap-1 max-w-[260px]">{r.kinds.map((k) => <Chip key={k} color="#64748b">{tx(k)}</Chip>)}</span>
        ) : dash) },
      status, notes,
    ],
    plan: [
      who,
      { key: "created", label: t("vfx.rq.col.created"), firstDir: "desc", sort: (r) => r.created,
        render: (r) => <span className="tabular-nums text-xs whitespace-nowrap">{when(r.created)}</span> },
      { key: "days", label: t("vfx.rq.col.days"), sort: (r) => r.days[0]?.date,
        render: (r) => (
          <div className="flex flex-col gap-0.5 text-xs max-w-[300px]">
            {r.days.slice(0, 4).map((x, i) => (
              <span key={i} className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                <b style={{ color: "var(--text-1)" }}>{dm(x.date)}</b>{x.swap ? ` ⇄ ${dm(x.swap)}` : ""} · {t(`vfx.day.${x.kind}`) !== `vfx.day.${x.kind}` ? t(`vfx.day.${x.kind}`) : x.kind || "—"}
                {x.begin ? ` · ${hm(x.begin)}–${hm(x.end)}` : ""}
              </span>
            ))}
            {r.days.length > 4 && <span style={{ color: "var(--text-3)" }}>{fill(t("vfx.r.more"), { n: r.days.length - 4 })}</span>}
          </div>
        ) },
      status, notes,
    ],
  };

  return (
    <Layout title={t("nav.vfx.requests")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <RangePicker from={from} to={to} setFrom={setFrom} setTo={setTo} />
          <p className="text-sm flex-1 min-w-[200px] max-w-2xl" style={{ color: "var(--text-2)" }}>{t("vfx.rq.lead")}</p>
          <FetchedAt at={sec?.at} today={d?.today} />
          <RefreshButton busy={q.isFetching || !!d?.loading} onClick={refresh} />
        </div>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard label={t("vfx.rq.k.total")} icon={Inbox} value={d ? num(every.length) : sk}
                sub={d ? TABS.map((k) => `${t(`vfx.rq.tab.${k}`)} ${num(d[k]?.rows?.length || 0)}`).join(" · ") : null} />
              <KPICard label={t("vfx.rq.k.waiting")} icon={Hourglass} color={waiting ? C_WARN : undefined}
                value={d ? num(waiting) : sk} tooltip={t("vfx.rq.k.waitingHint")}
                onValueClick={waiting ? () => setStSel(["N"]) : undefined} />
              <KPICard label={t("vfx.rq.k.approved")} icon={CheckCircle2} color={approved ? C_OK : undefined}
                value={d ? num(approved) : sk} tooltip={t("vfx.rq.k.approvedHint")} />
              <KPICard label={t("vfx.rq.k.denied")} icon={XCircle} color={denied ? C_BAD : undefined}
                value={d ? num(denied) : sk} onValueClick={denied ? () => setStSel(["D"]) : undefined} />
            </div>

            <SegmentedToggle asTabs value={tab} onChange={(v) => { setTab(v); setStSel([]); }} options={TABS.map((k) => ({
              value: k, label: `${t(`vfx.rq.tab.${k}`)}${d ? ` · ${num(d[k]?.rows?.length || 0)}` : ""}`,
            }))} />
            <SectionNote s={sec} form={FORMS[tab]} />
            {(tab === "absence" || tab === "plan") && d?.staff_error && (
              <SectionNote s={{ error: d.staff_error }} form="Сотрудник (Pro)" />
            )}

            <VfxTable key={tab} icon={ICONS[tab]} title={t(`vfx.rq.title.${tab}`)}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.rq.search")} className="w-full sm:w-64" />
                <FilterPanel sections={sections} />
              </>}
              rows={rows} columns={COLS[tab]} rowKey={(r) => r.id} loading={q.isLoading}
              defaultSort={{ key: tab === "absence" ? "span" : tab === "track" ? "at" : tab === "plan" ? "created" : "date", dir: "desc" }}
              empty={all.length ? t("vfx.noMatch") : t("vfx.rq.empty")}
              onRowClick={(r) => r.emp && setOpen(r.emp)} />
          </>
        )}
      </div>
      {open && <PersonCard id={open} onClose={() => setOpen(null)} />}
    </Layout>
  );
}
