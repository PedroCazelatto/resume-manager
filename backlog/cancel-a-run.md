---
title: Cancel a running generation
id: F32
version: next version
reported: 2026-11-14
---

## Problem

Once a run starts there is no way to stop it. A mistake in the posting or the language means waiting for it or restarting the app.

## Behaviour

- A Cancel button sits next to the running step, wherever a run's progress is shown (home form, Runs list, application page).
- Cancelling stops the model call in Ollama, not only the page.
- The run ends as `cancelled`. Files of finished steps stay saved; nothing is deleted or offered for deletion.
- When the cancelled run has an application folder, its page offers "Try again", as with a failed run.

## Acceptance criteria

- [ ] After Cancel, the run's status is `cancelled` within a few seconds and the next waiting run starts.
- [ ] The model stops generating: checked by hand with `ollama ps` or GPU activity, and by a unit test showing the abort signal reaches the client's fetch.
- [ ] A cancelled run that had saved its analysis can be continued with "Try again" and skips the finished steps.
- [ ] Cancelling is not reported as an error: the page says the run was cancelled.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- `src/core/llm.ts`: add `signal?: AbortSignal` to `LlmRequest` and a `cancelled` kind to `LlmError`.
- `src/adapters/ollama-client.ts`: combine the request's signal with the idle-timeout signal (`AbortSignal.any`); an abort from the request's signal becomes `LlmError("cancelled")`.
- `src/core/pipeline/run.ts` and the three step functions: accept and pass on the signal; stop between steps when it is aborted.
- `src/app/runs.ts`: `DELETE /api/runs/[runId]` on a running run calls its `AbortController.abort()`.
- `src/components/use-run.tsx`: the Cancel button and the `cancelled` state.

## Depends on

- [run-queue](run-queue.md): the server must know the running run to stop it.

## Decisions

- Decided 2026-11-15: cancelling keeps what was saved and offers "Try again"; it never deletes or asks to delete.
