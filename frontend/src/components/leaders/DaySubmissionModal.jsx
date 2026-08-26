import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera, Check, X, Minus, Lock, RotateCcw, Eraser, ExternalLink, ShieldAlert,
  Hourglass, Pencil, CircleDashed, CloudOff, Clock,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Lightbox from "../ui/Lightbox";
import { SkeletonBlock } from "../ui/Skeleton";
import EmptyState from "../ui/EmptyState";
import { BotPhoto, ReportPhoto, RollPhoto } from "./ProofPhoto";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

/**
 * ONE submitted leader-day, opened from the admin «Liderlar kunlik vazifalari»
 * tab: every task, the answer the leader gave, the reason they typed, every
 * proof photo they uploaded, and what the AI made of it.
 *
 * It reads `/api/leaders/report/{uid}` — the SAME payload the day-report page
 * and the report DM are built from — rather than a second admin-only shape.
 * That is the whole reason it can be trusted: a score, a verdict or a photo
 * count shown here is the one the leader and the brigadir were shown, because
 * it came out of the same read. A separate admin projection is how three
 * surfaces end up printing three numbers for one day.
 *
 * What it adds on top is the authority: an admin can take ONE submitted task
 * back («Qayta ochish»), or take it back and empty it («Tozalash»). Both go
 * through the shared cores in `leader_close`, so a task reopened here and one
 * reopened from the bot's own locked-task screen end in the same state.
 *
 * It renders an UNFINISHED day in exactly the same shape. That is the point:
 * until this existed, a day the leader had not submitted had no detail anywhere
 * on the platform — `build_report_row` serves closed days only — so proofs that
 * were already uploaded were, for an open day, visible to nobody. A bot day is
 * therefore fetched from `/admin/leader-tasks/day/{id}`, which DELEGATES to
 * `day_report` once the day is closed (so the shared answer stays the shared
 * answer) and projects the in-progress day into the same keys otherwise.
 *
 * Three facts only the open view can show, and each has its own mark: a task
 * nobody has started, a task answered but not SUBMITTED (a draft — what holds a
 * 1×1 day open), and a camera roll sitting on the server for a task that has
 * not reached `min_media`, which is the difference between "they never filed"
 * and "they filed and the platform is holding it".
 */

const ddmm = (iso) => (iso ? String(iso).split("-").reverse().join(".") : "—");

const hhmm = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** The three answers a task can carry, in the platform status palette. Grey is
 *  «not asked» — a question the leader was never put, which is neither a pass
 *  nor a failure and must not be coloured like one. */
function AnswerChip({ t, task }) {
  const [color, Icon, label] =
    task.answered === false ? ["#94a3b8", Minus, t("admin.ltd.notAsked")]
      : task.done ? ["#22c55e", Check, t("admin.ltd.yes")]
        : ["#ef4444", X, t("admin.ltd.no")];
  return (
    <span className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium"
      style={{ background: `${color}1F`, border: `1px solid ${color}59`, color }}>
      <Icon size={11} />{label}
    </span>
  );
}

/**
 * How the task STANDS, as one word, in the platform status palette.
 *
 * The vocabulary is the backend's own (`leader_close.task_state`), not a second
 * set invented here: five states, and the register, the bot menu and this modal
 * must agree about which one a task is in. Grey is "not started" — an absence,
 * never a failure — and amber is a draft, the state that quietly holds a whole
 * 1×1 day open.
 */
const STATE = {
  open:    { color: "#94a3b8", Icon: CircleDashed, key: "admin.ltd.stOpenTask" },
  draft:   { color: "#eab308", Icon: Pencil,       key: "admin.ltd.stDraft",
             hint: "admin.ltd.stDraftHint" },
  pending: { color: "#94a3b8", Icon: Hourglass,    key: "admin.ltd.aiPending" },
  passed:  { color: "#22c55e", Icon: Check,        key: "admin.ltd.stPassed" },
  failed:  { color: "#ef4444", Icon: X,            key: "admin.ltd.stFailed" },
};

