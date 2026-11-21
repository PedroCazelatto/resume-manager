---
title: Push the Runs list from the server instead of polling it
id: F53
version: future version
reported: 2026-11-21
---

## Problem

The Runs list (`src/components/runs-list.tsx`) and the sidebar's runs count (`src/components/runs-indicator.tsx`) each ask `GET /api/runs` every 2 seconds, all the time, even when nothing is being fetched, waiting or running ([run-queue](run-queue.md), [visual-pass](visual-pass.md)). On the home page that is about one request per second for each open tab, which floods the server console. The user reported it on 2026-11-21: "The app has a problem that it is reloading every second, with a lot of GETs to the '/api/runs'", and asked for an urgent fix.

## Behaviour

- The server pushes the selected profile's runs list to the browser over an open connection every time the list changes. The browser never polls for it.
- The list is sent once when the connection opens, then again only when something in it changes: a run is queued, starts fetching, joins the run queue, starts, moves to another step, gets a context-size warning, finishes, fails, is cancelled or is removed. The running step's token progress doesn't change the list, so it sends nothing. The running run's own stream (`/api/runs/[runId]/events`) still carries the progress.
- The sidebar's count, the Runs list and the notifications of ended runs ([notify-when-run-ends](notify-when-run-ends.md)) are fed by the pushed lists. They show and tell what they do today, without waiting up to 2 seconds. A run that was waiting and ends while the tab is in the background is still told about.
- A list holds only the selected profile's runs (Art. III.7). After the user switches the profile, the next list is the new profile's.
- If the connection drops (the app restarted, the computer slept), the browser opens it again by itself.
- A pushed list holds exactly what `GET /api/runs` answers today: never the posting's text (Art. III.4). `GET /api/runs` stays for anything that needs the list once.

## Acceptance criteria

- [ ] With an app page open and nothing being fetched, waiting or running, the server's console shows no `GET /api/runs` after the page has loaded.
- [ ] Queuing, starting, a step changing, finishing, failing, cancelling and removing a run each update the Runs list and the sidebar count, with no polling request from the page.
- [ ] The running step's token progress sends no list (registry test).
- [ ] Another profile's runs never reach the connection (registry test), and switching the profile shows the new profile's runs.
- [ ] Restarting the app: an open page connects again by itself and shows the list.
- [ ] A notification still comes when a run ends while the tab is in the background, a run that waited in the queue included (checked by hand with the model mocked or a short posting).
- [ ] The registry's change notification has unit tests in `src/app/runs.test.ts`. `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [run-queue](run-queue.md), [visual-pass](visual-pass.md), [notify-when-run-ends](notify-when-run-ends.md) and [home-applications-table](home-applications-table.md) describe the pushed list instead of the 2-second refresh.

## Technical notes

- Server: `createRunRegistry` in `src/app/runs.ts` keeps the runs in `let runs`, reassigned in `work`, `fetchWork`, `add`, `enqueue`, `retry` and `remove`. Route every change through one place that tells the watchers. A watcher is sent its profile's `list(profile)` only when it differs from the last list it was sent (compare the serialised lists), so progress events and other changes that leave the list as it was send nothing. Expose it as a registry method that starts watching a profile and returns how to stop. Tasks built later that add registry changes go through the same place.
- Route: a streaming route next to `GET /api/runs`, one JSON list per line (`application/x-ndjson`), like `src/app/api/runs/[runId]/events/route.ts`. It resolves the profile from the cookie (`selectedProfile` in `src/app/run.ts`) and stops watching when the browser goes away (the `ReadableStream`'s `cancel`). Name it in the implemented file.
- Browser: one shared client module holds the latest list and the connection, and `RunsIndicator` and `RunsList` read it (for example through `useSyncExternalStore`). The two 2-second `setInterval`s go, and so does `RUNS_CHANGED` in `src/components/use-run.tsx` with its listeners: the server pushes the change itself. `remove` in `runs-list.tsx` and `ActiveRun`'s `onEnd` no longer refresh by hand. `RunsList` keeps handing each new list to `tellEndedRuns` (`src/components/run-notifications.ts`).
- Switching the profile: `src/components/profile-picker.tsx` calls the server action `selectProfile` (`src/app/actions.ts`), which sets the cookie. The page then re-renders without a reload, so the open connection still belongs to the old profile and has to be opened again.
- `RetryRun` (`src/components/retry-run.tsx`) asks `GET /api/runs` once when the page opens, for the run's language. [english-only-resumes](english-only-resumes.md) removes that request. If it is still there, leave it: it is a single request, not a poll.
- Browsers allow at most 6 open connections per host over HTTP/1.1 (the app's server), shared by every tab, and each tab that follows a running run already holds one for the run's stream.
- Core stays pure (Art. V.3). Anything that can be a pure function (for example, deciding whether a list changed) goes in `src/core/` with tests. The connection code is in `src/app/` and `src/components/`.

## Depends on

- [run-queue](run-queue.md), [notify-when-run-ends](notify-when-run-ends.md), [visual-pass](visual-pass.md) (implemented).
- [home-applications-table](home-applications-table.md) is built before this task: it replaces the Runs list and the sidebar's count with the home page's table and its Generating tab, and the pushed list feeds those instead. Check the file names in the technical notes against the code when this task is picked up.

## Decisions

- Decided 2026-11-21 (the user): the list is pushed by the server ("Server push"), chosen over polling only while a run is open and over polling more slowly. No polling at all, and instant updates, also for runs started from another tab.
- Decided 2026-11-21 (the user): this is a backlog task of the next version, not an immediate fix ("Do not implement it now, create a backlog file and add it to the next-version feature list").
- Decided 2026-11-21 (the user): moved to the future version. Until it is built, the list keeps its 2-second refresh.
