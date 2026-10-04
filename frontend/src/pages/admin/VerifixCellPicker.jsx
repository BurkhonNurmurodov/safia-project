/**
 * The cell picker behind «Verifix'dan olish» on «Davomat (Verifix)»
 * (2026-10-04). The cells counted in the загрузка, nested plant → shift →
 * brigadir → cell in the platform's one CheckboxTree (the Broadcast picker's),
 * so a read can ask Verifix about one cell, one brigadir, one shift or one
 * plant instead of the whole list.
 *
 * A read replaces the ticked cells only — every other cell already read for
 * the day stays as it was — and the dialog says so whenever the day holds a
 * read. Each cell says when it was last read («olingan 04.10 18:20»), amber
 * when that read ran out of time, so the gaps of a day can be read again
 * without re-reading the plant.
 */
import { useMemo, useState } from "react";
import { Clock, CloudDownload, Factory, UserX, Users } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import SearchInput from "../../components/ui/SearchInput";
import CheckboxTree, { collectLeafKeys, filterGroups } from "../../components/ui/CheckboxTree";
import { factoryName } from "../../context/FactoryContext";

const fill = (s, vars) => String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));

const NONE = "none";

/**
 * The payload's `pick` → CheckboxTree groups: plant ▸ shift ▸ brigadir ▸ cell,
 * then one trailing branch for the cells no brigadir owns (a cell follows its
 * brigadir's unit, so it has no plant and no shift either). Leaves are keyed by
 * the cell's verifix code — what the read is sent.
 */
function buildGroups(pick, { t, tl, lang, fmtAt }) {
  const plants = new Map();
  const orphans = [];
  const leaf = (c) => {
    const r = c.read;
    let hint;
    let hintTone;
    if (r?.partial) {
      hint = fill(t("attVfx.pick.partialHint"), { at: fmtAt(r.at) });
      hintTone = "warn";
    } else if (r?.at) {
      hint = fill(t("attVfx.pick.readHint"), { at: fmtAt(r.at) });
    }
    const sub = [c.leader ? tl(c.leader) : null, c.archived ? t("attVfx.pick.archived") : null]
      .filter(Boolean).join(" · ");
    return { key: c.code, label: c.code, sub: sub || undefined, hint, hintTone };
  };

  for (const c of pick?.cells || []) {
    if (c.manager_id == null) {
      orphans.push(leaf(c));
      continue;
    }
    const fid = c.factory_id ?? NONE;
    if (!plants.has(fid)) plants.set(fid, new Map());
    const shifts = plants.get(fid);
    const sid = c.shift ?? NONE;
    if (!shifts.has(sid)) shifts.set(sid, new Map());
    const units = shifts.get(sid);
    if (!units.has(c.manager_id)) units.set(c.manager_id, { name: c.manager_name, cells: [] });
    units.get(c.manager_id).cells.push(leaf(c));
  }

  // Plants in the register's own order, a unit no plant owns last.
  const order = new Map((pick?.factories || []).map((f, i) => [f.id, i]));
  const byId = new Map((pick?.factories || []).map((f) => [f.id, f]));
  const rank = (fid) => (fid === NONE ? 1e9 + 1 : (order.get(fid) ?? 1e9));

  const groups = [...plants.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([fid, shifts]) => {
      const f = byId.get(fid);
      const fKey = `f:${fid}`;
      return {
        key: fKey,
        label: fid === NONE ? t("attVfx.pick.noFactory") : (factoryName(f, lang) || f?.code || String(fid)),
        icon: Factory,
        children: [...shifts.entries()]
          .sort(([a], [b]) => (a === NONE) - (b === NONE) || Number(a) - Number(b))
          .map(([sid, units]) => {
            const sKey = `${fKey}/s:${sid}`;
            return {
              key: sKey,
              label: sid === NONE ? t("admin.profiles.noShift") : t("admin.cleanup.shiftN").replace("{n}", sid),
              icon: Clock,
              children: [...units.entries()]
                .map(([mid, u]) => ({ mid, label: tl(u.name || ""), cells: u.cells }))
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((u) => ({ key: `${sKey}/m:${u.mid}`, label: u.label, icon: Users, children: u.cells })),
            };
          }),
      };
    });
  if (orphans.length) {
    groups.push({ key: "nosup", label: t("attUp.noSupervisor"), icon: UserX, children: orphans });
  }
  return groups;
}

