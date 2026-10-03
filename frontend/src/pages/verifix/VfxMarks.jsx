import { useMemo, useState } from "react";
import { ScanLine, LogIn, LogOut, ShieldCheck, PenLine, ArrowRightLeft, Fingerprint, MapPin, UserRound, Camera, TriangleAlert } from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import StyledSelect from "../../components/ui/StyledSelect";
import DayStepper from "../../components/ui/DayStepper";
import { localISO } from "../../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter, PickFilter } from "../../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonTable } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import VfxPhoto from "../../components/verifix/VfxPhoto";
import PersonCard, { TrackType, markLabel } from "../../components/verifix/PersonCard";
import { VfxError, AccessNotice, StatusDot, CellChip, FetchedAt, RefreshButton } from "../../components/verifix/VfxState";
import { useVfx, vfxError, fill, num, hm, dmy, C_OK, C_BAD, C_WARN, C_NONE } from "../../components/verifix/vfx";

/* «Belgilar» — every mark Verifix recorded in a time window, plant-wide:
 * who, when, which way (in · out · checkpoint · break), how (face · card ·
 * finger · by hand) and where. A whole day is ~40,000 marks, so the page reads
 * a WINDOW — an hour to a day — and says so when a window holds more than
 * one read can carry. A row opens the mark as Verifix describes it, with the
 * photo of the person's last mark that day. */

const HOURS = [1, 2, 4, 8, 24];

