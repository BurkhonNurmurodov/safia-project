import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import CopyButton from "./CopyButton";
import useAT from "./useAT";

/**
 * The assistant's answers, rendered from the small Markdown subset its prompt
 * allows (services/assistant.py «HOW AN ANSWER LOOKS»): paragraphs, **bold**,
 * *italic*, `code`, lists (nested by indentation), tables, a "> " summary box
 * and a "> [!WARNING]" caveat box, headings, a rule, fenced code and links.
 * Built as React nodes — never `innerHTML` — so nothing the model writes can
 * become markup. A link to an app route navigates inside the app; an https
 * link opens a new tab; anything else is plain text.
 */
export default function Markdown({ text, onNavigate }) {
  const blocks = parseBlocks(text || "");
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words" style={{ color: "var(--text-1)" }}>
      <Blocks blocks={blocks} onNavigate={onNavigate} />
    </div>
  );
}

function Blocks({ blocks, onNavigate }) {
  return blocks.map((b, i) => <Block key={i} b={b} onNavigate={onNavigate} />);
}

function Block({ b, onNavigate }) {
  if (b.type === "h") {
    const size = b.level <= 2 ? "text-[15px]" : "text-sm";
    return <p className={`${size} font-semibold pt-1`}><Inline text={b.text} onNavigate={onNavigate} /></p>;
  }
  if (b.type === "code") {
    return (
      <pre className="text-xs rounded-lg px-3 py-2 overflow-x-auto"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
        {b.text}
      </pre>
    );
  }
  if (b.type === "ul" || b.type === "ol") return <ListBlock b={b} onNavigate={onNavigate} depth={0} />;
  if (b.type === "table") return <TableBlock b={b} onNavigate={onNavigate} />;
  if (b.type === "quote") return <Callout b={b} onNavigate={onNavigate} />;
  if (b.type === "hr") return <hr className="my-1" style={{ border: 0, borderTop: "1px solid var(--border-md, var(--border))" }} />;
  return <p><Inline text={b.text} onNavigate={onNavigate} /></p>;
}

/** A list, and the lists nested under its items. An ordered list keeps the
 *  number it started at, so steps split by a blank line never restart at 1. */
function ListBlock({ b, onNavigate, depth }) {
  const Tag = b.type;
  const kind = b.type === "ol" ? "list-decimal" : depth ? "list-[circle]" : "list-disc";
  return (
    <Tag start={b.type === "ol" && b.start > 1 ? b.start : undefined}
      className={`${kind} pl-5 space-y-1 marker:text-[var(--text-3)] ${depth ? "mt-1" : ""}`}>
      {b.items.map((it, i) => (
        <li key={i} className="pl-0.5">
          <Inline text={it.text} onNavigate={onNavigate} />
          {it.blocks.length > 0 && (
            <div className="mt-1.5 space-y-2"><Blocks blocks={it.blocks} onNavigate={onNavigate} /></div>
          )}
          {it.children.map((c, j) => <ListBlock key={j} b={c} onNavigate={onNavigate} depth={depth + 1} />)}
        </li>
      ))}
    </Tag>
  );
}

/** "> …" — the summary box an answer opens with («Qisqasi: …»), or, when its
 *  first line is "[!WARNING]", a caveat that changes how a figure is read. */
function Callout({ b, onNavigate }) {
  const t = useAT();
  const warn = b.tone === "warn";
  return (
    <div className="rounded-lg px-3 py-2 space-y-1.5"
      style={{
        background: warn ? "rgba(234,179,8,0.10)" : "rgba(var(--brand-rgb),0.08)",
        borderLeft: `3px solid ${warn ? "var(--status-warn)" : "var(--brand)"}`,
      }}>
      {warn && (
        <p className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--status-warn)" }}>
          <AlertTriangle size={13} aria-hidden="true" />
          <span>{t("assistant.md.caution")}</span>
        </p>
      )}
      <Blocks blocks={b.blocks} onNavigate={onNavigate} />
    </div>
  );
}

// More rows than this fold behind «show the rest»; a total row stays in view.
const TABLE_ROWS = 10;

/** A table, with a footer that copies it tab-separated — what Excel and
 *  Google Sheets paste into cells, and what reads as columns in a chat. A
 *  column of figures is right-aligned and never wraps; a long table folds to
 *  its first rows (the copy always takes every row); a closing «Jami» row is
 *  set apart and stays in view. */
