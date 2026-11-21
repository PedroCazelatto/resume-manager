---
title: Choose the resume's language
id: F14
version: implemented
---

## What it does

- The choice was removed by [english-only-resumes](english-only-resumes.md) (F51): every resume is written in English, whatever the posting's language, and no language can be picked.
- Headings, labels and the word for "present" are in English too; dates are formatted for `resume.md`'s `language`, which is `en` for every new resume.
- Company, institution, product and certification names are not translated.
- An older `resume.md` in another language still opens and renders in its own language.

## Where it lives

- `src/core/prompts/tailor-resume.ts`: the instruction to write in English.
- `src/core/pipeline/tailor-resume.ts`: `language: "en"` in `resume.md`.
- `src/core/resume/render.ts`: `formatDate`, in `resume.md`'s language.
- `src/core/application/languages.ts`: `languageName`, for the posting's language and older resumes. The language list and `src/components/language-select.tsx` were removed with the choice.

## Tests

- `src/core/application/languages.test.ts`, `src/core/pipeline/tailor-resume.test.ts`, `src/core/pipeline/run.test.ts`, `src/core/resume/render.test.ts`.

## Rules it follows

- Art. VIII (language).

## Notes

- Decided 2026-11-17: the language choice is removed and every resume is written in English for now (constitution Art. VIII.1, version 11.0.0); see [english-only-resumes](english-only-resumes.md). Built on 2026-11-21.
