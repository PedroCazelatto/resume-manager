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

### 6. A link that redirected (F47 link-handling-changes, F50 application-uuids)
Asked 2026-11-21, after building F47.

Once a link's fetch works, its row and its `job.md` keep only the final address, after the LinkedIn rewrite and any redirects, and the link as it was typed is dropped. So when a link that redirects (and isn't LinkedIn) is added again, it isn't recognised as the same link: it is fetched again and becomes a second row or application. It is undecided whether the link as typed should also be kept and compared, on the run while it is listed and in `job.md` once the application exists, or whether only the final address counts.

### 7. A saved `job.md` that can't be read during the skip check (F47 link-handling-changes)
Asked 2026-11-21, after building F47.

To skip a link the profile already has, the app reads the `url` of every saved application's `job.md`. When one of those files is invalid (Art. IV.6), its link can't be compared. As built, the links are queued anyway, and the form names the file and its problem in red under "These applications couldn't be checked for the same link:". It is undecided whether that is the behaviour you want, or whether nothing should be queued until the file is fixed.

### 8. Small choices made while building F47 link-handling-changes
Asked 2026-11-21. F47 is built and committed. These are the choices it made that the docs didn't cover; they are in the code now. Do they stand?

1. The error answers to a request without the posting's text and to pasted text without its link: "Paste the posting's text first." and "Give the posting's link with its text: every posting keeps its link."
2. The "Paste text" tab's Link field is now required, with the placeholder "The posting's page, saved with the application". "Generate resume" stays disabled until both the text and the link are filled in, and after a list is sent, until the input changes.
3. The button on a row whose fetch failed was renamed from "Paste the text instead" to "Paste the text", the words the task uses for Indeed rows.
4. A skipped line reads "Line N (link): Skipped: it is already in the Runs list." or "Line N (link): Skipped: it is already saved in application <id>." When both are true, the Runs list is named. When every link is skipped: "Nothing was added: every link is already there."
5. Pasted text isn't checked for the same link; only the links of a list are.
6. LinkedIn links: a trailing slash or a query on `/jobs/view/…` still names the same job, `currentJobId` wins on any `/jobs/…` page, and LinkedIn subdomains count. Links of other sites are the same only when the whole address is.
7. An Indeed row has no steps, is listed with the ended runs (it counts toward the 50 ended runs kept), and the form counts it among the runs added.
8. A failed certificate check shows the existing message "Can't reach the page".

### 9. The main action of each kind of row (F26 home-applications-table)
Asked 2026-11-21, after your answer to question 3.

Each row of the table shows its main action as a visible button, and its other actions in the hamburger menu. The docs don't say which action is the main one for each kind of row. The kinds of row are:
- a link waiting to fetch, or being fetched;
- a run waiting for the model;
- a failed fetch, or an Indeed link that needs its text;
- a failed generation;
- a cancelled run;
- a finished application, in the Ready tab;
- an archived row, in the Archived tab.

The generation in progress sits above the tabs, with its own X.

### 10. How a restored failed fetch reads (F48 runs-list-changes, F26 home-applications-table)
Asked 2026-11-21, after building F48.

