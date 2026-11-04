// From this shift-day on ПЛАН/ФАКТ on «Zagruzka fayli» are what a person typed
// and nothing else; a SAP upload fills only the «SAP» columns and never touches
// a typed value. The client twin of `pp_calc.TYPED_ONLY_FROM` — change the two
// together. Pages that read the dashboard take `typed_only` off it instead.
export const TYPED_ONLY_FROM = "2026-11-05";

// Does an upload for this day ("YYYY-MM-DD") still replace typed ПЛАН/ФАКТ?
export const uploadReplacesTyped = (iso) => !!iso && iso < TYPED_ONLY_FROM;
