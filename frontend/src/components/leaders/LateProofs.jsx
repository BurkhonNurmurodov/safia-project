import AppealQueue from "./AppealQueue";

/**
 * «Kechikkan isbotlar» — proofs filed after the task's own deadline. From
 * 2026-09-26 each card opens its CHAT (`pages/LeaderAppeal.jsx`), where the
 * ruling buttons, the photos with how late they came and the conversation are;
 * the queue itself is the shared `AppealQueue`, which the objections tab reads
 * too — see that component for what the list keeps and why.
 */
export default function LateProofs(props) {
  return <AppealQueue thread="late" {...props} />;
}
