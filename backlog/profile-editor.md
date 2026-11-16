---
title: Edit profile files in the app
id: F05
version: future version
---

## Problem

Profile files are edited in an external editor.

## Behaviour

- A "Profile" page lists the selected profile's files by kind.
- Any file opens in a text editor showing its full Markdown (frontmatter and body). Saving validates it with the same rules as the home page; an invalid file shows its problems and is not saved.
- "Add" creates a new item (job, degree, project, certification, extra): pick the kind, fill its fields in a form, and the file is created with the right name.
- An item can be deleted after a confirmation. The four required files can't be deleted.
- Applications and imports are not shown here.

## Acceptance criteria

- [ ] Saving a valid edit changes only that file, and unknown frontmatter fields are kept.
- [ ] An invalid edit is rejected with the field and the reason, and the file on disk is unchanged.
- [ ] A new job with company "Acme", role "Developer" and start `2024-03` is created as `experience/2024-03-acme-developer.md`.
- [ ] Delete asks for confirmation and removes exactly one file.
- [ ] A path outside the profile layout is refused by the server.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- `ProfileStore` already has `replaceProfileFile` (atomic, replaces an existing file; added by [write-back-implied-skills](write-back-implied-skills.md)). It gains `readProfileFile`, a way to create a new file, and `deleteProfileFile`, all limited to paths `profileFileKind` accepts (`src/core/profile/validate.ts`).
- File naming for new items as a pure function in `src/core/profile/`, following Art. IV.4.
- Validation reuses `parseProfileFile`.
- New route `src/app/profile/page.tsx`, with a sidebar entry once [visual-pass](visual-pass.md) exists.
- Art. IV.6–IV.8 (validation, unknown fields kept, atomic writes, delete only after confirmation), Art. III.7.

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: edit, add and delete.
