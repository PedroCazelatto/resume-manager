---
title: Accept a list of job links at once
id: F33
version: next version
reported: 2026-11-14
---

## Problem

Applying to several jobs means starting each run by hand and waiting for it to finish.

## Behaviour

- The "From links" tab accepts several links, one per line.
- Each link becomes its own run in the queue, in the order given, each in its own application folder. The chosen language applies to all of them.
- The Runs list shows which link is running, which are waiting, and which finished or failed, each with its reason.
- When a link fails, the queue continues with the next one. A failed link can be started again from the Runs list.
- Lines that are not valid links are pointed out before anything starts; the same link given twice is queued once.

## Acceptance criteria

- [ ] Pasting three links queues three runs; they run one after another without further action.
- [ ] With the second link failing to fetch, the first and third still produce applications and the second is listed as failed with its reason and a "Try again" button.
- [ ] An invalid line blocks the submission and is named in the message.
- [ ] Blank lines are ignored.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Parsing and de-duplicating the lines is a pure function in `src/core/posting/` with unit tests.
- `POST /api/applications` accepts `{ urls: string[], language }` and enqueues one run per link, answering their `runId`s.
- A failed link run keeps its link in the registry so "Try again" can enqueue it again.

## Depends on

- [posting-by-url](posting-by-url.md).
- [run-queue](run-queue.md).
- [cancel-a-run](cancel-a-run.md): a list can take hours.

## Decisions

- Decided 2026-11-15: a failure does not stop the rest.
- Each link is a full run of three model calls, so a list can take hours.