Restoring an archived row brings an unfinished one back "as cancelled". As built, a failed fetch (one that needs the posting's text) also comes back reading "cancelled", not "needs the posting's text", and still offers "Paste the text". This decides the row's colour in F26's table (grey, not amber) and whether the Generating tab counts it as a problem.

### 11. A restored failed run's error message (F48 runs-list-changes)
Asked 2026-11-21, after building F48.

A run that failed and is restored reads "cancelled". As built, its red error message from the failure is still shown under the "cancelled" badge. It is undecided whether a restored run keeps its old error message.

### 12. Starting a run on an archived application (F48 runs-list-changes, F26 home-applications-table)
Asked 2026-11-21, after building F48.

An archived application can still be opened at `/applications/<id>`, and "Try again" or "Verify again" can be started from its page. As built, the run is queued and listed as usual while `job.md` keeps `archived_at`, so in F26's table the row would be archived and generating at the same time. It is undecided what starting a run on an archived application should do.

### 13. Archiving an application with another run waiting or running (F48 runs-list-changes)
Asked 2026-11-21, after building F48.

Archiving works per application: archiving a row that has an application archives the whole application, and all of its ended rows leave the list together. As built, the archive button is hidden, and the server refuses, while another run of the same application is waiting or running (for example a "Verify again" queued behind a failed "Try again"). This adds a condition to "the archive button appears on cancelled runs, failed runs and finished applications".

### 14. The example profile's applications are not in git (F50 application-uuids, tests)
Asked 2026-11-21, after building F48.

`.gitignore` leaves out `example-profiles/*/applications/` (commit e163132, "ignore applications generated from the example profile"). Yet tests rely on the two example applications in that untracked folder (`src/app/run.test.ts`, and F48's new `src/app/archive.test.ts`), so they fail in a fresh clone. F50 also says the example profile's applications are updated to the new layout "so tests and test runs use it". It is undecided whether the example applications should be tracked in git, and how applications made by test runs would then be kept out of it.

### 15. Small choices made while building F48 runs-list-changes
Asked 2026-11-21. F48 is built and committed. These are the choices it made that the docs didn't cover; they are in the code now. Do they stand?

1. The X and the archive button are outline icon buttons without tooltips. Their accessible names are "Remove link", "Cancel" and "Archive". The X takes the place of the button it replaced (next to the running step, for the running run), and is disabled while cancelling; the "Cancelling…" text is gone. The archive button comes last in the row.
2. Icons: lucide's X, ChevronDown and ChevronUp, Check, Menu, Moon and Sun became Phosphor's `x`, `caret-down` and `caret-up`, `check`, `list`, `moon` and `sun`, and the archive button uses `archive`. A lint rule refuses icon imports outside the icon file. `components.json` still names lucide, so that a future `shadcn add` fails loudly instead of bringing in icons outside that file.
3. "This run was removed from the queue." is gone, since a waiting run is now cancelled, not removed.
4. Routes that archive and restore an application by its ID (`/api/applications/<id>/archive`) were built as well as the ones for runs, so an application can be restored after a restart. Nothing in the UI calls them yet.
5. An archived run can't be tried again and takes no pasted text, and it still counts toward the 50 ended runs kept in memory.
6. When the text is pasted from a row, the form's Link field stays editable, and the link sent becomes the run's link. "Added to the runs below." is still shown afterwards.
7. The application page also reloads when it loses the connection to its run, as it already did for a run it picked up after a reload.
8. New messages: "Only a run that ended can be archived, and not while a run of its application is waiting or running.", "This run isn't archived.", "This application has a run waiting or running.", "This application is already archived.", "This application isn't archived.", "This run doesn't need the posting's text.", and "applications/<id>/job.md has problems: …" for an invalid file. A failed archive shows its message under the row.

### 16. A LinkedIn job link for F46's page check (F46 job-posting-details)
Asked 2026-11-21.

F46 reads the title, company and location from a LinkedIn job page's top-card elements. LinkedIn doesn't document its page structure, so the task says to check it on one real public job page, with at most one request, and to write the test fixture by hand from it (the real page is never committed). The docs don't name the page. Please give a public LinkedIn job link (`https://www.linkedin.com/jobs/view/…`) to use for that one request. Everything else in F46 is built meanwhile.

### 17. Employment types that aren't hours (F46 job-posting-details)
Asked 2026-11-21, after building most of F46.

A posting's schema.org data gives an employment type. Full-time and part-time go into `hours` ("Full-time", "Part-time"). The other types (contractor, temporary, intern, and the rest) are dropped, because `job.md` has no field for them. It is undecided whether they should be kept: in `hours`, or in a new field, which would need a place in Art. IV.5.

### 18. Other details a posting page holds (F46 job-posting-details)
Asked 2026-11-21, after building most of F46.

F46 says to "extract everything the HTML holds about the job". The schema.org data can also hold qualifications, responsibilities, skills, benefits, the date posted and the closing date. As built, only the fields of Art. IV.5 are kept, and these are dropped. It is undecided whether they should be kept, and where: in the posting's text in `job.md`, or in fields of their own.

### 19. Where the job's details are shown (F46 job-posting-details, F26 home-applications-table)
Asked 2026-11-21, after building most of F46.

The salary, work model, hours, source and the company's website are saved in `job.md`. The Runs list shows only the title, the company and the source, and the application page shows only the title and the company. It is undecided whether the application page (or anywhere else) should show the rest.

### 20. Checking the details the model copies (F46 job-posting-details)
Asked 2026-11-21, after building most of F46.

A detail the page doesn't hold may be filled by the model "only with what the posting's text states, copied and never guessed". As built, the model's copy isn't checked against the posting's text. It is undecided whether the app should drop a copied detail that doesn't appear word for word in the text. That would back up "the model never creates a value", but it could also drop fair copies (a spacing difference, or `work_model`, which is one of three fixed words).

### 21. Country codes in a job's location (F46 job-posting-details)
Asked 2026-11-21, after building most of F46.

A page's schema.org data often gives the country as a code ("IE"). As built, the code is kept as written, so a location can read "Dublin, IE". It is undecided whether codes should become country names.

### 22. Small choices made while building F46 job-posting-details
Asked 2026-11-21. Most of F46 is built and committed; the LinkedIn part waits for question 16. These are the choices it made that the docs didn't cover; they are in the code now. Do they stand?

1. The posting's text in `job.md` comes from LinkedIn's description element on LinkedIn, otherwise from the schema.org description, otherwise from the page's main area.
2. When a page holds several `JobPosting` entries, the first one found is used. The company is the hiring organisation's name, and the company's website is its first http or https address. Any other address (`javascript:`, `data:`, one without `http`) is dropped.
3. A location reads "town, region, country", without street or postal code; several places are joined with "; ".
4. A salary reads like "€60,000–€70,000 a year", "From €60,000 a year" or "Up to €70,000 a year". A value that isn't a number is kept as written.
5. `work_model` is set from the page only when it says the job is remote (`TELECOMMUTE`). Hybrid and on-site come only from the model's copy of the text.
6. `hours` is the page's working hours as written, otherwise "Full-time" or "Part-time" from the employment type.
7. In the analysis prompt, the details read from the page sit at the top of the delimited posting block as `Title:`, `Company:`, `Location:`, `Salary:`, `Work model:`, `Hours:` lines. The company's website isn't sent to the model. The prompt's rule reads: "Use null for every detail the posting doesn't state. Never guess, infer or make up a detail."
8. The tailoring prompt now also gets the job's details from `job.md`, above the posting's text, so LinkedIn postings keep their title and company once the page-title line is dropped from the text.
9. When neither the page nor the model gives a title or a company, the application page's heading shows the link, then the application's ID.
10. A Runs list row:
    - The first line is the job's title (a link once the application exists), or the URL before a title is known.
    - Next to it is a small label for "Try again" or "Verify again". A new application has no label, so "New application" is gone.
    - The second line is "company · source", small and grey. The company links to its website in a new tab.

### 23. The main action of an Indeed row (F26 home-applications-table)
Asked 2026-11-21, after your answers to questions 1 and 9.

Answer 9 makes "try again" the main action of "a failed fetch, or an Indeed link that needs its text". Answer 1 says that without the browser extension, an Indeed row offers only "Paste the text" and the archive button, with no "Try again". The extension moved to the future version, so in this version no Indeed row has "Try again". It is undecided what an Indeed row's main action is until the extension exists.

### 24. What "View PDF" does (F26 home-applications-table)
Asked 2026-11-21, after your answer to question 9.

Answer 9 makes "view PDF" the main action of a finished application and of an archived row. In this version the app saves no PDF: the resume is printed to PDF through the browser's print dialog on the application page (Art. V.9), and one-click PDF (F23) is in the future version. Printing is also blocked while a resume has undismissed verification failures, implied skills still pending, or a model review older than the last edit (Art. VI.7), which is the case for every resume still in `draft`. It is undecided what "View PDF" opens, and what it does for a finished application whose resume can't be printed yet.

### 25. The main action of an archived row that never finished (F26 home-applications-table)
Asked 2026-11-21, after your answer to question 9.

The Archived tab holds finished applications, but also cancelled and failed rows. A row that never finished has no resume, so there is no PDF to view. It is undecided what main action such a row shows.

### 26. The example applications and the one-time update (F50 application-uuids; more on question 14)
Asked 2026-11-21, after building F50.

Both example applications (`example-profiles/jane-doe/applications/2026-11-10-globex-…`) are old-format and were made from pasted text with no link. The one-time update would delete them both. Tests still rely on the folder `2026-11-10-globex-ltd-senior-backend-engineer` being there locally (`src/app/run.test.ts`, `src/app/archive.test.ts`); F50's own tests use their own fixtures. It is undecided how the example profile's applications move to the new layout: tracked new-layout examples, updated only locally, or tests that no longer need them.

### 27. The X on a link fetched again into an existing application (F50 application-uuids)
Asked 2026-11-21, after building F50.

The X on a link being fetched deletes the folder its fetch made, so "nothing of the link is left". When a link is added again and its existing application is fetched again, that fetch didn't make the folder. As built, the X stops the fetch and removes the row, but keeps the folder, which then stays on disk with no row in the Runs list. It is undecided whether the X should delete that folder too.

### 28. Pasting the text with a different link (F48 runs-list-changes, F50 application-uuids)
Asked 2026-11-21, after building F50.

When the text is pasted on a failed row, the form's Link field can be edited (F48). As built, `job.md` keeps its `url`, while the Runs list shows the link that was sent with the text. So the file and the row can show different links, against "only one source of truth" (F47). It is undecided whether an edited link should change `job.md`'s `url`, or whether the link should not be editable there.

### 29. Adding an Indeed link again while its row still waits for its text (F50 application-uuids)
Asked 2026-11-21, after building F50.

Adding an Indeed link again, while its application's row still waits for the posting's text, adds a second "needs the posting's text" row for the same application. It is undecided whether that link should be skipped instead, like a link whose run is waiting.

### 30. Small choices made while building F50 application-uuids
Asked 2026-11-21. F50 is built and committed. These are the choices it made that the docs didn't cover; they are in the code now. Do they stand?

1. An application counts as finished when both its `resume.md` and its `verification.md` exist. F26's Ready tab will rely on this.
2. `fetched_at` is when the posting's text arrived: when the fetch worked, or when the text was pasted. Pasted text from the "Paste text" tab now also gets its folder at once. The analysis no longer writes `fetched_at`.
3. The details read from the page are written into `job.md` with the fetched text, before the model runs.
4. "Try again" in the Runs list is offered on a run that ended before its analysis was saved (it used to be: before its folder existed), also on a "Try again" whose fetch failed, and not while another run of the same application is fetching, waiting or running. "Try again" on a failed fetch fetches again into the same folder.
5. A link added again whose application is unfinished starts that application again as a "Try again" run, and is counted among "added" in the form's message. If the same link has a finished application and an unfinished one, it is skipped. Restarting an archived application by adding its link again takes it out of the archived list. The application page's "Try again" doesn't.
6. What the one-time update treats as an old application:
   - a folder named by a date;
   - a `job.md` with `role` and no `title`;
   - a `job.md` with `source: url` or `source: paste`;
   - a `job.md` with no `url`.

   An old folder whose `job.md` is missing or invalid is listed and left alone.
7. The one-time update is a card on the home page, above the profile's problems and the form, shown only while there is something to update or report:
   - **Title:** "Update the saved applications".
   - **Text:** "These applications were saved before each application's folder was named by a random UUID. Nothing changes until you confirm."
   - **Lists:** what will be rewritten, renamed and deleted, and the folders "Left as they are until their job.md is fixed".
   - **Button:** "Update the applications". The new UUIDs aren't shown before confirming.
   - **Refusals:** it refuses if the applications changed since the card was shown, or if one of them has a run waiting or running.
   - **Order:** it deletes, then rewrites, then renames.
8. New messages:
   - "Couldn't save the application's folder. See the server console."
   - "applications/<id>/job.md has problems: …"
   - "applications/<id>/job.md doesn't exist."

   Pasting on a row whose `job.md` is missing or invalid now answers 409.
9. An application ID is any lowercase UUID, or an old dated folder name until the update. A "Try again" or "Verify again" row shows the application's UUID until its job details arrive. No page shows `fetched_at` yet.

### 31. A second request for the LinkedIn page (F46 job-posting-details)
Asked 2026-11-21, after F46's one request to the link from question 16.

F46 says to check LinkedIn's page structure "on one real public job page (at most one request)". The one request to `https://www.linkedin.com/jobs/view/4488373441/` answered with a redirect (301, empty body) to `https://ie.linkedin.com/jobs/view/partner-solutions-engineer-at-google-4488373441`. LinkedIn sends its `www` job pages to a country subdomain, and the app itself follows that redirect when it fetches such a link. Without the page's content, the top-card classes, the job-criteria list and whether the page holds `JobPosting` data can't be seen, so the LinkedIn part of F46 isn't built. It is undecided whether F46 may make one more request, to the address LinkedIn redirected to.

<!--
Format for a new question (numbered, no options, never erased once answered):

### <number>. <descriptive title> (<task>)
Asked <date>.
<what is undecided and why it matters, with a descriptive explanation>
-->
