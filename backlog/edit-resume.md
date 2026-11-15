---
title: Edit the resume with a live preview
id: F21
version: implemented
---

## What it does

- Under "Edit the resume", a text area holds the resume's content fields as YAML, exactly as `resume.md` stores them.
- The preview updates as you type; content that is invalid YAML or doesn't fit the schema shows its problems and can't be saved.
- Save writes `resume.md`, reruns the code checks, marks the model review as out of date and sends the resume back to draft.
- Fields the app doesn't know in `resume.md` are kept.

## Where it lives

- `src/core/resume/edit.ts`: `contentYaml`, `parseContentYaml`.
- `src/app/applications/[id]/actions.ts`: `previewResume`, `saveResume`.
- `src/components/resume-editor.tsx`.

## Tests

- `src/core/resume/edit.test.ts`, `src/app/applications/[id]/actions.test.ts`.

## Rules it follows

- Art. IV.7–IV.8 (unknown fields kept; atomic writes; overwrite only on the user's action).
- Art. II.5 (checks rerun on save).
