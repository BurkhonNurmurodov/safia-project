import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck, Clock, Lightbulb, UserRound, Users,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import { FilterPanel } from "../components/ui/ColumnFilter";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import { useToast } from "../components/ui/Toast";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useFactoryParams } from "../context/FactoryContext";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { shortPerson } from "../utils/personName";
import OwnerChip from "../components/idle/OwnerChip";
import { catColor, iconFor } from "../components/idle/categories";
import { TXT, fill } from "./idleSolutionsText";
import api from "../utils/api";

/**
 * «Kutish yechimlari» — beside /downtime in Production. Which waiting cause
 * costs the most, who answers for it (the «Kutish mas'uli» register) and what
 * that person wrote they will do about it. GET /api/idle-solutions/analysis
 * (routers/idle_solutions.py): the minutes are /downtime's own, summed per
 * category; the only new fact is the solution log, written here by the owner
 * of a category or an admin. Same page key as /downtime.
 */

const AMBER = "var(--status-warn)";
const GREEN = "var(--status-ok)";
const GREY = "#94a3b8";
const STATE_INK = { none: GREY, open: AMBER, doing: "#3b82f6", done: GREEN };
const catCode = (name) => String(name || "").replace(/^Cat\s*/i, "");

function useT() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}

function StateChip({ T, state }) {
  const ink = STATE_INK[state] || GREY;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap flex-shrink-0"
      style={{ color: ink, background: `color-mix(in srgb, ${ink} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ink} 35%, transparent)` }}>
      {T.st[state] || state}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-2xl p-4 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        <Icon size={13} className="flex-shrink-0" /> <span>{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums truncate" style={{ color: tone || "var(--text-1)" }}>{value}</div>
      <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>{sub || " "}</div>
    </div>
  );
}

function Composer({ T, cat, onSaved }) {
  const toast = useToast({ position: "bottom" });
  const [text, setText] = useState("");
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/idle-solutions", { category: cat, text: text.trim(), status });
      setText("");
      setStatus("open");
      toast.success(T.saved);
      onSaved();
    } catch {
      toast.error(T.saveFail);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3">
      <FormField label={T.write}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={T.writePh}
          className="w-full rounded-xl px-3 py-2 text-base sm:text-sm resize-y min-h-[84px]"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
        />
      </FormField>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <StyledSelect
          value={status}
          onChange={setStatus}
          options={["open", "doing", "done"].map((s) => ({ value: s, label: T.st[s] }))}
          triggerClassName="px-3 py-2 text-sm"
        />
        <Button size="lg" onClick={save} loading={busy} disabled={!text.trim()}>{T.save}</Button>
      </div>
      {toast.node}
    </div>
  );
}

function SolutionRow({ T, s, canWrite, onChanged, ddmmyy }) {
  const toast = useToast({ position: "bottom" });
  const { tl } = useTranslit();
  async function setStatus(v) {
    try {
      await api.put(`/api/idle-solutions/${s.id}`, { status: v });
      onChanged();
    } catch {
      toast.error(T.saveFail);
    }
  }
  return (
    <li className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
          {fill(T.by, { n: s.author_name ? shortPerson(tl(s.author_name) || s.author_name) : "—", d: ddmmyy(s.created_at) })}
        </div>
        {canWrite ? (
          <StyledSelect
            value={s.status}
            onChange={setStatus}
            options={["open", "doing", "done"].map((x) => ({ value: x, label: T.st[x] }))}
            triggerClassName="px-2.5 py-1.5 text-xs"
          />
        ) : <StateChip T={T} state={s.status} />}
      </div>
      <p className="text-sm mt-1.5 whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{s.text}</p>
      {toast.node}
    </li>
  );
}

