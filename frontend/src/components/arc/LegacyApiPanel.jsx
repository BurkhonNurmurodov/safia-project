// What ARC's OLD login API (page /arc-legacy) says it will give us, and under
// which parameters — and which ATTRIBUTES it sends.
//
// IT's answer to «we see too few tickets» was that we filter wrongly. This
// panel is how that claim gets settled without a terminal: the backend probes
// the API (services/arc_legacy_discovery.py) and this renders the measurement —
// every parameter the API declares, what each one did to the reported total,
// which combination the sync now sends, and how our own row count compares.
//
// The attribute section answers the other question — «is the API sending
// anything new?» — off EVERY stored ticket's full payload (GET /fields), not
// one sample item.
//
// Admin-only, like the endpoints behind it.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radar, RefreshCw, ArrowDownUp, ListTree, SlidersHorizontal, KeyRound, FileWarning, Boxes, Braces, CheckCircle2, ChevronDown } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { hexA, C_DONE, C_DOING, C_OVERDUE, C_GREY } from "../../utils/arcStatusLegacy";

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

// A probe error arrives as «ARC 401 on /arc/openapi.json: {"detail":"…"}», and a
// missing route's nginx page as raw HTML. The path already has its own column,
// so one line carries the status and the API's own words; the full text is the
// row's tooltip.
const errText = (err) => {
  const s = String(err || "—");
  const m = s.match(/^ARC (\d{3}) on \S+?: ?([\s\S]*)$/);
  if (!m) return s;
  let body = m[2].trim();
  try {
    const d = JSON.parse(body)?.detail;
    if (typeof d === "string") body = d;
    else if (Array.isArray(d) && d[0]?.msg) body = d[0].msg;
  } catch {
    // The backend keeps 300 characters of a body, so JSON often arrives cut.
    const msg = body.match(/"(?:msg|detail)"\s*:\s*"([^"]*)/)?.[1];
    const title = body.match(/<title>([^<]*)<\/title>/i)?.[1];
    body = (msg || title || body.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  }
  if (!body) return m[1];
  return body.startsWith(m[1]) ? body : `${m[1]} · ${body}`;
};

// One «path → outcome» row. The path keeps its width (up to 60%) and the
// outcome truncates: an unbounded answer beside a shrinkable path used to push
// the path to nothing and the row off the panel's right edge.
function PathRow({ path, text, full, tone }) {
  return (
    <div className="flex gap-2 min-w-0" title={full ? `${path} — ${full}` : path}>
      <span className="flex-shrink-0 max-w-[60%] truncate" style={{ color: "var(--text-2)" }}>{path}</span>
      <span className="min-w-0 truncate" style={{ color: tone }}>{text}</span>
    </div>
  );
}

const day = (iso) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "—");