export default function VfxMarks() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const today = localISO(new Date());
  const [day, setDay] = useState(today);
  const [start, setStart] = useState(() => Math.max(0, new Date().getHours() - 1));
  const [hours, setHours] = usePersistentState("vfx_marks_hours", 2);
  const [q, refresh] = useVfx(["marks"], "/marks", { day, start, hours });
  const [search, setSearch] = useState("");
  const [types, setTypes] = usePersistentState("vfx_marks_types", []);
  const [srcs, setSrcs] = usePersistentState("vfx_marks_srcs", []);
  const [locs, setLocs] = useState([]);
  const [manual, setManual] = usePersistentState("vfx_marks_manual", "all");
  const [open, setOpen] = useState(null);
  const [person, setPerson] = useState(null);
  const d = q.data;
  const all = d?.rows || [];
  const isManual = (r) => r.mark === "M" || !!r.edited_by;

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return all.filter((r) => (!types.length || types.includes(r.type))
      && (!srcs.length || srcs.includes(r.mark))
      && (!locs.length || locs.includes(r.loc || ""))
      && (manual === "all" || isManual(r))
      && (!needle || `${r.name || ""} ${tl(r.name || "")} ${r.emp} ${d?.cells?.[r.unit]?.code || ""}`.toLowerCase().includes(needle)));
  }, [all, types, srcs, locs, manual, search, d, tl]);

  const counter = (key) => {
    const m = new Map();
    for (const r of all) m.set(r[key] || "", (m.get(r[key] || "") || 0) + 1);
    return m;
  };
  const typeN = useMemo(() => counter("type"), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const srcN = useMemo(() => counter("mark"), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const locN = useMemo(() => counter("loc"), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const manualN = useMemo(() => all.filter(isManual).length, [all]);
  const locName = (v) => (v ? tx(d?.locations?.[v]) || `#${v}` : t("vfx.m.noLoc"));
  const typeName = (v) => { const s = t(`vfx.track.${v}`); return s === `vfx.track.${v}` ? v || "—" : s; };

  const sections = [
    {
      key: "type", icon: ArrowRightLeft, label: t("vfx.m.f.type"), pinned: true, active: types.length > 0,
      display: types.length === 1 ? typeName(types[0]) : `${types.length} ${t("filter.selected2")}`, onClear: () => setTypes([]),
      render: () => (
        <OptsFilter opts={[...typeN.keys()].filter(Boolean)} sel={types} onChange={setTypes} labelOf={typeName}
          render={(v) => <span className="inline-flex items-center gap-1.5"><TrackType type={v} />
            <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{num(typeN.get(v))}</span></span>} />
      ),
    },
    {
      key: "src", icon: Fingerprint, label: t("vfx.m.f.src"), active: srcs.length > 0,
      display: srcs.length === 1 ? markLabel(t, srcs[0]) : `${srcs.length} ${t("filter.selected2")}`, onClear: () => setSrcs([]),
      render: () => (
        <OptsFilter opts={[...srcN.keys()].filter(Boolean)} sel={srcs} onChange={setSrcs} labelOf={(v) => markLabel(t, v)}
          render={(v) => <span className="inline-flex items-center gap-1.5">{markLabel(t, v)}
            <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{num(srcN.get(v))}</span></span>} />
      ),
    },
    {
      key: "loc", icon: MapPin, label: t("vfx.m.f.loc"), active: locs.length > 0,
      display: locs.length === 1 ? locName(locs[0]) : `${locs.length} ${t("filter.selected2")}`, onClear: () => setLocs([]),
      render: () => (
        <OptsFilter searchable opts={[...locN.keys()]} sel={locs} onChange={setLocs} labelOf={locName}
          render={(v) => <span className="inline-flex items-center gap-1.5 min-w-0"><span className="truncate">{locName(v)}</span>
            <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{num(locN.get(v))}</span></span>} />
      ),
    },
    {
      key: "manual", icon: PenLine, label: t("vfx.m.f.manual"), active: manual !== "all",
      display: t("vfx.m.f.manualOnly"), onClear: () => setManual("all"),
      render: ({ close }) => <PickFilter close={close} value={manual} onChange={setManual} opts={[
        { value: "all", label: t("vfx.all") }, { value: "manual", label: t("vfx.m.f.manualOnly") }]} />,
    },
  ];

  const columns = [
    { key: "at", label: t("vfx.m.col.at"), firstDir: "desc", sort: (r) => r.at,
      render: (r) => <span className="tabular-nums font-medium">{hm(r.at)}{r.at && r.at.slice(0, 10) !== day ? <span className="ml-1 text-[11px]" style={{ color: "var(--text-3)" }}>{dmy(r.at)}</span> : null}</span> },
    {
      key: "name", label: t("vfx.emp.col.name"), sort: (r) => tl(r.name || ""),
      render: (r) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <VfxPhoto sha={r.photo} name={tl(r.name || "")} px={28} />
          <span className="truncate max-w-[220px]" style={{ color: "var(--text-1)" }}>{tl(r.name) || "—"}</span>
        </div>
      ),
    },
    {
      key: "unit", label: t("vfx.emp.col.unit"), sort: (r) => d?.cells?.[r.unit]?.code || tx(d?.divisions?.[r.unit]),
      render: (r) => (d?.cells?.[r.unit] ? <CellChip cell={d.cells[r.unit]} compact />
        : <span className="truncate block max-w-[200px]" style={{ color: "var(--text-2)" }}>{tx(d?.divisions?.[r.unit] || d?.divisions?.[r.div]) || "—"}</span>),
    },
    { key: "type", label: t("vfx.m.col.type"), sort: (r) => r.type, render: (r) => <TrackType type={r.type} /> },
    { key: "mark", label: t("vfx.m.col.mark"), sort: (r) => r.mark, render: (r) => <span style={{ color: "var(--text-2)" }}>{markLabel(t, r.mark)}</span> },
    { key: "loc", label: t("vfx.m.col.loc"), sort: (r) => locName(r.loc),
      render: (r) => <span className="truncate block max-w-[200px]" style={{ color: "var(--text-2)" }}>{r.loc ? locName(r.loc) : "—"}</span> },
    { key: "by", label: t("vfx.m.col.by"), sort: (r) => (isManual(r) ? r.edited_by || r.by : null),
      render: (r) => (isManual(r) ? (
        <span className="inline-flex items-center gap-1 truncate max-w-[180px]" style={{ color: C_WARN }}>
          <PenLine size={12} className="flex-shrink-0" />{tl(r.edited_by || r.by) || "—"}
        </span>) : <span style={{ color: "var(--text-4)" }}>—</span>) },
  ];

  const hourOpts = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }));
  const sk = <SkeletonBlock className="h-7 w-14 mt-1" />;
  const openRow = all.find((r) => r.id === open);

  return (
    <Layout title={t("nav.vfx.marks")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <DayStepper value={day} onChange={setDay} />
          {hours < 24 && (
            <StyledSelect value={String(start)} onChange={(v) => setStart(Number(v))} options={hourOpts}
              className="w-[96px]" triggerClassName="px-3 py-2 text-sm min-h-[38px]" />
          )}
          <SegmentedToggle value={hours} onChange={setHours}
            options={HOURS.map((h) => ({ value: h, label: h === 24 ? t("vfx.m.wholeDay") : fill(t("vfx.m.hoursN"), { n: h }) }))} />
          <div className="flex-1" />
          <FetchedAt at={d?.fetched_at} today={today} />
          <RefreshButton busy={q.isFetching} onClick={refresh} />
        </div>
        <p className="text-sm" style={{ color: "var(--text-2)" }}>
          {d ? fill(t("vfx.m.window"), { from: `${dmy(d.begin)} ${hm(d.begin)}`, to: `${hm(d.end)}` }) : t("vfx.m.lead")}
        </p>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            {d?.partial && (
              <div className="rounded-xl px-3 py-2.5 text-xs flex items-start gap-2"
                style={{ background: `${C_WARN}14`, border: `1px solid ${C_WARN}55`, color: "var(--text-1)" }}>
                <TriangleAlert size={14} className="flex-shrink-0 mt-px" style={{ color: C_WARN }} />
                {fill(t("vfx.m.partial"), { n: num(all.length) })}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
              <KPICard label={t("vfx.m.k.total")} icon={ScanLine} value={d ? num(all.length) : sk}
                sub={d ? fill(t("vfx.m.k.people"), { n: num(new Set(all.map((r) => r.emp)).size) }) : null} />
              <KPICard label={t("vfx.track.I")} icon={LogIn} value={d ? num(typeN.get("I") || 0) : sk}
                onValueClick={d ? () => setTypes(["I"]) : undefined} />
              <KPICard label={t("vfx.track.O")} icon={LogOut} value={d ? num(typeN.get("O") || 0) : sk}
                onValueClick={d ? () => setTypes(["O"]) : undefined} />
              <KPICard label={t("vfx.track.C")} icon={ShieldCheck} value={d ? num(typeN.get("C") || 0) : sk}
                tooltip={t("vfx.m.k.checkHint")} onValueClick={d ? () => setTypes(["C"]) : undefined} />
              <KPICard label={t("vfx.m.k.manual")} icon={PenLine} color={manualN ? C_WARN : undefined}
                value={d ? num(manualN) : sk} tooltip={t("vfx.m.k.manualHint")}
                onValueClick={d && manualN ? () => setManual("manual") : undefined} />
            </div>

            <VfxTable
              icon={ScanLine} title={t("vfx.m.title")}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{num(rows.length)}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.m.search")} className="w-full sm:w-64" />
                <FilterPanel sections={sections} />
              </>}
              rows={rows} columns={columns} rowKey={(r) => r.id} loading={q.isLoading}
              defaultSort={{ key: "at", dir: "desc" }} sortStoreKey="vfx_marks_sort"
              empty={all.length ? t("vfx.noMatch") : t("vfx.m.empty")}
              onRowClick={(r) => setOpen(r.id)}
            />
          </>
        )}
      </div>
      {openRow && <MarkModal r={openRow} day={day} d={d} onClose={() => setOpen(null)} onPerson={() => setPerson(openRow.emp)} />}
      {person && <PersonCard id={person} onClose={() => setPerson(null)} zIndex={60} />}
    </Layout>
  );
}

