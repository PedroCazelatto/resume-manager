---
title: Write every resume in English and remove the language choice
id: F51
version: next version
reported: 2026-11-17
---

## Problem

[resume-language](resume-language.md) (F14) lets the user pick the resume's language, and the resume otherwise follows the posting's language. On 2026-11-17 the user decided to remove the feature and write every resume in English for now (constitution Art. VIII.1, version 11.0.0).

## Behaviour

- Every resume is written in English, whatever the posting's language: content, the template's headings and labels, the word for "present", and dates.
- No language field anywhere: not in the new-application form, not next to "Try again" on the application page, not in the Runs list.
- Runs no longer carry a language. The routes that start runs no longer take one, and the browser no longer remembers one per application.
- `job.md` keeps `language`: it is the posting's detected language (Art. IV.5), not the resume's. `resume.md` keeps `language`, now always `en`.
- Profile data may still be in any language; the model translates it into English, preserving meaning and adding nothing (Art. VIII.2, Art. II).

## Acceptance criteria

- [ ] A posting in another language (the test's mocked model reply says so) produces a resume with `language: en`, and the tailor prompt asks for English.
- [ ] No language selector is left in the UI, and no request or run carries a language.
- [ ] Older `resume.md` files with another language still open and render as they are.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass, with the model mocked.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [resume-language](resume-language.md), [try-again-failed-run](try-again-failed-run.md), [run-queue](run-queue.md) and [list-of-posting-urls](list-of-posting-urls.md) describe English-only resumes.
- [ ] The README's line about the resume's language is updated in the file, and left uncommitted for the user's review (Art. XI.5).

## Technical notes

- Where the choice lives today: `src/components/language-select.tsx` (used by `src/components/new-application-form.tsx` and `src/components/retry-run.tsx`), `src/core/application/languages.ts`, the language instruction in `src/core/prompts/tailor-resume.ts`, `formatDate` in `src/core/resume/render.ts`, `language` in `RunRequest` and `RunSummary` (`src/app/runs.ts`), `readNewRunStart` / `readLinkStarts` in `src/core/posting/start.ts`, the routes under `src/app/api/applications/`, `rememberedLanguage` and `rememberLanguage` in `src/components/use-run.tsx`, and `latestGeneration` in `src/core/runs/queue.ts`.
- Remove what only served the choice; keep what the posting's detected language and older files still need.
- The Ireland template (`templates/ireland.html`) is the user's (Art. VII.5): don't edit it. If it depends on a language parameter, pass English.

## Depends on

- Constitution version 11.0.0 (Art. VIII.1).

## Decisions

- Decided 2026-11-17 (the user): "Lets remove the language feature and set it only to english by now."
