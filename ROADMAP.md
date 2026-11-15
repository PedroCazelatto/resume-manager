# Roadmap

**Last updated 2026-11-11.** The binding scope is [`constitution.md`, Article X](constitution.md#article-x--scope). This file lists every feature and the order we build them in.

## How we prioritise

1. Ship **M0**: the smallest end-to-end loop that produces a resume you would actually send.
2. Use it for real applications.
3. Pick the next feature from the backlog based on what slowed you down or what you didn't trust. Write those notes under [Usage notes](#usage-notes) so the choice comes from evidence.

Speed never outranks truthfulness (Art. II) or privacy (Art. III).

---

## M0 — First usable version

**Done when** you can pick your profile, paste a real job posting, and in one run get:

- a fit/gap analysis;
- an Ireland-format resume in the posting's language, with implied skills flagged for your approval and every claim checked against your profile;
- a chance to review and edit it, then save it as a PDF.

All of this runs in the local app, and every step is saved in the application folder, so a run that fails can be tried again from its last saved step.

**Status (2026-11-11):** every M0 feature is built. What remains is using it for real applications.

### The flow

```
Choose profile ─▶ Paste posting (+ optional language) ─▶ Generate
   ├─ [1] Analyse posting + fit/gap            (LLM)
   ├─ [2] Tailor resume to the Ireland template (LLM)
   ├─ [3] Check names, dates, numbers          (code)
   └─ [4] Review every claim against sources   (LLM)
─▶ Your review: fit/gap, approve/reject implied skills, fix or dismiss failed checks,
   edit the content (verify again after an edit)
─▶ Print ▸ Save as PDF          (a failed run: Try again continues from the last saved step)
```

Three model calls run per resume, and the results of [3] and [4] are saved in `verification.md`. Quality comes first, so a run that takes several minutes is fine.

### Before M0 can run, you provide

- `templates/ireland.html`, the Ireland template: layout, writing rules for the model, and parameters such as `max-pages` (constitution Art. VII).
- Your profile in `profiles/<you>/`, written by hand in any editor by copying the fictional example in `example-profiles/`.

### M0 features

| ID | Feature |
|---|---|
| F01 | Profile schemas and validation, with errors that name the file and the problem |
| F02 | Fictional example profile in `example-profiles/` |
| F03 | Profile picker (lists the folders under `profiles/`) |
| F09 | Paste job posting text |
| F11 | Load the Ireland template (layout, rules, parameters); stop with a clear message if it's missing |
| F12 | Analyse the posting and run fit/gap in one call: detect the language; mark each requirement matched, partial, or missing, with sources |
| F13 | Tailor the resume per the template's rules and structure in the target language (headings included), storing the sources of every line |
| F14 | Override the resume language per generation |
| F15 | Deterministic verification: every employer, institution, date, and number in the resume exists in the profile |
| F16 | Implied skills in the resume, each flagged with its sources; you approve or reject each one before printing |
| F17 | Model-based review: checks every claim against its sources and lists any it can't support |
| F19 | Resume a failed run with "Try again": steps whose output file already exists are skipped |
| F20 | HTML preview rendered from the country template, with print CSS and a page-count warning above the template's `max-pages` |
| F21 | Edit the content fields of `resume.md` in a text area, with a live preview |
| F22 | Save as PDF through the browser's print dialog |
| F24 | `draft`/`ready` status: Print is disabled while verification failures are neither fixed nor dismissed, the model review is out of date, or implied skills are pending |
| F25 | Save every run in `applications/<date>-<company>-<role>/` (with a `-2` suffix on collision, so nothing is overwritten) |
| F29 | Ollama client: structured output, schema validation, configurable timeout |
| F30 | Step-by-step progress in the UI |

Every M0 feature ships with unit tests for its core logic, and prompts delimit the posting as untrusted input (Art. II.7).

### Left out of M0 on purpose

| Not in M0 | Why it can wait |
|---|---|
| Profile editor, CV import | Your own editor works on day one. Whichever hurts more becomes the next pick. |
| Fetching postings by URL | Pasting always works. A URL only saves one copy-paste. |
| Writing approved implied skills back to the profile | You can add them by hand. The resume already records which ones you approved. |
| One-click PDF via headless Chromium | Browser print uses the same HTML/CSS and needs no Chromium dependency. |
| Application history screen | The files are already in the application folder. |

---

## Feature catalog

Size: **S** = small, **M** = medium, **L** = large.

### Profile

| ID | Feature | Size | When |
|---|---|---|---|
| F01 | Profile schemas and validation | S | M0 |
| F02 | Fictional example profile | S | M0 |
| F03 | Profile picker | S | M0 |
| F04 | Create and rename profiles in the UI | S | Backlog |
| F05 | Web Markdown editor for profile files | M | Backlog |
| F06 | CV import: PDF/DOCX → drafted profile files, reviewed before writing | L | Backlog |
| F07 | Write approved implied skills back to the profile | S | Backlog |
| F08 | Guided AI interview that fills profile files | L | v2 |

### Job posting

| ID | Feature | Size | When |
|---|---|---|---|
| F09 | Paste posting text | S | M0 |
| F10 | Fetch posting from a URL (SSRF guards, paste fallback) | M | Backlog |

### Generation

| ID | Feature | Size | When |
|---|---|---|---|
| F11 | Ireland template loader | S | M0 |
| F12 | Posting analysis + fit/gap (one call) | M | M0 |
| F13 | Tailored resume with per-line sources | M | M0 |
| F14 | Language override | S | M0 |
| F15 | Deterministic verification | S | M0 |
| F16 | Implied skills in the resume, flagged for approve/reject | M | M0 |
| F17 | Model-based claim review | S | M0 |
| F18 | Show the source of each resume line in the UI | M | Backlog |
| F19 | Resume a failed run from the last completed step | S | M0 |

### Output

| ID | Feature | Size | When |
|---|---|---|---|
| F20 | HTML preview from the template, with print CSS and page-limit warning | M | M0 |
| F21 | Edit `resume.md` with live preview | S | M0 |
| F22 | PDF via browser print | S | M0 |
| F23 | One-click PDF via headless Chromium, saved as `resume.pdf` | M | Backlog |
| F24 | `draft`/`ready` status gating Print | S | M0 |

### History

| ID | Feature | Size | When |
|---|---|---|---|
| F25 | Save each run in its application folder | S | M0 |
| F26 | Application history list; reopen a past application | S | Backlog |
| F27 | Regenerate inside an existing application, confirming before overwriting edits | S | Backlog |

### Platform

| ID | Feature | Size | When |
|---|---|---|---|
| F29 | Ollama client with structured output | S | M0 |
| F30 | Step-by-step progress | S | M0 |
| F31 | Opt-in debug logging | S | Backlog |

### Out of scope until the constitution is amended

Cover letters, application status tracking, authentication and accounts, cloud deployment, hosted AI APIs, headless-browser scraping, DOCX output.

---

## Backlog: suggested starting order

This order is a guess; your usage notes override it.

1. **F10** URL fetch: saves a step on every application.
2. **F26** History list: comes in handy once you have a few applications.
3. **F23** One-click PDF: removes the print dialog, and the PDF lands in the application folder.
4. **F07** Implied-skill write-back: stops you approving the same skill again in every application.
5. **F05** Profile editor, **F06** CV import, **F04** profile management: these matter more when adding a second profile.
6. **F18**, **F27**, **F31**.

---

## Usage notes

Add a dated line each time something slows you down or doesn't feel right. The next feature comes from here.

<!-- - 2026-11-20: had to fix the summary by hand every time (→ prompt tweak?) -->

Each note below has a task file in [`backlog/`](backlog/); the file's header says which version carries it (`implemented`, `next version`, or `future version`).

- 2026-11-14: first real run. A run can't be cancelled once it starts; any mistake means restarting the app.
- 2026-11-14: wants to give a link to the job's Indeed page instead of pasting (→ F10), ideally a list of links at once.
- 2026-11-14: wants a dark mode.
- 2026-11-14: the run timer should read MMmSSs (done).
- 2026-11-14: the resume was never generated: the model call hit the 30-minute timeout (done: the timeout now only counts silence).
- 2026-11-14: the interface is ugly and needs a visual pass.
