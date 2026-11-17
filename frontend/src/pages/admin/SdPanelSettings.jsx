import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ClipboardX, Info, AlertTriangle, Loader2, AlertCircle } from "lucide-react";
import api from "../../utils/api";
import { useTranslit } from "../../utils/transliterate";
import { useLeaveGuard } from "../../hooks/useLeaveGuard";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import TableCard, { SectionHead, Th } from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { fmtAt } from "./VerifixParity";
import { useSdText, fill } from "./sdPanelText";

/**
 * «Panel: audit minuslari» — panel.safiabakery.uz's «Минусы» report of the
 * technical audit, read with a login (backend `services/sd_panel.py`, record in
 * docs/tasker.md). The panel has no API for it, so the platform signs in with
 * the login stored here and reads the one page the operator named.
 *
 * The password is stored sealed and SHOWN here in plain text — the Tasker ruling
 * (2026-11-12). Admin-only and never grantable (no capKey in ADMIN_NAV).
 */

const QK = ["admin-sdpanel"];
const inputCls = "w-full px-3 py-2 rounded-xl text-sm outline-none";
const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };
const pct = (v) => (v == null ? "—" : `${v}%`);
const dayOf = (iso) => (iso ? iso.split("-").reverse().join(".") : "—");
const PANEL = "https://panel.safiabakery.uz";

export default function SdPanelSettings() {
  const T = useSdText();
  const { tl, tx } = useTranslit();
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
    onSuccess: (res) => {
      setUser(null);
      setPass(null);
      qc.setQueryData(QK, res);
      toast(T.saved, "success");
    },
    onError: (e) => toast(err(e), "error"),
  });
  const read = useMutation({
    mutationFn: () => api.post("/api/admin/tasker/panel/fetch").then((r) => r.data),
    onSuccess: (res) => qc.setQueryData(QK, (old) => (old ? { ...old, last: res } : old)),
    onError: (e) => toast(err(e), "error"),
  });

  const last = data?.last;
  const rows = useMemo(() => last?.rows || [], [last]);
  const workshops = useMemo(() => new Set(rows.map((r) => r.workshop_id ?? r.workshop)).size, [rows]);

  if (isError) return <EmptyState tone="danger" icon={AlertCircle} title={T.loadErr} message="" showUploadLink={false} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-56 rounded-2xl" />
        <SkeletonBlock className="h-80 rounded-2xl" />
      </div>
    );
  }

  const configured = !!data.user && data.password_set && data.password_readable !== false;
  const secs = (ms) => Math.max(1, Math.round((ms || 0) / 1000));

  let status;
  if (read.isPending) {
    status = <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {T.fetching}</span>;
  } else if (last && !last.ok) {
    status = (
      <span className="flex items-start gap-2" style={{ color: "var(--text-1)" }}>
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#ef4444" }} />
        <span className="min-w-0 break-words">
          {fill(T.failed, { at: fmtAt(last.at) })} {T.e[last.code] || T.e.status}
          {(last.status || last.message) && (
            <span className="font-mono" style={{ color: "var(--text-3)" }}> {[last.status, last.message].filter(Boolean).join(" · ")}</span>
          )}
          {rows.length > 0 && last.rows_at && <span style={{ color: "var(--text-3)" }}> {fill(T.oldRows, { at: fmtAt(last.rows_at) })}</span>}
        </span>
      </span>
    );
  } else if (last) {
    status = `${fill(T.read, { at: fmtAt(last.at), by: last.by || "—", s: secs(last.ms) })} · ${fill(T.counts, { n: rows.length, w: workshops })}`;
  } else {
    status = dirty ? T.saveFirst : configured ? T.never : T.e.no_login;
  }

  return (
    <div className="space-y-4">
      {/* ── the login ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={KeyRound} title={T.title} />
        <div className="p-4 sm:p-5 space-y-4">
          <p className="text-[13px] leading-relaxed flex gap-2" style={{ color: "var(--text-3)" }}>
            <Info size={15} className="mt-0.5 flex-shrink-0" />
            <span>{T.explain}</span>
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label={T.user} required>
              <input value={user} onChange={(e) => setUser(e.target.value)} name="sdpanel-login"
                autoComplete="off" spellCheck={false} className={inputCls} style={inputStyle} />
            </FormField>
            <FormField label={T.password} required
              hint={data.password_readable === false ? undefined : T.passHint}
              error={data.password_readable === false ? T.e.unreadable : undefined}>
              {/* Plain text on purpose (the Tasker ruling); kept exactly as typed. */}
              <input value={pass} onChange={(e) => setPass(e.target.value)} name="sdpanel-secret"
                autoComplete="off" spellCheck={false} className={`${inputCls} font-mono`} style={inputStyle} />
            </FormField>
          </div>
          <Button size="lg" variant="primary" loading={save.isPending} disabled={!dirty}
            onClick={() => save.mutate({
              user: user.trim(),
              // An emptied field removes the stored password.
              ...(passEdited ? (pass ? { password: pass } : { clear_password: true }) : {}),
            })}>
            {T.save}
          </Button>
        </div>
      </div>

      {/* ── the report ─────────────────────────────────────────────────── */}
      <TableCard icon={ClipboardX} title={T.report} subtitle={T.reportHint} headSize="lg"
        right={(
          <Button size="md" variant="secondary" loading={read.isPending}
            disabled={!configured || dirty || read.isPending} onClick={() => read.mutate()}>
            {T.fetch}
          </Button>
        )}
        toolbar={(
          <div className="w-full text-xs" style={{ color: "var(--text-3)" }}>
            {status}
            <a href={data.url} target="_blank" rel="noreferrer" className="block mt-1 font-mono truncate"
              style={{ color: "var(--text-3)" }} title={data.url}>{data.url}</a>
          </div>
        )}>
        <thead>
          <tr>
            <Th label={T.col.n} align="right" />
            <Th label={T.col.day} />
            <Th label={T.col.workshop} />
            <Th label={T.col.inspector} />
            <Th label={T.col.total} align="right" />
            <Th label={T.col.rating} align="right" />
            <Th label={T.col.task} />
            <Th label={T.col.question} />
            <Th label={T.col.comment} />
            <Th label={T.col.top} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
                {last?.ok ? T.empty : T.never}
              </td>
            </tr>
          ) : rows.map((r, i) => (
            <tr key={r.item}>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{i + 1}</td>
              <td className="px-3 py-2 tabular-nums">{dayOf(r.day)}</td>
              <td className="px-3 py-2 max-w-[260px] truncate" title={tx(r.workshop)}>{tx(r.workshop)}</td>
              <td className="px-3 py-2 max-w-[160px] truncate" title={tl(r.inspector)}>{tl(r.inspector)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(r.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{pct(r.rating)}</td>
              <td className="px-3 py-2 max-w-[260px] truncate" title={tx(r.task)}>
                {r.task_id ? (
                  <a href={`${PANEL}/task-scheduler/view?id=${r.task_id}#item-${r.item}`} target="_blank" rel="noreferrer"
                    className="cell-link" aria-label={`${T.openPanel}: ${tx(r.task)}`}>{tx(r.task)}</a>
                ) : tx(r.task)}
              </td>
              <td className="px-3 py-2 max-w-[320px] truncate" title={tx(r.question)}>{tx(r.question)}</td>
              <td className="px-3 py-2 max-w-[280px] truncate" title={tx(r.comment)}>{tx(r.comment)}</td>
              <td className="px-3 py-2 tabular-nums">{r.top != null ? `TOP (${r.top})` : ""}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      {toastNode}
    </div>
  );
}
