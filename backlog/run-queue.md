---
title: Queue runs and track them on the server
id: F42
version: next version
reported: 2026-11-15
---

## Problem

The server doesn't know which generation is running. Each request runs its own pipeline, two runs can hit the model at once, and a run can't be stopped, found again or lined up behind another.

## Behaviour

- Only one run uses the model at a time, across all profiles. A run started while another is active waits in a queue and starts by itself when its turn comes.
- A run is one of: a new application from pasted text, "Try again" on an application, or "Verify again" on an application.
- The home page shows a "Runs" list for the selected profile: the active run with its steps and progress, the waiting ones in order, and the ones that finished, failed or were cancelled since the app started, each linking to its application when it has one.
- A waiting run can be removed from the queue.
- The queue lives in memory only. After a restart it is empty: waiting runs are gone, and a run that was active can be continued with "Try again" if its analysis was saved.
- Starting a run returns immediately; progress arrives through the run's event stream.

## Acceptance criteria

- [ ] Starting two runs in a row shows the first as running and the second as waiting; the second starts when the first ends, without any action.
- [ ] The model never receives two calls at the same time (unit test with a fake model that records overlap).
- [ ] A run's event stream can be opened more than once and at any time: it replays the events so far, then follows.
- [ ] The Runs list never shows another profile's runs, and one profile can't read or remove another's (Art. III.7).
- [ ] Removing a waiting run takes it off the list and it never starts.
- [ ] "Verify again" and "Try again" go through the queue too.
- [ ] Posting text held by a waiting run is never logged.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- New module `src/app/runs.ts` (app layer, server only): a registry kept on `globalThis` so hot reload doesn't duplicate it. Each run: `runId` (UUID), profile slug, kind, input, status (`queued`, `running`, `done`, `failed`, `cancelled`), `applicationId?`, the list of `RunEvent`s sent so far, an `AbortController`, and the error message.
- A single worker loop takes the next queued run and calls `runApplication` (`src/core/pipeline/run.ts`); "Verify again" becomes a run kind that calls the logic now in `verifyResume` (`src/app/applications/[id]/actions.ts`).
- Routes: `POST /api/applications` and `POST /api/applications/[id]` enqueue and answer `{ runId }`; `GET /api/runs` lists the selected profile's runs; `GET /api/runs/[runId]/events` streams NDJSON (replay, then follow); `DELETE /api/runs/[runId]` removes a waiting run.
- Client: `src/components/use-run.tsx` changes from reading the POST response to opening the event stream of a `runId`. Add a `RunsList` component on the home page.
- Keep the queue's ordering and state transitions in a pure module under `src/core/` (for example `src/core/runs/queue.ts`) so they can be unit-tested; the registry in `src/app/` only wires it to I/O.
- Keep at most 50 finished runs in memory.
- Art. IV.1 allows this one piece of in-memory state. Art. V.4: core must not assume a long-lived process, so nothing in `src/core/` may hold the registry.

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: one run at a time, others queue (not refused, not parallel).
- Decided 2026-11-15: the queue is in memory only for now; [database-storage](database-storage.md) will persist it.
