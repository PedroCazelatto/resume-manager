---
title: Save every run in its own folder
id: F25
version: implemented
---

## What it does

- Each application is saved in `applications/<uuid>/` inside the profile, named by a random lowercase UUID, as `job.md`, `analysis.md`, `resume.md` and `verification.md` ([application-uuids](application-uuids.md)). Every application gets a new folder, so nothing is overwritten.
- The folder and `job.md` are made before the model runs: when a link's fetch starts, or when an Indeed link or pasted text is added.
- Applications saved before 2026-11-21 are named `<YYYY-MM-DD>-<company>-<role>`; they still list and open until the user confirms their one-time update, which renames them to UUIDs.
- The application page is `/applications/<folder name>` and always reads from the selected profile.

## Where it lives

- `src/core/application/folder.ts`: names, IDs and the file list.
- `src/adapters/profile-store.ts`: `createApplication`, `listApplications`, `readApplicationFile`, `addApplicationFile`, `replaceApplicationFile`, `deleteApplication`, `renameApplication`.
- `src/app/folders.ts`: makes a new application's folder and writes its `job.md` before the model runs.
- `src/app/applications/[id]/page.tsx`.

## Tests

- `src/core/application/folder.test.ts`, `src/adapters/profile-store.test.ts`.

## Rules it follows

- Art. IV.3–IV.4 (layout and naming), Art. IV.8 (atomic writes, no overwrite), Art. III.7.
- Art. V.3: the UUID is made outside core and handed in.

## Notes

- Decided 2026-11-17: application folders are named by a UUID instead of `<YYYY-MM-DD>-<company>-<role>` (constitution Art. IV.3–4, version 11.0.0); see [application-uuids](application-uuids.md).
