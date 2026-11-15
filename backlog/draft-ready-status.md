---
title: Draft and ready status
id: F24
version: implemented
---

## What it does

- A resume is `ready` only when every failed check is fixed or dismissed, every implied skill is approved or rejected, and the model review covers the current content.
- The status is stored in `resume.md` and recomputed after every run, decision, dismissal, save and verification.
- The application page lists what still keeps the resume a draft.

## Where it lives

- `src/core/verification/schema.ts`: `resumeStatus`.
- `src/app/applications/[id]/page.tsx`: `printBlockers`.
- `src/app/applications/[id]/actions.ts`, `src/core/pipeline/run.ts`: where the status is written.

## Tests

- `src/core/verification/schema.test.ts`, `src/app/applications/[id]/actions.test.ts`, `src/core/pipeline/run.test.ts`.

## Rules it follows

- Art. II.3, II.5, VI.7.
