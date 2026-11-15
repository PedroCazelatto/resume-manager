---
title: Model review of every claim
id: F17
version: implemented
---

## What it does

- A model call checks each statement of the resume (summary, each skill, each item's header, each bullet) against the profile files it cites and lists the ones it can't support, each with a one-sentence reason.
- Implied skills are left out of the review: the user decides those.
- Each failure can be dismissed as a false alarm and restored; a dismissal is kept when the same claim is flagged again.
- "Verify again" reruns both checks after an edit.

## Where it lives

- `src/core/verification/claims.ts`: splits the resume into claims.
- `src/core/prompts/review-resume.ts`, `src/core/pipeline/review-resume.ts`.
- `src/core/verification/update.ts`: `withFullVerification`.
- `src/app/applications/[id]/actions.ts`: `setFailureDismissed`, `verifyResume`.
- `src/components/verification-view.tsx`.

## Tests

- `src/core/pipeline/review-resume.test.ts`, `src/core/verification/update.test.ts`, `src/app/applications/[id]/actions.test.ts`.

## Rules it follows

- Art. II.5 (model-based review, dismissals recorded, review re-run on request).
- Art. V.6 (low temperature for verification).
