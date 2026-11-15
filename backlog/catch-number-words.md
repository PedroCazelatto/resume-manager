---
title: Catch numbers written as words
id: F41
version: next version
reported: 2026-11-15
---

## Problem

The code check only sees digits. "Over five years of experience" passed it in a test run; only the model review flagged it.

## Behaviour

- The model review is told explicitly to treat numbers written as words as numbers and to flag the ones the cited files don't state.
- The code check stays as it is.

## Acceptance criteria

- [ ] The review's system prompt contains the instruction, and a unit test asserts it.
- [ ] Nothing changes in `checkResume`.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- `src/core/prompts/review-resume.ts`: add one rule to `reviewResumeSystem`, e.g. "Numbers written as words (\"five years\", \"a dozen\") are numbers: flag them when the cited files don't state that number."
- `src/core/pipeline/review-resume.test.ts`: assert the system prompt includes it.

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: handled through the model, so it works in any language; no word lists in code.
