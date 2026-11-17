---
title: Remove, cancel and delete runs, and other Runs list changes decided on 2026-11-17
id: F48
version: next version
reported: 2026-11-17
---

## Problem

The user's answers of 2026-11-17 change how runs are removed, cancelled and deleted, and a few other things about the rows of the Runs list, as built by [run-queue](run-queue.md) (F42), [cancel-a-run](cancel-a-run.md) (F32), [posting-by-url](posting-by-url.md) (F10), [notify-when-run-ends](notify-when-run-ends.md) (F38) and [reconnect-to-a-run](reconnect-to-a-run.md) (F39). Read those files first: this task changes what they describe, and nothing else. The Runs list itself is later replaced by the home page's table ([home-applications-table](home-applications-table.md)); build this on the list as it is now, and that task moves it.

## Behaviour

1. **"Waiting to fetch".** A link waiting for its turn in the fetch queue reads "waiting to fetch". Only the link being fetched reads "fetching the posting".
2. **Fetch queue: an X removes the link.** A row in the fetch queue (waiting to fetch, or fetching) has an X icon button. It takes the link off the fetch queue and off the list: the link is not fetched, and nothing is saved. A fetch in progress is stopped.
3. **Resume queue: an X cancels the generation.** A run in the resume queue (waiting for the model, or running) has an X icon button that cancels it, in the Runs list and on the application page. A cancelled run stays listed as "cancelled", with "Try again", so it can be started again. This replaces "Remove" on waiting runs and the "Cancel" button on the running one.
4. **A trash button deletes a cancelled run.** Only a cancelled run has a trash-can icon button. It removes the run entirely, at once, without a confirmation box: the user had to cancel it first. What it does to files the run already saved is not decided (see Decisions); until then it never deletes a file (Art. IV.8).
5. **Icons.** The X and the trash can are Phosphor icons, used through one icon component of the app (details in Decisions). Each icon button has an accessible name ("Remove link", "Cancel", "Delete").
6. **The same row moves on after pasting.** After the user pastes the text on a row that needs it, the pasted text goes to that same run: the row keeps its place, leaves the "needs the posting's text" state and joins the end of the resume queue. No new run takes its place, and `replaces` is no longer needed. (Whether pasting stays offered on a failed fetch is in Decisions.)
7. **A failed fetch has its own notification.** Instead of "Run failed", a failed fetch is told as "Couldn't read the posting: paste the text" (the user's example wording), with the link as the body. The tab title still starts with "Failed".
8. **The application page refreshes on any end.** A "Try again" or "Verify again" started from the application page refreshes the page when its run ends in any way (finished, failed, cancelled), like a run the page picked up after a reload does today.

## Acceptance criteria

- [ ] Two links sent together: the first reads "fetching the posting", the second "waiting to fetch", until the first is done.
- [ ] The X on a fetching link stops the fetch (the fake fetcher sees the abort) and the row disappears; nothing is written.
- [ ] The X on a waiting run and on the running run cancels it; the row stays as "cancelled" with "Try again", and "Try again" starts it again.
- [ ] The trash button appears only on cancelled rows, removes the row at once with no dialog, and deletes no file until Decisions say otherwise.
- [ ] Every icon comes through the app's icon component, as described in Decisions.
- [ ] Pasting the text on a row keeps the same run ID: the row moves to the resume queue, and no second row appears.
- [ ] The notification for a failed fetch uses the new words; other failures keep theirs.
- [ ] A failed "Try again" started from the application page refreshes the page.
- [ ] The core logic (statuses, transitions, notification words) has unit tests; `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and the files named under Problem describe the new behaviour.

## Technical notes

- Item 1: `src/core/runs/queue.ts` has one `fetching` status for both; a run whose fetch has started has a `fetch` step in its events (`runSteps`), so the label can be derived without a new status. `STATUS_LABELS` is in `src/components/runs-list.tsx`.
- Items 2–4: `removeWaiting` and `cancelRun` in `src/core/runs/queue.ts`, `remove` in `src/app/runs.ts`, and `DELETE /api/runs/[runId]`, whose answers today are 204 (waiting run removed), 202 (running run cancelling), 409 (ended) and 404 (unknown or another profile's). Waiting runs now become `cancelled` instead of leaving the list; deleting a cancelled run needs its own answer or route, documented in the implemented file. `canTryAgain` / `offersTryAgain` decide "Try again". The application page's waiting line (`RunProgress` with `removable` in `src/components/use-run.tsx`) gets the X too.
- Item 5: Phosphor is the npm package `@phosphor-icons/react`, a new dependency approved by the user on 2026-11-17. The app uses `lucide-react` today (theme toggle and shadcn/ui's dialog, sheet and select).
- Item 6: `dropFetchFailed`, `enqueue(profile, kind, input, replaces?)` in `src/app/runs.ts`, `readNewRunStart` in `src/core/posting/start.ts`, `pasteInstead` in `src/components/new-application-form.tsx`. A new transition from a run that needs its text to `queued` with the pasted posting, for the same profile only (Art. III.7).
- Item 7: `runNotice` in `src/core/runs/notice.ts`; `fetchFailed` in `src/core/runs/queue.ts` says which failures are fetches. The browser side is `src/components/run-notifications.ts`.
- Item 8: `src/components/retry-run.tsx` and `src/components/resume-editor.tsx` call `router.refresh()` only when `start` returns an ID; `src/components/use-active-run.ts` shows the "any end" version.
- The posting is never logged, listed or streamed (Art. III.4).

## Depends on

- [run-queue](run-queue.md), [posting-by-url](posting-by-url.md), [cancel-a-run](cancel-a-run.md), [notify-when-run-ends](notify-when-run-ends.md), [reconnect-to-a-run](reconnect-to-a-run.md), [try-again-failed-run](try-again-failed-run.md) (all implemented).
- [link-handling-changes](link-handling-changes.md) touches the same files; build the two one after the other.

## Decisions

- Decided 2026-11-17: "Its own wording, e.g. 'waiting to fetch'".
- Decided 2026-11-17 (the user, replacing the same day's earlier answer about "Cancel" during a fetch): "On the fetch-queue, add an 'X' icon button (use Phosphor Icons - create an icon component that imports all icons to it) that removes the link from the fetch-queue. Removing the link means that we will not fetch it and nothing is saved. On the resume-queue, we may have an 'X' button for cancelling the resume generation (this way it can be restarted with something edited) and also a trash can button, for removing the run entirely. For safety reasons, only cancelled runs can be deleted, and this way we also don't need a confirmation box."
- Decided 2026-11-17 (after pasting the text): "The same row moves on."
- Decided 2026-11-17: a failed fetch has its own notification words, "e.g. 'Couldn't read the posting: paste the text'".
- Decided 2026-11-17: the application page refreshes on any end, in both cases.
- Decided 2026-11-17: pasted text is a last resort; where it sits in the queue doesn't matter ("It doesn't matter right now").
- Not ready until answered in `OPEN-QUESTIONS.md`: what the trash button does to files the run saved (Art. IV.8); what "restarted with something edited" means; whether a link whose fetch failed has the X too; how the icon component is organised and whether `lucide-react` goes; whether pasting stays offered on a failed fetch.
