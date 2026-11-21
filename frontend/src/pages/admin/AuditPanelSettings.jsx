import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, PlugZap, CheckCircle2, XCircle, AlertTriangle, Info, Loader2, ListTree } from "lucide-react";
import api from "../../utils/api";
import { useLeaveGuard } from "../../hooks/useLeaveGuard";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Modal from "../../components/ui/Modal";
import TableCard, { SectionHead, Th } from "../../components/ui/DataTable";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { fill, fmtAt } from "./VerifixParity";
import { useAPT } from "./auditPanelText";

/**
 * «Audit paneli» — the connection to the panel the KRU and the technologists
 * file their audits in (docs/audits.md). Phase 1 (2026-11-21, the operator:
 * «panel now, page later based on the data»): the address, the login, the
 * password, and a DISCOVERY test — the panel's own code read for the audit
 * addresses it calls, a login, each module's API description, five records
 * from every audit list. Nothing on the platform reads an audit from here yet;
 * the «Auditlar» page is built off what this test finds.
 *
 * The password goes in and never comes out — the Verifix model: the server says
 * only whether one is stored and whether it still opens; a blank field keeps it.
 * Admin-only and never grantable (no capKey in ADMIN_NAV).
 */

const QK = ["admin-audit-panel"];
const STEPS = ["panel", "login", "spec", "sample"];
const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };
const TONE = { found: "#22c55e", found_empty: "#eab308", login_only: "#eab308", not_configured: "#94a3b8" };
const toneOf = (v) => TONE[v] || "#ef4444";
const statusTone = (s) => (s >= 200 && s < 300 ? "#22c55e" : s ? "#ef4444" : "#94a3b8");

function Folded({ label, items, render }) {
  if (!items?.length) return null;
  return (
    <details className="mt-1">
      <summary className="text-xs cursor-pointer" style={{ color: "var(--text-3)" }}>{label}</summary>
      <ul className="mt-1 text-xs space-y-0.5 font-mono max-h-56 overflow-auto pr-1" style={{ color: "var(--text-2)" }}>
        {items.map((it, i) => <li key={i} className="break-all">{render ? render(it) : it}</li>)}
      </ul>
    </details>
  );
}

