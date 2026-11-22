---
title: Save every run in its own folder
id: F25
version: implemented
---

## What it does

- Each application is saved in `applications/<uuid>/` inside the profile, named by a random lowercase UUID, as `job.md`, `analysis.md`, `resume.md` and `verification.md` ([application-uuids](application-uuids.md)). Every application gets a new folder, so nothing is overwritten.
- The folder and `job.md` are made before the model runs: when a link's fetch starts, or when an Indeed link or pasted text is added.
- `job.md` holds the posting's `url`, its `source` (the job platform: "LinkedIn", "Indeed", otherwise the link's host name without `www.`), the job's details (`title`, `company`, `company_url`, `location`, `salary`, `work_model`, `hours`) as the page and then the analysis give them, `fetched_at`, `language`, and `archived_at` while it is archived; the posting's text is the body ([job-posting-details](job-posting-details.md)). `title` replaced `role`, and an older `job.md` is still read until its one-time update.
- Applications saved before 2026-11-21 are named `<YYYY-MM-DD>-<company>-<role>`; they still list and open until the user confirms their one-time update, which renames them to UUIDs.
- The application page is `/applications/<folder name>` and always reads from the selected profile.

## Where it lives

- `src/core/application/folder.ts`: names, IDs and the file list.
- `src/core/application/schemas.ts`: `jobSchema`, `job.md`'s fields. `src/core/application/job.ts`: reading them, an older file's included ([job-posting-details](job-posting-details.md)).
- `src/adapters/profile-store.ts`: `createApplication`, `listApplications`, `readApplicationFile`, `addApplicationFile`, `replaceApplicationFile`, `deleteApplication`, `renameApplication`.
- `src/app/folders.ts`: makes a new application's folder and writes its `job.md` before the model runs.
- `src/app/applications/[id]/page.tsx`.

## Tests

- `src/core/application/folder.test.ts`, `src/adapters/profile-store.test.ts`.
- `src/core/application/schemas.test.ts`, `src/core/application/job.test.ts`: `job.md`'s fields, old and new.

## Rules it follows

- Art. IV.3–IV.4 (layout and naming), Art. IV.5 (`job.md`'s fields), Art. IV.8 (atomic writes, no overwrite), Art. III.7.
- Art. V.3: the UUID is made outside core and handed in.

## Notes

- Decided 2026-11-17: application folders are named by a UUID instead of `<YYYY-MM-DD>-<company>-<role>` (constitution Art. IV.3–4, version 11.0.0); see [application-uuids](application-uuids.md).
