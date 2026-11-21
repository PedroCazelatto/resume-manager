---
title: Try a failed run again
id: F19
version: implemented
---

## What it does

- Each step's output is saved as soon as it exists, so a failed run can be continued instead of restarted.
- "Try again" appears on the application page whenever `resume.md` or `verification.md` is missing.
- Steps whose output file exists are skipped: a run with a saved analysis goes straight to the resume; one with a saved resume goes straight to verification.
- A new run that failed or was cancelled before its analysis was saved has no application folder. The Runs list offers "Try again" on such a run: it queues a new run with the same posting text, or, for a run whose fetch failed, the same link in the fetch queue again ([posting-by-url](posting-by-url.md)). The button is used once: after that the run has no "Try again" while the run it queued is still listed. If that run fails or is cancelled, it has its own button; once it has left the list, the button comes back on the first one. A cancelled waiting run stays listed since [runs-list-changes](runs-list-changes.md), so it is the one that has the button. A run that has an application links to its page instead, which has its own "Try again".
- The server keeps the posting in memory with the run, for as long as the run stays in the Runs list. After a restart it is gone, and the posting has to be pasted again.
- The posting never leaves the server again: it is not logged and not part of `GET /api/runs`. The button sends only the run's ID.
- "Try again" has no language field: every resume is written in English ([english-only-resumes](english-only-resumes.md)).

## Where it lives

- `src/core/pipeline/run.ts`: `runApplication` with `start: { id }`.
- `src/core/runs/queue.ts`: `canTryAgain` (a new run that failed or was cancelled, has no application and isn't archived).
- `src/app/runs.ts`: the registry keeps each run's request (`RunRequest`: the posting, link or application ID); `retry` queues it again as a new run; `RunSummary` carries `retryable`.
- `src/app/run.ts`: `retryRun`. `POST /api/runs/[runId]` answers `{ runId }` with 202, 404 for an unknown or another profile's run, 409 for a run that can't be tried again this way.
- `src/app/api/applications/[id]/route.ts`: "Try again" on a saved application.
- `src/components/runs-list.tsx` (the list's "Try again"), `src/components/retry-run.tsx` (the application page's).

## Tests

- `src/core/pipeline/run.test.ts` ("trying again").
- `src/core/runs/queue.test.ts`: which runs can be tried again from the list.
- `src/app/runs.test.ts` ("trying a run without an application again"): the new run gets the same posting; a run cancelled in its first step can be tried again; a run with an application, or one that is waiting, running or finished, is refused; another profile's run is unknown; the posting is not in the list and nothing is logged.
- Checked by hand on 2026-11-16 against the built app with `example-profiles` and an Ollama address nothing listens on (no model call): a failed new run was listed as `retryable` without its posting, `POST /api/runs/[runId]` answered 202 and queued a run with the same language, an unknown run answered 404, and the server log held no posting text.
- Not looked at in a browser: the button in the Runs list, and the prefilled language field while it existed.

## Rules it follows

- Art. VI (each step's output is saved; a failed run resumes from the last completed step).
- Art. IV.8 (nothing is overwritten).
- Art. IV.1 (the kept posting is part of the run, the one piece of state held in memory).
- Art. III.4 (the kept posting is never logged) and Art. III.7 (only the run's own profile can queue it again).
- Art. V.3 (which run can be tried again is decided in core).

## Notes

- Decided 2026-11-16: a run with no application can be tried again from the Runs list, with the posting and language the server kept in memory; losing them on restart is accepted.
- Decided 2026-11-17: "Try again" in the Runs list works once per run, so a posting isn't queued several times; the button reappears if the new run fails (on that run). The server refuses a second use (`offersTryAgain`, `triedAgain` in `src/core/runs/queue.ts`).
- Decided 2026-11-16: the chosen language is kept with the run on the server and is what "Try again" starts from; the browser's local-storage copy stays as the fallback after a restart. Removed on 2026-11-21 with the language choice ([english-only-resumes](english-only-resumes.md)): runs carry no language, the browser remembers none, and `latestGeneration` is gone.
- The run that was tried again stays in the list; its button comes back only when the run it queued is no longer listed.
- Decided 2026-11-17: a failed fetch offers both "Try again" (the link is fetched again) and "Paste the text instead"; "Try again" on a link run that failed after its fetch reuses the fetched text. Both as built.
- The application page no longer reads `GET /api/runs` when it opens; it did so only for the language ([english-only-resumes](english-only-resumes.md)).
