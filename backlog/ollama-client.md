---
title: Local model through Ollama
id: F29
version: implemented
---

## What it does

- Every model call goes to the local Ollama with the reply's JSON schema, and the reply is validated against it.
- Model, context size, thinking mode and timeout come from `.env` (`OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, `OLLAMA_THINK`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_BASE_URL`); no model name is hard-coded.
- Prompts and replies that don't fit the context window fail with a clear message instead of being truncated.
- Errors are named: unreachable, timeout, context, invalid output, cancelled ([cancel-a-run](cancel-a-run.md)), other Ollama error. Messages never contain prompt or reply text.

## Where it lives

- `src/core/llm.ts`: the `LlmClient` interface, `LlmError`, `parseLlmReply`.
- `src/adapters/ollama-client.ts`, `src/adapters/config.ts`.
- `src/app/llm.ts`.

## Tests

- `src/adapters/ollama-client.test.ts`, `src/adapters/config.test.ts`, `src/core/llm.test.ts`.

## Rules it follows

- Art. III.1 (self-hosted Ollama only), Art. III.4 (no prompt or profile text in logs), Art. V.5–V.6 (settings from the environment, structured output).
