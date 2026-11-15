---
title: Application history
id: F26
version: future version
---

## Problem

Past applications can only be found as folders on disk or by their URL.

## Behaviour

- The home page lists the selected profile's applications under the new-application form: company, role, date, and status.
- Status is one of: incomplete (no resume or no verification yet), draft, ready, or "has problems" when a file is invalid.
- Newest first. Each row opens the application's page.

## Acceptance criteria

- [ ] Every folder under the profile's `applications/` appears once.
- [ ] A folder with an invalid `job.md` is listed as "has problems" instead of breaking the page.
- [ ] With no applications, the section says so.
- [ ] Another profile's applications never appear.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- `ProfileStore` gains `listApplications(slug)`, returning the folder names.
- Deriving a row (company, role, date, status) from `job.md` and `resume.md` is a pure function in `src/core/application/` with unit tests; the date comes from the folder name.
- New component in `src/components/`, rendered by `src/app/page.tsx`.
- Art. III.7, Art. IV.6 (invalid files are reported, never skipped silently).

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: on the home page, not a separate page.
