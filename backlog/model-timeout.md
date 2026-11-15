---
title: The model timed out before writing the resume
id: F37
version: implemented
reported: 2026-11-14
---

## What it does

- `OLLAMA_TIMEOUT_MS` is an idle limit: it restarts with every token, so a call is stopped only when the model sends nothing for that long (30 minutes by default).
- The running step shows that the model is thinking or writing, so a long call no longer looks frozen.
- Thinking stays on for real runs.

## Where it lives

- `src/adapters/ollama-client.ts`.
- `src/core/llm.ts`: `LlmProgress`, `onProgress`.

## Tests

- `src/adapters/ollama-client.test.ts` (idle timeout, stalled stream, progress).

## Rules it follows

- Art. V.8 (timeouts are configurable).

## Notes

- Cause, measured 2026-11-14 with the example profile and a small analysis prompt: about 5.5 tokens per second, 10 minutes of silent thinking, 11m50s in total. The old limit counted the whole call.
- If prompt, thinking and reply together exceed `OLLAMA_NUM_CTX`, the step still fails with a context message; see [context-size-warning](context-size-warning.md).
