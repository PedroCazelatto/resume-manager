---
title: Fictional example profile
id: F02
version: implemented
---

## What it does

- `example-profiles/jane-doe/` is a complete fictional profile: every file kind, valid against the schemas.
- It is the model for writing a real profile by hand, and the only data tests and assistants' test runs use.
- Applications generated against it are gitignored (`example-profiles/*/applications/`).

## Where it lives

- `example-profiles/jane-doe/`.

## Tests

- `src/adapters/profile-store.test.ts` loads it and expects no problems.

## Rules it follows

- Art. III.5 (tests and assistants use fictional data only).

## Notes

- Test runs point the app at it with `PROFILES_DIR=./example-profiles`.