function CauseRow({ T, c, max, open, onToggle, refresh, label, ddmmyy }) {
  const { tl } = useTranslit();
  const code = catCode(c.category);
  const Icon = iconFor(code);
  const hue = catColor(c.category);
  const pct = max > 0 ? Math.max(2, (c.minutes / max) * 100) : 0;
  const owners = useMemo(() => (c.owner ? { [c.category]: c.owner } : {}), [c]);
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full text-left px-4 py-3 flex flex-col gap-2 hover:bg-[var(--bg-inner)] transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 text-xs tabular-nums text-center flex-shrink-0" style={{ color: "var(--text-3)" }}>{c.rank ?? "·"}</span>
          <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center flex-shrink-0"
            style={{ background: `color-mix(in srgb, ${hue} 14%, transparent)`, color: hue }}>
            <Icon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
              {c.category} <span className="font-normal" style={{ color: "var(--text-2)" }}>— {label(code)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {c.owner
                ? <OwnerChip owners={owners} category={c.category} full />
                : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: AMBER }}>
                    <AlertTriangle size={11} /> {T.noOwner}
                  </span>
                )}
              <StateChip T={T} state={c.state} />
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{fill(T.minutes, { m: Math.round(c.minutes) })}</div>
            <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.share, { p: c.share })}</div>
          </div>
          {open ? <ChevronDown size={16} style={{ color: "var(--text-3)" }} /> : <ChevronRight size={16} style={{ color: "var(--text-3)" }} />}
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hue }} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>{T.worst}</div>
            {c.top_units.length === 0 ? (
              <div className="text-xs" style={{ color: "var(--text-3)" }}>{T.noUnits}</div>
            ) : (
              <ul className="space-y-1.5">
                {c.top_units.map((u) => (
                  <li key={u.manager_id} className="flex items-center gap-2 text-sm">
                    <UserRound size={13} style={{ color: "var(--text-3)" }} />
                    <span className="truncate flex-1" style={{ color: "var(--text-1)" }}>{shortPerson(tl(u.manager_name) || u.manager_name)}</span>
                    <span className="tabular-nums text-xs" style={{ color: "var(--text-2)" }}>{fill(T.minutes, { m: Math.round(u.minutes) })}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="text-[11px] mt-3" style={{ color: "var(--text-3)" }}>
              {fill(T.days, { n: c.days })} · {fill(T.units, { n: c.units_n })}
            </div>
            {!c.owner && <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>{T.assignHint}</div>}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>{T.solutions}</div>
            {c.solutions.length === 0 ? (
              <div className="text-xs" style={{ color: "var(--text-2)" }}>
                {T.noSol}. {c.can_write ? T.noSolWrite : T.noSolRead}
              </div>
            ) : (
              <ul className="space-y-2">
                {c.solutions.map((s) => (
                  <SolutionRow key={s.id} T={T} s={s} canWrite={c.can_write} onChanged={refresh} ddmmyy={ddmmyy} />
                ))}
              </ul>
            )}
            {c.can_write && <Composer T={T} cat={c.category} onSaved={refresh} />}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IdleSolutions() {
  const T = useT();
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const { params, ready, dateFrom, dateTo, setDateFrom, setDateTo, shift, setShift } = useFilters();
  const fparams = useFactoryParams(params);
  const factorySection = useFactorySection();
  const [openCat, setOpenCat] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["idle-solutions", fparams],
    queryFn: () => api.get("/api/idle-solutions/analysis", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["idle-solutions"] });

  const label = (code) => {
    const v = t(`downtime.cat.${code}.label`);
    return v && !v.startsWith("downtime.cat.") ? v : "";
  };
  const ddmmyy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

  const cats = data?.categories || [];
  const active = cats.filter((c) => c.minutes > 0);
  const quiet = cats.filter((c) => c.minutes <= 0);
  const max = active[0]?.minutes || 0;
  const top = active[0];

  const sections = [
    ...(factorySection ? [factorySection] : []),
    {
      key: "shift", icon: Clock, label: t("filter.shift"),
      active: shift != null, display: shift != null ? `S${shift}` : "",
      onClear: () => setShift(null),
      render: () => (
        <SegmentedToggle fill value={shift} onChange={setShift}
          options={[[null, t("filter.all") || "—"], [1, "S1"], [2, "S2"]]} />
      ),
    },
  ];

  return (
    <Layout title={T.title} subtitle={null}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
          compactLabel triggerClassName="px-3 py-2 text-sm" />
        <FilterPanel sections={sections} />
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>{T.hint}</p>

      {isError ? (
        <EmptyState tone="danger" title={T.errLoad} message="" showUploadLink={false} action={<Button onClick={() => refetch()}>{T.retry}</Button>} />
      ) : isLoading || !data ? (
        <div className="space-y-3"><SkeletonBlock className="h-24" /><SkeletonBlock className="h-72" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Kpi icon={Clock} label={T.kTotal} value={Math.round(data.total)} sub={T.kTotalSub} />
            <Kpi icon={Lightbulb} label={T.kTop}
              value={top ? top.category : "—"}
              sub={top ? `${label(catCode(top.category))} · ${fill(T.share, { p: top.share })}` : ""} />
            <Kpi icon={UserRound} label={T.kNoOwner} value={data.no_owner_n}
              sub={fill(T.ofCauses, { n: active.length })} tone={data.no_owner_n ? AMBER : undefined} />
            <Kpi icon={ClipboardCheck} label={T.kNoSol} value={data.no_solution_n}
              sub={fill(T.ofCauses, { n: active.length })} tone={data.no_solution_n ? AMBER : undefined} />
          </div>

          {active.length === 0 ? (
            <EmptyState icon={Clock} title={T.empty} message={T.emptySub} showUploadLink={false} />
          ) : (
            <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <SectionHead icon={Lightbulb} title={T.secCauses} right={fill(T.ofCauses, { n: active.length })} />
              {active.map((c) => (
                <CauseRow key={c.category} T={T} c={c} max={max} label={label} ddmmyy={ddmmyy}
                  open={openCat === c.category}
                  onToggle={() => setOpenCat(openCat === c.category ? null : c.category)}
                  refresh={refresh} />
              ))}
              {quiet.some((c) => c.can_write) && quiet.filter((c) => c.can_write).map((c) => (
                <CauseRow key={c.category} T={T} c={c} max={max} label={label} ddmmyy={ddmmyy}
                  open={openCat === c.category}
                  onToggle={() => setOpenCat(openCat === c.category ? null : c.category)}
                  refresh={refresh} />
              ))}
            </div>
          )}

          {data.units.length > 0 && (
            <TableCard icon={Users} title={T.secUnits} right={fill(T.units, { n: data.units.length })} maxHeight="60vh">
              <thead>
                <tr>
                  <Th label={T.cUnit} />
                  <Th label={T.cTotal} align="right" />
                  <Th label={T.cTop} />
                </tr>
              </thead>
              <tbody>
                {data.units.map((u) => (
                  <tr key={u.manager_id}>
                    <td className="px-3 py-2 font-medium">{shortPerson(tl(u.manager_name) || u.manager_name)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{Math.round(u.total)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {u.top.map((x) => {
                          const hue = catColor(x.category);
                          return (
                            <span key={x.category} title={`${x.category} — ${label(catCode(x.category))}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
                              style={{ color: hue, background: `color-mix(in srgb, ${hue} 12%, transparent)`,
                                border: `1px solid color-mix(in srgb, ${hue} 35%, transparent)` }}>
                              {catCode(x.category)} · {Math.round(x.minutes)}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </>
      )}
    </Layout>
  );
}
