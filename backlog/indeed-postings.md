---
title: Send a posting from your browser with a bookmarklet (Indeed)
id: F44
version: next version
reported: 2026-11-15
---

## Problem

Indeed is one of the two job sites that must work, and it refuses automated requests. The user does not want to copy and paste the posting's text.

## Behaviour

- The home page shows a "Send to Resume Manager" link with one line of instructions: drag it to the bookmarks bar.
- On a job page in the user's own browser (Indeed, LinkedIn, or any other site), clicking the bookmark opens the app's `/send` page in a new tab, carrying the page's link and the posting's text.
- `/send` shows where the posting came from, the start of its text, the language choice, and one "Generate resume" button, which has the focus. Pressing it puts the run in the queue; if another run is working, this one waits its turn.
- The run is saved with the page's link in `job.md` (`source: paste`, `url`).
- The text taken from the page is, in this order: the text the user selected, if any; the site's job-description element when known (Indeed: `#jobDescriptionText`; LinkedIn: `.show-more-less-html__markup` or `.jobs-description`); otherwise the page's visible text. It is cut at 50,000 characters.

## Acceptance criteria

- [ ] On an Indeed job page, one click on the bookmark and one on "Generate resume" starts or queues a run with that posting, without copying anything by hand.
- [ ] The same works on a LinkedIn job page while logged in.
- [ ] Nothing starts without the click on `/send`: opening `/send` with data never enqueues by itself, so another website can't start runs by linking to it.
- [ ] The posting's text travels in the URL fragment (after `#`), which the browser never sends to any server; `/send` removes it from the address bar after reading it.
- [ ] `/send` without data, or with an empty text, explains how to use the bookmark.
- [ ] Building the bookmark's code and reading the fragment are pure functions with unit tests.

## Technical notes

- The bookmark is a `javascript:` link built from the app's own address (so it works on any port). It only reads the page and opens `http://<app>/send#url=<encoded>&text=<encoded>`; it makes no network request from the job page, so the page's content-security rules don't apply to it. If the browser blocks the new tab, it navigates the current tab instead.
- New route `src/app/send/page.tsx` (client component for reading `location.hash`); it posts to `POST /api/applications` with `{ posting, url, language }`.
- `POST /api/applications` gains an optional `url`, validated like any link (http/https only) and saved in `job.md`; `src/core/pipeline/run.ts` passes it to `analysePosting`, which today always writes `source: paste` without a link.
- The text is untrusted input exactly like a pasted posting (Art. II.7); the 50,000-character limit of `src/app/api/applications/route.ts` applies.
- Art. III.2: the app itself makes no request to the job site. Art. V.10 is untouched: there is no fetch and no headless browser here.

## Depends on

- [run-queue](run-queue.md): a posting sent while a run is working must wait in the queue.
- Not ready to build until the user has run the check below and it passed (Art. X.5).

## Decisions

- Checked 2026-11-15: Indeed answers 403 "Security Check" or "Blocked" to a plain request, and "Blocked" to an undisguised headless Chrome, on a real job link. The app must not disguise itself as a person's browser to get past that check.
- Decided 2026-11-15: no copy-pasting; try the bookmarklet first. The browser extension stays as a fallback ([browser-extension](browser-extension.md)).
- Decided 2026-11-15: whatever sends a posting, it goes to the queue when a run is already working.
- Open check, to be run by the user in their browser on an Indeed job page: create a bookmark whose address is `javascript:(()=>{window.open('http://127.0.0.1:3000/send#text='+encodeURIComponent((document.querySelector('#jobDescriptionText')||document.body).innerText.slice(0,3000)))})()` and click it. It passes if a new tab opens whose address contains the posting's text (the app doesn't need to be running).
