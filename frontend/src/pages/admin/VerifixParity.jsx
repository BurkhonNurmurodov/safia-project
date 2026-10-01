import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GitCompareArrows, CheckCircle2, AlertTriangle, Loader2, Info } from "lucide-react";
import api from "../../utils/api";
import Button from "../../components/ui/Button";
import DateRangePicker from "../../components/ui/DateRangePicker";
import TableCard, { SectionHead, Th } from "../../components/ui/DataTable";

/**
 * «Fayllar bilan solishtirish» — Verifix against the uploaded Excel.
 *
 * The check that decides whether the daily «Davomat» upload can be dropped
 * (memory: verifix-api-integration): for a few past days, who came, in which
 * cell, at what clock and for how many hours — the API's answer next to the
 * file's. All the arithmetic is the server's (`services/verifix_parity.py`);
 * this only lays the counts out. Which time kinds add up to «Отработано» is
 * FOUND there, and shown here with its runners-up.
 */

export const fill = (s, p = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));

export const fmtAt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fmtDay = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");
const pct = (a, b) => (b ? `${Math.round((100 * (a || 0)) / b)}%` : "—");
const n0 = (v) => (v || 0).toLocaleString("ru-RU").replace(/,/g, " ");
const spanDays = (a, b) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1 : 0);

// One figure over its base: «1 082 / 1 103 · 98%».
function Ratio({ a, b }) {
  return (
    <span className="tabular-nums">
      {n0(a)}
      <span style={{ color: "var(--text-4)" }}> / {n0(b)}</span>
      <span className="ml-1.5" style={{ color: "var(--text-3)" }}>{pct(a, b)}</span>
    </span>
  );
}

function Formula({ h, t, tx }) {
  const kinds = (h.kinds || []).map((k) => tx(k.name) || `#${k.id}`).join(" + ");
  return (
    <span>
      <span className="font-medium" style={{ color: "var(--text-1)" }}>{kinds || "—"}</span>
      <span style={{ color: "var(--text-3)" }}> · {t(`verifix.p.unit.${h.unit}`)}</span>
    </span>
  );
}

