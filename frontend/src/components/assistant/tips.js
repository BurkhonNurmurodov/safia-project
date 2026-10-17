/**
 * The questions an empty chat offers, chosen by the PAGE the panel was opened
 * on — the page context goes with every message, so «this page» needs no
 * explaining. Keyed by the route's first segment; a page without its own
 * questions gets the general ones, which is exactly what every page offered
 * before. Each is a question the assistant can answer from what it may read.
 */
const BY_PAGE = {
  "": ["assistant.tip.overview"],
  zagruzka: ["assistant.tip.zagBelow", "assistant.tip.lowest"],
  downtime: ["assistant.tip.dtCategory", "assistant.tip.excel"],
  "idle-cell": ["assistant.tip.icLongest"],
  leaders: ["assistant.tip.ldMissed", "assistant.tip.ldRejected"],
  production: ["assistant.tip.prBehind", "assistant.tip.prPeople"],
  staff: ["assistant.tip.stAbsent", "assistant.tip.stDocs"],
  concerns: ["assistant.tip.cnOverdue", "assistant.tip.cnUnit"],
  tasks: ["assistant.tip.tasks", "assistant.tip.tsUrgent"],
  quality: ["assistant.tip.qlCategory", "assistant.tip.qlOpen"],
  kelish: ["assistant.tip.klUnmarked"],
  workers: ["assistant.tip.wkLowest"],
  plan: ["assistant.tip.plProducts"],
  "shift-daily": ["assistant.tip.sdBelow"],
  daily: ["assistant.tip.sdBelow"],
};

const GENERAL = ["assistant.tip.lowest", "assistant.tip.tasks", "assistant.tip.excel"];
const MAX = 4;

/** Translation keys of the questions to show. `onPage` = the assistant's own
 *  full page, where «this page» would mean the chat itself. */
export function tipsFor(pathname, onPage) {
  const out = onPage ? ["assistant.tip.howLoad"] : ["assistant.tip.page"];
  if (!onPage) {
    const seg = String(pathname || "/").split("/")[1] || "";
    for (const k of BY_PAGE[seg] || []) if (!out.includes(k)) out.push(k);
  }
  for (const k of GENERAL) if (out.length < MAX && !out.includes(k)) out.push(k);
  return out.slice(0, MAX);
}
