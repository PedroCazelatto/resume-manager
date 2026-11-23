# Resume Manager

Resumes tailored to each job, written by a local AI model from your own data. Nothing leaves your machine.

> **Status: the first usable version is built.** The technical rules are in [`constitution.md`](constitution.md) and every feature, built or planned, in [`backlog/`](backlog/index.md).

## What it does

- **Keeps your whole profile in Markdown.** Experience, education, projects, skills, languages, and personal details live in plain `.md` files, one file per job, degree, or project. You write them in any editor, starting from the fictional example in `example-profiles/`.
- **Reads a job posting from its link**, or from a list of links at once, which wait in a queue and run one after another. When a page can't be read (Indeed blocks the app), you paste the posting's text instead, and it keeps its link.
- **Shows how well you fit.** A fit/gap analysis marks each requirement as matched, partial, or missing.
- **Writes a tailored resume** following a country's resume template (Ireland first), in English, whatever the posting's language. It never invents anything. Skills that your experience only implies are flagged for you to approve or reject.
- **Verifies every claim.** Code checks employers, institutions, dates, and numbers against your profile, then the model reviews each claim against the files it cites. You fix what failed, or dismiss a false alarm.
- **Lets you edit and print.** You edit the resume's content with a live preview and save it as a PDF through the browser's print dialog, once nothing is left to review.
- **Saves every application** in its own folder, and a run that fails can be tried again from its last saved step.
- **Lists every application on one page,** in three tabs: Ready, Generating (the queue, with the run in progress above it) and Archived. Each row has its main action as a button (View PDF, Try again, Cancel, …) and the others in a menu. Archiving deletes nothing; only an archived application that never finished can be deleted, after you confirm.
- **Supports multiple profiles** on the same machine.

Planned later: a browser extension that reads Indeed postings, editing a posting or adding a note before trying again, one-click PDF, a profile editor, and CV import.

## How it works

```
 job posting's link (or its pasted text)
          │
          ▼
 1. Ingest ─▶ 2. Analyse posting ─▶ 3. Fit/gap ─▶ 4. Tailor ─▶ 5. Verify ─▶ 6. You review ─▶ 7. Print to PDF
                                        ▲              ▲
                              profiles/<you>/   templates/ireland.html
```

Every claim in the resume traces back to a file in your profile. Printing stays disabled while a failed check is neither fixed nor dismissed, an implied skill is undecided, or the model review is older than your last edit.

## Tech stack

| Part | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui |
| AI | [Ollama](https://ollama.com) on the host. Default model `qwen3.5:27b-int4` |
| PDF | The country's HTML template, previewed in the app and printed from the browser (one-click PDF later) |
| Storage | Markdown files with YAML frontmatter. No database |
| Runtime | On the host (`npm run dev` / `npm run start`), next to Ollama. No Docker |
| Tests | Vitest |

Docker has one planned use: if the model is ever given a tool that chooses file paths, that access will run in a sandbox that can reach only the selected profile's folder.

## Requirements

- Node.js 26 or newer
- Ollama installed and running on the host, with the model pulled:

  ```bash
  ollama pull qwen3.5:27b-int4
  ```

  This 4-bit build of the 27B model is about 16 GB on disk and fits a Mac with 24 GB of RAM at the default 16k context (`OLLAMA_NUM_CTX`). Other builds of the same model are larger and need more memory. Smaller models such as `qwen2.5:7b` also work, with lower quality; set `OLLAMA_MODEL` to switch.

## Quick start

```bash
npm install
cp .env.example .env
mkdir -p profiles
cp -r example-profiles/jane-doe profiles/your-name   # then edit the files; profiles/ is gitignored
npm run build && npm run start                       # or `npm run dev` for hot reload
open http://localhost:3000
```

The Ireland template is at `templates/ireland.html`. The app listens on `127.0.0.1` only. It has no login yet, so don't expose it to a network.

## Configuration

Settings live in `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_MODEL` | none (`qwen3.5:27b-int4` in `.env.example`) | Model used for every pipeline step |
| `OLLAMA_TIMEOUT_MS` | `1800000` | How long a model call may stay silent. It restarts with every token, so a model that is still thinking or writing is never cut off |
| `OLLAMA_NUM_CTX` | `16384` | Context window in tokens. Prompts or replies that don't fit fail with a clear error instead of being silently truncated |
| `OLLAMA_THINK` | model default | Thinking mode for models that have one (`true`/`false`). Unset uses the model's default; `false` is much faster but may judge less carefully |
| `PROFILES_DIR` | `./profiles` | Folder holding the profile folders |

The port is 3000; pass `-- -p 3001` to `npm run dev` or `npm run start` for another one.

## Your data

Everything lives under `profiles/<profile>/`, one file per item:

```
profiles/jane-doe/
├── personal.md
├── summary.md
├── skills.md
├── languages.md
├── experience/2019-03-initech-software-developer.md
├── experience/2023-01-acme-senior-developer.md
├── education/2015-usp-bsc-computer-science.md
├── projects/open-invoice.md
├── certifications/2024-06-aws-solutions-architect.md
├── extras/liffey-code-club-mentor.md
└── applications/
    └── 3f2b8c1e-5a7d-4c9e-9b1a-2d6e8f0c4a73/
        ├── job.md                # the posting
        ├── analysis.md           # fit/gap
        ├── resume.md             # editable tailored resume
        └── verification.md       # failed checks and the ones you dismissed
```

Example item, `experience/2023-01-acme-senior-developer.md`:

```markdown
---
company: Acme
role: Senior Developer
location: Dublin, Ireland
start: 2023-01
end: present
employment_type: full-time
tags: [typescript, aws, postgresql]
---

- Led the migration of the billing service from a monolith to event-driven microservices.
- Cut p95 API latency from 800 ms to 120 ms by redesigning the caching layer.
- Deployed the new services to Amazon EKS, with the infrastructure managed in Terraform.
- Mentor two junior developers through weekly pairing sessions.
```

The full schema for every file is in [`constitution.md`, Article IV](constitution.md#article-iv--data-markdown-is-the-source-of-truth). `profiles/` is gitignored. `example-profiles/` holds a fictional profile for tests.

## Resume templates

Each country has one HTML template at `templates/<country>.html`, starting with `templates/ireland.html`. It defines the resume's sections, order, layout, and formatting with Handlebars placeholders (`{{name}}`, `{{#each experience}}`), holds the writing rules for the AI in a `<script type="text/markdown" id="rules">` block, and sets parameters such as `<meta name="max-pages" content="1">`. Everything in the resume, headings included, is written in English. A resume that runs over the page limit gets a warning. Generation refuses to run without the template.

## Privacy

- AI runs only on your own Ollama instance, with no cloud AI APIs.
- The only outbound requests go to Ollama. No telemetry.
- Your data stays in `profiles/` on your machine. It is never committed.

## Features and plans

Every feature has a file in [`backlog/`](backlog/index.md), marked `implemented`, `next version`, or `future version`. The index lists them all by status, along with what is out of scope.

## Project documents

- [`constitution.md`](constitution.md): the technical decisions and rules of the project; it wins over everything else.
- [`backlog/`](backlog/index.md): one file per task, with the version that carries it.
- [`CLAUDE.md`](CLAUDE.md): instructions for Claude Code.
