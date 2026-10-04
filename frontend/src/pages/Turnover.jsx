// «Kadrlar qo'nimsizligi» (/turnover) — the leaders' turnover KPI, month by
// month from Verifix, from October 2026 (2nd of the leaders' 5 KPIs).
//
// One question per screen: «what is each leader's turnover score this
// month, and why». The month is picked once; three tabs read the SAME payload
// (leaders · cells · the people who left); every row opens the full working
// (cells → division → band → KPI → names). `services/turnover.py` computes;
// this page never re-derives a figure, only filters what it shows by search.
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, Archive, Calculator, ChevronRight, CircleCheck, CircleDot, FileSpreadsheet, Grid3x3, HelpCircle,
  Layers, Lock, LockOpen, RefreshCw, UserCog, UserMinus, Users, Award, Clock3,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import ConfirmDialog from "../components/ui/ConfirmDialog";
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
import { TXT, fill } from "./turnoverText";
import TurnoverExplain from "../components/turnover/TurnoverExplain";
import TurnoverRules from "../components/turnover/TurnoverRules";
import {
  PAST_FROM, bandRows, defaultMonth, dmHm, dmy, monthLabel, n0, pct1, pts, scoreTone,
  tenure, todayISO, toneInk, weightPct,
} from "../components/turnover/turnoverUtil";
import { ScoreChip } from "../components/turnover/TurnoverBits";

const errText = async (e) => {
  const d = e?.response?.data;
  if (d instanceof Blob) {
    try { const j = JSON.parse(await d.text()); return j?.detail?.message || j?.detail || e.message; } catch { return e.message; }
  }
  return d?.detail_raw?.message || d?.detail?.message || (typeof d?.detail === "string" ? d.detail : null) || e?.message || "?";
};

const NUM_KEYS = new Set(["working", "left", "rate", "score", "points", "days", "hired", "leftOn", "shift"]);

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
      <div className="text-2xl font-bold tabular-nums leading-tight" style={{ color: tone ? toneInk(tone) : "var(--text-1)" }}>{value}</div>
      {sub && <div className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}