// One attribute the page does not use: what it is called, how many tickets
// fill it, on tickets created when, and what the newest one holds. The dates
// are the «is it new» half — an attribute IT added last week is filled only on
// last week's tickets.
function ExtraField({ f, kids, tickets, t }) {
  return (
    <div className="rounded-lg px-2.5 py-1.5 space-y-0.5 min-w-0"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="font-mono text-xs font-semibold truncate" style={{ color: "var(--text-1)" }} title={f.path}>{f.path}</span>
        <span className="font-mono text-[10px] flex-shrink-0" style={{ color: "var(--text-4)" }}>{f.types.join(" · ")}</span>
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {f.filled
          ? `${tplStr(t("arcl.api.fieldsFilled"), { f: num(f.filled), c: num(tickets) })} · ${tplStr(t("arcl.api.fieldsSpan"), { from: day(f.first_at), to: day(f.last_at) })}`
          : t("arcl.api.fieldsNever")}
      </div>
      {f.sample && (
        <div className="font-mono text-[11px] truncate" style={{ color: "var(--text-2)" }} title={f.sample}>{f.sample}</div>
      )}
      {kids.length > 0 && (
        <div className="pl-3 pt-0.5 space-y-0.5" style={{ borderLeft: "2px solid var(--border)" }}>
          {kids.map((k) => (
            <div key={k.path} className="flex justify-between gap-2 text-[11px] min-w-0" title={k.path}>
              <span className="font-mono truncate" style={{ color: "var(--text-2)" }}>{k.path}</span>
              <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>{num(k.filled)} / {num(tickets)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldCensus({ q, t }) {
  const [showKnown, setShowKnown] = useState(false);
  if (q.isLoading) return <SkeletonBlock className="h-20 w-full" />;
  if (q.isError) {
    return (
      <div className="rounded-xl px-3 py-2 text-xs" style={{ background: hexA(C_OVERDUE, 0.1), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.33)}` }}>
        {q.error?.response?.data?.detail || q.error?.message}
      </div>
    );
  }
  const d = q.data;
  if (!d?.tickets) return <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("arcl.api.fieldsEmpty")}</p>;

  const fields = d.fields || [];
  const extra = fields.filter((f) => !f.mapped && !f.under_new);
  const kidsOf = (f) => (f.parent == null ? fields.filter((k) => k.under_new && k.parent === f.name) : []);
  const known = fields.filter((f) => f.mapped);
  const pct = (f) => Math.round((f.filled / d.tickets) * 100);

  return (
    <div className="space-y-2">
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {tplStr(t("arcl.api.fieldsScope"), {
          n: num(d.tickets),
          at: d.last_synced ? new Date(d.last_synced).toLocaleString("ru-RU") : "—",
        })}
      </p>

      {extra.length === 0 ? (
        <div className="flex items-start gap-1.5 text-xs" style={{ color: C_DONE }}>
          <CheckCircle2 size={14} className="flex-shrink-0 mt-px" />
          <span>{tplStr(t("arcl.api.fieldsNone"), { k: d.known })}</span>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold" style={{ color: C_DOING }}>
            {tplStr(t("arcl.api.fieldsNew"), { n: extra.length })}
          </p>
          <div className="space-y-1.5">
            {extra.map((f) => <ExtraField key={f.path} f={f} kids={kidsOf(f)} tickets={d.tickets} t={t} />)}
          </div>
        </>
      )}

      {d.gone?.length > 0 && (
        <p className="text-[11px]" style={{ color: C_OVERDUE }}>
          {t("arcl.api.fieldsGone")}: <span className="font-mono">{d.gone.join(", ")}</span>
        </p>
      )}
      {d.truncated && (
        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{tplStr(t("arcl.api.fieldsCut"), { n: fields.length })}</p>
      )}

      {known.length > 0 && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowKnown((v) => !v)}
            icon={<ChevronDown size={12} className={`transition-transform ${showKnown ? "rotate-180" : ""}`} />}>
            {tplStr(t("arcl.api.fieldsKnown"), { n: known.length })}
          </Button>
          {showKnown && (
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 mt-1 px-1">
              {known.map((f) => (
                <div key={f.path} className="flex justify-between gap-2 text-[11px] min-w-0"
                  title={`${num(f.filled)} / ${num(d.tickets)}`}>
                  <span className="font-mono truncate" style={{ color: "var(--text-2)" }}>{f.path}</span>
                  <span className="tabular-nums flex-shrink-0" style={{ color: f.filled ? "var(--text-3)" : C_GREY }}>{pct(f)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LegacyApiPanel({ open, onClose, sync, onProbed }) {
  const { t } = useLang();
  const qc = useQueryClient();

  const probeQ = useQuery({
    queryKey: ["arcl-probe"],
    queryFn: () => api.get("/api/arc-legacy/probe").then((r) => r.data),
    enabled: open,
  });
  const data = probeQ.data;
  const report = data?.report;

  const fieldsQ = useQuery({
    queryKey: ["arcl-fields"],
    queryFn: () => api.get("/api/arc-legacy/fields").then((r) => r.data),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const probeMut = useMutation({
    mutationFn: () => api.post("/api/arc-legacy/probe").then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arcl-probe"] });
      qc.invalidateQueries({ queryKey: ["arcl-meta"] });
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
      title={t("arcl.api.title")}
      subtitle={t("arcl.api.subtitle")}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("arcl.close")}</Button>
          <Button loading={probeMut.isPending} icon={<RefreshCw size={14} />} onClick={() => probeMut.mutate()}>
            {t("arcl.api.remeasure")}
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
            <Stat label={t("arcl.api.apiTotal")} value={num(apiTotal)} />
            <Stat label={t("arcl.api.ourTotal")} value={num(ours)} />
            <Stat label={t("arcl.api.gap")} value={gap == null ? "—" : num(gap)}
              tone={gap == null ? null : gap > 0 ? C_OVERDUE : C_DONE} />
          </div>

          {!report ? (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("arcl.api.neverProbed")}</p>
          ) : (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {t("arcl.api.measuredAt")}: {data?.at ? new Date(data.at).toLocaleString("ru-RU") : "—"}
              {report.baseline_total != null && report.combined_total != null &&
                ` · ${t("arcl.api.defaults")}: ${num(report.baseline_total)} → ${num(report.combined_total)}`}
            </p>
          )}

          {/* every attribute the API sends — over every stored ticket */}
          <Section icon={Braces} title={t("arcl.api.fields")}>
            <FieldCensus q={fieldsQ} t={t} />
          </Section>

          {/* what the walk sends now */}
          <Section icon={SlidersHorizontal} title={t("arcl.api.activeFilters")}>
            {filterKeys.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("arcl.api.noFilters")}</p>
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
          <Section icon={ListTree} title={t("arcl.api.params")}>
            {!data?.params?.length ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                {/* «not fetched yet» is only true before anybody asked; once the
                    probe has tried and been refused, the reason section below
                    is the answer and this line must not promise otherwise. */}
                {data?.spec_available ? t("arcl.api.noParams")
                  : report?.spec_attempts?.length ? t("arcl.api.specRefused") : t("arcl.api.noSpec")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ color: "var(--text-2)" }}>
                  <thead>
                    <tr style={{ color: "var(--text-4)" }}>
                      <th className="text-left font-medium px-2 py-1">{t("arcl.api.cParam")}</th>
                      <th className="text-left font-medium px-2 py-1">{t("arcl.api.cType")}</th>
                      <th className="text-left font-medium px-2 py-1">{t("arcl.api.cDefault")}</th>
                      <th className="text-left font-medium px-2 py-1">{t("arcl.api.cValues")}</th>
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
            <Section icon={ArrowDownUp} title={t("arcl.api.trials")}>
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
                            {!tr.ok ? t("arcl.api.rejected") : d > 0 ? `+${num(d)}` : d < 0 ? num(d) : "±0"}
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
            <Section icon={FileWarning} title={t("arcl.api.specWhy")}>
              <div className="text-[11px] font-mono space-y-0.5">
                {report.spec_attempts.map((a) => (
                  <PathRow key={a.path} path={a.path}
                    text={a.ok ? "ok" : errText(a.error)} full={a.ok ? null : a.error}
                    tone={a.ok ? C_DONE : C_OVERDUE} />
                ))}
              </div>
            </Section>
          )}

          {/* parameters proven real by the 422 oracle (no spec needed) */}
          {report?.oracle?.length > 0 && (
            <Section icon={ListTree} title={t("arcl.api.oracle")}>
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
                  {tplStr(t("arcl.api.oracleNone"), { n: report.oracle.length })}
                </p>
              )}
            </Section>
          )}

          {/* what this account IS, according to the API's own token */}
          {report?.token?.ok && (
            <Section icon={KeyRound} title={t("arcl.api.token")}>
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

          {/* other endpoints — knocked on directly when there is no spec */}
          {report?.extras && Object.keys(report.extras).length > 0 && (
            <Section icon={Boxes} title={t("arcl.api.otherEndpoints")}>
              <div className="text-[11px] font-mono space-y-0.5 max-h-40 overflow-y-auto">
                {Object.entries(report.extras).map(([path, r]) => (
                  <PathRow key={path} path={path}
                    text={r?.ok ? `${r.kind}${r.total != null ? ` · ${num(r.total)}` : ""}` : errText(r?.error)}
                    full={r?.ok ? null : r?.error}
                    tone={r?.ok ? C_DONE : C_GREY} />
                ))}
              </div>
            </Section>
          )}

          {/* endpoints we do not call yet */}
          {report?.paths?.length > 0 && (
            <Section icon={ListTree} title={t("arcl.api.endpoints")}>
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
