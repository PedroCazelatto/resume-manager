---
title: Read Indeed links through a browser extension
id: F45
version: next version
reported: 2026-11-15
---

## Problem

Indeed is one of the two job sites that must work. It blocks every request the app's server can make, and it has no API an individual can use. The user wants to copy a job's link on Indeed and paste it into Resume Manager, nothing more.

## Behaviour

- A small Chrome extension, installed once, lets Resume Manager read Indeed job pages through the user's own signed-in browser.
- In the "From links" tab, the user pastes Indeed links like any other link. For each Indeed link, the extension opens the page in a background tab, reads its text, closes the tab and hands the text to the app, which puts the run in the queue. Other links are fetched by the server as in [posting-by-url](posting-by-url.md).
- Indeed links are read one at a time, in the order given.
- When Indeed shows a security check or a "blocked" page instead of the job, that link fails with "Indeed asked for a security check: open the link once yourself, then try again", the tab is left open and brought to the front so the user can pass the check, and the remaining links continue.
- Without the extension, an Indeed link asks for its text as decided in [link-handling-changes](link-handling-changes.md), with a short message that says how to install the extension; the home page links to the same instructions.
- The text taken from the page is the visible text of its main area (the `main` element or `[role="main"]`), otherwise of the whole page, with the same length rule as a fetched page ([link-handling-changes](link-handling-changes.md)). It keeps the title, company and location above the description.
- The run's `job.md` has the link and `source: Indeed`, like any posting with an Indeed link ([job-posting-details](job-posting-details.md)).

## Acceptance criteria

- [ ] With the extension installed, pasting one Indeed link and pressing Generate starts or queues a run whose `job.md` holds that posting's text and link, with no other action by the user.
- [ ] Pasting three Indeed links queues three runs.
- [ ] A security-check or blocked page is detected (by its title: "Security Check", "Blocked", "Just a moment") and reported as described; it is never used as a posting.
- [ ] A page that doesn't finish loading within 30 seconds fails with a clear reason and its tab is closed.
- [ ] Without the extension, Indeed links ask for their text as in [link-handling-changes](link-handling-changes.md), with the install instructions, and non-Indeed links still work.
- [ ] The extension reads pages only on `indeed.com` (and its country subdomains), only links the user pasted, and sends text only to the page of the local app that asked for it. It makes no other request.
- [ ] The extension is checked by hand on a real Indeed job link, and the result is written under Decisions. If Indeed blocks background tabs every time, stop and report to the user instead of working around it.
- [ ] Recognising Indeed links, detecting a blocked page and picking the text are pure functions with unit tests.

## Technical notes

- A Manifest V3 extension in a new top-level folder `extension/`, plain JavaScript with no build step, loaded unpacked through `chrome://extensions` (Chrome and other Chromium browsers). It is not published to a store.
- Parts: a content script that runs only on the app's pages (`http://127.0.0.1/*`, `http://localhost/*`) and relays messages between the page (`window.postMessage`) and the extension (`chrome.runtime`); and a background service worker that does the reading.
- Reading one link, in the service worker: `chrome.tabs.create({ url, active: false })`; wait for the tab to finish loading (30-second limit); `chrome.scripting.executeScript` to return the page's title and picked text; close the tab; answer the page.
- Permissions: `scripting`, `tabs`, and host permissions for `*://*.indeed.com/*` only.
- The app's form (`src/components/new-application-form.tsx`) detects the extension by sending a "ping" message and waiting briefly for the answer.
- For each Indeed link the form asks the extension for the text, then posts `{ posting, url, language }` to `POST /api/applications`; the server saves the link and takes `source` from the link's site (`Indeed`), as for any posting ([job-posting-details](job-posting-details.md)). Whether the text was pasted or read by the extension makes no difference. Indeed links never reach the server's fetcher.
- Put the shared pure functions in one plain JavaScript file inside `extension/` and test them with Vitest (add `extension/**/*.test.ts` to the `include` list in `vitest.config.mts`).
- The app's server must not imitate a browser or drive one (Art. V.10): the reading happens in the user's own browser, started by the user pasting the link.
- Art. II.7 (the text is untrusted input), Art. III.2 (requests go only to links the user submitted).
- Not known in advance: whether Indeed lets a background tab through as it does a tab the user opened. The hand check in the acceptance criteria answers it.
- Indeed's terms of use were not checked; the user accepted this approach on 2026-11-15.

## Depends on

- [posting-by-url](posting-by-url.md): the "From links" tab and saving a link in `job.md`.
- [list-of-posting-urls](list-of-posting-urls.md): for more than one link.
- [run-queue](run-queue.md).
- [job-posting-details](job-posting-details.md): `source` as the platform name.
- [link-handling-changes](link-handling-changes.md): how Indeed links ask for their text without the extension.

## Decisions

- Checked 2026-11-15: Indeed answers 403 "Security Check" or "Blocked" to a plain request and to an undisguised headless Chrome. No official API for individuals was found.
- Decided 2026-11-15: the flow must be "copy the link, paste it in the app"; the extension is the way to get it.
- Decided 2026-11-15: if the extension works on Indeed, delete the bookmarklet task ([indeed-postings](indeed-postings.md)).
- Decided 2026-11-15: whatever sends a posting, it goes to the queue when a run is already working.
- Decided 2026-11-17: `source` names the platform ("LinkedIn", "Indeed" or another), not how the text arrived, so the extension needs no way to tell its text from pasted text.
