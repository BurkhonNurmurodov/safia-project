import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough, EyeOff, Code, SquareCode,
  TextQuote, Link2, RemoveFormatting,
} from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import FormField from "./FormField";
import { useLang } from "../../context/LangContext";

/**
 * Canonical rich-text editor — THE template for formatted-text input.
 * Deliberately limited to the entities Telegram's Bot API HTML mode accepts
 * (bold / italic / underline / strikethrough / spoiler / inline code / code
 * block / blockquote / links) — no headings, lists, alignment or inline media,
 * so what the author sees is exactly what Telegram can render.
 *
 * Props:
 *   onChange    – ({ html, text }) on every edit; `html` is Telegram-ready
 *                 HTML (only whitelisted tags + real \n newlines), `text` is
 *                 the plain text whose .length matches Telegram's UTF-16
 *                 character accounting for limits.
 *   placeholder – muted hint shown while empty
 *   minHeight   – content area min height in px (default 180)
 *
 * Uncontrolled: remount with a new `key` to clear it after a successful send.
 */

const INLINE_TAGS = {
  b: "b", strong: "b",
  i: "i", em: "i",
  u: "u", ins: "u",
  s: "s", strike: "s", del: "s",
  code: "code",
  "tg-spoiler": "tg-spoiler",
};

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline-CSS formats: when formats are combined, execCommand often styles the
// EXISTING element instead of nesting a new tag (e.g. bold over an <i>
// selection yields <i style="font-weight:bold">) — read those styles as
// entities too, or the second format silently disappears from the DM.
function styleFormats(node) {
  const st = node.style;
  if (!st || !st.length) return [];
  const out = [];
  const fw = st.fontWeight;
  if (fw === "bold" || fw === "bolder" || parseInt(fw, 10) >= 600) out.push("b");
  if (st.fontStyle === "italic" || st.fontStyle === "oblique") out.push("i");
  const td = `${st.textDecorationLine || st.textDecoration || ""}`;
  if (td.includes("underline")) out.push("u");
  if (td.includes("line-through")) out.push("s");
  return out;
}

// DOM → { html, text }: Telegram HTML with real newlines + entity-free text.
export function serializeTelegram(root) {
  let html = "", text = "", atLineStart = true;
  const nl = () => {
    if (!atLineStart && (html || text)) { html += "\n"; text += "\n"; atLineStart = true; }
  };
  const walk = (node, active) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const v = node.nodeValue;
      if (!v) return;
      html += escapeHtml(v); text += v;
      atLineStart = v.endsWith("\n");
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === "br") { html += "\n"; text += "\n"; atLineStart = true; return; }

    // Every entity this element contributes: its tag + its inline styles,
    // minus what an ancestor already opened.
    const spoiler = tag === "tg-spoiler" || (tag === "span" && node.classList.contains("tg-spoiler"));
    const fmts = [];
    const tagFmt = spoiler ? "tg-spoiler" : INLINE_TAGS[tag];
    if (tagFmt) fmts.push(tagFmt);
    for (const f of styleFormats(node)) if (!fmts.includes(f)) fmts.push(f);
    const opened = fmts.filter((f) => !active.has(f));
    const nextActive = opened.length ? new Set([...active, ...opened]) : active;
    const open = () => { for (const f of opened) html += `<${f}>`; };
    const close = () => { for (const f of [...opened].reverse()) html += `</${f}>`; };

    const isBlock = tag === "div" || tag === "p" || tag === "pre" || tag === "blockquote";
    if (isBlock) nl();
    if (tag === "pre" || tag === "blockquote") {
      html += `<${tag}>`;
      atLineStart = true; // the opening tag itself starts the block's line
    }

    let href = null;
    if (tag === "a") {
      const h = (node.getAttribute("href") || "").trim();
      if (/^(https?|tg):/i.test(h)) href = h;
    }

    open();
    if (href) html += `<a href="${escapeHtml(href).replace(/"/g, "&quot;")}">`;
    node.childNodes.forEach((c) => walk(c, nextActive));
    if (href) html += "</a>";
    close();

    if (tag === "pre" || tag === "blockquote") html += `</${tag}>`;
    if (isBlock) nl();
  };
  root.childNodes.forEach((c) => walk(c, new Set()));
  html = html.replace(/\n+$/, "");
  text = text.replace(/\n+$/, "");
  return { html, text };
}

