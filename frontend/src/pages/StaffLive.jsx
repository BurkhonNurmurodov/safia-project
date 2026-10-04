import { StaffApiProvider } from "../context/StaffApiContext";
import { StaffPage } from "./Staff";

/**
 * «Verifix to'g'irlash · Jonli» — the LAB copy of /staff (2026-10-04, the
 * operator: «structure this page just like Verifix edit … the same rule
 * applies for everything … the only difference should be the source»).
 *
 * It IS /staff's page: the same tabs, tables, documents, deletion requests,
 * cell placement and day close, rendered against `/api/staff-live`, which
 * builds a unit's day from the stored live Verifix read (read every minute)
 * instead of the next-day attendance file. A people-exchange follows the clock:
 * the name stays with the sender and the receiver gets additional hours until
 * the receiver's side is the bigger one, then the name moves. Lab only — its
 * documents live in their own tables and change nothing else on the platform.
 */
export default function StaffLive() {
  return (
    <StaffApiProvider live>
      <StaffPage />
    </StaffApiProvider>
  );
}
