# «Ta'lim» — video lessons

The module's own rules (audience = profiles, reads scoped server-side, the
embed rebuilt on read, watch coverage) are written where they live: the
docstring of `backend/app/routers/education.py`, `models.EducationLesson` and
its neighbours, and `services/education_progress.py`. This file records the
features added on top.

## Lesson labels («Yorliq», 2026-11-24)

The operator: «I have to be able to choose the label for videos — SAP-related
videos get SAP, IMS-related ones IMS, and so on.»

- **One label per lesson**, free text, optional — `education_lessons.label`
  (VARCHAR 60, NULL = no label; `startup.add_education_label`, `run`). A
  lesson with no label is an ordinary state, and every lesson published
  before this has none.
- **There is no table of labels.** The set is READ off the lessons
  (`lessonLabels` in `utils/lessonLabels.js`; the chip and the picker are
  `components/education/LessonLabel.jsx`): a label exists
  while some lesson carries it and is gone with the last one. Nothing to
  create, rename or delete separately.
- **One spelling per label.** A typed label matching an existing one up to
  case is stored in the existing spelling (`routers/education._clean_label`,
  the picker does the same), so «sap» never becomes a second «SAP». The lesson
  being edited is left out of that match, so the ONLY lesson carrying a label
  can still re-case it.
- **The form** (`LessonWizard`, step «Dars») has a «Yorliq» field under the
  title: `StyledSelect` with search — «Yorliqsiz», every label in use
  (archived lessons' included), and a ««X» yorlig'ini qo'shish» row when the
  search text names no label. `createLabel` returning `null` hides that row —
  a prop behaviour `StyledSelect` gained for this.
- **An edit that sends no `label` leaves it alone** (`model_fields_set`): a
  tab opened before labels existed would otherwise wipe the label on every
  save. The current form always sends it; `""` clears it.
- **The grid** shows the label as a neutral chip above the title (a NAME, not
  a status — no traffic light, no gold), the lesson page above its heading,
  and the search matches it. The toolbar carries a `FilterPanel` with ONE
  section, «Yorliq»: «Barcha yorliqlar», the labels of the OPEN tab, and
  «Yorliqsiz» when some lesson there has none. The section is absent while no
  lesson of the tab carries a label, and a remembered pick the tab no longer
  offers is dropped (`education_label` in `usePersistentState`).
- Every viewer is served the label (`_lesson_json` `label`), like the title;
  the «Hisobot» payload carries it per lesson too.
