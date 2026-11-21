---
title: Accept a list of job links at once
id: F33
version: implemented
reported: 2026-11-14
---

## What it does

- The "From links" tab is a text area that takes several links, one per line. Blank lines and the spaces around a link are ignored.
- Each link becomes its own run, in the order given. Every resume is written in English ([english-only-resumes](english-only-resumes.md)). Every link enters the fetch queue at once and joins the run queue when its fetch worked ([posting-by-url](posting-by-url.md)), so the runs use the model one after another without further action, each saving its own application folder.
- A link given twice is queued once, where it came first. Two lines are the same link when they read as the same address (`https://Jobs.Example.com` and `https://jobs.example.com/`), or name the same LinkedIn job (`?currentJobId=<id>`, `/jobs/view/<id>`, `/jobs/view/<words>-<id>`) ([link-handling-changes](link-handling-changes.md)).
- Every line is checked before anything starts. A line that is not an http or https link, or that leads to this computer or a private network, refuses the whole list: nothing is queued, and the message names each such line by its number and text, with the reason. The form checks first; the server checks again.
- An Indeed link, alone or in the list, refuses nothing: it becomes a row that needs its text, with "Paste the text" and no "Try again", and is never requested; the other links are queued as usual ([link-handling-changes](link-handling-changes.md)).
- A link the profile already has is skipped: a row of the Runs list with the same job that is fetching, waiting, running or finished, or a saved application whose `job.md` has the same `url`. A failed or cancelled row doesn't count, so its link is queued again ([link-handling-changes](link-handling-changes.md)).
- Until its application exists, a run from a link shows its link in the Runs list, so it is clear which link is fetching, waiting, running or failed.
- A link whose fetch fails is listed as "needs the posting's text" with the reason, "Paste the text" and "Try again"; the fetch queue goes on with the next link. A link run that fails later is listed as failed with its reason and "Try again", and the run queue goes on too.
- After queueing, the form says how many runs were added, then each skipped line with why, one per line (`Line 2 (…): Skipped: it is already in the Runs list.`). A list where every link was skipped adds nothing and says so ("Nothing was added: every link is already there."); that is not an error. A saved `job.md` that isn't valid is named, since its link couldn't be checked ([link-handling-changes](link-handling-changes.md)).

## Where it lives

- `src/core/posting/links.ts`: `splitLines`, `readLinks` (the links in order, each with its line number and text, blank lines dropped, a second link to the same job dropped, or every refused line with its number, text and reason) and `refusedMessage`.
- `src/core/posting/start.ts`: `readLinkStarts`, what `POST /api/applications` accepts as `urls`: the list's links with their lines.
- `src/core/posting/known-links.ts`: `skipKnownLinks`, `savedLinks`, `addedMessage`, `uncheckedMessage` ([link-handling-changes](link-handling-changes.md)).
- `src/app/api/applications/route.ts`: `{ urls: string[] }` queues one run per link that isn't skipped and answers `{ runIds, skipped, problems }` with 202, or 400 with the message and nothing queued. `{ posting, url, … }` answers `{ runId }`; a lone `{ url }` is refused.
- `src/app/run.ts`: `enqueueLinks`, which reads the selected profile's runs and saved `job.md` files (`ProfileStore.listApplications`), skips, and calls `enqueue` once per remaining link.
- `src/components/use-run.tsx`: `enqueueRuns`, which `enqueueRun` now goes through, and which returns the skipped lines; every queued run is watched for its end ([notify-when-run-ends](notify-when-run-ends.md)).
- `src/components/new-application-form.tsx` (the text area, the check before sending, the count and the skipped lines), `src/components/runs-list.tsx` (the link on a run without an application).
- The queues themselves are unchanged: `src/core/runs/queue.ts` and `src/app/runs.ts` already fetched links in order and kept a failed run's link for "Try again".

## Tests

- `src/core/posting/links.test.ts`: the order and the lines; blank lines and spaces; a link given twice, also written differently, and LinkedIn forms of one job; a text of blank lines only; a refused line named by its number in the text as given; private addresses; Indeed accepted; the message.
- `src/core/posting/start.test.ts` ("readLinkStarts"): one start per link with its line; nothing when a line is refused; an Indeed link started like any other; an empty list; something that isn't a list of text.
- `src/core/posting/known-links.test.ts`, `src/app/run.test.ts` and `src/app/api/applications/route.test.ts`: the skip rule and its messages ([link-handling-changes](link-handling-changes.md)).
- `src/app/runs.test.ts` ("a list of links"), with a fake fetcher and a fake model: three links are fetched in order and run one after another by themselves, each with its own posting; with the second link failing to fetch, the first and third still run, the second never reaches the model and is listed as failed with its reason, `retryable` and `fetchFailed`, and "Try again" fetches it again.
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
- Built with the smallest behaviour where the task said nothing, then decided on 2026-11-17:
  - an Indeed link inside a list no longer refuses the list: the other links are queued, and each Indeed link becomes a row that needs its text, with "Paste the text", without any request to Indeed; one Indeed link alone does the same ([link-handling-changes](link-handling-changes.md), built on 2026-11-21);
  - a LinkedIn `?currentJobId=<id>` link and the same job's `/jobs/view/<id>` link are the same job ([link-handling-changes](link-handling-changes.md), built on 2026-11-21);
  - a link that is already in the Runs list is skipped, and the form says so: "There is no need to generate more than one resume for the same link without passing additional arguments." ([link-handling-changes](link-handling-changes.md), built on 2026-11-21); a link counts as already there when a row of the Runs list with the same job didn't fail and wasn't cancelled, or a saved application has the same `url`;
  - no maximum number of links (as built);
  - what a row shows comes from the job posting's details: title, company, source and state, with the link while the title isn't known ([job-posting-details](job-posting-details.md));
  - the form's "From links" tab becomes a modal opened from the home page's new table ([home-applications-table](home-applications-table.md)).
  - the single-link request `{ url }` is removed ([link-handling-changes](link-handling-changes.md), built on 2026-11-21).
- Decided 2026-11-17: the language choice is removed, so a list's runs carry no language and every resume is written in English ([english-only-resumes](english-only-resumes.md), built on 2026-11-21).
