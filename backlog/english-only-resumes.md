---
title: Write every resume in English and remove the language choice
id: F51
version: implemented
reported: 2026-11-17
---

## What it does

- Every resume is written in English, whatever the posting's language. The tailor prompt always asks for English, labels included (the headings and the word for "present"), and `resume.md` is saved with `language: en`, so the template formats its dates in English.
- There is no language field: not in the new-application form, not next to "Try again" on the application page, not in the Runs list.
- Runs carry no language. `POST /api/applications` and `POST /api/applications/[id]` no longer take one, `GET /api/runs` lists none, and the browser no longer remembers one per application.
- `job.md` keeps `language`, the posting's detected language; the application page still shows it under the heading.
- An older `resume.md` in another language still opens and renders as it is: its labels, its dates formatted for its language, and its `lang`. "Verify again" on it still tells the model review the resume's own language.
- Profile data may be in any language; the model translates it into English, as the tailor prompt already allowed (Art. VIII.2).

## Where it lives

- `src/core/prompts/tailor-resume.ts`: "Write everything in English (en), including every label." `tailorResumeSystem` takes only `maxPages`.
- `src/core/pipeline/tailor-resume.ts`: no `language` input; writes `language: "en"`. `src/core/pipeline/run.ts`: `RunInput` has no `language`.
- `src/app/runs.ts`: `RunRequest` is `{ start }`, and `RunSummary` has no `language`. `src/app/run.ts`: `readLanguage` is removed.
- Routes: `src/app/api/applications/route.ts`, `src/app/api/applications/[id]/route.ts` (reads no body), `src/app/api/applications/[id]/verification/route.ts`.
- `src/core/application/languages.ts`: only `languageName`, for the posting's language and older resumes. The ISO 639-1 list and `isLanguageCode` are removed.
- Removed from the browser: `src/components/language-select.tsx`; the language in `src/components/new-application-form.tsx` and `src/components/retry-run.tsx`, including the latter's `GET /api/runs` request; `rememberedLanguage`, `rememberLanguage` and `FollowOptions.language` in `src/components/use-run.tsx`; `language` in `ActiveRun` (`src/components/use-active-run.ts`, `src/app/applications/[id]/page.tsx`, `src/components/runs-list.tsx`).
- Removed from core: `latestGeneration` in `src/core/runs/queue.ts`, which only found the language to prefill.
- Kept for older files: `renderResume` and `formatDate` in `src/core/resume/render.ts` format dates for `resume.md`'s `language`; `language` stays in `resumeFileSchema` and `jobSchema`; `src/core/prompts/review-resume.ts` names the resume's language.
- `templates/ireland.html` is unchanged: its `<html lang="{{language}}">` gets `en` from every new `resume.md`.

## Tests

- `src/core/pipeline/run.test.ts`: a posting whose mocked analysis says `pt` saves `job.md` with `language: pt` and `resume.md` with `language: en`, and the tailor prompt asks for English and names no other language; "Try again" writes `en` too.
- `src/core/pipeline/tailor-resume.test.ts`: the draft has `language: en`, and the system prompt says "Write everything in English (en)".
- `src/core/resume/render.test.ts`: an older `resume.md` with `language: pt` still validates and renders with its `lang`, its labels and Portuguese dates.
- `src/app/runs.test.ts`: runs carry no language, and the list's entries, compared whole, have none.
- `src/core/application/languages.test.ts`: `languageName` only.
- Checked by hand on 2026-11-21 against the built app (`next start` on port 3101) with `example-profiles` and an Ollama address nothing listens on (no model call): `POST /api/applications` with a pasted posting and `language: "pt"` answered 202; `GET /api/runs` listed the run without a `language`; the home page and an application page rendered without a language field; the server log held no posting text.
- Not looked at in a browser: the form and the application page without the field.

## Rules it follows

- Art. VIII.1 (every resume in English, headings included), VIII.2 (translation keeps the meaning and adds nothing), VIII.3 (names aren't translated; that line of the prompt is unchanged).
- Art. IV.5 (`job.md` keeps the posting's `language`; `resume.md` keeps `language`, now `en`) and IV.6 (older files still validate).
- Art. V.3 (the language is fixed in core; the routes and components only lost code).
- Art. VII.5 (the template wasn't edited).
- Art. IX.2 (the model is mocked in every test).

## Notes

- Decided 2026-11-17 (the user): "Lets remove the language feature and set it only to english by now."
- Built on 2026-11-21 with the smallest behaviour where the task said nothing:
  - an older resume keeps its own language for its dates and `lang`, since it renders "as it is"; nothing forces it to English;
  - a `language` still sent to a route is ignored, not refused;
  - entries the browser already remembered (`resume-language:<id>` in local storage) are left there, unused;
  - the "Resume" card on the application page still names the resume's language ("English" for every new resume);
  - the tailor prompt keeps the exact line it already sent when English was chosen.
