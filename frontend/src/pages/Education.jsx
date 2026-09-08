import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, GraduationCap, Archive } from "lucide-react";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonBlock } from "../components/ui/Skeleton";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import LessonCard from "../components/education/LessonCard";
import LessonWizard from "../components/education/LessonWizard";

/**
 * «Ta'lim» — the lesson grid.
 *
 * For a leader this is the whole page: the lessons addressed to them, newest
 * first, one tap from playing. An admin gets the same grid plus the publishing
 * controls, deliberately on the SAME surface rather than in the admin panel —
 * whoever publishes a lesson should be looking at exactly what the class sees.
 */
export default function Education() {
  const { t } = useLang();
  const qc = useQueryClient();
  const toast = useToast();

  const [q, setQ] = usePersistentState("education_q", "");
  const [view, setView] = usePersistentState("education_view", "active");
  const [wizard, setWizard] = useState(null);   // null | {} | lesson
  const [confirm, setConfirm] = useState(null); // the lesson pending archive

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["education-lessons"],
    queryFn: () => api.get("/api/education/lessons").then(r => r.data),
  });

  const canManage = !!data?.can_manage;
  const lessons = data?.lessons || [];

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return lessons.filter((l) => {
      // The archive view exists only for admins — a non-admin is never served
      // an archived lesson at all, so the toggle would filter an empty set.
      if (canManage && (view === "archived") !== !!l.archived) return false;
      if (!needle) return true;
      return `${l.title} ${l.description_text || ""} ${l.author || ""}`
        .toLowerCase().includes(needle);
    });
  }, [lessons, q, view, canManage]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["education-lessons"] });

  const save = useMutation({
    mutationFn: (body) => (wizard?.id
      ? api.put(`/api/education/lessons/${wizard.id}`, body)
      : api.post("/api/education/lessons", body)).then(r => r.data),
    onSuccess: (res) => {
      setWizard(null);
      invalidate();
      // The count is the point of the confirmation: publishing DMs people, and
      // the admin should be told how many rather than guessing from the tree.
      toast.success(res?.notified
        ? t("education.toast.published").replace("{n}", res.notified)
        : t("education.toast.saved"));
    },
  });

  const archive = useMutation({
    mutationFn: (l) => api.delete(`/api/education/lessons/${l.id}`).then(r => r.data),
    onSuccess: () => { setConfirm(null); invalidate(); toast.success(t("education.toast.archived")); },
  });

  const restore = useMutation({
    mutationFn: (l) => api.post(`/api/education/lessons/${l.id}/restore`).then(r => r.data),
    onSuccess: () => { invalidate(); toast.success(t("education.toast.restored")); },
  });

  const saveErr = save.isError
    ? (save.error?.response?.data?.detail === "bad_video_url"
        ? t("education.wizard.urlBad")
        : t("education.toast.saveFailed"))
    : null;

  return (
    <div className="space-y-4">
      {/* Header. The primary action is the only filled button on the page. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>
            {t("nav.education")}
          </h1>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>
            {canManage ? t("education.subtitleAdmin") : t("education.subtitle")}
          </p>
        </div>
        {canManage && (
          <Button size="lg" className="ml-auto" onClick={() => setWizard({})}>
            <Plus size={16} aria-hidden /> {t("education.newLesson")}
          </Button>
        )}
      </div>

      {/* One toolbar row, 38px baseline. Search is always inline — a filter that
          narrows what is on screen must never be behind a button. */}
      {(lessons.length > 0 || q) && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder={t("education.search")}
            className="min-w-[200px] max-w-sm flex-1"
            inputClassName="text-sm pl-8 pr-7 py-2"
          />
          {canManage && (
            <SegmentedToggle
              asTabs
              value={view}
              onChange={setView}
              options={[
                { value: "active", label: t("education.view.active") },
                { value: "archived", label: t("education.view.archived") },
              ]}
            />
          )}
          <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
            {t("education.countN").replace("{n}", shown.length)}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl overflow-hidden"
                 style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <SkeletonBlock className="aspect-video w-full rounded-none" />
              <div className="space-y-2 p-3">
                <SkeletonBlock className="h-3.5 w-4/5" />
                <SkeletonBlock className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={GraduationCap}
          title={t("education.error.title")}
          message={t("education.error.message")}
          showUploadLink={false}
          height="h-56"
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={view === "archived" ? Archive : GraduationCap}
          title={
            q ? t("education.empty.searchTitle")
              : view === "archived" ? t("education.empty.archivedTitle")
              : canManage ? t("education.empty.adminTitle")
              : t("education.empty.title")
          }
          message={
            q ? t("education.empty.searchMessage")
              : view === "archived" ? t("education.empty.archivedMessage")
              : canManage ? t("education.empty.adminMessage")
              : t("education.empty.message")
          }
          showUploadLink={false}
          height="h-56"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {shown.map((l) => (
            <LessonCard
              key={l.id}
              lesson={l}
              canManage={canManage}
              onEdit={(x) => setWizard(x)}
              onArchive={(x) => setConfirm(x)}
              onRestore={(x) => restore.mutate(x)}
            />
          ))}
        </div>
      )}

      {canManage && (
        <LessonWizard
          open={!!wizard}
          lesson={wizard?.id ? wizard : null}
          onClose={() => { save.reset(); setWizard(null); }}
          onSubmit={(body) => save.mutate(body)}
          saving={save.isPending}
          error={saveErr}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          tone="danger"
          icon={Archive}
          title={t("education.confirm.archiveTitle")}
          message={t("education.confirm.archiveMessage").replace("{title}", confirm.title)}
          confirmLabel={t("education.archive")}
          loading={archive.isPending}
          error={archive.isError ? t("education.toast.saveFailed") : null}
          onCancel={() => { archive.reset(); setConfirm(null); }}
          onConfirm={() => archive.mutate(confirm)}
        />
      )}

      {toast.node}
    </div>
  );
}
