import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Factory, UserRound, ListTree, MessageSquareText, Flag, Camera, KeyRound, CloudDownload } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker, { localISO } from "../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import AuditsRegister from "../components/audits/AuditsRegister";
import AuditsAnalysis from "../components/audits/AuditsAnalysis";
import { fmtAt } from "./admin/VerifixParity";
import { shopLabel } from "../components/audits/auditUtil";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { useAuT, fill } from "./auditsText";

/**
 * «Auditlar» — the KRU and technical audits read from panel.safiabakery.uz
 * (docs/audits.md). Insight: whoever runs quality needs to see which
 * workshops keep losing points on which questions, to fix the recurring
 * causes — not to scroll a list of minuses. Concept: «Tahlil» opens on what
 * keeps failing (the weakest workshops, the most repeated questions), and every
 * bar opens «Ro'yxat» already filtered to it — from a pattern to its rows in
 * one click.
 *
 * KRU / Texnik audit are the page's view tabs, Ro'yxat / Tahlil sit beside
 * them on the same bar — one row, the kind and the view are both in the URL.
 */

const KINDS = ["tech", "kru"];
const VIEWS = ["list", "analysis"];
const NO_FILTERS = { workshop: [], inspector: [], task: [], question: null, top: false, photo: null };

function monthStart() {
  const d = new Date();
  return localISO(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function Audits() {
  const T = useAuT();
  const { tx, tl } = useTranslit();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = useAuth()?.auth?.role === "admin";
  const { show: toast, node: toastNode } = useToast();
  const [params, setParams] = useSearchParams();
  const kind = KINDS.includes(params.get("k")) ? params.get("k") : "tech";
  const view = VIEWS.includes(params.get("v")) ? params.get("v") : "list";
  const setParam = (key, val) => setParams((p) => { const n = new URLSearchParams(p); n.set(key, val); return n; },
    { replace: true });

  const today = localISO(new Date());
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [f, setF] = useState(NO_FILTERS);
  const [q, setQ] = useState("");
  const period = { kind, date_from: dateFrom, date_to: dateTo };

  const meta = useQuery({
    queryKey: ["audits-meta", kind, dateFrom, dateTo],
    queryFn: () => api.get("/api/audits/meta", { params: period }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  const M = meta.data;

  const refresh = useMutation({
    mutationFn: () => api.post("/api/audits/refresh", { date_from: dateFrom, date_to: dateTo }).then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["audits-meta"] });
      qc.invalidateQueries({ queryKey: ["audits-rows"] });
      qc.invalidateQueries({ queryKey: ["audits-analysis"] });
      if (res.results) {
        const ok = res.results.filter((r) => r.ok);
        const bad = res.results.filter((r) => !r.ok);
        const months = new Set(ok.map((r) => r.month)).size;
        if (bad.length) {
          toast(`${fill(T.refreshed, { n: months })} · ${fill(T.refreshPart, { months: [...new Set(bad.map((r) => r.month))].join(", ") })}`,
            "warning");
        } else {
          toast(fill(T.refreshed, { n: months }), "success");
        }
      } else {
        toast(T.err[res.code] || T.err.other, "error");
      }
    },
    onError: (e) => toast(e?.response?.data?.detail || T.err.other, "error"),
  });

  // Switching the audit kind keeps the period, drops the record filters:
  // a KRU workshop list is not the technical audit's.
  const switchKind = (k) => { setF(NO_FILTERS); setQ(""); setParam("k", k); };
  const openRegister = (patch) => { setF({ ...NO_FILTERS, ...patch }); setQ(""); setParam("v", "list"); };

  const facets = M?.facets || { workshop: [], inspector: [], task: [] };
  const opts = (key) => facets[key].map((x) => x.value);
  const multi = (key, label, icon, render) => ({
    key, icon, label, group: key === "task" ? T.grpWhat : T.grpWhere,
    active: f[key].length > 0,
    display: f[key].length === 1 ? render(f[key][0]) : f[key].length ? String(f[key].length) : "",
    onClear: () => setF((s) => ({ ...s, [key]: [] })),
    render: () => (
      <OptsFilter searchable opts={opts(key)} sel={f[key]} onChange={(v) => setF((s) => ({ ...s, [key]: v }))}
        labelOf={render} />
    ),
  });
  const sections = [
    multi("workshop", T.fWorkshop, Factory, (v) => shopLabel(tx(v))),
    multi("inspector", T.fInspector, UserRound, (v) => tl(v)),
    multi("task", T.fTask, ListTree, (v) => tx(v)),
    f.question && {
      key: "question", icon: MessageSquareText, label: T.fQuestion, group: T.grpWhat, active: true,
      display: tx(f.question), onClear: () => setF((s) => ({ ...s, question: null })),
      render: () => <div className="px-3 py-2 text-sm max-w-xs" style={{ color: "var(--text-2)" }}>{tx(f.question)}</div>,
    },
    {
      key: "top", icon: Flag, label: T.fTop, group: T.grpWhat, active: f.top,
      display: f.top ? T.topOnly : "", onClear: () => setF((s) => ({ ...s, top: false })),
      render: () => (
        <div className="p-2">
          <SegmentedToggle fill value={f.top ? "top" : "all"} onChange={(v) => setF((s) => ({ ...s, top: v === "top" }))}
            options={[["all", T.topAll], ["top", T.topOnly]]} />
        </div>
      ),
    },
    {
      key: "photo", icon: Camera, label: T.fPhoto, group: T.grpWhat, active: Boolean(f.photo),
      display: f.photo === "yes" ? T.photoYes : f.photo === "no" ? T.photoNo : "",
      onClear: () => setF((s) => ({ ...s, photo: null })),
      render: () => (
        <div className="p-2">
          <SegmentedToggle fill value={f.photo || "all"} onChange={(v) => setF((s) => ({ ...s, photo: v === "all" ? null : v }))}
            options={[["all", T.topAll], ["yes", T.photoYes], ["no", T.photoNo]]} />
        </div>
      ),
    },
  ].filter(Boolean);

  const cov = M?.coverage;
  const anyRead = cov && cov.months.length > cov.missing.length;
  const freshLine = useMemo(() => {
    const bits = [];
    if (cov?.read_at) bits.push(fill(T.fresh, { at: fmtAt(cov.read_at) }));
    bits.push(T.scope);
    return bits.join(" · ");
  }, [cov?.read_at, T]);

  let body = null;
  if (meta.isLoading) {
    body = <SkeletonBlock className="h-96 rounded-2xl" />;
  } else if (meta.isError) {
    body = <EmptyState tone="danger" title={T.loadFail} message="" showUploadLink={false}
      action={<Button size="lg" variant="secondary" onClick={() => meta.refetch()}>{T.retry}</Button>} />;
  } else if ((!M.configured || M.readable === false) && !anyRead) {
    body = (
      <EmptyState icon={KeyRound} title={T.noLoginTitle} message={isAdmin ? T.noLoginMsg : T.noLoginAsk}
        showUploadLink={false} height="h-72"
        action={isAdmin && <Button size="lg" variant="primary" onClick={() => navigate("/panel/sdpanel")}>{T.noLoginAction}</Button>} />
    );
  } else if (M.refused && !anyRead) {
    body = (
      <EmptyState icon={KeyRound} tone="danger" title={T.refusedTitle} message={T.refusedMsg} showUploadLink={false}
        height="h-72"
        action={isAdmin && <Button size="lg" variant="primary" onClick={() => navigate("/panel/sdpanel")}>{T.noLoginAction}</Button>} />
    );
  } else if (!anyRead) {
    body = (
      <EmptyState icon={CloudDownload} title={T.neverTitle} message={T.neverMsg} showUploadLink={false} height="h-72"
        action={<Button size="lg" variant="primary" loading={refresh.isPending} onClick={() => refresh.mutate()}
          icon={<RefreshCw size={15} />}>{T.neverAction}</Button>} />
    );
  }

  const clearAll = () => { setF(NO_FILTERS); setQ(""); };

  return (
    <Layout title={T.title}>
      <div className="space-y-3">
        {/* ── one bar: the kind, the view, the period, the filters ─────── */}
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle asTabs value={kind} onChange={switchKind}
            options={[["tech", T.tech], ["kru", T.kru]]} />
          <SegmentedToggle asTabs value={view} onChange={(v) => setParam("v", v)}
            options={[["list", T.list], ["analysis", T.analysis]]} />
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
            max={today} compactLabel triggerClassName="px-3 py-2 text-sm" />
          <FilterPanel sections={sections} />
          <Button size="lg" variant="secondary" className="ml-auto" loading={refresh.isPending}
            disabled={!M?.configured} onClick={() => refresh.mutate()} icon={<RefreshCw size={15} />}>
            {T.refresh}
          </Button>
        </div>
        {/* Always present, so nothing below it moves when it changes. */}
        <div className="text-xs min-h-[16px] truncate" style={{ color: "var(--text-3)" }} title={freshLine}>
          {M && !body ? freshLine : " "}
          {cov?.missing?.length > 0 && anyRead && (
            <span style={{ color: "var(--status-warn)" }}>{" · "}{fill(T.notRead, { months: cov.missing.join(", ") })}</span>
          )}
        </div>

        {body ?? (view === "list"
          ? <AuditsRegister period={period} f={f} q={q} setQ={setQ} T={T} onClearAll={clearAll} />
          : <AuditsAnalysis period={period} f={f} T={T} onOpen={openRegister} onClearAll={clearAll} />)}
      </div>
      {toastNode}
    </Layout>
  );
}
