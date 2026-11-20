// A leader's phone menu and app bar, named for the job (2026-11-20, the
// leader-phone redesign; the register is `LEADER_PHONE_JOBS` in
// config/navLinks.js, the words `shellPhoneText.js`). Read by the sidebar (the
// ☰ drawer) and the drawer's search; Layout (the bar's title) and App.jsx (the
// «Bugun» landing) read the leaf ./leaderTab.js. Nothing here applies from md
// up or to any other role — every caller asks `useLeaderPhone()` first.
import { LEADER_PHONE_JOBS, LEADER_PHONE_QUIET, LEADER_PHONE_HIDDEN } from "../../config/navLinks";

// The tab store and the screen → job map live in the leaf ./leaderTab.js.
export { currentLeaderTab, jobOfScreen, primeLeaderTab, publishLeaderTab, useLeaderTab } from "./leaderTab";

/** The href a job entry opens. */
export const jobHref = (job) => (job.tab ? `${job.to}?tab=${job.tab}` : job.to);

/** Whether a job entry is the screen on view. */
export function jobActive(job, pathname, tab) {
  if (pathname !== job.to && !pathname.startsWith(`${job.to}/`)) return false;
  if (!job.tab) return true;
  // Only the page itself is a tab of it; a leader's day report under
  // /leaders/… belongs to neither entry.
  if (pathname !== job.to) return false;
  return tab === job.tab;   // the page's other tabs light neither (leaderTab.jobOfScreen)
}

/**
 * The phone menu from the links this leader may open (the sidebar's own
 * filtered list): the job entries first, then the rest — «Rahbariyat
 * vazifalari», Ta'lim and Imtihon leading, the others in register order —
 * without the one page decision 2 takes off a leader's phone.
 */
export function leaderPhoneMenu(links) {
  const can = new Set(links.map((l) => l.to));
  const jobs = LEADER_PHONE_JOBS.filter((j) => can.has(j.to));
  const taken = new Set(jobs.map((j) => j.to));
  const rest = links.filter((l) => !taken.has(l.to) && !LEADER_PHONE_HIDDEN.includes(l.to));
  const quiet = [
    ...LEADER_PHONE_QUIET.map((p) => rest.find((l) => l.to === p)).filter(Boolean),
    ...rest.filter((l) => !LEADER_PHONE_QUIET.includes(l.to)),
  ];
  return { jobs, quiet };
}
