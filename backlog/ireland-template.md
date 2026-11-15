---
title: Ireland resume template
id: F11
version: implemented
---

## What it does

- Resumes follow `templates/ireland.html`: Handlebars layout, the model's writing rules in `<script type="text/markdown" id="rules">`, and `<meta name="max-pages">`.
- The template is checked when loaded: a missing rules block, a bad `max-pages`, invalid Handlebars or unescaped output (`{{{ }}}`) are reported as problems.
- If the template is missing or broken, the home page says so and a run stops at the tailor step with a clear message; the analysis stays saved.

## Where it lives

- `templates/ireland.html` (owned by the user).
- `src/core/template/template.ts`: `parseTemplate`.
- `src/adapters/template-store.ts`: `loadTemplate`.
- `src/app/templates.ts`: `DEFAULT_TEMPLATE = "ireland"`.

## Tests

- `src/core/template/template.test.ts`, `src/adapters/template-store.test.ts`.

## Rules it follows

- Art. VII (one template per country, never a made-up fallback, only the user changes templates).
- Art. V.9 (content is always HTML-escaped).

## Notes

- `templates/ireland.md` is the user's reference copy; the app does not read it.
