import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useFilters } from "../../context/FilterContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useDragSelect } from "../../hooks/useDragSelect";
import DateRangePicker from "../ui/DateRangePicker";
import SegmentedToggle from "../ui/SegmentedToggle";
import api from "../../utils/api";

export default function GlobalFilters() {
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const {
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    shift, setShift,
    unit, setUnit,
    brigadirIds, setBrigadirIds,
  } = useFilters();

  const [search, setSearch] = useState("");
  const searchRef = useRef(null);

  const { data: allBrigadirs = [] } = useQuery({
    queryKey: ["brigadirs-list"],
    queryFn: () => api.get("/api/managers/all").then(r => r.data),
    staleTime: 300_000,
  });

  // Filter list by selected shift
  const shiftBrigadirs = useMemo(() => {
    if (!shift) return allBrigadirs;
    return allBrigadirs.filter(b => b.shift === shift);
  }, [allBrigadirs, shift]);

  // Auto-remove selected brigadirs that don't belong to the current shift
  useEffect(() => {
    if (!shift || brigadirIds.length === 0) return;
    const validIds = new Set(shiftBrigadirs.map(b => b.manager_id));
    const cleaned = brigadirIds.filter(id => validIds.has(id));
    if (cleaned.length !== brigadirIds.length) setBrigadirIds(cleaned);
  }, [shift]); // eslint-disable-line

  // Filter by search
  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return shiftBrigadirs.filter(b =>
      b.name.toLowerCase().includes(q) ||
      tl(b.name).toLowerCase().includes(q)
    );
  }, [shiftBrigadirs, search, lang]); // eslint-disable-line

  const allChecked   = visible.length > 0 && visible.every(b => brigadirIds.includes(b.manager_id));
  const someChecked  = visible.some(b => brigadirIds.includes(b.manager_id));
  const noneChecked  = !someChecked;

  function toggleBrigadir(id) {
    setBrigadirIds(brigadirIds.includes(id)
      ? brigadirIds.filter(x => x !== id)
      : [...brigadirIds, id]);
  }
  const dragRow = useDragSelect(
    id => brigadirIds.includes(Number(id)),
    (id, value) => setBrigadirIds(prev => {
      const n = Number(id);
      if (prev.includes(n) === value) return prev;
      return value ? [...prev, n] : prev.filter(x => x !== n);
    }),
  );

  function handleSelectAll() {
    if (allChecked) {
      // Deselect all visible
      const visibleIds = new Set(visible.map(b => b.manager_id));
      setBrigadirIds(brigadirIds.filter(id => !visibleIds.has(id)));
    } else {
      // Select all visible (merge with existing)
      const visibleIds = visible.map(b => b.manager_id);
      setBrigadirIds([...new Set([...brigadirIds, ...visibleIds])]);
    }
  }

  const segBtnBase = "px-3 py-1.5 text-xs transition-colors";

  const sectionLabel = (text) => (
    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
      {text}
    </span>
  );

  // Checkbox ref helper for indeterminate state
  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someChecked && !allChecked;
    }
  }, [someChecked, allChecked]);

  return (
    <div className="flex flex-col gap-4">

      {/* ── Shift ── */}
      <div className="flex flex-col gap-2">
        {sectionLabel(t("filter.shift") || "Shift")}
        <SegmentedToggle
          value={shift}
          onChange={setShift}
          options={[[null, t("filter.all") || "All"], [1, "S1"], [2, "S2"]]}
        />
      </div>

      {/* ── Unit ── */}
      <div className="flex flex-col gap-2">
        {sectionLabel(t("filter.unit") || "Unit")}
        <div className="flex rounded-lg overflow-hidden w-fit" style={{ border: "1px solid var(--border-md)" }}>
          {["min", "hrs"].map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={segBtnBase}
              style={unit === u
                ? { background: "var(--brand)", color: "#fff", fontWeight: 600 }
                : { background: "var(--bg-inner)", color: "var(--text-3)" }}
            >
              {u === "min" ? t("general.min") : t("general.hrs")}
            </button>
          ))}
        </div>
      </div>

      {/* ── Date Range ── */}
      <div className="flex flex-col gap-2">
        {sectionLabel(t("filter.dateRange") || "Date Range")}
        <DateRangePicker
          dateFrom={dateFrom}
          dateTo={dateTo}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
        />
      </div>

      {/* ── Brigadir — Google-Sheets-style filter ── */}
      <div className="flex flex-col gap-2">
        {/* Label row */}
        <div className="flex items-center justify-between">
          {sectionLabel(t("filter.brigadir") || "Brigadir")}
          {brigadirIds.length > 0 && (
            <button
              onClick={() => setBrigadirIds([])}
              className="text-[10px] flex items-center gap-0.5 transition-colors hover:text-red-400"
              style={{ color: "var(--text-4)" }}
            >
              <X size={10} />
              {t("filter.clear") || "Clear"}
            </button>
          )}
        </div>

        {/* Filter panel */}
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--border-md)", background: "var(--bg-inner)" }}
        >
          {/* Search row */}
          <div
            className="flex items-center gap-2 px-2.5 py-2"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <Search size={12} style={{ color: "var(--text-4)", flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("filter.searchBrigadirs") || "Search…"}
              className="flex-1 bg-transparent text-xs outline-none min-w-0"
              style={{ color: "var(--text-1)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ color: "var(--text-4)", flexShrink: 0 }}>
                <X size={11} />
              </button>
            )}
          </div>

          {/* Select All row */}
          <label
            className="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none"
            style={{
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allChecked}
              onChange={handleSelectAll}
              className="accent-[#C8973F] flex-shrink-0"
            />
            <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
              {noneChecked
                ? (t("filter.selectAll") || "Select All")
                : allChecked
                  ? (t("filter.deselectAll") || "Deselect All")
                  : `${brigadirIds.length} / ${shiftBrigadirs.length} ${t("filter.selected2") || "selected"}`}
            </span>
            <span className="ml-auto text-[10px]" style={{ color: "var(--text-4)" }}>
              ({visible.length})
            </span>
          </label>

          {/* Brigadir list */}
          <div className="overflow-y-auto" style={{ maxHeight: 180 }}>
            {visible.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-center" style={{ color: "var(--text-4)" }}>
                {search ? (t("filter.noResults") || "No results") : (t("filter.noData") || "No data")}
              </div>
            ) : (
              visible.map(b => (
                <label
                  key={b.manager_id}
                  {...dragRow(b.manager_id)}
                  className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer select-none transition-colors hover:bg-white/5"
                  style={{ color: "var(--text-2)" }}
                >
                  <input
                    type="checkbox"
                    checked={brigadirIds.includes(b.manager_id)}
                    onChange={() => toggleBrigadir(b.manager_id)}
                    className="accent-[#C8973F] flex-shrink-0"
                  />
                  <span className="text-xs truncate">{tl(b.name)}</span>
                  {b.shift && (
                    <span className="ml-auto text-[10px] flex-shrink-0" style={{ color: "var(--text-4)" }}>
                      S{b.shift}
                    </span>
                  )}
                </label>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
