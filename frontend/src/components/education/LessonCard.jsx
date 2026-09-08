import { Link } from "react-router-dom";
import { Pencil, Archive, ArchiveRestore, Users, Eye } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { LessonPoster, PlayBadge, PROVIDER_META } from "./VideoEmbed";

// uz/uz_cyrl have patchy Intl coverage across the WebViews this runs in, so a
// failed format falls back rather than throwing inside a render.
const LOCALES = { uz: "uz-UZ", uz_cyrl: "uz-Cyrl-UZ", ru: "ru-RU", en: "en-GB" };

export function lessonDate(iso, lang) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(LOCALES[lang] || "ru-RU",
      { day: "numeric", month: "short", year: "numeric" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * One lesson in the grid.
 *
 * The whole card is the target — a stretched link over the still and the title
 * — because a 16:9 thumbnail with a separate small link is a phone-hostile
 * shape. Admin actions sit ABOVE that overlay (`z-[2]`) so they stay clickable,
 * and they are real `<button>`s outside the `<a>`, which is what keeps the
 * markup valid rather than nesting interactives.
 */
export default function LessonCard({ lesson, canManage, onEdit, onArchive, onRestore }) {
  const { t, lang } = useLang();
  const meta = PROVIDER_META[lesson.provider] || {};
  const isNew = lesson.assigned && !lesson.seen;

  return (
    <article
      className="edu-card group relative flex flex-col rounded-2xl transition-shadow"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl"
           style={{ background: "var(--bg-inner)" }}>
        <LessonPoster thumb={lesson.thumb} provider={lesson.provider} title={lesson.title} />
        <PlayBadge />

        {isNew && (
          <span
            className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "var(--brand)", color: "#fff" }}
          >
            {t("education.new")}
          </span>
        )}
        {lesson.archived && (
          <span
            className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "rgba(0,0,0,0.62)", color: "#fff" }}
          >
            {t("education.archived")}
          </span>
        )}
        {meta.label && (
          <span
            className="absolute bottom-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide"
            style={{ background: "rgba(0,0,0,0.62)", color: "#fff" }}
          >
            {meta.label}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-3 py-3">
        <h3 className="edu-clamp-2 text-sm font-semibold leading-snug"
            style={{ color: "var(--text-1)" }}>
          {lesson.title}
        </h3>
        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
          {[lesson.author, lessonDate(lesson.created_at, lang)].filter(Boolean).join(" · ")}
        </p>

        {canManage && (
          <div className="relative z-[2] mt-1.5 flex items-center gap-1.5 pt-1.5"
               style={{ borderTop: "1px solid var(--border)" }}>
            <span className="inline-flex items-center gap-1 text-[11px]"
                  style={{ color: "var(--text-3)" }} title={t("education.audienceHint")}>
              <Users size={12} aria-hidden /> {lesson.audience}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px]"
                  style={{ color: "var(--text-3)" }} title={t("education.watchedHint")}>
              <Eye size={12} aria-hidden /> {lesson.watched ?? 0}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit?.(lesson)}
                className="edu-icon-btn"
                aria-label={`${t("education.edit")} — ${lesson.title}`}
                title={t("education.edit")}
              >
                <Pencil size={14} aria-hidden />
              </button>
              {lesson.archived ? (
                <button
                  type="button"
                  onClick={() => onRestore?.(lesson)}
                  className="edu-icon-btn"
                  aria-label={`${t("education.restore")} — ${lesson.title}`}
                  title={t("education.restore")}
                >
                  <ArchiveRestore size={14} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onArchive?.(lesson)}
                  className="edu-icon-btn edu-icon-btn-danger"
                  aria-label={`${t("education.archive")} — ${lesson.title}`}
                  title={t("education.archive")}
                >
                  <Archive size={14} aria-hidden />
                </button>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Stretched link: the card's single target, named by the title so a
          screen reader announces the lesson rather than "link". */}
      <Link to={`/education/${lesson.id}`} className="edu-stretch" title={lesson.title}>
        <span className="sr-only">{lesson.title}</span>
      </Link>
    </article>
  );
}
