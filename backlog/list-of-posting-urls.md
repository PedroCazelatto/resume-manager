---
title: Accept a list of job links at once
id: F33
version: next version
reported: 2026-11-14
---

## Problem

Applying to several jobs means starting each run by hand and waiting for it to finish.

## What to build

- The link field accepts several links; the app runs them one after another, each in its own application folder.
- Progress shows which link is running and which ones finished or failed.

## Notes

- Asked for as a bonus on top of [posting-by-url](posting-by-url.md), which it depends on.
- Each link is a full run of three model calls, so a list can take hours. It also needs [cancel-a-run](cancel-a-run.md).
