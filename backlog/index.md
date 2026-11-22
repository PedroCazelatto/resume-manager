# Backlog

One file per task. Each file's header says which version carries it: `implemented`, `next version`, or `future version`. This index repeats that status so no file has to be opened to see it; update both together.

Every task file must be doable by a fresh agent that has read only the constitution and that file (constitution Art. X.5): the problem, the behaviour, acceptance criteria, technical notes, what it depends on, and the decisions already made. A file with an open question is not ready; ask the user and write the answer in.

How the next task is chosen: use the app for real applications, write down what slowed you down or what you didn't trust as a new task file, and pick from there. Speed never outranks truthfulness or privacy.

## Next version

Build order, decided 2026-11-21: the quickest tasks first, as far as what each depends on allows, and one task at a time, because almost every task touches the same files (`src/app/runs.ts`, `src/core/runs/queue.ts`, `src/components/runs-list.tsx`). The order is runs-list-changes, job-posting-details, application-uuids, and home-applications-table last. A task still waiting for the user's answer to a question moves down, and the next one goes first.

Also decided 2026-11-21 (the user): the next version keeps only link-handling-changes (since implemented), runs-list-changes (since implemented), job-posting-details (since implemented), application-uuids (since implemented) and home-applications-table. Browser-extension, edit-before-restart and runs-list-push move to the future version.

- [home-applications-table.md](home-applications-table.md) — Home page as one table of all applications, with the queue in tabs (F26)

## Future version

- [browser-extension.md](browser-extension.md) — Read Indeed links through a browser extension (F45)
- [edit-before-restart.md](edit-before-restart.md) — Edit the posting or add a note before starting a run again (F52)
- [runs-list-push.md](runs-list-push.md) — Push the Runs list from the server instead of polling it (F53)

- [create-and-rename-profiles.md](create-and-rename-profiles.md) — Create and rename profiles in the app (F04)
- [profile-editor.md](profile-editor.md) — Edit profile files in the app (F05)
- [cv-import.md](cv-import.md) — Import an existing CV (F06)
- [guided-interview.md](guided-interview.md) — Guided interview that fills the profile (F08)
- [one-click-pdf.md](one-click-pdf.md) — One-click PDF (F23)
- [regenerate-application.md](regenerate-application.md) — Regenerate the resume with a change request (F27)
- [debug-logging.md](debug-logging.md) — Opt-in debug logging (F31)
- [database-storage.md](database-storage.md) — Move all data into a local database (F43)
- [indeed-postings.md](indeed-postings.md) — Send a posting from your browser with a bookmarklet (fallback for Indeed) (F44)
- [posting-sufficiency-check.md](posting-sufficiency-check.md) — Check whether the posting says enough before writing the resume (F49)

## Implemented

- [profile-schemas-and-validation.md](profile-schemas-and-validation.md) — Profile schemas and validation (F01)
- [example-profile.md](example-profile.md) — Fictional example profile (F02)
- [profile-picker.md](profile-picker.md) — Profile picker (F03)
- [write-back-implied-skills.md](write-back-implied-skills.md) — Write approved implied skills back to the profile (F07)
- [paste-posting.md](paste-posting.md) — Paste the job posting (F09)
- [posting-by-url.md](posting-by-url.md) — Give a link to the job posting instead of pasting it (F10)
- [ireland-template.md](ireland-template.md) — Ireland resume template (F11)
- [posting-analysis-and-fit-gap.md](posting-analysis-and-fit-gap.md) — Posting analysis and fit/gap (F12)
- [tailored-resume.md](tailored-resume.md) — Tailored resume (F13)
- [resume-language.md](resume-language.md) — Choose the resume's language (F14)
- [deterministic-verification.md](deterministic-verification.md) — Check names, dates and numbers (F15)
- [implied-skills-approval.md](implied-skills-approval.md) — Approve or reject implied skills (F16)
- [model-claim-review.md](model-claim-review.md) — Model review of every claim (F17)
- [show-line-sources.md](show-line-sources.md) — Show where each resume line comes from (F18)
- [try-again-failed-run.md](try-again-failed-run.md) — Try a failed run again (F19)
- [resume-preview-and-page-count.md](resume-preview-and-page-count.md) — Resume preview with page count (F20)
- [edit-resume.md](edit-resume.md) — Edit the resume with a live preview (F21)
- [print-to-pdf.md](print-to-pdf.md) — Save as PDF through the print dialog (F22)
- [draft-ready-status.md](draft-ready-status.md) — Draft and ready status (F24)
- [application-folders.md](application-folders.md) — Save every run in its own folder (F25)
- [ollama-client.md](ollama-client.md) — Local model through Ollama (F29)
- [run-progress.md](run-progress.md) — Step-by-step progress (F30)
- [cancel-a-run.md](cancel-a-run.md) — Cancel a running generation (F32)
- [list-of-posting-urls.md](list-of-posting-urls.md) — Accept a list of job links at once (F33)
- [dark-mode.md](dark-mode.md) — Dark mode (F34)
- [visual-pass.md](visual-pass.md) — Make the interface look good (F35)
- [timer-format.md](timer-format.md) — Show the run timer as MMmSSs (F36)
- [model-timeout.md](model-timeout.md) — The model timed out before writing the resume (F37)
- [notify-when-run-ends.md](notify-when-run-ends.md) — Notify when a run ends (F38)
- [reconnect-to-a-run.md](reconnect-to-a-run.md) — Reconnect to a running generation (F39)
- [context-size-warning.md](context-size-warning.md) — Warn when a model call won't fit the context window (F40)
- [catch-number-words.md](catch-number-words.md) — Catch numbers written as words (F41)
- [run-queue.md](run-queue.md) — Queue runs and track them on the server (F42)
- [english-only-resumes.md](english-only-resumes.md) — Write every resume in English and remove the language choice (F51)
- [link-handling-changes.md](link-handling-changes.md) — Link handling changes decided on 2026-11-17 (F47)
- [runs-list-changes.md](runs-list-changes.md) — Remove, cancel and archive runs, and other Runs list changes decided on 2026-11-17 (F48)
- [application-uuids.md](application-uuids.md) — Name application folders with a UUID, and update old applications (F50)
- [job-posting-details.md](job-posting-details.md) — Job posting details: title, company, source and more (F46)

## Out of scope

Not planned, and without a task file:

- Cover letters
- Application status tracking
- DOCX output
