---
title: Save every run in its own folder
id: F25
version: implemented
---

## What it does

- Each run is saved in `applications/<YYYY-MM-DD>-<company>-<role>/` inside the profile, as `job.md`, `analysis.md`, `resume.md` and `verification.md`.
- Company and role are turned into lowercase ASCII kebab-case; a second run with the same name gets `-2`, `-3`…, so nothing is overwritten.
- The application page is `/applications/<folder name>` and always reads from the selected profile.

## Where it lives

- `src/core/application/folder.ts`: names, IDs and the file list.
- `src/adapters/profile-store.ts`: `createApplication`, `readApplicationFile`, `addApplicationFile`, `replaceApplicationFile`.
- `src/app/applications/[id]/page.tsx`.

## Tests

- `src/core/application/folder.test.ts`, `src/adapters/profile-store.test.ts`.

## Rules it follows

- Art. IV.3–IV.4 (layout and naming), Art. IV.8 (atomic writes, no overwrite), Art. III.7.

## Notes

- Decided 2026-11-17: application folders are named by a UUID instead of `<YYYY-MM-DD>-<company>-<role>` (constitution Art. IV.3–4, version 11.0.0); see [application-uuids](application-uuids.md).
