---
title: Profile schemas and validation
id: F01
version: implemented
---

## What it does

- Every profile file's frontmatter is checked against a schema each time it is read.
- A file with a problem is listed on the home page with its path and the reason (`personal.md` — `email: is required`), and generation is blocked until the profile is valid.
- A file outside the layout, a missing required file (`personal.md`, `summary.md`, `skills.md`, `languages.md`) and a symlink are all reported as problems.
- Fields the app doesn't know are kept.

## Where it lives

- `src/core/profile/schemas.ts`: one Zod schema per file kind.
- `src/core/profile/validate.ts`: maps a path to its kind and parses one file.
- `src/core/profile/profile.ts`: `assembleProfile` validates a whole profile; `listProfileFiles` returns its files in path order.
- `src/core/markdown/frontmatter.ts`, `src/core/markdown/validate.ts`: frontmatter parsing and readable problem messages.
- `src/adapters/profile-store.ts`: `loadProfile` reads the folder.
- `src/components/file-problems.tsx`: the problems box.

## Tests

- `src/core/profile/profile.test.ts`, `src/core/profile/validate.test.ts`, `src/core/markdown/frontmatter.test.ts`, `src/adapters/profile-store.test.ts`.

## Rules it follows

- Art. IV.3–IV.7 (layout, naming, fields, validation on read, unknown fields kept).
- Art. III.7 (a profile never reads another profile's files).
