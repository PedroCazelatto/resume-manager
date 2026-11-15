---
title: Posting analysis and fit/gap
id: F12
version: implemented
---

## What it does

- One model call reads the posting and returns the company, role, location and language, plus every requirement marked must-have or nice-to-have.
- Each requirement is marked matched, partial or missing against the profile, with the profile files that support it and a one-sentence note.
- A reply that marks a match without sources, or a gap with sources, is rejected.
- The result is saved as `job.md` and `analysis.md` and shown as a table on the application page, must-haves first.

## Where it lives

- `src/core/prompts/analyse-posting.ts`, `src/core/pipeline/analyse-posting.ts`.
- `src/core/application/schemas.ts`: `jobSchema`, `analysisSchema`.
- `src/components/analysis-view.tsx`.

## Tests

- `src/core/pipeline/analyse-posting.test.ts`, `src/core/prompts/analyse-posting.test.ts`, `src/core/application/schemas.test.ts`.

## Rules it follows

- Art. II.6 (gaps stay gaps), Art. II.7 (posting delimited as data), Art. V.6 (structured output, low temperature), Art. VI.2–3.
