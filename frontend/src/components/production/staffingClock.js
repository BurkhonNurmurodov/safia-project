// Every instant the staffing proof serves is the plant's wall clock
// ("2026-10-05T09:40+05:00"). Sliced, never parsed: `new Date` would move it
// into the BROWSER's zone.
export const hhmm = (iso) => (iso ? iso.slice(11, 16) : "");
export const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
