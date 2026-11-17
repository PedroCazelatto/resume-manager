---
title: Try a failed run again
id: F19
version: implemented
---

## What it does

- Each step's output is saved as soon as it exists, so a failed run can be continued instead of restarted.
- "Try again" appears on the application page whenever `resume.md` or `verification.md` is missing.
- Steps whose output file exists are skipped: a run with a saved analysis goes straight to the resume; one with a saved resume goes straight to verification.
- A new run that failed or was cancelled before its analysis was saved has no application folder. The Runs list offers "Try again" on such a run: it queues a new run with the same posting text, or, for a run whose fetch failed, the same link in the fetch queue again ([posting-by-url](posting-by-url.md)), and the same language. A run that has an application links to its page instead, which has its own "Try again".
- The server keeps the posting and the chosen language in memory with the run, for as long as the run stays in the Runs list. After a restart they are gone, and the posting has to be pasted again.
- The posting never leaves the server again: it is not logged and not part of `GET /api/runs`. The button sends only the run's ID.
- The language field next to "Try again" on the application page is prefilled with the language of the application's latest run (a new application or a "Try again", not a "Verify again") while the server still lists one. Otherwise it is prefilled from the browser's local storage, where the chosen language is remembered per application.

## Where it lives

- `src/core/pipeline/run.ts`: `runApplication` with `start: { id }`.
- `src/core/runs/queue.ts`: `canTryAgain` (a new run that failed or was cancelled and has no application) and `latestGeneration` (the run whose language the application page starts from).
- `src/app/runs.ts`: the registry keeps each run's request (`RunRequest`: the posting, link or application ID, and the language); `retry` queues it again as a new run; `RunSummary` carries `retryable` and `language`.
- `src/app/run.ts`: `retryRun`. `POST /api/runs/[runId]` answers `{ runId }` with 202, 404 for an unknown or another profile's run, 409 for a run that can't be tried again this way.
- `src/app/api/applications/[id]/route.ts`: "Try again" on a saved application.
- `src/components/runs-list.tsx` (the list's "Try again"), `src/components/retry-run.tsx` (the application page's, with the language field), `src/components/use-run.tsx` (the local-storage copy of the language).

## Tests

- `src/core/pipeline/run.test.ts` ("trying again").
- `src/core/runs/queue.test.ts`: which runs can be tried again from the list; the latest run that asked for an application's resume, in the list's order, never a "Verify again".
- `src/app/runs.test.ts` ("trying a run without an application again"): the new run gets the same posting and language; a run cancelled in its first step can be tried again; a run with an application, or one that is waiting, running or finished, is refused; another profile's run is unknown; the posting is not in the list and nothing is logged.
- Checked by hand on 2026-11-16 against the built app with `example-profiles` and an Ollama address nothing listens on (no model call): a failed new run was listed as `retryable` without its posting, `POST /api/runs/[runId]` answered 202 and queued a run with the same language, an unknown run answered 404, and the server log held no posting text.
- Not looked at in a browser: the button in the Runs list and the prefilled language field.

## Rules it follows

- Art. VI (each step's output is saved; a failed run resumes from the last completed step).
- Art. IV.8 (nothing is overwritten).
- Art. IV.1 (the kept posting and language are part of the run, the one piece of state held in memory).
- Art. III.4 (the kept posting is never logged) and Art. III.7 (only the run's own profile can queue it again).
- Art. V.3 (which run can be tried again is decided in core).

## Notes

- Decided 2026-11-16: a run with no application can be tried again from the Runs list, with the posting and language the server kept in memory; losing them on restart is accepted.
- Decided 2026-11-16: the chosen language is kept with the run on the server and is what "Try again" starts from; the browser's local-storage copy stays as the fallback after a restart.
- The run that was tried again stays in the list and keeps its button, so it can be queued more than once.
- The application page reads the language from `GET /api/runs` when it opens. When the resume is already written, no language field is shown, because the language no longer matters.
