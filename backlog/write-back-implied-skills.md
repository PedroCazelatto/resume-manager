---
title: Write approved implied skills back to the profile
id: F07
version: implemented
---

## What it does

- An approved implied skill that the profile's `skills.md` doesn't list shows an "Add to my profile" button next to Approve and Reject. Pending and rejected skills have no button.
- The button opens a confirmation naming the skill, the file (`skills.md`) and the heading it will go under, and saying whether that heading is new. Nothing is written until "Add to my profile" is pressed there; "Cancel" writes nothing.
- On confirm, the skill is added as one bullet at the end of the section whose heading matches the category the resume used for it (case and surrounding spaces ignored). When no heading matches, a new `## <category>` section is added at the end of the file.
- Nothing else in `skills.md` changes: frontmatter, other sections, line breaks (Unix or Windows) and a missing final line break stay as they are. The new bullet uses the section's own bullet marker (`-`, `*` or `+`).
- A skill that `skills.md` already lists is never added again. Listed means a bullet anywhere in the file whose whole text is the skill, ignoring case and surrounding spaces; `AWS (Lambda, RDS, SQS)` does not list `Lambda`.
- Once `skills.md` lists the skill, the button is gone. The resume and its implied-skill decision are not changed.
- If the profile or the resume changed between opening the page and confirming, so the heading would no longer be the one the confirmation named, nothing is written and the dialog asks to reload the page.

## Where it lives

- `src/core/profile/add-skill.ts`: `addSkill(skillsSource, category, skill)` returns the new text of `skills.md`, or null when there is nothing to add; `skillPlacement` says which heading it would use; `listsSkill`; `resumeSkillCategory` and `impliedSkillPlacement` read the category from the resume's skills group and offer a placement only for an approved skill.
- `src/adapters/profile-store.ts`: `replaceProfileFile(slug, file, content)`, an atomic replace of one existing profile file, limited to paths `profileFileKind` accepts. Hidden files, `applications/`, `imports/`, paths with `..` and symlinks are refused.
- `src/app/applications/[id]/actions.ts`: `addSkillToProfile(id, skill, heading)`, where `heading` is the heading the confirmation named.
- `src/app/applications/[id]/page.tsx`: works out the placement of each approved skill from the selected profile's `skills.md`.
- `src/components/resume-view.tsx`: the button and the confirmation dialog in `InferenceList`.

## Tests

- `src/core/profile/add-skill.test.ts`: one bullet and nothing else changed; heading match ignoring case and spaces; new section at the end; a file with only frontmatter; a listed skill is not added, also under another heading and the second time; only whole bullets of the body count as listed; no final line break and Windows line breaks are kept; a heading without bullets; the section's bullet marker; a skill or category that is empty or longer than one line is refused; no placement for pending or rejected skills, for a listed skill, or for a skill no skills group holds.
- `src/adapters/profile-store.test.ts` ("replaceProfileFile"): replaces a file and leaves no temp file; refuses paths outside the profile layout, another profile, `applications/`, `imports/` and hidden files; doesn't create a missing file; doesn't write through a symlink into another profile.
- `src/app/applications/[id]/actions.test.ts` ("addSkillToProfile"): one bullet under the matching heading, with every other file of the profile, the resume and a second profile unchanged; a new heading at the end; not added twice; nothing written for a pending or rejected skill, for a skill that isn't implied, for another heading than the one confirmed, or when the profile has problems.
- Checked by hand on 2026-11-16 on a scratch copy of the example profile, without the model: the page shows no button while "Kubernetes" is pending and one once it is approved; calling the action added `## Cloud & Infrastructure` with one bullet at the end of `skills.md`, changed nothing else and left no temp file; the button was gone on the next load. The dialog itself was not clicked through in a browser.

## Rules it follows

- Art. II.3 (an approved inference is written back only after a separate confirmation).
- Art. IV.8 (atomic write; the user's file is changed only after confirmation in the UI, and only added to).
- Art. IV.9 (the one case where generation data changes the profile).
- Art. III.7 (only `skills.md` of the selected profile is read and written).
- Art. V.3 (the text change is pure core logic; the write is in `ProfileStore`).

## Notes

- Decided 2026-11-15: same category as the resume; a new heading when none matches.
- The category is the `category` of the `resume.md` skills group that contains the skill. When the resume is in another language than the profile, or words the category differently (the example resume says "Cloud & Infrastructure", the example profile "Cloud and infrastructure"), no heading matches and a new heading with the resume's wording is created; the confirmation shows it, so the user sees it before confirming.
- When no skills group of the resume holds the skill under the same name (ignoring case and surrounding spaces), there is no category to use and no button is shown. This happens when the skill was removed or renamed in the resume's skills list.
- When the profile has problems, no button is shown; the home page lists the problems.
