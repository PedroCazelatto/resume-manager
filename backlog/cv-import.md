---
title: Import an existing CV
id: F06
version: future version
---

## Problem

A new profile has to be typed from scratch.

## Behaviour

- Upload a PDF (up to 10 MB). The app extracts its text and the model drafts profile files from it.
- A review screen lists every drafted file with its content in an editable box and a checkbox to include it.
- You choose where the files go: a new profile (you give its name) or the selected profile.
- Nothing is written until you confirm. When a drafted file already exists in the selected profile, each one asks: skip or replace.
- The original PDF is kept in the profile's `imports/` folder.
- A PDF with no text layer (a scan) is refused with a message.

## Acceptance criteria

- [ ] Importing a text PDF produces drafts that all pass the profile schemas.
- [ ] The drafts contain only what the CV says: a unit test with a fake model checks the prompt delimits the CV text as untrusted data and forbids adding facts.
- [ ] Cancelling the review writes nothing.
- [ ] Replacing an existing file needs its own confirmation; skipping leaves it untouched.
- [ ] The PDF is saved as `imports/<YYYY-MM-DD>-<file name>.pdf`.
- [ ] Files over 10 MB and non-PDF files are refused before any processing.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- New adapter `src/adapters/cv-text-extractor.ts` behind the `CvTextExtractor` interface, using the `unpdf` library (approved 2026-11-15).
- New prompt `src/core/prompts/import-cv.ts` and step `src/core/pipeline/import-cv.ts`; the reply schema mirrors the profile schemas (`src/core/profile/schemas.ts`), and code turns it into file sources and names.
- The model call runs as a run in the queue ([run-queue](run-queue.md)) so it never overlaps a generation.
- Creating the new profile uses `createProfile` from [create-and-rename-profiles](create-and-rename-profiles.md); writing files uses `writeProfileFile` from [profile-editor](profile-editor.md).
- Art. II.1 (no invention), Art. II.7 (the CV text is untrusted input), Art. IV.8 (no overwrite without confirmation), Art. III.3–III.4 (the CV never leaves the machine or reaches logs).

## Depends on

- [run-queue](run-queue.md).
- [create-and-rename-profiles](create-and-rename-profiles.md).
- [profile-editor](profile-editor.md).

## Decisions

- Decided 2026-11-15: PDF only; DOCX import is dropped.
- Decided 2026-11-15: `unpdf` for text extraction; 10 MB limit.
- Decided 2026-11-15: into a new profile or the selected one.
