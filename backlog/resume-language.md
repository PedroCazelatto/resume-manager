---
title: Choose the resume's language
id: F14
version: implemented
---

## What it does

- The resume is written in the posting's language unless another one is picked on the form (any ISO 639-1 language).
- Headings, labels and the word for "present" follow the same language; dates are formatted for it.
- Company, institution, product and certification names are not translated.

## Where it lives

- `src/core/application/languages.ts`: the language list and names.
- `src/components/language-select.tsx`.
- `src/core/prompts/tailor-resume.ts`: the language instruction.
- `src/core/resume/render.ts`: `formatDate`.

## Tests

- `src/core/application/languages.test.ts`, `src/core/pipeline/tailor-resume.test.ts`, `src/core/pipeline/run.test.ts`.

## Rules it follows

- Art. VIII (language).

## Notes

- Decided 2026-11-17: the language choice is removed and every resume is written in English for now (constitution Art. VIII.1, version 11.0.0); see [english-only-resumes](english-only-resumes.md).
