---
title: Notify when a run ends
id: F38
version: next version
reported: 2026-11-15
---

## Problem

A run can take more than half an hour, and the only way to know it ended is to keep looking at the page.

## Behaviour

- When a run finishes or fails, the browser shows a system notification: "Resume ready" or "Run failed", with the company and role when known.
- The tab title changes to start with "Done" or "Failed" until the tab is focused again.
- Permission for notifications is asked the first time a run is started. If it is denied, only the tab title changes; the app doesn't ask again.

## Acceptance criteria

- [ ] With permission granted, finishing a run in a background tab shows a notification; clicking it focuses the tab.
- [ ] With permission denied, no error appears and the tab title still changes.
- [ ] The title returns to normal when the tab gets focus.
- [ ] A run cancelled by the user produces no notification.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Client only, in `src/components/use-run.tsx` (or a small hook next to it), using the browser's `Notification` API and `document.title`.
- No service worker and no push service: the notification is created by the open page (Art. III.2: no outbound requests).
- Put the message-building logic in a pure function with a unit test.

## Depends on

- Works on its own; with [run-queue](run-queue.md) it fires for every run of the queue.

## Decisions

- Decided 2026-11-15: system notification plus tab title; no sound.
