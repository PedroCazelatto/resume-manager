# Resumee Manager

Resumes tailored to each job, written by a local AI model from your own data. Nothing leaves your machine.

> **Status: planning.** The rules and design are written down; the code is not built yet. See [`constitution.md`](constitution.md).

## What it does

- **Keeps your whole profile in Markdown.** Experience, education, projects, skills, languages, and personal details live in plain `.md` files, one file per job, degree, or project. You can edit them in the app or in any editor.
- **Imports your existing CV.** Upload a PDF or DOCX and the AI drafts your profile files. You review them before anything is saved.
- **Reads a job posting.** Paste its URL (or the text itself, for sites that block scraping).
- **Shows how well you fit.** A fit/gap analysis marks each requirement as matched, partial, or missing.
- **Writes a tailored resume** following a country's resume template (Ireland first), in the posting's language or one you choose. It never invents anything. Skills that your experience only implies are flagged for you to approve.
- **Exports Markdown + PDF** and keeps every application in a browsable history.
- **Supports multiple profiles** on the same machine.

## How it works

```
 job URL or pasted text
          │
          ▼
 1. Ingest ─▶ 2. Analyse posting ─▶ 3. Fit/gap ─▶ 4. Tailor ─▶ 5. Verify ─▶ 6. You review ─▶ 7. PDF
                                        ▲              ▲
                              profiles/<you>/   templates/ireland.html
```

Every claim in the resume traces back to a file in your profile. A verification step checks names, dates, and numbers against your data before the resume can be exported.

## Tech stack

| Part | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript, Tailwind CSS + shadcn/ui |
| AI | [Ollama](https://ollama.com) on the host. Default model `qwen3.5:27b-int4` |
| PDF | The country's HTML template, previewed in the app and printed from the browser (one-click Chromium PDF later) |
| Storage | Markdown files with YAML frontmatter. No database |
| Runtime | On the host (`npm run dev` / `npm run start`) or Docker Compose (app only). Ollama always runs on the host for GPU speed |
| Tests | Vitest |

Ollama runs outside Docker because Docker on macOS can't use the Apple GPU, which makes large models far too slow inside a container.

## Requirements

- Docker Desktop (or Docker Engine with Compose)
- Ollama installed and running on the host, with the model pulled:

  ```bash
  ollama pull qwen3.5:27b-int4
  ```

  This 4-bit build of the 27B model is about 16 GB on disk and fits a Mac with 24 GB of RAM at the default 16k context (`OLLAMA_NUM_CTX`). Other builds of the same model are larger and need more memory. Smaller models such as `qwen2.5:7b` also work, with lower quality; set `OLLAMA_MODEL` to switch.

## Quick start (planned)

```bash
cp .env.example .env
mkdir -p profiles                     # your real profiles (gitignored)
# add the Ireland template at templates/ireland.html
docker compose up --build             # or on the host: npm run build && npm run start (see .env.example)
open http://localhost:3000
```

The app listens on `127.0.0.1` only. It has no login yet, so don't expose it to a network.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | Ollama endpoint, as seen from the container (`http://localhost:11434` on the host) |
| `OLLAMA_MODEL` | `qwen3.5:27b-int4` | Model used for every pipeline step |
| `OLLAMA_TIMEOUT_MS` | `1800000` | Per-call timeout (large models are slow) |
| `OLLAMA_NUM_CTX` | `16384` | Context window in tokens. Prompts or replies that don't fit fail with a clear error instead of being silently truncated |
| `OLLAMA_THINK` | model default | Thinking mode for models that have one (`true`/`false`). Unset uses the model's default; `false` is much faster but may judge less carefully |
| `PROFILES_DIR` | `/app/profiles` | Folder holding the profile folders. In Docker it's bind-mounted from `./profiles`; on the host set it in `.env.local` (e.g. `./profiles`) |
| `PORT` | `3000` | Web UI port |

**Linux hosts:** `host.docker.internal` is mapped through `extra_hosts: host-gateway` in compose. Ollama must also listen on an address the container can reach, e.g. `OLLAMA_HOST=0.0.0.0` behind a firewall.

## Your data

Everything lives under `profiles/<profile>/`, one file per item:

```
profiles/jane-doe/
├── personal.md
├── summary.md
├── skills.md
├── languages.md
├── experience/2023-01-acme-senior-developer.md
├── education/2015-usp-bsc-computer-science.md
├── projects/resumee-manager.md
├── certifications/2024-06-aws-solutions-architect.md
├── extras/
├── imports/                      # CVs you uploaded
└── applications/
    └── 2026-11-05-globex-backend-engineer/
        ├── job.md                # the posting
        ├── analysis.md           # fit/gap
        ├── resume.md             # editable tailored resume
        └── resume.pdf
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
```

The full schema for every file is in [`constitution.md`, Article IV](constitution.md#article-iv--data-markdown-is-the-source-of-truth). `profiles/` is gitignored. `example-profiles/` holds a fictional profile for tests.

## Resume templates

Each country has one HTML template at `templates/<country>.html`, starting with `templates/ireland.html`. It defines the resume's sections, order, layout, and formatting with Handlebars placeholders (`{{name}}`, `{{#each experience}}`), holds the writing rules for the AI in a `<script type="text/markdown" id="rules">` block, and sets parameters such as `<meta name="max-pages" content="1">`. Everything in the resume, headings included, is written in the target language. A resume that runs over the page limit gets a warning. Generation refuses to run without the template.

## Privacy

- AI runs only on your own Ollama instance, with no cloud AI APIs.
- The only outbound requests go to Ollama and to job URLs you submit. No telemetry.
- Your data stays in `profiles/` on your machine. It is never committed or baked into the Docker image.

## Roadmap

- **M0, the first usable version:** pick a profile and paste a posting to get a fit/gap analysis and a tailored resume. You approve any implied skills, every claim is checked against your profile, and you print it to PDF.
- **Backlog:** URL fetch, a history screen, one-click PDF, a profile editor, CV import, and more, built in the order real usage suggests.
- **v2:** a guided AI interview that builds your profile by asking questions.
- **Later, not decided:** web deployment (Netlify or AWS) with authentication, cover letters, application status tracking.

The full feature list is in [`ROADMAP.md`](ROADMAP.md).

## Project documents

- [`constitution.md`](constitution.md): every rule of the project; it wins over everything else.
- [`ROADMAP.md`](ROADMAP.md): the feature list, the M0 scope, and the backlog.
- [`CLAUDE.md`](CLAUDE.md): instructions for Claude Code.
