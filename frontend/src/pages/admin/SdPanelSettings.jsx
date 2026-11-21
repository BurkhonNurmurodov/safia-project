import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ClipboardCheck, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import api from "../../utils/api";
import { useLeaveGuard } from "../../hooks/useLeaveGuard";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import { SectionHead } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { fmtAt } from "./VerifixParity";
import { useSdText, fill } from "./sdPanelText";

/**
 * «Audit paneli» — the platform's sign-in to panel.safiabakery.uz, which
 * «Auditlar» (/audits, services/panel_audits.py) reads the KRU and technical
 * audits through (record: docs/audits.md, docs/tasker.md).
 *
 * Insight: the admin comes here for one answer — is the platform connected to
 * the audit panel and reading it — and, when not, the one thing to fix. So the
 * card opens on that status, the login is one row with ONE button that saves
 * and checks, and below it each audit kind says when it was last read and
 * opens on «Auditlar». The data itself lives on that page, not here.
 *
 * The password is stored sealed and SHOWN in plain text — the Tasker ruling
 * (2026-11-12). An admin or the `sdpanel` tab's grant.
 */

const QK = ["admin-sdpanel"];
const KINDS = ["tech", "kru"];
const input = "w-full h-[38px] px-3 rounded-xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };
const TONE = { ok: "#22c55e", warn: "#eab308", bad: "#ef4444", idle: "#94a3b8" };

function Dot({ tone }) {
  return <span aria-hidden className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: TONE[tone] }} />;
}

