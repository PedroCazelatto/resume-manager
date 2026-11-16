---
title: Warn when a model call won't fit the context window
id: F40
version: implemented
reported: 2026-11-15
---

## What it does

- Before each model call (analysing, writing the resume, reviewing), the app estimates the prompt's size: the characters of the system prompt, the prompt and the JSON schema, divided by 3, rounded up.
- When the estimate is more than half of `OLLAMA_NUM_CTX`, the step shows under its line: "This step's prompt is about N tokens, more than half of the N-token context window. If the step fails, raise OLLAMA_NUM_CTX."
- The run always continues: the warning never blocks, even when the estimate is larger than the whole window.
- A step at or below half of the window shows nothing.
- The warning appears when the step starts and stays under the step after it ends, for as long as the run's steps are shown. A page that opens the run's stream later gets it too, because the stream replays it.

## Where it lives

- `src/core/llm.ts`: `contextTokens` on `LlmClient`; `estimatePromptTokens`, `contextWarning` (the threshold and the message) and `generateWithWarning`, which the three step functions call instead of `llm.generate`.
- `src/adapters/ollama-client.ts`: `contextTokens` comes from `OLLAMA_NUM_CTX`.
- `src/core/pipeline/analyse-posting.ts`, `tailor-resume.ts`, `review-resume.ts`: accept `onWarning`.
- `src/core/pipeline/run.ts`, `verify.ts`: the event `{ type: "warning"; step; message }`.
- `src/components/use-run.tsx`: `useRun().warnings`, one message per step; `RunProgress` shows it under the step.

## Tests

- `src/core/llm.test.ts`: the estimate (the three parts, rounding up, the schema counts); the threshold (nothing at exactly half, the message above it and above the whole window); `generateWithWarning` warns before the call, still makes it, and says nothing below the threshold.
- `src/core/pipeline/run.test.ts`: with a small window every model step sends its warning before the model's progress and the run still finishes; no warning event below the threshold; "Verify again" warns in its review step.
- `src/core/runs/queue.test.ts`: the warning stays in the run's event history, so a replay carries it.
- `src/adapters/ollama-client.test.ts`: `contextTokens` is the configured context size.
- Not looked at in a browser: no run was made with the real model for this task.

## Rules it follows

- Art. V.3 (the estimate and the threshold are pure functions in core; the window size reaches core through `LlmClient`).
- Art. V.8 (feedback per step before a long wait).
- Art. III.4 (the message carries sizes only, no prompt text).
- Art. IX.2 (tests use a fake model).

## Notes

- Decided 2026-11-15: warn and continue; never refuse to start.
- It is an estimate with a margin, not a count; the thinking's size can't be known in advance.
- Basis for 50%: on 2026-11-14 a 1,067-token prompt produced about 3,100 tokens of thinking plus 550 of reply.
- The Runs list shows a run's steps only while it runs, so the warning leaves that list with the steps when the run ends.
