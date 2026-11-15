---
title: Get postings from Indeed
id: F44
version: next version
reported: 2026-11-15
---

## Problem

Indeed is one of the two job sites that must work, and it refuses plain automated requests (403 "Security Check", checked 2026-11-15). The constitution allows only a plain fetch and forbids headless-browser scraping (Art. V.10), and the app must not disguise its requests as a browser to get past the check.

## Status

Not ready to build: the approach is not decided yet (Art. X.5). The options put to the user on 2026-11-15:

- A bookmarklet: the user opens the Indeed job in their own browser and clicks a "Send to Resume Manager" bookmark, which hands the page's text and link to the local app.
- Paste for Indeed: Indeed links are recognised and the form asks for the pasted text at once, keeping the link.
- A browser extension that adds a button on Indeed and LinkedIn job pages.

## Depends on

- [posting-by-url](posting-by-url.md).
