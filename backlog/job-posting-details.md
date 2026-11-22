---
title: Job posting details: title, company, source and more
id: F46
version: implemented
reported: 2026-11-17
---

## What it does

- **A job posting's details.** `job.md` holds them as constitution Art. IV.5 lists: `title?`, `company?`, `company_url?` (the company's website, an http or https address), `url`, `source`, `fetched_at?`, `language?`, `location?`, `salary?`, `work_model?` (`remote`, `hybrid` or `on-site`), `hours?` and `archived_at?`; the posting's text is the body. `title` replaces `role`.
- **`source` names the job platform**, from the link: "LinkedIn" for `linkedin.com` and its subdomains (`ie.linkedin.com`), "Indeed" for `indeed.com` and its subdomains, otherwise the link's host name without `www.` (`jobs.example.com`). Pasted text is named from the link it carries.
- **The details are read from the page before the model runs.** The fetcher returns the details the page's HTML holds with its text, and [application-uuids](application-uuids.md) writes them to `job.md` with the text.
  - On any page, schema.org `JobPosting` data (`<script type="application/ld+json">`), found at any depth (a list, an `@graph`, a page's `mainEntity`): `title`; `hiringOrganization.name` as the company; its `sameAs`, otherwise its `url`, as the company's website, only when that is an http or https address; `jobLocation` as the location; `baseSalary` as the salary; `jobLocationType: TELECOMMUTE` as `remote`; `workHours`, otherwise a full-time or part-time `employmentType`, as the hours. A block that doesn't parse is skipped.
  - On LinkedIn's public job page, the title (`top-card-layout__title`), the company (`topcard__org-name-link`) and the location (`topcard__flavor topcard__flavor--bullet`) come from the top card, and the hours from the "Employment type" of the job criteria (`description__job-criteria-item`). The page's `JobPosting` data fills what they don't show, such as the company's website. The other criteria (seniority level, job function, industries) have no field.
  - Every value is plain text on one line: entities decoded, tags dropped, whitespace collapsed. An empty value is left out.
- **The posting's text.** On LinkedIn it is the description element (`show-more-less-html__markup`) alone: the page's title no longer goes above it. Elsewhere it is the `JobPosting` description (HTML, HTML escaped once more, or plain text, whose lines are kept), otherwise the page's main area as before ([posting-by-url](posting-by-url.md)). On LinkedIn the `JobPosting` description is the text when the element is missing or empty.
- **The model never creates a value (Art. VI.2).** The analysis keeps every detail the page gave. The model's reply has `title`, `company`, `location`, `salary`, `work_model` and `hours`, each null when the posting's text doesn't state it, and the prompt asks it to copy them as the posting writes them and never guess. A copied value fills only a detail the page didn't give. The company's website comes from the page only.
- **The page is untrusted input (Art. II.7).** Its details reach the prompts only inside the delimited `<posting>` block, one per line above the text ("Title: …", "Company: …", "Location: …", "Salary: …", "Work model: …", "Hours: …"), escaped like the text. The tailoring prompt gets the same block, with the details saved in `job.md`. The details are shown as text, never as HTML, and the website becomes a link only as an http or https address.
- **Old `job.md` files are still read** until the one-time update of [application-uuids](application-uuids.md) rewrites them: `role` is read as the title, an old `source` (`url` or `paste`) is named from the file's link, and one without a link (old pasted text) has no platform.
- **The Runs list.** Each row shows the job's title, linked to its application once it exists, with "Try again" or "Verify again" as a small label (a new application has none), and under it the company, linked to its website when the posting gives one, and the source; then the state and the row's buttons, as before. Until the title is known the row shows its URL (the link as given, then the address the text was read from); a "Try again" or "Verify again" run shows its application's ID until its details arrive. The page's details are listed as soon as the fetch worked, before the analysis ends, and `job.md`'s once the application is saved. The `saved` event carries `job: { title, company, companyUrl, source }`. The home page's table arranges these later ([home-applications-table](home-applications-table.md)).
- Notifications name the company and the title. The application page's heading is the title and the company (the link, or the application's ID, when neither is known).

