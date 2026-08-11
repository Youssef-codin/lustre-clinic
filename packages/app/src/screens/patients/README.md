# `screens/patients/`

The Patients cluster: the list, the search over it, one patient's record, and
the clinic's own questions on that record.

```
PatientsCluster        list ⇄ record; stands in for a navigator
├── PatientListScreen  search + results, over `patient.search`
├── PatientRecordScreen  visits + details, over `patient.byId`
└── QuestionnaireSheet   answering the clinic's questions
```

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
an answer, `CustomAnswerControl` edits one, and neither knows anything else.

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
| Saving | `ActionBar` spins, the sheet refuses to close, back is disabled |
| Failed save | The sheet stays open with every draft intact and a `Callout` saying why |

Balances on the list are a **separate query** on purpose: a patient list that
cannot render until the money answers is a patient list that is down whenever
the money is. If it fails, the rows lose their amounts and nothing else.

## Seeing the failure states

`_LocalPatientsApi` answers on a delay, so loading and pending states are real
rather than theoretical. Two strings force the failures:

- search for `!fail` — the list's error and retry
- save an answer containing `!fail` — the write failure, with the drafts kept

Also seeded: a patient who has never been asked anything (`Karim Doss`), one
whose stored answer the questionnaire no longer accepts (`Youssef Anwar`), one
holding an answer to a deactivated question (`نور الهدى عبد الرحمن`), one with a
`date` answer that renders read-only, and one with no visits at all.
