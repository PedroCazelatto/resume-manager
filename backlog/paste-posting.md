---
title: Paste the job posting
id: F09
version: implemented
---

## What it does

- A text area on the home page takes the posting's text, up to 50,000 characters.
- The text is saved as the body of `job.md`, with `source: paste`.
- An empty posting or one over the limit is refused with a message before any model call.

## Where it lives

- `src/components/new-application-form.tsx`.
- `src/app/api/applications/route.ts`: validation and the limit (`MAX_POSTING_CHARS`).
- `src/core/pipeline/run.ts`: writes `job.md`.

## Tests

- `src/core/pipeline/run.test.ts`, `src/core/pipeline/analyse-posting.test.ts`.

## Rules it follows

- Art. II.7 (the posting is untrusted input, delimited in every prompt).
