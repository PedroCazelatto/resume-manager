---
title: Accept a list of job links at once
id: F33
version: implemented
reported: 2026-11-14
---

## What it does

- The "From links" tab is a text area that takes several links, one per line. Blank lines and the spaces around a link are ignored.
- Each link becomes its own run, in the order given, with the chosen language. Every link enters the fetch queue at once and joins the run queue when its fetch worked ([posting-by-url](posting-by-url.md)), so the runs use the model one after another without further action, each saving its own application folder.
- A link given twice is queued once, where it came first. Two lines are the same link when they read as the same address (`https://Jobs.Example.com` and `https://jobs.example.com/`).
- Every line is checked before anything starts. A line that is not an http or https link, that leads to this computer or a private network, or that is an Indeed link refuses the whole list: nothing is queued, and the message names each such line by its number and text, with the reason. The form checks first; the server checks again.
- One Indeed link given alone still moves to "Paste text" with the link kept, as in [posting-by-url](posting-by-url.md).
- Until its application exists, a run from a link shows its link in the Runs list, so it is clear which link is fetching, waiting, running or failed.
- A link whose fetch fails is listed as "needs the posting's text" with the reason, "Paste the text instead" and "Try again"; the fetch queue goes on with the next link. A link run that fails later is listed as failed with its reason and "Try again", and the run queue goes on too.
- After queueing, the form says how many runs were added.

## Where it lives

- `src/core/posting/links.ts`: `splitLines`, `readLinks` (the links in order, blank lines dropped, duplicates dropped, or every refused line with its number, text and reason) and `refusedMessage`.
- `src/core/posting/start.ts`: `readLinkStarts`, what `POST /api/applications` accepts as `urls`.
- `src/app/api/applications/route.ts`: `{ urls: string[], language }` queues one run per link and answers `{ runIds }` with 202, or 400 with the message and nothing queued. `{ url, language }` and `{ posting, … }` still answer `{ runId }`.
- `src/app/run.ts`: `enqueueRuns`, one `enqueue` per link for the selected profile.
- `src/components/use-run.tsx`: `enqueueRuns`, which `enqueueRun` now goes through; every queued run is watched for its end ([notify-when-run-ends](notify-when-run-ends.md)).
- `src/components/new-application-form.tsx` (the text area, the check before sending, the count), `src/components/runs-list.tsx` (the link on a run without an application).
- The queues themselves are unchanged: `src/core/runs/queue.ts` and `src/app/runs.ts` already fetched links in order and kept a failed run's link for "Try again".

## Tests

- `src/core/posting/links.test.ts`: the order; blank lines and spaces; a link given twice, also written differently; a text of blank lines only; a refused line named by its number in the text as given; private addresses and Indeed; the message.
- `src/core/posting/start.test.ts` ("readLinkStarts"): one start per link; nothing when a line is refused; an empty list; something that isn't a list of text.
- `src/app/runs.test.ts` ("a list of links"), with a fake fetcher and a fake model: three links are fetched in order and run one after another by themselves, each with its own posting and the language; with the second link failing to fetch, the first and third still run, the second never reaches the model and is listed as failed with its reason, `retryable` and `fetchFailed`, and "Try again" fetches it again.
- Checked by hand on 2026-11-17 against the dev server with `example-profiles` and no model configured or reachable: a list with a line that is not a link and an Indeed link answered 400 naming lines 3 and 4, and queued nothing; a list of blank lines answered 400; a list of `https://example.com/`, a name that doesn't exist and `https://example.org/`, with blank lines and the first link repeated, answered three `runIds`; all three were listed as `fetching` with their link and the language, the first and third finished their fetch and went on to the run queue (where they failed for lack of a model), the second was listed as a failed fetch with its reason, and `POST /api/runs/[runId]` queued it again. No page text was in the server log.
- Not seen with a real model: three runs each producing an application folder. That order is covered by the tests with the fake model only.
- Not looked at in a browser: the text area, the message naming the lines, the count, and the link in the Runs list.

## Rules it follows

- Art. V.3 (reading, checking and de-duplicating the lines is pure core code; the route and the form stay thin).
- Art. V.10 and Art. III.2 (every link is checked like a single one; only links the user submitted are requested).
- Art. III.7 (all the runs of a list belong to the selected profile).
- Art. III.4 (the refusal names the user's own line; no page text is logged, listed or streamed).
- Art. IX.2 (no test touches the network or a model).

## Notes

- Decided 2026-11-15: a failure does not stop the rest.
- Each link is a full run of three model calls, so a list can take hours. [cancel-a-run](cancel-a-run.md) stops the running one; "Remove" takes a waiting or fetching one off the list.
- The task was written before the two queues of [posting-by-url](posting-by-url.md) (decided 2026-11-17). It follows them: the links are fetched one after another as soon as the list is submitted, and each joins the run queue when its fetch ends. The runs therefore reach the model in the order given, except that a link whose fetch is tried again joins behind the ones already waiting.
- A failed link was already kept with its run for "Try again" by [posting-by-url](posting-by-url.md) and [try-again-failed-run](try-again-failed-run.md); nothing was added for it.
- Not decided by the task, smallest behaviour chosen: an Indeed link inside a list refuses the list like an invalid line (given alone it moves to "Paste text"); links are compared as normalised addresses, so a LinkedIn link and its rewritten form count as two; the list has no maximum length; a link already in the Runs list from an earlier submission is queued again.
