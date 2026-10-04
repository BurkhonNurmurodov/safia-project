import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Network, Play, Square, CircleCheck, CircleDashed, ShieldOff, CircleSlash, TriangleAlert, Boxes,
  CircleDot, Lock, ArrowUpRight, Layers,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import KPICard from "../../components/ui/KPICard";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import SearchInput from "../../components/ui/SearchInput";
import FormField from "../../components/ui/FormField";
import TimeField from "../../components/ui/TimeField";
import DateRangePicker from "../../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter } from "../../components/ui/ColumnFilter";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import VfxTable from "../../components/verifix/VfxTable";
import { RawView } from "../../components/verifix/RawRows";
import { VfxError, StatusDot, Chip, AccessNotice } from "../../components/verifix/VfxState";
import {
  vget, vfxError, fill, num, dm, hm, probeState, PROBE_TONE, C_OK, C_BAD, C_WARN, C_NONE,
} from "../../components/verifix/vfx";

/* «API xaritasi» — every READ method of Verifix's API (verifix_catalog.py),
 * what it answered the last time it was asked, and any method's rows.
 *
 * One primary action: «Hammasini tekshirish» asks every method that can be
 * asked for its first page, three at a time, and the map fills in as the
 * answers land. A method that needs an id waits for somebody to type one in
 * the viewer; the private records are switched off and are never asked. */

const MODULES = ["core", "start", "pro", "shift", "iiko", "rec", "rep"];
const PAGE_ROUTE = {
  employees: "/verifix/employees", jobs: "/verifix/jobs", timesheet: "/verifix/timesheet", hr: "/verifix/hr",
  timebooks: "/verifix/timebooks", shifts: "/verifix/shifts", dictionaries: "/verifix/dictionaries",
};
// The map's cards, each a set of states — tapping one narrows the table to it.
const BUCKETS = [
  { key: "ok", states: ["ok"], icon: CircleCheck, color: C_OK },
  { key: "empty", states: ["empty"], icon: CircleDashed, color: C_NONE },
  { key: "forbidden", states: ["forbidden", "auth"], icon: ShieldOff, color: C_BAD },
  { key: "missing", states: ["missing"], icon: CircleSlash, color: C_WARN },
  { key: "error", states: ["error", "bad_request", "slow"], icon: TriangleAlert, color: C_BAD },
  { key: "unchecked", states: ["unchecked", "needs"], icon: CircleDot, color: C_NONE },
];
const ALL_STATES = ["ok", "empty", "forbidden", "auth", "missing", "error", "bad_request", "slow", "needs", "unchecked", "off"];
const PARALLEL = 3;

// Verifix's own date shapes → the ISO the inputs hold.
const fromVfxDate = (s) => (s && /^\d{2}\.\d{2}\.\d{4}/.test(s) ? `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}` : "");
const fromVfxDt = (s) => (s ? `${fromVfxDate(s)}T${s.slice(11, 16) || "00:00"}` : "");