export default function RichTextEditor({ onChange, placeholder = "", minHeight = 180 }) {
  const { t } = useLang();
  const ref = useRef(null);
  const savedRange = useRef(null);
  const [empty, setEmpty] = useState(true);
  const [states, setStates] = useState({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkExisting, setLinkExisting] = useState(false);

  const inEditor = (node) => node && ref.current && ref.current.contains(node);

  const ancestor = (pred) => {
    const sel = window.getSelection();
    let n = sel?.anchorNode;
    if (!inEditor(n)) return null;
    while (n && n !== ref.current) {
      if (n.nodeType === Node.ELEMENT_NODE && pred(n)) return n;
      n = n.parentNode;
    }
    return null;
  };
  const ancestorTag = (tag) => ancestor((el) => el.tagName.toLowerCase() === tag);
  const ancestorSpoiler = () =>
    ancestor((el) => el.tagName.toLowerCase() === "tg-spoiler" ||
      (el.tagName.toLowerCase() === "span" && el.classList.contains("tg-spoiler")));

  const emit = () => {
    if (!ref.current) return;
    const out = serializeTelegram(ref.current);
    setEmpty(!out.text.trim());
    onChange?.(out);
  };

  const refreshStates = () => {
    const sel = window.getSelection();
    if (!inEditor(sel?.anchorNode)) return;
    setStates({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      strike: document.queryCommandState("strikeThrough"),
      code: !!ancestorTag("code"),
      spoiler: !!ancestorSpoiler(),
      quote: !!ancestorTag("blockquote"),
      pre: !!ancestorTag("pre"),
      link: !!ancestorTag("a"),
    });
  };

  useEffect(() => {
    // Prefer real tags (<b>, <i>, …) over style spans where the browser
    // honors it; styleFormats() in the serializer covers the cases it doesn't.
    try { document.execCommand("styleWithCSS", false, false); } catch { /* older engines */ }
    document.addEventListener("selectionchange", refreshStates);
    return () => document.removeEventListener("selectionchange", refreshStates);
  }, []);

  const exec = (cmd) => {
    ref.current?.focus();
    document.execCommand(cmd);
    refreshStates(); emit();
  };

  const unwrap = (el) => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  };

  const toggleInline = (kind) => { // "code" | "spoiler"
    ref.current?.focus();
    const existing = kind === "code" ? ancestorTag("code") : ancestorSpoiler();
    if (existing) { unwrap(existing); refreshStates(); emit(); return; }
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed || !inEditor(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const el = kind === "code"
      ? document.createElement("code")
      : Object.assign(document.createElement("span"), { className: "tg-spoiler" });
    try { range.surroundContents(el); }
    catch { el.appendChild(range.extractContents()); range.insertNode(el); }
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(el);
    sel.addRange(r);
    refreshStates(); emit();
  };

  const toggleBlock = (tag) => { // "blockquote" | "pre"
    ref.current?.focus();
    const active = !!ancestorTag(tag);
    document.execCommand("formatBlock", false, active ? "<div>" : `<${tag}>`);
    refreshStates(); emit();
  };

  const openLink = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !inEditor(sel.anchorNode)) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
    const a = ancestorTag("a");
    setLinkExisting(!!a);
    setLinkUrl(a ? a.getAttribute("href") || "" : "");
    setLinkOpen(true);
  };

  const restoreSelection = () => {
    ref.current?.focus();
    if (!savedRange.current) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.current);
  };

  const applyLink = () => {
    let url = linkUrl.trim();
    if (!url) { setLinkOpen(false); return; }
    if (!/^(https?|tg):/i.test(url)) url = `https://${url}`;
    setLinkOpen(false);
    restoreSelection();
    const sel = window.getSelection();
    if (sel.isCollapsed && !linkExisting) {
      document.execCommand("insertHTML", false,
        `<a href="${escapeHtml(url).replace(/"/g, "&quot;")}">${escapeHtml(url)}</a>`);
    } else {
      document.execCommand("createLink", false, url);
    }
    refreshStates(); emit();
  };

  const removeLink = () => {
    setLinkOpen(false);
    restoreSelection();
    document.execCommand("unlink");
    refreshStates(); emit();
  };

  const clearFormatting = () => {
    ref.current?.focus();
    document.execCommand("removeFormat");
    document.execCommand("unlink");
    let el;
    while ((el = ancestorTag("code") || ancestorSpoiler())) unwrap(el);
    if (ancestorTag("blockquote") || ancestorTag("pre")) {
      document.execCommand("formatBlock", false, "<div>");
    }
    refreshStates(); emit();
  };

  const onPaste = (e) => {
    e.preventDefault();
    const rich = e.clipboardData.getData("text/html");
    if (rich) {
      const tmp = document.createElement("div");
      tmp.innerHTML = rich;
      const { html } = serializeTelegram(tmp);
      document.execCommand("insertHTML", false, html.replace(/\n/g, "<br>"));
    } else {
      document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    }
    emit();
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openLink();
    }
  };

  const groups = [
    [
      { key: "bold", icon: Bold, title: t("rte.bold"), run: () => exec("bold") },
      { key: "italic", icon: Italic, title: t("rte.italic"), run: () => exec("italic") },
      { key: "underline", icon: Underline, title: t("rte.underline"), run: () => exec("underline") },
      { key: "strike", icon: Strikethrough, title: t("rte.strike"), run: () => exec("strikeThrough") },
    ],
    [
      { key: "spoiler", icon: EyeOff, title: t("rte.spoiler"), run: () => toggleInline("spoiler") },
      { key: "code", icon: Code, title: t("rte.code"), run: () => toggleInline("code") },
    ],
    [
      { key: "quote", icon: TextQuote, title: t("rte.quote"), run: () => toggleBlock("blockquote") },
      { key: "pre", icon: SquareCode, title: t("rte.codeBlock"), run: () => toggleBlock("pre") },
    ],
    [
      { key: "link", icon: Link2, title: t("rte.link"), run: openLink },
      { key: "clear", icon: RemoveFormatting, title: t("rte.clear"), run: clearFormatting },
    ],
  ];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}
    >
      <div
        className="flex flex-wrap items-center gap-0.5 px-2 py-1.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {groups.map((g, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="w-px h-4 mx-1" style={{ background: "var(--border-md)" }} />}
            {g.map(({ key, icon: Icon, title, run }) => (
              <button
                key={key}
                type="button"
                title={title}
                aria-label={title}
                aria-pressed={!!states[key]}
                onMouseDown={(e) => e.preventDefault()}
                onClick={run}
                className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                style={states[key]
                  ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
                  : { background: "transparent", color: "var(--text-3)" }}
              >
                <Icon size={14} />
              </button>
            ))}
          </div>
        ))}
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="tg-editor px-3 py-2.5 text-sm outline-none overflow-y-auto"
        style={{ minHeight, maxHeight: "45vh", color: "var(--text-1)" }}
        data-empty={empty ? "true" : "false"}
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onKeyUp={refreshStates}
        onMouseUp={refreshStates}
      />

      <Modal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        title={t("rte.linkTitle")}
        maxWidth="max-w-sm"
        footer={
          <>
            {linkExisting && (
              <Button variant="danger" onClick={removeLink}>{t("rte.linkRemove")}</Button>
            )}
            <Button variant="secondary" onClick={() => setLinkOpen(false)}>{t("rte.linkCancel")}</Button>
            <Button onClick={applyLink}>{t("rte.linkApply")}</Button>
          </>
        }
      >
        <FormField label="URL" required>
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyLink(); }}
            placeholder="https://…"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
