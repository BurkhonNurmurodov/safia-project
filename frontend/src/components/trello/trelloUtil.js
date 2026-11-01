// «Trello» (/trello) — the page's small helpers over GET /api/trello/analysis
// (backend services/trello_analytics.py). Nothing here measures anything.
import { useLang } from "../../context/LangContext";
import { inTelegram } from "../../utils/session";
import { TXT } from "../../pages/trelloText";

export { fill } from "../../pages/trelloText";

/** The page's words in the reader's language. */
export function useTT() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}

// Trello's own label palette (its 2023 colours), so a label reads as the board
// shows it. Only on the label's own swatch — never on a bar, where colour on
// this platform means status.
const LABEL_HEX = {
  green: "#4bce97", yellow: "#f5cd47", orange: "#fea362", red: "#f87168", purple: "#9f8fef",
  blue: "#579dff", sky: "#6cc3e0", lime: "#94c748", pink: "#e774bb", black: "#8590a2",
  green_dark: "#1f845a", yellow_dark: "#946f00", orange_dark: "#c25100", red_dark: "#c9372c",
  purple_dark: "#6e5dc6", blue_dark: "#0c66e4", sky_dark: "#227d9b", lime_dark: "#5b7f24",
  pink_dark: "#ae4787", black_dark: "#626f86",
  green_light: "#baf3db", yellow_light: "#f8e6a0", orange_light: "#fedec8", red_light: "#ffd5d2",
  purple_light: "#dfd8fd", blue_light: "#cce0ff", sky_light: "#c6edfb", lime_light: "#d3f1a7",
  pink_light: "#fdd0ec", black_light: "#dcdfe4",
};
export const labelHex = (c) => LABEL_HEX[c] || "#94a3b8";

export const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
export const ddmmyy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

/** «01.11 14:05» from an ISO instant, in the reader's clock. */
export function stamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const fmtN = (n) => (n == null ? "—" : Number(n).toLocaleString("ru-RU"));
export const fmtDays = (n) => (n == null ? "—" : (Math.round(n * 10) / 10).toLocaleString("ru-RU"));

/** «unauthorized: …» → the reader's words for it. */
export function errText(T, e, vars = {}) {
  if (!e) return T.err.error;
  const code = String(e).split(":")[0].trim();
  const tpl = T.err[code];
  return tpl ? tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`) : String(e);
}

/** A card's link opens in the real browser inside Telegram, where
 *  target=_blank is swallowed; elsewhere the plain <a> is right. */
export function openExt(e, url) {
  const tg = window?.Telegram?.WebApp;
  if (!url || !inTelegram() || !tg?.openLink) return;
  e.preventDefault();
  try { tg.openLink(url); } catch { window.open(url, "_blank", "noopener"); }
}
