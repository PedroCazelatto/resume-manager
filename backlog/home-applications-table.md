---
title: Home page as one table of all applications, with the queue in tabs
id: F26
version: next version
reported: 2026-11-15
---

## Problem

Past applications can only be found as folders on disk or by their URL, and the home page is a form with a Runs list under it. The user wants the home page reimagined as one table of all the applications, with the queue in tabs. This task was "Application history" (a list under the form) until 2026-11-17, when the user replaced it with this design.

## Behaviour

- The sidebar has one entry for the home page, "Resumes" (it replaces "New application" and "Runs").
- The home page is one table of the selected profile's applications, in three tabs:
  - **Ready**: only applications whose generation finished and that aren't archived, newest first. Each row opens the application's page. This is the tab shown first when no resume is being generated.
  - **Generating** (the resume queue): the runs waiting for the model, the links still in the fetch queue, and the runs that failed or were cancelled, in queue order, none of them archived.
  - **Archived**: the archived rows ([runs-list-changes](runs-list-changes.md)), finished or not, newest archived first (by `archived_at`), with the same columns. Each row has "Restore": an unfinished one goes back to Generating as cancelled, with "Try again"; a finished one goes back to Ready.
- After a restart, runs in memory are gone (Art. IV.1). An application whose generation never finished (it was fetching, waiting, running, failed or cancelled) and that isn't archived is listed in Generating as cancelled, with "Try again", "Paste the text" when it has no posting text, and the archive button. Nothing starts again by itself. ("Edit" comes later, with [edit-before-restart](edit-before-restart.md).)
- The Generating tab's label shows two numbers: valid runs waiting for the model / links still being fetched (for example "3 / 2"). When some runs have problems (a failed fetch, a link that needs its text, a failed generation), a red circle with their count is added.
- The generation in progress, if there is one, is shown on its own above the tabs, with its steps, timer, token counts and its X ([runs-list-changes](runs-list-changes.md)).
- Failed generations stay at their position in the list.
- A button at the top right opens a modal to add links (one per line), as the "From links" tab does today ([list-of-posting-urls](list-of-posting-urls.md)). It replaces the form on the page, and the form's "Paste text" tab goes: pasting is offered only on rows whose fetch failed ([runs-list-changes](runs-list-changes.md)). There is no language field ([english-only-resumes](english-only-resumes.md)).
- The table's columns, from left to right:
  1. the status, as a glowing ball in the status colour: running and finished green, failed red, needing the posting's text amber, the others grey;
  2. the job's title, with the company under it in a smaller font, the company being a link to its website when the posting gives it; the URL while the title isn't known ([job-posting-details](job-posting-details.md));
  3. the state, with the source under it, and the run's kind as a small label ("Try again", "Verify again");
  4. the row's actions: its main action as a visible button, and a hamburger button that opens a menu with the row's other actions (open, cancel, try again, paste the text, archive, restore, as the row allows; edit is added later by [edit-before-restart](edit-before-restart.md)). The main action of each kind of row: a link waiting to fetch or being fetched, and a run waiting for the model: cancel (the X); a failed fetch, a failed generation and a cancelled run: try again; a finished application in Ready, and an archived row: view PDF.
- A finished application's state is draft or ready, or "has problems" when one of its files is invalid (Art. IV.6).
- The runs count leaves the sidebar, since it is on the tab now.
- The selected sidebar entry and the keyboard focus ring use the green accent.
- Another profile's applications and runs never appear (Art. III.7).

## Acceptance criteria

- [ ] Every finished application under the profile's `applications/` appears once in "Ready"; a folder with an invalid `job.md` is listed as "has problems" instead of breaking the page; with none, the tab says so.
- [ ] The Generating tab lists waiting runs and fetch-queue links in order, with the two counts and the red problem count.
- [ ] Archived rows appear only in the Archived tab, newest archived first; "Restore" puts an unfinished one back in Generating as cancelled and a finished one back in Ready.
- [ ] After a restart, an unfinished application that isn't archived is in Generating as cancelled, with "Try again" and the archive button, plus "Paste the text" when it has no posting text; no run starts by itself.
- [ ] The generation in progress appears above the tabs, and only while there is one; the first tab shown follows the rule above.
- [ ] The modal queues links exactly as the "From links" tab does today, including its messages.
- [ ] Nothing that works on the home page today is lost: remove, cancel, archive, restore, "Try again", pasting the text on a failed fetch, notifications.
- [ ] Light and dark mode, 1440 px and 390 px wide, checked with screenshots.
- [ ] Deriving a row (title, company, source, date, status, tab) from an application's files and the runs in memory, and the counts, are pure functions in `src/core/` with unit tests; `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, `backlog/index.md` lists it under Implemented, and [run-queue](run-queue.md), [visual-pass](visual-pass.md) and [list-of-posting-urls](list-of-posting-urls.md) describe the new home page.

