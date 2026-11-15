---
title: One-click PDF
id: F23
version: future version
---

## Problem

Saving the PDF goes through the browser's print dialog, and the file isn't kept with the application.

## Behaviour

- A "Save PDF" button on a ready resume renders the PDF and saves it as `resume.pdf` in the application folder, then offers it for download.
- The PDF comes from the same HTML as the preview.
- Saving again replaces the previous `resume.pdf`.
- The button is disabled while the resume is a draft, like Print.

## Acceptance criteria

- [ ] `resume.pdf` appears in the application folder and opens as a PDF with the same content and page breaks as the print dialog's output.
- [ ] The renderer loads no network resource and runs no script.
- [ ] A draft resume can't be rendered, also when the route is called directly.
- [ ] The browser engine is closed after each render.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- New adapter `src/adapters/pdf-renderer.ts` behind `PdfRenderer { renderPdf(html): Promise<Uint8Array> }`, using `puppeteer` with its bundled Chromium (approved 2026-11-15).
- Render with JavaScript disabled and every network request blocked; `preferCSSPageSize` so the template's `@page` rule decides size and margins.
- `ProfileStore` gains a binary write for `resume.pdf`; add it to `APPLICATION_FILES` in `src/core/application/folder.ts`.
- Route `GET /applications/[id]/resume.pdf` serves the saved file.
- Art. V.9 (same HTML; `resume.pdf`), Art. VI.7 (blocked while not ready), Art. III.2 (no outbound requests at run time).

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: bundled Chromium, not the installed Chrome. Installing the dependency downloads Chromium once.
