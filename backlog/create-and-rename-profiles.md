---
title: Create and rename profiles in the app
id: F04
version: future version
---

## Problem

Today a profile is a folder created by hand.

## Behaviour

- A "New profile" button asks for a name and creates the profile as an empty skeleton: `personal.md`, `summary.md`, `skills.md` and `languages.md` with their fields present but blank, and the empty folders of the layout.
- The new profile is selected. It shows as "has problems" until the required fields are filled.
- A profile can be renamed; its folder is renamed and it stays selected.
- The name is turned into lowercase kebab-case, and a name that already exists is refused.

## Acceptance criteria

- [ ] Creating "Maria Silva" makes `profiles/maria-silva/` with the four files and selects it.
- [ ] The skeleton's files parse as frontmatter; the problems listed are only the blank required fields.
- [ ] Creating or renaming to an existing name fails with a message and changes nothing.
- [ ] A profile with a running or waiting run can't be renamed.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Skeleton sources as a pure function in `src/core/profile/` with a unit test.
- `ProfileStore` (`src/adapters/profile-store.ts`) gains `createProfile(slug)` and `renameProfile(from, to)`; both refuse existing targets. Rename is a single folder rename.
- Server actions in `src/app/actions.ts`; UI next to the profile picker.
- Art. IV.3–IV.4 (layout and naming), Art. IV.8 (nothing overwritten), Art. III.7.

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: an empty skeleton, not a copy of the example.
