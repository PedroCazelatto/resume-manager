---
title: Cancel a running generation
id: F32
version: implemented
reported: 2026-11-14
---

## What it does

- A "Cancel" button sits next to the running step wherever a run's steps are shown: the Runs list on the home page, "Try again" on the application page, and "Verify again" on the application page.
- Cancelling stops the model call in Ollama, not only the page: the app closes its connection to Ollama, which makes Ollama stop generating.
- The run ends as `cancelled` and the next waiting run starts. A run that is between two steps stops before the next one.
- Files of finished steps stay saved. Nothing is deleted or offered for deletion.
- A cancelled run that has an application folder links to it from the Runs list; the application page offers "Try again", which skips the finished steps, as with a failed run.
- Cancelling is not an error: the Runs list says "cancelled", and the page that was following the run says "This run was cancelled. The finished steps stay saved." No error message is shown or stored.
- A waiting run is still taken off the queue with "Remove" and leaves the list, as before.

## Where it lives

- `src/core/llm.ts`: `signal` on `LlmRequest`, the `cancelled` kind of `LlmError`, and `stopIfCancelled`, which the pipeline calls before each step.
- `src/adapters/ollama-client.ts`: the request's signal is combined with the idle-timeout signal (`AbortSignal.any`) and handed to fetch; an abort from the request's signal becomes `LlmError("cancelled")`, an idle timeout stays `timeout`.
- `src/core/pipeline/run.ts`, `verify.ts`, `analyse-posting.ts`, `tailor-resume.ts`, `review-resume.ts`: accept the signal and pass it on to the model call.
- `src/core/runs/queue.ts`: `cancelRun` (status `cancelled`, no error) and the stream's `cancelled` event.
- `src/app/runs.ts`: the registry keeps the running run's `AbortController` and hands its signal to the executor; `remove` aborts it for a running run. The run becomes `cancelled` only when its work has stopped, so two runs never use the model at once.
- `src/app/run.ts`: the executor passes the signal to `runApplication` and `verifyApplication`.
- `DELETE /api/runs/[runId]`: 204 for a waiting run (removed), 202 for the running run (cancelling; its stream ends with `cancelled`), 409 for a run that has already ended, 404 for an unknown or another profile's run.
- `src/components/use-run.tsx`: `useRun().cancel`, `.cancelling` and `.cancelled`; `RunProgress` shows the button and the cancelled line.

## Tests

- `src/adapters/ollama-client.test.ts`: the signal reaches the client's fetch; an abort before or in the middle of the stream becomes `cancelled`; an idle timeout is still `timeout`.
- `src/core/pipeline/run.test.ts` ("cancelling a run"): the signal reaches every model call; no call when already cancelled; the run stops before the next step and keeps the saved files; a cancelled run continues with "Try again" without analysing again; "Verify again" stops before the review.
- `src/core/runs/queue.test.ts`: a cancelled run has no error, ends with the `cancelled` event, lets the next one start and counts as finished.
- `src/app/runs.test.ts` ("cancelling the running run"): the signal is aborted, the run ends as `cancelled` and the next one starts; the next one waits until the cancelled one has really stopped; the application ID is kept; a run that still got to its end is `done`; another profile can't cancel it.
- Checked by hand on 2026-11-15 with the real model: two runs queued, the running one cancelled after 30 seconds. Its status was `cancelled` within the same second, Ollama's log showed the chat call ending at that moment, the second run started by itself, and Ollama answered a new call at once.

## Rules it follows

- Art. IV.8 (cancelling deletes and overwrites nothing).
- Art. VI (each step's output is saved, so a cancelled run resumes from the last completed step).
- Art. V.3 (the signal is a plain value in core; only the adapter touches the network).
- Art. III.7 (a run can only be cancelled by its own profile).
- Art. III.4 (the cancelled message carries no prompt or reply text).

## Notes

- Decided 2026-11-15: cancelling keeps what was saved and offers "Try again"; it never deletes or asks to delete.
- The home form shows no progress since [run-queue](run-queue.md); its runs are cancelled from the Runs list below it.
- A run cancelled while its first step is running has no application folder yet, so there is nothing to try again; the posting has to be pasted again.
- A run cancelled after its last model call has returned finishes normally and is listed as finished.