export default function VerifixCellPicker({
  pick, initial, dateLabel, hasReads, onClose, onConfirm, t, tl, lang, fmtAt,
}) {
  // Only codes the tree offers: a count must never include a cell nobody can see.
  const [selected, setSelected] = useState(() => {
    const offered = new Set((pick?.cells || []).map((c) => c.code));
    return [...new Set(initial || [])].filter((k) => offered.has(k));
  });
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => buildGroups(pick, { t, tl, lang, fmtAt }), [pick, t, tl, lang, fmtAt]);
  const allKeys = useMemo(() => collectLeafKeys(groups), [groups]);
  // «Select all» means what is on screen: search a brigadir, see their cells,
  // tick them — never silently the whole plant.
  const visibleKeys = useMemo(
    () => (filter.trim() ? collectLeafKeys(filterGroups(groups, filter)) : allKeys),
    [groups, allKeys, filter],
  );
  const cells = useMemo(() => pick?.cells || [], [pick]);
  const unread = useMemo(() => cells.filter((c) => !c.read).map((c) => c.code), [cells]);
  const partial = useMemo(() => cells.filter((c) => c.read?.partial).map((c) => c.code), [cells]);

  const n = selected.length;
  const filtered = !!filter.trim();
  const allVisibleOn = useMemo(() => {
    const on = new Set(selected);
    return visibleKeys.every((k) => on.has(k));
  }, [selected, visibleKeys]);

  return (
    <Modal
      onClose={onClose}
      icon={<CloudDownload size={16} style={{ color: "var(--brand-text)" }} />}
      title={t("attVfx.pick.title")}
      subtitle={fill(t("attVfx.pick.subtitle"), { date: dateLabel, n: allKeys.length })}
      bodyClassName="flex flex-col"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
          <Button icon={<CloudDownload size={14} />} disabled={!n} onClick={() => onConfirm(selected)}>
            {fill(t("attVfx.pick.submit"), { n })}
          </Button>
        </>
      }
    >
      <div className="px-5 pt-4 pb-3 space-y-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <SearchInput value={filter} onChange={setFilter} placeholder={t("attVfx.pick.search")} />
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="ghost" size="sm"
            disabled={!visibleKeys.length || allVisibleOn}
            onClick={() => setSelected((prev) => [...new Set([...prev, ...visibleKeys])])}
          >
            {filtered
              ? fill(t("attVfx.pick.selectMatches"), { n: visibleKeys.length })
              : t("attVfx.pick.selectAll")}
          </Button>
          <Button variant="ghost" size="sm" disabled={!n} onClick={() => setSelected([])}>
            {t("attVfx.pick.clear")}
          </Button>
          {/* The day's gaps, one press each — offered only where there are some. */}
          {hasReads && unread.length > 0 && unread.length < allKeys.length && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(unread)}>
              {fill(t("attVfx.pick.onlyUnread"), { n: unread.length })}
            </Button>
          )}
          {partial.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(partial)}>
              {fill(t("attVfx.pick.onlyPartial"), { n: partial.length })}
            </Button>
          )}
        </div>
      </div>

      {/* A fixed height: opening a plant must not move the buttons under it. */}
      <div className="px-3 py-2 overflow-y-auto" style={{ height: "min(52vh, 420px)", flex: "0 0 auto" }}>
        <CheckboxTree
          groups={groups}
          selected={selected}
          onChange={setSelected}
          filter={filter}
          emptyText={t("attUp.noMatch")}
        />
      </div>

      {hasReads && (
        <div className="px-5 py-2.5 text-[11px] flex-shrink-0"
             style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
          {t("attVfx.pick.keepNote")}
        </div>
      )}
    </Modal>
  );
}
