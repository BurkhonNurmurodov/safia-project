import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import ReactApexChart from "react-apexcharts";
import {
  ChevronLeft, ChevronRight, AlertTriangle, ArrowLeft,
  CalendarDays, Clock, Lock, FileText, Trash2, BarChart2, Unlock, Eye, Loader2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import ShiftDaily from "./ShiftDaily";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useFilters } from "../context/FilterContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";
import SupervisorPerformance from "../components/ui/SupervisorPerformance";
import Tooltip from "../components/ui/Tooltip";
import DayStepper from "../components/ui/DayStepper";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import api from "../utils/api";
import {
  AttendanceTable,
  DeleteWorkersModal,
  SupervisorSelect,
  DocumentViewModal,
  DeletionStatusBadge,
  ActionBtn,
  DOC_TYPE_TKEY,
  fmtDateLabel,
  fmtCreatedAt,
} from "./Staff";

// ── date helpers ────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d); }
function addDaysISO(iso, n) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return toISO(d); }
function fmtMin(m, minLabel = "min", hrsLabel = "hrs") {
  const v = Math.round(m || 0);
  if (v < 60) return `${v} ${minLabel}`;
  return `${Math.floor(v / 60)} ${hrsLabel} ${v % 60} ${minLabel}`;
}

function fmtLongLocalized(iso, t) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  const dayIdx = (d.getDay() + 6) % 7;
  return `${t(`cal.d${dayIdx}`)}, ${d.getDate()} ${t(`cal.mg${d.getMonth()}`)} ${d.getFullYear()}`;
}

const DONUT_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// ── Single-day picker ─────────────────────────────────────────────────────────

// ── Idle-by-category donut ────────────────────────────────────────────────────
function IdleDonut({ byCategory }) {
  const { theme } = useTheme();
  const { t } = useLang();
  const { tl } = useTranslit();
  const minLabel = t("general.min");
  const hrsLabel = t("general.hrs");
  const entries = Object.entries(byCategory || {}).filter(([, v]) => (v || 0) > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return <div className="py-12 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("daily.noIdle")}</div>;
  }
  const labels = entries.map(([k]) => tl(k));
  const series = entries.map(([, v]) => Math.round(v));
  const options = {
    chart: {
      type: "donut", background: "transparent",
      animations: { enabled: false },
      redrawOnParentResize: false, redrawOnWindowResize: false,
    },
    labels,
    colors: DONUT_COLORS,
    legend: { position: "bottom", labels: { colors: theme === "dark" ? "#cbd5e1" : "#334155" } },
    dataLabels: { enabled: true, formatter: (val) => `${Math.round(val)}%` },
    stroke: { width: 0 },
    tooltip: { y: { formatter: (v) => `${v} ${minLabel}` }, theme: theme === "dark" ? "dark" : "light" },
    plotOptions: { pie: { donut: { labels: { show: true, total: { show: true, label: t("daily.donutTotal"), formatter: () => fmtMin(series.reduce((a, b) => a + b, 0), minLabel, hrsLabel) } } } } },
  };
  return <ReactApexChart type="donut" series={series} options={options} height={280} />;
}


function Section({ icon: Icon, title, tip, action, children }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={15} style={{ color: "var(--brand-text)" }} />}
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>{title}</div>
        {tip && <Tooltip text={tip} />}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Per-supervisor day view ─────────────────────────────────────────────────
