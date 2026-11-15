---
title: Try a failed run again
id: F19
version: implemented
---

## What it does

- Each step's output is saved as soon as it exists, so a failed run can be continued instead of restarted.
- "Try again" appears next to the error on the home form, and on the application page whenever `resume.md` or `verification.md` is missing.
- Steps whose output file exists are skipped: a run with a saved analysis goes straight to the resume; one with a saved resume goes straight to verification.
- The chosen language is remembered in the browser's local storage per application and prefilled next to "Try again".

## Where it lives

- `src/core/pipeline/run.ts`: `runApplication` with `start: { id }`.
- `src/app/api/applications/[id]/route.ts`, `src/app/run.ts`.
- `src/components/retry-run.tsx`, `src/components/use-run.tsx`, `src/components/new-application-form.tsx`.

## Tests

- `src/core/pipeline/run.test.ts` ("trying again").

## Rules it follows

- Art. VI (each step's output is saved; a failed run resumes from the last completed step).
- Art. IV.8 (nothing is overwritten).
