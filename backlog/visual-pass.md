---
title: Make the interface look good
id: F35
version: next version
reported: 2026-11-14
---

## Problem

The interface works but is ugly: plain stacked sections with little structure.

## Behaviour

- A vertical sidebar on the left of every page holds: the app name (links home), the navigation ("New application", and other pages as they exist), a runs indicator showing how many runs are active or waiting (opens the Runs list), the profile picker, and the dark-mode toggle at the bottom.
- On narrow screens the sidebar collapses to a top bar with a menu button.
- Green is the accent colour for primary buttons, links and highlights. Status colours stay green, amber and red.
- Each section is a card with a clear title; statuses are badges (matched, partial, missing; draft, ready; pending, approved, rejected).
- The application page has two columns on wide screens: the resume preview with Print and Edit on the left, staying in view while scrolling; the status summary, implied skills, verification, fit/gap and posting on the right. On narrow screens they stack.
- The home page shows the new-application form as a card, with the Runs list beside or under it.
- The resume preview itself is not restyled; the template defines it.

## Acceptance criteria

- [ ] Every existing page uses the sidebar layout, cards and badges; nothing that works today stops working.
- [ ] Text on the green accent has a contrast of at least 4.5:1 in light and dark mode.
- [ ] The layout holds at 1440 px and at 390 px wide; check both, in both modes.
- [ ] No remote fonts, images or scripts (Art. III.2): the system font stack is used.
- [ ] No behaviour changes: this task restyles and rearranges only.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Set the green accent through the `--primary` and `--primary-foreground` variables in `src/app/globals.css`, for `:root` and `.dark`.
- Add the shadcn/ui components it needs (`card`, `badge`, `separator`, and `sheet` or similar for the narrow-screen menu) with the shadcn CLI; they are local source files.
- The sidebar goes in `src/app/layout.tsx` (a server component reading the profile list) with small client parts for the picker, the toggle and the runs indicator.
- Files to restyle: `src/app/page.tsx`, `src/app/applications/[id]/page.tsx`, and everything in `src/components/`.
- The runs indicator reads `GET /api/runs` from [run-queue](run-queue.md); if that task isn't built yet, leave the indicator out.

## Depends on

- [dark-mode](dark-mode.md): do it first or together, since both touch every component's colours.
- [run-queue](run-queue.md), for the runs indicator only.

## Decisions

- Decided 2026-11-15: direction "clean and minimal" with the current shadcn/ui components.
- Decided 2026-11-15: a vertical sidebar instead of a top header, holding name, profile, runs and theme.
- Decided 2026-11-15: green accent.
