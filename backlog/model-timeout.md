---
title: The model timed out before writing the resume
id: F37
version: implemented
reported: 2026-11-14
---

## Problem

The first real run never produced a resume: the model call hit the 30-minute timeout, and the page gave no sign of what the model was doing.

## Cause

With thinking on, the model reasons silently before it writes. Measured on 2026-11-14 with the example profile and a small analysis prompt: about 5.5 tokens per second, 10 minutes of thinking, 11m50s in total. The tailor step has a much larger prompt, so it can pass 30 minutes while working normally.

## What was built

- `OLLAMA_TIMEOUT_MS` is now an idle limit: it restarts with every token, so a call is only stopped when the model sends nothing for that long (commit `fe44356`).
- The running step shows what the model is doing: `thinking, 1,234 tokens`, then `writing, 310 tokens`.
- Thinking stays on for real runs.