// Used by: supervisors (their own day), admins (with the picker), and the
// shift-manager drill-down (read-only, opened from the shift dashboard with a
// supervisor + date in the URL).
function SupervisorDaily() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { unit, setUnit } = useFilters();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const role = auth?.role;
  const isSupervisor = role === "supervisor";
  const isAdmin      = role === "admin";
  // Shift-manager drill-down: a specific supervisor + date passed in the URL.
  const drillId   = searchParams.get("manager_id");
  const drillDate = searchParams.get("date");
  const isDrill   = role === "shift-manager" && !!drillId;
  // Admins and shift-managers pick a supervisor (like the Staff page); supervisors see their own day.
  // Persisted so the selection survives navigating away and back. A URL drill-down
  // (shift-manager opening a specific supervisor/day) takes precedence on first load.
  const [selectedManagerId, setSelectedManagerId] = usePersistentState(
    "daily_selected_manager_id",
    () => (drillId ? Number(drillId) : null),
  );
  const managerId = isSupervisor ? auth?.role_id : selectedManagerId;
  const [date, setDate] = usePersistentState("daily_selected_date", () => drillDate || isoDaysAgo(1));

  // A drill-down navigation (new URL params) overrides any persisted selection.
  useEffect(() => { if (drillId)   setSelectedManagerId(Number(drillId)); }, [drillId]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (drillDate) setDate(drillDate); }, [drillDate]);                     // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = !!managerId && !!date;

  const { data: supervisors = [] } = useQuery({
    queryKey: ["staff-supervisors"],
    queryFn: () => api.get("/api/staff/supervisors").then(r => r.data),
    enabled: !isSupervisor,
    staleTime: 120_000,
  });
  const selectedSupName = supervisors.find(s => s.manager_id === managerId)?.full_name || "";

  const { data: downtime } = useQuery({
    queryKey: ["daily-downtime", managerId, date],
    queryFn: () => api.get("/api/downtime", { params: { manager_id: managerId, date_from: date, date_to: date } }).then(r => r.data),
    enabled,
  });

  const { data: allDocs = [] } = useQuery({
    queryKey: ["staff-documents"],
    queryFn: () => api.get("/api/staff/documents").then(r => r.data),
    enabled,
  });

  const { data: approval } = useQuery({
    queryKey: ["daily-approval", managerId, date],
    queryFn: () => api.get("/api/staff/approvals/day", {
      params: { attend_date: date, ...(isSupervisor ? {} : { manager_id: managerId }) },
    }).then(r => r.data),
    enabled,
  });

  const invalidateApproval = () => {
    qc.invalidateQueries({ queryKey: ["daily-approval", managerId, date] });
    qc.invalidateQueries({ queryKey: ["staff-approvals-calendar"] });
    qc.invalidateQueries({ queryKey: ["approved-cells"] });
  };
  const [showCloseModal, setShowCloseModal] = useState(false);
  const closeMut = useMutation({
    mutationFn: () => api.post("/api/staff/daily/close", { manager_id: managerId, date }),
    onSuccess: () => { setShowCloseModal(false); invalidateApproval(); },
  });
  const reopenMut = useMutation({
    mutationFn: () => api.post("/api/staff/approvals/reopen", { manager_id: managerId, date }),
    onSuccess: invalidateApproval,
  });

  // ── Delete modal & toast state ─────────────────────────────────────────────
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteToast, setDeleteToast] = useState(null);
  // Change-document view modal (same modal as the Staff "Requests" tab).
  const [viewDocId, setViewDocId] = useState(null);

  function handleDeleted(toastKey) {
    setDeleteToast(toastKey);
    setTimeout(() => setDeleteToast(null), 4000);
  }

  const idleRow  = downtime?.rows?.[0];
  const dayDocs  = allDocs.filter(d => d.date === date && (isSupervisor || d.manager_id === managerId));

  // Day-close state machine: open → closed (waiting for request confirmation) → confirmed
  const dayState    = approval?.state;
  const isOpen      = dayState === "open";
  const isWaiting   = dayState === "closed";
  const isConfirmed = dayState === "confirmed";

  // min / hrs unit switch — injected into the header filter dropdown.
  const unitToggle = (
    <div>
      <span className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--text-4)" }}>
        {t("filter.unit")}
      </span>
      <div className="flex rounded-lg overflow-hidden text-xs" style={{ border: "1px solid var(--border-md)", width: "fit-content" }}>
        {["min", "hrs"].map(u => (
          <button
            key={u}
            onClick={() => setUnit(u)}
            className="px-3 py-1.5 font-medium"
            style={unit === u ? { background: "var(--brand)", color: "#fff" } : { background: "var(--bg-inner)", color: "var(--text-3)" }}
          >
            {u === "min" ? t("general.min") : t("general.hrs")}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Layout title={t("daily.title")} showFilters={false} filterSlot={unitToggle}>
      {/* Header: supervisor picker (admin/shift-manager) + day picker + approval status */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {isDrill ? (
          <button
            onClick={() => navigate(`/daily?date=${date}`)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
          >
            <ArrowLeft size={15} /> {t("shiftDaily.back")}
          </button>
        ) : !isSupervisor ? (
          <SupervisorSelect
            value={selectedManagerId}
            onChange={setSelectedManagerId}
            supervisors={supervisors}
          />
        ) : null}
        <DayStepper value={date} onChange={setDate} />
        {isDrill && (
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
            {selectedSupName} · {t("shiftDaily.viewOnly")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!managerId || !approval ? null : (isConfirmed || isWaiting) ? (
            <>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "#22c55e22", color: "#16a34a", border: "1px solid #22c55e55" }}>
                <Lock size={12} /> {t("daily.closedBadge")}{approval?.closed_by ? ` · ${approval.closed_by}` : ""}
              </span>
              {isAdmin && (
                <button
                  onClick={() => { if (window.confirm(t("staff.apprReopenConfirm"))) reopenMut.mutate(); }}
                  disabled={reopenMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: "var(--bg-card)", color: "var(--text-2)", border: "1px solid var(--border-md)", opacity: reopenMut.isPending ? 0.6 : 1 }}
                >
                  {reopenMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />} {t("daily.reopenDay")}
                </button>
              )}
            </>
          ) : isSupervisor ? (
            <button
              onClick={() => setShowCloseModal(true)}
              disabled={closeMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: "var(--brand)", color: "#fff" }}
            >
              <Lock size={13} /> {t("daily.closeDay")}
            </button>
          ) : (
            <>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "#f59e0b22", color: "#d97706", border: "1px solid #f59e0b55" }}>
                <Clock size={12} /> {t("daily.dayOpen")}
              </span>
              {isAdmin && (
                <button
                  onClick={() => setShowCloseModal(true)}
                  disabled={closeMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: "var(--brand)", color: "#fff" }}
                >
                  <Lock size={13} /> {t("daily.closeDay")}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Admin / shift-manager: prompt until a supervisor is chosen */}
      {!managerId && !isSupervisor && (
        <div className="py-24 text-center text-sm rounded-xl"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
          {t("staff.apprSelectSup")}
        </div>
      )}

      {/* Loading — a supervisor is selected but the day's approval state hasn't arrived yet */}
      {managerId && !approval && (
        <div className="space-y-4">
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SkeletonBlock className="h-3 w-40 mb-4" />
            <SkeletonChart className="h-48" />
          </div>
          <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SkeletonBlock className="h-3 w-32 mb-4" />
            <SkeletonChart className="h-64" />
          </div>
        </div>
      )}

      {/* OPEN day — nothing is calculated or shown until the supervisor closes it */}
      {managerId && approval && isOpen && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl mb-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "#f59e0b22", border: "1px solid #f59e0b55" }}>
            <AlertTriangle size={26} style={{ color: "#d97706" }} />
          </div>
          <div className="text-center max-w-md px-4">
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-1)" }}>
              {isSupervisor ? t("daily.closeWarnTitle") : t("daily.adminOpenBanner")}
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
              {isSupervisor ? t("daily.closeWarnText") : t("daily.adminOpenBannerSub")}
            </div>
          </div>
          {(isSupervisor || isAdmin) && (
            <button
              onClick={() => setShowCloseModal(true)}
              disabled={closeMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "var(--brand)", color: "#fff" }}
            >
              <Lock size={14} /> {t("daily.closeDay")}
            </button>
          )}
        </div>
      )}

      {/* CLOSED day — requests still being reviewed; data hidden until confirmed */}
      {managerId && approval && isWaiting && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl mb-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: "#22c55e22", border: "1px solid #22c55e55" }}>
            <Lock size={26} style={{ color: "#16a34a" }} />
          </div>
          <div className="text-center max-w-md px-4">
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-1)" }}>
              {t("daily.closedBadge")}
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
              {t("daily.waitConfirmSub")}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMED day — data is calculated and shown everywhere */}
      {managerId && approval && isConfirmed && (
      <>
      {/* Performance metrics — speedometers, workload bars, funnel, trend */}
      <div className="mb-4">
        <Section icon={BarChart2} title={isSupervisor ? t("daily.performanceTitle") : (selectedSupName || t("daily.performanceTitle"))}>
          <SupervisorPerformance managerId={managerId} date={date} unit={unit} />
        </Section>
      </div>

      {/* Delete toast */}
      {deleteToast && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: deleteToast === "success" ? "#ef4444" : "#C8973F",
            color: "#fff", maxWidth: 320,
            boxShadow: `0 8px 24px ${deleteToast === "success" ? "rgba(239,68,68,.35)" : "rgba(200,151,63,.35)"}`,
          }}
        >
          <Trash2 size={15} style={{ flexShrink: 0 }} />
          <span>{deleteToast === "success" ? t("staff.deleteSuccess") : t("staff.deleteRequestSent")}</span>
        </div>
      )}

      {/* Idle by category — always visible */}
      <div className="mb-4">
        <Section icon={Clock} title={t("daily.idleTitle")} tip={t("daily.idleTip")}
          action={idleRow ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fmtMin(idleRow.total)} {t("daily.total")}</span> : null}>
          <IdleDonut byCategory={idleRow?.by_category} />
        </Section>
      </div>

      {/* Documents of changes — same table layout as the Staff "Requests" tab */}
      <div className="mb-4">
        <Section icon={FileText} title={t("daily.docsTitle")}>
          {dayDocs.length === 0 ? (
            <div className="py-8 text-center text-sm" style={{ color: "var(--text-4)" }}>{t("daily.noDocs")}</div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-md)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--bg-inner)", borderBottom: "1px solid var(--border)" }}>
                      <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.fDate")}</th>
                      <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.colDocType")}</th>
                      <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.colPosted")}</th>
                      <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.colApprovedBy")}</th>
                      <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-3)" }}>{t("staff.colCreatedAt")}</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {dayDocs.map(d => {
                      const isExchange = d.doc_type === "people_exchange";
                      return (
                        <tr key={d.id} className="border-b" style={{ borderColor: "var(--border)" }}>
                          <td className="px-3 py-3 whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                            <span className="font-mono">{fmtDateLabel(d.date)}</span>
                            {isExchange && d.transfer_time && (
                              <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px]"
                                style={{ color: "var(--text-4)" }} title={t("staff.transferTimeLabel")}>
                                <Clock size={10} />{d.transfer_time}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3" style={{ color: "var(--text-1)" }}>
                            <span className="font-medium">
                              {DOC_TYPE_TKEY[d.doc_type] ? t(DOC_TYPE_TKEY[d.doc_type]) : (d.doc_type_label || d.doc_type)}
                            </span>
                            {isExchange
                              ? <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-4)" }}>· {d.employee_count ?? 0} {t("daily.emp")} · → {d.target_type === "supervisor" ? tl(d.target_manager_name) : d.task_name}</span>
                              : <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-4)" }}>· {d.employee_count ?? 0} {t("daily.emp")}{d.new_role ? ` · ${tl(d.new_role)}` : ""}</span>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <DeletionStatusBadge status={d.approved ? "approved" : (d.status === "rejected" ? "rejected" : "pending")} />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{tl(d.approved_by_name) || "—"}</td>
                          <td className="px-3 py-3 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{fmtCreatedAt(d.created_at, t, lang)}</td>
                          <td className="px-3 py-3 text-right whitespace-nowrap">
                            <ActionBtn icon={Eye} label={t("staff.view")} onClick={() => setViewDocId(d.id)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
      </div>


      {/* Workers section — full table; supervisors can no longer submit changes */}
      {/* Full attendance table — same component as Staff page Workers tab */}
      <div className="rounded-xl mb-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", overflow: "visible" }}>
        <AttendanceTable managerId={managerId} selectedDate={date} pickSupervisor={!isSupervisor} />
      </div>
      </>
      )}

      {/* Change-document view modal */}
      {viewDocId && <DocumentViewModal docId={viewDocId} onClose={() => setViewDocId(null)} />}

      {/* Delete workers modal */}
      {showDeleteModal && (
        <DeleteWorkersModal
          managerId={managerId}
          managerName={isSupervisor ? (auth?.name || "") : selectedSupName}
          date={date}
          isAdmin={isAdmin}
          onClose={() => setShowDeleteModal(false)}
          onDeleted={handleDeleted}
        />
      )}

      {/* Close-the-day confirmation modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => { if (!closeMut.isPending) setShowCloseModal(false); }}>
          <div className="rounded-2xl p-6 w-full max-w-md"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", boxShadow: "0 16px 48px rgba(0,0,0,0.35)" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "#f59e0b22", border: "1px solid #f59e0b55" }}>
                <AlertTriangle size={20} style={{ color: "#d97706" }} />
              </div>
              <div className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
                {t("daily.closeConfirmTitle")}
              </div>
            </div>
            <p className="text-xs leading-relaxed mb-5" style={{ color: "var(--text-3)" }}>
              {t("daily.closeConfirmText")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCloseModal(false)}
                disabled={closeMut.isPending}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border-md)" }}
              >
                {t("daily.cancel")}
              </button>
              <button
                onClick={() => closeMut.mutate()}
                disabled={closeMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: "var(--brand)", color: "#fff", opacity: closeMut.isPending ? 0.6 : 1 }}
              >
                {closeMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />} {closeMut.isPending ? t("daily.closing") : t("daily.closeConfirmBtn")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── Route entry ──────────────────────────────────────────────────────────────
// Shift-managers get the overview-style shift dashboard; clicking a supervisor
// there opens this same /daily route with a `manager_id` param, which falls
// through to the per-supervisor read-only view. Supervisors and admins always
// get the per-supervisor view.
export default function Daily() {
  const { auth } = useAuth();
  const [searchParams] = useSearchParams();
  if (auth?.role === "shift-manager" && !searchParams.get("manager_id")) {
    return <ShiftDaily />;
  }
  return <SupervisorDaily />;
}
