/**
 * THE task form — set a task, or edit one's text and date. ONE form for every
 * surface that sets work: the /tasks register and the «Rahbariyat vazifalari»
 * block on «Smena kunligi». It owns its own state, its pickers and its save,
 * so a page only says who may create at which tier and what to do afterwards.
 *
 *   kinds    the tiers THIS viewer may create at (utils/taskTiers) — the server
 *            says so per tier; the tier is asked only when there is a choice
 *   initial  { kind, assignee_id } to pre-fill a new task, or a task to edit:
 *            { id, kind, assignee_name, task_text, due_date } — its assignee is
 *            fixed (a task is never re-queued across people)
 *   showUnit a leader is listed with their unit (off where one unit is shown)
 *   onSaved  after a successful save, before the form closes
 *
 * Each picker is exactly the set its endpoint accepts — the list offered and
 * the people the create call takes can never be two sets.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Flame } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import Field from "../ui/FormField";
import StyledSelect from "../ui/StyledSelect";
import SegmentedToggle from "../ui/SegmentedToggle";
import DateRangePicker from "../ui/DateRangePicker";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import {
  KIND_LEADER, KIND_SUP, KIND_SM, ASSIGNEE_FIELD, endpointFor,
} from "../../utils/taskTiers";

// Bottom of the org chart first — the order the tier toggle has always had.
const TOGGLE_ORDER = [KIND_LEADER, KIND_SUP, KIND_SM];
const TAB_KEY = { [KIND_LEADER]: "btasks.tabLeader", [KIND_SUP]: "btasks.tabBrigadir", [KIND_SM]: "smtasks.tab" };
const FIELD_KEY = { [KIND_LEADER]: "tasks.fieldLeader", [KIND_SUP]: "btasks.fieldBrigadir", [KIND_SM]: "smtasks.field" };
const PICK_KEY = { [KIND_LEADER]: "tasks.pickLeader", [KIND_SUP]: "btasks.pickBrigadir", [KIND_SM]: "smtasks.pick" };

const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

export default function TaskFormModal({ kinds = [], initial = {}, showUnit = true, onClose, onSaved, zIndex }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const editing = !!initial.id;
  const offered = TOGGLE_ORDER.filter((k) => kinds.includes(k));
  const [form, setForm] = useState(() => ({
    kind: initial.kind && (editing || offered.includes(initial.kind)) ? initial.kind : offered[0],
    assignee_id: initial.assignee_id ?? null,
    task_text: initial.task_text || "",
    due_date: initial.due_date || "",
    comment: "",
    urgent: false,
  }));
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const { data: leaders = [] } = useQuery({
    queryKey: ["task-leaders"],
    queryFn: () => api.get("/api/tasks/leaders").then((r) => r.data),
    enabled: !editing && offered.includes(KIND_LEADER),
  });
  const { data: brigadirs = [] } = useQuery({
    queryKey: ["btask-brigadirs"],
    queryFn: () => api.get("/api/brigadir-tasks/brigadirs").then((r) => r.data),
    enabled: !editing && offered.includes(KIND_SUP),
  });
  const { data: managers = [] } = useQuery({
    queryKey: ["smtask-managers"],
    queryFn: () => api.get("/api/shift-manager-tasks/managers").then((r) => r.data),
    enabled: !editing && offered.includes(KIND_SM),
  });

  // One option per PERSON: a leader profile, a brigadir's unit, a shift
  // manager's profile.
  const options = {
    [KIND_LEADER]: leaders.map((l) => ({
      value: String(l.leader_profile_id),
      label: l.supervisor_name && showUnit ? `${tl(l.name)} · ${tl(l.supervisor_name)}` : tl(l.name),
    })),
    [KIND_SUP]: brigadirs.map((b) => ({ value: String(b.supervisor_manager_id), label: tl(b.name) })),
    [KIND_SM]: managers.map((m) => ({
      value: String(m.profile_id),
      label: m.shift ? `${tl(m.name)} · S${m.shift}` : tl(m.name),
    })),
  }[form.kind] || [];

  const save = useMutation({
    mutationFn: () => {
      const base = endpointFor(form.kind);
      if (editing) {
        return api.put(`${base}/${initial.id}`, { task_text: form.task_text.trim(), due_date: form.due_date }).then((r) => r.data);
      }
      return api.post(base, {
        task_text: form.task_text.trim(),
        due_date: form.due_date,
        comment: form.comment.trim() || null,
        urgent: !!form.urgent,
        [ASSIGNEE_FIELD[form.kind]]: form.assignee_id,
      }).then((r) => r.data);
    },
    onSuccess: (row) => { onSaved?.(row); onClose?.(); },
    onError: (e) => setError(e?.response?.data?.detail || t("tasks.saveError")),
  });

  const submit = () => {
    if (!editing && !form.assignee_id) return setError(t(PICK_KEY[form.kind]));
    if (!form.task_text.trim()) return setError(t("tasks.textRequired"));
    if (!form.due_date) return setError(t("tasks.dueRequired"));
    setError("");
    return save.mutate();
  };

  return (
    <Modal
      onClose={onClose}
      zIndex={zIndex}
      title={editing ? t("tasks.editTitle") : t("tasks.addTitle")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("tasks.cancel")}</Button>
          <Button loading={save.isPending} onClick={submit}>{t("tasks.save")}</Button>
        </>
      }
    >
      {/* Which tier — only asked when the viewer may create at more than one */}
      {!editing && offered.length > 1 && (
        <Field label={t("tasks.fieldTier")} required>
          <SegmentedToggle
            fill
            value={form.kind}
            onChange={(k) => set({ kind: k, assignee_id: null })}
            options={offered.map((k) => [k, t(TAB_KEY[k])])}
          />
        </Field>
      )}

      <Field label={t("tasks.fieldTask")} required>
        <textarea
          value={form.task_text}
          onChange={(e) => set({ task_text: e.target.value })}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
          style={inputStyle}
        />
      </Field>

      {/* Assignee — fixed on edit (re-queueing across people is not supported) */}
      <Field label={t(FIELD_KEY[form.kind])} required={!editing}>
        {editing ? (
          <div className="w-full rounded-lg px-3 py-2 text-sm" style={{ ...inputStyle, color: "var(--text-2)" }}>
            {tl(initial.assignee_name) || "—"}
          </div>
        ) : (
          <StyledSelect
            value={form.assignee_id ? String(form.assignee_id) : ""}
            onChange={(v) => set({ assignee_id: v ? Number(v) : null })}
            options={options}
            placeholder={t(PICK_KEY[form.kind])}
          />
        )}
      </Field>

      <Field label={t("tasks.fieldDue")} required>
        <DateRangePicker
          single
          dateFrom={form.due_date}
          dateTo={form.due_date}
          setDateFrom={(v) => set({ due_date: v })}
          setDateTo={() => {}}
        />
      </Field>

      {/* The flame, asked once when the task is set. Afterwards it is the
          row's own one-tap control — and its own right, so the edit form
          (open to the task's author) deliberately does not carry it. */}
      {!editing && (
        <Field label={t("tasks.fieldUrgent")} hint={t("tasks.urgentHint")}>
          <SegmentedToggle
            fill
            value={!!form.urgent}
            onChange={(v) => set({ urgent: v })}
            options={[
              { value: false, label: t("tasks.urgentOff") },
              { value: true, label: (
                <span className="inline-flex items-center gap-1.5">
                  <Flame size={12} /> {t("tasks.urgentOn")}
                </span>
              ) },
            ]}
          />
        </Field>
      )}

      {/* Optional first comment — becomes the opening message of the thread */}
      {!editing && (
        <Field label={t("tasks.fieldComment")}>
          <textarea
            value={form.comment}
            onChange={(e) => set({ comment: e.target.value })}
            rows={2}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
            style={inputStyle}
          />
        </Field>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertTriangle size={13} /> {error}
        </div>
      )}
    </Modal>
  );
}
