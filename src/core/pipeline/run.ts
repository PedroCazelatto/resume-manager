import { applicationFolderName, type ApplicationFile } from "../application/folder";
import { jobDetails, jobSummary, type JobSummary } from "../application/job";
import { analysisSchema, jobSchema, type JobDetails } from "../application/schemas";
import { stopIfCancelled, type LlmClient, type LlmProgress } from "../llm";
import { patchFrontmatter, stringifyFrontmatter } from "../markdown/frontmatter";
import { validateMarkdownFile } from "../markdown/validate";
import type { Profile } from "../profile/profile";
import { postingWithDetails } from "../prompts/posting";
import { resumeFileSchema } from "../resume/schema";
import type { ParseTemplateResult } from "../template/template";
import { checkResume } from "../verification/checks";
import { resumeStatus, type Verification } from "../verification/schema";
import { analysePosting } from "./analyse-posting";
import { reviewResume } from "./review-resume";
import { tailorResume } from "./tailor-resume";

// One run of the pipeline (Art. VI), from the posting to the verified resume. Each step's
// output is saved; a step whose output file already exists is skipped (F19). A cancelled
// run stops its model call, or stops before the next step; what is saved stays (F32).

/** `fetch` happens in the fetch queue, before the pipeline starts (F10). */
export type RunStep = "fetch" | "analyse" | "save" | "tailor" | "check" | "review";

export type RunEvent =
  | { type: "step"; step: RunStep; status: "running" | "done" }
  /** The model is thinking or writing in this step (Art. V.8). */
  | ({ type: "progress"; step: RunStep } & LlmProgress)
  /** The step's prompt may not leave room for the reply; the run continues (F40). */
  | { type: "warning"; step: RunStep; message: string }
  /**
   * The application folder exists from here on, even if a later step fails. The job's title,
   * company, company website and platform come along when job.md gives them (F38, F46).
   */
  | { type: "saved"; id: string; job?: JobSummary }
  | { type: "done"; id: string }
  | { type: "error"; message: string };

/** The application files of the selected profile, as the run needs them. */
export interface ApplicationFiles {
  /** Creates the application folder with its first files and returns its ID. */
  create(baseName: string, files: Partial<Record<ApplicationFile, string>>): Promise<string>;
  read(id: string, file: ApplicationFile): Promise<string | null>;
  add(id: string, file: ApplicationFile, content: string): Promise<void>;
  replace(id: string, file: ApplicationFile, content: string): Promise<void>;
}

export interface RunInput {
  llm: LlmClient;
  profile: Profile;
  files: ApplicationFiles;
  loadTemplate: (country: string) => Promise<ParseTemplateResult>;
  /** The template every new resume uses. */
  template: string;
  /**
   * A new run starts from a posting and its link: pasted, or fetched from the link, with the
   * details read from its page (F10, F46). A retry continues the application with this ID.
   */
  start: { posting: string; url: string; details?: JobDetails } | { id: string };
  now: () => Date;
  /** Today's date as YYYY-MM-DD, for the application folder's name. */
  today: () => string;
  send: (event: RunEvent) => void;
  /** Aborted when the user cancels the run (F32). */
  signal?: AbortSignal;
}

/** A saved file the run can't continue from; the user fixes or removes it (Art. IV.6). */
function invalid(file: string, problems: string[]): Error {
  return new Error(`${file} has problems: ${problems.join("; ")}`);
}

/** Runs the steps that have no saved output yet and returns the application's ID. */
export async function runApplication(input: RunInput): Promise<string> {
  const { llm, profile, files, send, now, signal } = input;
  const step = (name: RunStep, status: "running" | "done") => send({ type: "step", step: name, status });
  const progress = (name: RunStep) => (p: LlmProgress) => send({ type: "progress", step: name, ...p });
  const warning = (name: RunStep) => (message: string) => send({ type: "warning", step: name, message });

  let id: string;
  let posting: string;
  let job;
  let analysis;
  if ("posting" in input.start) {
    posting = input.start.posting;

    stopIfCancelled(signal);
    step("analyse", "running");
    ({ job, analysis } = await analysePosting({
      llm,
      profile,
      posting,
      url: input.start.url,
      details: input.start.details,
      now,
      onProgress: progress("analyse"),
      onWarning: warning("analyse"),
      signal,
    }));
    step("analyse", "done");

    stopIfCancelled(signal);
    step("save", "running");
    id = await files.create(applicationFolderName(input.today(), job.company ?? "", job.title ?? ""), {
      "job.md": stringifyFrontmatter(job, `${posting}\n`),
      "analysis.md": stringifyFrontmatter(analysis),
    });
    step("save", "done");
  } else {
    id = input.start.id;
    const [jobSource, analysisSource] = await Promise.all([files.read(id, "job.md"), files.read(id, "analysis.md")]);
    if (jobSource === null || analysisSource === null) {
      throw new Error("This application has no saved posting and analysis. Start a new one.");
    }
    const savedJob = validateMarkdownFile(jobSchema, "job.md", jobSource);
    if (!savedJob.ok) throw invalid("job.md", savedJob.error.problems);
    const savedAnalysis = validateMarkdownFile(analysisSchema, "analysis.md", analysisSource);
    if (!savedAnalysis.ok) throw invalid("analysis.md", savedAnalysis.error.problems);
    job = savedJob.data;
    analysis = savedAnalysis.data;
    posting = savedJob.body;
    step("analyse", "done");
    step("save", "done");
  }
  send({ type: "saved", id, job: jobSummary(job) });

  let resume;
  const resumeSource = await files.read(id, "resume.md");
  if (resumeSource === null) {
    stopIfCancelled(signal);
    step("tailor", "running");
    // Without a usable template the run stops here; the analysis stays saved (Art. VII.4).
    const template = await input.loadTemplate(input.template);
    if (!template.ok) throw new Error(`${template.error.file} isn't ready: ${template.error.problems.join("; ")}`);
    resume = await tailorResume({
      llm,
      profile,
      // The job's details go with its text, as in the analysis (F46).
      posting: postingWithDetails(jobDetails(job), posting),
      analysis,
      template: template.template,
      now,
      onProgress: progress("tailor"),
      onWarning: warning("tailor"),
      signal,
    });
    await files.add(id, "resume.md", stringifyFrontmatter(resume));
  } else {
    const saved = validateMarkdownFile(resumeFileSchema, "resume.md", resumeSource);
    if (!saved.ok) throw invalid("resume.md", saved.error.problems);
    resume = saved.data;
  }
  step("tailor", "done");

  if ((await files.read(id, "verification.md")) === null) {
    stopIfCancelled(signal);
    step("check", "running");
    const checked_at = now().toISOString();
    const found = checkResume(profile, resume);
    step("check", "done");

    stopIfCancelled(signal);
    step("review", "running");
    const { review, failures } = await reviewResume({
      llm,
      profile,
      resume,
      now,
      onProgress: progress("review"),
      onWarning: warning("review"),
      signal,
    });
    const verification: Verification = { checked_at, review, failures: [...found, ...failures] };
    await files.add(id, "verification.md", stringifyFrontmatter(verification));
    const status = resumeStatus(resume, verification);
    if (status !== resume.status) {
      const current = (await files.read(id, "resume.md")) ?? stringifyFrontmatter(resume);
      await files.replace(id, "resume.md", patchFrontmatter(current, { status }));
    }
  } else {
    step("check", "done");
  }
  step("review", "done");

  send({ type: "done", id });
  return id;
}
