---
title: Name application folders with a UUID, and update old applications
id: F50
version: next version
reported: 2026-11-17
---

## Problem

Application folders are named `<YYYY-MM-DD>-<company>-<role>`, so a folder can only be created after the model has read the company and role. The user wants the application to exist before the model runs, so each application gets a UUID instead (constitution Art. IV.3–4, version 11.0.0). Applications saved before the change use the old folder names and the old `job.md` fields ([job-posting-details](job-posting-details.md)), and the ones made from pasted text have no link.

## Behaviour

- Every new application gets a folder `applications/<uuid>/`, named by a random lowercase UUID. The UUID is the application's ID everywhere: in URLs (`/applications/<uuid>`), in runs, and in the stream's events.
- When the folder is created is not decided yet (see Decisions).
- The application's date is `job.md`'s `fetched_at`, since the folder name no longer carries it.
- Old applications are updated once, after the user confirms it in the app (Art. IV.8). When the selected profile has an old application, the app shows what the update will do, and nothing changes until the user confirms:
  - each old `job.md` is rewritten to the new fields: `role` becomes `title`, and `source` becomes the platform named from its `url` ([job-posting-details](job-posting-details.md));
  - each application whose `job.md` has no `url` (made from pasted text) is deleted, folder and all;
  - whether old folders are renamed to UUIDs is not decided yet (see Decisions).
- The update keeps every frontmatter field the app doesn't know (Art. IV.7), keeps each body as it is, and writes atomically (Art. IV.8). It touches only the selected profile (Art. III.7).
- Until the user confirms, old applications are still listed and open as before.

## Acceptance criteria

- [ ] A new application's folder is a lowercase UUID, and its page opens at `/applications/<uuid>`.
- [ ] Two applications for the same company and title get two folders.
- [ ] The update lists what it will rewrite and delete, changes nothing if the user doesn't confirm, and after confirming leaves only applications with the new fields and a link.
- [ ] Unknown frontmatter fields and every body survive the rewrite; another profile is never touched.
- [ ] The rewrite and the list of changes are pure core code with unit tests on `example-profiles/` data copies; `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [application-folders](application-folders.md) describes the new names.

## Technical notes

- Folder names come from `applicationFolderName` in `src/core/application/folder.ts`. Core code stays pure (Art. V.3): the UUID is made outside core (for example `crypto.randomUUID()` in `src/app/run.ts`) and handed in, as the clock is.
- Application IDs are checked wherever they arrive from a URL or a request; the check moves from the dated pattern to a UUID.
- `ProfileStore` (`src/adapters/profile-store.ts`) needs deleting an application folder, limited to the selected profile's `applications/` and refusing symlinks and `..`, like `replaceApplicationFile`; and renaming one, if old folders are renamed.
- Every place that shows the date from the folder name moves to `fetched_at`.
- The example profile's applications (`example-profiles/`) are updated to the new layout with the change, so tests and test runs use it.

## Depends on

- Constitution version 11.0.0 (Art. IV.3, IV.4).
- [job-posting-details](job-posting-details.md): the new `job.md` fields the rewrite produces.

## Decisions

- Decided 2026-11-17 (the user): "The application folder must not be named after title and company because we only have those after the model run, but we may need it before the model. Use an UUID for each application."
- Decided 2026-11-17: old `job.md` files are rewritten to the new fields ("Rewrite them."), and old applications without a link are deleted ("Delete them."). Both happen only after the user's confirmation in the app (Art. IV.8).
- Not ready until answered in `OPEN-QUESTIONS.md`: when an application's folder is created, and whether old folders are renamed to UUIDs.
