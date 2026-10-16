// «Yot jismlar» (/foreign-objects) — the leaders' foreign-objects KPI, month
// by month from the Quality register (3rd of the leaders' 5 KPIs).
//
// One question per screen: «how many foreign-object complaints was each owned
// cell at fault for this month, and what score does that give». The month is
// picked once; three tabs read the SAME payload (the ranking of owned cells ·
// every cell · the complaints themselves); every cell row opens the full
// working (count → band → score → KPI → the complaints behind it).
// `services/foreign_objects.py` computes; this page never re-derives a
// figure, only filters what it shows by search.
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Award, Calculator, ChevronRight, CircleAlert, CircleCheck, CircleDot, FileSpreadsheet,
  Grid3x3, HelpCircle, Layers, Microscope, RefreshCw, UserCog,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import CellLink from "../components/ui/CellLink";
import { useToast } from "../components/ui/Toast";
import TableCard, { Th } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonTable } from "../components/ui/Skeleton";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { TXT, fill } from "./foreignObjectsText";
import ForeignExplain from "../components/foreign/ForeignExplain";
import ForeignRules from "../components/foreign/ForeignRules";
import {
  PAST_FROM, bandRows, defaultMonth, dmHm, dmy, kindsText, monthLabel, n0, pts, scoreTone, todayISO, toneInk,
  weightPct, wordOf,
} from "../components/foreign/foreignUtil";
import { ScoreChip } from "../components/foreign/ForeignBits";

const LINKS_FROM = "12.10.2026";   // the dated cell links begin here (cell_links)

const errText = async (e) => {
  const d = e?.response?.data;
  if (d instanceof Blob) {
    try { const j = JSON.parse(await d.text()); return j?.detail?.message || j?.detail || e.message; } catch { return e.message; }
  }
  return d?.detail_raw?.message || d?.detail?.message || (typeof d?.detail === "string" ? d.detail : null) || e?.message || "?";
};

const NUM_KEYS = new Set(["count", "all", "score", "points", "shift", "date"]);

function sortRows(rows, sort, get) {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a, sort.key);
    const vb = get(b, sort.key);
    const na = va == null || va === "";
    const nb = vb == null || vb === "";
    if (na || nb) return na === nb ? 0 : na ? 1 : -1;   // blanks last, either way
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "ru") * dir;
  });
}

function useSort(key, initial) {
  const [sort, setSort] = usePersistentState(key, initial);
  const onSort = (k) => setSort((s) => (s?.key === k
    ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
    : { key: k, dir: NUM_KEYS.has(k) ? "desc" : "asc" }));
  return [sort || initial, onSort];
}

function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-2)" }}>
        <Icon size={14} style={{ color: "var(--brand-text)" }} aria-hidden />
        <span className="leading-tight">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums leading-tight truncate" style={{ color: tone ? toneInk(tone) : "var(--text-1)" }}>{value}</div>
      {sub && <div className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}

function StateChip({ state, T }) {
  const map = {
    open: { Icon: CircleDot, label: T.stOpen, color: "var(--status-warn)", bg: "rgba(234,179,8,0.12)" },
    ended: { Icon: CircleCheck, label: T.stEnded, color: "var(--status-ok)", bg: "rgba(34,197,94,0.12)" },
  };
  const s = map[state];
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}>
      <s.Icon size={13} aria-hidden /> {s.label}
    </span>
  );
}

function GreyChip({ children, title }) {
  return (
    <span className="ml-1.5 px-1.5 py-px rounded text-[11px] font-medium whitespace-nowrap" title={title}
      style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
      {children}
    </span>
  );
}

