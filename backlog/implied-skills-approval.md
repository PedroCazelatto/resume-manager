---
title: Approve or reject implied skills
id: F16
version: implemented
---

## What it does

- A skill the profile implies but doesn't state is listed with its source files and a reason that quotes them.
- It stays out of the rendered resume until approved; rejected ones never appear.
- Approve and Reject buttons sit on each one, and the decision can be changed.
- A reply where an implied skill is named differently in the skills list is rejected, so a pending skill can't slip into the resume under another spelling.

## Where it lives

- `src/core/pipeline/tailor-resume.ts`: collects inferences as `pending` and rejects mismatched names.
- `src/core/resume/render.ts`: hides skills that are pending or rejected.
- `src/components/resume-view.tsx`: `InferenceList`.
- `src/app/applications/[id]/actions.ts`: `decideInference`.

## Tests

- `src/core/pipeline/tailor-resume.test.ts`, `src/core/resume/render.test.ts`, `src/app/applications/[id]/actions.test.ts`.

## Rules it follows

- Art. II.3 (implied skills are flagged, approved by the user, and never in a PDF while pending).
