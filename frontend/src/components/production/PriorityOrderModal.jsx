// «Navbatni tartiblash» (2026-11-12, the operator): a team's products in the
// order it makes them today, rearranged by dragging rows — the way the column
// picker reorders columns. Saving numbers the WHOLE list 1…n in the order on
// screen (POST /api/production/priority/team), so a team's order never has a
// gap or a repeat. docs/production-quantities.md «Navbat».
import { useEffect, useMemo, useState } from "react";
import { ListOrdered } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import StyledSelect from "../ui/StyledSelect";
import SortableList from "../ui/SortableList";

const norm = (v) => String(v ?? "").trim().toUpperCase();
export const teamKeyOf = (r) => `${norm(r.work_center)}|${r.wc_group ?? ""}`;
const lineKeyOf = (r) => `${r.qty_key ?? r.sap_code}\u0001${r.line_key}`;

export default function PriorityOrderModal({
  open, onClose, rows, initialTeam, teamLabel, onSave, saving, t, fmt, tx,
}) {
  // Every team on the table, in the table's order of first appearance.
  const teams = useMemo(() => {
    const seen = new Map();
    for (const r of rows) {
      const k = teamKeyOf(r);
      if (!seen.has(k)) seen.set(k, { key: k, wc: r.work_center, group: r.wc_group ?? null });
    }
    return [...seen.values()];
  }, [rows]);
  const [team, setTeam] = useState(null);
  useEffect(() => {
    if (open) setTeam(teams.some((x) => x.key === initialTeam) ? initialTeam : teams[0]?.key ?? null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const teamRows = useMemo(() => rows
    .filter((r) => teamKeyOf(r) === team)
    .sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity) || (a.seq ?? 0) - (b.seq ?? 0)),
  [rows, team]);
  const initial = useMemo(() => teamRows.map(lineKeyOf), [teamRows]);
  const [order, setOrder] = useState(initial);
  useEffect(() => { setOrder(initial); }, [initial]);
  const byKey = useMemo(() => Object.fromEntries(teamRows.map((r) => [lineKeyOf(r), r])), [teamRows]);
  const dirty = order.join("|") !== initial.join("|")
    || teamRows.some((r) => r.priority == null);   // unordered lines get numbers on save
  const changed = order.join("|") !== initial.join("|");
  const cur = teams.find((x) => x.key === team);

  const save = () => {
    if (!cur) return;
    onSave({
      work_center: cur.wc, group: cur.group,
      lines: order.map((k) => ({ sap_code: byKey[k].qty_key ?? byKey[k].sap_code, line_key: byKey[k].line_key })),
    });
  };

  return (
    <Modal open={open} onClose={onClose} dirty={changed}
      title={t("production.priority.orderTitle")}
      subtitle={t("production.priority.orderHint")}
      icon={<ListOrdered size={16} />}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{t("production.cancelEdit")}</Button>
          <Button onClick={save} loading={saving} disabled={!cur || !order.length || !dirty}>
            {t("production.priority.orderSave")}
          </Button>
        </>
      )}>
      <div className="flex flex-col gap-3">
        <StyledSelect
          value={team ?? ""}
          onChange={(v) => setTeam(v)}
          disabled={changed}
          title={changed ? t("production.priority.orderSaveFirst") : undefined}
          options={teams.map((x) => ({ value: x.key, label: teamLabel(x.wc, x.group) }))}
        />
        {order.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("production.priority.orderEmpty")}</p>
        ) : (
          <SortableList
            items={order.map((k) => ({
              key: k,
              render: (i) => {
                const r = byKey[k];
                return (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-6 flex-shrink-0 flex items-center justify-center rounded-md text-xs font-bold tabular-nums"
                      style={{ background: "rgba(200,151,63,0.16)", color: "var(--brand-text)" }}>{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate text-[13px]" style={{ color: "var(--text-1)" }}
                      title={tx(r.name)}>{tx(r.name)}</span>
                    {r.sap_code && (
                      <span className="hidden sm:inline font-mono text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>{r.sap_code}</span>
                    )}
                    <span className="text-[11px] tabular-nums flex-shrink-0 w-14 text-right" style={{ color: "var(--text-3)" }}>
                      {r.plan_qty ? fmt(r.plan_qty, 0) : "—"}
                    </span>
                  </div>
                );
              },
            }))}
            onChange={setOrder}
            label={(k) => `${t("production.priority.move")}: ${tx(byKey[k]?.name ?? "")}`}
          />
        )}
      </div>
    </Modal>
  );
}
