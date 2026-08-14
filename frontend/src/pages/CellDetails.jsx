import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, LayoutGrid, Hash, Users, Flag, Clock, Factory as FactoryIcon,
  Settings2, Activity, Pencil, ShieldCheck, CalendarDays, Timer, Wrench,
  Boxes, SearchX, AlertTriangle, Languages,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import ErrorScreen from "../components/ui/ErrorScreen";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import CellFormModal from "../components/CellFormModal";
import { SectionHead } from "../components/ui/DataTable";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { useCapabilities, CAP } from "../hooks/useCapabilities";
import { cellName } from "../utils/cellName";
import api from "../utils/api";

/**
 * One production cell's own page — /cells/:id, where every cell reference on
 * the platform lands (via components/ui/CellLink). Shows the WHOLE record:
 * codes, all four workshop names, the ownership chain (brigadir → shift →
 * factory, leader), the accounting flags (in_load, att_included) and the
 * cell's footprint across every table that keys on it.
 *
 * Access is a valid session only — deliberately NOT page.view.cells: cells
 * are pressable from attendance, setup times, production and quality, so
 * anyone who can see a cell somewhere may open its card (the backend read,
 * /api/profiles/cells/:id/details, is gated the same way). Everyone gets the
 * same read-only view; holders of admin.cells.manage additionally get the
 * shared CellFormModal (codes / names / owners — the same form as /cells),
 * and full admins get the in_load toggle (its writer,
 * PUT /api/cell-attendance/registry, is role-admin-only server-side).
 */

// ── shared building blocks (Profile.jsx design language) ─────────────────────

function Card({ icon, title, right, children }) {
  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={title} right={right} />
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, children, top = false }) {
  return (
    <div className={`flex ${top ? "items-start" : "items-center"} justify-between gap-3 py-2 border-b last:border-b-0`}
         style={{ borderColor: "var(--border)" }}>
      <span className={`flex ${top ? "items-start" : "items-center"} gap-2 flex-shrink-0`}>
        {Icon && <Icon size={13} className={top ? "mt-0.5" : ""} style={{ color: "var(--text-4)" }} />}
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
          {label}
        </span>
      </span>
      <span className="min-w-0 text-right text-[13px]" style={{ color: "var(--text-1)" }}>{children}</span>
    </div>
  );
}

// Status pill: colored dot + tinted body (Profile's StatusTag look).
function Tag({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
          style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function CodeChip({ children, muted = false }) {
  return (
    <span className="font-mono text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)",
                   color: muted ? "var(--text-3)" : "var(--text-1)" }}>
      {children}
    </span>
  );
}

const GREEN = "#22c55e";
const GREY  = "#94a3b8";

