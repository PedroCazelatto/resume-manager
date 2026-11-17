---
title: Dark mode
id: F34
version: implemented
reported: 2026-11-14
---

## What it does

- A sun/moon button at the bottom of the sidebar of every page (in the menu on narrow screens) switches between light and dark.
- Until the button is used, the app follows the system's light or dark setting, and changes with it while the page is open.
- After that, the choice is remembered in the browser's local storage (`theme` = `light` or `dark`) and the system setting is no longer followed.
- The mode is set before the first paint, so a page never flashes in the wrong mode.
- The resume preview stays white paper in both modes.

## Where it lives

- `src/lib/theme.ts`: `resolveTheme`, `THEME_KEY`, `THEME_SCRIPT` (the inline script).
- `src/app/layout.tsx`: runs `THEME_SCRIPT` in `<head>`. The toggle sits in `src/components/app-sidebar.tsx` ([visual-pass](visual-pass.md)).
- `src/components/theme-toggle.tsx`: `ThemeToggle`.
- `src/app/globals.css`: the `.dark` colours, and `color-scheme: dark` for scrollbars and native controls.
- `src/components/resume-preview.tsx`: the frame keeps `bg-white`.

## Tests

- `src/lib/theme.test.ts`: `resolveTheme`, and the inline script run against a fake browser to check it agrees with `resolveTheme`.

## Rules it follows

- Art. III.2 (the script is inline; no remote fonts, scripts or images).
- Art. IX.4 (no new dependency).

## Notes

- Decided 2026-11-15: a toggle button; the system setting is the default until it is used.
- The toggle moved from the top-right corner into the sidebar with [visual-pass](visual-pass.md).
- No component colour needed changing: every colour already came from the theme tokens or had a `dark:` variant. Measured text contrast is at least 4.74:1 in light mode and 6.8:1 in dark mode.
