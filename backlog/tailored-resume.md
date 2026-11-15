---
title: Tailored resume
id: F13
version: implemented
---

## What it does

- The model writes the resume's content for the posting: labels, summary, skills, experience, education, projects, certifications, languages and extras, following the template's rules and layout.
- Every item records the profile files it comes from; the model can only cite files that exist in the profile.
- Name and contact details are copied from `personal.md` by code, so the model can't alter them.
- The result is saved as `resume.md` with `status: draft`.

## Where it lives

- `src/core/prompts/tailor-resume.ts`, `src/core/pipeline/tailor-resume.ts`.
- `src/core/resume/schema.ts`: the resume content schema.
- `src/core/resume/render.ts`: fills the template.

## Tests

- `src/core/pipeline/tailor-resume.test.ts`, `src/core/resume/render.test.ts`.

## Rules it follows

- Art. II.1–II.4 (no invention, allowed transformations, implied skills, traceability).
- Art. VI.4, Art. VII.2–3 (template rules and page limit go into the prompt).
- Art. V.6 (structured output).
