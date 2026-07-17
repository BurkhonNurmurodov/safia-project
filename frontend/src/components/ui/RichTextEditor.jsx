import { useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough, EyeOff, Code, SquareCode,
  TextQuote, Link2, RemoveFormatting, Heading1, Heading2, Heading3,
  Heading4, Heading5, Heading6,
  List, ListOrdered, ListChecks, SeparatorHorizontal, Table as TableIcon,
  ChevronsDownUp, Sigma, ImagePlus, Quote, Highlighter, Subscript, Superscript,
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
 *                  block / blockquote / links). Serializes to parse_mode HTML
 *                  with real \n newlines.
 *   rich={true}  – the Bot API 10.1+ Rich HTML dialect: adds headings, lists,
 *                  task lists, tables, dividers, collapsible details, pull
 *                  quotes, mark / sub / sup, LaTeX formulas and inline
 *                  photo/video/audio embeds. Serializes to Rich HTML where
 *                  paragraphs are <p> blocks (Rich HTML collapses raw
 *                  newlines) and embedded media becomes tg://…?id= links.
 *
 * Props:
 *   onChange    – ({ html, text, media }) on every edit. `media` lists the
 *                 embedded files actually present in the message:
 *                 [{ id, kind, file, name }] (always [] in classic mode).
 *   placeholder – muted hint shown while empty
 *   minHeight   – content area min height in px (default 180)
 *   rich        – enable the Rich HTML dialect (content survives toggling;
 *                 rich-only structure is flattened when serialized classic)
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
const INLINE_RICH_EXTRA = { mark: "mark", sub: "sub", sup: "sup" };

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
    if (!mediaIds.some((m) => m.id === id)) mediaIds.push({ id, kind });
    return mediaRefTag(id, kind);
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
    const out = pendingMedia.join("");
    pendingMedia = [];
    return out;
  };

  const nonEmptyLine = (s) => s.replace(/<br\/>/g, "").replace(/&nbsp;/g, " ").trim() !== "";

  // children of a block container → sequence of <p> lines + block elements
  const blocks = (node) => {
    let out = "", line = "";
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
        out += seenMedia(c);
        return;
      }
      if (isEl && (BLOCK_TAGS.has(tag) || c.classList.contains("tg-math-block"))) {
        flushLine();
        out += blockNode(c);
      } else {
        line += inline(c, new Set());
      }
    });
    flushLine();
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
        let summary = "", rest = "";
        node.childNodes.forEach((c) => {
          if (c.nodeType === Node.ELEMENT_NODE && c.tagName.toLowerCase() === "summary") {
            summary = inlineChildren(c, new Set());
            textParts.push("\n");
          }
        });
        const clone = { childNodes: [...node.childNodes].filter((c) =>
          !(c.nodeType === Node.ELEMENT_NODE && c.tagName.toLowerCase() === "summary")) };
        rest = blocks(clone);
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

// ── Component ────────────────────────────────────────────────────────────────

