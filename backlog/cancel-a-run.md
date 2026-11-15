---
title: Cancel a running generation
version: next version
reported: 2026-11-14
---

## Problem

Once "Generate resume" (or "Try again" / "Verify again") starts, there is no way to stop it. A mistake in the posting or the language means waiting for the run or restarting the app.

## What to build

- A Cancel button next to the running step, on the home form and on the application page.
- Cancelling stops the model call in Ollama, not only the page: today the server keeps running the pipeline even when the browser disconnects.
- Files of finished steps stay saved (nothing is deleted), so a cancelled run can be continued with "Try again".

## Notes

- Not listed in constitution Art. X yet; it needs an amendment before it is built.
