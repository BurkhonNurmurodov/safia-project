import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Flag, CalendarClock, AlertTriangle, UserPlus, Check } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import FormField from "./ui/FormField";
import StyledSelect from "./ui/StyledSelect";
import { SkeletonBlock } from "./ui/Skeleton";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";

/**
 * THE «Boshqaruvchi» picker of a cell (the Verifix live sync, 2026-10-12,
 * the operator's ruling 3): the Verifix SEAT — the leader Verifix places in the
 * cell — runs it by default («Verifix bo'yicha»); a brigadir (or an admin) may
 * pick ONE worker Verifix places in a cell of the unit instead. Never free
 * text, never somebody who is not on Verifix: the list is the server's pool,
 * GET /api/profiles/admin/cells/{id}/manager-pool, and nothing else.
 *
 * A pick is DATED — it lands at the unit's next shift opening — and the
 * control says so under itself, beside what runs the cell now and any change
 * already waiting. Picking «Verifix bo'yicha» returns the cell to its seat.
 *
 * Controlled: `value` is undefined while nothing was picked (the control
 * shows the cell's latest decision), "" for «Verifix bo'yicha», else the
 * picked Verifix employee id. `onChange` reports undefined again when the
 * reader goes back to what the cell already had — so a caller applies the pick
 * (PUT …/manager) only when it CHANGED.
 *
 * Used by the cell form (CellFormModal) and by CellManagerDialog below — the
 * brigadir's own door on /cells and /cells/:id, where nothing else of the cell
 * is theirs to edit.
 */

// The latest manual decision that is not in the pool (a grandfathered manager
// Verifix never found, say) — shown, kept, never re-sent.
const KEEP = "__keep__";

const fill = (s, vars) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
// "2026-10-13" → "13.10" — the operator's «{dd.mm} dan» form.
const ddmm = (iso) => {
  const s = String(iso || "");
  return s.length >= 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : s;
};

// A role a Verifix person already holds here, as the platform names roles.
const ROLE_KEY = {
  supervisor: "role.supervisor", "shift-manager": "role.manager",
  "top-manager": "role.topManager", admin: "role.admin", guest: "role.guest",
  "idle-owner": "role.idleOwner",
};
// The warning ink: the platform's amber at full strength on dark, its 700
// shade on light, so a warning stays readable (AA) on both themes.
const WARN = "var(--status-warn, #eab308)";

const poolQuery = (cellId) => ({
  queryKey: ["cell-manager-pool", Number(cellId)],
  queryFn: () => api.get(`/api/profiles/admin/cells/${cellId}/manager-pool`).then((r) => r.data),
  staleTime: 30_000,
});

// Why a pool person cannot run the cell (the server's `pickable: false`).
function whyNot(it, t) {
  // An untied profile that may already be this person: tie them by hand first.
  if (it.maybe) return fill(t("cellMgr.whyMaybe"), { name: it.maybe.name || "" });
  if (it.profile_role && it.profile_role !== "leader") {
    const key = ROLE_KEY[it.profile_role];
    return fill(t("cellMgr.whyRole"), { role: key ? t(key) : it.profile_role });
  }
  return t("cellMgr.whyUnit");
}

/** «13.10 dan: Name» — a change recorded and not yet in force. A neutral chip
 *  (a date, not a status), cut with «…» where the column is narrow. */
export function PendingChip({ from, name, title }) {
  const { t } = useLang();
  const text = fill(t("cellMgr.from"), { date: ddmm(from), name });
  return (
    <span
      title={title || text}
      className="inline-flex items-center gap-1 min-w-0 max-w-full text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap align-middle"
      style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border-md)" }}
    >
      <CalendarClock size={11} className="flex-shrink-0" aria-hidden="true" style={{ color: "var(--text-3)" }} />
      <span className="truncate min-w-0">{text}</span>
    </span>
  );
}

/** «qo'lda» — the cell's «Boshqaruvchi» was picked by a person, not the seat. */
export function ManualMark() {
  const { t } = useLang();
  return (
    <span
      title={t("cellMgr.manualTip")}
      aria-label={t("cellMgr.manualTip")}
      className="inline-flex items-center flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-md whitespace-nowrap align-middle"
      style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}
    >
      {t("cellMgr.manual")}
    </span>
  );
}