export default function RichTextEditor({ onChange, placeholder = "", minHeight = 180, rich = false }) {
  const { t } = useLang();
  const ref = useRef(null);
  const savedRange = useRef(null);
  const mediaReg = useRef(new Map()); // id → { file, kind, name }
  const mediaSeq = useRef(0);
  const fileRef = useRef(null);
  const [empty, setEmpty] = useState(true);
  const [states, setStates] = useState({});
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkExisting, setLinkExisting] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableCfg, setTableCfg] = useState({ rows: 3, cols: 3, header: true, bordered: true, striped: false });
  const [mathOpen, setMathOpen] = useState(false);
  const [mathSrc, setMathSrc] = useState("");
  const [mathBlock, setMathBlock] = useState(false);

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
    setEmpty(!out.text.trim() && !out.mediaIds.length);
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
      h1: !!ancestorTag("h1"),
      h2: !!ancestorTag("h2"),
      h3: !!ancestorTag("h3"),
      h4: !!ancestorTag("h4"),
      h5: !!ancestorTag("h5"),
      h6: !!ancestorTag("h6"),
      ul: !!ancestorTag("ul") && !ancestor((el) => el.tagName === "OL"),
      ol: !!ancestorTag("ol"),
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

  const toggleBlock = (tag) => { // blockquote | pre | aside | h1 | h2 | h3
    ref.current?.focus();
    const active = !!ancestorTag(tag);
    document.execCommand("formatBlock", false, active ? "<div>" : `<${tag}>`);
    refreshStates(); emit();
  };

  const toggleTask = () => {
    ref.current?.focus();
    if (!ancestorTag("li")) document.execCommand("insertUnorderedList");
    const li = ancestorTag("li");
    if (!li) return;
    const first = li.firstElementChild;
    if (first && first.tagName === "INPUT" && first.type === "checkbox") {
      first.remove();
    } else {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.contentEditable = "false";
      li.insertBefore(document.createTextNode(" "), li.firstChild);
      li.insertBefore(cb, li.firstChild);
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

  // ── Table ──
  const insertTable = () => {
    setTableOpen(false);
    const { rows, cols, header, bordered, striped } = tableCfg;
    const r = Math.min(Math.max(1, rows | 0), 30);
    const c = Math.min(Math.max(1, cols | 0), 20);
    let out = `<table${bordered ? " bordered" : ""}${striped ? " striped" : ""}>`;
    if (header) out += `<tr>${'<th><br></th>'.repeat(c)}</tr>`;
    out += `<tr>${'<td><br></td>'.repeat(c)}</tr>`.repeat(r);
    out += "</table><div><br></div>";
    insertHtmlAtCursor(out);
  };

  // ── Formula ──
  const insertMath = () => {
    setMathOpen(false);
    const src = mathSrc.trim();
    if (!src) return;
    const frag = mathBlock
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

  // ── Media embeds ──
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
      frag = `<img src="${escAttr(url)}" data-tg-media="${id}" data-kind="photo" class="tg-embed" contenteditable="false"><div><br></div>`;
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
        ancestorTag("h1") || ancestorTag("h2") || ancestorTag("h3")) {
      document.execCommand("formatBlock", false, "<div>");
    }
    refreshStates(); emit();
  };

  const onPaste = (e) => {
    e.preventDefault();
    const richClip = e.clipboardData.getData("text/html");
    if (richClip) {
      const tmp = document.createElement("div");
      tmp.innerHTML = richClip;
      if (rich) {
        const { html } = serializeRich(tmp);
        document.execCommand("insertHTML", false, html);
      } else {
        const { html } = serializeTelegram(tmp);
        document.execCommand("insertHTML", false, html.replace(/\n/g, "<br>"));
      }
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

  const base = [
    [
      { key: "bold", icon: Bold, title: t("rte.bold"), run: () => exec("bold") },
      { key: "italic", icon: Italic, title: t("rte.italic"), run: () => exec("italic") },
      { key: "underline", icon: Underline, title: t("rte.underline"), run: () => exec("underline") },
      { key: "strike", icon: Strikethrough, title: t("rte.strike"), run: () => exec("strikeThrough") },
    ],
    [
      { key: "spoiler", icon: EyeOff, title: t("rte.spoiler"), run: () => toggleInline("spoiler") },
      { key: "code", icon: Code, title: t("rte.code"), run: () => toggleInline("code") },
      ...(rich ? [
        { key: "mark", icon: Highlighter, title: t("rte.mark"), run: () => toggleInline("mark") },
        { key: "sub", icon: Subscript, title: t("rte.sub"), run: () => exec("subscript") },
        { key: "sup", icon: Superscript, title: t("rte.sup"), run: () => exec("superscript") },
      ] : []),
    ],
    [
      { key: "quote", icon: TextQuote, title: t("rte.quote"), run: () => toggleBlock("blockquote") },
      ...(rich ? [{ key: "aside", icon: Quote, title: t("rte.pullQuote"), run: () => toggleBlock("aside") }] : []),
      { key: "pre", icon: SquareCode, title: t("rte.codeBlock"), run: () => toggleBlock("pre") },
    ],
  ];
  const richOnly = [
    [
      { key: "h1", icon: Heading1, title: t("rte.h1"), run: () => toggleBlock("h1") },
      { key: "h2", icon: Heading2, title: t("rte.h2"), run: () => toggleBlock("h2") },
      { key: "h3", icon: Heading3, title: t("rte.h3"), run: () => toggleBlock("h3") },
    ],
    [
      { key: "ul", icon: List, title: t("rte.bulletList"), run: () => exec("insertUnorderedList") },
      { key: "ol", icon: ListOrdered, title: t("rte.orderedList"), run: () => exec("insertOrderedList") },
      { key: "task", icon: ListChecks, title: t("rte.taskList"), run: toggleTask },
    ],
    [
      { key: "divider", icon: SeparatorHorizontal, title: t("rte.divider"), run: () => exec("insertHorizontalRule") },
      { key: "table", icon: TableIcon, title: t("rte.table"), run: () => { saveSelection(); setTableOpen(true); } },
      { key: "details", icon: ChevronsDownUp, title: t("rte.details"), run: insertDetails },
      { key: "math", icon: Sigma, title: t("rte.formula"), run: () => { saveSelection(); setMathOpen(true); } },
      { key: "media", icon: ImagePlus, title: t("rte.media"), run: () => { saveSelection(); fileRef.current?.click(); } },
    ],
  ];
  const tail = [
    [
      { key: "link", icon: Link2, title: t("rte.link"), run: openLink },
      { key: "clear", icon: RemoveFormatting, title: t("rte.clear"), run: clearFormatting },
    ],
  ];
  const groups = [...base, ...(rich ? richOnly : []), ...tail];

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
      />

      <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" className="hidden" onChange={pickMedia} />

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
        open={tableOpen}
        onClose={() => setTableOpen(false)}
        title={t("rte.tableTitle")}
        maxWidth="max-w-sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTableOpen(false)}>{t("rte.linkCancel")}</Button>
            <Button onClick={insertTable}>{t("rte.tableInsert")}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("rte.tableRows")}>
            <input
              type="number" min="1" max="30" value={tableCfg.rows}
              onChange={(e) => setTableCfg((c) => ({ ...c, rows: +e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </FormField>
          <FormField label={t("rte.tableCols")}>
            <input
              type="number" min="1" max="20" value={tableCfg.cols}
              onChange={(e) => setTableCfg((c) => ({ ...c, cols: +e.target.value }))}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </FormField>
        </div>
        <div className="space-y-1.5 pt-1">
          {[["header", t("rte.tableHeader")], ["bordered", t("rte.tableBordered")], ["striped", t("rte.tableStriped")]].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: "var(--text-2)" }}>
              <input
                type="checkbox"
                checked={tableCfg[k]}
                onChange={(e) => setTableCfg((c) => ({ ...c, [k]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
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
