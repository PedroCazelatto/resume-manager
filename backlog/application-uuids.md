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
- **When the folder is made.** An application's folder and its `job.md` are made as soon as its link's fetch starts, holding the link and `source` ([job-posting-details](job-posting-details.md)); the rest of `job.md` is written as it becomes known (the posting's text as the body, then the details). An Indeed link, which is never fetched ([link-handling-changes](link-handling-changes.md)), gets its folder when it is added. A link still waiting to fetch has no folder. So a failed fetch, a cancelled run and an archived row ([runs-list-changes](runs-list-changes.md)) all have an application, and survive a restart.
- **The X on a fetching link deletes its folder.** The X that removes a link from the fetch queue ([runs-list-changes](runs-list-changes.md) item 2) deletes the folder made when its fetch started, so nothing of the link is left. Clicking the X is the confirmation Art. IV.8 asks for.
- **Pasted text goes into the application.** Pasting the text on a row whose fetch failed (Indeed included) writes it as the body of that application's `job.md`, keeping the frontmatter (Art. IV.7, IV.8).
- **One application per link.** When a link is added again and the profile has an unfinished application with the same link (its fetch or generation failed, or it was cancelled, archived or not), that application starts again, as "Try again" does, and leaves the archived list. This replaces, for those links, the skip rule of [link-handling-changes](link-handling-changes.md) ("A link that is already there is skipped"); a link whose application is waiting, fetching, running or finished is still skipped and named.
- After a restart, an unfinished application is listed as cancelled ([home-applications-table](home-applications-table.md)); nothing starts again by itself.
- The application's date is `job.md`'s `fetched_at`, since the folder name no longer carries it. An application whose text hasn't arrived yet (a fetch that failed or is under way, an Indeed link waiting for its text) has no date until it does.
- Old applications are updated once, after the user confirms it in the app (Art. IV.8). When the selected profile has an old application, the app shows what the update will do, and nothing changes until the user confirms:
  - each old `job.md` is rewritten to the new fields: `role` becomes `title`, and `source` becomes the platform named from its `url` ([job-posting-details](job-posting-details.md));
  - each application whose `job.md` has no `url` (made from pasted text) is deleted, folder and all;
  - each old folder (named `<YYYY-MM-DD>-<company>-<role>`) is renamed to a new random UUID, with everything inside it, its `archive/` included.
- The update keeps every frontmatter field the app doesn't know (Art. IV.7), keeps each body as it is, and writes atomically (Art. IV.8). It touches only the selected profile (Art. III.7).
- Until the user confirms, old applications are still listed and open as before.

## Acceptance criteria

- [ ] A new application's folder is a lowercase UUID, and its page opens at `/applications/<uuid>`.
- [ ] Two applications for the same company and title get two folders.
- [ ] A link's folder and `job.md` appear when its fetch starts, and not while it waits to fetch; an Indeed link's appear when it is added. A failed fetch and a cancelled run are still there after a restart.
- [ ] The X on a fetching link deletes the folder made for it; nothing of the link is left.
- [ ] Pasting the text on a failed fetch writes the body of that application's `job.md` and keeps its frontmatter.
- [ ] Adding a link whose application failed or was cancelled (archived or not) starts that same application again, takes it out of the archived list, and makes no second folder; a link whose application is waiting, fetching, running or finished is skipped and named.
- [ ] The update lists what it will rewrite, rename and delete, changes nothing if the user doesn't confirm, and after confirming leaves only applications with the new fields and a link, each in a folder named by a UUID.
- [ ] Unknown frontmatter fields and every body survive the rewrite; another profile is never touched.
- [ ] The rewrite and the list of changes are pure core code with unit tests on `example-profiles/` data copies; `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] The README's example application folder (under "Your data") is a UUID, updated in the file and left uncommitted for the user's review (Art. XI.5).
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [application-folders](application-folders.md) describes the new names.

## Technical notes

- Folder names come from `applicationFolderName` in `src/core/application/folder.ts`. Core code stays pure (Art. V.3): the UUID is made outside core (for example `crypto.randomUUID()` in `src/app/run.ts`) and handed in, as the clock is.
- Application IDs are checked wherever they arrive from a URL or a request; the check moves from the dated pattern to a UUID.
- `ProfileStore` (`src/adapters/profile-store.ts`) needs deleting an application folder and renaming one, both limited to the selected profile's `applications/` and refusing symlinks and `..`, like `replaceApplicationFile`. A rename is a single `rename` of the folder, so it is atomic (Art. IV.8).
- Finding an application by its link (one application per link) reads the profile's `job.md` files through `ProfileStore`; the matching rule (`jobKey` in `src/core/posting/sites.ts`, the LinkedIn job ID of [link-handling-changes](link-handling-changes.md) included) is a pure function in core next to the skip rule's (`skipKnownLinks` and `savedLinks` in `src/core/posting/known-links.ts`; `enqueueLinks` in `src/app/run.ts` reads the runs and the `job.md` files, through `ProfileStore.listApplications`).
- Every place that shows the date from the folder name moves to `fetched_at`, and copes with an application that has none yet.
- `jobSchema` in `src/core/application/schemas.ts`: `title`, `company`, `fetched_at` and `language` become optional, as in Art. IV.5 (version 12.0.0); every reader of them copes with a missing value.
- The example profile's applications (`example-profiles/`) are updated to the new layout with the change, so tests and test runs use it.

## Depends on

- Constitution version 11.0.0 (Art. IV.3, IV.4).
- [job-posting-details](job-posting-details.md): the new `job.md` fields the rewrite produces.
- [runs-list-changes](runs-list-changes.md) and [link-handling-changes](link-handling-changes.md): the X on the fetch queue, pasting on a failed fetch, Indeed rows and the skip rule this task changes.
- Constitution version 12.0.0 (Art. IV.5: `job.md` is written when the fetch starts, so `title`, `company`, `fetched_at` and `language` are optional and filled once known).

## Decisions

- Decided 2026-11-17 (the user): "The application folder must not be named after title and company because we only have those after the model run, but we may need it before the model. Use an UUID for each application."
- Decided 2026-11-17: old `job.md` files are rewritten to the new fields ("Rewrite them."), and old applications without a link are deleted ("Delete them."). Both happen only after the user's confirmation in the app (Art. IV.8).
- Decided 2026-11-21 (when the folder is made): "Create as soon as it's possible", and "Right after starting the fetch, create the job.md, so anything saved on memory goes to a hard drive." Chosen the same day: when the link's fetch starts, and an Indeed link when it is added; a link waiting to fetch has no folder, and the X on a fetching link deletes its folder, the click being the confirmation (Art. IV.8).
- Decided 2026-11-21: "Yes, the one-time update must rename the old folders."
- Decided 2026-11-21 (`job.md` before its details are known): `title`, `company`, `fetched_at` and `language` become optional, with no new field; the application's date stays `fetched_at`, chosen over adding a `created_at`.
- Decided 2026-11-21 (a link added again whose application failed or was cancelled): the existing application starts again, as "Try again" does, and leaves the archived list ("Queue it on the same application"), chosen over skipping it or making a second application.
- Decided 2026-11-21: after a restart, an unfinished application is listed as cancelled, in the Generating tab, with "Try again"; nothing starts again by itself, and runs stay in memory only (Art. IV.1).
