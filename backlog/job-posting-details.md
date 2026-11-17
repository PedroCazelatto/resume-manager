---
title: Job posting details: title, company, source and more
id: F46
version: next version
reported: 2026-11-17
---

## Problem

A row of the Runs list says little about its job until the analysis is saved: a kind ("New application"), then a link or an application ID. `job.md` records only the company, role, location and language, and `source` says how the text arrived (`url` or `paste`), not where the job was posted. The user wants each row to be a job posting with its details, read from the page's HTML as far as possible.

## Behaviour

- A job posting has: title, URL, description, company, location, salary, source, work model and hours of work.
- `source` is the job platform: "LinkedIn", "Indeed", or another platform, taken from the posting's link. How text arrived (fetched, pasted, read by the [browser-extension](browser-extension.md)) no longer matters.
- From a link, the details are read from the fetched page before the model runs. On LinkedIn, the title, company and location come from the page's top-card elements, and the "job criteria" list gives the employment type and other facts when present. On any page, schema.org `JobPosting` data (`<script type="application/ld+json">`) is used when present: `title`, `hiringOrganization.name`, `jobLocation`, `baseSalary`, `employmentType`, `jobLocationType`, `description`. Anything the page doesn't hold stays empty.
- The analysis step (Art. VI.2) fills, from the posting's text, the details the page didn't give. A detail the text doesn't state stays empty; nothing is guessed.
- `job.md` stores the details in its frontmatter, and the description stays its body.
- A row of the Runs list shows the job's title, company and source. While the title isn't known, it shows the URL (the address the text was read from, once fetched; see [link-handling-changes](link-handling-changes.md)).

## Acceptance criteria

- [ ] A LinkedIn page (a fixture written by hand with the same structure as the real page) gives title, company and location without the model; its description is the posting's text, without the page title line that [posting-by-url](posting-by-url.md) adds today.
- [ ] A page with `JobPosting` JSON-LD gives every field that data holds; a page without it gives none and the run still works.
- [ ] Pasted text with no link, and a page with no details, get their company, title and the other details from the analysis, or leave them empty.
- [ ] `job.md` holds the new fields, validated by its schema; files written before this task are still read without problems and are never rewritten for it (Art. IV.6–7).
- [ ] The Runs list shows title, company and source for every run that knows them, and the URL before that.
- [ ] The details read from a page are untrusted input (Art. II.7): they go into the prompt only inside the delimited posting block, and are never shown as HTML.
- [ ] Extraction is pure core code with unit tests; `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass, with the model mocked.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [posting-by-url](posting-by-url.md) describes the new extraction.

## Technical notes

- `job.md` schema: `jobSchema` in `src/core/application/schemas.ts` (`source: z.enum(["url", "paste"])` today). The fields are listed in constitution Art. IV.5 and what the analysis extracts in Art. VI.2; both must be amended first, with the user's approval.
- Extraction: a new pure module next to `src/core/posting/html-to-text.ts` (for example `src/core/posting/details.ts`), on `node-html-parser`, returning the details plus the description text. `htmlToText` drops scripts, so the JSON-LD must be read before that. The adapter (`src/adapters/job-fetcher.ts`) returns the details with the text; `FetchedPosting` in `src/core/posting/job-fetcher.ts` grows accordingly.
- Platform names: next to `isLinkedInUrl` / `isIndeedUrl` in `src/core/posting/sites.ts`.
- Analysis: `analysePostingReplySchema` and the job built in `src/core/pipeline/analyse-posting.ts`, the prompt in `src/core/prompts/analyse-posting.ts`. Details already read from the page are passed to the prompt inside the delimited posting block.
- The run must know its details before the analysis ends, so the Runs list can show them: keep them with the run in `src/core/runs/queue.ts` (as `company` and `role` already are, from the `saved` event) and list them in `RunSummary` (`src/app/runs.ts`). Never list or log the posting's text (Art. III.4).
- Folder names stay `<YYYY-MM-DD>-<company>-<role>` (Art. IV.3).
- LinkedIn's page structure is not documented. Check it on one real public job page (at most one request), write the fixture by hand with the same element classes and JSON-LD shape, and don't commit the real page.

## Depends on

- An amendment of constitution Art. IV.5 (the `job.md` row) and Art. VI.2, approved by the user, before any code.
- [posting-by-url](posting-by-url.md) (implemented).
- [link-handling-changes](link-handling-changes.md), for the URL a row shows.

## Decisions

- Decided 2026-11-17 (the user): "Lets define the row entity, it is a Job Posting that has title, URL, description, company, location, salary, source, work model and how many hours of work. The row just needs the title, the company and the source, and use the URL while the title is not defined."
- Decided 2026-11-17: "Read company and role from LinkedIn's top-card elements instead. We must extract all the information that we can from the HTML."
- Decided 2026-11-17: "There is no need to save the source as 'url' or 'paste'. Save it as 'LinkedIn' or 'Indeed', or any other platform."
- Not ready until answered in `OPEN-QUESTIONS.md` ("Job posting details"): the field names, `source` without a link and for other sites, the formats of work model, hours and salary, which value wins when page and model differ, old `job.md` files, and what else a row shows. Also needs the constitution amendment.
