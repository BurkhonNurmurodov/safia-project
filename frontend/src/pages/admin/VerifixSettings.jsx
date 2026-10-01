import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Fingerprint, PlugZap, CheckCircle2, XCircle, AlertTriangle, Info, Loader2,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useAdminDirty } from "./AdminPanel";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { SectionHead } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import VerifixParity, { fill, fmtAt } from "./VerifixParity";

/**
 * «Verifix» — the connection the platform will read attendance through.
 *
 * Step one of the Verifix integration (memory: verifix-api-integration): the
 * login of a dedicated, read-only Verifix user, Фабрика's organization id and
 * a connection TEST that logs in and counts what each form hands back. Nothing
 * here moves a number on the platform yet.
 *
 * The password goes in and never comes out — the server says only whether one
 * is stored and whether it still opens, and a blank field keeps it. Everything
 * on the result card is a count: no name or passport ever reaches this page.
 *
 * Admin-only and never grantable (no capKey in ADMIN_NAV): this login reads
 * every employee's attendance.
 */

const QK = ["admin-verifix"];
const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

const STEPS = ["divisions", "employees", "jobs", "schedules", "time_kinds", "locations", "timesheet", "tracks"];

// Verdict → tone. Green only when every form answered and people came back.
const TONE = {
  ok: "#22c55e",
  no_employees: "#eab308",
  partial: "#eab308",
  not_configured: "#94a3b8",
};
const toneOf = (v) => TONE[v] || "#ef4444";


