import { Fragment } from "react";
import { useNavigate } from "react-router-dom";

/**
 * The assistant's answers, rendered from the small Markdown subset it is told
 * to write: paragraphs, **bold**, *italic*, `code`, lists, tables, headings,
 * fenced code and links. Built as React nodes — never `innerHTML` — so nothing
 * the model writes can become markup. A link to an app route navigates inside
 * the app; an https link opens a new tab; anything else is plain text.
 */
export default function Markdown({ text, onNavigate }) {
  const blocks = parseBlocks(text || "");
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words" style={{ color: "var(--text-1)" }}>
      {blocks.map((b, i) => <Block key={i} b={b} onNavigate={onNavigate} />)}
    </div>
  );
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
  if (b.type === "ul" || b.type === "ol") {
    const Tag = b.type;
    return (
      <Tag className={`${b.type === "ul" ? "list-disc" : "list-decimal"} pl-5 space-y-1`}>
        {b.items.map((it, i) => <li key={i}><Inline text={it} onNavigate={onNavigate} /></li>)}
      </Tag>
    );
  }
  if (b.type === "table") {
    return (
      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr style={{ background: "var(--bg-inner)" }}>
              {b.head.map((h, i) => (
                <th key={i} className={`px-2.5 py-1.5 font-semibold whitespace-nowrap ${b.align[i] === "right" ? "text-right" : "text-left"}`}
                  style={{ color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
                  <Inline text={h} onNavigate={onNavigate} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => (
              <tr key={ri} style={{ borderTop: ri ? "1px solid var(--border)" : undefined }}>
                {b.head.map((_, ci) => (
                  <td key={ci} className={`px-2.5 py-1.5 align-top tabular-nums ${b.align[ci] === "right" || isNumeric(r[ci]) ? "text-right" : "text-left"}`}>
                    <Inline text={r[ci] ?? ""} onNavigate={onNavigate} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p><Inline text={b.text} onNavigate={onNavigate} /></p>;
}

const isNumeric = (s) => /^\s*[-+]?[\d\s.,]+%?\s*$/.test(s || "") && /\d/.test(s || "");

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
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (/-+:\s*$/.test(c) ? "right" : "left"));
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      out.push({ type: "table", head, align, rows });
      continue;
    }
    if (/^\s*([-*•])\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*([-*•])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, "")); i += 1;
      }
      out.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i += 1;
      }
      out.push({ type: "ol", items });
      continue;
    }
    if (!line.trim()) { flush(); i += 1; continue; }
    para.push(line);
    i += 1;
  }
  flush();
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
                onClick={(e) => { e.preventDefault(); navigate(href); onNavigate?.(); }}>
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