export default function VfxApiMap() {
  const { t } = useLang();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["vfx", "methods"], queryFn: () => vget("/methods") });
  const [search, setSearch] = usePersistentState("vfx_api_q", "");
  const [mods, setMods] = usePersistentState("vfx_api_mods", []);
  const [states, setStates] = usePersistentState("vfx_api_states", []);
  const [open, setOpen] = useState(null);
  const [run, setRun] = useState(null);
  const stop = useRef(false);

  const methods = useMemo(() => (q.data?.methods || []).map((m) => ({ ...m, st: probeState(m) })), [q.data]);
  const count = (list) => methods.filter((m) => list.includes(m.st)).length;
  const askable = methods.filter((m) => m.st !== "off" && !m.needs.length);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return methods.filter((m) => (!mods.length || mods.includes(m.module))
      && (!states.length || states.includes(m.st))
      && (!needle || `${m.name} ${m.group} ${m.key}`.toLowerCase().includes(needle)));
  }, [methods, mods, states, search]);

  useEffect(() => () => { stop.current = true; }, []);

  async function probeAll() {
    const list = askable.map((m) => m.key);
    stop.current = false;
    setRun({ done: 0, total: list.length, auth: false });
    let next = 0;
    const worker = async () => {
      while (!stop.current && next < list.length) {
        const key = list[next++];
        try {
          const d = await vget("/methods/rows", { key, limit: 20 });
          // A refused login refuses every method the same way — stop asking.
          if (d.status === "auth") { stop.current = true; setRun((r) => ({ ...r, auth: true })); }
        } catch (e) {
          const err = vfxError(e);
          if (err.code === "not_configured" || err.code === "denied") stop.current = true;
        }
        setRun((r) => (r ? { ...r, done: r.done + 1 } : r));
        if (next % 6 === 0) qc.invalidateQueries({ queryKey: ["vfx", "methods"] });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    await qc.invalidateQueries({ queryKey: ["vfx", "methods"] });
    setRun((r) => (r?.auth ? { ...r, finished: true } : null));
  }

  const columns = [
    {
      key: "name", label: t("vfx.api.col.method"), sort: (m) => `${MODULES.indexOf(m.module)} ${m.group} ${m.name}`,
      render: (m) => (
        <div className="min-w-0 max-w-[340px]">
          <div className="flex items-center gap-1.5">
            {m.blocked && <Lock size={12} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />}
            <span className="truncate font-medium" style={{ color: "var(--text-1)" }}>{m.name}</span>
          </div>
          <div className="font-mono text-[11px] truncate" style={{ color: "var(--text-4)" }}>{m.key}</div>
        </div>
      ),
    },
    {
      key: "module", label: t("vfx.api.col.module"), sort: (m) => MODULES.indexOf(m.module),
      render: (m) => <span style={{ color: "var(--text-2)" }}>{t(`vfx.mod.${m.module}`)}</span>,
    },
    {
      key: "state", label: t("vfx.api.col.state"), sort: (m) => ALL_STATES.indexOf(m.st),
      render: (m) => (
        <StatusDot color={PROBE_TONE[m.st]} label={t(`vfx.st.${m.st}`)}
          title={[t(`vfx.stHint.${m.st}`), m.probe?.error].filter(Boolean).join(" — ")} />
      ),
    },
    {
      key: "rows", label: t("vfx.api.col.rows"), align: "right", firstDir: "desc",
      sort: (m) => m.probe?.rows ?? null, hint: t("vfx.api.col.rowsHint"),
      render: (m) => (m.probe?.rows == null ? <span style={{ color: "var(--text-4)" }}>—</span>
        : `${num(m.probe.rows)}${m.probe.more ? "+" : ""}`),
    },
    {
      key: "fields", label: t("vfx.api.col.fields"), align: "right", firstDir: "desc",
      sort: (m) => m.probe?.fields?.length || null,
      render: (m) => (m.probe?.fields?.length ? num(m.probe.fields.length) : <span style={{ color: "var(--text-4)" }}>—</span>),
    },
    {
      key: "ms", label: t("vfx.api.col.ms"), align: "right", sort: (m) => m.probe?.ms ?? null,
      render: (m) => (m.probe?.ms == null ? <span style={{ color: "var(--text-4)" }}>—</span>
        : `${(m.probe.ms / 1000).toFixed(1)} ${t("vfx.sec")}`),
    },
    {
      key: "at", label: t("vfx.api.col.at"), firstDir: "desc", sort: (m) => m.probe?.at || null,
      render: (m) => (m.probe?.at ? <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{dm(m.probe.at)} {hm(m.probe.at)}</span>
        : <span style={{ color: "var(--text-4)" }}>—</span>),
    },
    {
      key: "page", label: t("vfx.api.col.page"), sort: (m) => (PAGE_ROUTE[m.page] ? m.page : null),
      render: (m) => (PAGE_ROUTE[m.page] ? (
        <Link to={PAGE_ROUTE[m.page]} onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-0.5 text-xs font-medium hover:underline underline-offset-2"
          style={{ color: "var(--brand-text)" }}>
          {t(`nav.vfx.${m.page}`)}<ArrowUpRight size={12} />
        </Link>
      ) : <span style={{ color: "var(--text-4)" }}>—</span>),
    },
  ];

  const sections = [
    {
      key: "module", icon: Layers, label: t("vfx.api.col.module"), active: mods.length > 0,
      display: mods.length === 1 ? t(`vfx.mod.${mods[0]}`) : `${mods.length} ${t("filter.selected2")}`,
      onClear: () => setMods([]),
      render: () => (
        <OptsFilter opts={MODULES} sel={mods} onChange={setMods} labelOf={(v) => t(`vfx.mod.${v}`)}
          render={(v) => (
            <span className="inline-flex items-center gap-1.5">
              {t(`vfx.mod.${v}`)}
              <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{methods.filter((m) => m.module === v).length}</span>
            </span>
          )} />
      ),
    },
    {
      key: "state", icon: CircleDot, label: t("vfx.api.col.state"), active: states.length > 0,
      display: states.length === 1 ? t(`vfx.st.${states[0]}`) : `${states.length} ${t("filter.selected2")}`,
      onClear: () => setStates([]),
      render: () => (
        <OptsFilter opts={ALL_STATES.filter((s) => methods.some((m) => m.st === s))} sel={states} onChange={setStates}
          labelOf={(v) => t(`vfx.st.${v}`)}
          render={(v) => (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: PROBE_TONE[v] }} />
              {t(`vfx.st.${v}`)}
              <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{count([v])}</span>
            </span>
          )} />
      ),
    },
  ];

  const openMethod = methods.find((m) => m.key === open);

  return (
    <Layout title={t("nav.vfx.api")}>
      <div className="space-y-4">
        <p className="text-sm max-w-3xl" style={{ color: "var(--text-2)" }}>
          {fill(t("vfx.api.lead"), { n: methods.length || 94, host: q.data?.host || "Verifix" })}
        </p>

        {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : (
          <>
            {q.data && !q.data.configured && <VfxError error={{ code: "not_configured" }} />}

            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
              {BUCKETS.map((b) => (
                <KPICard key={b.key} label={t(`vfx.api.k.${b.key}`)} icon={b.icon} color={b.color}
                  value={q.isLoading ? <SkeletonBlock className="h-7 w-12 mt-1" /> : num(count(b.states))}
                  tooltip={t(`vfx.api.kHint.${b.key}`)}
                  onValueClick={() => setStates(b.states)} />
              ))}
            </div>

            <div className="rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex-1 min-w-[220px]">
                {run && !run.finished ? (
                  <>
                    <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
                      {fill(t("vfx.api.running"), { done: run.done, total: run.total })}
                    </div>
                    <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
                      role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.done}>
                      <div className="h-full rounded-full transition-all duration-200"
                        style={{ width: `${run.total ? (run.done / run.total) * 100 : 0}%`, background: "var(--brand)" }} />
                    </div>
                  </>
                ) : run?.auth ? (
                  <div className="text-sm" style={{ color: C_BAD }}>{t("vfx.api.authStopped")}</div>
                ) : (
                  <>
                    <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{t("vfx.api.probeTitle")}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                      {fill(t("vfx.api.probeSub"), { n: askable.length, off: count(["off"]), needs: count(["needs"]) })}
                    </div>
                  </>
                )}
              </div>
              {run && !run.finished ? (
                <Button size="lg" variant="secondary" icon={<Square size={13} />} onClick={() => { stop.current = true; }}>
                  {t("vfx.api.stop")}
                </Button>
              ) : (
                <Button size="lg" variant="primary" icon={<Play size={14} />} disabled={!q.data?.configured || !askable.length}
                  onClick={probeAll}>
                  {fill(t("vfx.api.probeAll"), { n: askable.length })}
                </Button>
              )}
            </div>

            <VfxTable
              icon={Network} title={t("vfx.api.tableTitle")}
              right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{rows.length} / {methods.length}</span>}
              toolbar={<>
                <SearchInput value={search} onChange={setSearch} placeholder={t("vfx.api.search")} className="w-full sm:w-64" />
                <FilterPanel sections={sections} />
              </>}
              rows={rows} columns={columns} rowKey={(m) => m.key} loading={q.isLoading}
              defaultSort={{ key: "name", dir: "asc" }} sortStoreKey="vfx_api_sort" pageSize={100}
              onRowClick={(m) => setOpen(m.key)}
            />
          </>
        )}
      </div>
      {openMethod && <MethodViewer method={openMethod} onClose={() => setOpen(null)} />}
    </Layout>
  );
}

