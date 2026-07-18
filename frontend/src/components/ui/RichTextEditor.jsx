import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline, Strikethrough, EyeOff, Code, SquareCode,
  TextQuote, Link2, RemoveFormatting, Heading1, Heading2, Heading3,
  Heading4, Heading5, Heading6, Type, Plus, Check, ChevronLeft,
  List, ListOrdered, ListChecks, ChevronsRight, ChevronsLeft,
  SeparatorHorizontal, Table as TableIcon, ChevronsDownUp, Sigma,
  Paperclip, Image as ImageIcon, Music, Quote, Highlighter,
  Subscript, Superscript, Clipboard, CheckSquare, Eraser, Trash2,
  AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import FormField from "./FormField";
import SegmentedToggle from "./SegmentedToggle";
import { useLang } from "../../context/LangContext";

/**
 * Canonical rich-text editor — THE template for formatted-text input.
 *
 * Two dialects, one component:
 *   default      – the classic Telegram entity subset (bold / italic /
 *                  underline / strikethrough / spoiler / inline code / code
 *                  block / blockquote / links) with a flat toolbar.
 *                  Serializes to parse_mode HTML with real \n newlines.
 *   rich={true}  – mirrors Telegram's NATIVE rich-message composer:
 *                  · compact menu toolbar — [+ format] [lists] [quote]
 *                    [table] [attach] [link] [clear], formatting lives in
 *                    menus exactly like Telegram's, not a flat button wall
 *                  · table button drops a default 2×2 table instantly;
 *                    everything else is done from the RIGHT-CLICK context
 *                    menu (insert/delete rows & columns, highlight = header
 *                    cell, per-cell alignment) plus Tab/Shift+Tab movement
 *                  · Enter = paragraph semantics (exits an empty line in a
 *                    quote/code/details block, ends a heading, soft-breaks
 *                    inside table cells); Shift+Enter = soft line break
 *                  · blockquote/pull-quote author lines via <cite>
 *                  Serializes to Rich HTML (Bot API 10.1+): <p> paragraph
 *                  blocks, tg://…?id= media links, adjacent media grouped
 *                  into <tg-collage> (Telegram albums).
 *
 * Props:
 *   onChange    – ({ html, text, media }) on every edit; `media` lists the
 *                 embedded files present in the message ([] in classic mode)
 *   placeholder – muted hint shown while empty
 *   minHeight   – content area min height in px (default 180)
 *   rich        – enable the rich dialect (content survives toggling)
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
const INLINE_RICH_EXTRA = { mark: "mark", sub: "sub", sup: "sup", cite: "cite" };

const MEDIA_LIMIT = 50;

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const escAttr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

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

function mediaRefTag(id, kind) {
  if (kind === "photo") return `<img src="tg://photo?id=${id}"/>`;
  if (kind === "audio" || kind === "voice") return `<audio src="tg://audio?id=${id}"></audio>`;
  return `<video src="tg://video?id=${id}"></video>`; // video + animation
}

// ── Classic serializer: DOM → Telegram parse_mode HTML with \n newlines ─────
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
    if (node.getAttribute && node.getAttribute("data-tg-media")) return; // rich-only embeds
    if (tag === "input" || tag === "hr") return;

    const spoiler = tag === "tg-spoiler" || (tag === "span" && node.classList.contains("tg-spoiler"));
    const fmts = [];
    const tagFmt = spoiler ? "tg-spoiler" : INLINE_TAGS[tag];
    if (tagFmt) fmts.push(tagFmt);
    for (const f of styleFormats(node)) if (!fmts.includes(f)) fmts.push(f);
    const opened = fmts.filter((f) => !active.has(f));
    const nextActive = opened.length ? new Set([...active, ...opened]) : active;
    const open = () => { for (const f of opened) html += `<${f}>`; };
    const close = () => { for (const f of [...opened].reverse()) html += `</${f}>`; };

    const isBlock = ["div", "p", "pre", "blockquote", "aside", "footer", "h1", "h2", "h3",
      "h4", "h5", "h6", "ul", "ol", "li", "table", "tr", "details", "summary", "figure"].includes(tag);
    if (isBlock) nl();
    const blockTag = tag === "pre" ? "pre" : (tag === "blockquote" || tag === "aside") ? "blockquote" : null;
    if (blockTag) { html += `<${blockTag}>`; atLineStart = true; }

    let href = null;
    if (tag === "a") {
      const h = (node.getAttribute("href") || "").trim();
      if (/^(https?|tg):/i.test(h)) href = h;
    }

    open();
    if (href) html += `<a href="${escAttr(href)}">`;
    node.childNodes.forEach((c) => walk(c, nextActive));
    if (href) html += "</a>";
    close();

    if (blockTag) html += `</${blockTag}>`;
    if (isBlock) nl();
  };
  root.childNodes.forEach((c) => walk(c, new Set()));
  html = html.replace(/\n+$/, "");
  text = text.replace(/\n+$/, "");
  return { html, text, mediaIds: [] };
}

// ── Rich serializer: DOM → Rich HTML (Bot API 10.1+) ────────────────────────
// Rich HTML follows HTML whitespace rules (raw newlines DON'T break lines), so
// every editor line becomes a <p> block. Media must be standalone blocks, so
// embeds found inside lines or nested blocks are hoisted to the nearest
// top-level position after their block.
export function serializeRich(root) {
  const textParts = [];
  const mediaIds = [];
  let pendingMedia = []; // hoisted out of nested contexts

  const seenMedia = (node) => {
    const id = node.getAttribute("data-tg-media");
    const kind = node.getAttribute("data-kind") || "photo";
    const caption = (node.getAttribute("data-caption") || "").trim();
    if (!mediaIds.some((m) => m.id === id)) mediaIds.push({ id, kind });
    return { tag: mediaRefTag(id, kind), kind, caption };
  };

  // Adjacent visual media (photos/videos/animations) group into ONE
  // <tg-collage> — the rich-message equivalent of a Telegram album — so
  // stacked uploads render side by side instead of as separate rows.
  // Captioned media become standalone <figure><figcaption> blocks (a collage
  // has no per-item captions); audio can't join a collage; 10 = album ceiling.
  const groupMedia = (run) => {
    let out = "", buf = [];
    const flushBuf = () => {
      for (let i = 0; i < buf.length; i += 10) {
        const chunk = buf.slice(i, i + 10);
        out += chunk.length >= 2
          ? `<tg-collage>${chunk.map((m) => m.tag).join("")}</tg-collage>`
          : chunk.map((m) => m.tag).join("");
      }
      buf = [];
    };
    for (const m of run) {
      const isAudio = m.kind === "audio" || m.kind === "voice";
      if (m.caption) {
        flushBuf();
        out += `<figure>${m.tag}<figcaption>${escapeHtml(m.caption)}</figcaption></figure>`;
      } else if (isAudio) {
        flushBuf();
        out += m.tag;
      } else {
        buf.push(m);
      }
    }
    flushBuf();
    return out;
  };

  const BLOCK_TAGS = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol",
    "table", "blockquote", "aside", "pre", "footer", "details", "hr", "figure"]);

  // inline content; nested blocks flatten to <br> separations
  const inline = (node, active) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const v = node.nodeValue || "";
      textParts.push(v);
      return escapeHtml(v);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    if (tag === "br") { textParts.push("\n"); return "<br/>"; }
    if (node.hasAttribute("data-tg-cap")) return ""; // in-editor caption label
    if (node.getAttribute("data-tg-media")) {
      pendingMedia.push(seenMedia(node));
      return "";
    }
    if (tag === "input") {
      return (node.getAttribute("type") || "").toLowerCase() === "checkbox"
        ? `<input type="checkbox"${node.checked ? " checked" : ""}>`
        : "";
    }
    if (node.classList.contains("tg-math-block") || node.classList.contains("tg-math")) {
      const src = node.textContent || "";
      textParts.push(src);
      const t = node.classList.contains("tg-math-block") ? "tg-math-block" : "tg-math";
      return `<${t}>${escapeHtml(src)}</${t}>`;
    }

    const spoiler = tag === "tg-spoiler" || (tag === "span" && node.classList.contains("tg-spoiler"));
    const fmts = [];
    const tagFmt = spoiler ? "tg-spoiler" : INLINE_TAGS[tag] || INLINE_RICH_EXTRA[tag];
    if (tagFmt) fmts.push(tagFmt);
    for (const f of styleFormats(node)) if (!fmts.includes(f)) fmts.push(f);
    const opened = fmts.filter((f) => !active.has(f));
    const nextActive = opened.length ? new Set([...active, ...opened]) : active;

    let inner = "";
    if (BLOCK_TAGS.has(tag) || tag === "li" || tag === "summary") {
      // block landed in an inline slot (e.g. div inside li) → <br> separation
      textParts.push("\n");
      inner = "<br/>" + inlineChildren(node, nextActive);
    } else if (tag === "a") {
      const h = (node.getAttribute("href") || "").trim();
      inner = inlineChildren(node, nextActive);
      if (/^(https?:|mailto:|tel:|tg:|#)/i.test(h)) inner = `<a href="${escAttr(h)}">${inner}</a>`;
    } else {
      inner = inlineChildren(node, nextActive);
    }
    return opened.map((f) => `<${f}>`).join("") + inner +
      [...opened].reverse().map((f) => `</${f}>`).join("");
  };
  const inlineChildren = (node, active) => {
    let out = "";
    node.childNodes.forEach((c) => { out += inline(c, active); });
    return out;
  };

  const flushPending = () => {
    const out = groupMedia(pendingMedia);
    pendingMedia = [];
    return out;
  };

  const nonEmptyLine = (s) => s.replace(/<br\/>/g, "").replace(/&nbsp;/g, " ").trim() !== "";

  // children of a block container → sequence of <p> lines + block elements
  const blocks = (node) => {
    let out = "", line = "";
    let mediaRun = []; // consecutive block-level media → one collage
    const flushMediaRun = () => {
      if (mediaRun.length) { out += groupMedia(mediaRun); mediaRun = []; }
    };
    const flushLine = () => {
      if (nonEmptyLine(line)) { out += `<p>${line}</p>`; textParts.push("\n"); }
      line = "";
      out += flushPending();
    };
    node.childNodes.forEach((c) => {
      const isEl = c.nodeType === Node.ELEMENT_NODE;
      const tag = isEl ? c.tagName.toLowerCase() : null;
      if (isEl && c.getAttribute("data-tg-media")) {
        flushLine();
        mediaRun.push(seenMedia(c));
        return;
      }
      // whitespace between adjacent media must not break the collage run
      if (!isEl && !(c.nodeValue || "").trim() && mediaRun.length) return;
      if (isEl && (BLOCK_TAGS.has(tag) || c.classList.contains("tg-math-block"))) {
        flushLine();
        flushMediaRun();
        out += blockNode(c);
      } else {
        flushMediaRun();
        line += inline(c, new Set());
      }
    });
    flushLine();
    flushMediaRun();
    return out;
  };

  const listAttrs = (node) => {
    let a = "";
    const start = node.getAttribute("start");
    const type = node.getAttribute("type");
    if (start) a += ` start="${escAttr(start)}"`;
    if (type) a += ` type="${escAttr(type)}"`;
    if (node.hasAttribute("reversed")) a += " reversed";
    return a;
  };

  const blockNode = (node) => {
    const tag = node.tagName.toLowerCase();
    if (node.classList.contains("tg-math-block")) {
      const src = node.textContent || "";
      textParts.push(src, "\n");
      return `<tg-math-block>${escapeHtml(src)}</tg-math-block>`;
    }
    switch (tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        const inner = inlineChildren(node, new Set());
        textParts.push("\n");
        return `<${tag}>${inner}</${tag}>` + flushPending();
      }
      case "pre": {
        const src = node.textContent || "";
        textParts.push(src, "\n");
        return `<pre>${escapeHtml(src)}</pre>`;
      }
      case "blockquote": case "aside": case "footer": {
        const inner = inlineChildren(node, new Set());
        textParts.push("\n");
        return `<${tag}>${inner}</${tag}>` + flushPending();
      }
      case "ul": case "ol": {
        let items = "";
        node.childNodes.forEach((c) => {
          if (c.nodeType !== Node.ELEMENT_NODE) return;
          const t = c.tagName.toLowerCase();
          if (t === "li") {
            let li = "";
            c.childNodes.forEach((cc) => {
              const el = cc.nodeType === Node.ELEMENT_NODE;
              const ct = el ? cc.tagName.toLowerCase() : null;
              if (el && (ct === "ul" || ct === "ol")) li += blockNode(cc);
              else li += inline(cc, new Set());
            });
            items += `<li>${li}</li>`;
            textParts.push("\n");
          } else if (t === "ul" || t === "ol") {
            items += blockNode(c);
          }
        });
        return `<${tag}${tag === "ol" ? listAttrs(node) : ""}>${items}</${tag}>` + flushPending();
      }
      case "table": {
        let rows = "";
        for (const tr of node.rows || []) {
          let cells = "";
          for (const cell of tr.cells || []) {
            const ct = cell.tagName.toLowerCase() === "th" ? "th" : "td";
            let a = "";
            if (cell.colSpan > 1) a += ` colspan="${cell.colSpan}"`;
            if (cell.rowSpan > 1) a += ` rowspan="${cell.rowSpan}"`;
            const al = (cell.getAttribute("align") || "").toLowerCase();
            if (["left", "center", "right"].includes(al)) a += ` align="${al}"`;
            cells += `<${ct}${a}>${inlineChildren(cell, new Set())}</${ct}>`;
            textParts.push("\n");
          }
          rows += `<tr>${cells}</tr>`;
        }
        let a = "";
        if (node.hasAttribute("bordered")) a += " bordered";
        if (node.hasAttribute("striped")) a += " striped";
        return `<table${a}>${rows}</table>` + flushPending();
      }
      case "details": {
        let summary = "";
        node.childNodes.forEach((c) => {
          if (c.nodeType === Node.ELEMENT_NODE && c.tagName.toLowerCase() === "summary") {
            summary = inlineChildren(c, new Set());
            textParts.push("\n");
          }
        });
        const clone = { childNodes: [...node.childNodes].filter((c) =>
          !(c.nodeType === Node.ELEMENT_NODE && c.tagName.toLowerCase() === "summary")) };
        const rest = blocks(clone);
        // collapsed by default on delivery — `open` only serves in-editor editing
        return `<details><summary>${summary}</summary>${rest}</details>`;
      }
      case "hr":
        return "<hr/>";
      case "figure":
        return blocks(node);
      default: // div / p and anything else container-ish
        return blocks(node);
    }
  };

  let html = blocks(root);
  html += flushPending();
  const text = textParts.join("").replace(/\n+$/, "");
  return { html, text, mediaIds };
}

// ── Menu chrome (toolbar dropdowns + context menu share the same look) ──────

function MenuList({ items, onAction }) {
  return (
    <>
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="my-1 h-px" style={{ background: "var(--border)" }} />
        ) : (
          <button
            key={it.key || i}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { if (!it.disabled) onAction(it); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-inner)]"
            style={{
              color: it.danger ? "#ef4444" : "var(--text-2)",
              opacity: it.disabled ? 0.4 : 1,
              cursor: it.disabled ? "not-allowed" : "pointer",
            }}
          >
            {it.icon && <it.icon size={13} className="flex-shrink-0" />}
            <span className="flex-1 text-left whitespace-nowrap">{it.label}</span>
            {it.check && <Check size={12} style={{ color: "var(--brand-text)" }} />}
            {it.sub && <ChevronLeft size={12} style={{ transform: "rotate(180deg)", color: "var(--text-4)" }} />}
          </button>
        ),
      )}
    </>
  );
}

function ToolbarMenu({ icon: Icon, title, items, disabled }) {
  // The panel is PORTALED to <body>: the editor wrapper and the compose card
  // are both overflow-hidden, so an absolutely-positioned dropdown gets
  // cropped at their borders.
  const btnRef = useRef(null);
  const [pos, setPos] = useState(null);
  const open = !!pos;
  const toggle = () => {
    if (disabled) return;
    if (pos) { setPos(null); return; }
    const r = btnRef.current.getBoundingClientRect();
    setPos({ x: r.left, y: r.bottom + 4 });
  };
  useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === "Escape") setPos(null); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
        style={open
          ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
          : { background: "transparent", color: "var(--text-3)", opacity: disabled ? 0.3 : 1 }}
      >
        <Icon size={14} />
      </button>
      {open && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 120 }} onMouseDown={() => setPos(null)}>
          <div
            className="absolute min-w-[210px] max-h-[340px] overflow-y-auto rounded-xl py-1"
            style={{
              left: Math.min(pos.x, window.innerWidth - 240),
              top: Math.min(pos.y, window.innerHeight - 360),
              background: "var(--bg-card)",
              border: "1px solid var(--border-md)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
            }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <MenuList items={items} onAction={(it) => { setPos(null); it.run(); }} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function RichTextEditor({ onChange, placeholder = "", minHeight = 180, rich = false }) {
  const { t } = useLang();
  const ref = useRef(null);
  const savedRange = useRef(null);
  const mediaReg = useRef(new Map()); // id → { file, kind, name }
  const mediaSeq = useRef(0);
  const fileRef = useRef(null);
  const ctxCell = useRef(null);
  const [empty, setEmpty] = useState(true);
  const [states, setStates] = useState({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkExisting, setLinkExisting] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);
  const [mathSrc, setMathSrc] = useState("");
  const [mathBlock, setMathBlock] = useState(false);
  const [ctx, setCtx] = useState(null); // { x, y, page: "main" | "format" }

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
    const out = rich ? serializeRich(ref.current) : serializeTelegram(ref.current);
    // structure without text (a fresh table, a divider, …) is not "empty" —
    // the placeholder must not overlay it
    const hasStructure = !!ref.current.querySelector(
      "table,hr,details,ul,ol,input,[data-tg-media]");
    setEmpty(!out.text.trim() && !out.mediaIds.length && !hasStructure);
    const media = out.mediaIds
      .map(({ id, kind }) => {
        const m = mediaReg.current.get(id);
        return m ? { id, kind, file: m.file, name: m.name } : null;
      })
      .filter(Boolean);
    onChange?.({ html: out.html, text: out.text, media });
  };

  const refreshStates = () => {
    const sel = window.getSelection();
    if (!inEditor(sel?.anchorNode)) return;
    const li = ancestorTag("li");
    const list = li ? li.closest("ul,ol") : null;
    const listType = !list ? "none"
      : list.tagName === "OL" ? "ol"
      : li.firstElementChild?.matches?.('input[type="checkbox"]') ? "task" : "ul";
    setStates({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      underline: document.queryCommandState("underline"),
      strike: document.queryCommandState("strikeThrough"),
      sub: document.queryCommandState("subscript"),
      sup: document.queryCommandState("superscript"),
      code: !!ancestorTag("code"),
      spoiler: !!ancestorSpoiler(),
      mark: !!ancestorTag("mark"),
      quote: !!ancestorTag("blockquote"),
      aside: !!ancestorTag("aside"),
      pre: !!ancestorTag("pre"),
      link: !!ancestorTag("a"),
      h1: !!ancestorTag("h1"), h2: !!ancestorTag("h2"), h3: !!ancestorTag("h3"),
      h4: !!ancestorTag("h4"), h5: !!ancestorTag("h5"), h6: !!ancestorTag("h6"),
      listType,
      // Telegram table cells hold inline text only — block tools are disabled
      // inside them (matches the Rich HTML grammar and Telegram's composer)
      cell: !!ancestor((el) => el.tagName === "TD" || el.tagName === "TH"),
    });
  };

  useEffect(() => {
    // Prefer real tags (<b>, <i>, …) over style spans where the browser
    // honors it; styleFormats() in the serializer covers the cases it doesn't.
    try { document.execCommand("styleWithCSS", false, false); } catch { /* older engines */ }
    document.addEventListener("selectionchange", refreshStates);
    return () => document.removeEventListener("selectionchange", refreshStates);
  }, []);

  // Mode switch re-serializes the same DOM under the other dialect.
  useEffect(() => { emit(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rich]);

  const exec = (cmd, val = null) => {
    ref.current?.focus();
    // <th> is intrinsically bold (in the editor AND in Telegram's render), so
    // execCommand('bold') there only injects font-weight:normal spans that
    // look like the button is dead — treat header-cell bold as a no-op.
    if (cmd === "bold" && ancestor((el) => el.tagName === "TH")) return;
    document.execCommand(cmd, false, val);
    refreshStates(); emit();
  };

  const unwrap = (el) => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  };

  const INLINE_EL = {
    code: () => document.createElement("code"),
    spoiler: () => Object.assign(document.createElement("span"), { className: "tg-spoiler" }),
    mark: () => document.createElement("mark"),
  };
  const toggleInline = (kind) => {
    ref.current?.focus();
    const existing = kind === "spoiler" ? ancestorSpoiler() : ancestorTag(kind === "code" ? "code" : kind);
    if (existing) { unwrap(existing); refreshStates(); emit(); return; }
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed || !inEditor(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const el = INLINE_EL[kind]();
    try { range.surroundContents(el); }
    catch { el.appendChild(range.extractContents()); range.insertNode(el); }
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(el);
    sel.addRange(r);
    refreshStates(); emit();
  };

  const toggleBlock = (tag) => { // blockquote | pre | aside | h1…h6
    ref.current?.focus();
    const active = !!ancestorTag(tag);
    document.execCommand("formatBlock", false, active ? "<div>" : `<${tag}>`);
    refreshStates(); emit();
  };

  // ── Lists (Telegram list menu: None / Bullet / Numbered / Checklist) ──
  const stripCheckboxes = (list) => {
    list?.querySelectorAll(":scope > li > input[type=checkbox]").forEach((cb) => {
      if (cb.nextSibling?.nodeType === Node.TEXT_NODE && !cb.nextSibling.nodeValue.trim()) {
        cb.nextSibling.remove();
      }
      cb.remove();
    });
  };
  const addCheckboxes = (list) => {
    list?.querySelectorAll(":scope > li").forEach((li) => {
      if (li.firstElementChild?.matches?.('input[type="checkbox"]')) return;
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.contentEditable = "false";
      li.insertBefore(document.createTextNode(" "), li.firstChild);
      li.insertBefore(cb, li.firstChild);
    });
  };
  const currentList = () => ancestorTag("li")?.closest("ul,ol") || null;
  const setListType = (type) => {
    ref.current?.focus();
    const list = currentList();
    const cur = states.listType || "none";
    if (type === cur) return;
    if (type === "none") {
      if (!list) return;
      stripCheckboxes(list);
      document.execCommand(list.tagName === "UL" ? "insertUnorderedList" : "insertOrderedList");
    } else if (type === "ol") {
      if (list) stripCheckboxes(list);
      document.execCommand("insertOrderedList");
    } else { // ul | task
      if (cur === "none" || cur === "ol") document.execCommand("insertUnorderedList");
      const nl = currentList();
      if (type === "task") addCheckboxes(nl);
      else stripCheckboxes(nl);
    }
    refreshStates(); emit();
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount && inEditor(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange();
  };
  const restoreSelection = () => {
    ref.current?.focus();
    if (!savedRange.current) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.current);
  };

  const insertHtmlAtCursor = (fragment) => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel?.rangeCount || !inEditor(sel.anchorNode)) {
      // no caret in the editor — append at the end
      ref.current?.focus();
      const r = document.createRange();
      r.selectNodeContents(ref.current);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    document.execCommand("insertHTML", false, fragment);
    refreshStates(); emit();
  };

  const placeCaretIn = (el) => {
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  // ── Link ──
  const openLink = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !inEditor(sel.anchorNode)) return;
    savedRange.current = sel.getRangeAt(0).cloneRange();
    const a = ancestorTag("a");
    setLinkExisting(!!a);
    setLinkUrl(a ? a.getAttribute("href") || "" : "");
    setLinkOpen(true);
  };
  const applyLink = () => {
    let url = linkUrl.trim();
    if (!url) { setLinkOpen(false); return; }
    if (!/^(https?|tg):/i.test(url)) url = `https://${url}`;
    setLinkOpen(false);
    restoreSelection();
    const sel = window.getSelection();
    if (sel.isCollapsed && !linkExisting) {
      document.execCommand("insertHTML", false, `<a href="${escAttr(url)}">${escapeHtml(url)}</a>`);
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

  // ── Table (Telegram-style: instant default insert, edited via right-click) ──
  const insertTableDefault = () => {
    saveSelection();
    insertHtmlAtCursor(
      '<table bordered><tr><td><br></td><td><br></td></tr>' +
      '<tr><td><br></td><td><br></td></tr></table><div><br></div>'
    );
  };

  const tableOp = (fn) => {
    const cell = ctxCell.current;
    if (!cell || !ref.current.contains(cell)) return;
    ref.current?.focus();
    fn(cell);
    refreshStates(); emit();
  };
  const insertRow = (before) => tableOp((cell) => {
    const row = cell.parentNode;
    const nr = document.createElement("tr");
    for (let i = 0; i < row.cells.length; i++) {
      const c = document.createElement("td");
      c.appendChild(document.createElement("br"));
      nr.appendChild(c);
    }
    row.parentNode.insertBefore(nr, before ? row : row.nextSibling);
    placeCaretIn(nr.cells[0]);
  });
  const insertCol = (before) => tableOp((cell) => {
    const idx = cell.cellIndex;
    const table = cell.closest("table");
    for (const r of table.rows) {
      const refCell = r.cells[Math.min(idx, r.cells.length - 1)];
      const c = document.createElement(refCell?.tagName === "TH" ? "th" : "td");
      c.appendChild(document.createElement("br"));
      const at = r.cells[idx] || null;
      r.insertBefore(c, before ? at : (at ? at.nextSibling : null));
    }
  });
  const deleteRow = () => tableOp((cell) => {
    const row = cell.parentNode;
    const table = row.closest("table");
    row.remove();
    if (!table.rows.length) table.remove();
  });
  const deleteCol = () => tableOp((cell) => {
    const idx = cell.cellIndex;
    const table = cell.closest("table");
    for (const r of [...table.rows]) r.cells[idx]?.remove();
    if (![...table.rows].some((r) => r.cells.length)) table.remove();
  });
  // Telegram's "Highlight" = header-style cell → real <th> so the DM renders it
  const setCellHeader = (on) => tableOp((cell) => {
    if ((cell.tagName === "TH") === on) return;
    const repl = document.createElement(on ? "th" : "td");
    for (const a of cell.attributes) repl.setAttribute(a.name, a.value);
    while (cell.firstChild) repl.appendChild(cell.firstChild);
    cell.replaceWith(repl);
    ctxCell.current = repl;
    placeCaretIn(repl);
  });
  const setCellAlign = (dir) => tableOp((cell) => {
    cell.setAttribute("align", dir);
    cell.style.textAlign = dir;
  });

  // ── Formula ──
  const insertMath = () => {
    setMathOpen(false);
    const src = mathSrc.trim();
    if (!src) return;
    // table cells hold inline content only — a block formula there degrades
    const frag = mathBlock && !states.cell
      ? `<div class="tg-math-block" spellcheck="false">${escapeHtml(src)}</div><div><br></div>`
      : `<span class="tg-math" spellcheck="false">${escapeHtml(src)}</span>&nbsp;`;
    insertHtmlAtCursor(frag);
    setMathSrc("");
  };

  // ── Details ──
  const insertDetails = () => {
    insertHtmlAtCursor(
      `<details open><summary>${escapeHtml(t("rte.detailsTitle"))}</summary><div><br></div></details><div><br></div>`
    );
  };

  // ── Quote author (<cite>, the blue author line in Telegram quotes) ──
  const makeQuoteAuthor = () => {
    const q = ancestorTag("blockquote") || ancestorTag("aside");
    if (!q) return;
    ref.current?.focus();
    const sel = window.getSelection();
    let line = sel?.anchorNode;
    while (line && line !== q && line.parentNode !== q) line = line.parentNode;
    const cite = document.createElement("cite");
    if (line && line !== q) {
      if (line.nodeType === Node.ELEMENT_NODE) {
        while (line.firstChild) cite.appendChild(line.firstChild);
        line.replaceWith(cite);
      } else {
        cite.textContent = line.nodeValue || "";
        line.parentNode.replaceChild(cite, line);
      }
    } else {
      cite.appendChild(document.createElement("br"));
      q.appendChild(cite);
    }
    if (!cite.childNodes.length) cite.appendChild(document.createElement("br"));
    placeCaretIn(cite);
    refreshStates(); emit();
  };

  // ── Media embeds ──
  const openMedia = (accept) => {
    saveSelection();
    if (fileRef.current) {
      fileRef.current.accept = accept;
      fileRef.current.click();
    }
  };
  const pickMedia = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const mt = (f.type || "").toLowerCase();
    const kind = mt === "image/gif" ? "animation"
      : mt.startsWith("image/") ? "photo"
      : mt.startsWith("video/") ? "video"
      : mt.startsWith("audio/") ? "audio" : null;
    if (!kind) { alert(t("rte.mediaUnsupported")); return; }
    if (mediaReg.current.size >= MEDIA_LIMIT) { alert(t("rte.mediaLimit")); return; }
    const limit = kind === "photo" ? 10 * 1048576 : 50 * 1048576;
    if (f.size > limit) { alert(t("rte.mediaTooLarge")); return; }
    const id = `m${Date.now().toString(36)}${mediaSeq.current++}`;
    mediaReg.current.set(id, { file: f, kind, name: f.name });
    let frag;
    if (kind === "photo") {
      const url = URL.createObjectURL(f);
      // inline flow (no forced line break) so consecutive embeds stack into
      // one row — adjacent media serialize into a single <tg-collage>
      frag = `<img src="${escAttr(url)}" data-tg-media="${id}" data-kind="photo" class="tg-embed" contenteditable="false">&nbsp;`;
    } else {
      frag = `<span class="tg-media-chip" data-tg-media="${id}" data-kind="${kind}" contenteditable="false">${escapeHtml(`${kind} · ${f.name}`)}</span>&nbsp;`;
    }
    insertHtmlAtCursor(frag);
  };

  const clearFormatting = () => {
    ref.current?.focus();
    document.execCommand("removeFormat");
    document.execCommand("unlink");
    let el;
    while ((el = ancestorTag("code") || ancestorSpoiler() || ancestorTag("mark"))) unwrap(el);
    if (ancestorTag("blockquote") || ancestorTag("pre") || ancestorTag("aside") ||
        ancestor((elm) => /^H[1-6]$/.test(elm.tagName))) {
      document.execCommand("formatBlock", false, "<div>");
    }
    refreshStates(); emit();
  };

  // ── Paste (shared by the paste event and the context-menu item) ──
  const insertSanitizedHtml = (rawHtml) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = rawHtml;
    if (rich) {
      const { html } = serializeRich(tmp);
      document.execCommand("insertHTML", false, html);
    } else {
      const { html } = serializeTelegram(tmp);
      document.execCommand("insertHTML", false, html.replace(/\n/g, "<br>"));
    }
    emit();
  };
  const onPaste = (e) => {
    e.preventDefault();
    const richClip = e.clipboardData.getData("text/html");
    if (richClip) insertSanitizedHtml(richClip);
    else {
      document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      emit();
    }
  };
  const pasteFromClipboard = async () => {
    ref.current?.focus();
    try {
      if (navigator.clipboard?.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          if (it.types.includes("text/html")) {
            insertSanitizedHtml(await (await it.getType("text/html")).text());
            return;
          }
        }
      }
      const txt = await navigator.clipboard.readText();
      if (txt) { document.execCommand("insertText", false, txt); emit(); }
    } catch { /* clipboard permission denied — ⌘V still works */ }
  };

  const selectAll = () => {
    ref.current?.focus();
    const r = document.createRange();
    r.selectNodeContents(ref.current);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    refreshStates();
  };

  // ── Enter semantics (Telegram composer) ──
  // Enter on an empty line inside quote / pull quote / code / details exits
  // the block; Enter at the end of a heading starts a normal line; Enter in a
  // <summary> drops into the details body. Shift+Enter is always a soft <br>.
  const handleEnter = (e) => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !inEditor(sel.anchorNode)) return false;

    const exitAfter = (container, removeIfEmpty) => {
      e.preventDefault();
      const nd = document.createElement("div");
      nd.appendChild(document.createElement("br"));
      container.after(nd);
      if (removeIfEmpty && !container.textContent.trim() &&
          !container.querySelector("[data-tg-media],img,video,audio,input")) {
        container.remove();
      }
      placeCaretIn(nd);
      refreshStates(); emit();
      return true;
    };

    const atEndOf = (el) => {
      const r = sel.getRangeAt(0);
      if (!r.collapsed) return false;
      const end = document.createRange();
      end.selectNodeContents(el);
      end.collapse(false);
      return r.compareBoundaryPoints(Range.END_TO_END, end) === 0;
    };

    const h = ancestor((el) => /^H[1-6]$/.test(el.tagName));
    if (h) return atEndOf(h) ? exitAfter(h, false) : false;

    const summ = ancestorTag("summary");
    if (summ) {
      e.preventDefault();
      const details = summ.parentNode;
      let body = summ.nextElementSibling;
      if (!body) {
        body = document.createElement("div");
        body.appendChild(document.createElement("br"));
        details.appendChild(body);
      }
      placeCaretIn(body);
      return true;
    }

    // Enter at the end of a quote author line ends the quote (Telegram: the
    // cite is the quote's last line)
    const cite = ancestorTag("cite");
    if (cite) {
      const q = cite.closest("blockquote,aside");
      if (q && atEndOf(cite)) return exitAfter(q, false);
    }

    const container = ancestorTag("blockquote") || ancestorTag("aside") ||
      ancestorTag("pre") || ancestorTag("details");
    if (!container) return false;

    // the caret's line = the direct child of `container` the caret sits in
    let line = sel.anchorNode;
    while (line && line !== container && line.parentNode !== container) line = line.parentNode;
    if (line && line !== container && line.nodeType === Node.ELEMENT_NODE &&
        !line.textContent.trim() &&
        !line.querySelector("[data-tg-media],img,video,audio,input")) {
      line.remove();
      return exitAfter(container, container.tagName.toLowerCase() !== "details");
    }
    // <pre> keeps lines as raw text/<br> — exit when Enter follows a blank line
    if (container.tagName.toLowerCase() === "pre" && atEndOf(container) &&
        /\n\s*$/.test(container.innerText || container.textContent || "")) {
      const last = container.lastChild;
      if (last?.nodeType === Node.ELEMENT_NODE && last.tagName === "BR") last.remove();
      else if (last?.nodeType === Node.TEXT_NODE) last.nodeValue = last.nodeValue.replace(/\n\s*$/, "");
      return exitAfter(container, true);
    }
    return false;
  };

  // Tab / Shift+Tab walk table cells; Tab in the last cell appends a row —
  // the convention every table editor (Telegram's included) follows.
  const handleTab = (e) => {
    const cell = ancestor((el) => el.tagName === "TD" || el.tagName === "TH");
    if (!cell) return false;
    e.preventDefault();
    const table = cell.closest("table");
    const cells = [...table.querySelectorAll("th,td")];
    const idx = cells.indexOf(cell);
    let target = e.shiftKey ? cells[idx - 1] : cells[idx + 1];
    if (!target && !e.shiftKey) {
      const row = cell.parentNode;
      const nr = document.createElement("tr");
      for (let i = 0; i < row.cells.length; i++) {
        const td = document.createElement("td");
        td.appendChild(document.createElement("br"));
        nr.appendChild(td);
      }
      row.parentNode.appendChild(nr);
      target = nr.cells[0];
      emit();
    }
    if (target) placeCaretIn(target);
    refreshStates();
    return true;
  };

  const onKeyDown = (e) => {
    if (e.key === "Tab" && handleTab(e)) return;
    if (e.key === "Enter") {
      if (e.shiftKey) return; // native soft <br>
      // inside a table cell Enter is a soft break too — the caret must not
      // leave the cell (Telegram keeps you in the cell)
      if (ancestor((el) => el.tagName === "TD" || el.tagName === "TH")) {
        e.preventDefault();
        document.execCommand("insertLineBreak");
        emit();
        return;
      }
      if (handleEnter(e)) return;
      return; // native paragraph behaviour
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openLink();
    }
  };

  // ── Context menu (right click — mirrors Telegram's composer menu) ──
  const onContextMenu = (e) => {
    if (!inEditor(e.target)) return;
    e.preventDefault();
    ctxCell.current = e.target.closest?.("td,th");
    if (ctxCell.current && !ref.current.contains(ctxCell.current)) ctxCell.current = null;
    saveSelection();
    setCtx({ x: e.clientX, y: e.clientY, page: "main" });
  };
  useEffect(() => {
    if (!ctx) return;
    const esc = (e) => { if (e.key === "Escape") setCtx(null); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [ctx]);

  const fmtItems = (withBack) => [
    ...(withBack ? [{ key: "back", icon: ChevronLeft, label: t("rte.back"), run: () => setCtx((c) => ({ ...c, page: "main" })), keepOpen: true }] : []),
    { key: "bold", icon: Bold, label: t("rte.bold"), check: states.bold, run: () => exec("bold") },
    { key: "italic", icon: Italic, label: t("rte.italic"), check: states.italic, run: () => exec("italic") },
    { key: "underline", icon: Underline, label: t("rte.underline"), check: states.underline, run: () => exec("underline") },
    { key: "strike", icon: Strikethrough, label: t("rte.strike"), check: states.strike, run: () => exec("strikeThrough") },
    { key: "code", icon: Code, label: t("rte.code"), check: states.code, run: () => toggleInline("code") },
    { key: "spoiler", icon: EyeOff, label: t("rte.spoiler"), check: states.spoiler, run: () => toggleInline("spoiler") },
    ...(rich ? [
      { key: "mark", icon: Highlighter, label: t("rte.mark"), check: states.mark, run: () => toggleInline("mark") },
      { key: "sub", icon: Subscript, label: t("rte.sub"), check: states.sub, run: () => exec("subscript") },
      { key: "sup", icon: Superscript, label: t("rte.sup"), check: states.sup, run: () => exec("superscript") },
    ] : []),
    { divider: true },
    { key: "clear", icon: RemoveFormatting, label: t("rte.clear"), run: clearFormatting },
  ];

  const ctxItems = () => {
    if (ctx?.page === "format") return fmtItems(true);
    const inCell = !!ctxCell.current;
    const isTh = ctxCell.current?.tagName === "TH";
    const inQuote = states.quote || states.aside;
    return [
      { key: "paste", icon: Clipboard, label: t("rte.paste"), run: pasteFromClipboard },
      { key: "selectAll", icon: CheckSquare, label: t("rte.selectAll"), run: selectAll },
      { key: "format", icon: Type, label: t("rte.format"), sub: true, keepOpen: true, run: () => setCtx((c) => ({ ...c, page: "format" })) },
      ...(inQuote ? [
        { divider: true },
        { key: "cite", icon: Quote, label: t("rte.quoteAuthor"), run: makeQuoteAuthor },
      ] : []),
      ...(inCell ? [
        { divider: true },
        { key: "rowUp", icon: Plus, label: t("rte.insertAbove"), run: () => insertRow(true) },
        { key: "rowDn", icon: Plus, label: t("rte.insertBelow"), run: () => insertRow(false) },
        { key: "colL", icon: Plus, label: t("rte.insertLeft"), run: () => insertCol(true) },
        { key: "colR", icon: Plus, label: t("rte.insertRight"), run: () => insertCol(false) },
        { divider: true },
        isTh
          ? { key: "unhl", icon: Eraser, label: t("rte.removeHighlightCell"), run: () => setCellHeader(false) }
          : { key: "hl", icon: Highlighter, label: t("rte.highlightCell"), run: () => setCellHeader(true) },
        { key: "alL", icon: AlignLeft, label: t("rte.alignLeft"), run: () => setCellAlign("left") },
        { key: "alC", icon: AlignCenter, label: t("rte.alignCenter"), run: () => setCellAlign("center") },
        { key: "alR", icon: AlignRight, label: t("rte.alignRight"), run: () => setCellAlign("right") },
        { divider: true },
        { key: "delRow", icon: Trash2, label: t("rte.deleteRow"), danger: true, run: deleteRow },
        { key: "delCol", icon: Trash2, label: t("rte.deleteCol"), danger: true, run: deleteCol },
      ] : []),
    ];
  };

  // ── Toolbars ──
  const flatBtn = ({ key, icon: Icon, title, block, run }) => {
    const off = block && states.cell;
    return (
      <button
        key={key}
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={!!states[key]}
        aria-disabled={off || undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={off ? undefined : run}
        className="w-7 h-7 rounded-md flex items-center justify-center transition-colors"
        style={{
          ...(states[key] && !off
            ? { background: "var(--brand-bg)", color: "var(--brand-text)" }
            : { background: "transparent", color: "var(--text-3)" }),
          ...(off ? { opacity: 0.3, cursor: "not-allowed" } : {}),
        }}
      >
        <Icon size={14} />
      </button>
    );
  };
  const divider = (i) => <div key={`d${i}`} className="w-px h-4 mx-1" style={{ background: "var(--border-md)" }} />;

  const classicToolbar = [
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

  const anyHeading = states.h1 || states.h2 || states.h3 || states.h4 || states.h5 || states.h6;
  const headingIcons = [Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];
  // Telegram's "+" menu: Heading levels · Text · inline styles · Formula,
  // plus our extra blocks (divider / collapsible / pull quote) at the bottom.
  const plusMenuItems = [
    ...headingIcons.map((Icon, i) => ({
      key: `h${i + 1}`, icon: Icon, label: t(`rte.h${i + 1}`),
      check: states[`h${i + 1}`], disabled: states.cell,
      run: () => toggleBlock(`h${i + 1}`),
    })),
    {
      key: "text", icon: Type, label: t("rte.menuText"),
      check: !anyHeading && !states.quote && !states.aside && !states.pre,
      disabled: states.cell,
      run: () => { if (anyHeading || states.quote || states.aside || states.pre) { ref.current?.focus(); document.execCommand("formatBlock", false, "<div>"); refreshStates(); emit(); } },
    },
    { divider: true },
    { key: "bold", icon: Bold, label: t("rte.bold"), check: states.bold, run: () => exec("bold") },
    { key: "italic", icon: Italic, label: t("rte.italic"), check: states.italic, run: () => exec("italic") },
    { key: "underline", icon: Underline, label: t("rte.underline"), check: states.underline, run: () => exec("underline") },
    { key: "strike", icon: Strikethrough, label: t("rte.strike"), check: states.strike, run: () => exec("strikeThrough") },
    { key: "code", icon: Code, label: t("rte.code"), check: states.code, run: () => toggleInline("code") },
    { key: "spoiler", icon: EyeOff, label: t("rte.spoiler"), check: states.spoiler, run: () => toggleInline("spoiler") },
    { key: "math", icon: Sigma, label: t("rte.formula"), run: () => { saveSelection(); setMathOpen(true); } },
    { divider: true },
    { key: "mark", icon: Highlighter, label: t("rte.mark"), check: states.mark, run: () => toggleInline("mark") },
    { key: "sub", icon: Subscript, label: t("rte.sub"), check: states.sub, run: () => exec("subscript") },
    { key: "sup", icon: Superscript, label: t("rte.sup"), check: states.sup, run: () => exec("superscript") },
    { divider: true },
    { key: "hr", icon: SeparatorHorizontal, label: t("rte.divider"), disabled: states.cell, run: () => exec("insertHorizontalRule") },
    { key: "details", icon: ChevronsDownUp, label: t("rte.details"), disabled: states.cell, run: insertDetails },
    { key: "aside", icon: Quote, label: t("rte.pullQuote"), check: states.aside, disabled: states.cell, run: () => toggleBlock("aside") },
  ];

  const listMenuItems = [
    { key: "none", icon: Type, label: t("rte.listNone"), check: states.listType === "none", disabled: states.cell, run: () => setListType("none") },
    { key: "ul", icon: List, label: t("rte.bulletList"), check: states.listType === "ul", disabled: states.cell, run: () => setListType("ul") },
    { key: "ol", icon: ListOrdered, label: t("rte.orderedList"), check: states.listType === "ol", disabled: states.cell, run: () => setListType("ol") },
    { key: "task", icon: ListChecks, label: t("rte.taskList"), check: states.listType === "task", disabled: states.cell, run: () => setListType("task") },
    { divider: true },
    { key: "indent", icon: ChevronsRight, label: t("rte.indent"), disabled: states.cell || states.listType === "none", run: () => exec("indent") },
    { key: "outdent", icon: ChevronsLeft, label: t("rte.outdent"), disabled: states.cell || states.listType === "none", run: () => exec("outdent") },
  ];

  const attachMenuItems = [
    { key: "pv", icon: ImageIcon, label: t("rte.photoVideo"), disabled: states.cell, run: () => openMedia("image/*,video/*") },
    { key: "au", icon: Music, label: t("rte.audioFile"), disabled: states.cell, run: () => openMedia("audio/*") },
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
        {rich ? (
          <>
            <ToolbarMenu icon={Plus} title={t("rte.format")} items={plusMenuItems} />
            <ToolbarMenu icon={List} title={t("rte.bulletList")} items={listMenuItems} />
            {flatBtn({ key: "quote", icon: TextQuote, title: t("rte.quote"), block: true, run: () => toggleBlock("blockquote") })}
            {flatBtn({ key: "table", icon: TableIcon, title: t("rte.table"), block: true, run: insertTableDefault })}
            <ToolbarMenu icon={Paperclip} title={t("rte.media")} items={attachMenuItems} disabled={states.cell} />
            {divider(1)}
            {flatBtn({ key: "link", icon: Link2, title: t("rte.link"), run: openLink })}
            {flatBtn({ key: "clear", icon: RemoveFormatting, title: t("rte.clear"), run: clearFormatting })}
          </>
        ) : (
          classicToolbar.map((g, gi) => (
            <div key={gi} className="flex items-center gap-0.5">
              {gi > 0 && divider(gi)}
              {g.map(flatBtn)}
            </div>
          ))
        )}
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className={`tg-editor px-3 py-2.5 text-sm outline-none overflow-y-auto${rich ? " tg-editor-rich" : ""}`}
        style={{ minHeight, maxHeight: "45vh", color: "var(--text-1)" }}
        data-empty={empty ? "true" : "false"}
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        onKeyUp={refreshStates}
        onMouseUp={refreshStates}
        onClick={emit /* checkbox toggles don't fire onInput */}
        onContextMenu={onContextMenu}
      />

      <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={pickMedia} />

      {/* right-click context menu — Telegram-composer style */}
      {ctx && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 130 }} onMouseDown={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }}>
          <div
            className="absolute min-w-[220px] max-h-[340px] overflow-y-auto rounded-xl py-1"
            style={{
              left: Math.min(ctx.x, window.innerWidth - 240),
              top: Math.min(ctx.y, window.innerHeight - 360),
              background: "var(--bg-card)",
              border: "1px solid var(--border-md)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <MenuList
              items={ctxItems()}
              onAction={(it) => { if (it.keepOpen) it.run(); else { setCtx(null); it.run(); } }}
            />
          </div>
        </div>,
        document.body,
      )}

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

      <Modal
        open={mathOpen}
        onClose={() => setMathOpen(false)}
        title={t("rte.mathTitle")}
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMathOpen(false)}>{t("rte.linkCancel")}</Button>
            <Button onClick={insertMath}>{t("rte.mathInsert")}</Button>
          </>
        }
      >
        <SegmentedToggle
          size="sm"
          fill
          value={mathBlock ? "block" : "inline"}
          onChange={(v) => setMathBlock(v === "block")}
          options={[["inline", t("rte.mathInline")], ["block", t("rte.mathBlock")]]}
        />
        <FormField label="LaTeX" required>
          <input
            autoFocus
            value={mathSrc}
            onChange={(e) => setMathSrc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") insertMath(); }}
            placeholder="E = mc^2"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
          />
        </FormField>
      </Modal>
    </div>
  );
}
