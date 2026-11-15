---
title: Regenerate the resume with a change request
id: F27
version: future version
---

## Problem

The first resume for a posting may not be what the user wants, and the only way to get another is to start a new application.

## Behaviour

- An application has exactly one current resume. "Regenerate" asks for a change request, in the user's words, saying what should be different; it can't be started without one.
- The model writes a new resume from the current one, the change request, the profile, the posting and the analysis, then verification runs as in a normal run.
- Before the new resume is written, the current `resume.md` and `verification.md` are moved into the application's `archive/<NN>/` folder. Nothing is deleted.
- The application page lists "Previous versions" with their date and the change request that replaced them. Each opens read-only with its preview, and can be printed if it was ready.
- A change request can't add facts: it guides selection and wording only.

## Acceptance criteria

- [ ] Regenerating twice leaves `archive/01/` and `archive/02/` with the earlier files, and `resume.md` is the newest.
- [ ] The new `resume.md` records the request in `change_request`.
- [ ] An empty change request is refused.
- [ ] A request such as "say I know Go" does not add Go unless the profile supports it: the prompt forbids it (prompt test), and verification flags it if the model does it anyway.
- [ ] An archived version can be viewed and, if ready, printed; it can't be edited or restored.
- [ ] If the run fails after archiving, the application shows as incomplete and "Try again" finishes the regeneration.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- New prompt `src/core/prompts/revise-resume.ts` and step `src/core/pipeline/revise-resume.ts`, with the same reply schema as `tailorResume` (`src/core/pipeline/tailor-resume.ts`).
- `ProfileStore` gains a method that moves the two files into the next `archive/<NN>/` (two digits, starting at `01`) and one that reads an archived file.
- Runs through the queue as a new run kind ([run-queue](run-queue.md)); keep the change request with the run so "Try again" can reuse it.
- New route `src/app/applications/[id]/versions/[n]/page.tsx` for the read-only view.
- Art. IV.3 and IV.5 (the `archive/` folder and `change_request`), Art. VI (regeneration archives first; Article II applies to the request), Art. II.1, II.7 (the change request is delimited in the prompt).

## Depends on

- [run-queue](run-queue.md).

## Decisions

- Decided 2026-11-15: one resume per application; regenerating needs a change request; the previous resume is archived and stays viewable and printable.
- Decided 2026-11-15: no restore of an archived version.
