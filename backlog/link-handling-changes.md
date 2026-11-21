---
title: Link handling changes decided on 2026-11-17
id: F47
version: implemented
reported: 2026-11-17
---

## What it does

- **One lookup per request.** The fetcher resolves a link's host name once, checks every address it got (no loopback, private or link-local address, as before), and connects to one of those checked addresses: the request never resolves the name a second time. Each redirect is handled the same way, with a lookup of its own. HTTPS still checks the certificate against the host name. A link written as an address is connected to that address without a lookup.
- **No character limit on a posting's text.** A fetched page and a pasted posting go on whole, however long. The 5 MB page limit, the 30 seconds and the 5 redirects stay.
- **No single-link request.** `POST /api/applications` takes a list of links (`{ urls }`) or pasted text with its link (`{ posting, url, replaces? }`). A lone `{ url }` is refused with 400 ("Paste the posting's text first."), and nothing in the app sends it.
- **Every posting has its link.** Pasted text without a link is refused with 400 ("Give the posting's link with its text: every posting keeps its link."). In the form's "Paste text" tab the "Link" field is required: "Generate resume" stays disabled until both the text and the link are there.
- **LinkedIn job IDs.** `https://www.linkedin.com/jobs/search/?currentJobId=<id>` (any `/jobs/…` page with `currentJobId`), `https://www.linkedin.com/jobs/view/<id>` and `https://www.linkedin.com/jobs/view/<words>-<id>` (with or without a trailing slash or a query) all name job `<id>`, on `linkedin.com` and its subdomains. A list keeps one link per job, where it came first. Any other link is the same link only when it reads as the same address, as before.
- **Indeed links become rows that need their text.** An Indeed link, alone or in a list, no longer refuses anything and no longer moves the form to "Paste text". It becomes a run that never enters the fetch queue: it is listed at once as "needs the posting's text", with the reason "Indeed blocks automated requests. Paste the posting's text instead." and a "Paste the text" button, and no step. No request is ever sent to Indeed. The other links of the list are queued as usual.
  - An Indeed row has no "Try again" in the Runs list, and `POST /api/runs/[runId]` refuses it with 409, since trying again would fetch the link. Whether it gets one through the [browser-extension](browser-extension.md) is that task's question.
  - "Paste the text" works as on a failed fetch: the form's "Paste text" tab opens with the Indeed link kept, and the pasted text takes the row's place.
  - The button on a failed fetch reads "Paste the text" too (it read "Paste the text instead").
- **A link that is already there is skipped.** A link of a list is skipped when the profile's Runs list has a row with the same job that is fetching, waiting, running or finished (not failed, not cancelled), or when a saved application of the profile has the same link in its `job.md` `url`. The LinkedIn job ID counts. A failed or cancelled row doesn't count, so its link is queued again.
  - The form says how many runs were added, then each skipped line, one per line: `Line 2 (https://…): Skipped: it is already in the Runs list.` or `Line 3 (https://…): Skipped: it is already saved in application <id>.` When both apply, the Runs list is named.
  - A list where every link was skipped queues nothing and says "Nothing was added: every link is already there.", followed by the lines. It is not an error: the answer is 202 with an empty `runIds`. "Generate resume" stays disabled until the links change, as after any list that was sent.
  - A saved `job.md` that isn't valid is never skipped silently (Art. IV.6): its link can't be checked, the list is queued all the same, and the form names the file and its problems under "These applications couldn't be checked for the same link:".
  - Pasted text isn't checked: it is sent from a row that needs its text.
- **The Runs list shows the address the text was read from.** Until a fetch worked, a run's link in the Runs list (`GET /api/runs`, `url`) is the link as given; afterwards it is the address the text was read from, after the LinkedIn rewrite and any redirects, which is the `url` saved in `job.md`. A failed fetch keeps the link as given. This was already so; it is now written down and tested.

## Where it lives

