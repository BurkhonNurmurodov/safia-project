// «Bo'limlar» — each team's room, set by hand (2026-11-23).
//
// The operator, on «Konteyner taqsimlash»: «open another row after container
// split … most of teams location written is incorrect, i want to change it by
// hand, so make it possible and easy». A menu row of its own in the container
// app (page key `container-bolims`, admin-only): the cells of every brigadir
// the flow serves, grouped by brigadir, each with a room picker that SAVES ON
// PICK. A room missing from the list is added from the picker itself («+ Yangi
// bo'lim» — the new room lands on that team at once) or from the toolbar. The
// rooms are the `bolims` of /cells (backend `services/bolims.py`), so a room
// renamed here is renamed for every team in it.
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2, MapPin, Plus } from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import Button from "../components/ui/Button";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import BolimsModal, { BolimForm } from "../components/BolimsModal";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";
import { cellName } from "../utils/cellName";
import { latinFold } from "../utils/latinCode";
import { bolimLine } from "../utils/bolim";
import api from "../utils/api";

const DOOR = "/api/container-flow/bolims";
const KEY = ["cflow-bolims"];
const NEW = "__new";

export default function ContainerBolims() {
  const { t, lang } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast({ position: "bottom" });
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get(DOOR).then((r) => r.data) });
  const [search, setSearch] = usePersistentState("cbol_search", "");
  const [only, setOnly] = usePersistentState("cbol_only", "all");     // all · unset
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [newFor, setNewFor] = useState(null);        // {cell?} — the add-room form, and the team it lands on
  const [busy, setBusy] = useState({});              // cell id → "saving" | "saved"

  const bolims = q.data?.bolims ?? [];
  const units = q.data?.units ?? [];
  const label = (b) => bolimLine(t, tx, lang, b);
  // Block, then the floor from the top down, then the name — the order a
  // person walks the plant.
  const options = useMemo(() => [
    { value: "", label: t("cbol.pick") },
    ...[...bolims].sort((a, b) => String(a.block || "~").localeCompare(String(b.block || "~"))
      || (b.floor ?? -99) - (a.floor ?? -99) || label(a).localeCompare(label(b)))
      .map((b) => ({ value: String(b.id), label: label(b) })),
    { value: NEW, label: `+ ${t("cbol.newRoom")}` },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [bolims, lang, t, tx]);

  const shop = (c) => tx(cellName(c.workshop, lang, ""));
  const groups = useMemo(() => {
    const qq = latinFold(search.trim());
    return units.map((u) => ({
      ...u,
      shown: u.cells.filter((c) => (only !== "unset" || !c.bolim_id)
        && (!qq || latinFold(`${c.code} ${shop(c)} ${tl(u.name)}`).includes(qq))),
    })).filter((u) => u.shown.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, search, only, lang, tl, tx]);
  const unsetCount = units.reduce((n, u) => n + u.cells.filter((c) => !c.bolim_id).length, 0);
  const shownCount = groups.reduce((n, u) => n + u.shown.length, 0);

  const setCell = (cid, bolim_id) => qc.setQueryData(KEY, (d) => d && ({
    ...d, units: d.units.map((u) => ({ ...u, cells: u.cells.map((c) => (c.id === cid ? { ...c, bolim_id } : c)) })),
  }));
  const save = useMutation({
    mutationFn: ({ cell, bolim_id }) => api.put(`${DOOR}/cell/${cell.id}`, { bolim_id: bolim_id || 0 }),
    onMutate: ({ cell, bolim_id }) => {
      setBusy((b) => ({ ...b, [cell.id]: "saving" }));
      setCell(cell.id, bolim_id || null);
      return { was: cell.bolim_id };
    },
    onError: (e, { cell }, ctx) => {
      setCell(cell.id, ctx?.was ?? null);
      setBusy((b) => ({ ...b, [cell.id]: undefined }));
      toast.error(`${cell.code}: ${e?.response?.data?.detail || t("admin.profiles.error")}`);
    },
    onSuccess: (_r, { cell }) => {
      setBusy((b) => ({ ...b, [cell.id]: "saved" }));
      setTimeout(() => setBusy((b) => (b[cell.id] === "saved" ? { ...b, [cell.id]: undefined } : b)), 1800);
      // the split and /cells read the same rooms
      qc.invalidateQueries({ queryKey: ["cflow-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-cells"] });
    },
  });
  const pick = (cell, v) => {
    if (v === NEW) { setNewFor({ cell }); return; }
    const id = v ? Number(v) : null;
    if (id === (cell.bolim_id ?? null)) return;
    save.mutate({ cell, bolim_id: id });
  };
  const afterNewRoom = async (res) => {
    const cell = newFor?.cell;
    setNewFor(null);
    await qc.invalidateQueries({ queryKey: KEY });
    if (cell && res?.id) save.mutate({ cell, bolim_id: res.id });
    else toast.success(t("bolim.saved"));
  };

  const mark = (c) => (busy[c.id] === "saving"
    ? <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-3)" }} aria-label={t("common.save")} />
    : busy[c.id] === "saved"
      ? <Check size={14} style={{ color: "var(--status-ok)" }} aria-label={t("cbol.saved")} />
      : <span className="inline-block w-[14px]" aria-hidden />);
  const picker = (c) => (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 min-w-0">
        <StyledSelect searchable value={c.bolim_id ? String(c.bolim_id) : ""} onChange={(v) => pick(c, v)}
          options={options} triggerClassName="px-2.5 py-1.5 text-xs" />
      </div>
      {mark(c)}
    </div>
  );
  const unitHead = (u) => {
    const unset = u.cells.filter((c) => !c.bolim_id).length;
    return (
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-semibold truncate" style={{ color: "var(--text-1)" }}>{tl(u.name)}</span>
        <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-3)" }}>
          {t("cbol.cells").replace("{n}", u.cells.length)}
          {unset > 0 && <span style={{ color: "var(--status-warn)" }}> · {t("cbol.unsetCount").replace("{n}", unset)}</span>}
        </span>
      </span>
    );
  };

  const mobile = q.isLoading ? (
    <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-14 w-full" />)}</div>
  ) : !groups.length ? (
    <div className="py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{t("cbol.empty")}</div>
  ) : (
    <div className="flex flex-col gap-4">
      {groups.map((u) => (
        <section key={u.id} className="flex flex-col gap-2">
          <div className="px-1">{unitHead(u)}</div>
          {u.shown.map((c) => (
            <div key={c.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-baseline gap-2 min-w-0">
                <b className="font-mono tabular-nums" style={{ color: "var(--text-1)" }}>{c.code}</b>
                <span className="text-xs truncate" style={{ color: "var(--text-2)" }}>{shop(c)}</span>
              </div>
              {picker(c)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );

  return (
    <Layout title={t("nav.containerBolims")}>
      <p className="text-sm mb-3" style={{ color: "var(--text-3)" }}>{t("cbol.sub")}</p>
      <TableCard
        icon={MapPin}
        title={t("nav.containerBolims")}
        fixed
        minWidth={720}
        mobile={mobile}
        mobileCards
        mobileMaxHeight="none"
        right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>{shownCount}</span>}
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t("cbol.search")} className="w-full sm:w-64" />
            <SegmentedToggle value={only === "unset" ? "unset" : "all"} onChange={setOnly}
              options={[["all", t("cbol.all")], ["unset", `${t("cbol.unset")} · ${unsetCount}`]]} />
            <div className="ml-auto flex items-center gap-2">
              <Button size="lg" variant="secondary" icon={<Building2 size={14} />} onClick={() => setRoomsOpen(true)} className="whitespace-nowrap">
                {t("cbol.rooms")}
              </Button>
              <Button size="lg" icon={<Plus size={14} />} onClick={() => setNewFor({})} className="whitespace-nowrap">
                {t("cbol.newRoom")}
              </Button>
            </div>
          </>
        }
      >
        <thead>
          <tr>
            <Th label={t("cbol.colCode")} cls="w-[14%]" />
            <Th label={t("cbol.colWorkshop")} cls="w-[30%]" />
            <Th icon={MapPin} label={t("cbol.colRoom")} cls="w-[56%]" />
          </tr>
        </thead>
        <tbody>
          {q.isLoading && Array.from({ length: 8 }).map((_, i) => (
            <tr key={`sk-${i}`}>{[0, 1, 2].map((j) => <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>)}</tr>
          ))}
          {!q.isLoading && !groups.length && (
            <tr><td colSpan={3} className="px-3 py-10 text-center" style={{ color: "var(--text-4)" }}>{t("cbol.empty")}</td></tr>
          )}
          {groups.map((u) => (
            <Fragment key={u.id}>
              <tr>
                <td colSpan={3} className="px-3 py-2" style={{ background: "var(--bg-inner)" }}>{unitHead(u)}</td>
              </tr>
              {u.shown.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-1.5 font-mono font-semibold whitespace-nowrap" style={{ color: "var(--text-1)" }}>{c.code}</td>
                  <td className="px-3 py-1.5"><span className="block truncate" style={{ color: "var(--text-2)" }} title={shop(c)}>{shop(c) || "—"}</span></td>
                  <td className="px-3 py-1.5">{picker(c)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </TableCard>

      {roomsOpen && (
        <BolimsModal bolims={bolims} endpoint={DOOR} canDelete={false}
          onClose={() => setRoomsOpen(false)} onChanged={() => qc.invalidateQueries({ queryKey: KEY })} />
      )}
      {newFor && (
        <BolimForm endpoint={DOOR} zIndex={50} onClose={() => setNewFor(null)} onSaved={afterNewRoom} />
      )}
      {toast.node}
    </Layout>
  );
}
