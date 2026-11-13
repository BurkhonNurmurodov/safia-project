// The motion harness's page (README.md): the REAL templates, one of each, with
// `data-testid`s that run.mjs presses. Sample data only — no API, no session.
//
// Layout that exists only here is INLINE-styled: index.css tells Tailwind to
// scan the app's sources and nothing else, so a utility class used only in
// this file would never be generated.
import { useEffect, useState } from "react";
import { Pencil, Archive, Trash2, Users, Factory } from "lucide-react";
import Button from "../../src/components/ui/Button.jsx";
import Modal from "../../src/components/ui/Modal.jsx";
import ConfirmDialog from "../../src/components/ui/ConfirmDialog.jsx";
import { useToast } from "../../src/components/ui/Toast.jsx";
import ActionMenu from "../../src/components/ui/ActionMenu.jsx";
import StyledSelect from "../../src/components/ui/StyledSelect.jsx";
import DateRangePicker from "../../src/components/ui/DateRangePicker.jsx";
import { FilterPanel, PickFilter } from "../../src/components/ui/ColumnFilter.jsx";
import ColumnsPicker from "../../src/components/ui/ColumnsPicker.jsx";
import Tooltip from "../../src/components/ui/Tooltip.jsx";
import Lightbox from "../../src/components/ui/Lightbox.jsx";
import SegmentedToggle from "../../src/components/ui/SegmentedToggle.jsx";
import TimeWheelPicker from "../../src/components/ui/TimeWheelPicker.jsx";
import FormulaModal from "../../src/components/ui/FormulaModal.jsx";
import { leaveRef } from "../../src/utils/leave.js";

const PHOTO = "data:image/svg+xml;utf8," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="#C8973F"/>' +
  '<circle cx="320" cy="210" r="120" fill="#fff5ec"/><text x="320" y="225" font-size="40" text-anchor="middle" fill="#7a4b12">Safia</text></svg>');

const OPTS = Array.from({ length: 40 }, (_, i) => ({ value: `c${i}`, label: `Yacheyka 9${String(100 + i)}` }));
const COLS = [
  { key: "code", label: "Kod", locked: true }, { key: "name", label: "Nomi" },
  { key: "plan", label: "Plan" }, { key: "fact", label: "Fakt" }, { key: "load", label: "Yuklama" },
];

function Box({ title, children, id }) {
  return (
    <section id={id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-3)", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>{children}</div>
    </section>
  );
}