- `src/adapters/job-fetcher.ts`: `createJobFetcher(send, resolve)`. `send` is a `SendRequest` (one GET to a `PageRequest`: `url`, the checked `addresses`, `headers`, `signal`; answering a `PageResponse`: `status`, `header(name)`, `body` as chunks, `discard()`); the default sends with `node:http` / `node:https` on a connection of its own (`agent: false`), with `lookup: checkedLookup(addresses)`. `checkedLookup` answers Node's lookup with the checked addresses (all of them when asked for all, the first otherwise, kept to the family asked for) and never resolves. The User-Agent, the charset, the size counted while reading, the 30 seconds over the whole fetch and cancelling through the `AbortSignal` are as before.
- `src/core/posting/job-fetcher.ts`: `MAX_POSTING_CHARS` is gone. `src/core/posting/start.ts`: `fetchedStart` has no limit; `readNewRunStart` reads `{ posting, url }` (both required, the link any http or https link) into a `PastedStart`; `readLinkStarts` answers the list's `links`, each with its line.
- `src/core/posting/sites.ts`: `linkedInJobId`, `jobKey` (the LinkedIn job ID, otherwise the address), `isIndeedLink` (`isIndeedUrl` for a link as text), next to `rewriteLinkedInUrl`, which now shares the `currentJobId` reading.
- `src/core/posting/links.ts`: `readLinks` no longer refuses Indeed, drops a second link to the same job (`jobKey`), and returns `links` (`ListedLink`: `line`, `text`, `url`).
- `src/core/posting/known-links.ts` (new, pure): `skipKnownLinks(links, runs, saved)`, `savedLinks(jobFiles)` (validates each `job.md` with `jobSchema`), `addedMessage(added, skipped)`, `uncheckedMessage(problems)`.
- `src/core/runs/queue.ts`: `QueuedRun.notFetched` and `addNotFetched(runs, run, reason)`, which adds a run already in the failed-fetch state; `fetchFailed` is true for it, `canTryAgain` false.
- `src/app/runs.ts`: `add` turns a run whose link is an Indeed link into an `addNotFetched` run with `INDEED_BLOCKED`, so nothing that queues a link (a list, "Try again") can fetch Indeed. `RunSummary.url` says which link it is.
- `src/adapters/profile-store.ts`: `listApplications(slug)`, the application folders of `applications/` with a valid name, not following symlinks.
- `src/app/run.ts`: `enqueueLinks(links)` (replaces `enqueueRuns`) reads the registry's list and the saved `job.md` files through `ProfileStore`, skips, and answers `{ runIds, skipped, problems }` with 202. `src/app/api/applications/route.ts` calls it for `urls`, and `enqueueRun` for pasted text.
- `src/components/use-run.tsx`: `enqueueRuns` also returns `skipped` and `problems`, and accepts an answer with no run when lines were skipped. `src/components/new-application-form.tsx`: the Indeed special case is gone, the link is required with pasted text, and the message after sending comes from `addedMessage` and `uncheckedMessage`. `src/components/runs-list.tsx`: "Paste the text".

## Tests

- `src/adapters/job-fetcher.test.ts`, with a fake request function and a fake resolver, so no socket is opened: one lookup, and the request gets the addresses that were checked; a resolver that would answer a private address the second time is asked once and the public address is used; an address written in the link is used without a lookup; each redirect is looked up once and connected to its own address; `checkedLookup` answers all addresses, the first, or the asked family, and fails when none has it; answers that aren't read are discarded; the earlier cases (User-Agent, protocols, private addresses, redirects, 30 seconds, 5 MB, statuses, charset, cancelling, LinkedIn, Indeed, no log) on the new seam.
- `src/core/posting/start.test.ts`: pasted text and fetched text over 50,000 characters go on whole; a lone link and pasted text without a link are refused; an Indeed link in a list starts like any other.
- `src/core/posting/sites.test.ts` ("linkedInJobId", "jobKey", "isIndeedLink"): the three forms of one job, two jobs, links that name no job.
- `src/core/posting/links.test.ts`: lines kept with each link; one link per LinkedIn job; Indeed accepted alone and in a list.
- `src/core/posting/known-links.test.ts`: skipped for each of fetching, waiting, running and finished rows; queued again after a failed or cancelled row; skipped for a saved application, named; the Runs list named first; LinkedIn forms; addresses compared as links; every link skipped; `savedLinks` with and without a link, and an invalid `job.md` returned with its path; the messages.
- `src/core/runs/queue.test.ts` ("a link the server never requests"): never in either queue, failed with the reason and no step, `fetchFailed`, no "Try again", dropped once pasted (own profile only), listed and forgotten like a finished run.
- `src/app/runs.test.ts`: an Indeed link is never fetched, is listed as needing its text without "Try again", and its retry is refused; a list's other links are fetched and run; pasted text takes the Indeed row's place; a fetched posting over 50,000 characters reaches the model whole; the link as given until the fetch worked, then the rewritten LinkedIn address, through to the end of the run, and the link as given after a failed fetch.
- `src/app/run.test.ts` (new): `enqueueLinks` on a scratch copy of `example-profiles/` with the fetcher answered by hand and no model: a link a saved `job.md` has is skipped and named; a link in the Runs list is skipped, then queued again once its fetch failed; an Indeed link is listed without a fetch; an invalid `job.md` is named and the link still queued.
- `src/app/api/applications/route.test.ts` (new): a lone `{ url }` and pasted text without a link answer 400; pasted text with its link and `replaces` is queued; a list (with an Indeed link) is passed on with its lines; a list with a private address answers 400.
- `src/adapters/profile-store.test.ts`: `listApplications` lists folders only, sorted, without symlinks, files or other names, and refuses another profile's path.
- Checked by hand on 2026-11-21 that Node uses the injected lookup: an inline script on this machine requested a made-up host name through `node:http` with `checkedLookup(["127.0.0.1"])` against a local server; Node called the lookup with `all: true`, the request arrived without the name being resolved, and aborting stopped reading a body that hadn't ended.
- Checked by hand on 2026-11-21 against the built app (`next start` on port 3101) with `example-profiles` and an Ollama address where a local listener never answered (no model, and no request left the machine): a lone `{ url }` and pasted text without a link answered 400; a list of two Indeed links and then one Indeed link alone answered 202, and `GET /api/runs` listed them as needing their text, with no step and `retryable: false`; "Try again" on one answered 409; pasted text with `replaces` took its place and ran; pasted text with a `/jobs/view/<words>-<id>` LinkedIn link waited; a list with the first Indeed link, the `?currentJobId=<id>` form of that LinkedIn job and a new Indeed link skipped the first two ("already in the Runs list") and added the third; a list of the `/jobs/view/<id>` form alone answered 202 with no run and its skipped line; the server log held no posting text.
- Not looked at in a browser: the form's added and skipped lines, the required "Link" field, and "Paste the text" on an Indeed row. Not seen: a real fetch connecting to a checked address over HTTPS, since no live request was made.

