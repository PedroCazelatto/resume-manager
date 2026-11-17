---
title: Show where each resume line comes from
id: F18
version: implemented
---

## What it does

- The application page has a "Sources" list that names each item of the resume (the summary, each job, each degree, each project, each certification, each language, each extra) with the profile files it cites.
- Clicking a file opens a dialog with that file's current text from the selected profile.
- A cited file that is no longer in the profile is shown in red as "missing from the profile" and can't be opened.
- An item that cites no file says "No source recorded".
- When the profile can't be loaded because one of its files is invalid, the list still names the files, without links, and says the profile has problems.
- The list is a card in the application page's right-hand column, after "Verification"; below 1280 px the columns stack, so it comes after the preview ([visual-pass](visual-pass.md)).
- The source files of each implied skill, in the "Implied skills" section, open the same dialog and follow the same rules: a missing file is marked and can't be opened, and the names are plain text when the profile has problems.
- Only the text of files this resume cites, in its items or its implied skills, is sent to the browser.
- The printed resume is untouched: the list is outside the preview frame.

## Where it lives

- `src/core/resume/sources.ts`: `listSourcedItems` (the items with their sources) and `citedFileTexts` (the text of the cited files, `null` for a missing one).
- `src/components/source-list.tsx`: `SourceList`, the list, and `SourceFiles`, the file names of one item with the dialog. `InferenceList` in `src/components/resume-view.tsx` uses `SourceFiles` too.
- `src/components/ui/dialog.tsx`: the shadcn/ui dialog.
- `src/app/applications/[id]/page.tsx`: loads the selected profile, prepares the data (the files cited by the resume's items and by its implied skills) and places the list.

## Tests

- `src/core/resume/sources.test.ts`: every kind of item is listed with its sources; an item without sources is kept; only cited files are returned, including the ones only implied skills cite; a missing file is `null`; an empty file is not missing.
- Checked in a browser on 2026-11-16 (headless Chrome) on a scratch copy of the example profile: under the implied skill "Kubernetes", the experience file opens the dialog with its text; an added source that the profile doesn't have is shown as missing and is not a button; with an invalid `personal.md` both names are plain text.

## Rules it follows

- Art. II.4 (traceability shown in the UI).
- Art. III.7 (files are read from the selected profile only).
- Art. V.3 (the list is built in `src/core/`, with no I/O).
- Art. IX.4 (no new dependency: the dialog is built on `@base-ui/react`).

## Notes

- Decided 2026-11-15: a list beside the preview, not clickable lines inside it.
- Decided 2026-11-16: the source files of implied skills are clickable too, with the same dialog. The Sources list keeps its placement.
- Sources are per item in `resume.md` (`sources`, and `summary_sources` for the summary); bullets share their item's sources. Skills and contact details record no sources, so they are not in the list.
- At first the page kept its narrow column and the list was placed outside it, in the free space to the right; [visual-pass](visual-pass.md) gave it a place in the right-hand column.
