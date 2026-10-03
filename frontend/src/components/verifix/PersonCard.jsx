import { useState } from "react";
import { UserRound, Camera } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import { SkeletonBlock, SkeletonTable } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import VfxPhoto from "./VfxPhoto";
import { VfxError, AccessNotice, StatusDot, Chip, CellChip } from "./VfxState";
import {
  useVfx, vfxError, fill, dmy, dm, hm, hmm, clockOn, markLabel, DAY_STATUS, C_OK, C_BAD, C_WARN, C_NONE,
} from "./vfx";

/* One person as Verifix knows them — opened from every page of the section.
 * Facts first (who, where, since when), then four lenses: the last two weeks
 * of the attendance report, the raw marks, the photos (their own and the one
 * taken at today's last mark) and every field the API returns that this
 * section may show (passport / PINFL / family never reach the browser). */

const EMP_TONE = { W: C_OK, D: C_NONE, U: C_NONE };
const MED_TONE = { F: C_OK, U: C_BAD, N: C_WARN };

function age(iso, today) {
  if (!iso || !today) return null;
  const b = new Date(`${iso}T12:00:00`);
  const n = new Date(`${today}T12:00:00`);
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a -= 1;
  return a;
}

export default function PersonCard({ id, onClose, zIndex }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const [q] = useVfx(["person", String(id)], `/employees/${id}`);
  const [tab, setTab] = useState("days");
  const d = q.data;
  const r = d?.row;
  const n = d?.names || {};
  const name = r ? tl(r.name) : t("vfx.loading");

  const facts = r ? [
    [t("vfx.p.status"), <StatusDot key="s" color={EMP_TONE[r.status] || C_NONE} label={t(`vfx.emp.st.${r.status}`)} />],
    [t("vfx.p.id"), <span key="i" className="font-mono">{r.id}{r.code ? ` · ${r.code}` : ""}</span>],
    [t("vfx.p.div"), tx(n.div) || "—"],
    [t("vfx.p.unit"), d.cell ? <span key="u" className="inline-flex items-center gap-2 flex-wrap">{tx(n.unit)}<CellChip cell={d.cell} compact /></span> : (tx(n.unit) || "—")],
    [t("vfx.p.job"), tx(n.job) || "—"],
    [t("vfx.p.sched"), tx(n.sched) || "—"],
    [t("vfx.p.hired"), r.hired ? dmy(r.hired) : "—"],
    r.dismissed ? [t("vfx.p.dismissed"), dmy(r.dismissed)] : null,
    [t("vfx.p.birthday"), r.birthday ? `${dmy(r.birthday)} · ${fill(t("vfx.p.age"), { n: age(r.birthday, d.today) })}` : "—"],
    [t("vfx.p.gender"), r.gender ? t(`vfx.gender.${r.gender}`) : "—"],
    [t("vfx.p.phone"), r.phone ? <a key="ph" href={`tel:+${String(r.phone).replace(/\D/g, "")}`} className="hover:underline">{r.phone}</a> : "—"],
    [t("vfx.p.med"), r.med || r.med_next
      ? <span key="m" className="inline-flex items-center gap-2 flex-wrap">
          {r.med && <StatusDot color={MED_TONE[r.med] || C_NONE} label={t(`vfx.med.${r.med}`)} />}
          {r.med_next && <span style={{ color: r.med_next < d.today ? C_BAD : "var(--text-2)" }}>
            {fill(t("vfx.p.medNext"), { d: dmy(r.med_next) })}</span>}
        </span> : "—"],
    d.profile?.citizenship_name ? [t("vfx.p.citizen"), tx(d.profile.citizenship_name)] : null,
  ].filter(Boolean) : [];

  return (
    <Modal onClose={onClose} title={name} icon={UserRound} maxWidth="max-w-3xl" zIndex={zIndex}
      subtitle={r ? [tx(n.job), tx(n.unit)].filter(Boolean).join(" · ") : null}
      footer={<Button variant="secondary" onClick={onClose}>{t("vfx.close")}</Button>}>
      {q.error ? <VfxError error={vfxError(q.error)} onRetry={() => q.refetch()} /> : !d ? (
        <div className="flex gap-4">
          <SkeletonBlock className="w-24 h-24 rounded-xl" />
          <div className="flex-1 space-y-2"><SkeletonTable rows={5} cols={2} /></div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-4">
            <VfxPhoto sha={r.photo} name={r.name} px={96} square zoom />
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 flex-1 min-w-0 text-sm">
              {facts.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{k}</dt>
                  <dd className="truncate" style={{ color: "var(--text-1)" }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <SegmentedToggle asTabs fill value={tab} onChange={setTab} options={[
            { value: "days", label: fill(t("vfx.p.tab.days"), { n: 14 }) },
            { value: "marks", label: t("vfx.p.tab.marks") },
            { value: "photos", label: t("vfx.p.tab.photos") },
            { value: "fields", label: t("vfx.p.tab.fields") },
          ]} />

          {tab === "days" && (d.days_error ? <AccessNotice error={d.days_error} form="Отчет по посещениям" /> : (
            <div className="overflow-auto rounded-xl" style={{ border: "1px solid var(--border)", maxHeight: "45vh" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                    {["date", "kind", "in", "out", "worked", "state"].map((k) => (
                      <th key={k} className="px-3 py-2 text-left font-semibold sticky top-0" style={{ background: "var(--bg-inner)" }}>{t(`vfx.p.d.${k}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(d.days || []).map((x) => (
                    <tr key={x.date} className="border-t border-[var(--border)]">
                      <td className="px-3 py-1.5 tabular-nums">{dmy(x.date)}</td>
                      <td className="px-3 py-1.5" style={{ color: "var(--text-2)" }}>{x.kind ? t(`vfx.day.${x.kind}`) : "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {x.in ? clockOn(x.in, x.date) : "—"}
                        {x.late ? <span className="ml-1.5" style={{ color: C_BAD }}>+{x.late}</span> : null}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">
                        {x.out ? clockOn(x.out, x.date) : "—"}
                        {x.early_out ? <span className="ml-1.5" style={{ color: C_WARN }}>−{x.early_out}</span> : null}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums">{x.hours != null ? `${hmm(x.hours)}${x.so_far ? "*" : ""}` : "—"}</td>
                      <td className="px-3 py-1.5"><StatusDot color={DAY_STATUS[x.status] || C_NONE} label={t(`staffLive.st.${x.status}`)} /></td>
                    </tr>
                  ))}
                  {!d.days?.length && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("vfx.p.noDays")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}

          {tab === "marks" && (d.marks_error ? <AccessNotice error={d.marks_error} form="Отметки" /> : (
            <div className="overflow-auto rounded-xl" style={{ border: "1px solid var(--border)", maxHeight: "45vh" }}>
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr style={{ color: "var(--text-3)" }}>
                    {["at", "type", "mark", "loc", "by"].map((k) => (
                      <th key={k} className="px-3 py-2 text-left font-semibold sticky top-0" style={{ background: "var(--bg-inner)" }}>{t(`vfx.m.col.${k}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(d.marks || []).map((m) => (
                    <tr key={m.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-1.5 tabular-nums">{dm(m.at)} {hm(m.at)}</td>
                      <td className="px-3 py-1.5"><TrackType type={m.type} /></td>
                      <td className="px-3 py-1.5" style={{ color: "var(--text-2)" }}>{markLabel(t, m.mark)}</td>
                      <td className="px-3 py-1.5 truncate max-w-[200px]" style={{ color: "var(--text-2)" }}>{tx(d.locations?.[m.loc]) || "—"}</td>
                      <td className="px-3 py-1.5 truncate max-w-[160px]" style={{ color: "var(--text-3)" }}>{m.mark === "M" ? tl(m.by) || "—" : "—"}</td>
                    </tr>
                  ))}
                  {!d.marks?.length && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center" style={{ color: "var(--text-3)" }}>{t("vfx.p.noMarks")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}

          {tab === "photos" && (
            <div className="space-y-3">
              {d.last?.photo ? (
                <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-inner)" }}>
                  <VfxPhoto sha={d.last.photo} name={r.name} px={88} square zoom />
                  <div className="text-sm">
                    <div className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--text-1)" }}>
                      <Camera size={14} style={{ color: "var(--text-3)" }} />{t("vfx.p.lastMarkPhoto")}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
                      {d.last.at ? `${dmy(d.last.at)} ${hm(d.last.at)}` : ""} · <TrackType type={d.last.type} />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  {d.last_error ? fill(t("vfx.access.error"), { msg: d.last_error.message }) : t("vfx.p.noLastPhoto")}
                </p>
              )}
              <div>
                <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>
                  {fill(t("vfx.p.idPhotos"), { n: d.photos?.length || 0 })}
                </div>
                {d.photos?.length ? (
                  <div className="flex flex-wrap gap-3">
                    {d.photos.map((p) => (
                      <div key={p.sha} className="flex flex-col items-center gap-1">
                        <VfxPhoto sha={p.sha} name={r.name} px={112} square zoom />
                        {p.main && <Chip color={C_OK}>{t("vfx.p.main")}</Chip>}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs" style={{ color: "var(--text-3)" }}>{t("vfx.p.noPhotos")}</p>}
              </div>
            </div>
          )}

          {tab === "fields" && <ProfileFields profile={d.profile} />}
        </>
      )}
    </Modal>
  );
}

export function TrackType({ type }) {
  const { t } = useLang();
  if (!type) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const s = t(`vfx.track.${type}`);
  const label = s === `vfx.track.${type}` ? type : s;
  const color = type === "I" || type === "N" ? C_OK : type === "O" || type === "T" ? C_WARN : C_NONE;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="font-mono text-[10px] font-bold w-4 h-4 rounded grid place-items-center"
        style={{ background: `${color}22`, color }}>{type}</span>
      <span style={{ color: "var(--text-2)" }}>{label}</span>
    </span>
  );
}

function ProfileFields({ profile }) {
  const { t } = useLang();
  if (!profile) return null;
  const scalars = Object.entries(profile).filter(([, v]) => v == null || typeof v !== "object");
  const dyn = Array.isArray(profile.fields) ? profile.fields : [];
  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-xs">
          <tbody>
            {scalars.map(([k, v]) => (
              <tr key={k} className="border-t first:border-t-0 border-[var(--border)]">
                <td className="px-3 py-1.5 font-mono w-1/3 align-top" style={{ color: "var(--text-3)" }}>{k}</td>
                <td className="px-3 py-1.5 break-all" style={{ color: v == null ? "var(--text-4)" : "var(--text-1)" }}>{v == null ? "—" : String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dyn.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>{t("vfx.p.dynamic")}</div>
          <div className="flex flex-wrap gap-2">
            {dyn.map((f, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-lg" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                <span className="font-mono" style={{ color: "var(--text-3)" }}>{f.code}</span>: {Array.isArray(f.value) ? f.value.join(", ") : String(f.value ?? "—")}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("vfx.p.privateNote")}</p>
    </div>
  );
}
