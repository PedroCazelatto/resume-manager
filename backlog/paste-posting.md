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

## Notes

- Decided 2026-11-17: no character limit on pasted text, as for fetched text ([link-handling-changes](link-handling-changes.md)).
- Decided 2026-11-17: a pasted posting always has its link ("won't exist" without one), so `job.md` always has a `url` ([link-handling-changes](link-handling-changes.md), [job-posting-details](job-posting-details.md)).
- Decided 2026-11-17: pasting is a last resort (the user: "The pasting of a posting is a last resort option. I don't want to use it."). Decided the same day: the form's "Paste text" tab is removed; the text is pasted only on a row whose fetch failed, Indeed included ([runs-list-changes](runs-list-changes.md), [home-applications-table](home-applications-table.md)).
