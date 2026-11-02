// «Notion vazifalari» — the page's and the admin tab's small helpers
// (backend services/notion_tracker.py). Nothing here measures anything.
import { useLang } from "../../context/LangContext";
import { inTelegram } from "../../utils/session";
import { TXT } from "../../pages/notionTasksText";

export { fill } from "../../pages/notionTasksText";

/** The words in the reader's language. */
export function useNT() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}

export const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
export const ddmmyy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

/** «02.11 14:05» from an ISO instant, in the reader's clock. */
export function stamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A Notion link opens in the real browser inside Telegram, where
 *  target=_blank is swallowed; elsewhere the plain <a> is right. */
export function openExt(e, url) {
  const tg = window?.Telegram?.WebApp;
  if (!url || !inTelegram() || !tg?.openLink) return;
  e.preventDefault();
  try { tg.openLink(url); } catch { window.open(url, "_blank", "noopener"); }
}

/** The structured `detail` of a failed request (api.js keeps it as detail_raw). */
export function detailOf(e) {
  const d = e?.response?.data;
  return d?.detail_raw ?? d?.detail ?? null;
}

/** Where a task stands against today: the page's sections, in reading order. */
export function sectionOf(t) {
  if (t.done) return "done";
  if (t.left == null) return "nodue";
  if (t.left < 0) return "overdue";
  if (t.left === 0) return "today";
  if (t.left === 1) return "tomorrow";
  if (t.left <= 7) return "soon";
  return "later";
}

export const SECTION_ORDER = ["overdue", "today", "tomorrow", "soon", "later", "nodue", "done"];
