---
title: Warn when a model call won't fit the context window
id: F40
version: next version
reported: 2026-11-15
---

## Problem

If the prompt, the model's thinking and the reply together exceed `OLLAMA_NUM_CTX`, the step fails only after a long wait.

## Behaviour

- Before each model call, the app estimates the prompt's size. When it is more than half of the context window, the step shows a warning with the estimate, the window size and the setting to raise.
- The run continues: the warning never blocks.

## Acceptance criteria

- [ ] A step whose prompt is estimated above 50% of `OLLAMA_NUM_CTX` shows: "This step's prompt is about N tokens, more than half of the N-token context window. If the step fails, raise OLLAMA_NUM_CTX."
- [ ] A step below the threshold shows nothing.
- [ ] The warning is visible while the step runs and stays after it ends.
- [ ] Unit tests cover the estimate and the threshold.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Estimate: characters of system prompt, prompt and JSON schema, divided by 3, rounded up. It is an estimate with a margin, not a count; the thinking's size can't be known in advance.
- Pure function in `src/core/llm.ts` (or `src/core/pipeline/`), called by the three step functions.
- `LlmClient` gains `readonly contextTokens: number` (from `OLLAMA_NUM_CTX` in `src/adapters/ollama-client.ts`).
- New event `{ type: "warning"; step; message }` in `src/core/pipeline/run.ts`, shown by `RunProgress` in `src/components/use-run.tsx`.
- Basis for 50%: on 2026-11-14 a 1,067-token prompt produced about 3,100 tokens of thinking plus 550 of reply.

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: warn and continue; never refuse to start.
