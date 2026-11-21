---
title: Remove, cancel and archive runs, and other Runs list changes decided on 2026-11-17
id: F48
version: next version
reported: 2026-11-17
---

## Problem

The user's answers of 2026-11-17 change how runs are removed, cancelled and archived, and a few other things about the rows of the Runs list, as built by [run-queue](run-queue.md) (F42), [cancel-a-run](cancel-a-run.md) (F32), [posting-by-url](posting-by-url.md) (F10), [notify-when-run-ends](notify-when-run-ends.md) (F38) and [reconnect-to-a-run](reconnect-to-a-run.md) (F39). Read those files first: this task changes what they describe, and nothing else. The Runs list itself is later replaced by the home page's table ([home-applications-table](home-applications-table.md)); build this on the list as it is now, and that task moves it.

## Behaviour

1. **"Waiting to fetch".** A link waiting for its turn in the fetch queue reads "waiting to fetch". Only the link being fetched reads "fetching the posting".
2. **Fetch queue: an X removes the link.** A row in the fetch queue (waiting to fetch, or fetching) has an X icon button. It takes the link off the fetch queue and off the list: the link is not fetched, and nothing is saved. A fetch in progress is stopped. (Once [application-uuids](application-uuids.md) makes the folder when a fetch starts, this X also deletes that folder.)
3. **Resume queue: an X cancels the generation.** A run in the resume queue (waiting for the model, or running) has an X icon button that cancels it, in the Runs list and on the application page. A cancelled run stays listed as "cancelled", with "Try again", so it can be started again ([edit-before-restart](edit-before-restart.md) adds editing before the restart). This replaces "Remove" on waiting runs and the "Cancel" button on the running one.
4. **An archive button instead of delete.** A cancelled run, a failed run (its fetch or its generation) and a finished application have an archive icon button. It moves the row, at once and without a confirmation box, to the archived list. Nothing is deleted.
   - An application keeps its archived state as `archived_at` in its `job.md` (the time it was archived, a timestamp like `fetched_at`), so it stays archived after a restart. A run that has no application yet keeps the state in memory, with the run.
   - Restoring removes `archived_at` (or the in-memory state). An unfinished run or application comes back with the resume queue's rows as "cancelled", with "Try again"; a finished application comes back with the finished ones.
   - The archived list, with its "Restore" button, is a tab of the home page's table, built by [home-applications-table](home-applications-table.md). This task builds archiving, restoring and the archive button; until that task is built, an archived row just leaves the Runs list.