// ── the raw viewer ────────────────────────────────────────────────────────────

const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none font-mono tabular-nums";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

function initialParams(method) {
  const out = {};
  for (const p of method.params) {
    if (p.kind === "date") out[p.name] = fromVfxDate(p.default);
    else if (p.kind === "datetime") out[p.name] = fromVfxDt(p.default);
    else out[p.name] = p.default != null ? String(p.default) : "";
  }
  return out;
}

function MethodViewer({ method, onClose }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [params, setParams] = useState(() => initialParams(method));
  const [rows, setRows] = useState([]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const canAsk = !method.blocked;
  const missing = method.params.filter((p) => p.required && !String(params[p.name] ?? "").trim()).map((p) => p.name);

  async function load(cursor = null) {
    setBusy(true);
    setErr(null);
    try {
      const sent = Object.fromEntries(Object.entries(params).filter(([, v]) => String(v ?? "").trim() !== ""));
      const d = await vget("/methods/rows", { key: method.key, params: JSON.stringify(sent), cursor: cursor || undefined, limit: 50 });
      setRes(d);
      setRows((prev) => (cursor ? [...prev, ...(d.rows || [])] : d.rows || []));
    } catch (e) {
      setErr(vfxError(e));
    } finally {
      setBusy(false);
      if (!cursor) qc.invalidateQueries({ queryKey: ["vfx", "methods"] });
    }
  }

  // The viewer reads its method once, as it opens.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canAsk && !missing.length) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (name, v) => setParams((p) => ({ ...p, [name]: v }));
  const st = res?.status;
  const fields = res?.fields?.length ? res.fields : method.probe?.fields || [];

  return (
    <Modal onClose={onClose} title={method.name} subtitle={method.key} icon={Boxes} maxWidth="max-w-5xl"
      footer={<Button variant="secondary" onClick={onClose}>{t("vfx.close")}</Button>}>
      <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: "var(--text-3)" }}>
        <Chip color="#94a3b8">{t(`vfx.mod.${method.module}`)}</Chip>
        <span>{method.group}</span>
        {method.limit && <span>· {fill(t("vfx.api.pageMax"), { n: num(method.limit) })}</span>}
      </div>

      {method.blocked ? (
        <AccessNotice text={t("vfx.api.blocked")} />
      ) : (
        <>
          {method.params.length > 0 && (
            <div className="rounded-xl p-3 space-y-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {method.params.map((p) => (
                  <FormField key={p.name} label={<span className="font-mono normal-case">{p.name}</span>} required={p.required}>
                    {p.kind === "date" ? (
                      <DateRangePicker single dateFrom={params[p.name]} setDateFrom={(v) => set(p.name, v)}
                        triggerClassName="px-3 py-2 text-sm" />
                    ) : p.kind === "datetime" ? (
                      <div className="flex gap-2">
                        <DateRangePicker single dateFrom={(params[p.name] || "").slice(0, 10)}
                          setDateFrom={(v) => set(p.name, `${v}T${(params[p.name] || "T00:00").slice(11, 16) || "00:00"}`)}
                          triggerClassName="px-3 py-2 text-sm" />
                        <TimeField value={(params[p.name] || "").slice(11, 16)} clearable={false}
                          onChange={(v) => set(p.name, `${(params[p.name] || "").slice(0, 10)}T${v || "00:00"}`)} />
                      </div>
                    ) : (
                      <input value={params[p.name] ?? ""} inputMode="numeric"
                        onChange={(e) => set(p.name, e.target.value.replace(/[^\d]/g, ""))}
                        placeholder={p.kind === "year" ? "2026" : "ID"} className={inputCls} style={inputStyle} />
                    )}
                  </FormField>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                {missing.length > 0 && (
                  <span className="text-xs mr-auto" style={{ color: "var(--text-3)" }}>
                    {fill(t("vfx.api.needValue"), { names: missing.join(", ") })}
                  </span>
                )}
                <Button size="md" variant="primary" loading={busy} disabled={missing.length > 0} onClick={() => load()}>
                  {t("vfx.api.load")}
                </Button>
              </div>
            </div>
          )}

          {err ? <AccessNotice error={err} form={method.group} /> : null}

          {res && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <StatusDot color={PROBE_TONE[st === "needs_input" ? "needs" : st] || C_NONE}
                label={t(`vfx.st.${st === "needs_input" ? "needs" : st}`)} />
              {["ok", "empty"].includes(st) && (
                <span style={{ color: "var(--text-3)" }}>
                  {fill(t("vfx.api.shown"), { n: num(rows.length) })}{res.next_cursor ? ` · ${t("vfx.api.more")}` : ""}
                  {res.ms != null ? ` · ${(res.ms / 1000).toFixed(1)} ${t("vfx.sec")}` : ""}
                </span>
              )}
              {res.error && <span className="truncate max-w-[480px]" style={{ color: C_BAD }} title={res.error}>{res.error}</span>}
            </div>
          )}

          {res && !["ok", "empty", "needs_input"].includes(st) && (
            <AccessNotice error={{ code: st, message: res.error }} form={method.group} />
          )}

          {busy && !rows.length ? (
            <p className="text-xs py-6 text-center" style={{ color: "var(--text-3)" }}>{t("vfx.loadingVfx")}</p>
          ) : rows.length > 0 ? (
            <RawView rows={rows} maxHeight="50vh" />
          ) : null}

          {res?.next_cursor && (
            <div className="flex justify-center">
              <Button size="md" variant="secondary" loading={busy} onClick={() => load(res.next_cursor)}>
                {t("vfx.api.nextPage")}
              </Button>
            </div>
          )}

          {fields.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer select-none" style={{ color: "var(--text-2)" }}>
                {fill(t("vfx.api.fieldsN"), { n: fields.length })}
              </summary>
              <div className="flex flex-wrap gap-1 mt-2">
                {fields.map((f) => (
                  <span key={f} className="font-mono text-[11px] px-1.5 py-0.5 rounded-md"
                    style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>{f}</span>
                ))}
              </div>
            </details>
          )}

          {res?.body && (
            <details className="text-xs">
              <summary className="cursor-pointer select-none" style={{ color: "var(--text-2)" }}>{t("vfx.api.request")}</summary>
              <pre className="mt-2 rounded-lg p-2 font-mono text-[11px] overflow-auto"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                {`POST ${method.key}\n${JSON.stringify(res.body, null, 2)}`}
              </pre>
            </details>
          )}
        </>
      )}
    </Modal>
  );
}
