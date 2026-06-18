import { useState } from "react";
import { X, MessageSquare, Pencil, Trash2, Check, XCircle, ChevronDown, Calculator } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { commentPlanFormula, commentActualFormula } from "../../utils/formulas";

// Convert DD.MM.YYYY → YYYY-MM-DD for API calls
function toIsoDate(date) {
  if (!date) return date;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date; // already ISO
  const [dd, mm, yyyy] = date.split(".");
  return `${yyyy}-${mm}-${dd}`;
}

export default function CommentModal({ managerId, managerName, date, rawCell, mode, onClose, formulaOnly = false, formulaCollapsible = false }) {
  const { auth } = useAuth();
  const { t } = useLang();
  const { tl } = useTranslit();
  const myId = auth?.telegram_id ? String(auth.telegram_id) : null;
  const isoDate = toIsoDate(date);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  // Formula section is collapsible only when requested (comparison table); starts
  // collapsed so the comments are visible first — the user expands the breakdown.
  const [formulaOpen, setFormulaOpen] = useState(false);
  const qc = useQueryClient();
  const qKey = ["comments", managerId, isoDate];

  const { data: comments = [] } = useQuery({
    queryKey: qKey,
    queryFn: () => api.get("/api/comments", { params: { manager_id: managerId, date: isoDate } }).then(r => r.data),
    enabled: !!managerId && !!isoDate,
  });

  const addMutation = useMutation({
    mutationFn: () => api.post("/api/comments", { manager_id: managerId, date: isoDate, text }),
    onSuccess: () => { setText(""); qc.invalidateQueries(qKey); qc.invalidateQueries({ queryKey: ["comments-range"] }); },
  });

  const editMutation = useMutation({
    mutationFn: (id) => api.put(`/api/comments/${id}`, { text: editText }),
    onSuccess: () => { setEditingId(null); qc.invalidateQueries(qKey); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/comments/${id}`),
    onSuccess: () => { qc.invalidateQueries(qKey); qc.invalidateQueries({ queryKey: ["comments-range"] }); },
  });

  function startEdit(c) {
    setEditingId(c.id);
    setEditText(c.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  const isOwn = (c) => myId && String(c.author_telegram_id) === myId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", paddingTop: "var(--tg-safe-top, 0px)" }} onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-md flex flex-col overflow-hidden"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-[var(--brand-text)]" />
            <div>
              <div className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>{tl(managerName)}</div>
              <div className="text-xs" style={{ color: "var(--text-3)" }}>{date}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-3)" }} className="hover:text-red-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body (formula + comments) — keeps header/input pinned and
            prevents the card from clipping when the formula section is tall */}
        <div className="overflow-y-auto" style={{ flex: "1 1 auto", minHeight: 0 }}>
        {/* Formula section — only when opened from a heatmap cell */}
        {rawCell && (() => {
          const plan = commentPlanFormula(rawCell, t);
          const actual = commentActualFormula(rawCell, t);
          const Legend = ({ items }) => (
            <div className="mt-1.5 space-y-1">
              {items.map(({ num, label }) => (
                <div key={`${num}-${label}`} className="flex items-baseline gap-2 text-[10px]" style={{ color: "var(--text-4)" }}>
                  <span className="font-mono font-semibold flex-shrink-0" style={{ color: "var(--text-2)" }}>{num}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          );
          return (
            <div
              className="px-5 py-3"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-inner)" }}
            >
              {formulaCollapsible ? (
                <button
                  type="button"
                  onClick={() => setFormulaOpen((o) => !o)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[11px] uppercase tracking-wider font-bold transition-colors"
                  style={{
                    color: "var(--brand-text)",
                    background: "var(--brand-bg)",
                    border: "1px solid var(--brand-border)",
                    marginBottom: formulaOpen ? 12 : 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--brand-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--brand-bg)"; }}
                >
                  <span className="flex items-center gap-1.5">
                    <Calculator size={14} />
                    {t("comment.howCalculated")}
                  </span>
                  <ChevronDown
                    size={16}
                    className="transition-transform"
                    style={{ transform: formulaOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>
              ) : (
                <div
                  className="text-[10px] uppercase tracking-wider font-semibold mb-2"
                  style={{ color: "var(--text-4)" }}
                >
                  {t("comment.howCalculated")}
                </div>
              )}
              {(!formulaCollapsible || formulaOpen) && (
                <>
                  {/* Planned (P) row */}
                  <div className="mb-3">
                    <div className="text-[10px] mb-1" style={{ color: "var(--text-4)" }}>{t("zagruzka.planned")} (P)</div>
                    <div
                      className="text-[11px] font-mono rounded-lg px-2.5 py-2"
                      style={{ background: "var(--bg-card)", color: "var(--text-2)" }}
                    >
                      {plan?.formula || "P = prod_plan ÷ (480 × headcount) × 100%"}
                    </div>
                    {plan && <Legend items={plan.legend} />}
                  </div>
                  {/* Actual (A) row */}
                  <div>
                    <div className="text-[10px] mb-1" style={{ color: "var(--text-4)" }}>{t("zagruzka.actual")} (A)</div>
                    <div
                      className="text-[11px] font-mono rounded-lg px-2.5 py-2"
                      style={{ background: "var(--bg-card)", color: "var(--text-2)" }}
                    >
                      {actual?.formula || "A = prod_actual ÷ (effective_hc × adjusted_available_min) × 100%"}
                    </div>
                    {actual && <Legend items={actual.legend} />}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Comments list */}
        {!formulaOnly && <div className="px-5 py-3 space-y-2">
          {comments.length === 0 ? (
            <div className="text-xs text-center py-4" style={{ color: "var(--text-4)" }}>{t("comment.noComments")}</div>
          ) : comments.map((c) => (
            <div key={c.id} className="rounded-lg p-3 text-xs" style={{ background: "var(--bg-inner)" }}>
              {/* Author + actions */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium" style={{ color: "var(--text-2)" }}>
                  {tl(c.author_name) || t("comment.unknown")}
                </span>
                {isOwn(c) && editingId !== c.id && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(c)} style={{ color: "var(--text-3)" }} className="hover:text-[var(--brand-text)] transition-colors">
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(c.id)}
                      disabled={deleteMutation.isPending}
                      style={{ color: "var(--text-3)" }}
                      className="hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>

              {/* Editable or display text */}
              {editingId === c.id ? (
                <div>
                  <textarea
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={2}
                    autoFocus
                    className="w-full rounded-lg px-2 py-1.5 text-xs outline-none resize-none"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                  />
                  <div className="flex gap-2 mt-1.5">
                    <button
                      onClick={() => editMutation.mutate(c.id)}
                      disabled={!editText.trim() || editMutation.isPending}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-[var(--brand)] text-gray-900 disabled:opacity-40"
                    >
                      <Check size={11} /> Save
                    </button>
                    <button onClick={cancelEdit} className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: "var(--text-3)" }}>
                      <XCircle size={11} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ color: "var(--text-1)" }}>{c.text}</div>
              )}

              <div className="mt-1.5" style={{ color: "var(--text-4)" }}>
                {c.created_at?.slice(0, 16).replace("T", " ")}
              </div>
            </div>
          ))}
        </div>}
        </div>

        {/* New comment input */}
        {!formulaOnly && <div className="px-5 pb-4 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t("comment.addPlaceholder")}
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-sm mt-3 outline-none resize-none"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
          />
          <button
            onClick={() => addMutation.mutate()}
            disabled={!text.trim() || addMutation.isPending}
            className="mt-2 w-full py-2 rounded-lg text-sm font-semibold bg-[var(--brand)] hover:bg-[var(--brand-text)] text-gray-900 disabled:opacity-40 transition-colors"
          >
            {addMutation.isPending ? t("comment.saving") : t("comment.save")}
          </button>
        </div>}
      </div>
    </div>
  );
}