function TableBlock({ b, onNavigate }) {
  const t = useAT();
  const [all, setAll] = useState(false);
  // A column of figures right-aligns and never wraps; an explicit `---:` or
  // `:---:` on a text column only aligns it.
  const figs = b.head.map((_, ci) => numericColumn(b.rows, ci));
  const side = b.head.map((_, ci) => (figs[ci] || b.align[ci] === "right" ? "text-right" : b.align[ci] === "center" ? "text-center" : "text-left"));
  const last = b.rows[b.rows.length - 1];
  const total = b.rows.length > 1 && isTotalRow(last) ? last : null;
  const body = total ? b.rows.slice(0, -1) : b.rows;
  const folds = body.length > TABLE_ROWS + 2;
  const shown = folds && !all ? body.slice(0, TABLE_ROWS) : body;
  const hidden = body.length - shown.length;
  const cell = (r, ci, extra = "") => (
    <td key={ci}
      className={`px-2 py-1.5 align-top ${side[ci]} ${figs[ci] ? "tabular-nums whitespace-nowrap" : ""} ${extra}`}>
      <Inline text={r[ci] ?? ""} onNavigate={onNavigate} />
    </td>
  );
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ background: "var(--bg-inner)" }}>
              {b.head.map((h, i) => (
                <th key={i} className={`px-2 py-1.5 font-semibold whitespace-nowrap ${side[i]}`}
                  style={{ color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
                  <Inline text={h} onNavigate={onNavigate} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => (
              <tr key={ri} style={{ borderTop: ri ? "1px solid var(--border)" : undefined }}>
                {b.head.map((_, ci) => cell(r, ci))}
              </tr>
            ))}
            {total && (
              <tr style={{ borderTop: "1px solid var(--border-md, var(--border))", background: "var(--bg-inner)" }}>
                {b.head.map((_, ci) => cell(total, ci, "font-semibold"))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-1" style={{ borderTop: "1px solid var(--border)" }}>
        {folds ? (
          <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all}
            className="inline-flex items-center gap-1 h-8 max-sm:h-10 px-1.5 rounded-lg text-xs font-medium whitespace-nowrap hover:bg-[var(--bg-inner)]"
            style={{ color: "var(--brand-text)" }}>
            {all ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            {all ? t("assistant.md.fewer") : t("assistant.md.more", { n: hidden })}
          </button>
        ) : <span />}
        <CopyButton getText={() => tableTsv(b)} label={t("assistant.copyTable")} showLabel />
      </div>
    </div>
  );
}

/** An answer as plain text, for the copy button: no Markdown marks, links as
 *  their words, lists as «•» / «1.» lines (sub-items indented), boxes as
 *  their text, tables tab-separated. */
export function toPlainText(src, { caution = "" } = {}) {
  return plainBlocks(parseBlocks(src || ""), caution);
}

function plainBlocks(blocks, caution) {
  return blocks.map((b) => {
    if (b.type === "code") return b.text;
    if (b.type === "ul" || b.type === "ol") return plainList(b, 0, caution);
    if (b.type === "table") return tableTsv(b);
    if (b.type === "quote") {
      const body = plainBlocks(b.blocks, caution);
      return b.tone === "warn" && caution ? `${caution}: ${body}` : body;
    }
    if (b.type === "hr") return "";
    return plainInline(b.text);
  }).filter(Boolean).join("\n\n");
}

function plainList(b, depth, caution) {
  const pad = "  ".repeat(depth);
  return b.items.map((it, i) => {
    const mark = b.type === "ol" ? `${(b.start || 1) + i}.` : "•";
    const line = `${pad}${mark} ${plainInline(it.text).replace(/\n/g, `\n${pad}  `)}`;
    const own = it.blocks.length ? `${pad}  ${plainBlocks(it.blocks, caution).replace(/\n/g, `\n${pad}  `)}` : null;
    const kids = it.children.map((c) => plainList(c, depth + 1, caution));
    return [line, own, ...kids].filter(Boolean).join("\n");
  }).join("\n");
}

function tableTsv(b) {
  const row = (cs) => b.head.map((_, i) => plainInline(cs[i] ?? "").replace(/[\t\n]+/g, " ")).join("\t");
  return [row(b.head), ...b.rows.map(row)].join("\n");
}

// The twin of `Inline` below, producing text instead of nodes.
function plainInline(text) {
  return String(text).split(TOKEN).map((part) => {
    if (!part) return "";
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return part.slice(2, -2);
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return part.slice(1, -1);
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) return link[1];
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return part.slice(1, -1);
    return part;
  }).join("");
}

// A figure: «87%», «12 450», «-3,5», «+9», «45 daq», «45 дақ», «1 soat 20 daq»,
// «3/5», «1,2 mln so'm», «87%*» (a partial figure) — a number first, a short
// unit or two after it, at most twice. A date («18.10»,
// «01.10–07.10») is a label, not a figure. Marks (**bold**) are ignored.
const AMOUNT = "[-+−]?\\d[\\d\\s.,]*(?:\\s*/\\s*\\d[\\d\\s.,]*)?(?:\\s*%|(?:\\s*[a-zа-яёқғҳўʻʼ'.]{1,6}){1,2})?\\*?";
const FIGURE = new RegExp(`^${AMOUNT}(?:\\s+${AMOUNT})?$`, "i");
const DATE = /^\d{1,2}\.\d{1,2}(\.\d{2,4})?(\s*[–-]\s*\d{1,2}\.\d{1,2}(\.\d{2,4})?)?$/;
const EMPTY = /^(—|–|-|·)?$/;
const bare = (s) => plainInline(String(s ?? "")).trim();

/** A column of figures: every filled cell a figure (a «—» fills nothing), at
 *  least one of them. The first column names the rows — a cell code there is
 *  a name — so it is only right-aligned when the table asks (`---:`). */
function numericColumn(rows, ci) {
  if (ci === 0) return false;
  let seen = 0;
  for (const r of rows) {
    const v = bare(r[ci]);
    if (EMPTY.test(v)) continue;
    if (DATE.test(v) || !FIGURE.test(v)) return false;
    seen += 1;
  }
  return seen > 0;
}

// A lookahead, not \b: without the u flag \b never sees a Cyrillic word end.
const TOTAL_WORDS = /^(jami|umumiy|barchasi|hammasi|жами|умумий|барчаси|ҳаммаси|итого|всего|total|overall)(?=$|[\s:.(–—-])/i;
const isTotalRow = (r) => !!r && TOTAL_WORDS.test(bare(r[0]).replace(/[:.]$/, ""));

const LIST_RE = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const indentOf = (s) => s.replace(/\t/g, "    ").match(/^ */)[0].length;
const dedent = (s, n) => s.replace(/\t/g, "    ").replace(new RegExp(`^ {0,${n}}`), "");

/** Does the line at `i` open a block of its own — a fence, a box, a heading,
 *  or a table (a pipe row with a separator row under it)? */
function opensBlock(lines, i) {
  const t = lines[i].trim();
  if (/^```/.test(t) || /^>/.test(t) || /^#{1,4}\s/.test(t)) return true;
  return /^\|.*\|$/.test(t) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1]);
}

function parseBlocks(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  let para = [];
  const flush = () => {
    if (para.length) out.push({ type: "p", text: para.join("\n") });
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      flush();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { buf.push(lines[i]); i += 1; }
      out.push({ type: "code", text: buf.join("\n") });
      i += 1;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); out.push({ type: "h", level: h[1].length, text: h[2] }); i += 1; continue; }
    if (/^\s*>/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i += 1; }
      let tone = "note";
      const mark = (buf[0] || "").match(/^\s*\[!(\w+)\]\s*(.*)$/);
      if (mark) {
        tone = /^(warning|caution|danger)$/i.test(mark[1]) ? "warn" : "note";
        if (mark[2]) buf[0] = mark[2]; else buf.shift();
      }
      out.push({ type: "quote", tone, blocks: parseBlocks(buf.join("\n")) });
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push({ type: "hr" }); i += 1; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (/^\s*:-+:\s*$/.test(c) ? "center" : /-+:\s*$/.test(c) ? "right" : "left"));
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      out.push({ type: "table", head, align, rows });
      continue;
    }
    if (LIST_RE.test(line)) {
      flush();
      const entries = [];
      let gap = false;
      while (i < lines.length) {
        const ln = lines[i];
        const m = ln.match(LIST_RE);
        if (m) {
          entries.push({ indent: indentOf(m[1]), ordered: /\d/.test(m[2]), num: parseInt(m[2], 10) || 1, text: m[3], blocks: [] });
          gap = false;
          i += 1;
          continue;
        }
        const last = entries[entries.length - 1];
        if (!ln.trim()) {
          // A blank line keeps the list going when an item («loose» lists) or
          // an indented paragraph under the last item comes next.
          let j = i + 1;
          while (j < lines.length && !lines[j].trim()) j += 1;
          if (j < lines.length && (LIST_RE.test(lines[j]) || indentOf(lines[j]) >= 2)) { i = j; gap = true; continue; }
          break;
        }
        if (indentOf(ln) < 2) break;
        if (opensBlock(lines, i)) {
          // A table, box, fence or heading indented under an item is that
          // item's own block, parsed like any other.
          const base = indentOf(ln);
          const buf = [];
          let fence = false;
          while (i < lines.length) {
            const l = lines[i];
            if (!fence && !l.trim()) {
              let j = i + 1;
              while (j < lines.length && !lines[j].trim()) j += 1;
              if (j < lines.length && indentOf(lines[j]) >= 2 && !LIST_RE.test(lines[j])) { buf.push(""); i += 1; continue; }
              break;
            }
            if (!fence && (indentOf(l) < 2 || LIST_RE.test(l))) break;
            if (/^\s*```/.test(l)) fence = !fence;
            buf.push(dedent(l, base));
            i += 1;
          }
          last.blocks.push(...parseBlocks(buf.join("\n")));
          gap = false;
          continue;
        }
        // Any other indented line continues the last item: its text, or a
        // paragraph after the item's blocks so the reading order holds.
        if (last.blocks.length) last.blocks.push({ type: "p", text: ln.trim() });
        else last.text += `${gap ? "\n\n" : "\n"}${ln.trim()}`;
        gap = false;
        i += 1;
      }
      out.push(...nestLists(entries));
      continue;
    }
    if (!line.trim()) { flush(); i += 1; continue; }
    para.push(line);
    i += 1;
  }
  flush();
  return out;
}