5. **Failed rows have no X.** A run that failed (its fetch, or its generation) can't be cancelled, so it has no X: only "Try again" and the archive button.
6. **Icons.** Every icon in the app is a Phosphor icon, through one file that is the only place importing from Phosphor: it lists the icons the app uses, and components write `<Icon name="x" />`. A new icon is added to that list when needed. The icons that come from `lucide-react` today move to it, and `lucide-react` is removed. Each icon button has an accessible name ("Remove link", "Cancel", "Archive", "Restore").
7. **Pasting the text on every failed fetch.** Every row whose fetch failed, Indeed links included ([link-handling-changes](link-handling-changes.md)), offers to paste the posting's text. The pasted text goes to that same run: the row keeps its place, leaves the "needs the posting's text" state and joins the end of the resume queue. No new run takes its place, and `replaces` is no longer needed.
8. **A failed fetch has its own notification.** Instead of "Run failed", a failed fetch is told as "Couldn't read the posting: paste the text" (the user's example wording), with the link as the body. The tab title still starts with "Failed".
9. **The application page refreshes on any end.** A "Try again" or "Verify again" started from the application page refreshes the page when its run ends in any way (finished, failed, cancelled), like a run the page picked up after a reload does today.

## Acceptance criteria

- [ ] Two links sent together: the first reads "fetching the posting", the second "waiting to fetch", until the first is done.
- [ ] The X on a fetching link stops the fetch (the fake fetcher sees the abort) and the row disappears; nothing is written.
- [ ] The X on a waiting run and on the running run cancels it; the row stays as "cancelled" with "Try again", and "Try again" starts it again.
- [ ] The archive button appears on cancelled runs, failed runs and finished applications, and on no other row. It takes the row out of the Runs list at once with no dialog, and deletes nothing.
- [ ] Archiving an application writes `archived_at` to its `job.md`, keeping every other field and the body (Art. IV.7, IV.8); the application is still archived after a restart.
- [ ] Restoring (core logic and its route) removes `archived_at`: an unfinished run comes back as "cancelled" with "Try again", a finished application with the finished ones.
- [ ] Failed rows have no X.
- [ ] Every icon comes through the one icon file; nothing imports `lucide-react`, and it is gone from `package.json`.
- [ ] Pasting the text on a row keeps the same run ID: the row moves to the resume queue, and no second row appears.
- [ ] The notification for a failed fetch uses the new words; other failures keep theirs.
- [ ] A failed "Try again" started from the application page refreshes the page.
- [ ] The core logic (statuses, transitions, notification words) has unit tests; `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and the files named under Problem describe the new behaviour.

## Technical notes

- Item 1: `src/core/runs/queue.ts` has one `fetching` status for both; a run whose fetch has started has a `fetch` step in its events (`runSteps`), so the label can be derived without a new status. `STATUS_LABELS` is in `src/components/runs-list.tsx`.
- Items 2–4: `removeWaiting` and `cancelRun` in `src/core/runs/queue.ts`, `remove` in `src/app/runs.ts`, and `DELETE /api/runs/[runId]`, whose answers today are 204 (waiting run removed), 202 (running run cancelling), 409 (ended) and 404 (unknown or another profile's). Waiting runs now become `cancelled` instead of leaving the list; archiving and restoring need their own answers or routes, documented in the implemented file. `canTryAgain` / `offersTryAgain` decide "Try again". The application page's waiting line (`RunProgress` with `removable` in `src/components/use-run.tsx`) gets the X too.
- Item 4: an application's `archived_at` is written through `ProfileStore` (`src/adapters/profile-store.ts`), atomically, keeping unknown fields (Art. IV.7, IV.8), for the selected profile only (Art. III.7); `jobSchema` in `src/core/application/schemas.ts` gains it as an optional timestamp. The sidebar doesn't change.
- Item 6: Phosphor is the npm package `@phosphor-icons/react`, a new dependency approved by the user on 2026-11-17. `lucide-react` is used today by `src/components/theme-toggle.tsx`, `src/components/mobile-menu.tsx` and shadcn/ui's `dialog`, `sheet` and `select` in `src/components/ui/`.
- Item 7: `dropFetchFailed`, `enqueue(profile, kind, input, replaces?)` in `src/app/runs.ts`, `readNewRunStart` in `src/core/posting/start.ts`, `pasteInstead` in `src/components/new-application-form.tsx`. A new transition from a run that needs its text to `queued` with the pasted posting, for the same profile only (Art. III.7).
- Item 8: `runNotice` in `src/core/runs/notice.ts`; `fetchFailed` in `src/core/runs/queue.ts` says which failures are fetches. The browser side is `src/components/run-notifications.ts`.
- Item 9: `src/components/retry-run.tsx` and `src/components/resume-editor.tsx` call `router.refresh()` only when `start` returns an ID; `src/components/use-active-run.ts` shows the "any end" version.
- The posting is never logged, listed or streamed (Art. III.4).

## Depends on

- [run-queue](run-queue.md), [posting-by-url](posting-by-url.md), [cancel-a-run](cancel-a-run.md), [notify-when-run-ends](notify-when-run-ends.md), [reconnect-to-a-run](reconnect-to-a-run.md), [try-again-failed-run](try-again-failed-run.md) (all implemented).
- [link-handling-changes](link-handling-changes.md) touches the same files; build the two one after the other.
- A constitution amendment adding `archived_at?` to the `job.md` row of Art. IV.5. Not made yet; the user reviews it before this task is built.

## Decisions

- Decided 2026-11-17: "Its own wording, e.g. 'waiting to fetch'".
- Decided 2026-11-17 (the user, replacing the same day's earlier answer about "Cancel" during a fetch): "On the fetch-queue, add an 'X' icon button (use Phosphor Icons - create an icon component that imports all icons to it) that removes the link from the fetch-queue. Removing the link means that we will not fetch it and nothing is saved. On the resume-queue, we may have an 'X' button for cancelling the resume generation (this way it can be restarted with something edited) and also a trash can button, for removing the run entirely. For safety reasons, only cancelled runs can be deleted, and this way we also don't need a confirmation box."
- Decided 2026-11-17 (after pasting the text): "The same row moves on."
- Decided 2026-11-17: a failed fetch has its own notification words, "e.g. 'Couldn't read the posting: paste the text'".
- Decided 2026-11-17: the application page refreshes on any end, in both cases.
- Decided 2026-11-17: pasted text is a last resort; where it sits in the queue doesn't matter ("It doesn't matter right now").
- Decided 2026-11-17 (instead of the trash button): "Change the trash can to an archive icon, moving the run to another list (archived list), accessible from the sidebar. One archived item can be restored." The list's place changed on 2026-11-21 (below).
- Decided 2026-11-17 (a failed row): "If it failed, we cant cancel, so no X button. Just delete or retry."
- Decided 2026-11-17 (icons): one file that lists the icons the app uses, "Yes, that works. And move the library too."
- Decided 2026-11-17 (pasting): "Remove the 'Paste text' tab. Each row with a failed fetch (including Indeed) can have the option to paste the text."
- Decided 2026-11-17 (restart): "The user can edit the posting text only, or add a note for the model"; built in [edit-before-restart](edit-before-restart.md).
- Decided 2026-11-21 (which rows): "Yes, the failed row now has 'retry' and 'archive'." The "delete" on a failed row is the archive button. A finished application can be archived too, and restoring it puts it back with the finished ones (chosen 2026-11-21).
- Decided 2026-11-21 (how the archived state is kept): an optional `archived_at` in `job.md`, chosen over moving the folder into `applications/archived/`. The user also said: "Right after starting the fetch, create the job.md, so anything saved on memory goes to a hard drive." That is built by [application-uuids](application-uuids.md).
- Decided 2026-11-21 (restoring): "Put the row back in Generating." An unfinished row comes back as "cancelled", with "Try again".
- Decided 2026-11-21 (where): "Now the archived applications can go to a new tab instead of the sidebar." Chosen the same day: this task builds archiving, restoring and the archive button, and the tab comes with [home-applications-table](home-applications-table.md); until then, archived rows just leave the Runs list.
