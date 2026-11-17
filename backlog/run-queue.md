---
title: Queue runs and track them on the server
id: F42
version: implemented
---

## What it does

- Only one run uses the model at a time, across all profiles. A run started while another is active waits in a queue and starts by itself when its turn comes.
- A run is a new application from pasted text, "Try again" on an application, or "Verify again" on an application. All three go through the queue.
- A new application from a link passes through a second queue first, the fetch queue, which doesn't wait for the model; it joins this queue only when its posting was fetched ([posting-by-url](posting-by-url.md)).
- Starting a run answers `{ runId }` immediately. Its progress arrives through the run's event stream, which can be opened more than once and at any time: it replays the events so far, then follows until the run ends.
- The home page shows a "Runs" list for the selected profile: the active run with its steps and progress, the waiting ones in order, the ones whose posting is being fetched, and the ones that finished, failed or were cancelled since the app started, each linking to its application when it has one.
- A run that finished, failed or was cancelled keeps its steps in the list, as the run left them (a step it didn't finish is marked "✗"; "…" is only for a step still running), with any context-size warning under its step, for as long as the run stays in the list.
- A new run that failed or was cancelled before its application was saved has "Try again" in the list; see [try-again-failed-run](try-again-failed-run.md).
- A waiting run can be removed from the queue with "Remove"; it never starts. The button is in the Runs list, and next to "Waiting for another run to finish…" on the application page. The waiting line and its button appear only once the server has said the run is waiting (a `waiting` event at the start of its stream, sent to that page only and not kept in the run's history), so a run that starts at once never shows them. After "Remove" the page says "This run was removed from the queue." as a neutral grey line, like the cancelled message.
- Every run keeps what it was asked to do (the posting or the application, and the chosen resume language) in memory for as long as it is listed.
- The home form only queues the run and stays usable, so several runs can be started in a row. It no longer opens the application by itself when the run ends; the Runs list links to it.
- "Try again" and "Verify again" on the application page follow their own run, show "Waiting for another run to finish…" while it is queued, and reload the page's content when it ends.
- The queue lives in memory only. After a restart it is empty: waiting runs are gone, and a run that was active can be continued with "Try again" if its analysis was saved. At most 50 finished runs are kept.

## Where it lives

- `src/core/runs/queue.ts`: the pure ordering and state transitions (`enqueue`, `nextRun`, `startRun`, `recordEvent`, `finishRun`, `removeWaiting`, `findRun`, `runsOf`), the stream's event type `QueueEvent` (the pipeline's events plus `started`, `removed` and `cancelled`), and what the list shows of a run: `runSteps` (its steps and warnings, read from its events), `canTryAgain` and `latestGeneration`.
- `src/core/pipeline/verify.ts`: `verifyApplication`, the "Verify again" logic as a run that sends step events.
- `src/app/runs.ts`: `createRunRegistry`, the in-memory registry with one worker loop for the model, one for the fetch queue, and the followers of each run. `RunSummary` is a run as `GET /api/runs` lists it: with its `language`, `steps`, `warnings`, `retryable`, its link (`url`) and `fetchFailed`, never its posting.
- `src/app/run.ts`: the registry kept on `globalThis` (`runRegistry`), the executor that calls `runApplication` or `verifyApplication` for the run's profile, and `enqueueRun` for the routes.
- Routes: `POST /api/applications`, `POST /api/applications/[id]` and `POST /api/applications/[id]/verification` enqueue and answer `{ runId }`; `GET /api/runs` lists the selected profile's runs; `GET /api/runs/[runId]/events` streams NDJSON; `DELETE /api/runs/[runId]` removes a waiting run (404 for an unknown or another profile's run; what it does to a running or ended run is in [cancel-a-run](cancel-a-run.md)); `POST /api/runs/[runId]` queues a run again ([try-again-failed-run](try-again-failed-run.md)).
- `src/components/use-run.tsx` (`useRun().start` and `.follow`, `enqueueRun`, `RunSteps`, and `RunProgress`, whose `removable` adds "Remove" to the waiting line), `src/components/runs-list.tsx`, `src/components/new-application-form.tsx`, `src/components/retry-run.tsx`, `src/components/resume-editor.tsx`, `src/app/page.tsx`.

## Tests

- `src/core/runs/queue.test.ts`: order, one at a time, event history, failure, the 50-run limit, removing, profile isolation, the list's order; a run's steps and warnings read from its events, with an unfinished step left running.
- `src/app/runs.test.ts`: the second run waits and starts by itself; a fake model that records overlap never gets two calls at once; replay at any time; another profile can't list, follow or remove a run; a removed run never starts; a run that finished or failed is still listed with its steps and warning; nothing is logged.
- Not looked at in a browser: the "✗" on unfinished steps, the grey removed message, the steps under an ended run in the Runs list, and "Remove" next to the waiting line on the application page.
- `src/core/pipeline/run.test.ts` ("verifyApplication").

## Rules it follows

- Art. IV.1 (waiting and active runs are the one piece of state kept in memory).
- Art. V.3 and V.4 (the queue's logic is pure core code; the registry lives in `src/app/`).
- Art. III.7 (a run belongs to one profile; no other profile lists, follows or removes it).
- Art. III.4 (the posting held by a run is never logged, listed or streamed).
- Art. V.8 (progress per step, and a waiting run says it is waiting).
- Art. II.5 ("Verify again" still runs both checks and records the result in `verification.md`).

## Notes

- Decided 2026-11-15: one run at a time, others queue (not refused, not parallel).
- Decided 2026-11-15: the queue is in memory only for now; [database-storage](database-storage.md) will persist it.
- A removed run leaves the list entirely; the `cancelled` status is for a running run stopped by the user ([cancel-a-run](cancel-a-run.md)). Decided 2026-11-17: in the fetch queue an X icon button removes the link (not fetched, nothing saved); in this queue an X cancels a waiting or running run, which stays listed as cancelled with "Try again", and a trash button deletes a cancelled run, without a confirmation box ([runs-list-changes](runs-list-changes.md)). The Runs list becomes the home page's table ([home-applications-table](home-applications-table.md)).
- The Runs list refreshes every 2 seconds, and at once when this tab queues or removes a run.
- A replay keeps only the latest progress event of each step.
- Decided 2026-11-16: runs that finished, failed or were cancelled keep their steps and context-size warning in the Runs list while they stay in it. The list reads them from `GET /api/runs`, so an ended run's stream isn't opened again.
- Decided 2026-11-16: "Try again" and "Verify again" on the application page show "Remove" while their run waits; it uses the same route as the Runs list's Remove. The page then says "This run was removed from the queue."
- Decided 2026-11-17: that message is a neutral grey line, like the cancelled message, not an error.
- Decided 2026-11-17: a step that an ended run never finished shows "✗", in the Runs list and on the application page.
- Decided 2026-11-17: "Remove" is hidden until the page knows the run is really waiting.
- Decided 2026-11-16: the home form keeps only queueing; it does not follow the run or open the application.
