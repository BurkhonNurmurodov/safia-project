import { useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  FileText, Download, AlertTriangle, Layers, UserCog, Info,
  Gauge, Factory, Users, Clock, Wallet, BadgeCheck, ShieldAlert, ListChecks,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import EmptyState from "../components/ui/EmptyState";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonTable } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import ReportSection from "../components/reports/ReportSection";
import {
  useRT, fill, monthLabel, fmtCell, rowLabel, colLabel, PAST_FROM, todayISO,
} from "../components/reports/reportsUtil";
import { usePersistentState } from "../hooks/usePersistentState";
import { useTranslit } from "../utils/transliterate";
import { exportXlsx } from "../utils/exportXlsx";
import api from "../utils/api";

const NO_LIST = [];

// Each section's glyph — distinct from one another, so the rail reads at a
// glance and a collapsed one still names itself.
const ICON = {
  summary: Gauge, production: Factory, personnel: Users, idle: Clock,
  cost: Wallet, quality: BadgeCheck, concerns: ShieldAlert, figures: ListChecks,
};

const FORMATS = ["pdf", "docx", "xlsx"];

const curMonth = () => todayISO().slice(0, 7);

/**
 * «Hisobotlar» (/reports) — the platform's PERIOD report, in the shape a
 * management report is read in: a list of sections down the side, each a table
 * of figures with the picked month and the two before it side by side, and the
 * whole thing downloadable as a document.
 *
 * Nothing is computed here and nothing is computed on the server either:
 * every figure is one another page already prints, folded by
 * `services/reports.py` out of the page that owns it (see its docstring for
 * which). The WORDS live in `pages/reportsText.js` in the four platform
 * languages and are posted back with the export, so the document can never
 * name or state something this screen does not.
 *
 * In the Laboratory and ADMIN-ONLY until the operator opens it on the Access
 * tab (page key `reports`).
 */
