---
title: Send a posting from your browser with a bookmarklet (fallback for Indeed)
id: F44
version: future version
reported: 2026-11-15
---

## Problem

Indeed is one of the two job sites that must work, and it refuses automated requests. The user does not want to copy and paste the posting's text.

## Behaviour

- The home page shows a "Send to Resume Manager" link with one line of instructions: drag it to the bookmarks bar.
- On a job page in the user's own browser (Indeed, LinkedIn, or any other site), clicking the bookmark opens the app's `/send` page in a new tab, carrying the page's link and the posting's text.
- `/send` shows where the posting came from, the start of its text, and one "Generate resume" button, which has the focus. Pressing it puts the run in the queue; if another run is working, this one waits its turn.
- The run is saved with the page's link in `job.md` (`source: paste`, `url`).
- The text taken from the page is, in this order: the text the user selected, if any; the visible text of the page's main area (the `main` element or `[role="main"]`); otherwise the whole page's visible text. It is cut at 50,000 characters.
- The text keeps the job's title, company and location that sit above the description, since the analysis needs them. Leftover menu words are harmless: the model treats the posting as data.

## Acceptance criteria

- [ ] On an Indeed job page, one click on the bookmark and one on "Generate resume" starts or queues a run with that posting, without copying anything by hand.
- [ ] The same works on a LinkedIn job page while logged in.
- [ ] Nothing starts without the click on `/send`: opening `/send` with data never enqueues by itself, so another website can't start runs by linking to it.
- [ ] The posting's text travels in the URL fragment (after `#`), which the browser never sends to any server; `/send` removes it from the address bar after reading it.
- [ ] `/send` without data, or with an empty text, explains how to use the bookmark.
- [ ] Building the bookmark's code and reading the fragment are pure functions with unit tests.

## Technical notes

- The bookmark is a `javascript:` link built from the app's own address (so it works on any port). It only reads the page and opens `http://<app>/send#url=<encoded>&text=<encoded>`; it makes no network request from the job page, so the page's content-security rules don't apply to it. If the browser blocks the new tab, it navigates the current tab instead.
- New route `src/app/send/page.tsx` (client component for reading `location.hash`); it posts to `POST /api/applications` with `{ posting, url }` (no language since [english-only-resumes](english-only-resumes.md)).
- `POST /api/applications` gains an optional `url`, validated like any link (http/https only) and saved in `job.md`; `src/core/pipeline/run.ts` passes it to `analysePosting`, which today always writes `source: paste` without a link.
- The text is untrusted input exactly like a pasted posting (Art. II.7); like any posting, it has no character limit ([link-handling-changes](link-handling-changes.md)).
- Art. III.2: the app itself makes no request to the job site. Art. V.10 is untouched: there is no fetch and no headless browser here.

## Depends on

- [run-queue](run-queue.md): a posting sent while a run is working must wait in the queue.

## Decisions

- Checked 2026-11-15: Indeed answers 403 "Security Check" or "Blocked" to a plain request, and "Blocked" to an undisguised headless Chrome, on a real job link. The app must not disguise itself as a person's browser to get past that check.
- Decided 2026-11-15: no copy-pasting; try the bookmarklet first. The browser extension stays as a fallback ([browser-extension](browser-extension.md)).
- Decided 2026-11-15: whatever sends a posting, it goes to the queue when a run is already working.
- Checked 2026-11-15 by the user on a real Indeed job page: the bookmark opened the app's `/send` address in a new tab with the page's text after `#text=`. The mechanism works on Indeed.
- From the same check: `#jobDescriptionText` did not match on that page, so the whole page's text was sent, starting with Indeed's menu ("Skip to main content, Home, Company reviews…") and then the title, company, location and the full description. That is why the picking rule uses the page's main area instead of a site-specific element.
- Checked 2026-11-15 (web search of Indeed's developer docs and third-party guides): no official Indeed API was found that lets an individual read a job posting. The old Publisher API (job search) is reported as retired and closed to new users; the current APIs (Job Sync, Job Update, Disposition Sync, Sponsored Jobs) are for employers and recruiting-software partners and need Indeed's approval. Indeed's own notice of the Publisher API's retirement was not found, so its date is unconfirmed.
- Decided 2026-11-15: the user finds the bookmarklet's extra tab clumsy and wants to paste a copied link instead, so [browser-extension](browser-extension.md) is built first. This task is only a fallback that needs no installation: build it only if the extension fails on Indeed, and delete this file if the extension works.
