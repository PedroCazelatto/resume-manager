---
title: Dark mode
id: F34
version: next version
reported: 2026-11-14
---

## Problem

The app only has a light look.

## Behaviour

- A toggle button switches between light and dark.
- Until the toggle is used, the app follows the system's light or dark setting. After that, the choice is remembered in the browser.
- The resume preview stays as the template defines it (white paper) in both modes.

## Acceptance criteria

- [ ] With no stored choice, the app matches the system setting and follows it when the system changes.
- [ ] After toggling, the choice survives a reload and no longer follows the system.
- [ ] No flash of the wrong mode on load.
- [ ] Every page and component is readable in both modes (text contrast at least 4.5:1).
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; new core logic has unit tests with the model mocked (Art. IX).
- [ ] This file's header says `version: implemented` and `backlog/index.md` lists it under Implemented.

## Technical notes

- Tailwind and shadcn/ui already style a `dark` class on `<html>` (`src/app/globals.css`).
- No new dependency: a small inline script in `src/app/layout.tsx` sets the class before paint from `localStorage` (`theme` = `light` or `dark`) or, when absent, from `prefers-color-scheme`. The script is inline, not remote (Art. III.2).
- The toggle is a client component with a sun/moon icon from `lucide-react`. It sits in the sidebar once [visual-pass](visual-pass.md) exists; until then, in the top-right corner of every page.
- The preview frame (`src/components/resume-preview.tsx`) keeps `bg-white`.

## Depends on

- Nothing.

## Decisions

- Decided 2026-11-15: a toggle button; the system setting is the default until it is used.
