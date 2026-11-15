---
title: Give a link to the job posting instead of pasting it
id: F10
version: next version
reported: 2026-11-14
---

## Problem

The posting has to be copied and pasted. The user wants a field for the link to the job's Indeed page.

## What to build

- A URL field on the new-application form; the app fetches the page, extracts the posting text and saves the link in `job.md` (`source: url`, `url`).
- If fetching fails or yields too little text, the form asks for the pasted text instead.

## Notes

- Art. V.10 sets the rules: http/https only, no private or loopback addresses, size and time limits, and no headless-browser scraping.
- Decided 2026-11-15: plain fetch with the paste fallback; no headless browser.
- Open risk: Indeed may refuse plain automated requests. Check this before building and report the result; if it refuses, links from Indeed always fall back to pasting.