export default function SdPanelSettings() {
  const T = useSdText();
  const qc = useQueryClient();
  const { show: toast, node: toastNode } = useToast({ position: "bottom" });

  const { data, isLoading, isError } = useQuery({
    queryKey: QK,
    queryFn: () => api.get("/api/admin/tasker/panel").then((r) => r.data),
  });

  // Both fields show what is stored until edited (null = untouched).
  const [userDraft, setUser] = useState(null);
  const [passDraft, setPass] = useState(null);
  const user = userDraft ?? (data?.user || "");
  const pass = passDraft ?? (data?.password || "");
  const passEdited = !!data && pass !== (data.password || "");
  const dirty = !!data && (user.trim() !== (data.user || "") || passEdited);
  useLeaveGuard(dirty);

  const err = (e) => e?.response?.data?.detail || String(e?.message || e);
  const save = useMutation({
    mutationFn: (body) => api.put("/api/admin/tasker/panel", body).then((r) => r.data),
    onSuccess: (res) => { setUser(null); setPass(null); qc.setQueryData(QK, res); },
    onError: (e) => toast(err(e), "error"),
  });
  const check = useMutation({
    mutationFn: () => api.post("/api/admin/tasker/panel/check").then((r) => r.data),
    onSuccess: (res) => {
      qc.setQueryData(QK, res);
      qc.invalidateQueries({ queryKey: ["audits-meta"] });
    },
    onError: (e) => toast(err(e), "error"),
  });

  if (isError) return <EmptyState tone="danger" icon={AlertCircle} title={T.loadErr} message="" showUploadLink={false} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-[232px] rounded-2xl" />
        <SkeletonBlock className="h-[188px] rounded-2xl" />
      </div>
    );
  }

  const A = data.audits || { kinds: {} };
  const kinds = A.kinds || {};
  const configured = !!data.user && data.password_set && data.password_readable !== false;
  const busy = save.isPending || check.isPending;
  const why = (code) => T.e[code] || T.e.other;

  // ── the one status line ─────────────────────────────────────────────────
  const reads = KINDS.map((k) => kinds[k]?.read_at).filter(Boolean).sort();
  const lastRead = reads[reads.length - 1];
  const failure = KINDS.map((k) => kinds[k]).filter((x) => x?.error).sort((a, b) => (a.error_at < b.error_at ? 1 : -1))[0];
  const loginFail = check.data?.check && !check.data.check.results ? check.data.check : null;
  let tone = "idle";
  let status = T.st.never;
  if (check.isPending) { tone = "idle"; status = T.st.checking; }
  else if (!data.user || !data.password_set) { tone = "idle"; status = T.st.none; }
  else if (data.password_readable === false) { tone = "bad"; status = T.e.unreadable; }
  else if (A.refused) { tone = "bad"; status = T.st.refused; }
  else if (loginFail && loginFail.code !== "busy") { tone = "bad"; status = fill(T.st.failed, { at: fmtAt(new Date().toISOString()), why: why(loginFail.code) }); }
  else if (failure) { tone = "bad"; status = fill(T.st.failed, { at: fmtAt(failure.error_at), why: why(failure.error) }); }
  else if (lastRead) { tone = "ok"; status = fill(T.st.ok, { at: fmtAt(lastRead) }); }

  const onGo = async () => {
    if (dirty) {
      try {
        await save.mutateAsync({
          user: user.trim(),
          // An emptied field removes the stored password.
          ...(passEdited ? (pass ? { password: pass } : { clear_password: true }) : {}),
        });
      } catch { return; }
      if (!pass) { toast(T.saved, "success"); return; }
    }
    check.mutate();
  };

  return (
    <div className="space-y-4">
      {/* ── the sign-in: status first, then one row and one button ──────── */}
      <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={KeyRound} title={T.title} />
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-start sm:items-center gap-2.5 min-h-[40px] px-3.5 py-2.5 rounded-xl text-sm"
            style={{ background: "var(--bg-inner)", color: "var(--text-1)" }} role="status" aria-live="polite">
            {check.isPending ? <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: "var(--text-3)" }} /> : <span className="mt-1.5 sm:mt-0 flex"><Dot tone={tone} /></span>}
            <span className="min-w-0 sm:truncate" title={typeof status === "string" ? status : undefined}>{status}</span>
          </div>

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <FormField label={T.user} required>
              <input value={user} onChange={(e) => setUser(e.target.value)} name="sdpanel-login"
                autoComplete="off" spellCheck={false} className={input} style={inputStyle} />
            </FormField>
            <FormField label={T.password} required>
              {/* Plain text on purpose (the Tasker ruling); kept exactly as typed. */}
              <input value={pass} onChange={(e) => setPass(e.target.value)} name="sdpanel-secret"
                autoComplete="off" spellCheck={false} className={`${input} font-mono`} style={inputStyle} />
            </FormField>
            <Button size="lg" variant="primary" loading={busy}
              disabled={busy || (dirty ? !user.trim() : !configured)} onClick={onGo}>
              {dirty ? T.saveCheck : T.check}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>{T.note}</p>
        </div>
      </section>

      {/* ── what the platform reads with it, one row per audit ──────────── */}
      <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={ClipboardCheck} title={T.readsTitle}
          right={<span className="hidden sm:inline text-xs" style={{ color: "var(--text-3)" }}>{T.auto}</span>} />
        <ul>
          {KINDS.map((k) => {
            const x = kinds[k] || {};
            const rowTone = x.error ? "bad" : x.read_at ? "ok" : "idle";
            const line = x.error ? fill(T.rowErr, { why: why(x.error) })
              : x.read_at ? fill(T.rowRead, { at: fmtAt(x.read_at) }) : T.rowNever;
            return (
              <li key={k} style={{ borderTop: "1px solid var(--border)" }}>
                <Link to={`/audits?k=${k}&v=analysis`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[180px_minmax(0,1fr)_auto_auto] items-center gap-x-6 gap-y-1 px-4 sm:px-5 py-3.5 hover:bg-[var(--bg-inner)] focus-visible:bg-[var(--bg-inner)] outline-none">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.kinds[k]}</span>
                  <span className="sm:order-none order-3 col-span-2 sm:col-span-1 flex items-center gap-2 min-w-0 text-[13px]" style={{ color: "var(--text-2)" }}>
                    <Dot tone={rowTone} />
                    <span className="truncate">{line}</span>
                    {x.months > 0 && <span className="hidden md:inline whitespace-nowrap" style={{ color: "var(--text-3)" }}>· {fill(T.monthsN, { n: x.months })}</span>}
                  </span>
                  <span className="text-right whitespace-nowrap">
                    <span className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{(x.this_month ?? 0).toLocaleString("ru-RU")}</span>
                    <span className="ml-1.5 text-xs" style={{ color: "var(--text-3)" }}>{T.minusWord} · {T.thisMonth}</span>
                  </span>
                  <span className="hidden sm:flex items-center gap-1 text-[13px] font-medium" style={{ color: "var(--brand-text)" }}>
                    {T.open}<ChevronRight size={14} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="sm:hidden px-4 py-2.5 text-[11px]" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>{T.auto}</div>
      </section>
      {toastNode}
    </div>
  );
}
