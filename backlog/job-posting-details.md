---
title: Job posting details: title, company, source and more
id: F46
version: next version
reported: 2026-11-17
---

## Problem

A row of the Runs list says little about its job until the analysis is saved: a kind ("New application"), then a link or an application ID. `job.md` records only the company, role, location and language, and `source` says how the text arrived (`url` or `paste`), not where the job was posted. The user wants each row to be a job posting with its details, read from the page's HTML.

## Behaviour

- A job posting has: title, URL, description, company, the company's website, location, salary, source, work model and hours of work.
- `job.md` stores them as constitution Art. IV.5 (version 12.0.0) lists: `title?`, `company?`, `company_url?`, `url`, `source`, `fetched_at?`, `language?`, `location?`, `salary?`, `work_model?`, `hours?`; the description (the posting's text) is the body. `title` replaces `role`. `title`, `company`, `fetched_at` and `language` are optional because [application-uuids](application-uuids.md) writes `job.md` before they are known; this task fills them whenever the page or the posting's text gives them.
- `source` is the job platform, taken from the link: "LinkedIn" for `linkedin.com`, "Indeed" for `indeed.com` and its subdomains, otherwise the link's host name without `www.` (`jobs.example.com`). How the text arrived (fetched, pasted, read by the [browser-extension](browser-extension.md)) doesn't matter. Every posting has a link ([link-handling-changes](link-handling-changes.md)), so `source` is never empty.
- `work_model` is one of `remote`, `hybrid`, `on-site`. `salary` and `hours` are kept as the posting writes them ("€60,000–€70,000 a year", "40 hours a week").
- The details are read from the fetched page's HTML before the model runs. On LinkedIn, the title, company and location come from the page's top-card elements, and the "job criteria" list gives what else it holds. On any page, schema.org `JobPosting` data (`<script type="application/ld+json">`) is used when present: `title`, `hiringOrganization.name`, `hiringOrganization.sameAs` or `hiringOrganization.url` (the company's website), `jobLocation`, `baseSalary`, `employmentType`, `jobLocationType`, `description`. Extract everything the HTML holds about the job.
- A value the page gives is always kept. A detail the page doesn't give may be filled by the model only with what the posting's text states, copied and never guessed; otherwise it stays empty. The model never creates a value (Art. VI.2).
- Old `job.md` files are rewritten to the new fields by the one-time update in [application-uuids](application-uuids.md); until then the app still reads the old fields.
- A row of the Runs list shows the job's title, company (a link to the company's website when the posting gives it), source and state, and the run's kind as a small label ("Try again", "Verify again"); the title links to the application once it exists. The home page's table arranges these ([home-applications-table](home-applications-table.md)). While the title isn't known, the row shows the URL (the address the text was read from, once fetched; see [link-handling-changes](link-handling-changes.md)).

## Acceptance criteria

- [ ] A LinkedIn page (a fixture written by hand with the same structure as the real page) gives title, company and location without the model; the description no longer has the page-title line that [posting-by-url](posting-by-url.md) adds today.
- [ ] A page with `JobPosting` JSON-LD gives every field that data holds; a page without it gives none and the run still works.
- [ ] A value from the page is never replaced by the model's; a detail the page lacks is filled only from the posting's text, and stays empty when the text doesn't state it (the prompt and the reply schema allow an empty value).
- [ ] `job.md` is written with the new fields and validated by its schema; `source` follows the platform rule, tested for LinkedIn, Indeed, a subdomain of Indeed and another site.
- [ ] Old `job.md` files are still read without problems.
- [ ] The Runs list shows title, company, source, state and kind for every run that knows them, and the URL before that.
- [ ] The details read from a page are untrusted input (Art. II.7): they reach the prompt only inside the delimited posting block, and are never rendered as HTML.
- [ ] Extraction and the platform rule are pure core code with unit tests; `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass, with the model mocked.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [posting-by-url](posting-by-url.md) and [application-folders](application-folders.md) describe the new fields.

## Technical notes

- `jobSchema` in `src/core/application/schemas.ts` (`source: z.enum(["url", "paste"])` and `role` today). Every reader of `job.md` and of `role` (the `saved` stream event, notifications in `src/core/runs/notice.ts`, the application page) moves to `title`. The profile's own `role` fields (experience, projects) don't change.
- Extraction: a new pure module next to `src/core/posting/html-to-text.ts` (for example `src/core/posting/details.ts`), on `node-html-parser`, returning the details plus the description text. `htmlToText` drops scripts, so the JSON-LD must be read before that. The adapter (`src/adapters/job-fetcher.ts`) returns the details with the text; `FetchedPosting` in `src/core/posting/job-fetcher.ts` grows accordingly.
- Platform names: next to `isLinkedInUrl` / `isIndeedUrl` in `src/core/posting/sites.ts`.
- Analysis: `analysePostingReplySchema` and the job built in `src/core/pipeline/analyse-posting.ts`, the prompt in `src/core/prompts/analyse-posting.ts`. Details read from the page are passed to the prompt inside the delimited posting block.
- The run must know its details before the analysis ends, so the Runs list can show them: keep them with the run in `src/core/runs/queue.ts` (as `company` and `role` already are, from the `saved` event) and list them in `RunSummary` (`src/app/runs.ts`). Never list or log the posting's text (Art. III.4).
- LinkedIn's page structure is not documented. Check it on one real public job page (at most one request), write the fixture by hand with the same element classes and JSON-LD shape, and don't commit the real page.

## Depends on

- Constitution version 11.0.0 (Art. IV.5 and VI.2).
- [posting-by-url](posting-by-url.md) (implemented).
- [link-handling-changes](link-handling-changes.md): every posting has a link, and the URL a row shows.

## Decisions

- Decided 2026-11-17 (the user): "Lets define the row entity, it is a Job Posting that has title, URL, description, company, location, salary, source, work model and how many hours of work. The row just needs the title, the company and the source, and use the URL while the title is not defined."
- Decided 2026-11-17: "Read company and role from LinkedIn's top-card elements instead. We must extract all the information that we can from the HTML."
- Decided 2026-11-17: "There is no need to save the source as 'url' or 'paste'. Save it as 'LinkedIn' or 'Indeed', or any other platform."
- Decided 2026-11-17, on the details: the title field is renamed `title`; a posting without a link "won't exist"; another site's `source` is "the host name without 'www.'"; work model `remote`, `hybrid` or `on-site`, salary and hours as written; "Always use the information from the page. The model must never create values."; old files: "Rewrite them."; rows show the kind label and link the title to the application, and "the rows need to show the state too".
- Decided 2026-11-17: "The model can fill missing details if they come from the posting text."
- Decided 2026-11-17: the company is a link to the company's website when the posting has it.
- Decided 2026-11-17: application folders are named by a UUID, not by company and title ([application-uuids](application-uuids.md)).
- Decided 2026-11-21 (the user): the real LinkedIn job page checked, with one request, for the top-card structure is https://www.linkedin.com/jobs/view/4488373441/.
- Constitution amended for this task in versions 10.0.0 and 11.0.0 (2026-11-17).