function Mark({ color, icon: Icon, label, title }) {
  return (
    <span title={title}
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: `${color}1F`, border: `1px solid ${color}59`, color }}>
      {Icon && <Icon size={11} />}{label}
    </span>
  );
}

function TaskRow({ task, uid, lang, T, onPhoto, onReopen, onWipe, busy }) {
  const { t } = useLang();
  // Authority comes off the PAYLOAD, not off the list row: the day detail is
  // the thing that actually knows which locks stand, and threading a second
  // answer in from the table is how the button appears on a task that has none.
  const locked = !!task.locked;
  const roll = task.roll || [];
  // Both layers hand their photos over in their own shape: the bot ships media
  // ids out of the archive channel, the sheet ships Drive links. Normalised
  // once here so the thumbnail strip below knows nothing about either.
  const photos = useMemo(() => {
    if (Array.isArray(task.media) && task.media.length) {
      return task.media.map((m) => ({ kind: "bot", id: typeof m === "object" ? m.id : m }));
    }
    return String(task.photo || "")
      .split(",").map((s) => s.trim()).filter((s) => s.includes("http"))
      .map((url) => ({ kind: "sheet", url }));
  }, [task.media, task.photo]);

  const name = task.name?.[lang] || task.name?.ru || task.name?.uz || `#${task.id}`;
  const st = STATE[task.state];
  const min = Number(task.minMedia || 0);

  return (
    <div className="rounded-xl px-3 py-2.5 space-y-2"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-2">
        <span className="text-[11px] font-semibold shrink-0 mt-0.5"
          style={{ color: "var(--text-4)" }}>{task.id}</span>
        <span className="text-xs font-medium flex-1 min-w-0" style={{ color: "var(--text-1)" }}>
          {name}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {/* The answer, then how the task STANDS. Two different questions: a
              task can be answered «Ha» and still be a draft nobody submitted. */}
          {task.answered ? <AnswerChip t={t} task={task} />
            : <Mark color="#94a3b8" icon={Minus} label={t("admin.ltd.noAnswerYet")} />}
          {st && <Mark color={st.color} icon={st.Icon} label={t(st.key)}
            title={st.hint ? t(st.hint) : undefined} />}
          {task.ai_rejected && (
            <Mark color="#ef4444" icon={ShieldAlert} label={t("admin.ltd.aiRejected")} />
          )}
          {locked && <Mark color="#eab308" icon={Lock} label={t("admin.ltd.lockedChip")} />}
        </div>
      </div>

      {task.reason ? (
        <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
          <span style={{ color: "var(--text-4)" }}>{t("admin.ltd.reason")}: </span>{task.reason}
        </p>
      ) : null}

      {task.closedAt && (
        <p className="text-[11px]" style={{ color: "var(--text-4)" }}>
          {t("admin.ltd.taskSubmittedAt").replace("{t}", hhmm(task.closedAt))}
        </p>
      )}

      {/* Thumbnails, never full-size: thirteen tasks of proof photos at full
          width is a scroll nobody finishes, and here the photo is an index
          into the zoom view rather than the evidence itself. */}
      {photos.length > 0 ? (
        <div>
          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--text-4)" }}>
            <Camera size={10} className="inline mr-1" />
            {t("admin.ltd.photos")} ({photos.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {photos.map((p, i) => (
              <div key={i} className="w-14 h-14 rounded-lg overflow-hidden">
                {p.kind === "bot"
                  ? <BotPhoto id={p.id} uid={uid} T={T} thumb className="" onClick={onPhoto} />
                  : <ReportPhoto src={p.url} uid={uid} T={T} thumb className="" onClick={onPhoto} />}
              </div>
            ))}
          </div>
        </div>
      ) : roll.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("admin.ltd.noPhotos")}</p>
      ) : null}

      {/* The camera roll of a task that has NOT written its answer yet. Shown
          under its own heading, never merged into the proof strip above: these
          shots count towards nothing until the roll reaches `min_media`, and
          presenting them as filed evidence would say the task is done. */}
      {roll.length > 0 && photos.length === 0 && (
        <div className="rounded-lg px-2 py-2"
          style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.35)" }}>
          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#eab308" }}>
            <Camera size={10} className="inline mr-1" />
            {t("admin.ltd.rollTitle")}
            {min > 0 && <> · {t("admin.ltd.shots").replace("{n}", roll.length).replace("{m}", min)}</>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {roll.map((p) => (
              <div key={p.id} className="relative w-14 h-14 rounded-lg overflow-hidden">
                <RollPhoto id={p.id} T={T} thumb className="" onClick={onPhoto} />
                {/* Two facts the stamp itself cannot carry, and both change how
                    the shot should be read. */}
                {(p.late || p.deferred) && (
                  <span className="absolute bottom-0 right-0 rounded-tl px-0.5"
                    style={{ background: "rgba(0,0,0,0.65)" }}
                    title={[p.late && t("admin.ltd.lateShot"),
                            p.deferred && t("admin.ltd.deferredShot")]
                      .filter(Boolean).join(" · ")}>
                    {p.late && <Clock size={9} color="#ef4444" />}
                    {p.deferred && <CloudOff size={9} color="#eab308" />}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] leading-snug mt-1.5" style={{ color: "var(--text-3)" }}>
            {t("admin.ltd.rollTaskHint")}
          </p>
        </div>
      )}

      {/* The authority, offered only where there is something to lift. A task
          that is not locked has nothing to take back, and a button that does
          nothing is worse than no button. */}
      {locked && (
        <div className="flex items-center gap-2 pt-0.5">
          <Button size="sm" variant="secondary" tint loading={busy}
            onClick={() => onReopen(task)}>
            <RotateCcw size={12} className="mr-1" />{t("admin.ltd.reopen")}
          </Button>
          <Button size="sm" variant="danger" tint loading={busy}
            onClick={() => onWipe(task)}>
            <Eraser size={12} className="mr-1" />{t("admin.ltd.wipe")}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function DaySubmissionModal({ row, onClose, onChanged }) {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const [zoom, setZoom] = useState("");
  const [ask, setAsk] = useState(null);   // { task, wipe } — null = closed

  // The photo loaders take their failure copy as props (they are shared with
  // the day-report page, which owns its own strings).
  const T = useMemo(() => ({
    photoFailed: t("admin.ltd.photoFailed"), retry: t("admin.ltd.retry"),
  }), [t]);

  const uid = row?.uid;
  const dayId = row?.source === "bot" ? row.id : null;
  const lockable = useMemo(() => new Set(row?.locked_tasks || []), [row]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["leader-report", uid],
    queryFn: () => api.get(`/api/leaders/report/${encodeURIComponent(uid)}`).then((r) => r.data),
    enabled: !!uid && !row?.open,
  });

  const act = useMutation({
    mutationFn: ({ task, wipe }) =>
      api.post("/admin/leader-tasks/task/reopen",
        { day_id: dayId, task_id: task.id, wipe }).then((r) => r.data),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["leader-report", uid] });
      qc.invalidateQueries({ queryKey: ["leader-bot-submissions"] });
      qc.invalidateQueries({ queryKey: ["leaders"] });
      setAsk(null);
      onChanged?.(vars.wipe ? "wiped" : "reopened", res);
    },
  });

  if (!row) return null;

  const head = `${row.leader} · ${ddmm(row.date)}`;
  const sub = [row.supervisor, row.shift ? `S${row.shift}` : null]
    .filter(Boolean).join(" · ");

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={head}
        subtitle={sub}
        icon={Camera}
        maxWidth="max-w-2xl"
        bodyClassName="px-5 py-4 space-y-3 overflow-y-auto"
        footer={
          <div className="flex items-center gap-2">
            {uid && !row.open && (
              <a href={`/leaders/report/${encodeURIComponent(uid)}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl"
                style={{ color: "var(--brand)", background: "rgba(200,151,63,0.12)",
                         border: "1px solid var(--brand-border, rgba(200,151,63,0.35))" }}>
                <ExternalLink size={13} />{t("admin.ltd.openReport")}
              </a>
            )}
            <Button variant="secondary" onClick={onClose}>{t("ui.version.close")}</Button>
          </div>
        }
      >
        {/* An OPEN day has no report to render — it is a leader mid-checklist,
            not a submission. Saying so beats an empty shell that reads like a
            load that failed. */}
        {row.open ? (
          <EmptyState icon={Hourglass} showUploadLink={false}
            title={t("admin.ltd.openChip")}
            message={t("admin.ltd.openNoDetail")} />
        ) : isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : isError || !data ? (
          // The server's own reason, not just "failed": a 404 here means the
          // uid names nothing (a deleted day, a sheet row the sync dropped),
          // which is a different problem from a permission or network failure
          // and sends the reader somewhere else entirely.
          <EmptyState icon={ShieldAlert} showUploadLink={false}
            title={t("admin.ltd.detailFailed")}
            message={error?.response?.data?.detail
              || (uid ? "" : t("admin.ltd.openNoDetail"))} />
        ) : (
          <>
            {/* The score is never shown without the number it moved FROM —
                a figure that dropped with no visible derivation reads as an
                error rather than a verdict. */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
                  {t("admin.ltd.score")}
                </p>
                <p className="text-lg font-bold leading-tight" style={{ color: "var(--text-1)" }}>
                  {data.score}%
                </p>
              </div>
              {data.rawScore !== data.score && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
                    {t("admin.ltd.rawScore")}
                  </p>
                  <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-3)" }}>
                    {data.rawScore}%
                  </p>
                </div>
              )}
              {data.submittedAt && (
                <div className="ml-auto text-right">
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
                    {t("admin.ltd.thSubmitted")}
                  </p>
                  <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
                    {ddmm(String(data.submittedAt).slice(0, 10))} {hhmm(data.submittedAt)}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {(data.tasks || []).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  uid={uid}
                  lang={lang}
                  T={T}
                  locked={!!dayId && lockable.has(task.id)}
                  onPhoto={setZoom}
                  onReopen={(tk) => setAsk({ task: tk, wipe: false })}
                  onWipe={(tk) => setAsk({ task: tk, wipe: true })}
                  busy={act.isPending && ask?.task?.id === task.id}
                />
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* Above the day modal (z 100 by default), and a failure lands INSIDE it
          — a mutation that fails must leave the dialog standing with the reason
          on it, never close onto a toast the operator has to catch. */}
      {ask && (
        <ConfirmDialog
          tone={ask.wipe ? "danger" : "warning"}
          icon={ask.wipe ? Eraser : RotateCcw}
          title={t(ask.wipe ? "admin.ltd.wipeTitle" : "admin.ltd.reopenTitle")
            .replace("{task}", ask.task.name?.[lang] || ask.task.name?.ru || `#${ask.task.id}`)}
          message={t(ask.wipe ? "admin.ltd.wipeBody" : "admin.ltd.reopenBody")}
          confirmLabel={t(ask.wipe ? "admin.ltd.wipe" : "admin.ltd.reopen")}
          loading={act.isPending}
          error={act.isError
            ? (act.error?.response?.data?.detail || t("admin.ltd.reopenFailed"))
            : null}
          onCancel={() => { act.reset(); setAsk(null); }}
          onConfirm={() => act.mutate(ask)}
        />
      )}

      <Lightbox src={zoom} onClose={() => setZoom("")} />
    </>
  );
}
