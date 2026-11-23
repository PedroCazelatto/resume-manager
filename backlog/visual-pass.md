---
title: Make the interface look good
id: F35
version: implemented
reported: 2026-11-14
---

## What it does

- Every page has a sidebar on the left with the app's name (it links home), "Resumes" (highlighted in the green accent on the home page), the profile picker and, at the bottom, the dark-mode toggle. "Resumes" replaced "New application" and "Runs" ([home-applications-table](home-applications-table.md)).
- The runs count left the sidebar: the home page's Generating tab shows the runs waiting for the model and the links being fetched, with a red circle for the rows that need attention ([home-applications-table](home-applications-table.md)).
- Below 768 px the sidebar becomes a top bar with the app's name and a menu button; the menu opens the same sidebar from the left and closes when a link in it is followed.
- Green is the accent: primary buttons (such as "Add links", "Generate resume" and "Print / Save as PDF"), the selected sidebar entry and the keyboard focus ring ([home-applications-table](home-applications-table.md)). White text on the light-mode green has a contrast of 4.73:1; dark text on the dark-mode green 8.9:1.
- Each section is a card with its title: the generation in progress ("In progress"), problems with files, and on the application page "Resume", "This run didn't finish", "Implied skills", "Verification", "Sources", "Fit/gap analysis" and "Job posting" (still folded until opened).
- Statuses are badges in green, amber or red: matched, partial, missing; draft (amber), ready (green); pending (amber), approved (green), rejected (red); a dismissed verification failure (grey). In the home page's table a row's status is a glowing ball in the same colours (running and finished green, failed red, "needs the posting's text" amber, the others grey), and its state is written next to it ([home-applications-table](home-applications-table.md)).
- The home page is one column under the heading "Resumes", with the "Add links" button at the top right: whether the profile is valid and the template, then the generation in progress, then the table of applications in its Ready, Generating and Archived tabs ([home-applications-table](home-applications-table.md)). The profile picker moved to the sidebar; the page shows it too while no profile is chosen, so the first choice is in view on a phone.
- The application page has the role and company as its heading, then, from 1280 px, two columns. On the left, "Print / Save as PDF", "Verify again" and why printing is locked, the run's progress, "Edit the resume", then the preview; this column stays in view while the page scrolls and scrolls on its own when it is taller than the window. On the right: the "Resume" card with its language and status badge, "This run didn't finish" when it shows, implied skills, verification, sources, fit/gap and the job posting. Below 1280 px the columns stack in that order. An application without a resume keeps a single column.
- The resume preview itself is not restyled: the template defines it, the frame stays white paper in both modes, and printing still prints the frame's own document.
- The system font stack is used; nothing is loaded from elsewhere.

## Where it lives

- `src/app/globals.css`: `--primary`, `--primary-foreground` and `--sidebar-primary` for `:root` and `.dark`.
- `src/app/layout.tsx`: the sidebar on wide screens and the top bar with the menu on narrow ones.
- `src/components/app-sidebar.tsx`: `SidebarContent` (the name, navigation, profile picker and toggle) and `AppName`.
- `src/components/nav-link.tsx`: `NavItem` and `NavLink` (which reads the URL to highlight the current page, inside `<Suspense>`).
- `src/components/mobile-menu.tsx`: `MobileMenu`. (`src/components/runs-indicator.tsx`, the sidebar's count, was removed by [home-applications-table](home-applications-table.md).)
- `src/components/section-card.tsx`: `SectionCard`, a card with a title, description and action. `src/components/status-badge.tsx`: `StatusBadge` and its tones.
- `src/components/ui/card.tsx`, `badge.tsx`, `sheet.tsx`: shadcn/ui components added with its CLI; they use `@base-ui/react`, already a dependency.
- Restyled: `src/app/page.tsx`, `src/app/applications/[id]/page.tsx`, and in `src/components/`: `analysis-view`, `file-problems`, `new-application-form`, `profile-picker`, `resume-editor`, `resume-view`, `retry-run`, `runs-list`, `source-list`, `verification-view`.

## Tests

- No new core logic, so no new unit tests; typecheck, lint, the unit tests and `npm run build` pass.
- Checked in headless Chrome on 2026-11-17 against `npm run start` with `example-profiles`, no model reachable and a scratch application of the example profile (removed afterwards): the home page and the application page at 1440 px and 390 px, in light and dark; the menu open at 390 px; the application page scrolled with "Edit the resume" open, where the left column stays in view; the home page with no profile chosen; choosing a profile in the sidebar; a failed run in the Runs list. No errors in the browser console.
- Not seen: the count next to "Runs" with a run waiting or running (no model was reachable, so runs failed at once), and the print dialog itself (the Print button, the frame and the template are unchanged).

## Rules it follows

- Art. III.2 (system fonts; no remote fonts, images or scripts).
- Art. V.3 (UI only in `src/app/` and `src/components/`; no core or adapter changed).
- Art. V.9 and VII.1 (the template and the preview frame are untouched, so the preview and the PDF still match).
- Art. IX.4 (no new dependency: the shadcn/ui components are local files built on `@base-ui/react`).

## Notes

- Decided 2026-11-15: direction "clean and minimal" with the current shadcn/ui components.
- Decided 2026-11-15: a vertical sidebar instead of a top header, holding name, profile, runs and theme.
- Decided 2026-11-15: green accent.
- The home page's visible "Resume Manager" heading and the application page's "← Resume Manager" link gave way to the sidebar's name, which links home; the home page keeps the heading for screen readers.
- On the application page the "Resume · language · status" heading became the "Resume" card on the right, with the status as a badge.
- The left column scrolls on its own so that a preview taller than the window doesn't push the buttons out of view; its scrollbar gutter is reserved so the preview's width doesn't change when the scrollbar appears.
- Decided 2026-11-17: the status badge colours stay; the selected sidebar entry and the focus ring may use the green accent (built in [home-applications-table](home-applications-table.md)); removing the visible heading and the back link is fine.
- Decided 2026-11-17: how the application page scrolls on wide screens is reviewed after the home page's new design ([home-applications-table](home-applications-table.md)).
- The runs count in the sidebar moved to the home page's Generating tab, the selected sidebar entry and the focus ring became green, and the form and the Runs list became the table of applications (built 2026-11-23, [home-applications-table](home-applications-table.md)).
