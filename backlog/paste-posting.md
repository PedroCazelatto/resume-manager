---
title: Paste the job posting
id: F09
version: implemented
---

## What it does

- A text area in the "Paste text" tab of the home page's form takes the posting's text, up to 50,000 characters.
- The text is saved as the body of `job.md`, with `source: paste`, and with the `url` when the tab's "Link" field holds one ([posting-by-url](posting-by-url.md)).
- An empty posting or one over the limit is refused with a message before any model call.

## Where it lives

- `src/components/new-application-form.tsx`.
- `src/app/api/applications/route.ts`, with the validation in `src/core/posting/start.ts` (`readNewRunStart`) and the limit in `src/core/posting/job-fetcher.ts` (`MAX_POSTING_CHARS`).
- `src/core/pipeline/run.ts`: writes `job.md`.

## Tests

- `src/core/pipeline/run.test.ts`, `src/core/pipeline/analyse-posting.test.ts`, `src/core/posting/start.test.ts`.

## Rules it follows

- Art. II.7 (the posting is untrusted input, delimited in every prompt).
