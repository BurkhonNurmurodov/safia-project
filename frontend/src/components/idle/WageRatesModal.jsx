import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X, Wallet } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import DateRangePicker from "../ui/DateRangePicker";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

/**
 * The wage timeline behind /downtime → «Xarajat».
 *
 * An admin never creates a PERIOD; they put a BORDER on a date, which splits
 * whichever period contains it in two. That is the whole editing model, and it
 * is what makes a gap in the timeline unrepresentable — there is no control
 * that could leave one. The list opens as a single open-ended row and grows a
 * row per raise.
 *
 * Two rules the shape of this dialog exists to hold:
 *
 * **A blank rate is UNSET, never zero.** The input keeps its placeholder and
 * the row is marked, because "nobody has said what this period costs" and
 * "this period cost nothing" are different claims and only the first is ever
 * true here. Days inside such a period are left unpriced by the backend and
 * counted on the tab's «Narxlanmagan» card.
 *
 * **Saving a PAST period rewrites figures people have already read**, so the
 * confirm names how many days move rather than leaving the admin to work it
 * out. Deliberately possible — a rate typed wrong has to be fixable — but
 * never silent.
 */
export default function WageRatesModal({ open, onClose, periods, canEdit, from, to, onSaved }) {
  const { t } = useLang();
  const tp = (k, vars) => Object.entries(vars || {}).reduce(
    (out, [a, b]) => out.split(`{${a}}`).join(String(b)), t(k));
  const qc = useQueryClient();
  const [list, setList] = useState([]);
  const [border, setBorder] = useState(null);      // the date being picked
  const [ask, setAsk] = useState(null);            // "save" | {removeAt:i}
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setList((periods || []).length ? periods.map((p) => ({ ...p }))
                                  : [{ from: null, rate: null }]);
    setErr("");
    setAsk(null);
    setBorder(new Date().toISOString().slice(0, 10));
  }, [open, periods]);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const fmtDate = (iso) => (iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4)
                                : t("downtime.cost.rate.fromStart"));
  const group = (n) => (n == null || n === "" ? ""
    : String(n).replace(/\D/g, "").replace(/\B(?=(\d{3})+(?!\d))/g, " "));

  const setRate = (i, raw) => {
    const digits = String(raw).replace(/\D/g, "");
    setList((prev) => prev.map((p, k) => (k === i ? { ...p, rate: digits ? Number(digits) : null } : p)));
  };

  /** Split the period containing `iso`; the later half inherits the earlier
   *  rate, so the admin edits ONE number rather than two. */
  const addBorder = (iso) => {
    if (!iso) return;
    if (list.some((p) => p.from === iso)) { setErr(t("downtime.cost.rate.dup")); return; }
    setErr("");
    let i = list.length - 1;
    while (i > 0 && list[i].from && list[i].from > iso) i -= 1;
    const next = [...list];
    next.splice(i + 1, 0, { from: iso, rate: list[i].rate });
    setList(next);
  };

  const save = useMutation({
    mutationFn: () => api.put("/api/downtime/wage-rates",
      { periods: list, date_from: from, date_to: to }).then((r) => r.data),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["downtime-cost"] });
      setAsk(null);
      onSaved?.(d);
      onClose?.();
    },
    // The failure stays INSIDE the dialog: a mutation that fails must leave the
    // dialog standing with the reason on it.
    onError: (e) => setErr(e?.response?.data?.detail || t("downtime.cost.saveFailed")),
  });

  const live = (i) => {
    const nxt = list[i + 1];
    return (!nxt || nxt.from > todayISO) && (!list[i].from || list[i].from <= todayISO);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        icon={<Wallet size={16} />}
        title={t("downtime.cost.rate.title")}
        subtitle={t("downtime.cost.rate.sub")}
        maxWidth="max-w-xl"
        zIndex={60}
        footer={
          <>
            <Button variant="secondary" size="md" onClick={onClose}>
              {canEdit ? t("common.cancel") : t("downtime.cost.close")}
            </Button>
            <div className="flex-1" />
            {canEdit && (
              <Button size="md" loading={save.isPending} onClick={() => { setErr(""); setAsk("save"); }}>
                {t("common.save")}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-2">
          {list.map((p, i) => (
            <div
              key={`${p.from ?? "start"}-${i}`}
              className="flex items-center gap-3 rounded-xl border px-3 py-2.5"
              style={{
                background: live(i) ? "var(--brand-bg)" : "var(--bg-inner)",
                borderColor: p.rate == null ? "rgba(217,119,6,.35)"
                  : live(i) ? "var(--brand-border)" : "var(--border-md)",
              }}
            >
              <span className="flex-1 min-w-0 text-[13px] tabular-nums">
                {fmtDate(p.from)}
                <span className="mx-1.5" style={{ color: "var(--text-3)" }}>→</span>
                {list[i + 1] ? fmtDate(list[i + 1].from) : t("downtime.cost.rate.open")}
                {live(i) && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: "var(--brand-hover)", color: "var(--brand-text)" }}>
                    {t("downtime.cost.rate.inForce")}
                  </span>
                )}
                {p.from && p.from > todayISO && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: "var(--hover-bg)", color: "var(--text-3)" }}>
                    {t("downtime.cost.rate.scheduled")}
                  </span>
                )}
              </span>
              <input
                type="text"
                inputMode="numeric"
                disabled={!canEdit}
                value={group(p.rate)}
                onChange={(e) => setRate(i, e.target.value)}
                placeholder={t("downtime.cost.rate.unset")}
                aria-label={`${fmtDate(p.from)} — ${t("downtime.cost.rate.title")}`}
                className="w-[120px] h-[34px] px-2.5 text-right rounded-xl border text-[13.5px] font-semibold tabular-nums disabled:opacity-60"
                style={{ background: "var(--input-bg)", borderColor: "var(--border-md)", color: "var(--text-1)" }}
              />
              <span className="text-[11px] w-[58px]" style={{ color: "var(--text-3)" }}>
                {t("downtime.cost.rate.unit")}
              </span>
              {canEdit && i > 0 ? (
                <button
                  type="button"
                  onClick={() => setAsk({ removeAt: i })}
                  title={t("downtime.cost.rate.remove")}
                  aria-label={`${t("downtime.cost.rate.remove")} — ${fmtDate(p.from)}`}
                  className="w-[30px] h-[30px] grid place-items-center rounded-lg shrink-0"
                  style={{ color: "var(--text-4)" }}
                >
                  <X size={15} />
                </button>
              ) : <span className="w-[30px] shrink-0" />}
            </div>
          ))}

          {canEdit && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              {/* Never a bare <input type="date"> — the platform's own picker. */}
              <DateRangePicker
                single
                dateFrom={border}
                dateTo={border}
                setDateFrom={setBorder}
                setDateTo={setBorder}
                triggerClassName="px-3 py-2 text-sm"
              />
              <Button size="lg" variant="secondary" icon={<Plus size={14} />}
                      onClick={() => addBorder(border)}>
                {t("downtime.cost.rate.addBorder")}
              </Button>
            </div>
          )}

          {err && (
            <p className="text-[12px] rounded-lg px-3 py-2"
               style={{ background: "rgba(239,68,68,.10)", color: "#ef4444" }}>{err}</p>
          )}
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            {t("downtime.cost.rate.hint")}
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!ask}
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          if (ask?.removeAt != null) {
            setList((prev) => prev.filter((_, k) => k !== ask.removeAt));
            setAsk(null);
            return;
          }
          save.mutate();
        }}
        loading={save.isPending}
        error={ask === "save" ? err : ""}
        title={ask?.removeAt != null ? t("downtime.cost.rate.remove")
                                     : t("downtime.cost.rate.confirmTitle")}
        message={ask?.removeAt != null
          ? tp("downtime.cost.rate.confirmRemove", { date: fmtDate(list[ask.removeAt]?.from) })
          : t("downtime.cost.rate.confirmSave")}
        confirmLabel={t("common.save")}
      />
    </>
  );
}
