---
title: Make the interface look good
id: F35
version: next version
reported: 2026-11-14
---

## Problem

The interface works but is ugly: plain stacked sections with little structure.

## What to build

- A clean, minimal look with the current shadcn/ui components: a proper header, a card for each section, consistent spacing and typography, and status badges.
- A two-column application page on wide screens: the resume on the left, the review (implied skills, verification, fit/gap) on the right.
- The resume preview itself is not restyled; the template defines it.

## Notes

- Decided 2026-11-15: direction "clean and minimal".
- Best done together with [dark-mode](dark-mode.md), since both touch every component's colours.
