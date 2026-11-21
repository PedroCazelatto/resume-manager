---
title: Reconnect to a running generation
id: F39
version: implemented
reported: 2026-11-15
---

## What it does

- Reloading the home page, or closing the tab and opening the app again later, shows the selected profile's running run in the Runs list as before: the steps done so far, the running step, the timer and the token counts, with its X ("Cancel"). Waiting runs are listed with their X, ended ones with their steps ([runs-list-changes](runs-list-changes.md)).
- The timer shows the time since the run started on the server, not since the page opened. A run that waited in the queue counts from the moment its turn came.
- Opening or reloading an application's page while a run is working on that application, or waiting for it, shows that run's progress there:
  - a new application or "Try again": the section that normally says "This run didn't finish" says "This run is in progress" and shows the steps, the timer and the token counts with the X that cancels it, or "Waiting for another run to finish…" with the same X ([runs-list-changes](runs-list-changes.md));
  - "Verify again": the button reads "Verifying… this can take minutes" and the same progress is shown under it.
- When the followed run ends (finished, failed or cancelled), the application page reloads its content by itself. Since [runs-list-changes](runs-list-changes.md) the same is true of a "Try again" or "Verify again" the page started itself, which used to reload only when it finished.
- With no running or waiting run, both pages look as they did before.
- Reconnecting tells nothing twice: a run's end is still told once per tab, and a run that was over before the page opened is not told about ([notify-when-run-ends](notify-when-run-ends.md)).

## Where it lives

- `src/core/runs/queue.ts`: `startRun` takes the start time and keeps it as the run's `startedAt`; the stream's `started` event carries it as `at` (both in milliseconds since the epoch).
- `src/core/runs/reconnect.ts`: `elapsedSeconds` (the timer's value from `startedAt`) and `activeRun` (the run that is working on an application or waiting for it: the running one first, then the waiting one that starts first; "Verify again" runs are kept apart from the ones that write the resume).
- `src/app/runs.ts`: `createRunRegistry` takes the clock (`Date.now` by default); `RunSummary.startedAt` is in the answer of `GET /api/runs`.
- `src/app/applications/[id]/page.tsx`: looks up the selected profile's active runs for the application on the server and hands `runId` and `kind` to `RetryRun` and `ResumeEditor` as `active` (no `language` since [english-only-resumes](english-only-resumes.md)).
- `src/components/use-active-run.ts`: `useActiveRun` follows that run through its replaying event stream and calls `router.refresh()` when it ends. It skips a run the page already follows. A run the page starts itself: `useRun().start` resolves with true once the run has ended, however it ended, and `RetryRun` and `ResumeEditor` refresh then ([runs-list-changes](runs-list-changes.md)).
- `src/components/use-run.tsx`: the timer counts from the `started` event's time; `runId` says which run is followed; a `follow` that was replaced by a newer one no longer resets the newer one's state.
- `src/components/retry-run.tsx`, `src/components/resume-editor.tsx`: take `active` and show the run as in progress.
- The home page needed no change besides the timer: the Runs list already follows the running run through the replaying stream ([run-queue](run-queue.md)).

## Tests

- `src/core/runs/reconnect.test.ts`: elapsed time from the start, never negative; the active run of an application (running before waiting, first waiting first, ended runs and other applications ignored, "Verify again" kept apart).
- `src/core/runs/queue.test.ts`: the `started` event carries the start time.
- `src/app/runs.test.ts`: a run's `startedAt` is in the list and in a stream opened later, together with the steps and the latest progress; a waiting run has none and gets its own when its turn comes; an ended run keeps it.
- Checked on 2026-11-17 with the real model and headless Chrome (example profile, `npm run dev`): the home page opened and reloaded in the middle of a run showed the running step with a timer that matched the server's `startedAt` (`01m25s` before the reload, `01m29s` after) and the token count; the application page opened and reloaded while its resume was being written showed "This run is in progress", the two finished steps and the running one with `04m54s` and the token count; "Cancel" pressed there ended the run and the page went back to "This run didn't finish" with "Try again" without a reload.
- Not looked at in a browser: a waiting run on the application page, "Verify again" picked up again, and a run that finishes while the application page follows it.

## Rules it follows

- Art. IV.1 (the start time lives in memory with the run; nothing new is stored).
- Art. V.3 (which run a page follows and the elapsed time are pure core functions; the clock is handed in by the app).
- Art. V.8 (progress is shown again instead of an idle page).
- Art. III.7 (the application page only looks at the selected profile's runs).
- Art. III.4 (only the run's ID and kind are handed to the page; never its posting).

## Notes

- Uses `GET /api/runs`' data and the replaying event stream from [run-queue](run-queue.md); the application page reads the run list on the server instead of fetching it, so the progress is there from the first paint.
- The timer compares the server's start time with the browser's clock. Both are the same machine (Art. III.6).
- After an app restart there is nothing to reconnect to: the queue is empty, and the application page offers "Try again" as before.
- "This run is in progress" is new wording, chosen because "This run didn't finish" is untrue while the run is going. Decided 2026-11-17: it stays.
- Decided 2026-11-17: the application page refreshes when its run ends in any way, also for a "Try again" or "Verify again" the page started itself, which until then refreshed only on success ([runs-list-changes](runs-list-changes.md), built 2026-11-21).
- Seen once on 2026-11-17 in headless Chrome under `npm run dev`: the application page reloaded itself in a loop for about a minute on its first visits, also with the page as it was before this task, then stayed stable. Not tried with `npm run start`. The question about it was taken out of the open questions without an answer, so no task was made.
