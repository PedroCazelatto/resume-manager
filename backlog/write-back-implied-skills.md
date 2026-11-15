---
title: Write approved implied skills back to the profile
id: F07
version: next version
---

## Problem

An implied skill approved in one application is flagged again in the next one.

## Behaviour

- An approved implied skill that the profile's `skills.md` doesn't list shows an "Add to my profile" button.
- The button opens a confirmation naming the skill, the file (`skills.md`) and the heading it will go under.
- On confirm, the skill is added as a bullet under the heading that matches the category the resume used for it; when no heading matches, a new `## <category>` section is added at the end of the file.
- Once `skills.md` lists the skill, the button is gone.

## Acceptance criteria

- [ ] Confirming adds exactly one bullet and changes nothing else in `skills.md`; frontmatter and other sections are byte-for-byte the same.
- [ ] Heading match ignores case and surrounding spaces.
- [ ] A skill already listed (ignoring case) is not added twice.
- [ ] Nothing is written without the confirmation, and only `skills.md` of the selected profile is touched.
- [ ] Pending and rejected skills have no button.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Pure function `addSkill(skillsSource, category, skill)` in `src/core/profile/` with unit tests.
- `ProfileStore` (`src/adapters/profile-store.ts`) gains an atomic write for one profile file, limited to paths that `profileFileKind` accepts.
- Server action in `src/app/applications/[id]/actions.ts`; button and dialog in `src/components/resume-view.tsx` (add the shadcn/ui `dialog` component).
- The category is the `category` of the `resume.md` skills group that contains the skill. When the resume is in another language than the profile, no heading will match and a new heading in the resume's language is created; the confirmation shows it, so the user sees it before confirming.
- Art. II.3 (write-back only after a separate confirmation), Art. IV.8–IV.9 (atomic write; the one case where generation data changes the profile), Art. III.7.

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: same category as the resume; a new heading when none matches.
