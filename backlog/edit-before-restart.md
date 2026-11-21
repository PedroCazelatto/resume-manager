---
title: Edit the posting or add a note before starting a run again
id: F52
version: future version
reported: 2026-11-17
---

## Problem

The user cancels a generation so it "can be restarted with something edited" ([runs-list-changes](runs-list-changes.md)). "Try again" today starts the run again with the same posting and nothing else.

## Behaviour

- **"Try again" starts at once**, on cancelled and failed runs, as it does today. To change something first, the user presses "Edit", then "Try again".
- **An "Edit" button** sits next to "Try again" on cancelled runs and failed generations, in the Runs list and on the application page. A row with no posting text yet (its fetch failed, Indeed included) has "Paste the text" ([runs-list-changes](runs-list-changes.md)) instead of "Edit".
- **The dialog** has three fields: the posting's text, filled with the current text and editable; a note for the analysis; and a note for the resume. Both notes are optional and show the notes already saved, if any. "Save" stores the changes without starting the run; "Cancel" closes the dialog and changes nothing.
- **An edited posting text** replaces the posting: the body of `job.md` once the application exists, otherwise the text the run keeps in memory. Pressing "Save" is the user's confirmation (Art. IV.8); the write keeps the frontmatter and is atomic. The next run starts again from the analysis, because the saved analysis was made from the old text.
- **The two notes.** The analysis note reaches only the analysis prompt, and the resume note only the resume (tailoring) prompt, each inside its own delimited block. A note can steer what is chosen and how it is worded; it can never add a fact the profile doesn't hold (Art. II.1), and the prompt says so.
- **Where the notes are kept.** Each note is saved in its own step's file when that step runs: the analysis note as `note` in `analysis.md`, the resume note as `change_request` in `resume.md`. Until its step has written the file, a note is kept in memory with the run or the application, and is lost if the app restarts.
- **Where the run starts again.** A new or changed note for a step whose output is already saved makes the next run start again from that step: an analysis note from the analysis, a resume note from the resume, and every later step runs again. An existing `resume.md` and `verification.md` are first moved into `archive/<NN>/` (Art. VI). With nothing changed, "Try again" continues from the first step that has no saved output, as it does today.

## Acceptance criteria

- [ ] "Try again" starts the run at once, with no dialog.
- [ ] "Edit" appears next to "Try again" on cancelled runs and failed generations, in the Runs list and on the application page, and not on a row whose fetch failed.
- [ ] The dialog shows the current posting text and the notes saved so far; "Cancel" changes nothing; "Save" stores the changes and starts nothing.
- [ ] An edited text is saved as the body of `job.md` (frontmatter kept, written atomically), and the next "Try again" starts from the analysis.
- [ ] A new analysis note makes the next run start from the analysis, and the new `analysis.md` holds it as `note`; a new resume note makes it start from the resume, and the new `resume.md` holds it as `change_request`. An existing `resume.md` and `verification.md` are in `archive/<NN>/` afterwards.
- [ ] Each note reaches only its own step's prompt, inside its own block, with the rule that it adds no facts; tested with the model mocked.
- [ ] With nothing changed, "Try again" continues from the first step that has no saved output.
- [ ] Another profile's runs and applications can't be restarted this way (Art. III.7).
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [try-again-failed-run](try-again-failed-run.md) describes the dialog.

## Technical notes

- "Try again" on a run without an application: `POST /api/runs/[runId]` and `retry` in `src/app/runs.ts`; on an application: `POST /api/applications/[id]`. They start with what "Save" stored: the edited text and the notes waiting for their step. Saving needs its own route or answer, documented in the implemented file.
- `analysisSchema` and `resumeSchema` in `src/core/application/schemas.ts`: `analysis.md` gains an optional `note`; `resume.md` already has `change_request` ([regenerate-application](regenerate-application.md) uses it the same way).
- The steps and what each saves: `src/core/pipeline/run.ts`; prompts in `src/core/prompts/` (`analyse-posting.ts`, `tailor-resume.ts`), one per step (Art. V.7).
- The posting's text is never logged, listed or streamed (Art. III.4); the notes follow the same rule.
- The dialog is `src/components/ui/dialog.tsx`; icons come through the app's icon component ([runs-list-changes](runs-list-changes.md)).

## Depends on

- [runs-list-changes](runs-list-changes.md): the X that cancels a waiting or running generation.
- [english-only-resumes](english-only-resumes.md): the dialog has no language field.
- [home-applications-table](home-applications-table.md) is built before this task: the Runs list becomes the home page's table, so "Edit" goes in the table rows' actions, the unfinished applications listed as cancelled after a restart included.
- Constitution version 12.0.0 (Art. IV.5: `note?` in `analysis.md`, and `change_request?` in `resume.md` also holding the resume note of a run started again).

## Decisions

- Decided 2026-11-17 (the user): "The user can edit the posting text only, or add a note for the model."
- Decided 2026-11-21 (which steps): "Both phases, we can do separate notes for each."
- Decided 2026-11-21 (where): "Yes, the notes need to be saved in the application, not only on memory." Chosen the same day: in each step's own file, `analysis.md`'s `note` and `resume.md`'s `change_request`, kept in memory until that file exists; chosen over two fields in `job.md` or a new `notes.md`.
- Decided 2026-11-21: a new or changed note for a step whose output is saved makes the run start again from that step; an existing `resume.md` is moved to `archive/<NN>/` first (Art. VI).
- Decided 2026-11-21: "Try again starts right away, if the user wants to edit something it needs to click the edit button before." The dialog's "Save" stores the changes without starting the run. "Edit" is on cancelled runs and failed generations; a failed fetch keeps "Paste the text" (chosen the same day).
- Decided 2026-11-21 (the user): moved to the future version; the home page's table is built first, without "Edit".