export default function Reports() {
  const T = useRT();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const toast = useToast();

  const [month, setMonth] = usePersistentState("reports_month", curMonth());
  const [shift, setShift] = usePersistentState("reports_shift", null);
  const [brig, setBrig] = usePersistentState("reports_brig", NO_LIST);
  const [open, setOpen] = usePersistentState("reports_section", "summary");
  const [dlOpen, setDlOpen] = useState(false);
  const [fmt, setFmt] = usePersistentState("reports_fmt", "pdf");
  const [scopeAll, setScopeAll] = useState(true);
  const [busy, setBusy] = useState(false);

  const ym = month && month >= PAST_FROM ? month : curMonth();
  const factorySection = useFactorySection();

  const base = useMemo(() => ({
    month: ym,
    ...(shift ? { shift } : {}),
    ...(brig?.length ? { managers: brig.join(",") } : {}),
  }), [ym, shift, brig]);
  const params = useFactoryParams(base);

  const q = useQuery({
    queryKey: ["reports", params],
    queryFn: () => api.get("/api/reports", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const data = q.data;

  const brigOpts = useMemo(() => (data?.options?.brigadirs || [])
    .filter((b) => (shift == null || b.shift === shift)
      && (params.factory == null || b.factory_id === params.factory)),
  [data, shift, params.factory]);
  const brigName = (id) =>
    tl((data?.options?.brigadirs || []).find((b) => b.id === id)?.name || `#${id}`);

  const shifts = data?.options?.shifts?.length ? data.options.shifts : [1, 2];
  const sections = [
    ...(factorySection ? [factorySection] : []),
    {
      key: "shift", icon: Layers, label: T.fShift, active: shift != null,
      display: shift ? fill(T.shiftN, { n: shift }) : "", onClear: () => setShift(null),
      render: ({ close } = {}) => (
        <PickFilter
          opts={[{ value: "__all__", label: T.all },
                 ...shifts.map((s) => ({ value: s, label: fill(T.shiftN, { n: s }) }))]}
          value={shift ?? "__all__"}
          onChange={(v) => setShift(v === "__all__" ? null : Number(v))} close={close} />
      ),
    },
    {
      key: "brig", icon: UserCog, label: T.fBrigadir, active: brig.length > 0,
      display: brig.map(brigName).join(", "), onClear: () => setBrig([]),
      render: () => (
        <OptsFilter opts={brigOpts.map((b) => b.id)} sel={brig} onChange={setBrig}
          render={brigName} searchable
          note={shift != null ? `${fill(T.shiftN, { n: shift })} · ${brigOpts.length}` : null} />
      ),
    },
  ];

  const unitCount = data?.scope?.units ?? 0;
  const scopeLabel = brig.length
    ? brig.map(brigName).join(", ")
    : `${T.allFactories} · ${fill(T.unitsN, { n: unitCount })}`;

  const secs = data?.sections || [];
  const current = secs.find((s) => s.key === open) || secs[0];

  // ── the download ──────────────────────────────────────────────────────────
  // The server rebuilds every figure; what travels is what this screen PRINTED
  // — the labels in the reader's language and each cell as `fmtCell` spelled
  // it. One number, two places, never two spellings of it.
  const exportBody = () => {
    const want = scopeAll ? secs : (current ? [current] : []);
    const display = {};
    for (const s of want) {
      for (const b of s.blocks || []) {
        for (const r of b.rows || []) {
          const vals = b.kind === "periods" ? r.values : r.cells;
          const cols = b.kind === "periods" ? null : (b.columns || []);
          display[`${s.key}.${b.key}.${r.key}`] = vals.map((v, i) => {
            if (b.kind === "units" && i === 0) return v ? tl(String(v)) : "—";
            return fmtCell(v, b.kind === "periods" ? r.fmt : cols[i]?.fmt);
          });
        }
      }
    }
    const rows = {};
    const cols = {};
    for (const s of want) {
      for (const b of s.blocks || []) {
        for (const r of b.rows || []) if (b.kind === "periods") rows[r.key] = rowLabel(r, T, t);
        for (const c of b.columns || []) cols[c.key] = colLabel(c, T);
      }
    }
    return {
      month: ym,
      factory: params.factory ?? null,
      shift: shift ?? null,
      managers: brig,
      fmt, lang,
      title: `${T.title} — ${monthLabel(ym, t)}`,
      subtitle: [scopeLabel, fill(T.builtAt, { at: (data?.built_at || "").replace("T", " ") })]
        .filter(Boolean).join(" · "),
      filename: `${T.title}-${ym}`,
      caption: `📄 ${T.title} — ${monthLabel(ym, t)}`,
      sections: want.map((s) => s.key),
      words: {
        sections: Object.fromEntries(want.map((s) => [s.key, T.sec[s.key] || s.key])),
        rows, cols,
        caps: T.caps,
        months: (data?.months || []).map((m) => monthLabel(m.ym, t)),
        missing: T.missing,
        missingNote: scopeAll ? T.missingNote : "",
      },
      display,
    };
  };

  const runExport = async () => {
    setBusy(true);
    try {
      const how = await exportXlsx(`/api/reports/export.${fmt}`, {
        body: exportBody(), fallbackName: `${T.title}-${ym}.${fmt}`,
      });
      toast.show(how === "download" ? T.dlDone : T.dlSent, "success");
      setDlOpen(false);
    } catch (e) {
      // The response is read as a BLOB on a download, so a failure's JSON body
      // is not parsed — the server's own words would print as «[object Blob]».
      // The caption names the failure; the detail is in the network tab.
      toast.show(`${T.dlFailed}${e?.message ? ` — ${e.message}` : ""}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const toolbar = (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <DateRangePicker month dateFrom={`${ym}-01`} dateTo={`${ym}-28`}
        setDateFrom={(iso) => setMonth(String(iso).slice(0, 7))} setDateTo={() => {}}
        min={`${PAST_FROM}-01`} max={todayISO()} triggerClassName="px-3 py-2 text-sm" />
      <FilterPanel sections={sections} />
      <Button size="lg" variant="primary" className="ml-auto" icon={<Download size={15} />}
        disabled={!secs.length} onClick={() => setDlOpen(true)}>
        <span className="max-sm:hidden">{T.download}</span>
      </Button>
    </div>
  );

  let body;
  if (q.isLoading && !data) {
    body = (<><SkeletonBlock className="h-[52px] w-full max-w-sm rounded-xl mb-4" />
      <SkeletonTable rows={8} cols={4} /></>);
  } else if (q.isError && !data) {
    body = (
      <EmptyState tone="danger" icon={AlertTriangle} title={T.loadFailed}
        message={T.loadFailedMsg} showUploadLink={false}
        action={<Button variant="secondary" onClick={() => q.refetch()}>{T.retry}</Button>} />
    );
  } else if (!secs.length || !unitCount) {
    body = <EmptyState icon={FileText} title={T.noUnits} message={T.noUnitsMsg} showUploadLink={false} />;
  } else {
    body = (
      <div className="flex gap-5 items-start">
        {/* The section rail — TopSim's own shape on a wide screen; below lg it
            becomes the scrolling toggle above the tables, which is the same
            navigation in the form a phone can hold. */}
        <nav className="hidden lg:block w-[220px] flex-shrink-0 rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            {T.sectionsNav}
          </div>
          <ul className="py-1">
            {secs.map((s) => {
              const Icon = ICON[s.key] || FileText;
              const on = s.key === current?.key;
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => setOpen(s.key)}
                    aria-current={on ? "page" : undefined}
                    className="w-full text-left px-4 py-2 flex items-start gap-2.5 transition-colors"
                    style={{
                      background: on ? "var(--bg-inner)" : "transparent",
                      boxShadow: on ? "inset 2px 0 0 var(--brand)" : undefined,
                    }}>
                    <Icon size={15} className="flex-shrink-0 mt-px"
                      style={{ color: on ? "var(--brand-text)" : "var(--text-3)" }} />
                    <span className="min-w-0">
                      <span className="block text-[13px] leading-tight"
                        style={{ color: on ? "var(--text-1)" : "var(--text-2)",
                                 fontWeight: on ? 600 : 400 }}>{T.sec[s.key] || s.key}</span>
                      <span className="block text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                        {T.secSub[s.key] || ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          <div className="lg:hidden mb-4">
            <SegmentedToggle asTabs value={current?.key} onChange={setOpen}
              options={secs.map((s) => ({ value: s.key, label: T.sec[s.key] || s.key }))} />
          </div>
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--text-1)" }}>
              {T.sec[current?.key] || ""}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {T.secSub[current?.key] || ""}
            </p>
          </div>
          {current && <ReportSection section={current} months={data.months || []} />}

          {/* What this platform cannot report, said out loud rather than left
              as a gap the reader has to notice: a management report of this
              shape usually also carries a P&L, a balance sheet and an
              inventory, and no source for any of them exists here. */}
          <div className="mt-6 rounded-2xl px-4 py-3.5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-start gap-2.5">
              <Info size={15} className="flex-shrink-0 mt-px" style={{ color: "var(--text-3)" }} />
              <div className="min-w-0">
                <div className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                  {T.missingTitle}
                </div>
                <p className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>{T.missingNote}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {(data.missing || []).map((k) => (
                    <li key={k} className="text-[11px]" style={{ color: "var(--text-3)" }}>
                      · {T.missing[k] || k}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Layout title={T.title}
      subtitle={data ? fill(T.subtitle, { month: monthLabel(ym, t), scope: scopeLabel }) : undefined}>
      {toolbar}
      {body}

      <Modal open={dlOpen} onClose={() => setDlOpen(false)} title={T.dlTitle}
        subtitle={`${monthLabel(ym, t)} · ${scopeLabel}`} icon={<Download size={18} />}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDlOpen(false)}>{T.cancel}</Button>
            <Button variant="primary" loading={busy} onClick={runExport}
              icon={<Download size={15} />}>{T.dlGo}</Button>
          </>
        }>
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-3)" }}>{T.dlWhat}</div>
          <SegmentedToggle value={scopeAll ? "all" : "one"} onChange={(v) => setScopeAll(v === "all")}
            options={[
              { value: "all", label: T.dlWhatAll },
              { value: "one", label: fill(T.dlWhatOne, { s: T.sec[current?.key] || "" }) },
            ]} />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1.5"
            style={{ color: "var(--text-3)" }}>{T.dlFormat}</div>
          <SegmentedToggle value={fmt} onChange={setFmt}
            options={FORMATS.map((f) => ({ value: f, label: T.fmt[f], title: T.fmtHint[f] }))} />
          <p className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>{T.fmtHint[fmt]}</p>
        </div>
      </Modal>
    </Layout>
  );
}
