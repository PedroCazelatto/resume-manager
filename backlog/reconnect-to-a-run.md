---
title: Reconnect to a running generation
id: F39
version: next version
reported: 2026-11-15
---

## Problem

Reloading or closing the tab loses the progress display. The run keeps going on the server, but the page no longer follows it.

## What to build

- When the page opens while a run is in progress, it shows that run's steps and progress again.
- This applies to the home form and to the application page.

## Notes

- Needed by [cancel-a-run](cancel-a-run.md) too: a run you can't see can't be cancelled.
