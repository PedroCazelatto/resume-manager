---
title: Move all data into a local database
id: F43
version: future version
reported: 2026-11-15
---

## Problem

The run queue lives in memory and is lost on restart, and the user wants a database behind the app.

## Behaviour

- Everything the app stores moves into one local SQLite file: profiles, applications (posting, analysis, resume, verification, archived versions), and the run queue with its history.
- On first start with the database, the existing Markdown profiles are imported once. After that the Markdown files are no longer read or written.
- Profiles are edited only in the app.
- The queue survives a restart: waiting runs continue, and a run that was active is marked failed so it can be tried again.

## Acceptance criteria

- [ ] After the import, every profile and application shown before is shown the same, with the same statuses.
- [ ] The import never changes or deletes the Markdown files; it reports each file it could not import.
- [ ] Restarting the app with three waiting runs leaves three waiting runs.
- [ ] The database file is gitignored and never leaves the machine.
- [ ] Core logic still does no I/O: the database sits behind the same `ProfileStore` interface and a new store for runs.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- This task reverses Article IV ("Markdown is the source of truth", "there is no database"). The first step is to write that amendment and get the user's review; nothing else starts before it is approved (Art. X.4, XI).
- Engine: SQLite through Node's built-in `node:sqlite` module, so no new dependency. One file, path from a new `.env` setting.
- Implement a second `ProfileStore` (`src/adapters/`) on SQLite and switch `src/app/profiles.ts` to it; the pipeline, schemas and validation in `src/core/` stay as they are, with each record still validated against its schema when read.
- Store each record's fields as validated JSON plus its body text, keyed by profile and path, so the existing schemas keep working unchanged.
- Replace the in-memory registry of [run-queue](run-queue.md) with a table.
- Write the import as its own command with tests on the example profile.
- This is a large task: split it into task files (amendment, store, import, queue) before starting, each following the rules of Art. X.

## Depends on

- [run-queue](run-queue.md).
- [profile-editor](profile-editor.md): once Markdown is gone, the app is the only way to edit a profile.
- [create-and-rename-profiles](create-and-rename-profiles.md).

## Decisions

- Decided 2026-11-15: the database holds everything, not only app state.
- Decided 2026-11-15: SQLite.
- Decided 2026-11-15: Markdown disappears after a one-time import; no export and no mirror.
