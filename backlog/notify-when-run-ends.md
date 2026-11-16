---
title: Notify when a run ends
id: F38
version: implemented
reported: 2026-11-15
---

## What it does

- When a run of the selected profile finishes or fails while the user isn't looking at the tab (the page is hidden or its window isn't focused), the browser shows a system notification: "Resume ready" or "Run failed", with the company and role ("Globex · Backend Engineer") when the run got far enough to know them. Clicking it focuses the tab. When the tab is in front, nothing is shown.
- A "Verify again" has its own words: "Verification finished" or "Verification failed". New runs and "Try again" say "Resume ready" / "Run failed".
- If the tab isn't focused at that moment, its title starts with "Done" or "Failed" ("Done · Resume Manager") until the tab is focused again.
- Permission for notifications is asked when a run is started ("Generate resume", "Try again", "Verify again") and the browser has no answer yet. Once it is granted or denied the app never asks again. Without the permission only the tab title changes, and no error appears.
- A run the user cancelled, or removed from the queue, produces no notification and no title change.
- It works wherever a run is watched: the Runs list on the home page (for every run of the queue, also the ones started in another tab) and "Try again" / "Verify again" on the application page. Each run is told about once per tab.
- A run that was already over when the page was opened is not told about.
- There is no sound, no service worker and no push service; the open page creates the notification.

## Where it lives

- `src/core/runs/notice.ts`: the pure logic. `runNotice` (the notification's title, by the run's kind, its body and the tab prefix for a run's end, or null when there is nothing to tell), `showsNotification` (only while the page is hidden or not focused), `noticeTabTitle`, and `endedRuns` (which runs of the Runs list ended since the tab saw them waiting or running).
- `src/components/run-notifications.ts`: the browser side, a small module next to `use-run.tsx`. `askToNotify` (the permission), `watchRun`, `tellRunEnded` (the `Notification` and `document.title`, once per run) and `tellEndedRuns` (for the Runs list).
- `src/components/use-run.tsx`: `enqueueRun` asks for the permission and watches the run it queued; `useRun().follow` tells when the stream it follows ends with `done` or `error`; `start` and `follow` are given the run's kind for the words.
- `src/components/runs-list.tsx`: every refresh of the list hands the runs to `tellEndedRuns`.
- The company and role reach the browser with the run: the stream's `saved` event carries `company` and `role` (`src/core/pipeline/run.ts`; `src/core/pipeline/verify.ts` now sends `saved` too, reading them from `job.md`), `recordEvent` keeps them on the run (`src/core/runs/queue.ts`), and `GET /api/runs` lists them (`RunSummary` in `src/app/runs.ts`).

## Tests

- `src/core/runs/notice.test.ts`: the words for a finished and a failed run, with and without the company and role, for a new run, a "Try again" and a "Verify again"; no notification while the page is visible and focused, one when it is hidden or not focused; nothing for a cancelled, waiting or running run; the tab title; a run is returned once, only after it was seen waiting or running (or queued by this tab), never when it was already over.
- `src/core/runs/queue.test.ts`: the run keeps the company and role of its `saved` event, also when it fails afterwards.
- `src/core/pipeline/run.test.ts`: the `saved` event carries the company and role, for a generation and for "Verify again".
- Not checked in a real browser yet: the permission prompt, the system notification and its click, that none appears while the tab is in front, and the title coming back on focus. Vitest runs in Node, without `Notification` or `document`.

## Rules it follows

- Art. III.2 (no outbound request: the notification is created by the open page).
- Art. III.7 (a tab only learns about runs of the selected profile, through `GET /api/runs` and the run's own stream).
- Art. III.4 (nothing is logged; the company and role only travel to the profile's own page).
- Art. V.3 (the words and the choice of runs are pure core code; the browser APIs stay in `src/components/`).
- Art. IX.2 (the core logic has unit tests).

## Notes

- Decided 2026-11-15: system notification plus tab title; no sound.
- Decided 2026-11-16: the notification is shown only when the page is hidden or the window isn't focused; a user looking at the tab gets none. The title behaves as before: it only changes while the tab isn't focused, since focus puts it back.
- A permission prompt the user closes without answering leaves the browser without an answer, so the next started run asks again (confirmed 2026-11-16). Browsers stop showing the prompt by themselves after a few dismissals.
- Decided 2026-11-16: a finished "Verify again" says "Verification finished" and a failed one "Verification failed". The tab title still starts with "Done" or "Failed".
- A run that fails in its first step has no company and role yet, so its notification has no body.
- With the app open in two tabs, both tell about the run; the notifications share a tag, so the system shows one.
- On the home page the running run is followed through its stream, so its end is told at once. A waiting run that ends without ever being seen running is noticed by the list's refresh, which browsers slow down in a background tab (up to a minute).
- After a reload the tab only knows the runs the Runs list still shows as waiting or running; following a run again on the application page is [reconnect-to-a-run](reconnect-to-a-run.md).