export default function App() {
  // How many times this mount effect ran: 2 under StrictMode in a development
  // build (React rehearses every mount there), 1 otherwise. run.mjs reads it to
  // prove the StrictMode scenario really is one.
  useEffect(() => { window.__effectRuns = (window.__effectRuns || 0) + 1; }, []);
  const toast = useToast();
  const toastBottom = useToast({ position: "bottom" });
  const [modal, setModal] = useState(false);       // conditional render
  const [modalOpen, setModalOpen] = useState(false); // `open` prop
  const [confirm, setConfirm] = useState(false);
  const [confirmInModal, setConfirmInModal] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [wheel, setWheel] = useState(false);
  const [formula, setFormula] = useState(false);
  const [seg, setSeg] = useState("a");
  const [segFill, setSegFill] = useState("min");
  const [verdict, setVerdict] = useState(null);
  const [tab, setTab] = useState("t1");
  const [narrow, setNarrow] = useState("n1");
  const [shown, setShown] = useState(false);     // a toggle mounted inside something hidden
  const [hid, setHid] = useState("h2");
  const [count, setCount] = useState(null);       // a label that grows after mount
  const [grow, setGrow] = useState("g2");
  const [sel, setSel] = useState("c3");
  const [selIn, setSelIn] = useState("c1");
  const [from, setFrom] = useState("2026-11-01");
  const [to, setTo] = useState("2026-11-13");
  const [day, setDay] = useState("2026-11-13");
  const [mFrom, setMFrom] = useState("2026-11-01");
  const [mTo, setMTo] = useState("2026-11-13");
  const [shift, setShift] = useState(null);
  const [plant, setPlant] = useState(null);
  const [cols, setCols] = useState({ order: COLS.map((c) => c.key), hidden: [] });
  const [picked, setPicked] = useState("");
  const [note, setNote] = useState("");
  // second pass: the shapes pages build by hand, on the hook-less `leaveRef`
  const [side, setSide] = useState(false);
  const [bar, setBar] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [catcher, setCatcher] = useState(false);
  const [full, setFull] = useState(false);
  const [pasted, setPasted] = useState(false);
  const [flow, setFlow] = useState(false);

  const sections = [
    { key: "plant", icon: Factory, label: "Zavod", active: plant != null, display: plant,
      onClear: () => setPlant(null),
      render: ({ close }) => <PickFilter opts={[{ value: "Sergeli", label: "Sergeli" }, { value: "Chilonzor", label: "Chilonzor" }]} value={plant} onChange={setPlant} close={close} /> },
    { key: "shift", icon: Users, label: "Smena", active: shift != null, display: shift,
      onClear: () => setShift(null),
      render: ({ close }) => <PickFilter opts={[{ value: "Smena 1", label: "Smena 1" }, { value: "Smena 2", label: "Smena 2" }]} value={shift} onChange={setShift} close={close} /> },
  ];

  const formBody = (
    <>
      <input data-testid="modal-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Izoh"
        style={{ width: "100%", padding: "8px 12px", borderRadius: 12, background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }} />
      <StyledSelect value={selIn} onChange={setSelIn} options={OPTS} searchable />
      <div data-testid="modal-long">
        {Array.from({ length: 30 }, (_, i) => (
          <p key={i} style={{ margin: "6px 0", color: "var(--text-2)", fontSize: 13 }}>Qator {i + 1} — uzun matn, modal ichida aylantirish uchun.</p>
        ))}
      </div>
    </>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Box title="Button — press" id="buttons">
        <Button data-testid="btn-primary" size="lg">Saqlash</Button>
        <Button data-testid="btn-secondary" variant="secondary" size="lg">Bekor qilish</Button>
        <Button data-testid="btn-danger" variant="danger" size="lg">O‘chirish</Button>
        <Button data-testid="btn-success" variant="success" size="lg">Excel</Button>
        <Button data-testid="btn-ghost" variant="ghost" size="lg">Ghost</Button>
        <Button data-testid="btn-tint" variant="danger" tint>Rad etish</Button>
        <Button data-testid="btn-disabled" disabled size="lg">O‘chiq</Button>
        <Button data-testid="btn-loading" loading size="lg">Yuklanmoqda</Button>
        <button data-testid="raw-btn" type="button" style={{ padding: "8px 14px", borderRadius: 10, background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}>Oddiy tugma</button>
        <button data-testid="raw-colors" type="button" className="transition-colors" style={{ padding: "8px 14px", borderRadius: 10, background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}>transition-colors</button>
        <button data-testid="raw-none" type="button" className="press-none" style={{ padding: "8px 14px", borderRadius: 10, background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}>press-none</button>
        <input data-testid="cb" type="checkbox" defaultChecked />
        <button data-testid="raw-wide" type="button" className="w-full" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)", textAlign: "left" }}>To‘liq kenglikdagi qator (w-full)</button>
      </Box>

      <Box title="SegmentedToggle — sliding pill" id="toggles">
        <span data-testid="seg"><SegmentedToggle value={seg} onChange={setSeg} options={[["a", "Reja"], ["b", "Fakt"], ["c", "Farq (P−A)"], ["d", "Samaradorlik"]]} /></span>
        <span data-testid="seg-sm"><SegmentedToggle size="sm" value={segFill} onChange={setSegFill} options={[["min", "min"], ["hrs", "soat"]]} /></span>
        <span data-testid="seg-verdict"><SegmentedToggle value={verdict} onChange={setVerdict} options={[
          { value: "pass", label: "O‘tdi", activeBg: "#15803d", activeFg: "#fff", idleFg: "#22c55e" },
          { value: "fail", label: "O‘tmadi", activeBg: "#b91c1c", activeFg: "#fff", idleFg: "#f87171" },
        ]} /></span>
        <div data-testid="seg-fill" style={{ width: 360 }}><SegmentedToggle fill value={tab} onChange={setTab} asTabs ariaLabel="tabs" options={[["t1", "Ishchilar"], ["t2", "So‘rovlar"], ["t3", "Arxiv"]]} /></div>
        <Button data-testid="show-hidden" variant="secondary" onClick={() => setShown((v) => !v)}>Yashirin</Button>
        <div data-testid="seg-hidden" style={{ display: shown ? "block" : "none" }}><SegmentedToggle value={hid} onChange={setHid} options={[["h1", "Bir"], ["h2", "Ikki"], ["h3", "Uch"]]} /></div>
        <Button data-testid="grow-label" variant="secondary" onClick={() => setCount(5571)}>Sanoq</Button>
        <span data-testid="seg-grow"><SegmentedToggle value={grow} onChange={setGrow} options={[["g1", <>AI tekshiruvi{count != null && <b style={{ marginLeft: 6 }}>{count}</b>}</>], ["g2", "Shikoyatlar"]]} /></span>
        <div data-testid="seg-narrow" style={{ width: 220 }}><SegmentedToggle value={narrow} onChange={setNarrow} options={[["n1", "Hammasi"], ["n2", "Smena 1"], ["n3", "Smena 2"], ["n4", "Tungi smena"], ["n5", "Dam olish"]]} /></div>
      </Box>

      <Box title="Dialogs" id="dialogs">
        <Button data-testid="open-modal" onClick={() => setModal(true)}>Modal (shartli)</Button>
        <Button data-testid="open-modal-prop" variant="secondary" onClick={() => setModalOpen(true)}>Modal (open prop)</Button>
        <Button data-testid="open-confirm" variant="danger" onClick={() => setConfirm(true)}>Tasdiqlash</Button>
        <Button data-testid="open-photo" variant="secondary" onClick={() => setPhoto(PHOTO)}>Lightbox</Button>
        <Button data-testid="open-wheel" variant="secondary" onClick={() => setWheel(true)}>Vaqt</Button>
        <Button data-testid="open-formula" variant="secondary" onClick={() => setFormula(true)}>Formula</Button>
      </Box>

      <Box title="Toasts" id="toasts">
        <Button data-testid="toast-ok" variant="success" onClick={() => toast.success("Saqlandi")}>Success</Button>
        <Button data-testid="toast-err" variant="danger" onClick={() => toast.error("Xatolik: saqlanmadi")}>Error</Button>
        <Button data-testid="toast-bottom" variant="secondary" onClick={() => toastBottom.info("Pastki xabar", 1500)}>Bottom</Button>
        <Button data-testid="toast-hide" variant="ghost" onClick={() => { toast.hide(); toastBottom.hide(); }}>Yopish</Button>
      </Box>

      <Box title="Popovers" id="popovers">
        <span data-testid="menu"><ActionMenu label="Amallar: 9422" items={[
          { key: "edit", label: "Tahrirlash", icon: Pencil, onSelect: () => setPicked("edit") },
          { key: "arch", label: "Arxivlash", icon: Archive, onSelect: () => setPicked("arch") },
          { key: "del", label: "O‘chirish", icon: Trash2, tone: "danger", onSelect: () => setConfirm(true) },
        ]} /></span>
        <div data-testid="select" style={{ width: 220 }}><StyledSelect value={sel} onChange={setSel} options={OPTS} searchable /></div>
        <span data-testid="range"><DateRangePicker dateFrom={from} dateTo={to} setDateFrom={setFrom} setDateTo={setTo} /></span>
        <span data-testid="single"><DateRangePicker single dateFrom={day} dateTo={day} setDateFrom={setDay} setDateTo={setDay} /></span>
        <span data-testid="month"><DateRangePicker month dateFrom={mFrom} dateTo={mTo} setDateFrom={setMFrom} setDateTo={setMTo} /></span>
        <span data-testid="tip" style={{ color: "var(--text-2)", fontSize: 13 }}>Yuklama<Tooltip text="Reja daqiqalari ÷ mavjud daqiqalar" /></span>
        <span data-testid="picked" style={{ color: "var(--text-3)", fontSize: 12 }}>{picked}</span>
      </Box>

      <Box title="Toolbar — FilterPanel + ColumnsPicker" id="toolbar">
        <div data-testid="toolbar-row" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
          <FilterPanel sections={sections} forceGroup />
          <ColumnsPicker columns={COLS} order={cols.order} hidden={cols.hidden} onChange={setCols} className="ml-auto" />
        </div>
      </Box>

      <Box title="Page-built surfaces — leaveRef (no hook)" id="pagebuilt">
        <Button data-testid="open-side" variant="secondary" onClick={() => setSide((v) => !v)}>Yon panel</Button>
        <Button data-testid="open-bar" variant="secondary" onClick={() => setBar((v) => !v)}>Pastki tasma</Button>
        <Button data-testid="open-zoom" variant="secondary" onClick={() => setZoom(true)}>Zoom</Button>
        <Button data-testid="open-catcher" variant="secondary" onClick={() => setCatcher(true)}>Menyu (catcher)</Button>
        <Button data-testid="open-full" variant="secondary" onClick={() => setFull(true)}>To‘liq ekran</Button>
        <Button data-testid="open-pasted" variant="secondary" onClick={() => setPasted((v) => !v)}>Yopishtirilgan toast</Button>
        <Button data-testid="open-flow" variant="secondary" onClick={() => setFlow((v) => !v)}>Oqimdagi blok</Button>
        {flow && <div ref={leaveRef} data-testid="flow-box" style={{ padding: 12, background: "var(--bg-inner)", borderRadius: 10, color: "var(--text-2)" }}>oqim ichidagi blok — nusxa qolmasligi kerak</div>}
      </Box>

      <div style={{ height: 500 }} />
      <Box title="Bottom of the page (popovers flip up here)" id="bottom">
        <div data-testid="select-bottom" style={{ width: 220 }}><StyledSelect value={sel} onChange={setSel} options={OPTS} /></div>
        <span data-testid="menu-bottom"><ActionMenu label="Amallar: pastda" items={[
          { key: "edit", label: "Tahrirlash", icon: Pencil, onSelect: () => setPicked("edit2") },
          { key: "arch", label: "Arxivlash", icon: Archive, onSelect: () => setPicked("arch2") },
        ]} /></span>
      </Box>

      {modal && (
        <Modal title="Yacheykani tahrirlash" subtitle="9422 · Aripova" onClose={() => setModal(false)}
          footer={<>
            <Button variant="secondary" onClick={() => setModal(false)}>Bekor qilish</Button>
            <Button data-testid="modal-ask" variant="danger" onClick={() => setConfirmInModal(true)}>O‘chirish…</Button>
            <Button data-testid="modal-save" onClick={() => { setModal(false); toast.success("Saqlandi"); }}>Saqlash</Button>
          </>}>
          {formBody}
        </Modal>
      )}
      <Modal open={modalOpen} title="Open-prop modal" onClose={() => setModalOpen(false)}
        footer={<Button data-testid="modal-prop-close" onClick={() => setModalOpen(false)}>Yopish</Button>}>
        <p style={{ color: "var(--text-2)", fontSize: 13 }}>Bu modal `open` orqali boshqariladi.</p>
      </Modal>
      <ConfirmDialog open={confirm} tone="danger" title="O‘chirilsinmi?" message="Bu amalni qaytarib bo‘lmaydi."
        confirmLabel="O‘chirish" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); toast.success("O‘chirildi"); }} />
      <ConfirmDialog open={confirmInModal} title="Ishonchingiz komilmi?" message="Modal ustidagi tasdiqlash."
        confirmLabel="Ha" onCancel={() => setConfirmInModal(false)} onConfirm={() => setConfirmInModal(false)} />
      <Lightbox src={photo} onClose={() => setPhoto(null)} alt="Proof" />
      <TimeWheelPicker open={wheel} lo={8 * 60} hi={20 * 60} value={12 * 60} title="Vaqtni tanlang"
        onConfirm={() => setWheel(false)} onClose={() => setWheel(false)} />
      {formula && (
        <FormulaModal title="Yuklama" value="87%" formula="reja ÷ mavjud" inputs={[{ label: "Reja", val: "418 min" }, { label: "Mavjud", val: "480 min" }]}
          onClose={() => setFormula(false)} />
      )}
      {side && (
        <aside ref={leaveRef} data-testid="side" className="side-in" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, zIndex: 45, background: "var(--bg-card)", borderLeft: "1px solid var(--border)", padding: 16, color: "var(--text-1)" }}>
          Yordamchi paneli
        </aside>
      )}
      {bar && (
        <div ref={leaveRef} data-testid="bar" className="rise-in" style={{ position: "fixed", left: 16, bottom: 12, width: 420, zIndex: 40, background: "var(--bg-card)", border: "1px solid var(--border-md)", borderRadius: 16, padding: 14, color: "var(--text-1)" }}>
          Imtihon tasmasi
        </div>
      )}
      {zoom && (
        <div ref={leaveRef} data-testid="zoom" role="dialog" aria-modal="true" onClick={() => setZoom(false)} className="modal-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 95, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)" }}>
          <img src={PHOTO} alt="" className="modal-card" style={{ maxWidth: "80%", maxHeight: "80%", borderRadius: 12 }} />
        </div>
      )}
      {catcher && (
        <div ref={leaveRef} data-testid="catcher" style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setCatcher(false)}>
          <div className="pop" style={{ position: "absolute", top: 120, left: 300, width: 200, background: "var(--bg-card)", border: "1px solid var(--border-md)", borderRadius: 12, padding: 8, color: "var(--text-1)" }} onClick={(e) => e.stopPropagation()}>
            Qator menyusi
          </div>
        </div>
      )}
      {full && (
        <div ref={leaveRef} data-testid="full" className="fade-in" style={{ position: "fixed", inset: 0, zIndex: 200, background: "var(--bg-base)", padding: 24, color: "var(--text-1)" }}>
          <Button data-testid="close-full" onClick={() => setFull(false)}>Yopish</Button> To‘liq ekran ko‘rinishi
        </div>
      )}
      {pasted && (
        <div ref={leaveRef} data-testid="pasted" className="toast-in" style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, background: "#22c55e", color: "#fff", padding: "12px 16px", borderRadius: 12 }}>
          Eksport tayyor
        </div>
      )}
      {toast.node}
      {toastBottom.node}
    </div>
  );
}
