import { useParams } from "react-router-dom";
import Layout from "../components/layout/Layout";
import PeopleSearch from "../components/people/PeopleSearch";
import PersonCard from "../components/people/PersonCard";
import { useP } from "../components/people/peopleUtil";

/**
 * «Xodim kartasi» — everything the platform knows about ONE person of the
 * plant (Laboratory, page key `people`, admin-only until the operator opens it).
 *
 *   /people                     find a person (the Verifix directory)
 *   /people?find=<name>&code=   a NAME from another page: one match opens the
 *                               card, namesakes are listed — never a guess
 *   /people/:employee_id        the card (identity = the Verifix employee id)
 */
export default function People() {
  const P = useP();
  const { employeeId } = useParams();
  return (
    <Layout title={P.title}>
      {employeeId ? <PersonCard key={employeeId} eid={employeeId} /> : <PeopleSearch />}
    </Layout>
  );
}
