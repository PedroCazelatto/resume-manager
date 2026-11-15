---
title: Catch numbers written as words
id: F41
version: next version
reported: 2026-11-15
---

## Problem

The code check only sees digits. "Over five years of experience" passed it in a test run; only the model review flagged it.

## What to build

- The model review is told explicitly to treat numbers written as words as numbers and to flag the ones the cited files don't state.
- The code check stays as it is.

## Notes

- Decided 2026-11-15: handled through the model, so it works in any language; no word lists in code.
