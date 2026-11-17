---
title: Profile picker
id: F03
version: implemented
---

## What it does

- The sidebar of every page lists the folders under `PROFILES_DIR` and lets you pick one; the home page shows the picker too while none is chosen ([visual-pass](visual-pass.md)). There is no login.
- The choice is kept in an http-only cookie named `profile`, never in the URL.
- Folders whose name is not lowercase kebab-case are listed as ignored.
- With no profile folders, the page explains how to create one from the example.

## Where it lives

- `src/app/page.tsx`, `src/components/app-sidebar.tsx`, `src/components/profile-picker.tsx`.
- `src/app/profiles.ts`: the cookie and the store factory. `src/app/actions.ts`: `selectProfile`.
- `src/adapters/profile-store.ts`: `listProfiles`.

## Tests

- `src/adapters/profile-store.test.ts`.

## Rules it follows

- Art. III.6 (no authentication, localhost only), Art. III.7 (profiles are isolated).
