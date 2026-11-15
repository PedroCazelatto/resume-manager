---
title: Guided interview that fills the profile
id: F08
version: future version
---

## Problem

Writing a complete profile is a lot of work, and people forget what they did.

## Behaviour

- On the Profile page, "Interview me" works on one item at a time: pick an existing file or a new item of a kind (a job, a degree, a project, the summary…).
- The model asks one question at a time about that item; you answer in a text box. You can stop asking and go to the draft at any point.
- The model then drafts or updates that one file. The draft is shown for review and editing, and is written only when you confirm.
- Every turn uses the normal model settings, so a turn can take minutes; progress is shown as in a run.

## Acceptance criteria

- [ ] The draft contains only what the answers and the existing file say (prompt test with a fake model).
- [ ] The draft passes the schema of its file kind before it can be saved.
- [ ] Leaving the interview writes nothing.
- [ ] The conversation is not saved anywhere and never reaches logs.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Two prompts under `src/core/prompts/`: one that returns the next question (or says it has enough), one that returns the file draft. Both use structured output.
- The conversation lives in the page's state only.
- Model calls go through the queue ([run-queue](run-queue.md)).
- Saving uses `writeProfileFile` and the validation of [profile-editor](profile-editor.md).
- Art. II.1 (no invention: the user's answers are the only new facts), Art. III.4, Art. IV.6–IV.8.

## Depends on

- [profile-editor](profile-editor.md).
- [run-queue](run-queue.md).

## Decisions

- Decided 2026-11-15: one item at a time, not a whole-profile conversation.
- Decided 2026-11-15: every turn follows `OLLAMA_THINK`; no faster setting for questions.
