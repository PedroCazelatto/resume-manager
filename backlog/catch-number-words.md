---
title: Catch numbers written as words
id: F41
version: implemented
reported: 2026-11-15
---

## What it does

- The model review is told that a number written as a word ("five years") is a number, in any language, and that the claim is unsupported when the files it cites don't state that number.
- The code check is unchanged: it still sees digits only.

## Where it lives

- `src/core/prompts/review-resume.ts`: one rule in `reviewResumeSystem`.

## Tests

- `src/core/pipeline/review-resume.test.ts`: asserts the rule is in the system prompt.

## Rules it follows

- Art. II.5 (model-based review of the claims the code checks can't judge).

## Notes

- Why: "over five years of experience" passed the code check in a test run; only the model review flagged it.
- Decided 2026-11-15: handled through the model, so it works in any language; no word lists in code.
- Not tested against a real model: whether the rule changes what the review flags, or adds false alarms, is unknown. One case to watch: a figure the model derives, such as "over five years" when the profile says "since 2019", may now be flagged.
