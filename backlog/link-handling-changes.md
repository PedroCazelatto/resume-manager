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
2. **No character limit on a fetched page's text.** The 50,000-character check on fetched text goes. The 5 MB page limit, the 30 seconds and the 5 redirects stay.
3. **The single-link request is removed.** `POST /api/applications` no longer accepts `{ url, language }`; it accepts `{ urls, language }` (the form's links) and `{ posting, url?, language, replaces? }` (pasted text).
4. **LinkedIn job IDs.** Two LinkedIn links to the same job are the same link: `https://www.linkedin.com/jobs/search/?currentJobId=<id>`, `https://www.linkedin.com/jobs/view/<id>` and `https://www.linkedin.com/jobs/view/<words>-<id>` all name job `<id>`. A list that gives the same job twice queues it once, where it came first.
5. **Indeed links inside a list.** An Indeed link no longer refuses the list. The other links are queued as usual, and each Indeed link asks for its text one by one (how: see Decisions; this part is not ready until answered). The server still never requests an Indeed page.
6. **A link that is already there is skipped.** A link whose job is already in the Runs list (which runs count: see Decisions; not ready until answered) is not queued again. The form says which lines were skipped and why, in one line each, next to the count of runs added. A list where every link was skipped queues nothing and says so; that is not an error.
7. **The Runs list shows the address the text was read from.** Once a fetch worked, the run's link in the Runs list is the address saved in `job.md` (after the LinkedIn rewrite and any redirects). Before that, it is the link as given.

## Acceptance criteria

- [ ] The fetcher's tests show one lookup per host per request, and that the connection is made to the checked address; a name whose second answer would be private can no longer be reached, because there is no second answer.
- [ ] A fetched page with more than 50,000 characters of text goes on to the run queue whole.
- [ ] `{ url, language }` is refused with 400, and nothing in the app sends it.
- [ ] The three LinkedIn forms of one job count as one link; two different jobs stay two.
- [ ] Items 5 and 6 behave as written in Decisions once answered.
- [ ] After a fetch that followed a redirect, `GET /api/runs` lists the final address for that run.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass; no test touches the network (Art. IX.2).
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [posting-by-url](posting-by-url.md) and [list-of-posting-urls](list-of-posting-urls.md) describe the new behaviour.

## Technical notes

- Item 1: `src/adapters/job-fetcher.ts` uses the global `fetch` today, which resolves the name again. Use `node:http` / `node:https` `request` with a `lookup` option that returns the address already checked; this needs no new dependency. Keep the user-agent, charset handling, size counting while reading, the timeout covering the whole fetch, and cancelling through the `AbortSignal`. Keep a seam for tests (an injected request function and the injected `ResolveHost`), so no test opens a socket.
- Item 2: `fetchedStart` in `src/core/posting/start.ts` holds the check; `MAX_POSTING_CHARS` in `src/core/posting/job-fetcher.ts` stays for pasted text unless Decisions say otherwise.
- Item 3: `readNewRunStart` in `src/core/posting/start.ts` and `src/app/api/applications/route.ts`; update their tests.
- Item 4: put the job-ID reading next to `rewriteLinkedInUrl` in `src/core/posting/sites.ts`, and use it in `readLinks` (`src/core/posting/links.ts`), which today compares `URL.href`.
- Item 6: the check belongs in core (a pure function over the runs and the new links); the route reads the registry and, if Decisions say so, the profile's saved applications through `ProfileStore`.
- Item 7: `RunSummary.url` in `src/app/runs.ts`; `fetchDone` in `src/core/runs/queue.ts` already receives the fetched address.
- Art. V.10, III.2, III.4, V.3, IX.2 apply as in [posting-by-url](posting-by-url.md).

## Depends on

- [posting-by-url](posting-by-url.md) and [list-of-posting-urls](list-of-posting-urls.md) (both implemented).
- [runs-list-changes](runs-list-changes.md) touches the same files (`src/core/runs/queue.ts`, `src/app/runs.ts`, `src/components/runs-list.tsx`); build the two one after the other, not at the same time.

## Decisions

- Decided 2026-11-17 (the user, on the name that could change its address): "There will be only one fetch." Read as: one lookup, and the connection goes to the checked address.
- Decided 2026-11-17: "Remove the limit. We will deal with that later if it becomes a problem." (fetched text).
- Decided 2026-11-17: the single-link request form is removed.
- Decided 2026-11-17: a LinkedIn `?currentJobId=<id>` link and the same job's `/jobs/view/<id>` link are the same job.
- Decided 2026-11-17: an Indeed link inside a list: "Queue the other links and ask for the Indeed ones' text one by one."
- Decided 2026-11-17: a link already in the Runs list: "Skip it and say so. There is no need to generate more than one resume for the same link without passing additional arguments."
- Decided 2026-11-17: `job.md` keeps the address the text was read from, "and the list should also shows this link. Only one source of truth."
- Not ready until answered in `OPEN-QUESTIONS.md`: how the Indeed links ask for their text (item 5); which earlier runs or applications count as "already there" (item 6); whether pasted text loses its 50,000-character limit too (item 2).
