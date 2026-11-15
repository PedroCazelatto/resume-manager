---
title: Save as PDF through the print dialog
id: F22
version: implemented
---

## What it does

- "Print / Save as PDF" opens the browser's print dialog on the same HTML the preview shows.
- The button is disabled while the resume is a draft or has unsaved edits, and the page says what is blocking it.

## Where it lives

- `src/components/resume-editor.tsx`, `src/components/resume-preview.tsx`.

## Tests

- No unit test: it runs only in a browser.

## Rules it follows

- Art. V.9 (same HTML for preview and print).
- Art. VI.7 (rendering is blocked while failures, pending skills or an outdated review remain).
