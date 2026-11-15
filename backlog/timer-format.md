---
title: Show the run timer as MMmSSs
id: F36
version: implemented
reported: 2026-11-14
---

## What it does

- The timer next to the running step reads `02m05s` instead of plain seconds.

## Where it lives

- `src/lib/utils.ts`: `formatElapsed`.
- `src/components/use-run.tsx`.

## Tests

- `src/lib/utils.test.ts`.

## Rules it follows

- Art. V.8.
