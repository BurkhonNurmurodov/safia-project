import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Users, CheckCircle, XCircle, Ban, RotateCcw, Copy,
  CalendarClock, Loader2, Paperclip, SearchX, AlertTriangle, MessageSquare,
  Sparkles, Clock, ListChecks,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import ErrorScreen from "../components/ui/ErrorScreen";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";

/**
 * One broadcast's own page — /broadcast/:id, where every history row lands.
 *
 * It replaces a detail modal that could not do the three things this record is
 * actually for: hold a per-recipient table, survive a refresh, and be pasted
 * into a chat. It is also where a send arrives after leaving the composer, so
 * "send" ends in "watch this send" rather than in a toast that disappears.
 *
 * Per-recipient rows carry the FAILURE REASON, which is the only datum that
 * answers whether retrying can achieve anything — a user who blocked the bot
 * fails identically forever, a flood-wait does not.
 */

const p2 = (n) => String(n).padStart(2, "0");
const fmtDT = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

const GREEN = "#22c55e";
const RED = "#ef4444";
const AMBER = "#eab308";
const GREY = "#94a3b8";

// One headline number, named and scoped. Never a bare figure: "312" alone does
// not say 312 of what, out of how many.
function Stat({ icon: Icon, label, value, of, color }) {
  return (
    <div
      className="rounded-2xl px-4 py-3 min-w-0"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color: color || "var(--text-4)" }} />
        <span className="text-[11px] font-semibold uppercase tracking-wider truncate"
              style={{ color: "var(--text-4)" }}>
          {label}
        </span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums leading-none"
           style={{ color: color || "var(--text-1)" }}>
        {value}
        {of != null && (
          <span className="text-sm font-normal" style={{ color: "var(--text-4)" }}> / {of}</span>
        )}
      </div>
    </div>
  );
}

function StateTag({ status, t }) {
  const map = {
    delivered: { c: GREEN, Icon: CheckCircle, k: "admin.broadcast.stDelivered" },
    failed: { c: RED, Icon: XCircle, k: "admin.broadcast.stFailed" },
    pending: { c: AMBER, Icon: Clock, k: "admin.broadcast.stPending" },
    canceled: { c: GREY, Icon: Ban, k: "admin.broadcast.stCanceled" },
  };
  const { c, Icon, k } = map[status] || map.pending;
  return (
    /* Colour is never the only carrier — every state has its own icon and its
       own word, so the table reads the same for a colour-blind operator. */
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]" style={{ color: c }}>
      <Icon size={12} /> {t(k)}
    </span>
  );
}

