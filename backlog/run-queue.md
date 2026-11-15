---
title: Queue runs and track them on the server
id: F42
version: implemented
---

## What it does

- Only one run uses the model at a time, across all profiles. A run started while another is active waits in a queue and starts by itself when its turn comes.
- A run is a new application from pasted text, "Try again" on an application, or "Verify again" on an application. All three go through the queue.
- Starting a run answers `{ runId }` immediately. Its progress arrives through the run's event stream, which can be opened more than once and at any time: it replays the events so far, then follows until the run ends.
- The home page shows a "Runs" list for the selected profile: the active run with its steps and progress, the waiting ones in order, and the ones that finished or failed since the app started, each linking to its application when it has one.
- A waiting run can be removed from the queue with "Remove"; it never starts.
- The home form only queues the run and stays usable, so several runs can be started in a row. It no longer opens the application by itself when the run ends; the Runs list links to it.
- "Try again" and "Verify again" on the application page follow their own run, show "Waiting for another run to finish…" while it is queued, and reload the page's content when it ends.
- The queue lives in memory only. After a restart it is empty: waiting runs are gone, and a run that was active can be continued with "Try again" if its analysis was saved. At most 50 finished runs are kept.

## Where it lives

- `src/core/runs/queue.ts`: the pure ordering and state transitions (`enqueue`, `nextRun`, `startRun`, `recordEvent`, `finishRun`, `removeWaiting`, `findRun`, `runsOf`) and the stream's event type `QueueEvent` (the pipeline's events plus `started` and `removed`).
- `src/core/pipeline/verify.ts`: `verifyApplication`, the "Verify again" logic as a run that sends step events.
- `src/app/runs.ts`: `createRunRegistry`, the in-memory registry with its single worker loop and the followers of each run.
- `src/app/run.ts`: the registry kept on `globalThis` (`runRegistry`), the executor that calls `runApplication` or `verifyApplication` for the run's profile, and `enqueueRun` for the routes.
- Routes: `POST /api/applications`, `POST /api/applications/[id]` and `POST /api/applications/[id]/verification` enqueue and answer `{ runId }`; `GET /api/runs` lists the selected profile's runs; `GET /api/runs/[runId]/events` streams NDJSON; `DELETE /api/runs/[runId]` removes a waiting run (409 for any other run of the profile, 404 for an unknown or another profile's run).
- `src/components/use-run.tsx` (`useRun().start` and `.follow`, `enqueueRun`), `src/components/runs-list.tsx`, `src/components/new-application-form.tsx`, `src/components/retry-run.tsx`, `src/components/resume-editor.tsx`, `src/app/page.tsx`.

## Tests

- `src/core/runs/queue.test.ts`: order, one at a time, event history, failure, the 50-run limit, removing, profile isolation, the list's order.
- `src/app/runs.test.ts`: the second run waits and starts by itself; a fake model that records overlap never gets two calls at once; replay at any time; another profile can't list, follow or remove a run; a removed run never starts; nothing is logged.
- `src/core/pipeline/run.test.ts` ("verifyApplication").

## Rules it follows

- Art. IV.1 (waiting and active runs are the one piece of state kept in memory).
- Art. V.3 and V.4 (the queue's logic is pure core code; the registry lives in `src/app/`).
- Art. III.7 (a run belongs to one profile; no other profile lists, follows or removes it).
- Art. III.4 (the posting held by a waiting run is never logged, listed or streamed).
- Art. V.8 (progress per step, and a waiting run says it is waiting).
- Art. II.5 ("Verify again" still runs both checks and records the result in `verification.md`).

## Notes

- Decided 2026-11-15: one run at a time, others queue (not refused, not parallel).
- Decided 2026-11-15: the queue is in memory only for now; [database-storage](database-storage.md) will persist it.
- A removed run leaves the list entirely; the `cancelled` status exists but nothing sets it until [cancel-a-run](cancel-a-run.md), which also adds the `AbortController`.
- The Runs list refreshes every 2 seconds, and at once when this tab queues or removes a run.
- A replay keeps only the latest progress event of each step.
