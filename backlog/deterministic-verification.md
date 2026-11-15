---
title: Check names, dates and numbers
id: F15
version: implemented
---

## What it does

- Code checks that every employer, institution, date and number in the resume appears in the profile files that item cites.
- An item that cites no file, or a file that isn't in the profile, is a failure too.
- Skills carry no sources, so their numbers are checked against the whole profile; contact numbers against `personal.md`.
- `1,500`, `1.500` and `1500` count as the same number.
- Failures are saved in `verification.md` and listed on the application page. The check runs again every time the resume is saved.

## Where it lives

- `src/core/verification/checks.ts`: `checkResume`, `numbersIn`.
- `src/core/verification/schema.ts`: `verificationSchema`.
- `src/core/verification/update.ts`: `withChecks` (keeps dismissals on a re-check).
- `src/components/verification-view.tsx`.

## Tests

- `src/core/verification/checks.test.ts`, `src/core/verification/update.test.ts`.

## Rules it follows

- Art. II.5 (deterministic checks; failures shown, never silently fixed).
- Art. II.4 (traceability).

## Notes

- Numbers written as words are not caught here; the model review is told to check them (see [catch-number-words](catch-number-words.md)).