export default function BroadcastRecord() {
  const { id } = useParams();
  const { t } = useLang();
  const { tl } = useTranslit();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [only, setOnly] = useState("all");
  const [confirm, setConfirm] = useState(null); // "cancel" | "retry"
  const [actionError, setActionError] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["broadcast-record", id],
    queryFn: () => api.get(`/api/broadcast/${id}`).then((r) => r.data),
    // Live while the fan-out runs; a scheduled row is polled slowly because it
    // flips to 'sending' on its own clock, not on anything happening here.
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === "sending") return 2000;
      if (s === "scheduled") return 30_000;
      return false;
    },
  });

  const retryMut = useMutation({
    mutationFn: () => api.post(`/api/broadcast/${id}/retry`),
    onSuccess: () => {
      setConfirm(null);
      setActionError("");
      toast.success(t("admin.broadcast.retryQueued"));
      qc.invalidateQueries({ queryKey: ["broadcast-record", id] });
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    onError: (e) => setActionError(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post(`/api/broadcast/${id}/cancel`),
    onSuccess: () => {
      setConfirm(null);
      setActionError("");
      toast.success(t("admin.broadcast.cancelDone"));
      qc.invalidateQueries({ queryKey: ["broadcast-record", id] });
      qc.invalidateQueries({ queryKey: ["broadcast-history"] });
    },
    onError: (e) => setActionError(e?.response?.data?.detail || t("admin.broadcast.sendFailed")),
  });

  const people = data?.people || [];
  const rows = useMemo(() => {
    let list = people;
    if (only === "failed") list = list.filter((p) => p.status === "failed");
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((p) => (tl(p.name) || "").toLowerCase().includes(needle)
        || String(p.telegram_id).includes(needle));
    }
    return list;
  }, [people, only, q, tl]);

  const back = (
    <button
      type="button"
      onClick={() => navigate("/admin/upload?tab=broadcast")}
      className="inline-flex items-center gap-1.5 mb-3 text-sm rounded-lg px-2 py-1 -ml-2 transition-colors hover:bg-[var(--bg-inner)]"
      style={{ color: "var(--text-3)" }}
    >
      <ArrowLeft size={15} /> {t("admin.broadcast.recBack")}
    </button>
  );

  if (isLoading) {
    return (
      <Layout title={t("admin.broadcast.recTitle")}>
        <div className="mx-auto w-full max-w-4xl">
          {back}
          <div className="space-y-4">
            <SkeletonBlock className="h-40 w-full rounded-2xl" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
            <SkeletonBlock className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    // 422 = the :id segment isn't even a number — same "no such broadcast" story.
    const gone = [404, 422].includes(error?.response?.status);
    return (
      <Layout title={t("admin.broadcast.recTitle")}>
        <ErrorScreen
          inline
          tone={gone ? "neutral" : "danger"}
          icon={gone ? SearchX : AlertTriangle}
          code={gone ? "404" : undefined}
          title={gone ? t("admin.broadcast.notFound") : t("error.title")}
          message={gone ? t("admin.broadcast.notFoundMsg")
                        : (error?.response?.data?.detail || t("error.reload"))}
          action={gone
            ? { label: t("admin.broadcast.recBack"), onClick: () => navigate("/admin/upload?tab=broadcast") }
            : { label: t("error.reload"), onClick: () => refetch() }}
        />
      </Layout>
    );
  }

  const isCopy = data.mode === "copy";
  const statusColor = data.status === "scheduled" ? AMBER
    : data.status === "canceled" ? GREY
    : data.status === "sending" ? "var(--brand-text)"
    : GREEN;
  const StatusIcon = data.status === "scheduled" ? CalendarClock
    : data.status === "canceled" ? Ban
    : data.status === "sending" ? Loader2
    : CheckCircle;
  const statusLabel = data.status === "scheduled" ? t("admin.broadcast.statusScheduled")
    : data.status === "canceled" ? t("admin.broadcast.statusCanceled")
    : data.status === "sending" ? t("admin.broadcast.statusSending")
    : t("admin.broadcast.statusDone");

  const duplicate = () => navigate("/admin/upload?tab=broadcast", {
    state: {
      duplicate: {
        html: data.text_html,
        mode: data.mode === "rich" ? "rich" : "normal",
        targets: data.target_keys || [],
        hadMedia: !!data.has_media,
      },
    },
  });

  return (
    <Layout title={t("admin.broadcast.recTitle")}>
      <div className="mx-auto w-full max-w-4xl">
        {back}
        <div className="space-y-4">

          {/* Header — what was sent, by whom, when, and where it stands now */}
          <div className="rounded-2xl p-4 sm:p-5 space-y-3"
               style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold"
                    style={{ background: `${statusColor === "var(--brand-text)" ? "var(--brand-bg)" : `${statusColor}1f`}`,
                             color: statusColor,
                             border: `1px solid ${statusColor === "var(--brand-text)" ? "var(--brand-border)" : `${statusColor}40`}` }}>
                <StatusIcon size={12} className={data.status === "sending" ? "animate-spin" : ""} />
                {statusLabel}
              </span>
              {data.mode === "rich" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
                      style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
                  <Sparkles size={11} /> {t("admin.broadcast.modeRich")}
                </span>
              )}
              {isCopy && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
                      style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                  <MessageSquare size={11} /> {t("admin.broadcast.modeCopy")}
                </span>
              )}
              <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                {fmtDT(data.created_at)}
              </span>
              {data.sender_name && (
                <span className="text-xs" style={{ color: "var(--text-3)" }}>· {tl(data.sender_name)}</span>
              )}
            </div>

            {data.status === "scheduled" && data.scheduled_at && (
              <div className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md"
                   style={{ background: "rgba(234,179,8,0.12)", color: "#a16207", border: "1px solid rgba(234,179,8,0.25)" }}>
                <CalendarClock size={12} />
                {t("admin.broadcast.scheduledFor").replace("{when}", fmtDT(data.scheduled_at))}
              </div>
            )}

            {/* The message itself. A copy-mode broadcast has no HTML here — its
                content lives in the sender's own Telegram chat — so it renders
                its captured preview and SAYS where the original is, instead of
                the empty bubble this page used to show for every bot send. */}
            {isCopy ? (
              <div className="space-y-1.5">
                <div className="tg-msg text-sm rounded-xl px-3 py-2.5 whitespace-pre-wrap"
                     style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
                  {data.text_plain || <span style={{ color: "var(--text-4)" }}>—</span>}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                  {t("admin.broadcast.copyNote")}
                </div>
              </div>
            ) : (
              <div
                className={`tg-msg text-sm rounded-xl px-3 py-2.5${data.mode === "rich" ? " tg-msg-rich" : ""}`}
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}
                dangerouslySetInnerHTML={{ __html: data.text_html }}
              />
            )}

            {(data.attachment_name || data.media_names?.length > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {data.attachment_name && (
                  <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
                    <Paperclip size={12} style={{ color: "var(--brand-text)" }} /> {data.attachment_name}
                  </span>
                )}
                {(data.media_names || []).map((n, i) => (
                  <span key={i}
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
                    <Paperclip size={9} /> {n}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {data.can_cancel && (
                <Button variant="danger" icon={<Ban size={14} />}
                        onClick={() => { setActionError(""); setConfirm("cancel"); }}>
                  {t("admin.broadcast.cancelSend")}
                </Button>
              )}
              {data.can_retry && (
                <Button icon={<RotateCcw size={14} />}
                        onClick={() => { setActionError(""); setConfirm("retry"); }}>
                  {t("admin.broadcast.retry")}
                </Button>
              )}
              {data.can_duplicate && (
                <Button variant="secondary" icon={<Copy size={14} />} onClick={duplicate}>
                  {t("admin.broadcast.duplicate")}
                </Button>
              )}
            </div>
          </div>

          {/* Is everything OK? — three numbers, before any detail */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Stat icon={Users} label={t("admin.broadcast.statPeople")} value={data.recipient_total} />
            <Stat icon={CheckCircle} label={t("admin.broadcast.statDelivered")} color={GREEN}
                  value={data.sent_count} of={data.recipient_total} />
            <Stat icon={XCircle} label={t("admin.broadcast.statFailed")}
                  color={data.failed_count > 0 ? RED : undefined} value={data.failed_count} />
          </div>

          {/* Per-recipient list */}
          <div className="space-y-2">
            {data.partial_list && (
              <div className="flex items-start gap-2 rounded-xl px-3 py-2 text-[11px]"
                   style={{ background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.25)", color: "#a16207" }}>
                <AlertTriangle size={13} className="flex-shrink-0 mt-px" />
                <span>{t("admin.broadcast.partialList")}</span>
              </div>
            )}

            {people.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-[180px]">
                  <SearchInput value={q} onChange={setQ} placeholder={t("admin.broadcast.searchPeople")} />
                </div>
                <SegmentedToggle
                  value={only}
                  onChange={setOnly}
                  ariaLabel={t("admin.broadcast.colResult")}
                  options={[
                    { value: "all", label: t("admin.broadcast.filterAll") },
                    { value: "failed", label: `${t("admin.broadcast.onlyFailed")}${data.failed_count ? ` (${data.failed_count})` : ""}` },
                  ]}
                />
              </div>
            )}

            {people.length === 0 ? (
              /* Legacy rows kept no resolved recipient list. Show what exists —
                 the names that failed — rather than an empty table implying
                 nobody was targeted. */
              <div className="rounded-2xl px-4 py-6"
                   style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <div className="text-sm text-center" style={{ color: "var(--text-4)" }}>
                  {t("admin.broadcast.noPeopleList")}
                </div>
                {data.failed_names?.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>
                      {t("admin.broadcast.failedList")}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {data.failed_names.map((n, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(239,68,68,0.10)", color: RED, border: "1px solid rgba(239,68,68,0.25)" }}>
                          {tl(n)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Table — sm and up */}
                <div className="hidden sm:block">
                  <TableCard
                    icon={ListChecks}
                    title={t("admin.broadcast.recRecipients")}
                    right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                      {rows.length}
                    </span>}
                  >
                    <thead>
                      <tr>
                        <Th label={t("admin.broadcast.colName")} />
                        <Th label={t("admin.broadcast.colResult")} />
                        <Th label={t("admin.broadcast.colReason")} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                            {t("admin.broadcast.noMatch")}
                          </td>
                        </tr>
                      )}
                      {rows.map((p, i) => (
                        <tr key={`${p.telegram_id}-${i}`}>
                          <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{tl(p.name) || p.telegram_id}</td>
                          <td className="px-3 py-2"><StateTag status={p.status} t={t} /></td>
                          <td className="px-3 py-2 max-w-[360px]">
                            {p.error
                              ? <span className="text-[12px] break-words" style={{ color: "var(--text-2)" }}>{p.error}</span>
                              : <span style={{ color: "var(--text-4)" }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TableCard>
                </div>

                {/* Cards — below sm */}
                <div className="sm:hidden rounded-2xl overflow-hidden"
                     style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <SectionHead icon={ListChecks} title={t("admin.broadcast.recRecipients")}
                               right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                                 {rows.length}
                               </span>} />
                  {rows.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-4)" }}>
                      {t("admin.broadcast.noMatch")}
                    </div>
                  ) : rows.map((p, i) => (
                    <div key={`${p.telegram_id}-${i}`} className="px-3 py-2.5 border-b last:border-b-0"
                         style={{ borderColor: "var(--border)" }}>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-sm truncate" style={{ color: "var(--text-1)" }}>
                          {tl(p.name) || p.telegram_id}
                        </span>
                        <StateTag status={p.status} t={t} />
                      </div>
                      {p.error && (
                        <div className="mt-1 text-[11px] break-words" style={{ color: "var(--text-3)" }}>
                          {p.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "retry"}
        error={actionError}
        onCancel={() => { if (!retryMut.isPending) { setConfirm(null); setActionError(""); } }}
        onConfirm={() => { setActionError(""); retryMut.mutate(); }}
        title={t("admin.broadcast.retryTitle")}
        message={t("admin.broadcast.retryMsg").replace("{n}", data.failed_count ?? 0)}
        confirmLabel={t("admin.broadcast.retry")}
        icon={<RotateCcw size={20} />}
        loading={retryMut.isPending}
      />

      <ConfirmDialog
        open={confirm === "cancel"}
        tone="danger"
        error={actionError}
        onCancel={() => { if (!cancelMut.isPending) { setConfirm(null); setActionError(""); } }}
        onConfirm={() => { setActionError(""); cancelMut.mutate(); }}
        title={t("admin.broadcast.cancelTitle")}
        message={t("admin.broadcast.cancelMsg")
          .replace("{when}", data.scheduled_at ? fmtDT(data.scheduled_at) : "—")
          .replace("{n}", data.recipient_total ?? 0)}
        confirmLabel={t("admin.broadcast.cancelConfirm")}
        icon={<Ban size={20} />}
        loading={cancelMut.isPending}
      />

      {toast.node}
    </Layout>
  );
}