function StepRow({ s, t, tx }) {
  const label = t(`verifix.s.${s.key}`);
  let figures = "";
  let extra = null;
  // Where the people land: by the division Verifix prints on the row, and by
  // the employee's current org unit («отдел») — see `run_test`.
  const placed = (key, p) => fill(t(key), { div: p.div, unit: p.unit ?? "—", came: p.came_unit ?? "—" });
  if (s.ok) {
    if (s.key === "divisions") {
      figures = fill(t("verifix.f.divisions"), {
        total: s.total, code: s.with_code, found: s.cells_found, cells: s.cells,
      });
      if (s.cells_missing_n) {
        extra = fill(t("verifix.f.missing"), {
          n: s.cells_missing_n,
          list: s.cells_missing.join(", ") + (s.cells_missing_n > s.cells_missing.length ? " …" : ""),
        });
      }
    } else if (s.key === "employees") {
      figures = fill(t("verifix.f.employees"), { total: s.total, working: s.working });
      if (s.placed) extra = placed("verifix.f.placed", s.placed);
    } else if (s.key === "timesheet") {
      figures = fill(t("verifix.f.timesheet"), { date: s.date, rows: s.rows, came: s.came })
        + (s.partial ? ` ${t("verifix.f.partial")}` : "");
      if (s.placed) {
        extra = placed("verifix.f.placedCame", s.placed)
          + (s.no_div ? ` · ${fill(t("verifix.f.noDiv"), { n: s.no_div })}` : "");
      }
    } else if (s.key === "tracks") {
      figures = fill(t("verifix.f.tracks"), { n: `${s.first_page}${s.more ? "+" : ""}` });
      if (s.placed) extra = placed("verifix.f.placed", s.placed);
    } else {
      figures = fill(t("verifix.f.count"), { n: s.total });
    }
  }
  const warn = s.ok && ((s.key === "employees" && !s.total) || s.partial);
  const color = !s.ok ? "#ef4444" : warn ? "#eab308" : "#22c55e";
  const Icon = !s.ok ? XCircle : warn ? AlertTriangle : CheckCircle2;
  // A step's own wording first, then the verdict wording for the codes that
  // stop the whole test (rejected login, wrong host…), then a generic line.
  const pick = (...keys) => keys.map((k) => [k, t(k)]).find(([k, v]) => v !== k)?.[1];
  const err = !s.ok
    ? pick(`verifix.e.${s.code}`, `verifix.v.${s.code}`, "verifix.e.other")
    : null;

  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
      <Icon size={16} className="mt-0.5 flex-shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{label}</span>
          {s.ok && (
            <span className="text-sm tabular-nums" style={{ color: "var(--text-2)" }}>{figures}</span>
          )}
        </div>
        {extra && <div className="text-xs mt-1 tabular-nums" style={{ color: "var(--text-3)" }}>{extra}</div>}
        {s.ok && s.key === "timesheet" && s.placed && (
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>{t("verifix.f.placedHint")}</div>
        )}
        {s.ok && s.key === "timesheet" && s.top?.length > 0 && (
          <details className="mt-1">
            <summary className="text-xs cursor-pointer" style={{ color: "var(--text-3)" }}>
              {t("verifix.topDivs")}
            </summary>
            <ul className="mt-1 text-xs space-y-0.5" style={{ color: "var(--text-2)" }}>
              {s.top.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {d.code && <span className="font-mono" style={{ color: "var(--text-4)" }}>{d.code} · </span>}
                    {tx(d.name) || `#${d.id}`}
                    {d.cell && (
                      <span className="ml-1.5 px-1.5 py-px rounded text-[10px]"
                        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                        {t("verifix.isCell")}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums flex-shrink-0">{d.n}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {err && (
          <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
            {err}
            {(s.status || s.message) && (
              <span className="block mt-0.5 font-mono break-words" style={{ color: "var(--text-4)" }}>
                {[s.status, s.message].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
        )}
        {s.ok && s.key === "time_kinds" && s.kinds?.length > 0 && (
          <details className="mt-1">
            <summary className="text-xs cursor-pointer" style={{ color: "var(--text-3)" }}>
              {t("verifix.kinds")}
            </summary>
            <ul className="mt-1 text-xs grid sm:grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: "var(--text-2)" }}>
              {s.kinds.map((k) => (
                <li key={k.id} className="tabular-nums">
                  <span className="font-mono" style={{ color: "var(--text-4)" }}>{k.id}</span>
                  {" · "}{k.name}{k.letter ? ` (${k.letter})` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

export default function VerifixSettings() {
  const { t } = useLang();
  const { tx } = useTranslit();
  const qc = useQueryClient();
  const { show: toast, node: toastNode } = useToast({ position: "bottom" });

  const { data, isLoading } = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/admin/verifix").then((r) => r.data),
  });

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [filial, setFilial] = useState("");
  const [host, setHost] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [result, setResult] = useState(null);

  // The form starts from what is stored, and goes back to it after a save.
  useEffect(() => {
    if (!data) return;
    setLogin(data.login || "");
    setFilial(data.filial_id || "");
    setHost(data.host || data.default_host || "");
  }, [data]);

  const dirty = !!data && (
    login.trim() !== (data.login || "")
    || filial.trim() !== (data.filial_id || "")
    || (host.trim() || data.default_host) !== (data.host || data.default_host)
    || password.length > 0
  );
  useAdminDirty(dirty);

  const save = useMutation({
    mutationFn: (body) => api.put("/api/admin/verifix", body).then((r) => r.data),
    onSuccess: (res) => {
      setPassword("");
      setResult(null);
      qc.setQueryData(QK, res);
      toast(t("verifix.saved"), "success");
    },
    onError: (e) => toast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  // Clearing has its own mutation so a failure stays INSIDE the dialog that
  // asked for it, as ConfirmDialog's contract requires.
  const [clearErr, setClearErr] = useState(null);
  const clear = useMutation({
    mutationFn: () => api.put("/api/admin/verifix", { clear_password: true }).then((r) => r.data),
    onSuccess: (res) => {
      setPassword("");
      setResult(null);
      setConfirmClear(false);
      qc.setQueryData(QK, res);
      toast(t("verifix.cleared"), "success");
    },
    onError: (e) => setClearErr(e?.response?.data?.detail || String(e?.message || e)),
  });

  const test = useMutation({
    mutationFn: () => api.post("/api/admin/verifix/test").then((r) => r.data),
    onSuccess: (res) => {
      setResult(res);
      qc.setQueryData(QK, (old) => (old ? { ...old, last_test: res } : old));
    },
    onError: (e) => toast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  const shown = result || data?.last_test || null;
  const steps = useMemo(() => {
    const byKey = Object.fromEntries((shown?.steps || []).map((s) => [s.key, s]));
    return STEPS.map((k) => byKey[k]).filter(Boolean);
  }, [shown]);

  const configured = !!data && !!data.login && data.password_set
    && data.password_readable !== false && !!data.filial_id;

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-80 rounded-2xl" />
        <SkeletonBlock className="h-40 rounded-2xl" />
      </div>
    );
  }

  const submit = () => save.mutate({
    login: login.trim(),
    filial_id: filial.trim(),
    host: host.trim(),
    ...(password ? { password } : {}),
  });

  const verdict = shown?.verdict;
  const vColor = toneOf(verdict);

  return (
    <div className="space-y-4">
      {/* ── the connection ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Fingerprint} title={t("verifix.title")} />
        <div className="p-4 sm:p-5 space-y-4">
          <p className="text-[13px] leading-relaxed flex gap-2" style={{ color: "var(--text-3)" }}>
            <Info size={15} className="mt-0.5 flex-shrink-0" />
            <span>{t("verifix.explain")}</span>
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label={t("verifix.login")} required hint={t("verifix.loginHint")}>
              <input value={login} onChange={(e) => setLogin(e.target.value)}
                autoComplete="off" spellCheck={false} placeholder="safia-ims@safia"
                className={`${inputCls} font-mono`} style={inputStyle} />
            </FormField>

            <FormField label={t("verifix.password")} required
              hint={data.password_readable === false ? undefined : t("verifix.passwordHint")}
              error={data.password_readable === false ? t("verifix.passwordUnreadable") : undefined}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password" spellCheck={false}
                placeholder={data.password_set ? t("verifix.passwordKeep") : ""}
                className={inputCls} style={inputStyle} />
            </FormField>

            <FormField label={t("verifix.filial")} required hint={t("verifix.filialHint")}>
              <input value={filial} onChange={(e) => setFilial(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" autoComplete="off" placeholder="—"
                className={`${inputCls} font-mono tabular-nums`} style={inputStyle} />
            </FormField>

            <FormField label={t("verifix.host")} hint={t("verifix.hostHint")}>
              <input value={host} onChange={(e) => setHost(e.target.value)}
                autoComplete="off" spellCheck={false} placeholder={data.default_host}
                className={`${inputCls} font-mono`} style={inputStyle} />
            </FormField>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button size="lg" variant="primary" loading={save.isPending}
              disabled={!dirty} onClick={submit}>
              {t("verifix.save")}
            </Button>
            {data.password_set && (
              <Button size="lg" variant="ghost" onClick={() => setConfirmClear(true)}>
                {t("verifix.clearPassword")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── the test ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={PlugZap} title={t("verifix.testTitle")}
          right={(
            <Button size="md" variant="secondary" loading={test.isPending}
              disabled={!configured || dirty || test.isPending} onClick={() => test.mutate()}>
              {t("verifix.test")}
            </Button>
          )} />
        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
          {test.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {t("verifix.testing")}
            </span>
          ) : dirty ? t("verifix.saveFirst")
            : !configured ? t("verifix.v.not_configured")
            : t("verifix.testHint")}
        </div>

        {shown && !test.isPending && (
          <>
            <div className="mx-4 mb-3 rounded-xl px-3 py-2.5 text-sm flex items-start gap-2"
              style={{ background: `${vColor}14`, border: `1px solid ${vColor}55`, color: "var(--text-1)" }}>
              {verdict === "ok"
                ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: vColor }} />
                : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: vColor }} />}
              <div className="min-w-0">
                <div>{t(`verifix.v.${verdict}`) !== `verifix.v.${verdict}` ? t(`verifix.v.${verdict}`) : t("verifix.v.partial")}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                  {fill(t("verifix.lastRun"), {
                    at: fmtAt(shown.at), by: shown.by || "—",
                    s: Math.max(1, Math.round((shown.ms || 0) / 1000)),
                  })}
                  {shown.host ? ` · ${shown.host}` : ""}
                </div>
              </div>
            </div>
            {steps.length > 0 && (
              <ul className="pb-1">
                {steps.map((s) => <StepRow key={s.key} s={s} t={t} tx={tx} />)}
              </ul>
            )}
          </>
        )}
        {!shown && !test.isPending && configured && !dirty && (
          <div className="px-4 pb-4 text-xs" style={{ color: "var(--text-4)" }}>{t("verifix.never")}</div>
        )}
      </div>

      {/* ── Verifix against the uploaded files ─────────────────────────── */}
      <VerifixParity data={data} qk={QK} configured={configured} dirty={dirty} t={t} tx={tx} />

      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        title={t("verifix.clearConfirmTitle")}
        message={t("verifix.clearConfirmBody")}
        confirmLabel={t("verifix.clearPassword")}
        loading={clear.isPending}
        error={clearErr}
        onCancel={() => { setConfirmClear(false); setClearErr(null); }}
        onConfirm={() => { setClearErr(null); clear.mutate(); }}
      />
      {toastNode}
    </div>
  );
}