function StateChip({ state, T }) {
  const map = {
    open: { Icon: CircleDot, label: T.stOpen, color: "var(--status-warn)", bg: "rgba(234,179,8,0.12)" },
    closing: { Icon: Clock3, label: T.stClosing, color: "var(--brand-text)", bg: "rgba(var(--brand-rgb),0.12)" },
    closed: { Icon: CircleCheck, label: T.stClosed, color: "var(--status-ok)", bg: "rgba(34,197,94,0.12)" },
    saved: { Icon: Archive, label: T.stSaved, color: "var(--brand-text)", bg: "rgba(var(--brand-rgb),0.12)" },
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

function KindTag({ kind, T }) {
  if (kind !== "acting") return null;
  return (
    <span className="ml-1.5 px-1.5 py-px rounded text-[11px] font-medium whitespace-nowrap"
      style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
      {T.acting}
    </span>
  );
}

function MobileRow({ onClick, title, sub, right, foot }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[var(--bg-inner)] focus-visible:bg-[var(--bg-inner)] outline-none"
      style={{ borderTop: "1px solid var(--border)" }}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{title}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{sub}</div>}
        {foot && <div className="text-xs mt-1 tabular-nums" style={{ color: "var(--text-2)" }}>{foot}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{right}<ChevronRight size={14} style={{ color: "var(--text-4)" }} /></div>
    </button>
  );
}

export default function Turnover() {
  const { t, lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tl, tx } = useTranslit();
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const toast = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = usePersistentState("turnover.tab", "leaders");
  const [month, setMonth] = usePersistentState("turnover.month", null);
  const [shift, setShift] = usePersistentState("turnover.shift", null);
  const [brig, setBrig] = usePersistentState("turnover.brig", []);
  const [q, setQ] = useState("");
  const [ex, setEx] = useState(null);           // {kind, item}
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // "close" | "reopen"
  const [confirmErr, setConfirmErr] = useState(null);
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
    queryKey: ["turnover", params],
    queryFn: () => api.get("/api/turnover", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.read?.running ? 4000 : false),
  });
  const data = dataQ.data;
  const running = !!data?.read?.running;

  // A read finishing is news: say how it ended, once.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!data?.read) return;
    if (wasRunning.current && !running) {
      const trig = data.read.last?.trigger || "";
      if (!data.read.last?.ok) toast.error(fill(T.tReadFailed, { e: data.read.last?.error || "?" }));
      else if (trig.startsWith("compute:")) toast.success(fill(T.tComputed, { month: monthLabel(trig.slice(8, 15), t) }));
      else toast.success(T.tReadDone);
    }
    wasRunning.current = running;
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── admin actions ─────────────────────────────────────────────────────────
  const readM = useMutation({
    mutationFn: () => api.post("/api/turnover/read").then((r) => r.data),
    onSuccess: (r) => {
      if (r.started) toast.info(T.tReadStarted);
      else toast.warning(T.tReadBusy);
      qc.invalidateQueries({ queryKey: ["turnover"] });
    },
    onError: async (e) => toast.error(fill(T.tReadFailed, { e: await errText(e) })),
  });
  const computeM = useMutation({
    mutationFn: () => api.post("/api/turnover/compute", { month: ym }).then((r) => r.data),
    onSuccess: (r) => {
      if (r.started) toast.info(fill(T.tComputeStarted, { month: mLabel }));
      else toast.warning(T.tReadBusy);
      qc.invalidateQueries({ queryKey: ["turnover"] });
    },
    onError: async (e) => toast.error(fill(T.tFailed, { e: await errText(e) })),
  });
  const computing = running && (data?.read?.last?.trigger || "").startsWith(`compute:${ym}`);
  // A calculation of THIS month that failed says so where its button is.
  const computeFailed = !running && data?.read?.last?.ok === false
    && (data.read.last.trigger || "").startsWith(`compute:${ym}`);
  const stateM = useMutation({
    mutationFn: (kind) => api.post(`/api/turnover/${kind}`, { month: ym }).then((r) => r.data),
    onSuccess: (_r, kind) => {
      toast.success(fill(kind === "close" ? T.tClosed : T.tReopened, { month: mLabel }));
      setConfirm(null);
      setConfirmErr(null);
      qc.invalidateQueries({ queryKey: ["turnover"] });
    },
    onError: async (e) => setConfirmErr(await errText(e)),
  });

  // ── what the search leaves ─────────────────────────────────────────────────
  const needle = q.trim().toLowerCase();
  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];

  const [sortL, onSortL] = useSort("turnover.sortL", { key: "rate", dir: "desc" });
  const [sortC, onSortC] = useSort("turnover.sortC", { key: "rate", dir: "desc" });
  const [sortP, onSortP] = useSort("turnover.sortP", { key: "leftOn", dir: "desc" });

  const leaders = useMemo(() => {
    const rows = (data?.leaders || []).filter((x) => has(...nameBoth(x.name), ...x.brigadirs.flatMap((b) => nameBoth(b.name)),
      ...x.cells.map((c) => c.code)));
    return sortRows(rows, sortL, (x, k) => ({
      name: tl(x.name || ""), brigadir: tl(x.brigadirs[0]?.name || ""), cells: x.cells[0]?.code,
      working: x.working, left: x.left, rate: x.rate, score: x.score, points: x.points,
    })[k]);
  }, [data, needle, sortL, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => {
    const rows = (data?.cells || []).filter((c) => has(c.code, ...nameBoth(c.leader), ...nameBoth(c.brigadir)));
    return sortRows(rows, sortC, (c, k) => ({
      code: c.code, leader: c.leader ? tl(c.leader) : "", brigadir: c.brigadir ? tl(c.brigadir) : "",
      shift: c.shift, working: c.working, left: c.left, rate: c.rate,
    })[k]);
  }, [data, needle, sortC, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const leavers = useMemo(() => {
    const rows = (data?.leavers || []).filter((p) => has(...nameBoth(p.name), p.code, ...nameBoth(p.leader), p.job, p.reason));
    return sortRows(rows, sortP, (p, k) => ({
      name: tl(p.name), code: p.code, leader: p.leader ? tl(p.leader) : "", job: p.job || "",
      hired: p.hired, leftOn: p.left, days: p.days, reason: p.reason || "", counted: p.counted,
    })[k]);
  }, [data, needle, sortP, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the state of the month, in one sentence ───────────────────────────────
  const state = data?.state;
  const tot = data?.totals;
  const closeAt = data ? `${dmy(data.close_at?.slice(0, 10))} ${data.close_at?.slice(11, 16)}` : "";
  const stateLine = !data ? "" : state === "open"
    ? fill(T.lineOpen, { from: dmy(data.period?.from), asOf: dmy(data.as_of), closeAt })
    : state === "closing"
      ? (data.reopened ? fill(T.lineReopened, { by: tl(data.reopened.by), at: dmHm(data.reopened.at) })
        : data.roster_source === "approx" ? fill(T.lineClosingApprox, { closeAt })
          : fill(T.lineClosing, { rosterAt: dmHm(data.roster_at), closeAt }))
      : state === "closed"
        ? fill(T.lineClosed, { at: dmHm(data.closed?.at), by: data.closed?.by === "system" ? T.bySystem : tl(data.closed?.by || "") })
        : state === "saved"
          ? fill(T.lineSaved, { at: dmHm(data.saved?.at), by: tl(data.saved?.by || "") })
          : "";
  const readLine = !data ? "" : running ? T.readRunning
    : data.read?.ok ? fill(T.readAt, { at: dmHm(data.read.ok.at) }) : T.readNever;
  const readBroken = data?.read?.last && data.read.last.ok === false && !running;

  // ── the things that count toward nobody, said out loud ────────────────────
  const notices = [];
  if (data && tot && ["open", "closing", "closed", "saved"].includes(state)) {
    if (state === "saved") notices.push(T.nPastApprox);
    if (data.approx_left) notices.push(fill(T.nRehired, { n: n0(data.approx_left) }));
    const unreg = data.unregistered || [];
    if (unreg.length) {
      const codes = unreg.slice(0, 10).map((u) => u.code).join(", ") + (unreg.length > 10 ? ` +${unreg.length - 10}` : "");
      notices.push(fill(T.nUnreg, { codes, w: n0(tot.unregistered_working), l: n0(tot.unregistered_left) }));
    }
    if (tot.left_no_leader) notices.push(fill(T.nNoLeader, { n: n0(tot.left_no_leader) }));
    if (tot.no_people) notices.push(fill(T.nNoPeople, { n: n0(tot.no_people) }));
    if (tot.other_left) notices.push(fill(T.nOther, { n: n0(tot.other_left) }));
    if (data.read?.ok?.reasons === "closed") notices.push(T.nReasons);
    if (data.roster_late_days > 1) notices.push(fill(T.nRosterLate, { n: data.roster_late_days }));
    if (data.dropped) notices.push(fill(T.nDropped, { n: n0(data.dropped) }));
    if (data.late?.length) {
      notices.push(fill(T.nLate, {
        added: n0(data.late.filter((x) => x.kind === "added").length),
        gone: n0(data.late.filter((x) => x.kind === "gone").length),
      }));
    }
  }

  // ── Excel ─────────────────────────────────────────────────────────────────
  const scopeText = [
    params.factory != null && factorySection?.display,
    shift && fill(T.shiftN, { n: shift }),
    brig.length && brig.map(brigName).join(", "),
  ].filter(Boolean).join(" · ") || T.mScopeAll;
  const runExport = async () => {
    setExporting(true);
    try {
      const via = await exportXlsx("/api/turnover/export.xlsx", {
        body: {
          month: ym, factory: params.factory ?? null, shift: shift ?? null, managers: brig || [], lang,
          title: `${T.title} — ${mLabel}`, subtitle: stateLine,
          filename: `${T.title} ${ym}`, caption: `📊 ${T.title} — ${mLabel}`,
          labels: { ...T.xl, formulaLines: [T.formula, ...T.rules.map(([h, x]) => `${h}: ${x}`), T.smallTeam] },
          hints: {
            left: tot ? fill(T.kLeftSub, { n: n0(tot.left_leader) }) : "",
            working: tot ? fill(T.kWorkingSub, { n: n0(tot.cells) }) : "",
            rate: tot ? fill(T.kRateSub, { left: n0(tot.left), working: n0(tot.working) }) : "",
          },
          meta: [
            { label: T.mMonth, value: mLabel },
            { label: T.mState, value: ({ open: T.stOpen, closing: T.stClosing, closed: T.stClosed, saved: T.stSaved })[state] || "—" },
            { label: T.mList, value: data?.roster_at ? dmHm(data.roster_at) : "—" },
            { label: T.mRead, value: data?.read?.ok ? dmHm(data.read.ok.at) : "—" },
            { label: T.mScope, value: scopeText },
          ],
          leader_order: leaders.map((x) => x.id),
        },
        fallbackName: `turnover-${ym}.xlsx`,
      });
      toast.success(via === "download" ? T.tExportDl : T.tExportTg);
    } catch (e) {
      toast.error(fill(T.tExportFail, { e: await errText(e) }));
    } finally {
      setExporting(false);
    }
  };

  // ── rendering ─────────────────────────────────────────────────────────────
  const counted = (p) => ({ leader: T.countedLeader, no_leader: T.countedNoLeader, no_cell: T.countedNoCell })[p.counted] || p.counted;
  const showMonth = data && ["open", "closing", "closed", "saved"].includes(state);
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
        {state !== "saved" && (
          <span className="text-xs tabular-nums inline-flex items-center gap-1.5"
            style={{ color: readBroken || data.read?.stale ? "var(--status-warn)" : "var(--text-3)" }}>
            {running && <RefreshCw size={12} className="animate-spin" aria-hidden />}
            {readLine}
          </span>
        )}
        {isAdmin && state === "saved" && (
          <Button size="md" variant="secondary" icon={<RefreshCw size={13} className={computing ? "animate-spin" : ""} />}
            loading={computeM.isPending} disabled={running || !data.configured} onClick={() => computeM.mutate()}>
            {computing ? T.computing : T.update}
          </Button>
        )}
        {isAdmin && state !== "saved" && (
          <Button size="md" variant="secondary" icon={<RefreshCw size={13} />} loading={readM.isPending}
            disabled={running || !data.configured} onClick={() => readM.mutate()}>
            {T.refresh}
          </Button>
        )}
        {isAdmin && state === "closing" && (
          <Button size="md" variant="secondary" icon={<Lock size={13} />} onClick={() => { setConfirmErr(null); setConfirm("close"); }}>
            {T.close}
          </Button>
        )}
        {isAdmin && state === "closed" && (
          <Button size="md" variant="secondary" icon={<LockOpen size={13} />} onClick={() => { setConfirmErr(null); setConfirm("reopen"); }}>
            {T.reopen}
          </Button>
        )}
      </div>
      {state === "saved" && computeFailed && (
        <p className="w-full text-xs" style={{ color: "var(--status-bad)" }}>{fill(T.readFailed, { e: data.read.last.error || "?" })}</p>
      )}
      {state !== "saved" && (readBroken || data.read?.stale) && data.read?.ok && (
        <p className="w-full text-xs" style={{ color: "var(--status-warn)" }}>
          {readBroken ? fill(T.readFailed, { e: data.read.last.error || "?" }) : T.readStale}
        </p>
      )}
    </div>
  );

  const kpis = showMonth && tot && (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
      <Kpi icon={UserMinus} label={T.kLeft} value={n0(tot.left)} sub={fill(T.kLeftSub, { n: n0(tot.left_leader) })} />
      <Kpi icon={Users} label={state === "open" ? T.kWorkingOpen : T.kWorking} value={n0(tot.working)}
        sub={fill(T.kWorkingSub, { n: n0(tot.cells) })} />
      <Kpi icon={Calculator} label={T.kRate} value={pct1(tot.rate)}
        sub={fill(T.kRateSub, { left: n0(tot.left), working: n0(tot.working) })} />
      <Kpi icon={Award} label={T.kLeaders} value={`${n0(tot.scored)} / ${n0(tot.leaders)}`}
        sub={
          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
            {[5, 4, 3, 2, 1].map((s) => (
              <span key={s} className="tabular-nums whitespace-nowrap">
                <span className="font-semibold" style={{ color: toneInk(scoreTone(s)) }}>{fill(T.scoreN, { n: s })}</span>: {n0(tot.by_score?.[String(s)] || 0)}
              </span>
            ))}
            {tot.no_people > 0 && <span className="w-full">{fill(T.kLeadersSub, { n: n0(tot.no_people) })}</span>}
          </span>
        } />
    </div>
  );

  const formulaStrip = showMonth && (
    <div className="rounded-2xl px-4 py-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <Calculator size={16} style={{ color: "var(--brand-text)" }} aria-hidden />
      <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.formula}</span>
      <span className="text-xs flex-1 min-w-[14rem]" style={{ color: "var(--text-3)" }}>{T.smallTeam}</span>
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

  const openLeader = (x) => setEx({ kind: "leader", item: x });
  const openCell = (c) => setEx({ kind: "cell", item: c });
  const emptyRow = (cols, text) => (
    <tr><td colSpan={cols} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{text}</td></tr>
  );

  const leadersTable = (
    <TableCard icon={Award} title={T.tLeaders} right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.nLeaders, { n: n0(leaders.length) })}</span>}
      footer={bandsFooter}
      mobile={leaders.length ? leaders.map((x) => (
        <MobileRow key={x.id} onClick={() => openLeader(x)}
          title={<>{tl(x.name)}<KindTag kind={x.kind} T={T} /></>}
          sub={x.brigadirs.map((b) => tl(b.name)).join(", ")}
          foot={`${x.cells.map((c) => c.code).join(", ")} · ${fill(T.exWorkingLeft, { w: n0(x.working), l: n0(x.left) })}`}
          right={<><span className="text-sm font-semibold tabular-nums" style={{ color: toneInk(scoreTone(x.score)) }}>{pct1(x.rate)}</span><ScoreChip score={x.score} size="sm" /></>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
      <thead>
        <tr>
          <Th label={T.colN} align="center" cls="w-10" />
          <Th label={T.colLeader} k="name" sort={sortL} onSort={onSortL} />
          <Th label={T.colBrigadir} k="brigadir" sort={sortL} onSort={onSortL} />
          <Th label={T.colCells} k="cells" sort={sortL} onSort={onSortL} />
          <Th label={T.colWorking} k="working" sort={sortL} onSort={onSortL} align="right" hint={T.hWorking} />
          <Th label={T.colLeft} k="left" sort={sortL} onSort={onSortL} align="right" hint={T.hLeft} />
          <Th label={T.colRate} k="rate" sort={sortL} onSort={onSortL} align="right" hint={T.hRate} />
          <Th label={T.colScore} k="score" sort={sortL} onSort={onSortL} align="center" hint={T.hScore} />
          <Th label={T.colPoints} k="points" sort={sortL} onSort={onSortL} align="right" hint={T.hPoints} />
        </tr>
      </thead>
      <tbody>
        {leaders.length === 0 ? emptyRow(9, T.nothing) : leaders.map((x, i) => (
          <tr key={x.id} className="cursor-pointer" onClick={() => openLeader(x)}>
            <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{i + 1}</td>
            <td className="px-3 py-2">
              <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); openLeader(x); }}>
                {tl(x.name)}
              </button>
              <KindTag kind={x.kind} T={T} />
            </td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{x.brigadirs.map((b) => tl(b.name)).join(", ") || "—"}</td>
            <td className="px-3 py-2 tabular-nums">
              {x.cells.map((c, j) => (
                <span key={c.key}>{j > 0 && ", "}<CellLink id={c.id}>{c.code}</CellLink></span>
              ))}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(x.working)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(x.left)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: toneInk(scoreTone(x.score)) }}
              title={x.rate == null ? T.noRateHint : undefined}>{pct1(x.rate)}</td>
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
          sub={`${c.leader ? tl(c.leader) : T.noLeader} · ${c.brigadir ? tl(c.brigadir) : "—"}`}
          foot={fill(T.exWorkingLeft, { w: n0(c.working), l: n0(c.left) })}
          right={<span className="text-sm font-semibold tabular-nums" style={{ color: toneInk(scoreTone(c.score)) }}>{pct1(c.rate)}</span>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
      <thead>
        <tr>
          <Th label={T.colCell} k="code" sort={sortC} onSort={onSortC} />
          <Th label={T.colLeader} k="leader" sort={sortC} onSort={onSortC} />
          <Th label={T.colBrigadir} k="brigadir" sort={sortC} onSort={onSortC} />
          <Th label={T.colShift} k="shift" sort={sortC} onSort={onSortC} align="center" />
          <Th label={T.colWorking} k="working" sort={sortC} onSort={onSortC} align="right" hint={T.hWorking} />
          <Th label={T.colLeft} k="left" sort={sortC} onSort={onSortC} align="right" hint={T.hLeft} />
          <Th label={T.colRate} k="rate" sort={sortC} onSort={onSortC} align="right" hint={T.hRate} />
        </tr>
      </thead>
      <tbody>
        {cells.length === 0 ? emptyRow(7, T.nothing) : cells.map((c) => (
          <tr key={c.key} className="cursor-pointer" onClick={() => openCell(c)}>
            <td className="px-3 py-2 tabular-nums">
              <CellLink id={c.id}>{c.code}</CellLink>
              {c.archived && <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>{T.archived}</span>}
            </td>
            <td className="px-3 py-2" style={{ color: c.leader ? "var(--text-1)" : "var(--text-3)" }}>
              {c.leader ? <>{tl(c.leader)}<KindTag kind={c.leader_kind} T={T} /></> : T.noLeader}
            </td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{c.brigadir ? tl(c.brigadir) : "—"}</td>
            <td className="px-3 py-2 text-center tabular-nums">{c.shift ?? "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(c.working)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(c.left)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: toneInk(scoreTone(c.score)) }}
              title={c.rate == null ? T.noRateHint : undefined}>{pct1(c.rate)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  const leaversTable = (
    <TableCard icon={UserMinus} title={T.tLeft} right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.nPeople, { n: n0(leavers.length) })}</span>}
      wrap
      mobile={leavers.length ? leavers.map((p) => (
        <div key={p.key} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{tl(p.name)}</span>
            <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dmy(p.left)}</span>
          </div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
            <span className="tabular-nums">{p.code}{p.approx && <span title={T.approxHint} style={{ color: "var(--status-warn)" }}> ≈</span>}</span>
            <span>{p.leader ? tl(p.leader) : counted(p)}</span>
            {p.job && <span>{tx(p.job)}</span>}
            <span>{tenure(p.days, T)}</span>
          </div>
          {p.reason && <div className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>{tx(p.reason)}</div>}
        </div>
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{(data?.leavers || []).length ? T.nothing : T.noneLeft}</p>}>
      <thead>
        <tr>
          <Th label={T.colName} k="name" sort={sortP} onSort={onSortP} />
          <Th label={T.colCell} k="code" sort={sortP} onSort={onSortP} />
          <Th label={T.colLeader} k="leader" sort={sortP} onSort={onSortP} />
          <Th label={T.colJob} k="job" sort={sortP} onSort={onSortP} />
          <Th label={T.colHired} k="hired" sort={sortP} onSort={onSortP} align="center" />
          <Th label={T.colLeftOn} k="leftOn" sort={sortP} onSort={onSortP} align="center" />
          <Th label={T.colTenure} k="days" sort={sortP} onSort={onSortP} align="right" />
          <Th label={T.colReason} k="reason" sort={sortP} onSort={onSortP} />
          <Th label={T.colCounted} k="counted" sort={sortP} onSort={onSortP} />
        </tr>
      </thead>
      <tbody>
        {leavers.length === 0 ? emptyRow(9, (data?.leavers || []).length ? T.nothing : T.noneLeft) : leavers.map((p) => (
          <tr key={p.key}>
            <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(p.name)}</td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap">
              {p.cell_id ? <CellLink id={p.cell_id}>{p.code}</CellLink> : (p.code || "—")}
              {p.approx && <span className="ml-1" title={T.approxHint} style={{ color: "var(--status-warn)" }}>≈</span>}
            </td>
            <td className="px-3 py-2" style={{ color: p.leader ? "var(--text-2)" : "var(--text-3)" }}>{p.leader ? tl(p.leader) : "—"}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{p.job ? tx(p.job) : "—"}</td>
            <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">{dmy(p.hired)}</td>
            <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">{dmy(p.left)}</td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{tenure(p.days, T)}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{p.reason ? tx(p.reason) : "—"}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: p.counted === "leader" ? "var(--text-2)" : "var(--status-warn)" }}>{counted(p)}</td>
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
      <EmptyState icon={UserMinus} title={state === "before" ? T.beforeTitle : mLabel}
        message={state === "before" ? T.before : T.future} showUploadLink={false} />
    );
  } else if (state === "past") {
    body = (
      <EmptyState icon={Archive} height="h-auto py-12" title={fill(T.pastTitle, { month: mLabel })}
        message={!data.configured ? `${T.pastMsg} ${T.notConfMsg}` : isAdmin ? T.pastMsg : `${T.pastMsg} ${T.pastNoAdmin}`}
        showUploadLink={false}
        action={isAdmin && data.configured ? (
          <Button icon={<Calculator size={14} />} loading={computeM.isPending || computing} disabled={running}
            onClick={() => computeM.mutate()}>
            {computing ? T.computing : T.compute}
          </Button>
        ) : null} />
    );
    if (computeFailed) {
      body = (
        <>
          <p className="mb-3 text-sm text-center" style={{ color: "var(--status-bad)" }}>{fill(T.readFailed, { e: data.read.last.error || "?" })}</p>
          {body}
        </>
      );
    }
  } else if (data && state !== "saved" && !data.configured && !data.read?.ok) {
    body = <EmptyState icon={AlertTriangle} title={T.notConfTitle} message={T.notConfMsg} showUploadLink={false} />;
  } else if (data && state !== "saved" && !data.read?.ok) {
    body = (
      <>
        {stateBar}
        <EmptyState icon={RefreshCw} title={running ? T.readRunning : T.noReadTitle} message={T.noReadMsg} showUploadLink={false}
          action={isAdmin && !running ? (
            <Button icon={<RefreshCw size={14} />} loading={readM.isPending} onClick={() => readM.mutate()}>{T.readNow}</Button>
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
        {tab === "cells" ? cellsTable : tab === "left" ? leaversTable : leadersTable}
      </>
    );
  }

  const exTitle = ex ? (ex.kind === "leader" ? tl(ex.item.name) : `${ex.item.code} · ${ex.item.leader ? tl(ex.item.leader) : T.noLeader}`) : "";
  const exSub = ex ? [
    ex.kind === "leader" ? ex.item.brigadirs.map((b) => tl(b.name)).join(", ") : (ex.item.brigadir ? tl(ex.item.brigadir) : ""),
    mLabel,
  ].filter(Boolean).join(" · ") : "";

  return (
    <Layout title={T.title}>
      <div className="mb-3">
        <SegmentedToggle asTabs value={tab} onChange={setTab} ariaLabel={T.title}
          options={[["leaders", T.tabLeaders], ["cells", T.tabCells], ["left", T.tabLeft]]} />
      </div>
      {toolbar}
      {body}

      {ex && data && (
        <TurnoverExplain open onClose={() => setEx(null)} item={ex.item} kind={ex.kind} data={data} T={T}
          tl={tl} tx={tx} title={exTitle} subtitle={exSub} />
      )}
      {rulesOpen && rule && <TurnoverRules open onClose={() => setRulesOpen(false)} rule={rule} T={T} />}
      {confirm && (
        <ConfirmDialog
          open onCancel={() => { setConfirm(null); setConfirmErr(null); }}
          onConfirm={() => stateM.mutate(confirm)}
          title={fill(confirm === "close" ? T.closeTitle : T.reopenTitle, { month: mLabel })}
          message={confirm === "close" ? T.closeMsg : T.reopenMsg}
          confirmLabel={confirm === "close" ? T.close : T.reopen}
          cancelLabel={T.cancel}
          loading={stateM.isPending} error={confirmErr} />
      )}
      {toast.node}
    </Layout>
  );
}
