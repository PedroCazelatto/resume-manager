---
title: Check names, dates and numbers
id: F15
version: implemented
---

## What it does

Code checks that every employer, institution, date and number in the resume appears in the profile files the item cites. Failures are saved in `verification.md` and shown on the application page. The check runs again every time the resume is saved.

## Notes

- Numbers written as words ("five years") are not caught here; the model review covers them.