## Technical notes

- `ProfileStore` gains `listApplications(slug)`, returning the folder names; reading each row's `job.md` and `resume.md` goes through it too.
- The table and tabs: shadcn/ui `table` and `tabs` (the tabs component already exists in `src/components/ui/tabs.tsx`); the modal is the existing `src/components/ui/dialog.tsx`.
- The Runs list today is `src/components/runs-list.tsx` on `src/app/page.tsx`, fed by `GET /api/runs` every 2 seconds; the sidebar's count is `src/components/runs-indicator.tsx`; the form is `src/components/new-application-form.tsx`.
- Use the job details of [job-posting-details](job-posting-details.md) and the UUID IDs of [application-uuids](application-uuids.md) for the rows.
- "Which tab is shown first" while a resume is being generated: Generating.

## Depends on

- [runs-list-changes](runs-list-changes.md) (the X and archive buttons, archiving and restoring, the states) and [link-handling-changes](link-handling-changes.md).
- [job-posting-details](job-posting-details.md), for the row's title, company and source; [application-uuids](application-uuids.md); [english-only-resumes](english-only-resumes.md).

## Decisions

- Decided 2026-11-15: the history is on the home page, not a separate page.
- Decided 2026-11-17 (the user): "Lets reimagine the screen as one table list of all the applications, with tabs separating the finished resumes (primary tab if there is no resumes being generated) and the awaiting generation ones (the resume-queue). One button on the top right to add more links through a modal. The ongoing generation should be separated from the list, above the tabs (if there is one). Failed generations just stay on their position."
- Decided 2026-11-17: "Now on the new screen, the number of active runs are on the tab, and it should be two numbers: valid runs waiting for the model / links still being fetched. If there is some runs with problems, add a red circle with the count of it inside."
- Decided 2026-11-17: the status badge colours stay as built by [visual-pass](visual-pass.md); the selected sidebar entry and the focus ring may use the green accent ("You can use.").
- Decided 2026-11-17: how the application page scrolls on wide screens is reviewed after this new design.
- Decided 2026-11-17 (the details): the sidebar entry is "Resumes", the tabs "Ready" and "Generating"; columns as listed under Behaviour ("On the second column, lets put the title of the job, the company under it (with a smaller font, and it being a link for the company website if the posting has it). On the left side (first column) lets place the status as a glowing ball. The third column can be the state with the source below. The fourth column may be the actions button."); "On the finished tab put only finished generations."; one entry in the sidebar, since "Today the 'Runs' is the same as the Applications".
- Decided 2026-11-17: the form's "Paste text" tab is removed.
- Decided 2026-11-21 (the archived list): "Now the archived applications can go to a new tab instead of the sidebar." Archived rows are sorted newest archived first (chosen the same day). Cancelled runs, failed runs and finished applications can be archived. Restoring: "Put the row back in Generating" for an unfinished one; a finished one goes back to Ready (chosen the same day).
- Decided 2026-11-21: after a restart, an unfinished application is listed in Generating as cancelled; nothing starts again by itself (chosen over saving the queue to disk).
- Decided 2026-11-21 (the user, the actions column): "Let the main action as a visible button and also add a hamburguer button that opens a menu with all the other actions."
- Decided 2026-11-21 (the user, the main actions): a link waiting to fetch, or being fetched: cancel; a run waiting for the model: cancel; a failed fetch, or an Indeed link that needs its text: try again; a failed generation: try again; a cancelled run: try again; a finished application, in the Ready tab: view PDF; an archived row, in the Archived tab: view PDF.
- Decided 2026-11-21 (the user): [edit-before-restart](edit-before-restart.md) moves to the future version, so this task is built without the "Edit" button; that task adds it to the table's rows when it is built. [runs-list-push](runs-list-push.md) moves to the future version too, so the table is still fed by `GET /api/runs` every 2 seconds.
