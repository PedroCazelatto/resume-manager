---
title: Show where each resume line comes from
id: F18
version: next version
---

## Problem

`resume.md` records the profile files behind every item, but the page doesn't show them.

## Behaviour

- Beside the preview, a "Sources" list names each resume item (the summary, each job, each degree, each project, each certification, each language, each extra) with the profile files it cites.
- Clicking a file opens a dialog with that file's text.
- A cited file that is no longer in the profile is shown as missing.
- The printed resume is untouched.

## Acceptance criteria

- [ ] Every item of the resume appears in the list with its `sources`.
- [ ] The dialog shows the file's current text from the selected profile.
- [ ] Only files cited by this resume are sent to the browser.
- [ ] On a narrow screen the list sits under the preview.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Sources are per item in `resume.md` (`sources`, and `summary_sources` for the summary); bullets share their item's sources.
- New component in `src/components/`; data prepared in `src/app/applications/[id]/page.tsx` from the loaded profile.
- Add the shadcn/ui `dialog` component if it isn't there yet.
- Art. II.4 (traceability shown in the UI), Art. III.7.

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: a list beside the preview, not clickable lines inside it.