function MarkModal({ r, day, d, onClose, onPerson }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [q] = useVfx(["mark", r.id], `/marks/${r.id}`, { employee_id: r.emp || undefined, day: (r.at || "").slice(0, 10) || day });
  const x = q.data;
  const info = x?.info;
  const last = x?.last;
  const isLast = last && String(last.id) === String(r.id);
  const facts = info ? [
    [t("vfx.m.d.time"), info.track_time || info.track_datetime],
    [t("vfx.m.col.type"), info.track_type_name || r.type],
    [t("vfx.m.col.mark"), info.mark_type_name || markLabel(t, r.mark)],
    [t("vfx.m.d.device"), info.device_name || info.device_id],
    [t("vfx.m.col.loc"), info.location_name || (r.loc ? tx(d?.locations?.[r.loc]) : null)],
    [t("vfx.m.d.valid"), info.is_valid ? (info.is_valid === "Y" ? t("vfx.yes") : t("vfx.no")) : null],
  ].filter(([, v]) => v != null && v !== "") : [];
  return (
    <Modal onClose={onClose} title={tl(r.name) || `#${r.emp}`} icon={ScanLine} maxWidth="max-w-xl"
      subtitle={`${dmy(r.at)} ${hm(r.at)} · ${t(`vfx.track.${r.type}`) === `vfx.track.${r.type}` ? r.type : t(`vfx.track.${r.type}`)}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t("vfx.close")}</Button>
        {r.emp && <Button variant="primary" icon={<UserRound size={13} />} onClick={onPerson}>{t("vfx.ts.d.person")}</Button>}
      </>}>
      {q.isLoading ? <SkeletonTable rows={4} cols={2} /> : q.error ? <VfxError error={vfxError(q.error)} /> : (
        <>
          {x?.info_error ? <AccessNotice error={x.info_error} form="Отметки" /> : (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{k}</dt>
                  <dd style={{ color: "var(--text-1)" }}>{tx(String(v))}</dd>
                </div>
              ))}
              {(r.by || r.edited_by) && r.mark === "M" && (
                <div>
                  <dt className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{t("vfx.m.col.by")}</dt>
                  <dd style={{ color: C_WARN }}>{tl(r.edited_by || r.by)}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: "var(--bg-inner)" }}>
            {last?.photo ? <VfxPhoto sha={last.photo} name={tl(r.name)} px={96} square zoom /> : (
              <span className="w-24 h-24 rounded-lg grid place-items-center flex-shrink-0"
                style={{ background: "var(--bg-card)", color: "var(--text-4)" }}><Camera size={22} /></span>
            )}
            <div className="text-xs space-y-1 min-w-0">
              <div className="font-medium text-sm" style={{ color: "var(--text-1)" }}>{t("vfx.m.d.photo")}</div>
              {x?.last_error ? <span style={{ color: "var(--text-3)" }}>{fill(t("vfx.access.error"), { msg: x.last_error.message })}</span>
                : last ? (
                  <>
                    <div style={{ color: "var(--text-2)" }}>
                      {fill(t("vfx.m.d.lastAt"), { at: `${hm(last.at)}` })} · <TrackType type={last.type} />
                    </div>
                    <StatusDot color={isLast ? C_OK : C_NONE} label={t(isLast ? "vfx.m.d.isLast" : "vfx.m.d.notLast")} />
                    {!last.photo && <div style={{ color: "var(--text-3)" }}>{t("vfx.m.d.noPhoto")}</div>}
                  </>
                ) : <span style={{ color: "var(--text-3)" }}>{t("vfx.m.d.noLast")}</span>}
            </div>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("vfx.m.d.photoNote")}</p>
        </>
      )}
    </Modal>
  );
}
