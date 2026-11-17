---
title: Runs list changes decided on 2026-11-17
id: F48
version: next version
reported: 2026-11-17
---

## Problem

The user's answers of 2026-11-17 change how rows of the Runs list behave, as built by [run-queue](run-queue.md) (F42), [posting-by-url](posting-by-url.md) (F10), [notify-when-run-ends](notify-when-run-ends.md) (F38) and [reconnect-to-a-run](reconnect-to-a-run.md) (F39). Read those files first: this task changes what they describe, and nothing else.

## Behaviour

1. **"Waiting to fetch".** A link waiting for its turn in the fetch queue reads "waiting to fetch". Only the link being fetched reads "fetching the posting".
2. **Cancel instead of Remove during a fetch.** A row that is waiting to fetch or fetching has "Cancel" instead of "Remove". Cancelling stops its fetch; the row stays in the list as "cancelled", with "Try again", which puts the link back at the end of the fetch queue. Whether runs waiting in the run queue (in the Runs list and on the application page) change the same way: see Decisions; that part is not ready until answered.
3. **Only cancelled rows can be deleted.** A cancelled row has "Delete", which takes it off the list. Deleting a row never deletes a file: an application folder the run saved stays (Art. IV.8). Rows that finished or failed have no "Delete".
4. **The same row moves on after pasting.** After "Paste the text instead" on a failed fetch, the pasted text and link go to that same run: the row keeps its place in the list, leaves the "needs the posting's text" state and joins the end of the run queue. No new run takes its place, and `replaces` is no longer needed.
5. **A failed fetch has its own notification.** Instead of "Run failed", a failed fetch is told as "Couldn't read the posting: paste the text" (the user's example wording), with the link as the body. The tab title still starts with "Failed".
6. **The application page refreshes on any end.** A "Try again" or "Verify again" started from the application page refreshes the page when its run ends in any way (finished, failed, cancelled, removed), like a run the page picked up after a reload does today.

## Acceptance criteria

- [ ] Two links sent together: the first reads "fetching the posting", the second "waiting to fetch", until the first is done.
- [ ] Cancel on a fetching row stops the fetch (the fake fetcher sees the abort), and the row is listed as cancelled with "Try again"; "Try again" fetches the link again.
- [ ] "Delete" appears only on cancelled rows, takes the row off the list, and leaves every file in place.
- [ ] Pasting text for a failed fetch keeps the same run ID: the row moves to the run queue, and no second row appears.
- [ ] The notification for a failed fetch uses the new words; other failures keep theirs.
- [ ] A failed "Try again" started from the application page refreshes the page.
- [ ] The core logic (statuses, transitions, notification words) has unit tests; `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and the files named under Problem describe the new behaviour.

## Technical notes

- Item 1: `src/core/runs/queue.ts` has one `fetching` status for both; a run whose fetch has started has a `fetch` step in its events (`runSteps`), so the label can be derived without a new status. `STATUS_LABELS` is in `src/components/runs-list.tsx`.
- Items 2–3: `removeWaiting` and `cancelRun` in `src/core/runs/queue.ts`, `remove` in `src/app/runs.ts`, `DELETE /api/runs/[runId]` (its answers are listed in [cancel-a-run](cancel-a-run.md) and [run-queue](run-queue.md)); deleting a cancelled row needs either a new answer of that route or a new route, documented in the implemented file. `canTryAgain` / `offersTryAgain` decide "Try again".
- Item 4: `dropFetchFailed`, `enqueue(profile, kind, input, replaces?)` in `src/app/runs.ts`, `readNewRunStart` in `src/core/posting/start.ts`, `pasteInstead` in `src/components/new-application-form.tsx`. A new transition from a failed fetch to `queued` with the pasted posting, for the same profile only (Art. III.7).
- Item 5: `runNotice` in `src/core/runs/notice.ts`; `fetchFailed` in `src/core/runs/queue.ts` says which failures are fetches. The browser side is `src/components/run-notifications.ts`.
- Item 6: `src/components/retry-run.tsx` and `src/components/resume-editor.tsx` call `router.refresh()` only when `start` returns an ID; `src/components/use-active-run.ts` shows the "any end" version.
- The posting is never logged, listed or streamed (Art. III.4).

## Depends on

- [run-queue](run-queue.md), [posting-by-url](posting-by-url.md), [cancel-a-run](cancel-a-run.md), [notify-when-run-ends](notify-when-run-ends.md), [reconnect-to-a-run](reconnect-to-a-run.md), [try-again-failed-run](try-again-failed-run.md) (all implemented).
- [link-handling-changes](link-handling-changes.md) touches the same files; build the two one after the other.

## Decisions

- Decided 2026-11-17: "Its own wording, e.g. 'waiting to fetch'".
- Decided 2026-11-17 (on "Remove" during a fetch): "Keep it listed as 'cancelled' with 'Try again'. Change the button to 'Cancel', and then only items on the state 'cancelled' can be deleted."
- Decided 2026-11-17 (after pasting the text): "The same row moves on."
- Decided 2026-11-17: a failed fetch has its own notification words, "e.g. 'Couldn't read the posting: paste the text'".
- Decided 2026-11-17: the application page refreshes on any end, in both cases.
- Not ready until answered in `OPEN-QUESTIONS.md`: whether runs waiting in the run queue also get "Cancel" (and become cancelled rows) instead of "Remove".