// Date-only ISO → localized short date, in the UI language (a browser-default
// locale reads as someone else's software on an uz/ru page).
const DT_LOCALE = { uz: "uz-Latn-UZ", uz_cyrl: "uz-Cyrl-UZ", ru: "ru-RU", en: "en-GB" };
function fmtDate(iso, lang) {
  if (!iso) return null;
  try {
    // T00:00:00 pins the date to the local day — a bare "YYYY-MM-DD" parses
    // as UTC midnight and can render as the previous day west of Greenwich.
    return new Date(`${iso}T00:00:00`).toLocaleDateString(DT_LOCALE[lang] || "ru-RU",
      { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

// One footprint line: label left, "N days · last <date> · extras" right,
// muted "no data yet" when the table has nothing for this cell.
function ActRow({ icon: Icon, label, parts, none }) {
  const has = parts && parts.length > 0;
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
         style={{ borderColor: "var(--border)" }}>
      <span className="flex items-center gap-2 flex-shrink-0">
        {Icon && <Icon size={13} style={{ color: "var(--text-4)" }} />}
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
          {label}
        </span>
      </span>
      {has
        ? <span className="min-w-0 text-right text-[13px] tabular-nums" style={{ color: "var(--text-1)" }}>
            {parts.join(" · ")}
          </span>
        : <span className="text-right text-[12px]" style={{ color: "var(--text-4)" }}>{none}</span>}
    </div>
  );
}

// One accounting flag: label + state on the first line, the consequence
// spelled out under it at 11px/--text-3 (the FormField `hint` discipline —
// never --text-4, where the eye skips exactly the text that matters).
function FlagRow({ icon: Icon, label, control, hint }) {
  return (
    <div className="py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span className="flex items-center gap-2 flex-shrink-0">
          {Icon && <Icon size={13} style={{ color: "var(--text-4)" }} />}
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
            {label}
          </span>
        </span>
        {control}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{hint}</p>
    </div>
  );
}

const NAME_LANGS = ["uz", "uz_cyrl", "ru", "en"];

export default function CellDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  // in_load's only writer (PUT /api/cell-attendance/registry) is hard
  // role-admin server-side — a cells-manage grantee would 403 on it, so the
  // toggle is gated on the role, not on the capability.
  const isAdmin = auth?.role === "admin";
  const { can, isLoading: capLoading } = useCapabilities();
  const canEdit = !capLoading && can(CAP.CELLS_MANAGE);
  const qc = useQueryClient();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cell-details", id],
    queryFn: () => api.get(`/api/profiles/cells/${id}/details`).then((r) => r.data),
  });

  // The edit modal's option lists — the register endpoint already ships them,
  // cached under the same key the /cells page uses, fetched only for editors.
  const { data: reg } = useQuery({
    queryKey: ["admin-cells"],
    queryFn: () => api.get("/api/profiles/admin/cells").then((r) => r.data),
    enabled: canEdit,
  });

  const inLoadMut = useMutation({
    mutationFn: (val) =>
      api.put("/api/cell-attendance/registry", { changes: [{ cell_id: Number(id), in_load: val }] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cell-details", id] });
      toast.success(t("cellPage.saved"));
    },
    onError: (e) => toast.error(e?.response?.data?.detail || t("admin.profiles.error")),
  });

  const back = (
    <button onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-[var(--text-2)] hover:text-[var(--text-1)] text-sm mb-5 transition-colors">
      <ArrowLeft size={15} /> {t("profile.back")}
    </button>
  );

  if (isLoading) {
    return (
      <Layout title={t("cellPage.title")}>
        <div className="mx-auto w-full max-w-4xl">
          {back}
          <div className="space-y-4">
            <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-4">
                <SkeletonBlock className="w-16 h-16 rounded-2xl" />
                <div className="flex-1">
                  <SkeletonBlock className="h-5 w-1/2 mb-2" />
                  <SkeletonBlock className="h-4 w-1/3" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SkeletonBlock className="h-56 w-full rounded-2xl" />
              <SkeletonBlock className="h-56 w-full rounded-2xl" />
              <SkeletonBlock className="h-40 w-full rounded-2xl" />
              <SkeletonBlock className="h-40 w-full rounded-2xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    const gone = error?.response?.status === 404;
    return (
      <Layout title={t("cellPage.title")}>
        <ErrorScreen
          inline
          tone={gone ? "neutral" : "danger"}
          icon={gone ? SearchX : AlertTriangle}
          code={gone ? "404" : undefined}
          title={gone ? t("cellPage.notFound") : t("error.title")}
          message={gone ? t("cellPage.notFoundMsg") : (error?.response?.data?.detail || t("error.reload"))}
          action={gone
            ? { label: t("profile.back"), onClick: () => navigate(-1) }
            : { label: t("error.reload"), onClick: () => refetch() }}
        />
      </Layout>
    );
  }

  const c = data.cell;
  const sup = data.supervisor;
  const leader = data.leader;
  const factory = data.factory;
  const act = data.activity || {};

  const name = cellName(c, lang) || c.verifix_code;
  const factoryName = factory
    ? (factory[`name_${lang}`] || factory.name_ru || factory.name_uz || factory.code)
    : null;
  // att_included NULL = derived: a cell with a supervisor counts.
  const attResolved = c.att_included ?? !!sup;
  const context = [
    sup ? tl(sup.name) : null,
    sup?.shift != null ? `${t("profile.shift")} ${sup.shift}` : null,
    factoryName,
  ].filter(Boolean).join(" · ");

  const days = (n) => t("cellPage.actDays").replace("{n}", String(n));
  const last = (d) => t("cellPage.actLast").replace("{date}", fmtDate(d, lang) || "");

  return (
    <Layout title={name}>
      <div className="mx-auto w-full max-w-4xl">
        {back}
        <div className="space-y-4">

          {/* Identity hero */}
          <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                   style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }}>
                <LayoutGrid size={28} style={{ color: "var(--brand-text)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xl font-semibold leading-tight break-words" style={{ color: "var(--text-1)" }}>
                  {name}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <CodeChip>{c.verifix_code}</CodeChip>
                  {c.sap_code && <CodeChip muted>SAP · {c.sap_code}</CodeChip>}
                  <Tag color={c.in_load ? GREEN : GREY}>
                    {t(c.in_load ? "cellPage.inLoadOn" : "cellPage.inLoadOff")}
                  </Tag>
                </div>
                {context && <div className="mt-1.5 text-xs" style={{ color: "var(--text-3)" }}>{context}</div>}
              </div>
              {canEdit && (
                <div className="flex-shrink-0 sm:self-start">
                  <Button icon={<Pencil size={13} />} onClick={() => setEditOpen(true)}>
                    {t("admin.profiles.edit")}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

            {/* Codes & names — the full record, every language column shown */}
            <Card icon={Hash} title={t("cellPage.secIdentity")}>
              <div className="-my-2">
                <InfoRow icon={Hash} label={t("admin.profiles.colVerifixCode")}>
                  <span className="font-mono">{c.verifix_code}</span>
                </InfoRow>
                <InfoRow icon={Hash} label={t("admin.profiles.colSapCode")}>
                  {c.sap_code
                    ? <span className="font-mono">{c.sap_code}</span>
                    : <span style={{ color: "var(--text-4)" }}>—</span>}
                </InfoRow>
                <div className="py-2">
                  <span className="flex items-center gap-2">
                    <Languages size={13} style={{ color: "var(--text-4)" }} />
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                      {t("cellPage.names")}
                    </span>
                  </span>
                  <div className="mt-2 space-y-1.5">
                    {NAME_LANGS.map((l) => {
                      const v = c[`name_workshop_${l}`];
                      return (
                        <div key={l} className="flex items-center gap-2.5 min-w-0">
                          <span className="w-14 flex-shrink-0 text-center text-[9px] font-mono uppercase tracking-wide px-1 py-0.5 rounded-md"
                                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
                            {l}
                          </span>
                          <span className="text-[13px] truncate" style={{ color: v ? "var(--text-1)" : "var(--text-4)" }}>
                            {v || "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>

            {/* Ownership chain */}
            <Card icon={Users} title={t("cellPage.secOwnership")}>
              <div className="-my-2">
                <InfoRow icon={ShieldCheck} label={t("admin.profiles.colSupervisor")}>
                  {sup
                    ? <>
                        {tl(sup.name)}
                        {sup.archived && (
                          <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>
                            · {t("cellPage.archived")}
                          </span>
                        )}
                      </>
                    : <span style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellNoSupervisor")}</span>}
                </InfoRow>
                <InfoRow icon={Clock} label={t("profile.shift")}>
                  {sup?.shift != null ? sup.shift : <span style={{ color: "var(--text-4)" }}>—</span>}
                </InfoRow>
                <InfoRow icon={FactoryIcon} label={t("profile.factory")}>
                  {factoryName || <span style={{ color: "var(--text-4)" }}>—</span>}
                </InfoRow>
                <InfoRow icon={Flag} label={t("admin.profiles.colOwner")}>
                  {leader
                    ? tl(leader.name)
                    : <span style={{ color: "var(--text-4)" }}>{t("admin.profiles.cellUnassigned")}</span>}
                </InfoRow>
              </div>
            </Card>

            {/* Accounting flags */}
            <Card icon={Settings2} title={t("cellPage.secFlags")}>
              <div className="-my-2">
                <FlagRow
                  icon={LayoutGrid}
                  label={t("cellPage.inLoad")}
                  hint={t("cellPage.inLoadHint")}
                  control={isAdmin
                    ? <SegmentedToggle
                        size="sm"
                        ariaLabel={t("cellPage.inLoad")}
                        value={c.in_load ? "1" : "0"}
                        onChange={(v) => {
                          if (inLoadMut.isPending) return;
                          const want = v === "1";
                          if (want !== Boolean(c.in_load)) inLoadMut.mutate(want);
                        }}
                        options={[
                          { value: "1", label: t("cellPage.inLoadOn") },
                          { value: "0", label: t("cellPage.inLoadOff") },
                        ]}
                      />
                    : <Tag color={c.in_load ? GREEN : GREY}>
                        {t(c.in_load ? "cellPage.inLoadOn" : "cellPage.inLoadOff")}
                      </Tag>}
                />
                <FlagRow
                  icon={CalendarDays}
                  label={t("cellPage.attIncluded")}
                  hint={t("cellPage.attIncludedHint")}
                  control={
                    <Tag color={attResolved ? GREEN : GREY}>
                      {c.att_included == null
                        ? t("cellPage.attAuto")
                        : t(c.att_included ? "cellPage.attYes" : "cellPage.attNo")}
                    </Tag>}
                />
              </div>
            </Card>

            {/* Footprint across the cell-keyed tables */}
            <Card icon={Activity} title={t("cellPage.secActivity")}>
              <div className="-my-2">
                <ActRow
                  icon={CalendarDays}
                  label={t("cellPage.actAttendance")}
                  none={t("cellPage.actNone")}
                  parts={act.attendance?.days > 0 ? [
                    days(act.attendance.days),
                    last(act.attendance.last),
                    act.attendance.last_people > 0
                      ? t("cellPage.actPeople").replace("{n}", String(act.attendance.last_people))
                      : null,
                  ].filter(Boolean) : []}
                />
                <ActRow
                  icon={Timer}
                  label={t("cellPage.actOjidaniya")}
                  none={t("cellPage.actNone")}
                  parts={act.ojidaniya?.days > 0 ? [
                    days(act.ojidaniya.days),
                    last(act.ojidaniya.last),
                  ] : []}
                />
                <ActRow
                  icon={Wrench}
                  label={t("cellPage.actPerenaladka")}
                  none={t("cellPage.actNone")}
                  parts={act.perenaladka?.days > 0 ? [
                    days(act.perenaladka.days),
                    last(act.perenaladka.last),
                    `Σ ${t("cellPage.actMin").replace("{n}", String(Math.round(act.perenaladka.minutes || 0)))}`,
                  ] : []}
                />
                <ActRow
                  icon={Boxes}
                  label={t("cellPage.actProduction")}
                  none={c.sap_code ? t("cellPage.actNone") : t("cellPage.noSap")}
                  parts={act.production?.days > 0 ? [
                    days(act.production.days),
                    last(act.production.last),
                  ] : []}
                />
              </div>
            </Card>

          </div>
        </div>

        {/* Admin edit — the same form the /cells register opens */}
        {editOpen && (
          <CellFormModal
            mode="edit"
            item={c}
            units={(reg?.supervisors ?? []).filter((s) => !s.archived)}
            leaders={reg?.leaders ?? []}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["cell-details", id] });
              qc.invalidateQueries({ queryKey: ["admin-cells"] });
            }}
          />
        )}

        {toast.node}
      </div>
    </Layout>
  );
}