function MobileRow({ onClick, title, sub, right, foot }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 ${onClick ? "hover:bg-[var(--bg-inner)] focus-visible:bg-[var(--bg-inner)] outline-none" : ""}`}
      style={{ borderTop: "1px solid var(--border)" }}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{title}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{sub}</div>}
        {foot && <div className="text-xs mt-1" style={{ color: "var(--text-2)" }}>{foot}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{right}{onClick && <ChevronRight size={14} style={{ color: "var(--text-4)" }} />}</div>
    </Tag>
  );
}

export default function ForeignObjects() {
  const { t, lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tl, tx } = useTranslit();
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = usePersistentState("foreign.tab", "ranking");
  const [month, setMonth] = usePersistentState("foreign.month", null);
  const [shift, setShift] = usePersistentState("foreign.shift", null);
  const [brig, setBrig] = usePersistentState("foreign.brig", []);
  const [q, setQ] = useState("");
  const [ex, setEx] = useState(null);           // a cell row (ranking or register)
  const [rulesOpen, setRulesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const ym = month && month >= PAST_FROM ? month : defaultMonth();
  const mLabel = monthLabel(ym, t);
  const factorySection = useFactorySection();

  const base = useMemo(() => ({
    month: ym,
    ...(shift ? { shift } : {}),
    ...(brig?.length ? { managers: brig.join(",") } : {}),
  }), [ym, shift, brig]);
  const params = useFactoryParams(base);

  const dataQ = useQuery({
    queryKey: ["foreign", params],
    queryFn: () => api.get("/api/foreign-objects", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const data = dataQ.data;

  // A brigadir pick the narrowed list no longer offers is dropped — a filter
  // naming a value the page cannot show is worse than a reset.
  const brigOpts = useMemo(() => (data?.options?.brigadirs || [])
    .filter((b) => (shift == null || b.shift === shift) && (params.factory == null || b.factory_id === params.factory)),
  [data, shift, params.factory]);
  useEffect(() => {
    if (!data?.options || !brig?.length) return;
    const ok = new Set(brigOpts.map((b) => b.id));
    const kept = brig.filter((id) => ok.has(id));
    if (kept.length !== brig.length) setBrig(kept);
  }, [brigOpts]); // eslint-disable-line react-hooks/exhaustive-deps

  const brigName = (id) => tl((data?.options?.brigadirs || []).find((b) => b.id === id)?.name || `#${id}`);
  const shifts = data?.options?.shifts || [1, 2];
  const sections = [
    ...(factorySection ? [factorySection] : []),
    {
      key: "shift", icon: Layers, label: T.fShift, active: shift != null,
      display: shift ? fill(T.shiftN, { n: shift }) : "", onClear: () => setShift(null),
      render: ({ close } = {}) => (
        <PickFilter
          opts={[{ value: "__all__", label: T.all }, ...shifts.map((s) => ({ value: s, label: fill(T.shiftN, { n: s }) }))]}
          value={shift ?? "__all__"} onChange={(v) => setShift(v === "__all__" ? null : Number(v))} close={close} />
      ),
    },
    {
      key: "brig", icon: UserCog, label: T.fBrigadir, active: brig.length > 0,
      display: brig.map(brigName).join(", "), onClear: () => setBrig([]),
      render: () => (
        <OptsFilter opts={brigOpts.map((b) => b.id)} sel={brig} onChange={setBrig} render={brigName} searchable
          note={shift != null ? `${fill(T.shiftN, { n: shift })} · ${brigOpts.length}` : null} />
      ),
    },
  ];

  // ── admin: re-pull the Quality register ───────────────────────────────────
  const refreshM = useMutation({
    mutationFn: () => api.post("/api/foreign-objects/refresh").then((r) => r.data),
    onSuccess: () => {
      toast.success(T.tRefreshDone);
      qc.invalidateQueries({ queryKey: ["foreign"] });
      qc.invalidateQueries({ queryKey: ["quality"] });
    },
    onError: async (e) => toast.error(fill(T.tRefreshFail, { e: await errText(e) })),
  });

  // ── what the search leaves ─────────────────────────────────────────────────
  const needle = q.trim().toLowerCase();
  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];
  const kindWord = (k) => wordOf(T, "kinds", k, tx);
  const srcWord = (s) => wordOf(T, "sources", s, tx);
  const stWord = (s) => wordOf(T, "statuses", s, tx);

  const [sortL, onSortL] = useSort("foreign.sortR", { key: "count", dir: "desc" });
  const [sortC, onSortC] = useSort("foreign.sortC", { key: "count", dir: "desc" });
  const [sortP, onSortP] = useSort("foreign.sortP", { key: "date", dir: "desc" });

  // The ranking: one row per OWNED cell (an owner on the month's last day,
  // standing on it), credited to its owner — the reading «Kadrlar
  // qo'nimsizligi» and «Ishchi havotirlari» list the same cells by.
  const ranking = useMemo(() => {
    const rows = (data?.ranking || []).filter((x) => has(x.code, ...nameBoth(x.owner), ...nameBoth(x.brigadir)));
    return sortRows(rows, sortL, (x, k) => ({
      code: x.code, owner: tl(x.owner || ""), brigadir: tl(x.brigadir || ""),
      count: x.count, kinds: kindsText(x.kinds, T, tx), score: x.score, points: x.points,
    })[k]);
  }, [data, needle, sortL, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => {
    const rows = (data?.cells || []).filter((c) => has(c.code, ...nameBoth(c.owner), ...nameBoth(c.leader), ...nameBoth(c.brigadir)));
    return sortRows(rows, sortC, (c, k) => ({
      code: c.code, owner: c.owner ? tl(c.owner) : "", leader: c.leader ? tl(c.leader) : "",
      brigadir: c.brigadir ? tl(c.brigadir) : "", shift: c.shift, count: c.count, all: c.all,
      kinds: kindsText(c.kinds, T, tx), score: c.score,
    })[k]);
  }, [data, needle, sortC, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const complaints = useMemo(() => {
    const rows = (data?.complaints || []).filter((c) => has(c.code, ...nameBoth(c.owner), c.product, c.place,
      kindWord(c.kind), srcWord(c.source), c.ref_no));
    return sortRows(rows, sortP, (c, k) => ({
      date: c.date, code: c.code, owner: c.owner ? tl(c.owner) : "", kind: kindWord(c.kind), source: srcWord(c.source),
      product: c.product ? tx(c.product) : "", place: c.place ? tx(c.place) : "", status: stWord(c.status),
      counted: c.counted,
    })[k]);
  }, [data, needle, sortP, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the state of the month, in one sentence ───────────────────────────────
  const state = data?.state;
  const tot = data?.totals;
  const stateLine = !data ? "" : state === "open"
    ? fill(T.lineOpen, { from: dmy(data.period?.from), asOf: dmy(data.as_of) })
    : state === "ended" ? fill(T.lineEnded, { from: dmy(data.period?.from), to: dmy(data.period?.to) }) : "";
  const syncLine = !data ? "" : data.sync?.at ? fill(T.syncAt, { at: dmHm(data.sync.at) }) : T.syncNever;
  const syncBroken = data?.sync && data.sync.ok === false;

  // ── the things that count toward nobody, said out loud ────────────────────
  const notices = [];
  if (data && tot && ["open", "ended"].includes(state)) {
    if (data.approx_owners) notices.push(fill(T.nApprox, { date: LINKS_FROM }));
    if (tot.fault_no_owner) notices.push(fill(T.nNoOwner, { n: n0(tot.fault_no_owner) }));
    const unreg = data.unregistered || [];
    if (unreg.length) {
      const codes = unreg.slice(0, 10).map((u) => u.code || "—").join(", ") + (unreg.length > 10 ? ` +${unreg.length - 10}` : "");
      notices.push(fill(T.nUnreg, { codes, n: n0(tot.fault_no_cell) }));
    }
    if (tot.not_fault) notices.push(fill(T.nNotFault, { n: n0(tot.not_fault) }));
    if (tot.unknown) notices.push(fill(T.nUnknown, { n: n0(tot.unknown) }));
  }

  // ── Excel ─────────────────────────────────────────────────────────────────
  const scopeText = [
    params.factory != null && factorySection?.display,
    shift && fill(T.shiftN, { n: shift }),
    brig.length && brig.map(brigName).join(", "),
  ].filter(Boolean).join(" · ") || T.mScopeAll;
  const topKind = tot ? Object.entries(tot.by_kind || {})[0] : null;
  const runExport = async () => {
    setExporting(true);
    try {
      const via = await exportXlsx("/api/foreign-objects/export.xlsx", {
        body: {
          month: ym, factory: params.factory ?? null, shift: shift ?? null, managers: brig || [], lang,
          title: `${T.title} — ${mLabel}`, subtitle: stateLine,
          filename: `${T.title} ${ym}`, caption: `📊 ${T.title} — ${mLabel}`,
          labels: { ...T.xl, formulaLines: [T.formula, T.formulaNote, ...T.rules.map(([h, x]) => `${h}: ${x}`)] },
          hints: {
            fault: tot ? fill(T.kFaultSub, { n: n0(tot.fault_owner) }) : "",
            all: tot ? fill(T.kAllSub, { nf: n0(tot.not_fault), nu: n0(tot.unknown) }) : "",
            kind: topKind ? fill(T.kKindSub, { k: n0(topKind[1]), n: n0(tot.fault) }) : "",
          },
          meta: [
            { label: T.mMonth, value: mLabel },
            { label: T.mState, value: ({ open: T.stOpen, ended: T.stEnded })[state] || "—" },
            { label: T.mSync, value: data?.sync?.at ? dmHm(data.sync.at) : "—" },
            { label: T.mScope, value: scopeText },
          ],
          order: ranking.map((x) => x.key),
        },
        fallbackName: `foreign-objects-${ym}.xlsx`,
      });
      toast.success(via === "download" ? T.tExportDl : T.tExportTg);
    } catch (e) {
      toast.error(fill(T.tExportFail, { e: await errText(e) }));
    } finally {
      setExporting(false);
    }
  };

  // ── rendering ─────────────────────────────────────────────────────────────
  const counted = (c) => ({
    owner: T.countedOwner, no_owner: T.countedNoOwner, no_cell: T.countedNoCell,
    not_fault: T.countedNotFault, unknown: T.countedUnknown,
  })[c.counted] || c.counted;
  const showMonth = data && ["open", "ended"].includes(state);
  const rule = data?.rule;
  const w = weightPct(rule);

  const toolbar = (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <DateRangePicker month dateFrom={`${ym}-01`} dateTo={`${ym}-28`}
        setDateFrom={(iso) => setMonth(String(iso).slice(0, 7))} setDateTo={() => {}}
        min={`${PAST_FROM}-01`} max={todayISO()} triggerClassName="px-3 py-2 text-sm" />
      <FilterPanel sections={sections} />
      <SearchInput value={q} onChange={setQ} placeholder={T.search} className="flex-1 min-w-[160px] max-w-xs" />
      <Button size="lg" variant="secondary" className="ml-auto" icon={<FileSpreadsheet size={15} />}
        loading={exporting} disabled={!showMonth} onClick={runExport}>
        <span className="max-sm:hidden">{T.excel}</span>
      </Button>
    </div>
  );

  const stateBar = showMonth && (
    <div className="rounded-2xl px-4 py-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-2.5 min-w-0 flex-1 basis-[22rem]">
        <StateChip state={state} T={T} />
        <p className="text-sm leading-snug" style={{ color: "var(--text-2)" }}>{stateLine}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs tabular-nums" style={{ color: syncBroken ? "var(--status-warn)" : "var(--text-3)" }}>{syncLine}</span>
        {isAdmin && (
          <Button size="md" variant="secondary" icon={<RefreshCw size={13} className={refreshM.isPending ? "animate-spin" : ""} />}
            loading={refreshM.isPending} onClick={() => refreshM.mutate()}>
            {T.refresh}
          </Button>
        )}
      </div>
      {syncBroken && (
        <p className="w-full text-xs" style={{ color: "var(--status-warn)" }}>{fill(T.syncFailed, { e: data.sync.message || "?" })}</p>
      )}
    </div>
  );

  const kpis = showMonth && tot && (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
      <Kpi icon={CircleAlert} label={T.kFault} value={n0(tot.fault)} sub={fill(T.kFaultSub, { n: n0(tot.fault_owner) })} />
      <Kpi icon={Microscope} label={T.kAll} value={n0(tot.complaints)}
        sub={fill(T.kAllSub, { nf: n0(tot.not_fault), nu: n0(tot.unknown) })} />
      <Kpi icon={Calculator} label={T.kKind} value={topKind ? kindWord(topKind[0]) : T.kKindNone}
        sub={topKind ? fill(T.kKindSub, { k: n0(topKind[1]), n: n0(tot.fault) }) : null} />
      <Kpi icon={Award} label={T.kScored} value={n0(tot.owned_cells)}
        sub={
          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
            {[5, 4, 3, 2, 1].map((s) => (
              <span key={s} className="tabular-nums whitespace-nowrap">
                <span className="font-semibold" style={{ color: toneInk(scoreTone(s)) }}>{fill(T.scoreN, { n: s })}</span>: {n0(tot.by_score?.[String(s)] || 0)}
              </span>
            ))}
            <span className="w-full">{fill(T.kScoredSub, { n: n0(tot.clean_cells) })}</span>
          </span>
        } />
    </div>
  );

  const formulaStrip = showMonth && (
    <div className="rounded-2xl px-4 py-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <Calculator size={16} style={{ color: "var(--brand-text)" }} aria-hidden />
      <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.formula}</span>
      <span className="text-xs flex-1 min-w-[14rem]" style={{ color: "var(--text-3)" }}>{T.formulaNote}</span>
      <Button size="md" variant="ghost" icon={<HelpCircle size={14} />} onClick={() => setRulesOpen(true)}>{T.rulesBtn}</Button>
    </div>
  );

  const noticeCard = notices.length > 0 && (
    <div className="rounded-2xl px-4 py-3 mb-4" role="note"
      style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.35)" }}>
      <div className="flex items-center gap-2 text-sm font-semibold mb-1.5" style={{ color: "var(--text-1)" }}>
        <AlertTriangle size={15} style={{ color: "var(--status-warn)" }} aria-hidden /> {T.nTitle}
      </div>
      <ul className="space-y-1 list-disc pl-5 text-sm" style={{ color: "var(--text-2)" }}>
        {notices.map((n, i) => <li key={i} className="leading-snug">{n}</li>)}
      </ul>
    </div>
  );

  const bandsFooter = rule && (
    <div className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-3)" }}>
      <span className="font-semibold" style={{ color: "var(--text-2)" }}>{T.bandsTitle}:</span>
      {bandRows(rule).map((b) => (
        <span key={b.label} className="tabular-nums whitespace-nowrap">
          {b.label} → <span className="font-semibold" style={{ color: toneInk(scoreTone(b.score)) }}>{b.score}</span>
        </span>
      ))}
      <span className="whitespace-nowrap">· {fill(T.kpiLine, { w })}</span>
      {state === "open" && <span className="w-full" style={{ color: "var(--status-warn)" }}>{T.provisional}</span>}
    </div>
  );

  const openCell = (c) => setEx(c);
  const emptyRow = (cols, text) => (
    <tr><td colSpan={cols} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{text}</td></tr>
  );
  const kindsCell = (x) => {
    const s = kindsText(x.kinds, T, tx);
    return s ? <span className="block max-w-[16rem] truncate" title={s}>{s}</span> : <span style={{ color: "var(--text-4)" }}>—</span>;
  };
  const countText = (tot) => fill(T.nLeaders, { o: n0(tot?.owners ?? 0), c: n0(tot?.owned_cells ?? 0) });

  const rankingTable = (
    <TableCard icon={Award} title={T.tRanking}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{countText(tot)}</span>}
      footer={bandsFooter}
      mobile={ranking.length ? ranking.map((x, i) => (
        <MobileRow key={x.key} onClick={() => openCell(x)}
          title={<span className="tabular-nums">{i + 1}. {x.code} · {tl(x.owner)}</span>}
          sub={x.brigadir ? tl(x.brigadir) : ""}
          foot={x.count ? kindsText(x.kinds, T, tx) : null}
          right={<><span className="text-sm font-semibold tabular-nums" style={{ color: toneInk(scoreTone(x.score)) }}>{n0(x.count)}</span><ScoreChip score={x.score} size="sm" /></>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
      <thead>
        <tr>
          <Th label={T.colN} align="center" cls="w-10" />
          <Th label={T.colCell} k="code" sort={sortL} onSort={onSortL} />
          <Th label={T.colOwner} k="owner" sort={sortL} onSort={onSortL} hint={T.hOwner} />
          <Th label={T.colBrigadir} k="brigadir" sort={sortL} onSort={onSortL} />
          <Th label={T.colCount} k="count" sort={sortL} onSort={onSortL} align="right" hint={T.hCount} />
          <Th label={T.colKinds} k="kinds" sort={sortL} onSort={onSortL} hint={T.hKinds} />
          <Th label={T.colScore} k="score" sort={sortL} onSort={onSortL} align="center" hint={T.hScore} />
          <Th label={T.colPoints} k="points" sort={sortL} onSort={onSortL} align="right" hint={T.hPoints} />
        </tr>
      </thead>
      <tbody>
        {ranking.length === 0 ? emptyRow(8, T.nothing) : ranking.map((x, i) => (
          <tr key={x.key} className="cursor-pointer" onClick={() => openCell(x)}>
            <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{i + 1}</td>
            <td className="px-3 py-2 tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
            <td className="px-3 py-2 whitespace-nowrap">
              <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); openCell(x); }}>
                {tl(x.owner)}
              </button>
              {x.owner_kind === "acting" && <GreyChip>{T.acting}</GreyChip>}
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{x.brigadir ? tl(x.brigadir) : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: toneInk(scoreTone(x.score)) }}>{n0(x.count)}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{kindsCell(x)}</td>
            <td className="px-3 py-1.5 text-center"><ScoreChip score={x.score} size="sm" /></td>
            <td className="px-3 py-2 text-right tabular-nums">{pts(x.points)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  const cellsTable = (
    <TableCard icon={Grid3x3} title={T.tCells} right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.nCells, { n: n0(cells.length) })}</span>}
      footer={bandsFooter}
      mobile={cells.length ? cells.map((c) => (
        <MobileRow key={c.key} onClick={() => openCell(c)}
          title={<span className="tabular-nums">{c.code}{c.archived && <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-3)" }}>{T.archived}</span>}</span>}
          sub={`${c.owner ? tl(c.owner) : T.noOwner} · ${c.brigadir ? tl(c.brigadir) : "—"}`}
          foot={c.all ? `${fill(T.nRows, { n: n0(c.all) })}${c.count ? ` · ${kindsText(c.kinds, T, tx)}` : ""}` : null}
          right={<><span className="text-sm font-semibold tabular-nums" style={{ color: toneInk(scoreTone(c.score)) }}>{n0(c.count)}</span><ScoreChip score={c.score} size="sm" /></>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
      <thead>
        <tr>
          <Th label={T.colCell} k="code" sort={sortC} onSort={onSortC} />
          <Th label={T.colOwner} k="owner" sort={sortC} onSort={onSortC} hint={T.hOwner} />
          <Th label={T.colManager} k="leader" sort={sortC} onSort={onSortC} hint={T.hManager} />
          <Th label={T.colBrigadir} k="brigadir" sort={sortC} onSort={onSortC} />
          <Th label={T.colShift} k="shift" sort={sortC} onSort={onSortC} align="center" />
          <Th label={T.colCount} k="count" sort={sortC} onSort={onSortC} align="right" hint={T.hCount} />
          <Th label={T.colAll} k="all" sort={sortC} onSort={onSortC} align="right" hint={T.hAll} />
          <Th label={T.colScore} k="score" sort={sortC} onSort={onSortC} align="center" hint={T.hScore} />
          <Th label={T.colKinds} k="kinds" sort={sortC} onSort={onSortC} hint={T.hKinds} />
        </tr>
      </thead>
      <tbody>
        {cells.length === 0 ? emptyRow(9, T.nothing) : cells.map((c) => (
          <tr key={c.key} className="cursor-pointer" onClick={() => openCell(c)}>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap">
              <CellLink id={c.id}>{c.code}</CellLink>
              {c.archived && <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>{T.archived}</span>}
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: c.owner ? "var(--text-1)" : "var(--status-warn)" }}>
              {c.owner ? <>{tl(c.owner)}{c.owner_kind === "acting" && <GreyChip>{T.acting}</GreyChip>}</> : T.noOwner}
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{c.leader ? tl(c.leader) : "—"}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{c.brigadir ? tl(c.brigadir) : "—"}</td>
            <td className="px-3 py-2 text-center tabular-nums">{c.shift ?? "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: toneInk(scoreTone(c.score)) }}>{n0(c.count)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(c.all)}</td>
            <td className="px-3 py-1.5 text-center"><ScoreChip score={c.score} size="sm" /></td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{kindsCell(c)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  const faultText = (c) => (c.fault === true ? T.faultYes : c.fault === false ? T.faultNo : T.faultBlank);
  const complaintsTable = (
    <TableCard icon={Microscope} title={T.tComplaints}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.nRows, { n: n0(complaints.length) })}</span>}
      mobile={complaints.length ? complaints.map((c) => (
        <div key={c.id} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
              {kindWord(c.kind)}{c.product && <span className="font-normal" style={{ color: "var(--text-2)" }}> · {tx(c.product)}</span>}
            </span>
            <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dmy(c.date)}</span>
          </div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
            <span className="tabular-nums">{c.code || "—"}</span>
            <span>{c.owner ? tl(c.owner) : counted(c)}</span>
            <span>{srcWord(c.source)}</span>
            {c.place && <span>{tx(c.place)}</span>}
            <span style={{ color: c.counted === "owner" ? "var(--text-3)" : "var(--status-warn)" }}>{counted(c)}</span>
          </div>
          {c.description && <div className="text-xs mt-1 leading-snug" style={{ color: "var(--text-2)" }}>{tx(c.description)}</div>}
        </div>
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{(data?.complaints || []).length ? T.nothing : T.noneComplaints}</p>}>
      <thead>
        <tr>
          <Th label={T.colDate} k="date" sort={sortP} onSort={onSortP} align="center" />
          <Th label={T.colCell} k="code" sort={sortP} onSort={onSortP} />
          <Th label={T.colOwner} k="owner" sort={sortP} onSort={onSortP} hint={T.hOwner} />
          <Th label={T.colKind} k="kind" sort={sortP} onSort={onSortP} />
          <Th label={T.colSource} k="source" sort={sortP} onSort={onSortP} />
          <Th label={T.colProduct} k="product" sort={sortP} onSort={onSortP} />
          <Th label={T.colPlace} k="place" sort={sortP} onSort={onSortP} />
          <Th label={T.colFault} align="center" hint={T.hFault} />
          <Th label={T.colCounted} k="counted" sort={sortP} onSort={onSortP} />
          <Th label={T.colStatus} k="status" sort={sortP} onSort={onSortP} />
          <Th label={T.colDescription} />
        </tr>
      </thead>
      <tbody>
        {complaints.length === 0 ? emptyRow(11, (data?.complaints || []).length ? T.nothing : T.noneComplaints) : complaints.map((c) => (
          <tr key={c.id}>
            <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">{dmy(c.date)}</td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap">{c.cell_id ? <CellLink id={c.cell_id}>{c.code}</CellLink> : (c.code || "—")}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: c.owner ? "var(--text-2)" : "var(--text-3)" }}>{c.owner ? tl(c.owner) : "—"}</td>
            <td className="px-3 py-2 whitespace-nowrap font-medium" style={{ color: "var(--text-1)" }}>{kindWord(c.kind)}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{srcWord(c.source)}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[12rem] truncate" title={c.product ? tx(c.product) : ""}>{c.product ? tx(c.product) : "—"}</span>
            </td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[9rem] truncate" title={c.place ? tx(c.place) : ""}>{c.place ? tx(c.place) : "—"}</span>
            </td>
            <td className="px-3 py-2 text-center whitespace-nowrap" style={{ color: c.fault === true ? "var(--text-1)" : "var(--text-3)" }}>{faultText(c)}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: c.counted === "owner" ? "var(--text-2)" : "var(--status-warn)" }}>{counted(c)}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{c.status ? stWord(c.status) : "—"}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[20rem] truncate" title={c.description ? tx(c.description) : ""}>{c.description ? tx(c.description) : "—"}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  let body;
  if (dataQ.isLoading && !data) {
    body = (
      <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">{[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-[104px] rounded-2xl" />)}</div>
        <SkeletonTable rows={8} cols={7} />
      </>
    );
  } else if (dataQ.isError && !data) {
    body = (
      <EmptyState tone="danger" icon={AlertTriangle} title={T.loadFailed} message={T.loadFailedMsg} showUploadLink={false}
        action={<Button variant="secondary" onClick={() => dataQ.refetch()}>{T.retry}</Button>} />
    );
  } else if (state === "before" || state === "future") {
    body = (
      <EmptyState icon={Microscope} title={state === "before" ? T.beforeTitle : mLabel}
        message={state === "before" ? T.before : T.future} showUploadLink={false} />
    );
  } else if (data && !data.sync?.at) {
    body = (
      <>
        {stateBar}
        <EmptyState icon={RefreshCw} title={T.noSyncTitle} message={T.noSyncMsg} showUploadLink={false}
          action={isAdmin ? (
            <Button icon={<RefreshCw size={14} />} loading={refreshM.isPending} onClick={() => refreshM.mutate()}>{T.refresh}</Button>
          ) : null} />
      </>
    );
  } else if (data) {
    body = (
      <>
        {stateBar}
        {kpis}
        {formulaStrip}
        {noticeCard}
        {tab === "cells" ? cellsTable : tab === "complaints" ? complaintsTable : rankingTable}
      </>
    );
  }

  const exTitle = ex ? `${ex.code} · ${ex.owner ? tl(ex.owner) : T.noOwner}` : "";
  const exSub = ex ? [ex.brigadir ? tl(ex.brigadir) : "", mLabel].filter(Boolean).join(" · ") : "";

  return (
    <Layout title={T.title}>
      <div className="mb-3">
        <SegmentedToggle asTabs value={tab} onChange={setTab} ariaLabel={T.title}
          options={[["ranking", T.tabRanking], ["cells", T.tabCells], ["complaints", T.tabComplaints]]} />
      </div>
      {toolbar}
      {body}

      {ex && data && (
        <ForeignExplain open onClose={() => setEx(null)} item={ex} data={data} T={T} tx={tx} title={exTitle} subtitle={exSub} />
      )}
      {rulesOpen && rule && <ForeignRules open onClose={() => setRulesOpen(false)} rule={rule} T={T} />}
    </Layout>
  );
}
