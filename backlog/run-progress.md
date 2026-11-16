---
title: Step-by-step progress
id: F30
version: implemented
---

## What it does

- While a run works, the page lists each step: analysing, saving, writing the resume, checking, reviewing.
- The running step shows a timer as `MMmSSs` and what the model is doing: `thinking, 1,234 tokens`, then `writing, 310 tokens`.
- A step whose prompt may not fit the context window shows a warning under its line; see [context-size-warning](context-size-warning.md).
- The server streams progress as one JSON event per line.

## Where it lives

- `src/core/pipeline/run.ts`: `RunEvent`, `RunStep`.
- `src/app/api/runs/[runId]/events/route.ts`: the run's event stream (see [run-queue](run-queue.md)).
- `src/components/use-run.tsx`: `useRun`, `RunProgress`.
- `src/lib/utils.ts`: `formatElapsed`.

## Tests

- `src/core/pipeline/run.test.ts`, `src/lib/utils.test.ts`, `src/adapters/ollama-client.test.ts` (progress reports).

## Rules it follows

- Art. V.8 (progress per step, never blocking without feedback).
