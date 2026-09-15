import { useParams } from "react-router-dom";
import Layout from "../components/layout/Layout";
import DayReportView, { DAY_REPORT_T } from "../components/leaders/DayReportView";
import { useLang } from "../context/LangContext";

/**
 * One leader's day, verified — `/leaders/report/:uid`.
 *
 * The page is only a frame: everything it shows lives in `DayReportView`, which
 * the unit-day page (`/leaders/unit-report/:mid/:date`) also opens in place for
 * each of a brigadir's leaders. See that component for what the report is
 * arranged to answer, and why it is auth-only.
 */
export default function LeaderDayReport() {
  const { uid } = useParams();
  const { lang } = useLang();
  const T = DAY_REPORT_T[lang] || DAY_REPORT_T.ru;
  return (
    <Layout title={T.title}>
      <DayReportView uid={uid} />
    </Layout>
  );
}
