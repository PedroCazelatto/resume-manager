---
title: Give a link to the job posting instead of pasting it
id: F10
version: next version
reported: 2026-11-14
---

## Problem

The posting has to be copied and pasted. The user wants to give the link to the job's page (Indeed first).

## Behaviour

- The new-application form has two tabs: "From links" and "Paste text". This task makes "From links" accept one link; [list-of-posting-urls](list-of-posting-urls.md) extends it to several.
- The run gets a first step, "Fetching the posting": the app downloads the page, extracts its text and uses it as the posting.
- `job.md` is saved with `source: url`, the `url`, and the extracted text as its body.
- If the fetch fails or the page yields no text at all, the run fails with the reason, and the form switches to "Paste text" with the link kept. A run then started from pasted text saves `source: paste` and the kept `url`.
- There is no minimum amount of text: any non-empty result is used.

## Acceptance criteria

- [ ] A link to a plain HTML job page produces a run whose `job.md` has `source: url`, the link, and the page's readable text without scripts, styles, navigation, header or footer.
- [ ] Only `http` and `https` links are accepted. Links to loopback, private and link-local addresses are refused, including when a public name resolves to such an address and when a redirect leads to one.
- [ ] The fetch gives up after 30 seconds and refuses more than 5 MB; both show a clear reason.
- [ ] At most 5 redirects are followed, each one checked like the first link.
- [ ] A failed fetch leaves the form on "Paste text" with the link still there.
- [ ] Unit tests cover URL checks, HTML-to-text and the fetcher (with a fake `fetch` and a fake resolver); no test touches the network.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- New adapter `src/adapters/job-fetcher.ts` with the interface `JobFetcher { fetchPosting(url): Promise<{ ok: true; text: string; url: string } | { ok: false; reason: string }> }`; inject `fetch` and a DNS lookup so tests can fake both.
- New pure modules: `src/core/posting/url.ts` (protocol and address checks) and `src/core/posting/html-to-text.ts`.
- HTML parsing uses one small parser library, `node-html-parser` (approved 2026-11-15). Remove `script`, `style`, `noscript`, `nav`, `header`, `footer`, `aside`, `form`, `svg`; prefer `main` or `article` when present; collapse whitespace; keep line breaks between blocks.
- Limits are constants in the fetcher: 30 s, 5 MB.
- Send the default request headers plus an honest `User-Agent` naming the app. Do not imitate a browser and do not add a headless browser (Art. V.10).
- `src/core/pipeline/run.ts`: add a `fetch` step and a `start: { url }` variant; `src/core/application/schemas.ts` already has `source: url` and `url`.
- Tabs: add the shadcn/ui `tabs` component.
- Before building, ask the user to run `curl -s -o /dev/null -w "%{http_code}\n" "<an Indeed job link>"` and record the result under Decisions. Build the task either way: if Indeed refuses plain requests, its links fall back to pasting.
- Art. II.7 (fetched text is untrusted, like pasted text), Art. III.2 (outbound requests only to links the user submits), Art. V.10 (fetcher rules).

## Depends on

- [run-queue](run-queue.md): the fetch is a step of a queued run.

## Decisions

- Decided 2026-11-15: plain fetch with the paste fallback; no headless browser.
- Decided 2026-11-15: two tabs on the form.
- Decided 2026-11-15: 30 seconds, 5 MB, no minimum text length.
- Open risk, not yet checked: Indeed may refuse plain automated requests.
