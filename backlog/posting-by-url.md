---
title: Give a link to the job posting instead of pasting it
id: F10
version: implemented
reported: 2026-11-14
---

## What it does

- The new-application form has two tabs: "From links" and "Paste text". "From links" takes one link; [list-of-posting-urls](list-of-posting-urls.md) extends it to several.
- A run started from a link gets a first step, "Fetching the posting": the server downloads the page, extracts its readable text and uses it as the posting. The other steps are unchanged.
- `job.md` is saved with `source: url`, the `url` and the extracted text as its body. The `url` is the page the text was read from, so after a LinkedIn rewrite or a redirect it is that page's address, not the link as typed.
- Only `http` and `https` links are accepted. A link to a loopback, private or link-local address is refused: when it is written as an address, when its name resolves to one (even next to a public address), and when a redirect leads to one.
- At most 5 redirects are followed, each one checked like the first link. The whole fetch gives up after 30 seconds and refuses a page over 5 MB.
- The extracted text has no scripts, styles, navigation, header, footer, side panels, forms or icons. It comes from the page's `main` element, otherwise its first `article`, otherwise the whole body, one line per block, with list items marked `- `.
- There is no minimum amount of text. A page with no text at all fails the run. A page whose text is over 50,000 characters (the pasted posting's limit) fails the run too, instead of being cut.
- LinkedIn: a link copied while logged in (`/jobs/…?currentJobId=<id>`) is fetched as `https://www.linkedin.com/jobs/view/<id>`. On `linkedin.com` the text is the page's title followed by the description element (`show-more-less-html__markup`); when that element is missing or empty, the general rules apply.
- Indeed (`indeed.com` and its subdomains) is never requested by the server. The form refuses an Indeed link before queueing, says "Indeed blocks automated requests", and moves to "Paste text" with the link kept. The server refuses it too, also as a redirect's target.
- A run whose fetch failed shows the reason on its row in the Runs list, with "Try again" (which fetches the same link again) and "Paste the text instead", which opens the "Paste text" tab with the link in its "Link" field.
- The "Paste text" tab has an optional "Link" field. A run started from pasted text with a link saves `source: paste` and that `url`; the link is not fetched.
- The fetched text is untrusted input like pasted text: it goes into the same delimited block of the prompts.

## Where it lives

- `src/core/posting/url.ts`: `parseLink` (http/https), `checkPostingUrl` (plus the address check), `isPublicAddress` (IPv4 and IPv6, including IPv4 carried inside IPv6), `hostOf`.
- `src/core/posting/sites.ts`: `isIndeedUrl`, `isLinkedInUrl`, `rewriteLinkedInUrl`.
- `src/core/posting/html-to-text.ts`: `htmlToText`, on `node-html-parser`.
- `src/core/posting/job-fetcher.ts`: the `JobFetcher` interface and `MAX_POSTING_CHARS`.
- `src/core/posting/start.ts`: `readNewRunStart`, what `POST /api/applications` accepts: `{ posting, url?, language }` or `{ url, language }`.
- `src/adapters/job-fetcher.ts`: `createJobFetcher(fetch, resolve)`, with the limits as constants (`FETCH_TIMEOUT_MS`, `MAX_PAGE_BYTES`, `MAX_REDIRECTS`). It sends only a `User-Agent` that names the app.
- `src/core/pipeline/run.ts`: the `fetch` step, `start: { url }` and `start: { posting, url? }`; `src/core/pipeline/analyse-posting.ts`: `origin`, the `source` and `url` of `job.md`.
- `src/core/runs/queue.ts`: `fetchFailed`. `src/app/runs.ts`: `RunSummary` carries `url` and `fetchFailed`, never the posting. `src/app/run.ts` hands the fetcher to the pipeline.
- `src/components/new-application-form.tsx` (the tabs, the Indeed refusal, `pasteInstead`), `src/components/runs-list.tsx` ("Paste the text instead"), `src/components/use-run.tsx` (the step's label), `src/components/ui/tabs.tsx` and `src/components/ui/input.tsx` (shadcn/ui).

## Tests

- `src/core/posting/url.test.ts`, `sites.test.ts`, `html-to-text.test.ts`, `start.test.ts`.
- `src/adapters/job-fetcher.test.ts`, with a fake `fetch` and a fake resolver: the text and address returned; the User-Agent; protocols; private addresses written, resolved and redirected to; 5 redirects followed and the sixth refused; 30 seconds (fake timers), also while resolving the name; 5 MB announced and found while reading; error statuses, a page without text, a non-HTML page, an unreachable page; the charset; cancelling; the LinkedIn rewrite and fallback; Indeed never requested; nothing logged.
- `src/core/pipeline/run.test.ts` ("a run started from a link"): the step order, `job.md` for a link run and for pasted text with a link, the fetcher's reason as the run's error before any model call, the 50,000-character limit, the delimited prompt, cancelling.
- `src/core/runs/queue.test.ts` (`fetchFailed`) and `src/app/runs.test.ts` ("a run started from a link"): the listed link, the paste fallback, "Try again" with the same link, no posting in the list.
- Checked by hand on 2026-11-16 against the dev server with `example-profiles` and an Ollama address nothing listens on: a run queued for `https://www.linkedin.com/jobs/search/?currentJobId=<id>` of a current public job finished its fetch step and then failed at the analysis for lack of a model; `GET /api/runs` listed the link and no posting; an Indeed link and a loopback link were refused with 400; the server log held no page text.
- Not looked at in a browser: the tabs, the Indeed refusal moving to "Paste text", and "Paste the text instead" in the Runs list. Not checked: the text extracted from the real LinkedIn page, which is only saved once the analysis succeeds.

## Rules it follows

- Art. V.10 (http/https only; no private, loopback or link-local address; size and time limits; boilerplate stripped; the paste fallback; no headless browser and no imitation of one).
- Art. III.2 (the only outbound request is to the link the user submitted, and its redirects).
- Art. II.7 (fetched text is untrusted input, delimited in every prompt).
- Art. III.4 (the page and its text are never logged, listed or streamed).
- Art. V.3 (the checks and the HTML-to-text are pure core code; the network is behind `JobFetcher`).
- Art. IX.2 (no test touches the network).

## Notes

- Decided 2026-11-15: plain fetch with the paste fallback; no headless browser.
- Decided 2026-11-15: two tabs on the form.
- Decided 2026-11-16: the form stays on screen after queueing and does not follow or open the run, so a failed fetch is handled from the Runs list.
- Decided 2026-11-15: 30 seconds, 5 MB, no minimum text length.
- Checked 2026-11-15 with a plain request labelled as this app: LinkedIn's public job page answered 200 with the full description in the HTML. Indeed answered 403 "Security Check" on a search page and on a real job link, and 401 "Authenticating" on another job link.
- Indeed is handled from the user's browser instead: see [browser-extension](browser-extension.md). This task covers LinkedIn and other sites that answer plain requests.
- Checked 2026-11-15: an undisguised headless Chrome is blocked by Indeed too, so the ban on headless-browser scraping (Art. V.10) stays.
- The 30 seconds cover the whole fetch, redirects included.
- The name is resolved and checked by the app, then resolved again by the request itself. A name that changes its answer between the two is not caught.
- "Paste the text instead" is offered only when the run failed in its fetch step. A link run that failed later has "Try again" alone.
- The LinkedIn description element names neither the role nor the company, which the analysis needs, so the page's `<title>` ("<company> hiring <role> in <place> | LinkedIn") is put above it.
