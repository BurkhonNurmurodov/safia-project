import AppealQueue from "./AppealQueue";

/**
 * «Norozliklar» — the queue of objections to a rejected task, whichever judge
 * refused it: the AI, an automatic check, or an admin's «not done» ruling
 * (2026-10-14; each card's chip says which). From
 * 2026-09-26 each card opens its CHAT (`pages/LeaderAppeal.jsx`), where the
 * ruling buttons, the photos with the AI's reason and the conversation are;
 * the queue itself is the shared `AppealQueue`, which the late-proof tab reads
 * too — see that component for what the list keeps and why.
 */
export default function Disputes(props) {
  return <AppealQueue thread="dispute" {...props} />;
}
