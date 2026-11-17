---
title: Link handling changes decided on 2026-11-17
id: F47
version: next version
reported: 2026-11-17
---

## Problem

The user's answers of 2026-11-17 change how links are accepted and fetched, as built by [posting-by-url](posting-by-url.md) (F10) and [list-of-posting-urls](list-of-posting-urls.md) (F33). Read both files first: this task changes what they describe, and nothing else.

## Behaviour

1. **One lookup per request.** The fetcher resolves a link's host name once, checks every address it got (as today: no loopback, private or link-local address), and connects to a checked address. It never resolves the name a second time. Each redirect is handled the same way. HTTPS still checks the certificate against the host name.
2. **No character limit on a posting's text.** The 50,000-character limit goes, for fetched text and for pasted text alike. The 5 MB page limit, the 30 seconds and the 5 redirects stay.
3. **The single-link request is removed.** `POST /api/applications` no longer accepts `{ url, language }`; it accepts `{ urls, language }` (the form's links) and pasted text with its link.
4. **Every posting has its link.** A pasted posting without a link no longer exists: wherever pasted text is accepted, its link is required, and the server refuses pasted text without one.
5. **LinkedIn job IDs.** Two LinkedIn links to the same job are the same link: `https://www.linkedin.com/jobs/search/?currentJobId=<id>`, `https://www.linkedin.com/jobs/view/<id>` and `https://www.linkedin.com/jobs/view/<words>-<id>` all name job `<id>`.
6. **Indeed links become rows that need their text.** An Indeed link, alone or inside a list, no longer refuses anything and no longer moves the form to "Paste text". The other links of the list are queued as usual, and each Indeed link becomes a row in the Runs list in the state "needs the posting's text", with a "Paste the text" button, like a failed fetch but without any request to Indeed. (Reading Indeed pages is the [browser-extension](browser-extension.md)'s job; these rows are what happens without it.)
7. **A link that is already there is skipped.** A link is skipped when the Runs list has a row with the same job that didn't fail and wasn't cancelled, or when a saved application of the profile has the same link in its `job.md` `url`. The form says which lines were skipped and why, one line each, next to the count of runs added. A list where every link was skipped queues nothing and says so; that is not an error.
8. **The Runs list shows the address the text was read from.** Once a fetch worked, the run's link in the Runs list is the address saved in `job.md` (after the LinkedIn rewrite and any redirects). Before that, it is the link as given.

## Acceptance criteria

- [ ] The fetcher's tests show one lookup per host per request, and that the connection is made to the checked address.
- [ ] A fetched page and a pasted posting with more than 50,000 characters of text both go on whole.
- [ ] `{ url, language }` is refused with 400, and nothing in the app sends it; pasted text without a link is refused with 400.
- [ ] The three LinkedIn forms of one job count as one link; two different jobs stay two.
- [ ] A list with an Indeed link queues the other links, and lists the Indeed link as needing its text with "Paste the text"; the server makes no request to Indeed. One Indeed link alone does the same.
- [ ] A link already queued, fetching, waiting, running or finished in the Runs list, or saved in an application's `job.md`, is skipped and named; a failed or cancelled one is queued again.
- [ ] After a fetch that followed a redirect, `GET /api/runs` lists the final address for that run.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass; no test touches the network (Art. IX.2).
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [posting-by-url](posting-by-url.md), [list-of-posting-urls](list-of-posting-urls.md) and [paste-posting](paste-posting.md) describe the new behaviour.

## Technical notes

- Item 1: `src/adapters/job-fetcher.ts` uses the global `fetch` today, which resolves the name again. Use `node:http` / `node:https` `request` with a `lookup` option that returns the address already checked; this needs no new dependency. Keep the user-agent, charset handling, size counting while reading, the timeout covering the whole fetch, and cancelling through the `AbortSignal`. Keep a seam for tests (an injected request function and the injected `ResolveHost`), so no test opens a socket.
- Item 2: `MAX_POSTING_CHARS` in `src/core/posting/job-fetcher.ts`, used by `fetchedStart` and `readNewRunStart` in `src/core/posting/start.ts`; the form's own check is in `src/components/new-application-form.tsx`.
- Items 3–4: `readNewRunStart` in `src/core/posting/start.ts` and `src/app/api/applications/route.ts`; update their tests.
- Item 5: put the job-ID reading next to `rewriteLinkedInUrl` in `src/core/posting/sites.ts`, and use it in `readLinks` (`src/core/posting/links.ts`), which today compares `URL.href`, and in item 7.
- Item 6: `isIndeedUrl` in `src/core/posting/sites.ts`; `readLinks` refuses Indeed today. The row is a run that never enters the fetch queue and starts in the same state as a failed fetch (`failFetch` / `fetchFailed` in `src/core/runs/queue.ts`), with its own reason. The paste flow is [runs-list-changes](runs-list-changes.md) item 6.
- Item 7: a pure function in core over the profile's runs, the saved applications' links and the new links; the route reads the registry, and the saved applications' `job.md` through `ProfileStore`.
- Item 8: `RunSummary.url` in `src/app/runs.ts`; `fetchDone` in `src/core/runs/queue.ts` already receives the fetched address.
- Art. V.10, III.2, III.4, V.3, IX.2 apply as in [posting-by-url](posting-by-url.md).

## Depends on

- [posting-by-url](posting-by-url.md), [list-of-posting-urls](list-of-posting-urls.md), [paste-posting](paste-posting.md) (implemented).
- [runs-list-changes](runs-list-changes.md) touches the same files (`src/core/runs/queue.ts`, `src/app/runs.ts`, `src/components/runs-list.tsx`); build the two one after the other.

## Decisions

- Decided 2026-11-17 (the user, on the name that could change its address): "There will be only one fetch." Read as: one lookup, and the connection goes to the checked address.
- Decided 2026-11-17: no character limit, for fetched text ("Remove the limit. We will deal with that later if it becomes a problem.") and for pasted text ("Remove it for pasted text too").
- Decided 2026-11-17: the single-link request form is removed.
- Decided 2026-11-17: a pasted posting without a link "won't exist".
- Decided 2026-11-17: a LinkedIn `?currentJobId=<id>` link and the same job's `/jobs/view/<id>` link are the same job.
- Decided 2026-11-17 (Indeed): "We will use the browser extension (until I build a way to bypass the Indeed automation blocker). Each Indeed link becomes a row in the Runs list in the state 'needs the posting's text', with a 'Paste the text' button, like a failed fetch but without any request to Indeed. One Indeed link given alone does the same."
- Decided 2026-11-17 (a link already there): "Skip it and say so. There is no need to generate more than one resume for the same link without passing additional arguments." What counts: "Any row in the Runs list with the same job that didn't fail and wasn't cancelled, plus any saved application whose `URL` has the same link."
- Decided 2026-11-17: `job.md` keeps the address the text was read from, "and the list should also shows this link. Only one source of truth."
- Decided 2026-11-17: pasting is a last resort ("I don't want to use it"). Whether the form keeps a "Paste text" tab is in `OPEN-QUESTIONS.md`; this task changes only what pasted text must carry (its link, no limit).