function StepRow({ s, T }) {
  let figures = "";
  if (s.ok && s.key === "panel") {
    figures = fill(T.f.panel, { files: s.files ?? 0, api: s.api_total ?? 0, audit: s.audit_api?.length ?? 0 });
  }
  if (s.ok && s.key === "login") {
    const won = (s.tries || []).find((x) => x.code === "ok");
    figures = fill(T.f.login, { path: won?.path || "" });
  }
  if (s.key === "spec") {
    figures = fill(T.f.spec, { ok: (s.tried || []).filter((x) => x.ok).length, n: (s.tried || []).length, e: s.endpoints?.length ?? 0 });
  }
  if (s.key === "sample") figures = fill(T.f.sample, { answered: s.answered ?? 0, tried: s.tried ?? 0 });
  // The spec and the samples report counts even when none answered — a 0 of 4
  // is the finding, not a failure of the test.
  const counted = s.key === "spec" || s.key === "sample";
  const ok = s.ok || counted;
  const Icon = s.ok ? CheckCircle2 : counted ? AlertTriangle : XCircle;
  const color = s.ok ? "#22c55e" : counted ? "#eab308" : "#ef4444";
  const errText = s.code ? (T.e[s.code] || T.e.other) : T.e.other;
  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
      <Icon size={16} className="mt-0.5 flex-shrink-0" style={{ color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{T.s[s.key]}</span>
          {ok && figures && <span className="text-sm tabular-nums" style={{ color: "var(--text-2)" }}>{figures}</span>}
        </div>
        {!ok && (
          <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
            {errText}
            {(s.status || s.message) && (
              <span className="block mt-0.5 font-mono break-words">{[s.status, s.message].filter(Boolean).join(" · ")}</span>
            )}
          </div>
        )}
        {s.key === "panel" && s.ok && (
          <>
            <Folded label={fill(T.lists.routes, { n: s.routes?.length || 0 })} items={s.routes} />
            <Folded label={fill(T.lists.audit_api, { n: s.audit_api?.length || 0 })} items={s.audit_api} />
            <Folded label={fill(T.lists.modules, { n: s.modules?.length || 0 })} items={s.modules}
              render={(m) => `${m.name} · ${m.count}`} />
            <Folded label={fill(T.lists.origins, { n: s.origins?.length || 0 })} items={s.origins} />
          </>
        )}
        {s.key === "login" && (
          <Folded label={fill(T.lists.tries, { n: s.tries?.length || 0 })} items={s.tries}
            render={(x) => [x.path, x.form ? T.form : T.json, x.status, T.e[x.code] && x.code !== "ok" ? T.e[x.code] : x.code === "ok" ? "✓" : x.code,
              x.message].filter(Boolean).join(" · ")} />
        )}
        {s.key === "spec" && (
          <Folded label={fill(T.lists.tried, { n: s.tried?.length || 0 })} items={s.tried}
            render={(x) => [x.module || T.root, x.status ?? x.code, x.ok ? "✓" : x.message].filter(Boolean).join(" · ")} />
        )}
      </div>
    </li>
  );
}

function SampleModal({ row, onClose, T }) {
  if (!row) return null;
  const rows = row.total ?? row.count;
  return (
    <Modal open onClose={onClose} title={row.path} icon={ListTree} maxWidth="max-w-3xl"
      subtitle={[`${T.col.status}: ${row.status ?? row.code}`, rows != null ? `${T.col.rows}: ${rows}` : null,
        row.params?.length ? fill(T.sent, { p: row.params.join(", ") }) : null].filter(Boolean).join(" · ")}
      footer={<Button variant="secondary" onClick={onClose}>{T.close}</Button>}>
      {!row.ok && row.message && (
        <div>
          <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>{T.refused}</div>
          <pre className="text-xs font-mono whitespace-pre-wrap break-words rounded-xl p-3"
            style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>{row.message}</pre>
        </div>
      )}
      {row.fields?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>
            {T.fieldsTitle} · {row.fields.length}
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5 text-xs font-mono">
            {row.fields.map((f) => (
              <div key={f.name} className="flex justify-between gap-3 min-w-0">
                <span className="truncate" style={{ color: "var(--text-1)" }} title={f.name}>{f.name}</span>
                <span className="flex-shrink-0" style={{ color: "var(--text-3)" }}>{f.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {row.ok && (
        <div>
          <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>{T.sampleTitle}</div>
          {row.sample ? (
            <pre className="text-xs font-mono whitespace-pre-wrap break-words rounded-xl p-3 max-h-[50vh] overflow-auto"
              style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
              {JSON.stringify(row.sample, null, 2)}
            </pre>
          ) : <div className="text-xs" style={{ color: "var(--text-3)" }}>{T.noSample}</div>}
        </div>
      )}
    </Modal>
  );
}

export default function AuditPanelSettings() {
  const T = useAPT();
  const qc = useQueryClient();
  const { show: toast, node: toastNode } = useToast({ position: "bottom" });

  const { data, isLoading } = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/admin/audit-panel").then((r) => r.data),
  });

  const [url, setUrl] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearErr, setClearErr] = useState(null);
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(null);

  // The form starts from what is stored, and goes back to it after a save.
  useEffect(() => {
    if (!data) return;
    setUrl(data.url || data.default_url || "");
    setLogin(data.login || "");
  }, [data]);

  const dirty = !!data && (
    (url.trim() || data.default_url) !== (data.url || data.default_url)
    || login.trim() !== (data.login || "")
    || password.length > 0
  );
  useLeaveGuard(dirty);

  const err = (e) => e?.response?.data?.detail || String(e?.message || e);
  const afterSave = (res, msg) => {
    setPassword("");
    setResult(null);
    qc.setQueryData(QK, res);
    toast(msg, "success");
  };
  const save = useMutation({
    mutationFn: (body) => api.put("/api/admin/audit-panel", body).then((r) => r.data),
    onSuccess: (res) => afterSave(res, T.saved),
    onError: (e) => toast(err(e), "error"),
  });
  // Clearing has its own mutation so a failure stays INSIDE the dialog.
  const clear = useMutation({
    mutationFn: () => api.put("/api/admin/audit-panel", { clear_password: true }).then((r) => r.data),
    onSuccess: (res) => { setConfirmClear(false); afterSave(res, T.cleared); },
    onError: (e) => setClearErr(err(e)),
  });
  const test = useMutation({
    mutationFn: () => api.post("/api/admin/audit-panel/test").then((r) => r.data),
    onSuccess: (res) => {
      setResult(res);
      qc.setQueryData(QK, (old) => (old ? { ...old, last_test: res } : old));
    },
    onError: (e) => toast(err(e), "error"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-72 rounded-2xl" />
        <SkeletonBlock className="h-40 rounded-2xl" />
      </div>
    );
  }

  const configured = !!data.login && data.password_set && data.password_readable !== false;
  const shown = result || data.last_test || null;
  const byKey = Object.fromEntries((shown?.steps || []).map((s) => [s.key, s]));
  const steps = STEPS.map((k) => byKey[k]).filter(Boolean);
  const samples = shown?.samples || [];
  const verdict = shown?.verdict;
  const vColor = toneOf(verdict);

  return (
    <div className="space-y-4">
      {/* ── the connection ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={ShieldCheck} title={T.title} />
        <div className="p-4 sm:p-5 space-y-4">
          <p className="text-[13px] leading-relaxed flex gap-2" style={{ color: "var(--text-3)" }}>
            <Info size={15} className="mt-0.5 flex-shrink-0" />
            <span>{T.explain}</span>
          </p>
          <FormField label={T.url} hint={T.urlHint}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" spellCheck={false}
              placeholder={data.default_url} className={`${inputCls} font-mono`} style={inputStyle} />
          </FormField>
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label={T.login} required hint={T.loginHint}>
              <input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="off"
                spellCheck={false} className={`${inputCls} font-mono`} style={inputStyle} />
            </FormField>
            <FormField label={T.password} required
              hint={data.password_readable === false ? undefined : T.passwordHint}
              error={data.password_readable === false ? T.passwordUnreadable : undefined}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password" spellCheck={false}
                placeholder={data.password_set ? T.passwordKeep : ""} className={inputCls} style={inputStyle} />
            </FormField>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="lg" variant="primary" loading={save.isPending} disabled={!dirty}
              onClick={() => save.mutate({ url: url.trim(), login: login.trim(), ...(password ? { password } : {}) })}>
              {T.save}
            </Button>
            {data.password_set && (
              <Button size="lg" variant="ghost" onClick={() => setConfirmClear(true)}>{T.clearPassword}</Button>
            )}
          </div>
        </div>
      </div>

      {/* ── the test ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={PlugZap} title={T.testTitle}
          right={(
            <Button size="md" variant="secondary" loading={test.isPending}
              disabled={!configured || dirty || test.isPending} onClick={() => test.mutate()}>
              {T.test}
            </Button>
          )} />
        <div className="px-4 py-3 text-xs" style={{ color: "var(--text-3)" }}>
          {test.isPending ? (
            <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {T.testing}</span>
          ) : dirty ? T.saveFirst : !configured ? T.v.not_configured : T.testHint}
        </div>
        {shown && !test.isPending && (
          <>
            <div className="mx-4 mb-3 rounded-xl px-3 py-2.5 text-sm flex items-start gap-2"
              style={{ background: `${vColor}14`, border: `1px solid ${vColor}55`, color: "var(--text-1)" }}>
              {verdict === "found"
                ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" style={{ color: vColor }} />
                : <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: vColor }} />}
              <div className="min-w-0">
                <div>{T.v[verdict] || T.e.other}</div>
                <div className="text-xs mt-0.5 break-words" style={{ color: "var(--text-3)" }}>
                  {fill(T.lastRun, { at: fmtAt(shown.at), by: shown.by || "—", s: Math.max(1, Math.round((shown.ms || 0) / 1000)) })}
                  {shown.api ? ` · ${shown.api}` : ""}
                </div>
              </div>
            </div>
            {steps.length > 0 && <ul className="pb-1">{steps.map((s) => <StepRow key={s.key} s={s} T={T} />)}</ul>}
          </>
        )}
        {!shown && !test.isPending && configured && !dirty && (
          <div className="px-4 pb-4 text-xs" style={{ color: "var(--text-3)" }}>{T.never}</div>
        )}
      </div>

      {/* ── what the panel handed out — the page is built from this ────── */}
      {samples.length > 0 && !test.isPending && (
        <TableCard icon={ListTree} title={T.foundTitle} subtitle={T.foundSub} headSize="lg"
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{samples.length}</span>}>
          <thead>
            <tr>
              <Th label={T.col.path} />
              <Th label={T.col.status} align="right" />
              <Th label={T.col.rows} align="right" />
              <Th label={T.col.fields} align="right" />
            </tr>
          </thead>
          <tbody>
            {samples.map((r) => (
              <tr key={r.path} tabIndex={0} className="cursor-pointer" onClick={() => setOpen(r)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(r); } }}>
                <td className="px-3 py-2 font-mono max-w-[420px] truncate" title={r.path}>{r.path}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: statusTone(r.status) }} />
                  {r.status ?? (T.e[r.code] || r.code)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.total ?? r.count ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.fields?.length ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      <SampleModal row={open} onClose={() => setOpen(null)} T={T} />
      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        title={T.clearTitle}
        message={T.clearBody}
        confirmLabel={T.clearPassword}
        loading={clear.isPending}
        error={clearErr}
        onCancel={() => { setConfirmClear(false); setClearErr(null); }}
        onConfirm={() => { setClearErr(null); clear.mutate(); }}
      />
      {toastNode}
    </div>
  );
}
