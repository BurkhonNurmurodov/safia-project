import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanSearch, PlugZap, CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useLeaveGuard } from "../../hooks/useLeaveGuard";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import TableCard, { SectionHead, Th } from "../../components/ui/DataTable";
import CellLink from "../../components/ui/CellLink";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { fill, fmtAt } from "./VerifixParity";

/**
 * «Tasker» — the connection to the Service Desk «Задачник (фабрика)» API
 * (docs/tasker.md). Phase 1: the token and a connection TEST that counts what
 * the API returns for yesterday and suggests which of its departments name one
 * of our cells. Nothing here scores anything — task 4 stays a screenshot.
 *
 * The token is stored sealed and SHOWN here in plain text — the operator's call
 * (2026-11-12): a masked token can't be checked against the one Tasker issued.
 * Admin-only and never grantable (no capKey in ADMIN_NAV), like the Verifix card.
 */

const QK = ["admin-tasker"];
const STEPS = ["departments", "daily", "checklists"];
const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };
const toneOf = (v) => (v === "ok" ? "#22c55e" : v === "partial" || v === "no_departments" ? "#eab308"
  : v === "no_token" ? "#94a3b8" : "#ef4444");
const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(2).replace(/\.?0+$/, "")}%`);

function StepRow({ s, t, tx }) {
  // A step's own wording for its error, then a generic line.
  const pick = (...keys) => keys.map((k) => [k, t(k)]).find(([k, v]) => v !== k)?.[1];
  let figures = "";
  if (s.ok && s.key === "departments") figures = fill(t("tasker.f.departments"), { total: s.total, matched: s.matched });
  if (s.ok && s.key === "daily") {
    figures = fill(t("tasker.f.daily"), { n: s.with_value, rev: s.revisions, avg: pct(s.avg), min: pct(s.min) });
  }
  if (s.ok && s.key === "checklists") figures = fill(t("tasker.f.count"), { n: s.total });
  const Icon = s.ok ? CheckCircle2 : XCircle;
  const color = s.ok ? "#22c55e" : "#ef4444";
  const lists = s.ok && s.key === "checklists" ? [["types", s.types], ["obxod", s.obxod]] : [];
  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
      <Icon size={16} className="mt-0.5 flex-shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{t(`tasker.s.${s.key}`)}</span>
          {s.ok && <span className="text-sm tabular-nums" style={{ color: "var(--text-2)" }}>{figures}</span>}
        </div>
        {!s.ok && (
          <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
            {fill(pick(`tasker.e.${s.code}`, "tasker.e.other"), { s: s.retry_after || "60" })}
            {(s.status || s.message) && (
              <span className="block mt-0.5 font-mono break-words" style={{ color: "var(--text-3)" }}>
                {[s.status, s.message].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        )}
        {lists.map(([key, items]) => (
          <details key={key} className="mt-1">
            <summary className="text-xs cursor-pointer" style={{ color: "var(--text-3)" }}>
              {fill(t(`tasker.${key}`), { n: items?.length || 0 })}
            </summary>
            {items?.length > 0 ? (
              <ul className="mt-1 text-xs space-y-0.5" style={{ color: "var(--text-2)" }}>
                {items.map((it) => (
                  <li key={it.name} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate" title={tx(it.name)}>{tx(it.name)}</span>
                    <span className="tabular-nums flex-shrink-0">{it.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>{t("tasker.none")}</div>
            )}
          </details>
        ))}
      </div>
    </li>
  );
}

export default function TaskerSettings() {
  const { t } = useLang();
  const { tx } = useTranslit();
  const qc = useQueryClient();
  const { show: toast, node: toastNode } = useToast({ position: "bottom" });

  const { data, isLoading } = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/admin/tasker").then((r) => r.data),
  });

  // Both fields show what is stored until edited (null = untouched).
  const [baseDraft, setBase] = useState(null);
  const base = baseDraft ?? (data?.base || data?.default_base || "");
  const [tokenDraft, setToken] = useState(null);
  const token = tokenDraft ?? (data?.token || "");
  const [result, setResult] = useState(null);

  const tokenEdited = !!data && token.trim() !== (data.token || "");
  const dirty = !!data && ((base.trim() || data.default_base) !== (data.base || data.default_base) || tokenEdited);
  useLeaveGuard(dirty);

  const err = (e) => e?.response?.data?.detail || String(e?.message || e);
  const afterSave = (res, msg) => {
    setBase(null);
    setToken(null);
    setResult(null);
    qc.setQueryData(QK, res);
    toast(msg, "success");
  };
  const save = useMutation({
    mutationFn: (body) => api.put("/api/admin/tasker", body).then((r) => r.data),
    onSuccess: (res) => afterSave(res, t("tasker.saved")),
    onError: (e) => toast(err(e), "error"),
  });
  const test = useMutation({
    mutationFn: () => api.post("/api/admin/tasker/test").then((r) => r.data),
    onSuccess: (res) => {
      setResult(res);
      qc.setQueryData(QK, (old) => (old ? { ...old, last_test: res } : old));
    },
    onError: (e) => toast(err(e), "error"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-64 rounded-2xl" />
        <SkeletonBlock className="h-40 rounded-2xl" />
      </div>
    );
  }

  const configured = data.token_set && data.token_readable !== false;
  const shown = result || data.last_test || null;
  const byKey = Object.fromEntries((shown?.steps || []).map((s) => [s.key, s]));
  const steps = STEPS.map((k) => byKey[k]).filter(Boolean);
  const deps = shown?.departments || [];
  const verdict = shown?.verdict;
  const vColor = toneOf(verdict);
  const vText = t(`tasker.v.${verdict}`) !== `tasker.v.${verdict}` ? t(`tasker.v.${verdict}`) : t("tasker.v.partial");

  return (
    <div className="space-y-4">
      {/* ── the connection ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={ScanSearch} title={t("tasker.title")} />
        <div className="p-4 sm:p-5 space-y-4">
          <p className="text-[13px] leading-relaxed flex gap-2" style={{ color: "var(--text-3)" }}>
            <Info size={15} className="mt-0.5 flex-shrink-0" />
            <span>{t("tasker.explain")}</span>
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label={t("tasker.token")} required
              hint={data.token_readable === false ? undefined : t("tasker.tokenHint")}
              error={data.token_readable === false ? t("tasker.tokenUnreadable") : undefined}>
              <input value={token} onChange={(e) => setToken(e.target.value)}
                autoComplete="off" spellCheck={false} placeholder="tsk_…"
                className={`${inputCls} font-mono`} style={inputStyle} />
            </FormField>
            <FormField label={t("tasker.base")} hint={t("tasker.baseHint")}>
              <input value={base} onChange={(e) => setBase(e.target.value)}
                autoComplete="off" spellCheck={false} placeholder={data.default_base}
                className={`${inputCls} font-mono`} style={inputStyle} />
            </FormField>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="lg" variant="primary" loading={save.isPending} disabled={!dirty}
              onClick={() => save.mutate({
                base: base.trim(),
                // An emptied field removes the stored token.
                ...(tokenEdited ? (token.trim() ? { token: token.trim() } : { clear_token: true }) : {}),
              })}>
              {t("tasker.save")}
            </Button>
          </div>
        </div>
      </div>

      {/* ── the test ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={PlugZap} title={t("tasker.testTitle")}
          right={(
            <Button size="md" variant="secondary" loading={test.isPending}
              disabled={!configured || dirty || test.isPending} onClick={() => test.mutate()}>
              {t("tasker.test")}
            </Button>
          )} />
        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
          {test.isPending ? (
            <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t("tasker.testing")}</span>
          ) : dirty ? t("tasker.saveFirst") : !configured ? t("tasker.v.no_token") : t("tasker.testHint")}
        </div>
        {shown && !test.isPending && (
          <>
            <div className="mx-4 mb-3 rounded-xl px-3 py-2.5 text-sm flex items-start gap-2"
              style={{ background: `${vColor}14`, border: `1px solid ${vColor}55`, color: "var(--text-1)" }}>
              {verdict === "ok"
                ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: vColor }} />
                : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: vColor }} />}
              <div className="min-w-0">
                <div>{vText}</div>
                <div className="text-xs mt-0.5 break-words" style={{ color: "var(--text-3)" }}>
                  {fill(t("tasker.lastRun"), {
                    at: fmtAt(shown.at), by: shown.by || "—", day: shown.day || "—",
                    s: Math.max(1, Math.round((shown.ms || 0) / 1000)),
                  })}
                  {shown.base ? ` · ${shown.base}` : ""}
                </div>
              </div>
            </div>
            {steps.length > 0 && <ul className="pb-1">{steps.map((s) => <StepRow key={s.key} s={s} t={t} tx={tx} />)}</ul>}
          </>
        )}
        {!shown && !test.isPending && configured && !dirty && (
          <div className="px-4 pb-4 text-xs" style={{ color: "var(--text-3)" }}>{t("tasker.never")}</div>
        )}
      </div>

      {/* ── departments ↔ our cells (suggested by code, never scored) ──── */}
      {deps.length > 0 && !test.isPending && (
        <TableCard icon={ScanSearch} title={t("tasker.deps")} subtitle={t("tasker.depsHint")} headSize="lg"
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{deps.length}</span>}>
          <thead>
            <tr>
              <Th label={t("tasker.col.dept")} />
              <Th label={t("tasker.col.cell")} />
              <Th label={fill(t("tasker.col.value"), { day: shown.day || "" })} align="right" />
              <Th label={t("tasker.col.revisions")} align="right" />
              <Th label={t("tasker.col.checklists")} align="right" />
            </tr>
          </thead>
          <tbody>
            {deps.map((d) => (
              <tr key={d.id}>
                <td className="px-3 py-2 max-w-[320px] truncate" title={tx(d.name)}>{tx(d.name)}</td>
                <td className="px-3 py-2 font-mono">
                  {d.cell ? <CellLink id={d.cell_id}>{d.cell}</CellLink>
                    : <span style={{ color: "var(--text-3)" }}>{t("tasker.unmatched")}</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(d.value)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.revisions ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.checklists ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {toastNode}
    </div>
  );
}
