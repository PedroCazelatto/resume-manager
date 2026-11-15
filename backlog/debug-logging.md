---
title: Opt-in debug logging
id: F31
version: future version
---

## Problem

When a model reply is wrong, there is no way to see the prompt and the raw reply.

## Behaviour

- With `DEBUG_LLM=true` in `.env`, each model call prints its system prompt, prompt, thinking and raw reply to the server's console.
- Off by default. Nothing is written to a file.

## Acceptance criteria

- [ ] Without the setting, the console never shows prompt, profile or resume text.
- [ ] With it, one call prints the four parts, clearly separated, with the step's name.
- [ ] `.env.example` documents the setting and warns that it prints personal data to the terminal.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- `src/adapters/config.ts`: add the setting to `OllamaSettings`; `src/adapters/ollama-client.ts`: print when it is on.
- Unit test with a fake `console`.
- Art. III.4 (an opt-in debug mode may print to the local console only), Art. V.5 (settings documented in `.env.example`).

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: the setting is named `DEBUG_LLM`.
