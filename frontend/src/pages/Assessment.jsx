import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import AssessmentList from "../components/assessment/AssessmentList";
import QuestionBank from "../components/assessment/QuestionBank";
import { useAT } from "../components/assessment/assessmentUtil";
import { useAuth } from "../context/AuthContext";
import { usePersistentState } from "../hooks/usePersistentState";

/**
 * «Nomzodlarni baholash» (/assessment) — the panel that grades a Supervisor
 * candidate in a live, verbal assessment. Laboratory, page key `assessment`
 * (admin-only until the operator opens it to the judges).
 *
 * Two tabs: the sittings (every judge's door into a scorecard, /assessment/:id)
 * and the question bank the 20 questions are drawn from — the bank is the
 * admin's alone, and the server refuses it to anybody else.
 */
export default function Assessment() {
  const T = useAT();
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const [tab, setTab] = usePersistentState("assessment_tab", "list");
  const view = isAdmin ? tab : "list";

  return (
    <Layout title={T.title}>
      <div className="space-y-4">
        {isAdmin && (
          <SegmentedToggle asTabs value={view} onChange={setTab} ariaLabel={T.title}
            options={[["list", T.tabList], ["bank", T.tabBank]]} />
        )}
        {view === "bank" ? <QuestionBank /> : <AssessmentList isAdmin={isAdmin} />}
      </div>
    </Layout>
  );
}
