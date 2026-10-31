import { useNavigate } from "react-router-dom";
import { Award, ClipboardCheck, Crown, ExternalLink, UsersRound } from "lucide-react";
import Button from "../ui/Button";
import { SectionHead } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { useTranslit } from "../../utils/transliterate";
import { useLang } from "../../context/LangContext";
import { fill, Chip } from "./peopleUtil";

function Card({ icon, title, right, children }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={icon} title={title} right={right} />
      <div className="px-4 pt-1 pb-4 space-y-3">{children}</div>
    </div>
  );
}

function Line({ label, children }) {
  return (
    <div className="flex items-baseline gap-3 min-w-0">
      <span className="text-xs w-28 flex-shrink-0" style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="text-sm min-w-0 flex flex-wrap gap-1" style={{ color: "var(--text-1)" }}>{children}</span>
    </div>
  );
}

const MONTH = (ym, t) => {
  const [y, m] = String(ym || "").split("-");
  return m ? `${t(`cal.m${Number(m) - 1}`)} ${y}` : ym;
};

/** «Rahbarlik» — only for a person tied (by the live sync) to a leader
 *  profile or a brigadir unit. It links to the pages that own those figures
 *  and shows the «Liderlar KPI» board's total only when that board is already
 *  computed — the card never builds it. */
export default function LeadershipTab({ data, P, ready }) {
  const nav = useNavigate();
  const { tl } = useTranslit();
  const { t } = useLang();
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages, capTabs } = useCapabilities();
  const can = (p) => canAccessPage(auth?.role, p, access, capPages, deniedPages);
  const manageProfiles = auth?.role === "admin" || (capTabs || []).includes("profiles");
  const L = ready ? data.leadership : null;

  if (!L) return <SkeletonBlock className="h-40 w-full rounded-2xl" />;

  const codes = (list) => (list.length ? list.map((c) => <Chip key={c} className="tabular-nums">{c}</Chip>) : P.noCells);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {L.leaders.map((p) => (
        <Card key={`l${p.id}`} icon={Crown} title={P.leaderProfile}
          right={p.kind ? <Chip>{p.kind === "acting" ? P.kind.acting : P.kind.leader}</Chip> : null}>
          <div className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{tl(p.name)}</div>
          <Line label={P.brigadir}>{p.unit ? tl(p.unit) : "—"}</Line>
          <Line label={P.runsCells}>{codes(p.runs)}</Line>
          <Line label={P.ownsCells}>{codes(p.owns)}</Line>
          <div className="flex flex-wrap gap-2 pt-1">
            {manageProfiles && <Button variant="secondary" icon={ExternalLink} onClick={() => nav(`/profile/leader/${p.id}`)}>{P.openProfile}</Button>}
            {can("leaders") && <Button variant="secondary" icon={ClipboardCheck} onClick={() => nav("/leaders")}>{P.openLeaders}</Button>}
          </div>
        </Card>
      ))}
      {L.units.map((u) => (
        <Card key={`u${u.id}`} icon={UsersRound} title={P.unitTitle}
          right={u.kind ? <Chip>{u.kind === "acting" ? P.kind.acting_sup : P.kind.supervisor}</Chip> : null}>
          <div className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{tl(u.name)}</div>
          <Line label={P.shift}>{u.shift ? fill(P.shiftN, { n: u.shift }) : "—"}</Line>
          <Line label={P.cell}>{fill(P.cellsN, { n: u.cells })}</Line>
          <div className="flex flex-wrap gap-2 pt-1">
            {can("overview") && <Button variant="secondary" icon={ExternalLink} onClick={() => nav(`/brigadir/${u.id}`)}>{P.openBrigadir}</Button>}
          </div>
        </Card>
      ))}
      {L.leaders.length > 0 && (
        <Card icon={Award} title={L.kpi ? fill(P.kpiTitle, { m: MONTH(L.kpi.month, t) }) : P.openKpi}
          right={L.kpi ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(P.kpiAge, { n: Math.max(1, Math.round(L.kpi.age_s / 60)) })}</span> : null}>
          {L.kpi ? (
            <ul className="space-y-2">
              {L.kpi.rows.map((r) => (
                <li key={r.code} className="flex items-center gap-3">
                  <Chip className="tabular-nums">{r.code}</Chip>
                  <span className="text-sm tabular-nums" style={{ color: "var(--text-1)" }}>
                    {P.kpiTotal}: <b>{Number(r.total ?? 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</b> / 5
                  </span>
                  <span className="text-xs ml-auto tabular-nums" style={{ color: "var(--text-3)" }}>{fill(P.kpiPlace, { r: r.rank ?? "—", of: L.kpi.of })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-3)" }}>{P.kpiNone}</p>
          )}
          {can("leaders-kpi") && (
            <div><Button variant="secondary" icon={ExternalLink} onClick={() => nav("/leaders-kpi")}>{P.openKpi}</Button></div>
          )}
        </Card>
      )}
    </div>
  );
}