function Note({ icon: Icon, tone, children }) {
  const color = tone === "warn" ? WARN : "var(--text-3)";
  return (
    <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
      {Icon && <Icon size={12} className="flex-shrink-0 mt-px" aria-hidden="true" style={{ color }} />}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export default function CellManagerPicker({ cellId, value, onChange, disabled = false }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  // The person the reader last tried to pick who cannot run the cell. The
  // template lists such a row disabled (its reason in the tooltip); a pick
  // that still arrives — a stale value — is refused here, the reason said
  // under the control.
  const [refused, setRefused] = useState(null);
  const q = useQuery({ ...poolQuery(cellId), enabled: !!cellId });

  if (q.isLoading) {
    return (
      <div className="mt-1">
        {/* The trigger's own height (38px), so nothing under it moves on load. */}
        <SkeletonBlock className="h-[38px] w-full rounded-lg" />
        <SkeletonBlock className="h-3 w-2/3 mt-2" />
      </div>
    );
  }
  if (q.isError) {
    const forbidden = q.error?.response?.status === 403;
    return (
      <div className="mt-1">
        <Note icon={AlertTriangle} tone="warn">
          {t(forbidden ? "cellMgr.forbidden" : "cellMgr.loadFailed")}
        </Note>
        {!forbidden && (
          <Button variant="secondary" size="sm" className="mt-1.5" loading={q.isFetching}
                  onClick={() => q.refetch()}>
            {t("common.retry")}
          </Button>
        )}
      </div>
    );
  }
  const pool = q.data || {};
  const items = pool.pool || [];
  const seat = pool.seat || null;
  const seatOk = !!(seat && seat.pickable);
  const twoSeats = (pool.two_seats || []).length;

  // What the cell holds from its next opening on: the change waiting, else the
  // one in force. In «verifix» mode that is the seat — the "" option.
  const latestId = pool.pending ? pool.pending.id : (pool.current?.id ?? null);
  const latestName = pool.pending ? pool.pending.name : pool.current?.name;
  let base = "";
  if (pool.mode === "manual") {
    const hit = items.find((i) => i.profile_id != null && i.profile_id === latestId);
    base = hit ? hit.employee_id : KEEP;
  }
  const shown = value === undefined ? base : value;
  const picked = items.find((i) => i.employee_id === shown) || null;

  const choose = (v) => {
    const it = items.find((i) => i.employee_id === v);
    if (it && !it.pickable) { setRefused(it); return; }
    setRefused(null);
    if (v === KEEP || v === base) onChange(undefined);
    else onChange(v);
  };

  // A seat that holds another role here cannot run the cell: «Verifix bo'yicha»
  // then means NO manager (the server's `pick_manager`), and the label names
  // the seat rather than claiming the cell has none.
  const seatLabel = seat
    ? tl(seat.name)
    : twoSeats > 1 ? fill(t("cellMgr.twoSeats"), { n: twoSeats }) : t("cellMgr.noSeat");
  const verifixText = `${t("cellMgr.byVerifix")} — ${seatLabel}`;
  const options = [
    {
      value: "",
      title: verifixText,
      label: (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold flex-shrink-0">{t("cellMgr.byVerifix")}</span>
          <span className="truncate min-w-0" style={{ color: "var(--text-3)" }}>— {seatLabel}</span>
        </span>
      ),
    },
  ];
  if (base === KEEP) {
    const nm = latestName ? tl(latestName) : t("admin.profiles.cellUnassigned");
    options.push({
      value: KEEP,
      title: `${nm} · ${t("cellMgr.manual")}`,
      label: (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate min-w-0">{nm}</span>
          <span className="flex-shrink-0 text-[11px]" style={{ color: "var(--text-3)" }}>· {t("cellMgr.manual")}</span>
        </span>
      ),
    });
  }
  for (const it of items) {
    // The seat is the «Verifix bo'yicha» row above; listed again only when a
    // person picked them by hand (rare — the server reads that as the seat).
    if (seat && it.employee_id === seat.employee_id && base !== it.employee_id) continue;
    const kind = t(it.is_leader ? "profile.leaderKind.leader" : "profile.leaderKind.acting");
    const why = it.pickable ? null : whyNot(it, t);
    const facts = [it.cell, it.job ? tx(it.job) : null, kind].filter(Boolean).join(" · ");
    const extra = [
      !it.pickable ? why : null,
      it.pickable && it.profile_id == null ? t("cellMgr.newProfile") : null,
      it.pickable && it.profile_unit != null && it.profile_unit !== pool.unit_id ? t("cellMgr.otherUnit") : null,
    ].filter(Boolean);
    const name = tl(it.name);
    options.push({
      value: it.employee_id,
      disabled: !it.pickable,
      // Plain text — what the search box matches and the tooltip shows.
      title: [name, facts, ...extra].filter(Boolean).join(" · "),
      label: (
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="truncate min-w-0" style={{ flexShrink: 1 }}>{name}</span>
          <span className="truncate min-w-0 text-[11px]" style={{ color: "var(--text-3)", flexShrink: 2 }}>
            · {facts}{why ? ` · ${why}` : ""}
          </span>
        </span>
      ),
    });
  }

  const blocked = !!pool.reason;
  const changed = value !== undefined;
  const cur = pool.current;
  return (
    <div className="mt-1">
      <StyledSelect
        value={shown}
        onChange={choose}
        options={options}
        searchable
        searchPlaceholder={t("cellMgr.searchPh")}
        disabled={disabled || blocked}
        ariaLabel={t("admin.profiles.colCellManager")}
      />
      {pool.reason && (
        <Note icon={AlertTriangle} tone="warn">{t(`cellMgr.reason.${pool.reason}`)}</Note>
      )}
      <p className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
        <span className="min-w-0">
          {fill(t("cellMgr.now"), { name: cur ? tl(cur.name) : t("admin.profiles.cellUnassigned") })}
        </span>
        {cur && cur.vfx === false && (
          <span className="inline-flex items-center gap-1" style={{ color: WARN }}>
            <AlertTriangle size={11} aria-hidden="true" />{t("cellMgr.notOnVerifix")}
          </span>
        )}
        {pool.pending && (
          <PendingChip from={pool.pending.from}
                       name={pool.pending.name ? tl(pool.pending.name) : t("admin.profiles.cellUnassigned")} />
        )}
      </p>
      {!seatOk && shown === "" && !blocked && (
        <Note icon={AlertTriangle} tone="warn">
          {seat
            ? fill(t("cellMgr.seatBlockedNote"), { name: tl(seat.name), why: whyNot(seat, t) })
            : twoSeats > 1 ? fill(t("cellMgr.twoSeatsNote"), { n: twoSeats }) : t("cellMgr.noSeatNote")}
        </Note>
      )}
      {refused && (
        <Note icon={AlertTriangle} tone="warn">
          {fill(t("cellMgr.cantPick"), { name: tl(refused.name), why: whyNot(refused, t) })}
        </Note>
      )}
      {changed && picked && picked.profile_id == null && (
        <Note icon={UserPlus}>{fill(t("cellMgr.willCreate"), { name: tl(picked.name) })}</Note>
      )}
      {pool.next_opening && (
        <Note icon={changed ? Check : CalendarClock}>
          {fill(t("cellMgr.lands"), { date: ddmm(pool.next_opening) })}
        </Note>
      )}
    </div>
  );
}

// ── The texts both the form and the dialog say about a pick ──────────────────

// PUT …/manager refusals (`detail_raw.code`), in the reader's language.
function managerErrorText(e, t) {
  const res = e?.response?.data;
  const raw = res?.detail_raw;
  if (e?.response?.status === 403) return t("cellMgr.forbidden");
  switch (raw?.code) {
    case "not_in_pool":
    case "other_role":
    case "already_tied":
      return t(`cellMgr.err.${raw.code}`);
    case "name_exists":
      return fill(t("cellMgr.err.name_exists"), { name: raw?.params?.name || "" });
    case "maybe_existing":
      return fill(t("cellMgr.err.maybe_existing"), { name: raw?.params?.name || "" });
    default:
      return (typeof res?.detail === "string" && res.detail) || t("admin.profiles.error");
  }
}

// The PUT …/manager answer ({from, mode, created}) as one sentence.
function managerSavedText(res, t) {
  if (!res?.from) return t("cellMgr.savedNone");
  const s = fill(t(res.mode === "manual" ? "cellMgr.savedManual" : "cellMgr.savedVerifix"),
                 { date: ddmm(res.from) });
  return res.created ? `${s} · ${t("cellMgr.savedCreated")}` : s;
}

// Statics, not named exports: react-refresh allows a component module to
// export components only (the CellFormModal.errorText precedent).
CellManagerPicker.poolQuery = poolQuery;
CellManagerPicker.errorText = managerErrorText;
CellManagerPicker.savedText = managerSavedText;
CellManagerPicker.ddmm = ddmm;

/**
 * «Boshqaruvchini tanlash» — the picker alone in a dialog: the brigadir's door
 * on /cells and /cells/:id (they hold nothing else of the cell to edit), and a
 * quick path for an admin. Save applies the pick (PUT …/manager) and refreshes
 * the register; `onSaved(text)` hands the caller the sentence that says from
 * when it counts, for its toast. `cell` = {id, verifix_code}; `subtitle` names
 * whose cell it is (the brigadir).
 */
export function CellManagerDialog({ cell, subtitle, onClose, onSaved, zIndex }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [pick, setPick] = useState(undefined);
  const [err, setErr] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      api.put(`/api/profiles/admin/cells/${cell.id}/manager`, { employee_id: pick === "" ? null : pick })
        .then((r) => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-cells"] });
      qc.invalidateQueries({ queryKey: ["cell-manager-pool"] });
      onSaved?.(managerSavedText(res, t));
      onClose();
    },
    onError: (e) => setErr(managerErrorText(e, t)),
  });
  return (
    <Modal
      onClose={onClose}
      dismissable={!mut.isPending}
      title={`${t("cellMgr.pickTitle")} · ${cell.verifix_code || ""}`}
      subtitle={subtitle}
      icon={<Flag size={16} />}
      maxWidth="max-w-sm"
      zIndex={zIndex}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={mut.isPending}>
            {t("admin.users.cancel")}
          </Button>
          <Button size="sm" icon={<Check size={12} />} loading={mut.isPending}
                  disabled={pick === undefined} onClick={() => { setErr(""); mut.mutate(); }}>
            {t("admin.profiles.save")}
          </Button>
        </>
      }
    >
      <FormField label={t("admin.profiles.colCellManager")} error={err || undefined}>
        <CellManagerPicker cellId={cell.id} value={pick}
                           onChange={(v) => { setErr(""); setPick(v); }} disabled={mut.isPending} />
      </FormField>
    </Modal>
  );
}
