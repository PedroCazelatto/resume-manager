---
title: Approve or reject implied skills
id: F16
version: implemented
---

## What it does

- A skill the profile implies but doesn't state is listed with its source files and a reason that quotes them.
- Each source file opens a dialog with that file's current text from the selected profile, as in the Sources list ([show-line-sources](show-line-sources.md)): a file that is no longer in the profile is shown as missing and can't be opened, and the names are plain text when the profile has problems.
- It stays out of the rendered resume until approved; rejected ones never appear.
- Approve and Reject buttons sit on each one, and the decision can be changed.
- A reply where an implied skill is named differently in the skills list is rejected, so a pending skill can't slip into the resume under another spelling.

## Where it lives

- `src/core/pipeline/tailor-resume.ts`: collects inferences as `pending` and rejects mismatched names.
- `src/core/resume/render.ts`: hides skills that are pending or rejected.
- `src/components/resume-view.tsx`: `InferenceList`.
- `src/components/source-list.tsx`: `SourceFiles`, the file names and the dialog, shared with the Sources list.
- `src/app/applications/[id]/page.tsx`: sends the text of the files the implied skills cite, with `citedFileTexts` from `src/core/resume/sources.ts`.
- `src/app/applications/[id]/actions.ts`: `decideInference`.

## Tests

- `src/core/pipeline/tailor-resume.test.ts`, `src/core/resume/render.test.ts`, `src/app/applications/[id]/actions.test.ts`.
- `src/core/resume/sources.test.ts`: the files only implied skills cite are returned, a missing one as `null`.

## Rules it follows

- Art. II.3 (implied skills are flagged, approved by the user, and never in a PDF while pending).

## Notes

- Decided 2026-11-16: each implied skill's source files are clickable and open the dialog the Sources list uses.