## Rules it follows

- Art. V.10 (http/https only; the address check now holds for the connection itself; size and time limits; no headless browser), III.2 (Indeed is never requested; the only requests are to submitted links and their redirects).
- Art. IV.6 (each saved `job.md` read for its link is validated, and an invalid one is shown with its path and problems), III.7 (the runs and applications checked are the selected profile's only), III.4 (no posting text is listed, streamed or logged; skipped lines name only the user's own links and application IDs).
- Art. V.3 (the lookup check and the HTTP request are in `src/adapters/`; the skip rule, the job IDs and the Indeed rows are pure core code), IX.2 (no test opens a socket or touches the network; the model is never reached).
- Art. IX.4 (no new dependency: `node:http`, `node:https`, `node:net`).

## Notes

- Decided 2026-11-17 (the user, on the name that could change its address): "There will be only one fetch." Read as: one lookup, and the connection goes to the checked address.
- Decided 2026-11-17: no character limit, for fetched text ("Remove the limit. We will deal with that later if it becomes a problem.") and for pasted text ("Remove it for pasted text too").
- Decided 2026-11-17: the single-link request form is removed.
- Decided 2026-11-17: a pasted posting without a link "won't exist".
- Decided 2026-11-17: a LinkedIn `?currentJobId=<id>` link and the same job's `/jobs/view/<id>` link are the same job.
- Decided 2026-11-17 (Indeed): "We will use the browser extension (until I build a way to bypass the Indeed automation blocker). Each Indeed link becomes a row in the Runs list in the state 'needs the posting's text', with a 'Paste the text' button, like a failed fetch but without any request to Indeed. One Indeed link given alone does the same."
- Decided 2026-11-21: an Indeed row has no "Try again", which would fetch the link. Whether it gets one through the browser extension is an open question of [browser-extension](browser-extension.md).
- Decided 2026-11-17 (a link already there): "Skip it and say so. There is no need to generate more than one resume for the same link without passing additional arguments." What counts: "Any row in the Runs list with the same job that didn't fail and wasn't cancelled, plus any saved application whose `URL` has the same link."
- Decided 2026-11-17: `job.md` keeps the address the text was read from, "and the list should also shows this link. Only one source of truth."
- Decided 2026-11-17: pasting is a last resort ("I don't want to use it"); the form's "Paste text" tab is removed ([home-applications-table](home-applications-table.md)), and pasting is offered on every row whose fetch failed, Indeed included ([runs-list-changes](runs-list-changes.md)). This task changed only what pasted text must carry (its link, no limit).
- Built on 2026-11-21 with the smallest behaviour where the task said nothing:
  - the request connects to one of the checked addresses, all of which are handed to Node's lookup, so Node may try the next one; each request has a connection of its own, never a pooled one;
  - the refusal messages: "Paste the posting's text first." for a request without text (a lone link included) and "Give the posting's link with its text: every posting keeps its link." for text without a link;
  - the Indeed row keeps the existing reason, "Indeed blocks automated requests. Paste the posting's text instead.", and its button reads "Paste the text", as the failed fetch's does now;
  - an Indeed row is a finished run like a failed fetch: it is listed with the finished runs, counts among the 50 kept, and its ID is in `runIds`, so the form counts it as an added run;
  - a run's link is compared as the Runs list shows it, so once a fetch followed a redirect, the row's link is the address it was read from, and the link as given again is not the same link (unless it is the same LinkedIn job);
  - the wording of the added and skipped lines, the 202 answer for a list where every link was skipped, the Runs list named before a saved application, and the `problems` answer and message for an invalid saved `job.md`, with the list queued all the same;
  - pasted text isn't checked against the Runs list or saved applications;
  - internally, a run from pasted text without a link still works (`RunInput` is unchanged); only the request refuses it.
