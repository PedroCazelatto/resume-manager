---
title: Reconnect to a running generation
id: F39
version: next version
reported: 2026-11-15
---

## Problem

Reloading or closing the tab loses the progress display. The run keeps going on the server, but the page no longer follows it.

## Behaviour

- Opening the home page while the selected profile has a running or waiting run shows that run's steps and progress, as if the page had never been closed.
- Opening an application's page while a run is working on that application shows its progress there instead of "This run didn't finish".
- When the run ends, the page updates by itself (the application page reloads its content).

## Acceptance criteria

- [ ] Start a run, reload the page: the steps done so far, the running step, the timer and the token counts are shown again.
- [ ] Close the tab, open the app again later: the same.
- [ ] The timer shows the time since the run started, not since the page opened.
- [ ] With no active run, the pages look as they do today.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Uses `GET /api/runs` and the replaying event stream from [run-queue](run-queue.md).
- Each run records `startedAt`; add it to the list response so the client timer starts from it (`src/components/use-run.tsx` now starts from the page's own clock).
- `src/app/applications/[id]/page.tsx` and `src/components/retry-run.tsx`: look for a run whose `applicationId` is this application before offering "Try again".

## Depends on

- [run-queue](run-queue.md).
