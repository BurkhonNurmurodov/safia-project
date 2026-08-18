// What the ARC API says it will give us, and under which parameters.
//
// IT's answer to «we see too few tickets» was that we filter wrongly. This
// panel is how that claim gets settled without a terminal: the backend probes
// the API (services/arc_discovery.py) and this renders the measurement —
// every parameter the API declares, what each one did to the reported total,
// which combination the sync now sends, and how our own row count compares.
//
// Admin-only, like the endpoints behind it.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radar, RefreshCw, ArrowDownUp, ListTree, SlidersHorizontal, KeyRound, FileWarning, Boxes } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { hexA, C_DONE, C_OVERDUE, C_GREY } from "../../utils/arcStatus";

const num = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU"));
const tplStr = (s, vars) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-xl px-3 py-2 min-w-0" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="text-base font-bold tabular-nums" style={{ color: tone || "var(--text-1)" }}>{value}</div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>
        <Icon size={12} />{title}
      </div>
      {children}
    </div>
  );
}

// A value as the API would receive it — `true`, `"2000-01-01"`, `3650`.
const showVal = (v) => (typeof v === "string" ? `"${v}"` : String(v));

export default function ApiPanel({ open, onClose, sync, onProbed }) {
  const { t } = useLang();
  const qc = useQueryClient();

  const probeQ = useQuery({
    queryKey: ["arc-probe"],
    queryFn: () => api.get("/api/arc/probe").then((r) => r.data),
    enabled: open,
  });
  const data = probeQ.data;
  const report = data?.report;

  const probeMut = useMutation({
    mutationFn: () => api.post("/api/arc/probe").then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arc-probe"] });
      qc.invalidateQueries({ queryKey: ["arc-meta"] });
      onProbed?.();
    },
  });

  const filters = data?.filters || report?.filters || null;
  const filterKeys = filters ? Object.keys(filters) : [];
  // The API's own count under the widest parameters we found, against ours.
  const apiTotal = report?.combined_total ?? report?.baseline_total ?? sync?.remote_total;
  const ours = sync?.row_count ?? 0;
  const gap = apiTotal != null ? apiTotal - ours : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Radar size={18} />}
      title={t("arc.api.title")}
      subtitle={t("arc.api.subtitle")}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("arc.close")}</Button>
          <Button loading={probeMut.isPending} icon={<RefreshCw size={14} />} onClick={() => probeMut.mutate()}>
            {t("arc.api.remeasure")}
          </Button>
        </>
      )}
    >
      {probeQ.isLoading ? (
        <>
          <SkeletonBlock className="h-16 w-full" />
          <SkeletonBlock className="h-32 w-full" />
        </>
      ) : (
        <>
          {probeMut.isError && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: hexA(C_OVERDUE, 0.1), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.33)}` }}>
              {probeMut.error?.response?.data?.detail || probeMut.error?.message}
            </div>
          )}

          {/* the whole question in three numbers */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label={t("arc.api.apiTotal")} value={num(apiTotal)} />
            <Stat label={t("arc.api.ourTotal")} value={num(ours)} />
            <Stat label={t("arc.api.gap")} value={gap == null ? "—" : num(gap)}
              tone={gap == null ? null : gap > 0 ? C_OVERDUE : C_DONE} />
          </div>

          {!report ? (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("arc.api.neverProbed")}</p>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {t("arc.api.measuredAt")}: {data?.at ? new Date(data.at).toLocaleString("ru-RU") : "—"}
              {report.baseline_total != null && report.combined_total != null &&
                ` · ${t("arc.api.defaults")}: ${num(report.baseline_total)} → ${num(report.combined_total)}`}
            </p>
          )}

          {/* what the walk sends now */}
          <Section icon={SlidersHorizontal} title={t("arc.api.activeFilters")}>
            {filterKeys.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("arc.api.noFilters")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filterKeys.map((k) => (
                  <span key={k} className="text-[11px] rounded-md px-2 py-0.5 font-mono"
                    style={{ background: hexA(C_DONE, 0.12), color: C_DONE, border: `1px solid ${hexA(C_DONE, 0.4)}` }}>
                    {k}={showVal(filters[k])}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* every parameter the API declares — the answer to «which filters exist» */}
          <Section icon={ListTree} title={t("arc.api.params")}>
            {!data?.params?.length ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                {data?.spec_available ? t("arc.api.noParams") : t("arc.api.noSpec")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ color: "var(--text-2)" }}>
                  <thead>
                    <tr style={{ color: "var(--text-4)" }}>
                      <th className="text-left font-medium px-2 py-1">{t("arc.api.cParam")}</th>
                      <th className="text-left font-medium px-2 py-1">{t("arc.api.cType")}</th>
                      <th className="text-left font-medium px-2 py-1">{t("arc.api.cDefault")}</th>
                      <th className="text-left font-medium px-2 py-1">{t("arc.api.cValues")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.params.map((p) => (
                      <tr key={p.name} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-2 py-1 font-mono" style={{ color: "var(--text-1)" }}>{p.name}</td>
                        <td className="px-2 py-1">{p.type || "—"}{p.format ? ` (${p.format})` : ""}</td>
                        <td className="px-2 py-1 font-mono">{p.default == null ? "—" : showVal(p.default)}</td>
                        <td className="px-2 py-1 font-mono break-all">{p.enum ? p.enum.join(" · ") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* what each value DID — the measurement itself */}
          {report?.trials?.length > 0 && (
            <Section icon={ArrowDownUp} title={t("arc.api.trials")}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ color: "var(--text-2)" }}>
                  <tbody>
                    {report.trials.map((tr, i) => {
                      const d = tr.delta;
                      const tone = !tr.ok ? C_GREY : d > 0 ? C_DONE : d < 0 ? C_OVERDUE : "var(--text-3)";
                      return (
                        <tr key={`${tr.param}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                          <td className="px-2 py-1 font-mono" style={{ color: "var(--text-1)" }}>
                            {tr.param}={showVal(tr.value)}
                          </td>
                          <td className="px-2 py-1 tabular-nums text-right">{num(tr.total)}</td>
                          <td className="px-2 py-1 tabular-nums text-right font-semibold" style={{ color: tone }}>
                            {!tr.ok ? t("arc.api.rejected") : d > 0 ? `+${num(d)}` : d < 0 ? num(d) : "±0"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* why the API document never arrived — a status per path beats
              «it didn't work» */}
          {!data?.spec_available && report?.spec_attempts?.length > 0 && (
            <Section icon={FileWarning} title={t("arc.api.specWhy")}>
              <div className="text-[11px] font-mono space-y-0.5">
                {report.spec_attempts.map((a) => (
                  <div key={a.path} className="flex gap-2 min-w-0">
                    <span className="truncate" style={{ color: "var(--text-2)" }}>{a.path}</span>
                    <span className="flex-shrink-0" style={{ color: a.ok ? C_DONE : C_OVERDUE }}>
                      {a.ok ? "ok" : (a.error || "—")}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* parameters proven real by the 422 oracle (no spec needed) */}
          {report?.oracle?.length > 0 && (
            <Section icon={ListTree} title={t("arc.api.oracle")}>
              {report.oracle.some((o) => o.exists) ? (
                <div className="flex flex-wrap gap-1.5">
                  {report.oracle.filter((o) => o.exists).map((o) => (
                    <span key={o.param} className="text-[11px] rounded-md px-2 py-0.5 font-mono"
                      style={{ background: hexA(C_DONE, 0.12), color: C_DONE, border: `1px solid ${hexA(C_DONE, 0.4)}` }}>
                      {o.param}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  {tplStr(t("arc.api.oracleNone"), { n: report.oracle.length })}
                </p>
              )}
            </Section>
          )}

          {/* what this account IS, according to the API's own token */}
          {report?.token?.ok && (
            <Section icon={KeyRound} title={t("arc.api.token")}>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(report.token.values || {}).map(([k, v]) => (
                  <span key={k} className="text-[11px] rounded-md px-2 py-0.5 font-mono"
                    style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
                    {k}={String(v)}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* fields the API sends that we throw away */}
          {report?.unknown_fields?.length > 0 && (
            <Section icon={Boxes} title={t("arc.api.unknownFields")}>
              <p className="text-[11px] font-mono" style={{ color: "var(--text-2)" }}>
                {report.unknown_fields.join(", ")}
              </p>
            </Section>
          )}

          {/* other endpoints — knocked on directly when there is no spec */}
          {report?.extras && Object.keys(report.extras).length > 0 && (
            <Section icon={Boxes} title={t("arc.api.otherEndpoints")}>
              <div className="text-[11px] font-mono space-y-0.5 max-h-40 overflow-y-auto">
                {Object.entries(report.extras).map(([path, r]) => (
                  <div key={path} className="flex gap-2 min-w-0">
                    <span className="truncate" style={{ color: "var(--text-2)" }}>{path}</span>
                    <span className="flex-shrink-0" style={{ color: r?.ok ? C_DONE : C_GREY }}>
                      {r?.ok ? `${r.kind}${r.total != null ? ` · ${num(r.total)}` : ""}` : (r?.error || "—")}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* endpoints we do not call yet */}
          {report?.paths?.length > 0 && (
            <Section icon={ListTree} title={t("arc.api.endpoints")}>
              <div className="text-[11px] font-mono space-y-0.5 max-h-40 overflow-y-auto">
                {report.paths.map((p) => (
                  <div key={`${p.method}-${p.path}`} className="flex gap-2 min-w-0">
                    <span className="flex-shrink-0" style={{ color: "var(--text-4)" }}>{p.method}</span>
                    <span className="truncate" style={{ color: "var(--text-2)" }}>{p.path}</span>
                    {p.params > 0 && <span className="flex-shrink-0" style={{ color: "var(--text-4)" }}>· {p.params}p</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </Modal>
  );
}