## Where it lives

- `src/core/posting/details.ts` (new): `readPostingPage(html, { linkedIn })`, returning `{ text, details }`; `jobPostingDetails`; LinkedIn's selectors.
- `src/core/posting/html-to-text.ts`: `pageText` (a page already parsed; on LinkedIn the description element alone), `descriptionText`, the `description` option.
- `src/core/posting/sites.ts`: `platformName`, `linkPlatform`. `src/core/posting/url.ts`: `webAddress`.
- `src/core/posting/job-fetcher.ts`: `FetchedPosting.details`. `src/core/posting/start.ts`: `PostingStart` is `{ posting, url, details? }`, the link required and `fetched` gone. `src/adapters/job-fetcher.ts` returns `readPostingPage`'s text and details.
- `src/core/application/schemas.ts`: `jobSchema` with the new fields, `WORK_MODELS`, `JobDetails`; `url` is required except in an old file whose `source` is `url` or `paste`. `src/core/application/job.ts` (new): `jobTitle`, `jobPlatform`, `jobDetails`, `jobSummary`, `detailsSummary`, `JobSummary`. `src/core/application/job-file.ts` ([application-uuids](application-uuids.md)): `fetchedJobFile` writes the page's details.
- `src/core/pipeline/analyse-posting.ts`: the reply schema with its nullable details, the page's values first, `source` from the link. `src/core/prompts/analyse-posting.ts`: the rules on copying details. `src/core/prompts/posting.ts` (new): `postingWithDetails`. `src/core/pipeline/run.ts` and `src/core/pipeline/verify.ts`: the `saved` event's `job`, and the details in the tailoring prompt.
- `src/core/runs/queue.ts`: `QueuedRun.job`, from the `saved` event. `src/core/runs/notice.ts`: `title` replaces `role`. `src/app/runs.ts`: `RunSummary.title`, `company`, `companyUrl` and `source` (the page's details from the fetched posting, then `job.md`'s; the platform from the run's link until then). `src/components/runs-list.tsx`: `RunJob`, the row's job. `src/components/use-run.tsx`, `src/app/applications/[id]/page.tsx`.
- `src/core/posting/linkedin-page.testing.ts` (new): the hand-written LinkedIn page.

## Tests

- `src/core/posting/details.test.ts`: every `JobPosting` field (the company, its website, the location, the salary, the work model, the hours, the description's forms), a page without it, blocks that don't parse, the nesting. On the LinkedIn fixture: the top card and the criteria without the model; the `JobPosting` data filling the rest, and taking over when the top card's elements are missing; the applicants count never read as the location; the description element alone, without the page's title, the sign-in, the criteria or the similar jobs; the `JobPosting` description when the element is missing; only the `JobPosting` data on another site.
- `src/core/posting/html-to-text.test.ts`: LinkedIn's element alone, without the page's title.
- `src/core/posting/sites.test.ts` ("platformName", "linkPlatform"): LinkedIn and its subdomains, Indeed and a subdomain, another site without `www.`. `src/core/posting/url.test.ts` ("webAddress"): only http and https addresses.
- `src/adapters/job-fetcher.test.ts`: the details returned with the text; LinkedIn's 301 to the country page followed and read there, with the same job key and platform.
- `src/core/application/schemas.test.ts`: every field; only `url` and `source` needed; the platform and the link required; old files (`source: url` or `paste`, `role`, no link); the website and the link as http or https addresses only; three work models. `src/core/application/job.test.ts`: reading old and new files.
- `src/core/pipeline/analyse-posting.test.ts`: the page's values kept over the model's; filling only from the reply; every detail null; the reply schema; the platform for LinkedIn, Indeed, an Indeed subdomain and another site; the page's details inside the escaped block. `src/core/prompts/analyse-posting.test.ts`, `src/core/prompts/posting.test.ts`.
- `src/core/pipeline/run.test.ts`: `job.md`'s fields, the `saved` event and the tailoring prompt; old `job.md` files tried again.
- `src/core/runs/queue.test.ts`, `src/core/runs/notice.test.ts`. `src/app/runs.test.ts`: the platform from the link, the page's details once fetched and before the analysis ends, `job.md`'s once saved, kept on "Try again".
- Checked by hand on 2026-11-21, before [application-uuids](application-uuids.md), against the built app (`next start` on port 3101) with `example-profiles` and an Ollama address where nothing listens (no request left the machine): an Indeed row was listed with `source: "Indeed"`; text pasted on it moved the same run on to the model; the old example application's page showed "Senior Backend Engineer · Globex Corporation" from its `role`; "Verify again" on it listed the title and the company, and no source (old pasted text, without a link); the server log held no posting text.
- Checked on 2026-11-22 against the real LinkedIn page the user chose, with the app's User-Agent: `https://www.linkedin.com/jobs/view/4488373441/` answered 301 to the `ie.linkedin.com` page, and one more request read it. It was the job page, not a sign-in wall or a security check. The code gave the title, the company and the location from the top card, "Full-time" from the criteria, LinkedIn's company page as the website from `sameAs`, and the description without the page's title. The page was deleted after the check and never committed; the fixture is written by hand with fictional text.
- Not looked at in a browser: the Runs list's rows (the title, the label, the company's link, the source).

## Rules it follows

- Art. IV.5 (`job.md`'s fields), IV.6 (`job.md` is validated whenever it is read, and an old one is still valid), IV.7 (the analysis keeps every other field).
- Art. VI.2 (the page's details are kept; the model only copies what the text states, or leaves the detail empty).
- Art. II.7 (the page's details are delimited and escaped in the prompts, shown as text, and the website is a link only as an http or https address).
- Art. III.2 (only the user's link and its redirects are requested), III.3 and III.5 (the real LinkedIn page wasn't kept; the fixture is fictional), III.4 (no posting text is listed, streamed or logged).
- Art. V.3 (the extraction, the platform rule, the merge and the prompt are pure core code; the network is behind the fetcher adapter), IX.2 (the model and the fetcher are mocked; no test opens a socket), IX.4 (no new dependency).

## Notes

- Decided 2026-11-17 (the user): "Lets define the row entity, it is a Job Posting that has title, URL, description, company, location, salary, source, work model and how many hours of work. The row just needs the title, the company and the source, and use the URL while the title is not defined."
- Decided 2026-11-17: "Read company and role from LinkedIn's top-card elements instead. We must extract all the information that we can from the HTML."
- Decided 2026-11-17: "There is no need to save the source as 'url' or 'paste'. Save it as 'LinkedIn' or 'Indeed', or any other platform."
- Decided 2026-11-17, on the details: the title field is renamed `title`; a posting without a link "won't exist"; another site's `source` is "the host name without 'www.'"; work model `remote`, `hybrid` or `on-site`, salary and hours as written; "Always use the information from the page. The model must never create values."; old files: "Rewrite them."; rows show the kind label and link the title to the application, and "the rows need to show the state too".
- Decided 2026-11-17: "The model can fill missing details if they come from the posting text."
- Decided 2026-11-17: the company is a link to the company's website when the posting has it.
- Decided 2026-11-17: application folders are named by a UUID, not by company and title ([application-uuids](application-uuids.md)).
- Decided 2026-11-21 (the user): the real LinkedIn job page checked, with one request, for the top-card structure is https://www.linkedin.com/jobs/view/4488373441/.
- Decided 2026-11-22 (the user): that link answers with a redirect (301) to `https://ie.linkedin.com/jobs/view/partner-solutions-engineer-at-google-4488373441`; the check follows it: "Of course, if it is just a redirect, it must continue fetching."
- Constitution amended for this task in versions 10.0.0 and 11.0.0 (2026-11-17).
- Built on 2026-11-21 and 2026-11-22 with the smallest behaviour where the task said nothing:
  - on LinkedIn the description element comes before the `JobPosting` description: on the real page both held the same text, line for line; the element is the description the page shows and the one LinkedIn pages were already read from ([posting-by-url](posting-by-url.md)); and it is there on a page without `JobPosting` data. The `JobPosting` description is the text when the element is missing or empty;
  - on LinkedIn the top card and the criteria come before the `JobPosting` data, which fills the rest: the task says the title, the company and the location come from the top card, and on the real page the top card's location ("Dublin, County Dublin, Ireland") said more than the data's ("Dublin" and "IE"). The criteria's employment type comes before `employmentType`;
  - the location is the top card's `topcard__flavor topcard__flavor--bullet`, the first row's bullet: the applicants count in the second row is a bullet too, but not a `topcard__flavor`;
  - on LinkedIn `sameAs` is LinkedIn's page of the company, which is kept as the company's website, as the task lists `sameAs`;
  - elsewhere the `JobPosting` description comes before the page's main area;
  - the first `JobPosting` at any depth is read; `@type` may be a list or a full name;
  - the company is `hiringOrganization.name`, or the organisation written as text, the first of a list; its website is the first http or https address of `sameAs`, then of `url`, and any other value (`javascript:`, `data:`, an address without a scheme) is dropped, not kept as text;
  - the location is each `jobLocation`'s town, region and country, without repeats (compared without case), the places joined by "; "; the street and the postal code are left out, a country code stays as written ("IE"), an address written as text or the place's `name` is used when there are no parts, and `applicantLocationRequirements` names the location when there is no `jobLocation`;
  - the salary is written in English with its currency ("€60,000–€70,000 a year"); `unitText` HOUR, DAY, WEEK, MONTH and YEAR read "an hour", "a day", "a week", "a month" and "a year", any other unit is added as written; a range with one end reads "From …" or "Up to …", equal ends give one amount, a value that isn't a number and a currency that isn't a code are kept as written, `salaryCurrency` is used when the amount has none, and `estimatedSalary` is not read;
  - only `jobLocationType: TELECOMMUTE` gives a work model (`remote`);
  - the hours are `workHours` as written, otherwise "Full-time" or "Part-time" from `employmentType` (or LinkedIn's criteria), several joined by ", "; contract, temporary, internship and the other types give none;
  - a value has no length limit;
  - the prompt's new rules: "The posting may start with the job's details read from its page, one per line (e.g. "Title: ..."). They are part of the posting." and "Copy the job's details from the posting: "title", "company", "location", "salary" and "hours" exactly as the posting writes them, and "work_model" as "remote", "hybrid" or "on-site" only when the posting says how the job is worked. Use null for every detail the posting doesn't state. Never guess, infer or make up a detail."; the company's website isn't sent to the model;
  - the reply always has every detail, and the page's value wins; the model may copy from the details' lines, since they are part of the posting;
  - the tailoring prompt gets the job's details from `job.md` too, so LinkedIn's title and company still reach it without the page's title;
  - the page's details are read from the fetched posting kept with the run, so a "Try again" keeps them; until the analysis is saved the platform is named from the run's listed link, so a link waiting to fetch already reads "LinkedIn";
  - the row: the title (or the URL, broken anywhere) in a medium weight, a link in the accent colour once the application exists; the kind as an outline badge next to it; "company · source" under it in small muted text; the company's link opens in a new tab, with `rel="noopener noreferrer"`. "New application" is no longer shown;
  - an old `job.md` whose `source` is `url` may lack its link too, like one whose `source` is `paste`;
  - `webAddress` lives in `src/core/posting/url.ts`, which imports nothing, so the Runs list doesn't bring the HTML parser to the browser;
  - the check of LinkedIn's page followed its redirect with the app's User-Agent, as the app does.
- Left for the user's answer on 2026-11-22:
  - LinkedIn's `sameAs` is LinkedIn's page of the company, not its own website: should it stay `company_url`, or should a LinkedIn posting have no website?
  - should contract, temporary, internship and the other employment types be kept (in `hours`, or a new field), and LinkedIn's other criteria (seniority level, job function, industries) and the other `JobPosting` properties (qualifications, responsibilities, skills, benefits, the posting's dates)?
  - should the application page show the salary, the work model, the hours, the source and the company's website?
  - should a detail the model copied be dropped when the posting's text doesn't hold it word for word?
  - should a country code ("IE") become the country's name?