export default function VerifixParity({ data, qk, configured, dirty, t, tx }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(data.parity_default?.[0] || "");
  const [to, setTo] = useState(data.parity_default?.[1] || "");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  const maxDays = data.parity_max_days || 7;
  const span = spanDays(from, to);
  const tooLong = span > maxDays;

  const run = useMutation({
    mutationFn: () => api.post("/api/admin/verifix/parity", { date_from: from, date_to: to }).then((r) => r.data),
    onSuccess: (res) => {
      setErr(null);
      setResult(res);
      qc.setQueryData(qk, (old) => (old ? { ...old, last_parity: res } : old));
    },
    onError: (e) => setErr(e?.response?.data?.detail || String(e?.message || e)),
  });

  const shown = result || data.last_parity || null;
  const verdict = shown?.verdict;
  const vColor = verdict === "ok" ? "#22c55e" : verdict === "partial" || verdict === "no_files" ? "#eab308" : "#ef4444";
  const pick = (...keys) => keys.map((k) => [k, t(k)]).find(([k, v]) => v !== k)?.[1];
  const vText = verdict && pick(`verifix.p.v.${verdict}`, `verifix.v.${verdict}`, `verifix.e.${verdict}`, "verifix.e.other");

  const days = shown?.days || [];
  const tot = shown?.totals || {};
  const h = shown?.hours;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={GitCompareArrows} title={t("verifix.p.title")} />
        <div className="p-4 sm:p-5 space-y-3">
          <p className="text-[13px] leading-relaxed flex gap-2" style={{ color: "var(--text-3)" }}>
            <Info size={15} className="mt-0.5 flex-shrink-0" />
            <span>{t("verifix.p.explain")}</span>
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangePicker dateFrom={from} dateTo={to} setDateFrom={setFrom} setDateTo={setTo}
              max={data.parity_max} compactLabel triggerClassName="px-3 py-2 text-sm" />
            <Button size="lg" variant="primary" loading={run.isPending}
              disabled={!configured || dirty || tooLong || !from || !to || run.isPending}
              onClick={() => { setErr(null); run.mutate(); }}>
              {t("verifix.p.run")}
            </Button>
          </div>
          <div className="text-xs" style={{ color: tooLong || err ? "#ef4444" : "var(--text-3)" }}>
            {run.isPending ? (
              <span className="flex items-center gap-2" style={{ color: "var(--text-3)" }}>
                <Loader2 size={14} className="animate-spin" /> {t("verifix.p.running")}
              </span>
            ) : err ? err
              : tooLong ? fill(t("verifix.p.maxDays"), { n: maxDays })
              : dirty ? t("verifix.saveFirst")
              : !configured ? t("verifix.v.not_configured")
              : t("verifix.p.method")}
          </div>

          {shown && !run.isPending && (
            <div className="rounded-xl px-3 py-2.5 text-sm flex items-start gap-2"
              style={{ background: `${vColor}14`, border: `1px solid ${vColor}55`, color: "var(--text-1)" }}>
              {verdict === "ok"
                ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: vColor }} />
                : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: vColor }} />}
              <div className="min-w-0">
                <div>
                  {fill(t("verifix.p.range"), { from: fmtDay(shown.from), to: fmtDay(shown.to) })}
                  {" · "}{vText}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                  {fill(t("verifix.lastRun"), {
                    at: fmtAt(shown.at), by: shown.by || "—",
                    s: Math.max(1, Math.round((shown.ms || 0) / 1000)),
                  })}
                  {shown.message ? ` · ${shown.message}` : ""}
                </div>
              </div>
            </div>
          )}
        </div>

        {shown && !run.isPending && days.length > 0 && (
          <div className="px-4 sm:px-5 pb-4 space-y-1.5" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="pt-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
              {t("verifix.p.hoursTitle")}
            </div>
            {h ? (
              <>
                <div className="text-sm"><Formula h={h} t={t} tx={tx} /></div>
                <div className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
                  {fill(t("verifix.p.hoursFit"), {
                    exact: n0(h.exact), pe: pct(h.exact, h.n),
                    close: n0(h.close), pc: pct(h.close, h.n),
                    mae: h.mae ?? "—", n: n0(h.n),
                  })}
                </div>
                {(h.alternatives?.length > 0 || h.searched?.length > 0) && (
                  <details>
                    <summary className="text-xs cursor-pointer" style={{ color: "var(--text-3)" }}>
                      {t("verifix.p.alts")}
                    </summary>
                    <ul className="mt-1 space-y-1 text-xs" style={{ color: "var(--text-2)" }}>
                      {(h.alternatives || []).map((a, i) => (
                        <li key={i}>
                          <Formula h={a} t={t} tx={tx} />
                          <span className="tabular-nums" style={{ color: "var(--text-3)" }}>
                            {" — "}{pct(a.exact, a.n)} · ±6: {pct(a.close, a.n)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {h.searched?.length > 0 && (
                      <div className="mt-2 text-xs" style={{ color: "var(--text-3)" }}>
                        {t("verifix.p.searched")}:{" "}
                        {h.searched.map((k) => `${tx(k.name) || `#${k.id}`} (${n0(k.n)})`).join(" · ")}
                      </div>
                    )}
                  </details>
                )}
              </>
            ) : (
              <div className="text-xs" style={{ color: "var(--text-3)" }}>{t("verifix.p.hoursNone")}</div>
            )}
          </div>
        )}
      </div>

      {shown && !run.isPending && days.length > 0 && (
        <TableCard icon={GitCompareArrows} title={t("verifix.p.daysTitle")} minWidth={980}>
          <thead>
            <tr>
              <Th label={t("verifix.p.c.date")} />
              <Th label={t("verifix.p.c.fileCame")} align="right" />
              <Th label={t("verifix.p.c.apiCame")} align="right" />
              <Th label={t("verifix.p.c.matched")} align="right" />
              <Th label={t("verifix.p.c.onlyFile")} align="right" />
              <Th label={t("verifix.p.c.onlyApi")} align="right" />
              <Th label={t("verifix.p.c.sameCell")} align="right" />
              <Th label={t("verifix.p.c.clock")} align="right" />
              <Th label={t("verifix.p.c.hours")} align="right" />
            </tr>
          </thead>
          <tbody>
            {[...days, { date: "total", file: true, ...tot }].map((d) => {
              const isTotal = d.date === "total";
              return (
                <tr key={d.date} style={isTotal ? { background: "var(--bg-inner)", fontWeight: 600 } : undefined}>
                  <td className="px-3 py-2 tabular-nums">{isTotal ? t("verifix.p.total") : fmtDay(d.date)}</td>
                  {!d.file ? (
                    <td colSpan={8} className="px-3 py-2" style={{ color: "var(--text-3)" }}>{t("verifix.p.noFile")}</td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right tabular-nums">{n0(d.file_came)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{n0(d.api_came)}</td>
                      <td className="px-3 py-2 text-right"><Ratio a={d.matched} b={d.file_rows} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {n0(d.only_file)}
                        <span className="ml-1.5" style={{ color: "var(--text-3)" }}>
                          ({fill(t("verifix.p.cameOf"), { n: n0(d.only_file_came) })})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {n0(d.only_api)}
                        <span className="ml-1.5" style={{ color: "var(--text-3)" }}>
                          ({fill(t("verifix.p.cameOf"), { n: n0(d.only_api_came) })})
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right"><Ratio a={d.same_cell} b={d.matched} /></td>
                      <td className="px-3 py-2 text-right"><Ratio a={d.clock_same} b={d.clock_n} /></td>
                      <td className="px-3 py-2 text-right"><Ratio a={d.hours_exact} b={d.hours_n} /></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}

      {shown && !run.isPending && days.length > 0 && (
        <>
          {(tot.api_came_other_cells > 0 || tot.skipped > 0) && (
            <div className="text-xs space-y-1 px-1" style={{ color: "var(--text-3)" }}>
              {tot.api_came_other_cells > 0 && (
                <div>{fill(t("verifix.p.otherCells"), { n: n0(tot.api_came_other_cells) })}</div>
              )}
              {shown.uncovered?.length > 0 && (
                <details>
                  <summary className="cursor-pointer">
                    {fill(t("verifix.p.uncoveredList"), { n: n0(shown.uncovered_cells) })}
                  </summary>
                  <ul className="mt-1 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0.5" style={{ color: "var(--text-2)" }}>
                    {shown.uncovered.map((u) => (
                      <li key={u.code} className="tabular-nums">
                        <span className="font-mono">{u.code}</span>
                        {" · "}{fill(t("verifix.p.people"), { n: n0(u.api) })}
                        <span style={{ color: "var(--text-3)" }}>
                          {" · "}{u.last_file
                            ? fill(t("verifix.p.lastFile"), { date: fmtDay(u.last_file) })
                            : t("verifix.p.neverFile")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {tot.skipped > 0 && <div>{fill(t("verifix.p.skipped"), { n: n0(tot.skipped) })}</div>}
            </div>
          )}
          <TableCard icon={GitCompareArrows} title={t("verifix.p.cellsTitle")}
            right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
              {fill(t("verifix.p.cellsSub"), { differ: n0(shown.cells_differ), total: n0(shown.cells_total) })}
            </span>}>
            <thead>
              <tr>
                <Th label={t("verifix.p.c.cell")} />
                <Th label={t("verifix.p.c.fileCame")} align="right" />
                <Th label={t("verifix.p.c.apiCame")} align="right" />
                <Th label={t("verifix.p.c.diff")} align="right" />
              </tr>
            </thead>
            <tbody>
              {(shown.cells || []).filter((c) => c.diff).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center" style={{ color: "var(--text-3)" }}>
                    {t("verifix.p.cellsNone")}
                  </td>
                </tr>
              ) : (shown.cells || []).filter((c) => c.diff).map((c) => (
                <tr key={c.code}>
                  <td className="px-3 py-2 font-mono tabular-nums">{c.code}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n0(c.file)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n0(c.api)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {c.diff > 0 ? `+${n0(c.diff)}` : `−${n0(-c.diff)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </TableCard>
        </>
      )}
    </div>
  );
}
