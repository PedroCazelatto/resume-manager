---
title: Write approved implied skills back to the profile
id: F07
version: implemented
---

## What it does

- An approved implied skill that the profile's `skills.md` doesn't list shows an "Add to my profile" button next to Approve and Reject. Pending and rejected skills have no button.
- The button opens a confirmation naming the skill and the file (`skills.md`), where the user picks the heading: a list of the `##` headings of `skills.md` plus "New section". The heading that matches the category the resume used for the skill (case and surrounding spaces ignored) is preselected; when none matches, "New section" is.
- "New section" shows its name in a text field, filled with the resume's category and editable. An empty name, or the name of a heading the file already has, shows a message and disables the confirm button.
- Nothing is written until "Add to my profile" is pressed there; "Cancel" writes nothing.
- On confirm, the skill is added as one bullet at the end of the chosen section (up to the next heading of any level), or in a new `## <name>` section at the end of the file.
- Nothing else in `skills.md` changes: frontmatter, other sections, line breaks (Unix or Windows) and a missing final line break stay as they are. The new bullet uses the section's own bullet marker (`-`, `*` or `+`).
- A skill that `skills.md` already lists is never added again. Listed means the skill appears as a whole word or phrase inside any bullet of the file, ignoring case: with the bullet `AWS (Lambda, RDS, SQS)`, "Lambda" and "AWS" are listed, "SQ" and "Lamb" are not. A whole word is one that no character of a skill's name touches on either side. Letters, digits, `+`, `#` and `.` are part of a name, so the bullet `C++` or `C#` doesn't list "C", `Node.js` doesn't list "Node" and `ASP.NET` doesn't list "NET"; `Java/Kotlin` lists "Java". A `.` after the skill counts only when a letter or digit follows it, so a full stop at the end of a sentence doesn't hide the skill.
- Once `skills.md` lists the skill, the button is gone. The resume and its implied-skill decision are not changed.
- The choice is checked again on the server at confirm time: a chosen heading must be a `##` heading of the file as it is then, and a new section's name must be one line, not empty and not one of the file's headings. If that fails, or the skill is no longer offered (the profile or the resume changed since the page was opened), nothing is written and the dialog asks to reload the page.

## Where it lives

- `src/core/profile/add-skill.ts`: `skillHeadings` lists the `##` headings of `skills.md`; `hasHeading`; `listsSkill`; `skillOptions(skillsSource, category, skill)` returns the headings, the preselected one and the new section's starting name, or null when the skill is listed; `impliedSkillOptions` reads the category from the resume's skills group and offers the options only for an approved skill; `addSkill(skillsSource, placement, skill)` returns the new text of `skills.md` for the chosen heading (`placement`: `heading` and `isNew`), or null when there is nothing to add or the choice doesn't fit the file.
- `src/adapters/profile-store.ts`: `replaceProfileFile(slug, file, content)`, an atomic replace of one existing profile file, limited to paths `profileFileKind` accepts. Hidden files, `applications/`, `imports/`, paths with `..` and symlinks are refused.
- `src/app/applications/[id]/actions.ts`: `addSkillToProfile(id, skill, placement)`, where `placement` is the heading chosen in the confirmation.
- `src/app/applications/[id]/page.tsx`: works out the options of each approved skill from the selected profile's `skills.md`.
- `src/components/resume-view.tsx`: the button and the confirmation dialog with the heading picker (`AddToProfile`) in `InferenceList`.
- `src/components/ui/select.tsx`: the shadcn/ui select the picker uses.

## Tests

- `src/core/profile/add-skill.test.ts`: the `##` headings in file order, without other levels, the frontmatter or a repeated heading; the matching heading is preselected ignoring case and spaces, a new section otherwise; one bullet and nothing else changed; any heading of the file can be chosen; a chosen heading that isn't in the file is refused; new section at the end; a new section named like an existing heading is refused; a file with only frontmatter; a listed skill is not added, also under another heading and the second time; a skill inside a bullet is listed as a whole word or phrase, part of a word is not, `+`, `#` and `.` are part of a name, and only bullets of the body count; no final line break and Windows line breaks are kept; a heading without bullets; the section's bullet marker; the section stops at a heading of any level; a skill or heading that is empty or longer than one line is refused; no options for pending or rejected skills, for a listed skill, or for a skill no skills group holds.
- `src/adapters/profile-store.test.ts` ("replaceProfileFile"): replaces a file and leaves no temp file; refuses paths outside the profile layout, another profile, `applications/`, `imports/` and hidden files; doesn't create a missing file; doesn't write through a symlink into another profile.
- `src/app/applications/[id]/actions.test.ts` ("addSkillToProfile"): one bullet under the chosen heading, with every other file of the profile, the resume and a second profile unchanged; under another heading than the resume's category; a new section at the end under the given name; not added twice; nothing written for a skill a bullet already holds, for a pending or rejected skill, for a skill that isn't implied, for a chosen heading that is no longer in the file, for a new section without a name or named like an existing heading, or when the profile has problems.
- Checked in a browser on 2026-11-16 (headless Chrome, light and dark) on a scratch copy of the example profile, without the model: with "Kubernetes" approved, the dialog preselects "New section" named "Cloud & Infrastructure" and lists Languages, Frameworks, Cloud and infrastructure, Data and New section; an empty name and the name "data" each show their message and disable the confirm button; choosing "Cloud and infrastructure" and confirming added `- Kubernetes` at the end of that section and changed no other file; the button was gone afterwards.

## Rules it follows

- Art. II.3 (an approved inference is written back only after a separate confirmation).
- Art. IV.8 (atomic write; the user's file is changed only after confirmation in the UI, and only added to).
- Art. IV.9 (the one case where generation data changes the profile).
- Art. III.7 (only `skills.md` of the selected profile is read and written).
- Art. V.3 (the text change is pure core logic; the write is in `ProfileStore`).

## Notes

- Decided 2026-11-15: same category as the resume; a new heading when none matches. Superseded on 2026-11-16 by the picker: the resume's category now only sets what is preselected.
- Decided 2026-11-16: the user picks the heading in the confirmation, among the existing `##` headings of `skills.md` and a "New section" named after the resume's category (editable).
- Decided 2026-11-16: a skill that appears as a whole word or phrase inside any bullet of `skills.md` counts as already listed, ignoring case.
- Decided 2026-11-17: `+`, `#` and `.` are part of a skill's name, so "C" is not listed by `C++` and "Node" is not listed by `Node.js`.
- Decided 2026-11-17 (stays as built): the picker offers only `##` headings; a `#` or `###` heading is neither offered nor accepted, and a heading written twice is offered once, with the skill going under the first.
- Decided 2026-11-16 (stays as built): an implied skill whose name differs from the resume's skills item gets no button, and there is no button while the profile has problems.
- The category is the `category` of the `resume.md` skills group that contains the skill. When the resume is in another language than the profile, or words the category differently (the example resume says "Cloud & Infrastructure", the example profile "Cloud and infrastructure"), no heading matches and "New section" is preselected with the resume's wording; the user can pick the existing heading instead.
- When no skills group of the resume holds the skill under the same name (ignoring case and surrounding spaces), there is no category to use and no button is shown. This happens when the skill was removed or renamed in the resume's skills list.
- When the profile has problems, no button is shown; the home page lists the problems.
