# `screens/patients/`

The Patients cluster: the list, the search over it, one patient's record, and
the one form that both registers a patient and corrects one.

```
PatientsCluster          list ⇄ record ⇄ editor; stands in for a navigator
├── PatientListScreen    browse + search, over `patient.recent` / `patient.search`
├── PatientRecordScreen  visits + details, over `patient.byId`
└── PatientEditScreen    basics + the clinic's questions, over `patient.create` / `patient.update`
```

The record is the cluster's screen wherever it is asked for. The shell owns that
one crossing route: `PatientsCluster` takes an `open` request, and anything
outside the tab — the doctor's day view, off an appointment — asks the shell
rather than drawing its own copy inside its own tab, so the tab bar moves to
Patients with the screen.

The editor is reached from both of the other two — `New patient` on the list,
the record bar's pencil and the Details tab's `Edit` — and returns to whichever
asked for it. Saving does not go back: registering someone lands on the record
that now exists, and correcting someone lands on the record with the correction
on it.

The bar's pencil is where `patient-view.html` draws a `⋯`; that departure is
[`BLOCKED.md`](../../../../../BLOCKED.md) *Patient editor* 6, and it goes back to
`⋯` when there is a second action to put in the menu.

Everything imports from frozen `ui/` and `theme/` and edits neither (§10). What
was missing is listed in [`BLOCKED.md`](../../../../../BLOCKED.md) — chiefly the
tRPC client and a navigator, both stood in for locally under a `_Local` name.

## Custom fields

The one thing worth reading before changing anything here.

Custom questions are **dentist-defined**. They live in `custom_questions`, their
answers live in `patients.custom` keyed by `custom_questions.key`, and the same
codebase runs a second clinic with a different list. So nothing in this cluster
names a question, groups them, or special-cases one: a question is a `label`, a
`kind` and a `key`, and the record renders whatever `customQuestion.list`
returns, in the order it returns it.

`components/customFields.ts` is where every branch on `kind` lives — one file,
four kinds, and the seam where `date` drops in (§7.9). `CustomAnswerRow` shows
an answer, `AnswerEditor` edits one, and neither knows anything else.

**A draft is a string for every kind, boolean included.** A yes/no question has
three states and not two — yes, no, and never asked — and the design draws
exactly that, the Yes/No pair with neither half filled. A draft that could only
be `true | false` would answer "no" on the patient's behalf the moment the
editor opened, and `questionnaireGaps` counts an absent key as a gap. `''` is
the third state, on the way in and on the way out.

**Nothing is ever deleted.** §7.8: questions deactivate. A deactivated question
is not in `customQuestion.list`, so it does not draw a row and its key is not in
the patch a save sends — the answer stays in `patients.custom` untouched and
comes back the day the question is reactivated. The record says so out loud
when a patient has answers behind questions the clinic no longer asks.

**A save sends only what changed.** `patient.update` merges a partial `custom`
patch and validates only the keys it was sent. That is what lets a record outlive
the questionnaire it was filled in on: a `select` option removed in 2026 does
not block correcting an answer given in 2024. `questionnaireGaps` from
`patient.byId` is how the record knows what is still to ask — including an
answer today's questionnaire would no longer accept.

## The editor

`patientForm.ts` holds everything the editor decides; the screen above it is
layout. One form shape for both jobs, because the design draws one screen — what
differs is only what a save sends, and that asymmetry is the server's own:

| | `patient.create` | `patient.update` |
| --- | --- | --- |
| `custom` | the whole form, `validateIntake` | a patch, `validatePatch` |
| A required question left blank | refuses the save | does not hold it back |
| What is sent | everything answered | only what moved |

The second row is the one worth keeping: blocking Save on a question nobody has
answered would stop the secretary correcting an unrelated phone number, which is
the same reason the record can outlive its questionnaire.

**Age is written as a date of birth.** The design's basics row is `Age · sex` and
holds a whole number; the server has no age column — `birth_date` is the fact and
`age` is derived from it. So an age of 34 is written as 1 January of the year that
reads back as 34, and `birthDate` is only ever sent when the age on screen differs
from the age the record arrived with — a patient booked in through the day cluster,
which asks for the real date, never has it flattened by an editor opened for their
phone number. See [`BLOCKED.md`](../../../../../BLOCKED.md).

## Arabic

Arabic and Latin names sit in one list and Arabic and Latin question labels sit
in one card. No component here sets a font face; `<Text>` detects the script per
string (§6). The one place a face is forced is `_LocalMoneyValue`, which pins
mono so `ج.م` cannot drag the digits beside it onto the Naskh face and out of
tabular alignment.

Layout uses logical properties throughout (`paddingHorizontal`, `gap`,
`alignItems: 'flex-end'`), which `theme/tokens.test.ts` enforces. Mirroring
itself waits on `I18nManager.allowRTL` in the app shell.

## States

Every list has loading and error; every mutation has a pending state.

| | |
| --- | --- |
| First load | Skeleton rows at the row's own height, so nothing jumps |
| Failed first load | `EmptyState` with the reason and a Retry |
| Failed refresh over data we have | `Banner` — the list is stale, not gone |
| Empty | `EmptyState`, worded differently for "no patients" and "no matches" |
| Saving | The save button spins and Cancel goes away, so an edit is never abandoned mid-flight |
| Failed save | The editor stays up with every field intact and a `Callout` saying why |
| Not yet saveable | The button counts what is owed, and each owed thing carries a `due` label |
| Typed and wrong | The label goes `due` at once; the sentence waits until the field is left |

The last row is a timing rule, and it is the one worth stating: a message that
appears on every keystroke is on screen for the whole time it takes to type an
email and gone only at the end, which is when it was never needed. So the label
marks the row immediately — the footer must never count something owed with
nothing on screen saying which row it means — and the sentence arrives on blur,
then stays live and clears the moment the value is sound.

Balances on the list are a **separate query** on purpose: a patient list that
cannot render until the money answers is a patient list that is down whenever
the money is. If it fails, the rows lose their amounts and nothing else.

## Seeing the failure states

The cluster runs against the real tRPC client — `_LocalPatientsApi` and its
`!fail` strings are gone (BLOCKED.md, *Patient record*). The failures are now
produced by the thing that actually causes them at the clinic: stop the server
and every screen here takes its offline path, which is the one the desk sees
during a power cut. `patient.search` for a term nothing matches gives the empty
state, and `packages/server/scripts/seed.ts` is what decides which patients
exist to look at.

The states worth seeding a record for, because no other route reaches them: a
patient never asked anything (every question a gap), one whose stored answer the
questionnaire no longer accepts (`answer_no_longer_valid`), one holding an
answer to a deactivated question (hidden but kept, §7.8), one with a `date`
answer that renders read-only, and one with no visits at all.
