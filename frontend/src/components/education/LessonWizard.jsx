import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Users, Check, AlertTriangle, Loader2 } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import SearchInput from "../ui/SearchInput";
import RichTextEditor from "../ui/RichTextEditor";
import CheckboxTree, { collectLeafKeys } from "../ui/CheckboxTree";
import { buildRecipientGroups, profileTargetKey, profileKeyOf, isProfileTarget }
  from "../../utils/broadcastTree";
import { LessonPoster, PROVIDER_META } from "./VideoEmbed";

const STEPS = ["details", "audience"];

/**
 * Publish or edit a lesson. TWO steps, in the order the decision is actually
 * made: what the lesson IS, then who it is FOR.
 *
 * Both steps are held in local state and nothing is written until the last
 * press — an audience half-picked is not a lesson published to half a plant.
 * Editing seeds the same two steps from the existing lesson, audience
 * included, because "change who can see this" is the same decision as "choose
 * who can see this" and must not be a second, differently-shaped screen.
 */
export default function LessonWizard({ open, lesson, onClose, onSubmit, saving, error }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const editing = !!lesson;

  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState({ html: "", text: "" });
  const [picked, setPicked] = useState([]);
  const [filter, setFilter] = useState("");
  const [touchedUrl, setTouchedUrl] = useState(false);
  // The editor is uncontrolled (contenteditable); remounting it is the only way
  // to re-seed it, so the key changes when a different lesson is opened.
  const [editorKey, setEditorKey] = useState(0);
  const seeded = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Seed once per opening, not on every render — the user is typing into this.
    const sig = lesson ? `edit:${lesson.id}` : "new";
    if (seeded.current === sig) return;
    seeded.current = sig;
    setStep(0);
    setFilter("");
    setTouchedUrl(false);
    setUrl(lesson?.url || "");
    setTitle(lesson?.title || "");
    setDesc({ html: lesson?.description_html || "", text: lesson?.description_text || "" });
    setPicked((lesson?.targets || []).map(profileTargetKey));
    setEditorKey((k) => k + 1);
  }, [open, lesson]);
  useEffect(() => { if (!open) seeded.current = null; }, [open]);

  // ── the link, resolved by the SERVER ─────────────────────────────────────
  // Debounced onto POST /resolve rather than parsed here: the backend parser is
  // THE parser, and a JavaScript twin is how a link previews one way and stores
  // another. 400ms is below the threshold where a preview feels laggy and well
  // above per-keystroke chatter.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(url.trim()), 400);
    return () => clearTimeout(id);
  }, [url]);

  const { data: resolved, isFetching: resolving } = useQuery({
    queryKey: ["education-resolve", debounced],
    queryFn: () => api.post("/api/education/resolve", { url: debounced }).then(r => r.data),
    enabled: open && debounced.length > 3,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const urlOk = !!resolved?.ok;
  const urlBad = debounced.length > 3 && !resolving && resolved && !resolved.ok;

  // ── the audience tree ────────────────────────────────────────────────────
  const { data: recip, isLoading: treeLoading } = useQuery({
    queryKey: ["education-recipients"],
    queryFn: () => api.get("/api/education/recipients").then(r => r.data),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  // `only: true` makes the PROFILE the selectable leaf and drops its Telegram
  // accounts from the tree — the shape the Permissions tab uses. That is the
  // whole difference from the broadcast picker next door: a lesson is addressed
  // to a POST, so listing logins underneath would offer a target this feature
  // cannot write to.
  const groups = useMemo(() => buildRecipientGroups(
    recip?.tree, t, tl, t("education.wizard.noHolders"),
    undefined,
    (p) => ({ only: true, hint: (p.users || []).length ? undefined : t("education.wizard.unclaimed") }),
  ), [recip, t, tl]);

  const allKeys = useMemo(() => collectLeafKeys(groups), [groups]);
  // A saved target whose profile has since been deleted must not drive a tree
  // that cannot show it — the same reconciliation the Permissions picker makes.
  const selected = useMemo(() => {
    const ok = new Set(allKeys);
    return picked.filter((k) => ok.has(k));
  }, [picked, allKeys]);

  const count = selected.length;
  const canNext = title.trim().length > 0 && urlOk;
  const canPublish = canNext && count > 0;

  const submit = () => {
    if (!canPublish) return;
    onSubmit?.({
      title: title.trim(),
      url: url.trim(),
      description_html: desc.html || "",
      description_text: desc.text || "",
      targets: selected.filter(isProfileTarget).map(profileKeyOf),
    });
  };

  const footer = (
    <div className="flex w-full items-center gap-2">
      <Button variant="secondary" onClick={onClose} disabled={saving}>
        {t("common.cancel")}
      </Button>
      <div className="ml-auto flex items-center gap-2">
        {step === 1 && (
          <Button variant="ghost" onClick={() => setStep(0)} disabled={saving}>
            {t("education.wizard.back")}
          </Button>
        )}
        {step === 0 ? (
          <Button onClick={() => setStep(1)} disabled={!canNext}>
            {t("education.wizard.next")}
          </Button>
        ) : (
          <Button onClick={submit} disabled={!canPublish} loading={saving}>
            {editing ? t("education.wizard.save") : t("education.wizard.publish")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissable={!saving}
      maxWidth="max-w-3xl"
      title={editing ? t("education.wizard.editTitle") : t("education.wizard.newTitle")}
      subtitle={editing ? lesson?.title : t("education.wizard.newSubtitle")}
      footer={footer}
      bodyClassName="px-5 py-4 space-y-4"
    >
      {/* Step rail. Named steps, not dots: "1 of 2" says how long this is, the
          names say what is still coming. */}
      <ol className="flex items-center gap-2" aria-label={t("education.wizard.steps")}>
        {STEPS.map((s, i) => {
          const done = i < step;
          const now = i === step;
          return (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={{
                  background: now || done ? "var(--brand)" : "var(--bg-inner)",
                  color: now || done ? "#fff" : "var(--text-3)",
                  border: `1px solid ${now || done ? "var(--brand)" : "var(--border)"}`,
                }}
              >
                {done ? <Check size={13} aria-hidden /> : i + 1}
              </span>
              <span
                className="truncate text-xs font-medium"
                style={{ color: now ? "var(--text-1)" : "var(--text-3)" }}
                aria-current={now ? "step" : undefined}
              >
                {t(`education.wizard.step.${s}`)}
              </span>
              {i < STEPS.length - 1 && (
                <span className="h-px flex-1" style={{ background: "var(--border)" }} />
              )}
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <div className="space-y-4">
          <FormField
            label={t("education.wizard.url")}
            required
            hint={t("education.wizard.urlHint")}
            error={touchedUrl && urlBad ? t("education.wizard.urlBad") : undefined}
          >
            <div className="relative">
              <Link2
                size={15}
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-4)" }}
              />
              <input
                value={url}
                onChange={(e) => { setUrl(e.target.value); setTouchedUrl(true); }}
                onBlur={() => setTouchedUrl(true)}
                placeholder="https://www.loom.com/share/…"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl py-2 pl-8 pr-9 text-sm outline-none"
                style={{
                  background: "var(--bg-inner)",
                  border: `1px solid ${urlBad ? "#ef4444" : "var(--border)"}`,
                  color: "var(--text-1)",
                }}
              />
              {resolving && (
                <Loader2
                  size={15}
                  aria-hidden
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin"
                  style={{ color: "var(--text-4)" }}
                />
              )}
            </div>
          </FormField>

          {/* The preview is the proof the link resolved. Without it the admin
              finds out at publish time — after the audience has been picked. */}
          {urlOk && (
            <div
              className="flex items-center gap-3 rounded-xl p-2"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
            >
              <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg">
                <LessonPoster thumb={resolved.thumb} provider={resolved.provider} title={title} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>
                  {PROVIDER_META[resolved.provider]?.label || resolved.provider}
                </p>
                <p className="truncate text-[11px]" style={{ color: "var(--text-3)" }}>
                  {resolved.video_id}
                </p>
              </div>
              <Check size={16} aria-hidden className="ml-auto shrink-0" style={{ color: "#22c55e" }} />
            </div>
          )}

          <FormField label={t("education.wizard.lessonTitle")} required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              placeholder={t("education.wizard.titlePlaceholder")}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--bg-inner)",
                border: "1px solid var(--border)",
                color: "var(--text-1)",
              }}
            />
          </FormField>

          <FormField label={t("education.wizard.description")} hint={t("education.wizard.descriptionHint")}>
            {/* The CLASSIC Telegram formatter, deliberately not `rich`. A lesson
                description is prose with emphasis and the odd link — the rich
                dialect's tables, headings, collapsibles and media embeds are a
                broadcast's tools, and offering them here invites a description
                nothing on this page is built to render. Classic also emits raw
                \n newlines, which is why the read side uses `.tg-msg`. */}
            <RichTextEditor
              key={editorKey}
              initialHtml={lesson?.description_html || ""}
              minHeight={140}
              placeholder={t("education.wizard.descriptionPlaceholder")}
              onChange={(out) => setDesc({ html: out.html || "", text: out.text || "" })}
            />
          </FormField>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={filter}
              onChange={setFilter}
              placeholder={t("education.wizard.searchProfiles")}
              className="min-w-[200px] flex-1"
            />
            <span
              className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-medium"
              style={{
                background: count ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "var(--bg-inner)",
                border: `1px solid ${count ? "var(--brand)" : "var(--border)"}`,
                color: count ? "var(--brand)" : "var(--text-3)",
              }}
            >
              <Users size={13} aria-hidden />
              {t("education.wizard.selectedN").replace("{n}", count)}
            </span>
            {count > 0 && (
              <Button variant="ghost" size="md" onClick={() => setPicked([])}>
                {t("education.wizard.clear")}
              </Button>
            )}
          </div>

          <div
            className="max-h-[46vh] overflow-y-auto rounded-xl p-1"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
          >
            {treeLoading ? (
              <p className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>
                {t("education.loading")}
              </p>
            ) : (
              <CheckboxTree
                groups={groups}
                selected={selected}
                onChange={setPicked}
                filter={filter}
                emptyText={t("education.wizard.noMatch")}
              />
            )}
          </div>

          <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {editing ? t("education.wizard.editAudienceHint") : t("education.wizard.audienceHint")}
          </p>
        </div>
      )}

      {error && (
        <p
          className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
          style={{
            background: "color-mix(in srgb, #ef4444 12%, transparent)",
            border: "1px solid color-mix(in srgb, #ef4444 40%, transparent)",
            color: "#ef4444",
          }}
          role="alert"
        >
          <AlertTriangle size={14} aria-hidden className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </Modal>
  );
}
