import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users, Eye, ExternalLink, ChevronDown, GraduationCap } from "lucide-react";
import api from "../utils/api";
import { useLang } from "../context/LangContext";
import Button from "../components/ui/Button";
import ErrorScreen from "../components/ui/ErrorScreen";
import { SkeletonBlock } from "../components/ui/Skeleton";
import VideoEmbed, { LessonPoster, PROVIDER_META } from "../components/education/VideoEmbed";
import { lessonDate } from "../components/education/LessonCard";

/**
 * One lesson, playing.
 *
 * A real route rather than a modal: the lesson DM links straight here, the
 * phone's back gesture works, and a leader can send a colleague the exact
 * lesson. It reads from the SAME list payload the grid does — one query, one
 * cache — so opening a lesson from the grid is instant and needs no second
 * endpoint that could disagree with the first about who may see what.
 */
export default function EducationLesson() {
  const { id } = useParams();
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openDesc, setOpenDesc] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["education-lessons"],
    queryFn: () => api.get("/api/education/lessons").then(r => r.data),
  });

  const lessons = data?.lessons || [];
  const lesson = useMemo(
    () => lessons.find((l) => String(l.id) === String(id)),
    [lessons, id]);
  const others = useMemo(
    () => lessons.filter((l) => String(l.id) !== String(id) && !l.archived).slice(0, 8),
    [lessons, id]);

  // Mark seen ONCE per mount, and only for a lesson actually addressed to this
  // viewer — an admin opening somebody else's lesson is not a member of the
  // class and must not appear in its watched count.
  const marked = useRef(null);
  const seen = useMutation({
    mutationFn: (lid) => api.post(`/api/education/seen/${lid}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["education-lessons"] }),
  });
  useEffect(() => {
    if (!lesson || !lesson.assigned || lesson.seen) return;
    if (marked.current === lesson.id) return;
    marked.current = lesson.id;
    seen.mutate(lesson.id);
  }, [lesson]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-8 w-40" />
        <SkeletonBlock className="aspect-video w-full rounded-2xl" />
        <SkeletonBlock className="h-5 w-2/3" />
        <SkeletonBlock className="h-3 w-1/3" />
      </div>
    );
  }

  // A lesson that is not in the payload is one this viewer may not see — the
  // id is typeable, and the backend scopes the list, so "missing here" and
  // "not yours" are the same answer. Saying so plainly beats a blank player.
  if (isError || !lesson) {
    return (
      <ErrorScreen
        inline
        tone="neutral"
        code="404"
        icon={GraduationCap}
        title={t("education.gone.title")}
        message={t("education.gone.message")}
        action={{ label: t("education.backToList"), onClick: () => navigate("/education") }}
      />
    );
  }

  const meta = PROVIDER_META[lesson.provider] || {};
  const hasDesc = !!(lesson.description_html || "").trim();

  return (
    <div className="space-y-4">
      <Link
        to="/education"
        className="inline-flex items-center gap-1.5 text-sm font-medium"
        style={{ color: "var(--text-3)" }}
      >
        <ArrowLeft size={15} aria-hidden /> {t("education.backToList")}
      </Link>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <VideoEmbed embed={lesson.embed} provider={lesson.provider} title={lesson.title} />

          <div className="space-y-2">
            <h1 className="text-xl font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
              {lesson.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
                 style={{ color: "var(--text-3)" }}>
              {lesson.author && <span>{lesson.author}</span>}
              <span>{lessonDate(lesson.created_at, lang)}</span>
              {meta.label && (
                <a
                  href={lesson.watch}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-2"
                  style={{ color: "var(--text-3)" }}
                >
                  {meta.label} <ExternalLink size={11} aria-hidden />
                </a>
              )}
              {/* Admin-only facts: who it went to and how many opened it. */}
              {lesson.targets && (
                <>
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} aria-hidden /> {lesson.audience}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Eye size={12} aria-hidden /> {lesson.watched ?? 0}
                  </span>
                </>
              )}
            </div>
          </div>

          {hasDesc && (
            <section
              className="rounded-2xl px-4 py-3"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div
                className={openDesc ? "edu-prose" : "edu-prose edu-clamp-3"}
                /* Admin-authored, admin-only to write, and the same HTML the
                   broadcast editor already produces for Telegram. */
                dangerouslySetInnerHTML={{ __html: lesson.description_html }}
              />
              <button
                type="button"
                onClick={() => setOpenDesc((v) => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
                style={{ color: "var(--brand)" }}
                aria-expanded={openDesc}
              >
                {openDesc ? t("education.less") : t("education.more")}
                <ChevronDown
                  size={13}
                  aria-hidden
                  style={{ transform: openDesc ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}
                />
              </button>
            </section>
          )}
        </div>

        {/* Up next. Desktop only — on a phone it would push the description off
            the first screen, and the grid is one tap away. */}
        {others.length > 0 && (
          <aside className="hidden min-w-0 space-y-2 xl:block">
            <h2 className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}>
              {t("education.otherLessons")}
            </h2>
            {others.map((o) => (
              <Link
                key={o.id}
                to={`/education/${o.id}`}
                className="edu-card flex gap-2.5 rounded-xl p-2"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg"
                     style={{ background: "var(--bg-inner)" }}>
                  <LessonPoster thumb={o.thumb} provider={o.provider} title={o.title} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="edu-clamp-2 text-xs font-medium leading-snug"
                     style={{ color: "var(--text-1)" }}>
                    {o.title}
                  </p>
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--text-4)" }}>
                    {lessonDate(o.created_at, lang)}
                  </p>
                </div>
                {o.assigned && !o.seen && (
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--brand)" }} aria-label={t("education.new")} />
                )}
              </Link>
            ))}
          </aside>
        )}
      </div>

      <div className="xl:hidden">
        <Button variant="secondary" onClick={() => navigate("/education")}>
          {t("education.backToList")}
        </Button>
      </div>
    </div>
  );
}
