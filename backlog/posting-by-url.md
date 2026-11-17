---
title: Give a link to the job posting instead of pasting it
id: F10
version: implemented
reported: 2026-11-14
---

## What it does

- The new-application form has two tabs: "From links" and "Paste text". "From links" takes one link; [list-of-posting-urls](list-of-posting-urls.md) extends it to several.
- There are two queues. A link first enters the fetch queue: the server downloads the page and extracts its readable text. The fetch starts as soon as the link is submitted, also while another run is writing a resume, because a fetch doesn't use the model. Fetches run one at a time, in the order given, across all profiles.
- Only when its fetch worked does the run join the end of the run queue ([run-queue](run-queue.md)), with the fetched text as its posting. From there it behaves like a run from pasted text.
- While it is in the fetch queue the run is listed in the Runs list as "fetching the posting", with the step "Fetching the posting" once its own fetch has begun, and with "Remove", which takes it off the list and stops its fetch. Once in the run queue it shows that step as done.
- A run whose fetch failed never joins the run queue and never reaches the model. It stays in the Runs list as "needs the posting's text", with the reason, "Paste the text instead" and "Try again".
- `job.md` is saved with `source: url`, the `url` and the extracted text as its body. The `url` is the page the text was read from, so after a LinkedIn rewrite or a redirect it is that page's address, not the link as typed.
- Only `http` and `https` links are accepted. A link to a loopback, private or link-local address is refused: when it is written as an address, when its name resolves to one (even next to a public address), and when a redirect leads to one.
- At most 5 redirects are followed, each one checked like the first link. The whole fetch gives up after 30 seconds and refuses a page over 5 MB.
- The extracted text has no scripts, styles, navigation, header, footer, side panels, forms or icons. It comes from the page's `main` element, otherwise its first `article`, otherwise the whole body, one line per block, with list items marked `- `.
- There is no minimum amount of text. A page with no text at all fails the fetch. A page whose text is over 50,000 characters (the pasted posting's limit) fails it too, instead of being cut.
- LinkedIn: a link copied while logged in (`/jobs/…?currentJobId=<id>`) is fetched as `https://www.linkedin.com/jobs/view/<id>`. On `linkedin.com` the text is the page's title followed by the description element (`show-more-less-html__markup`); when that element is missing or empty, the general rules apply.
- Indeed (`indeed.com` and its subdomains) is never requested by the server. The form refuses an Indeed link before queueing, says "Indeed blocks automated requests", and moves to "Paste text" with the link kept. The server refuses it too, also as a redirect's target.
- "Paste the text instead" opens the "Paste text" tab with the link in its "Link" field. Submitting the text puts a run with that text and link in the run queue, and the run whose fetch failed leaves the list: the new one stands for it. "Try again" on a failed fetch puts the same link in the fetch queue again; on a link run that failed after its fetch, it queues the fetched text again without fetching.
- The "Paste text" tab has an optional "Link" field. A run started from pasted text with a link saves `source: paste` and that `url`; the link is not fetched.
- The fetched text is untrusted input like pasted text: it goes into the same delimited block of the prompts.

## Where it lives

- `src/core/posting/url.ts`: `parseLink` (http/https), `checkPostingUrl` (plus the address check), `isPublicAddress` (IPv4 and IPv6, including IPv4 carried inside IPv6), `hostOf`.
- `src/core/posting/sites.ts`: `isIndeedUrl`, `isLinkedInUrl`, `rewriteLinkedInUrl`.
- `src/core/posting/html-to-text.ts`: `htmlToText`, on `node-html-parser`.
- `src/core/posting/job-fetcher.ts`: the `JobFetcher` interface and `MAX_POSTING_CHARS`.
- `src/core/posting/start.ts`: `readNewRunStart`, what `POST /api/applications` accepts: `{ url, language }` or `{ posting, url?, language, replaces? }`, where `replaces` is the ID of the run whose failed fetch the pasted text makes up for; and `fetchedStart`, what a run starts from once its link was fetched (with the 50,000-character limit).
- `src/adapters/job-fetcher.ts`: `createJobFetcher(fetch, resolve)`, with the limits as constants (`FETCH_TIMEOUT_MS`, `MAX_PAGE_BYTES`, `MAX_REDIRECTS`). It sends only a `User-Agent` that names the app.
- `src/core/runs/queue.ts`: the fetch queue as pure functions: the `fetching` status, `enqueueFetch`, `nextFetch`, `startFetch`, `fetchDone` (joins the end of the run queue with the new input), `failFetch`, `fetchFailed`, `dropFetchFailed`; `removeWaiting` also takes a run off the fetch queue.
- `src/app/runs.ts`: `createRunRegistry(execute, fetchPosting)` has a second worker loop for the fetch queue, next to the one for the model. `enqueue(profile, kind, input, replaces?)`. `RunSummary` carries `url` and `fetchFailed`, never the posting. `src/app/run.ts` hands the registry the fetcher.
- `src/core/pipeline/run.ts`: `start: { posting, url?, fetched? }`; the pipeline itself doesn't fetch, and `fetch` is only the name of the step the fetch queue reports. `src/core/pipeline/analyse-posting.ts`: `origin`, the `source` and `url` of `job.md`.
- `DELETE /api/runs/[runId]` answers 204 for a run in the fetch queue, as for a waiting run.
- `src/components/new-application-form.tsx` (the tabs, the Indeed refusal, `pasteInstead`), `src/components/runs-list.tsx` ("Paste the text instead"), `src/components/use-run.tsx` (the step's label), `src/components/ui/tabs.tsx` and `src/components/ui/input.tsx` (shadcn/ui).

## Tests

- `src/core/posting/url.test.ts`, `sites.test.ts`, `html-to-text.test.ts`, `start.test.ts`.
- `src/adapters/job-fetcher.test.ts`, with a fake `fetch` and a fake resolver: the text and address returned; the User-Agent; protocols; private addresses written, resolved and redirected to; 5 redirects followed and the sixth refused; 30 seconds (fake timers), also while resolving the name; 5 MB announced and found while reading; error statuses, a page without text, a non-HTML page, an unreachable page; the charset; cancelling; the LinkedIn rewrite and fallback; Indeed never requested; nothing logged.
- `src/core/pipeline/run.test.ts` ("where the posting came from"): `job.md` for a fetched posting and for pasted text with and without a link, and the delimited prompt.
- `src/core/runs/queue.test.ts` ("the fetch queue"): a link run stays out of the run queue; links are fetched in order whether or not a run is running; a fetched run joins the end of the run queue; a failed fetch is never queued; removing; the list's order; `fetchFailed` and `dropFetchFailed`.
- `src/app/runs.test.ts` ("a run started from a link"): the fetch starts while another run uses the model; the run joins the run queue with the fetched posting and starts by itself; one fetch at a time; a failed, throwing or too-long fetch never reaches the model; pasted text takes the failed run's place, for the same profile only; "Try again" fetches again, or doesn't after a fetch that worked; "Remove" stops the fetch; the posting is never listed, streamed or logged.
- Checked by hand on 2026-11-16 against the dev server with `example-profiles` and an Ollama address nothing listens on (when the fetch was still a step of the run): a run for `https://www.linkedin.com/jobs/search/?currentJobId=<id>` of a current public job finished its fetch and then failed at the analysis for lack of a model; an Indeed link and a loopback link were refused with 400; the server log held no page text.
- Checked by hand on 2026-11-17, same setup, with the two queues: a link run was listed as `fetching` at once; LinkedIn answered 429 that day, and a name that doesn't exist failed too, so both were listed as failed fetches with their reason and never reached the model; pasted text sent with `replaces` took the failed run's place and went on to the analysis. A fetch that works was not seen joining the run queue on the real server, only in the tests.
- Not looked at in a browser: the tabs, the Indeed refusal moving to "Paste text", the "fetching the posting" row and its "Remove", and "Paste the text instead". Not checked: the text extracted from the real LinkedIn page, which is only saved once the analysis succeeds.

## Rules it follows

- Art. V.10 (http/https only; no private, loopback or link-local address; size and time limits; boilerplate stripped; the paste fallback; no headless browser and no imitation of one).
- Art. III.2 (the only outbound request is to the link the user submitted, and its redirects).
- Art. II.7 (fetched text is untrusted input, delimited in every prompt).
- Art. III.4 (the page and its text are never logged, listed or streamed).
- Art. V.3 (the checks, the HTML-to-text and the fetch queue's logic are pure core code; the network is behind `JobFetcher`).
- Art. IV.1 (the fetch queue is part of the runs kept in memory) and Art. III.7 (a run in the fetch queue is listed, removed and replaced by its own profile only).
- Art. IX.2 (no test touches the network).

## Notes

- Decided 2026-11-15: plain fetch with the paste fallback; no headless browser.
- Decided 2026-11-15: two tabs on the form.
- Decided 2026-11-16: the form stays on screen after queueing and does not follow or open the run, so a failed fetch is handled from the Runs list.
- Decided 2026-11-17 (the user): "Always do the fetch as soon as the job application enters the queue. It's like we have 2 queues, the first one is to fetch the job description, and the second one is to create the resume. One item only moves from one queue to the next after the fetch works, and if it doesn't work it must ask the user for the pasted text to join the second queue." This replaces the fetch as the first step of a queued run.
- A run joins the run queue when its fetch ends, so it goes behind the runs that were already waiting then, even ones submitted after its link.
- A run removed from the fetch queue leaves the list, like a waiting run that is removed.
- The fetch queue lives in memory like the run queue; after a restart it is empty.
- Decided 2026-11-15: 30 seconds, 5 MB, no minimum text length.
- Checked 2026-11-15 with a plain request labelled as this app: LinkedIn's public job page answered 200 with the full description in the HTML. Indeed answered 403 "Security Check" on a search page and on a real job link, and 401 "Authenticating" on another job link.
- Indeed is handled from the user's browser instead: see [browser-extension](browser-extension.md). This task covers LinkedIn and other sites that answer plain requests.
- Checked 2026-11-15: an undisguised headless Chrome is blocked by Indeed too, so the ban on headless-browser scraping (Art. V.10) stays.
- The 30 seconds cover the whole fetch, redirects included.
- The name is resolved and checked by the app, then resolved again by the request itself. A name that changes its answer between the two is not caught.
- "Paste the text instead" is offered only on a run whose fetch failed. A link run that failed later has "Try again" alone.
- The LinkedIn description element names neither the role nor the company, which the analysis needs, so the page's `<title>` ("<company> hiring <role> in <place> | LinkedIn") is put above it.