/** Flat list lines → lists of items whose deeper-indented lines are lists of
 *  their own. A change between bullets and numbers at one level starts a new
 *  list. */
function nestLists(entries) {
  const out = [];
  let k = 0;
  while (k < entries.length) {
    const base = entries[k].indent;
    const ordered = entries[k].ordered;
    const list = { type: ordered ? "ol" : "ul", start: ordered ? entries[k].num : 1, items: [] };
    while (k < entries.length && entries[k].indent < base + 2 && entries[k].ordered === ordered) {
      const item = { text: entries[k].text, blocks: entries[k].blocks, children: [] };
      k += 1;
      const kids = [];
      while (k < entries.length && entries[k].indent >= base + 2) { kids.push(entries[k]); k += 1; }
      if (kids.length) item.children = nestLists(kids);
      list.items.push(item);
    }
    out.push(list);
  }
  return out;
}

function cells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

// No `_italic_`: snake_case words (field names, codes) would turn italic, and
// the lookbehind that could tell them apart is a syntax error on older iOS.
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/g;

function Inline({ text, onNavigate }) {
  const navigate = useNavigate();
  const lines = String(text).split("\n");
  return lines.map((ln, li) => (
    <Fragment key={li}>
      {li > 0 && <br />}
      {ln.split(TOKEN).map((part, i) => {
        if (!part) return null;
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
          return <code key={i} className="text-[0.92em] px-1 rounded" style={{ background: "var(--bg-inner)" }}>{part.slice(1, -1)}</code>;
        const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
        if (link) {
          const [, label, href] = link;
          if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/")) {
            return (
              <a key={i} href={href} className="underline underline-offset-2" style={{ color: "var(--brand-text)" }}
                onClick={(e) => { e.preventDefault(); if (onNavigate) onNavigate(href); else navigate(href); }}>
                {label}
              </a>
            );
          }
          if (/^https:\/\//.test(href)) {
            return <a key={i} href={href} target="_blank" rel="noopener noreferrer"
              className="underline underline-offset-2" style={{ color: "var(--brand-text)" }}>{label}</a>;
          }
          return <Fragment key={i}>{label}</Fragment>;
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
          return <em key={i}>{part.slice(1, -1)}</em>;
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </Fragment>
  ));
}
