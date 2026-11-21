# Open questions

Questions waiting for your decision, numbered. Answer them in `ANSWERS.md` by number, whenever you have time. I read both files before starting related work and record each answer in the docs (the task's file in `backlog/`, or `decisions.md`). Answered questions stay here. Both files are committed: I commit the questions, you commit the answers.

Your answers will be recorded in the backlog and in `decisions.md`.

## Waiting for an answer

### 1. Indeed rows and "Try again" (F45 browser-extension, F47 link-handling-changes, F48 runs-list-changes)
Asked 2026-11-21, from the conflict check of the next version's tasks.

F48 gives every row whose fetch failed a "Try again" button, and today "Try again" on such a row makes the server fetch the link again. F47 says an Indeed row is "like a failed fetch but without any request to Indeed", and F45's error message says "open the link once yourself, then try again". So the docs don't say whether an Indeed row has "Try again", or what it does with and without the extension. They also don't say what becomes of a link the extension fails to read (security check, 30-second timeout).

Options:
1. **(Recommended)** Without the extension, an Indeed row offers only "Paste the text" and the archive button, with no "Try again". With the extension installed, it also offers "Try again", which asks the extension to read the page again. A link the extension fails to read becomes that same row, showing the reason.
2. Indeed rows never have "Try again", with or without the extension. To read the page through the extension again, the user adds the link again (F50 then starts the same application again).
3. "Try again" is always shown on Indeed rows. Without the extension, it says how to install it.

### 2. Writing a resume again after an edit (F52 edit-before-restart, constitution Art. VI)
Asked 2026-11-21, from the conflict check of the next version's tasks.

Art. VI says "Regenerating it needs a change request from the user". In F52, an edited posting text or a new analysis note makes the run start again from the analysis, and "every later step runs again". A run that failed or was cancelled during the checks or the review already has a `resume.md`. So that resume would be written again even when the user gave no resume note, which means no change request.

Options:
1. **(Recommended)** Saving the Edit dialog counts as the user's request. The old `resume.md` and `verification.md` move into `archive/<NN>/` first, and `change_request` is written only when there is a resume note. I edit Art. VI to say so, and you review it before it is committed.
2. When a resume already exists, the dialog requires a resume note before an edited text or an analysis note can be saved.
3. An edited text or analysis note runs only the analysis again. The existing resume stays until a resume note is given.

### 3. The actions column of the home page's table (F26 home-applications-table)
Asked 2026-11-21, from the conflict check of the next version's tasks.

F26's fourth column is "the row's actions button (open, cancel, try again, edit, paste the text, archive, restore, as the row allows)". F48 builds those actions as separate icon buttons (X, archive), each with an accessible name. The docs don't say whether the column is one button that opens a menu, or the row's buttons side by side.

Options:
1. **(Recommended)** One "⋯" button per row that opens a menu with the row's actions. This follows "the actions button" in your words. The generation in progress above the tabs keeps its visible X.
2. The row's actions side by side as icon buttons (X, try again, edit, archive, …), each with a tooltip and an accessible name.
3. The row's main action as a visible button (such as "Try again"), and the rest in a "⋯" menu.

### 4. Several tabs and the pushed Runs list (F53 runs-list-push)
Asked 2026-11-21. F53 waits for this answer.

Browsers allow at most 6 open connections to one host, shared by all tabs, over HTTP/1.1, which the app's server uses. Suppose each tab holds its own connection for the pushed list, plus the run stream it already holds while it follows a running run. Then three app tabs open while a resume is being written use all 6, and every other request of the app (page loads, buttons) waits and never finishes. In every option below, a dropped connection is opened again after 2 seconds.

Options:
1. **(Recommended)** All the browser's tabs share one connection. One tab holds it and passes each list to the others, and when that tab closes another takes over. This uses only browser features (Web Locks and BroadcastChannel), with no new dependency.
2. One connection per tab, closed while the tab is hidden and opened again when it is shown. This is simpler, but a hidden tab no longer notices a waiting run that ends, so that notification (F38) is lost.
3. One connection per tab, always open. This is the simplest, but the app stalls as described above once 3 or more tabs are open.

### 5. Small choices made while building F51 english-only-resumes
Asked 2026-11-21. F51 is built and committed. These are the choices it made that the docs didn't cover. They are already in the code and in the Notes of `backlog/english-only-resumes.md`.

1. A request that still sends a `language` to a route that starts a run is accepted, and the language is ignored. It is not refused with an error.
2. The resume languages the browser had already stored per application (`resume-language:<id>` in local storage) are left there, unused. No code clears them.
3. The "Resume" card on the application page still names the resume's language, so it now says "English" for every new resume.
4. An older resume written in another language keeps that language for its dates and the page's `lang` attribute, read from "render as they are".

Options:
1. **(Recommended)** Keep all four as built.
2. Change some of them (say which, and how).

<!--
Format for a new question (numbered, no options, never erased once answered):

### <number>. <descriptive title> (<task>)
Asked <date>.
<what is undecided and why it matters, with a descriptive explanation>
-->
