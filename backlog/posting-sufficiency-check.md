---
title: Check whether the posting says enough before writing the resume
id: F49
version: future version
reported: 2026-11-17
---

## Problem

A run writes a resume from whatever text it got: a fetched page that holds only part of the posting (a cut description, a cookie wall, a list of other jobs) still goes on to the resume. The user said the resume queue never fetches again "unless the model judges that there isn't enough information", and on 2026-11-17 chose to keep that as a future task.

## Behaviour

- The analysis step (Art. VI.2) also judges whether the posting's text says enough to write a tailored resume: at least the role and its requirements.
- When it says the text is not enough, the run does not write the resume. What happens then is not decided (see Decisions).
- When it says the text is enough, nothing changes.

## Acceptance criteria

- [ ] The model's analysis reply has a field for the judgement and a short reason, validated by its schema (Art. V.6).
- [ ] A run whose analysis says "not enough" never reaches the tailor step, and its row in the Runs list shows the reason.
- [ ] The behaviour chosen under Decisions is built and tested with the model mocked.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass.
- [ ] This file says `version: implemented` in the implemented format, and `backlog/index.md` lists it under Implemented.

## Technical notes

- The judgement belongs in the existing analysis call, not a new model call: `analysePostingReplySchema` and `analysePosting` in `src/core/pipeline/analyse-posting.ts`, the prompt in `src/core/prompts/analyse-posting.ts`.
- The run's steps are in `src/core/pipeline/run.ts`; the run queue and its rows in `src/core/runs/queue.ts`, `src/app/runs.ts` and `src/components/runs-list.tsx`.
- The posting stays untrusted input (Art. II.7): the judgement is about the text, and nothing in the text can tell the model to skip it.

## Depends on

- [posting-by-url](posting-by-url.md) and [run-queue](run-queue.md) (implemented).
- [runs-list-changes](runs-list-changes.md), if the run is to ask for the posting's text through the same row.

## Decisions

- Decided 2026-11-17: "Not now: write it down as a future task."
- To decide before building, what happens when the text is not enough. The options put to the user on 2026-11-17 were: the run stops before writing the resume and its row asks for the posting's text with "Paste the text instead"; or the link is fetched once more, then the run goes on with whatever came back.
