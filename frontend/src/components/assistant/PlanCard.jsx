import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Minus, ShieldCheck, X } from "lucide-react";
import Button from "../ui/Button";
import useAT from "./useAT";

/**
 * The plan the assistant wants to carry out — NOTHING has happened yet.
 *
 * Every change is a line the user can untick; «Tasdiqlash (n)» carries the
 * count of what will actually run, and Cancel sits on the left (the Modal
 * footer order the platform uses everywhere). After Confirm each line turns
 * into its own result: done, failed with the server's reason, or skipped.
 * The request each line makes is one tap away («Texnik tafsilot») for anybody
 * who wants to see exactly what is sent in their name.
 */
export default function PlanCard({ plan, runId, onConfirm, onCancel }) {
  const t = useAT();
  const items = plan?.items || [];
  const [picked, setPicked] = useState(() => new Set(items.map((i) => i.i)));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(false);
  const state = plan?.state || "awaiting";
  const awaiting = state === "awaiting";

  useEffect(() => {
    if (awaiting) setPicked(new Set(items.map((i) => i.i)));
  }, [runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (i) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });

  const run = async (which) => {
    setError("");
    setBusy(which);
    try {
      if (which === "confirm") await onConfirm([...picked].sort((a, b) => a - b));
      else await onCancel();
    } catch (e) {
      setError(e?.response?.data?.detail === "not_waiting"
        ? t("assistant.plan.gone") : t("assistant.err.send"));
    } finally {
      setBusy(null);
    }
  };

  const done = items.filter((i) => i.state === "done").length;
  const failed = items.filter((i) => i.state === "failed").length;
  const skipped = items.filter((i) => i.state === "skipped").length;
  const closed = state === "cancelled" || state === "superseded";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-md)", background: "var(--bg-card)" }}>
      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(var(--brand-rgb),0.14)", color: "var(--brand-text)" }}>
          <ShieldCheck size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--text-1)" }}>{plan?.title}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
            {awaiting ? t("assistant.plan.ask", { n: items.length })
              : closed ? t(state === "superseded" ? "assistant.plan.superseded" : "assistant.plan.cancelled")
              : state === "running" ? t("assistant.plan.running")
              : t("assistant.plan.result", { done, failed, skipped })}
          </p>
        </div>
      </div>

      <ul className="px-2 pb-2">
        {items.map((it) => {
          const on = picked.has(it.i);
          return (
            <li key={it.i}>
              <label className={`flex items-start gap-2.5 px-1.5 py-1.5 rounded-lg ${awaiting ? "cursor-pointer hover:bg-[var(--bg-inner)]" : ""}`}>
                {awaiting ? (
                  <input type="checkbox" checked={on} onChange={() => toggle(it.i)}
                    className="mt-0.5 w-4 h-4 accent-[var(--brand)] flex-shrink-0" />
                ) : (
                  <ItemState state={it.state} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug"
                    style={{ color: awaiting && !on ? "var(--text-3)" : "var(--text-1)",
                             textDecoration: it.state === "skipped" ? "line-through" : undefined }}>
                    {it.label}
                  </span>
                  {it.note && (
                    <span className="block text-xs mt-0.5" style={{ color: it.state === "failed" ? "var(--status-bad, #ef4444)" : "var(--text-3)" }}>
                      {it.note}
                    </span>
                  )}
                  {detail && (
                    <code className="block text-[11px] mt-1 px-2 py-1 rounded whitespace-pre-wrap break-all"
                      style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                      {it.method} {it.path}{it.query && Object.keys(it.query).length ? `?${new URLSearchParams(it.query)}` : ""}
                      {it.body ? `\n${JSON.stringify(it.body, null, 1)}` : ""}
                      {it.attachment_id ? `\n+ #${it.attachment_id}` : ""}
                    </code>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
        <button type="button" onClick={() => setDetail((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium py-1 rounded"
          style={{ color: "var(--text-3)" }} aria-expanded={detail}>
          {detail ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {t("assistant.plan.detail")}
        </button>
        {awaiting && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={() => run("cancel")} loading={busy === "cancel"} disabled={!!busy}>
              {t("assistant.plan.cancel")}
            </Button>
            <Button onClick={() => run("confirm")} loading={busy === "confirm"}
              disabled={!!busy || picked.size === 0}>
              {t("assistant.plan.confirm", { n: picked.size })}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="px-3.5 pb-2.5 text-xs" style={{ color: "var(--status-bad, #ef4444)" }}>{error}</p>}
    </div>
  );
}

function ItemState({ state }) {
  const common = "mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0";
  if (state === "done")
    return <span className={common} style={{ background: "#22c55e", color: "#fff" }}><Check size={11} strokeWidth={3} /></span>;
  if (state === "failed")
    return <span className={common} style={{ background: "#ef4444", color: "#fff" }}><X size={11} strokeWidth={3} /></span>;
  if (state === "running")
    return <Loader2 size={15} className="mt-0.5 animate-spin flex-shrink-0" style={{ color: "var(--brand-text)" }} />;
  return <span className={common} style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}><Minus size={10} /></span>;
}
