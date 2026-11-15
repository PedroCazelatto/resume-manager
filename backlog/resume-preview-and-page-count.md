---
title: Resume preview with page count
id: F20
version: implemented
---

## What it does

- The application page shows the resume rendered from the template, at its printed width and scaled to fit.
- Under it, an approximate page count; when it is over the template's `max-pages`, a warning says so and that printing is still allowed.
- The preview is a sandboxed frame that runs no scripts.

## Where it lives

- `src/components/resume-preview.tsx`: measures the page from the template's `@page` rule.
- `src/core/resume/render.ts`.

## Tests

- `src/core/resume/render.test.ts`. The page measurement runs only in a browser and has no unit test.

## Rules it follows

- Art. V.9 (the preview and the PDF use the same HTML).
- Art. VII.3 (page-count warning; printing stays allowed).
