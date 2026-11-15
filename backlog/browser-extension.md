---
title: Browser extension that sends job postings to the app
id: F45
version: future version
reported: 2026-11-15
---

## Problem

Job sites that block automated requests (Indeed) can only be read from the user's own browser. If the bookmarklet ([indeed-postings](indeed-postings.md)) turns out not to work, or is too clumsy, an extension is the fallback.

## Behaviour

- A Chrome extension adds a "Send to Resume Manager" button to its toolbar icon. On a job page it sends the page's link and posting text to the local app.
- The app receives it on the same `/send` page as the bookmarklet: the user confirms with "Generate resume", and the run starts or waits in the queue.
- The extension works on Indeed and LinkedIn job pages, and on any other page using the selected text or the visible text.

## Acceptance criteria

- [ ] With the extension loaded, one click on an Indeed job page and one on "Generate resume" starts or queues a run with that posting.
- [ ] The extension asks only for the `activeTab` permission: it reads a page only when the user clicks its button, and sends the text only to the local app's address.
- [ ] The app's address is a setting of the extension, `http://127.0.0.1:3000` by default.
- [ ] It makes no request to any server other than the local app.

## Technical notes

- A Manifest V3 extension in a new top-level folder `extension/`, loaded unpacked through `chrome://extensions`; it is not published to a store.
- It reuses the text-picking rules and the `/send` page of [indeed-postings](indeed-postings.md); keep the picking rules in one shared file so both stay the same.
- Art. III.2 (the app makes no request to the job site), Art. II.7 (the text is untrusted input).

## Depends on

- [indeed-postings](indeed-postings.md): the `/send` page and the picking rules.
- [run-queue](run-queue.md).

## Decisions

- Decided 2026-11-15: kept as a fallback; build it only if the bookmarklet is not enough.
