---
title: Edit the posting or add a note before starting a run again
id: F52
version: next version
reported: 2026-11-17
---

## Problem

The user cancels a generation so it "can be restarted with something edited" ([runs-list-changes](runs-list-changes.md)). "Try again" today starts the run again with the same posting and nothing else.

## Behaviour

- "Try again" on a cancelled run opens a dialog with two fields: the posting's text, filled with the current text and editable, and an optional note for the model. "Start" queues the run; "Cancel" closes the dialog and changes nothing. (Whether failed runs get the same dialog: see Decisions.)
- An edited posting text replaces the posting: the body of `job.md` once the application exists, otherwise the text the run keeps in memory. Pressing "Start" is the user's confirmation (Art. IV.8); the write keeps the frontmatter and is atomic. The run then starts again from the analysis, because the saved analysis was made from the old text.
- A note is given to the model for this run, inside its own delimited block (which steps it reaches: see Decisions; the suggestion is the analysis and the resume). It can steer what is chosen and how it is worded; it can never add a fact the profile doesn't hold (Art. II.1), and the prompt says so. Where the note is kept: see Decisions.
- With neither field changed, the run starts as "Try again" does today.

## Acceptance criteria

- [ ] The dialog shows the current posting text and an empty note; "Cancel" changes nothing.
- [ ] An edited text is saved and the run restarts from the analysis; an unchanged text with a note continues from the first step that has no saved output.
- [ ] The note reaches the prompts decided under Decisions inside its own block, with the rule that it adds no facts; tested with the model mocked.
- [ ] Another profile's runs and applications can't be restarted this way (Art. III.7).
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [try-again-failed-run](try-again-failed-run.md) describes the dialog.

## Technical notes

- "Try again" on a run without an application: `POST /api/runs/[runId]` and `retry` in `src/app/runs.ts`; on an application: `POST /api/applications/[id]`. Both need the edited text and the note.
- The steps and what each saves: `src/core/pipeline/run.ts`; prompts in `src/core/prompts/` (`analyse-posting.ts`, `tailor-resume.ts`), one per step (Art. V.7).
- The posting's text is never logged, listed or streamed (Art. III.4); the note follows the same rule.
- The dialog is `src/components/ui/dialog.tsx`; icons come through the app's icon component ([runs-list-changes](runs-list-changes.md)).

## Depends on

- [runs-list-changes](runs-list-changes.md): the X that cancels a waiting or running generation.
- [english-only-resumes](english-only-resumes.md): the dialog has no language field.

## Decisions

- Decided 2026-11-17 (the user): "The user can edit the posting text only, or add a note for the model."
- Not ready until answered in `OPEN-QUESTIONS.md`: where the note is kept and which steps it reaches, and whether failed runs open the same dialog.
