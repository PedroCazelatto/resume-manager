import type { ApplicationSummary } from "../application/summary";
import type { RunStep } from "../pipeline/run";
import { isIndeedLink } from "../posting/sites";
import { waitingToFetch, type RunKind, type RunStatus, type RunStepState } from "../runs/queue";

// The home page's table (F26): one row per application of the selected profile, read from its
// files, together with its runs in memory, plus a row for each run that has no application yet.
// The rows go into three tabs, Ready, Generating and Archived, except the generation in
// progress, which is shown on its own above them. These functions only compute the rows; the
// app reads the files and the runs (Art. V.3).

/** The tabs of the table. */
export type HomeTab = "ready" | "generating" | "archived";

/** What the table reads of a run in memory, as `GET /api/runs` lists it. */
export interface HomeRun {
  runId: string;
  kind: RunKind;
  status: RunStatus;
  applicationId?: string;
  title?: string;
  company?: string;
  companyUrl?: string;
  source?: string;
  url?: string;
  error?: string;
  steps: RunStepState[];
  warnings: Partial<Record<RunStep, string>>;
  /** "Try again" on the run itself (F19). */
  retryable: boolean;
  /** The run needs its posting's text (F10, F47). */
  fetchFailed: boolean;
  /** The archive button on the run itself (F48). */
  archivable: boolean;
  /** What its X does (F48, F26). */
  stop: "remove" | "cancel" | null;
  /** When the run was archived, for a run listed among the archived ones (F48). */
  archivedAt?: string;
}

/** What the third column says about a row. */
export type RowState =
  | "waiting to fetch"
  | "fetching the posting"
  | "waiting"
  | "running"
  | "needs the posting's text"
  | "failed"
  | "cancelled"
  | "draft"
  | "ready"
  | "has problems";

/** The status colours (F35): running and finished green, failed red, needing the posting's text amber, the others grey. */
export type RowTone = "green" | "amber" | "red" | "neutral";

/**
 * What a row can do: remove a link of the fetch queue, cancel a run, try it again, paste the
 * posting's text, open the application's page, archive, restore, view the printable resume,
 * or delete an archived application that never finished.
 */
export type RowAction = "remove" | "cancel" | "try-again" | "paste" | "open" | "archive" | "restore" | "view-pdf" | "delete";

/** One row of the table. */
export interface HomeRow {
  /** The application's ID, or the run's for a run without an application. */
  key: string;
  /** Its tab, or "running" for the generation in progress, shown above the tabs. */
  place: HomeTab | "running";
  applicationId?: string;
  /** The run in memory the row shows or acts on: its application's latest. */
  runId?: string;
  kind?: RunKind;
  /** The run's kind as a small label, while the row shows its run: "Try again" or "Verify again". */
  label?: "Try again" | "Verify again";
  title?: string;
  company?: string;
  companyUrl?: string;
  source?: string;
  /** The posting's link, which the row shows while the title isn't known (F46). */
  url?: string;
  /** job.md's `fetched_at`, the application's date (F50). */
  date?: string;
  archivedAt?: string;
  state: RowState;
  tone: RowTone;
  /** Why its run failed, in Generating. */
  error?: string;
  /** The steps its run went through and their warnings, in Generating (F30, F40). */
  steps: RunStepState[];
  warnings: Partial<Record<RunStep, string>>;
  /** The main action, shown as a button. */
  main: RowAction | null;
  /** The row's other actions, in its menu. */
  menu: RowAction[];
  /**
   * Where "Paste the text" sends the text: to the row's run, which moves on with it (F48), or to
   * its application, when no run of it is in memory (after a restart).
   */
  pasteTo?: "run" | "application";
  /** Why "View PDF" can't open the printable resume yet; empty once it can (Art. VI.7). */
  printBlockers?: string[];
}

/** The numbers on the Generating tab's label. */
export interface GeneratingCounts {
  /** Runs waiting for the model. */
  waiting: number;
  /** Links still in the fetch queue. */
  fetching: number;
  /** Rows with problems: a failed fetch, a link that needs its text, a failed generation. */
  problems: number;
}

export interface HomeTable {
  /** The generation in progress, shown above the tabs. */
  running: HomeRow | null;
  /** Finished applications, newest first. */
  ready: HomeRow[];
  /** Waiting, fetching, failed and cancelled rows, in queue order. */
  generating: HomeRow[];
  /** Archived rows, newest archived first. */
  archived: HomeRow[];
  counts: GeneratingCounts;
  /** The tab shown first. */
  firstTab: HomeTab;
}

const KIND_LABELS: Partial<Record<RunKind, HomeRow["label"]>> = { retry: "Try again", verify: "Verify again" };

/** The order of a menu's actions. */
const MENU_ORDER: RowAction[] = ["open", "cancel", "try-again", "paste", "archive", "restore", "delete"];

const isActive = (run: HomeRun | undefined) => run?.status === "fetching" || run?.status === "queued" || run?.status === "running";

const ACTIVE_STATES: RowState[] = ["waiting to fetch", "fetching the posting", "waiting"];

/** A row, with the run it was derived from, for ordering. */
type Derived = { row: HomeRow; run?: HomeRun };

/**
 * One row, from its application's files (if it has an application) and its runs: `run` is its
 * latest run in memory, `archivedRun` its latest archived run.
 */
function deriveRow(key: string, app: ApplicationSummary | undefined, run: HomeRun | undefined, archivedRun: HomeRun | undefined): Derived {
  const active = isActive(run);
  const hasProblems = (app?.problems.length ?? 0) > 0;
  const jobProblem = app?.problems.some((problem) => problem.file.endsWith("/job.md")) ?? false;
  const finished = app?.finished ?? false;
  /** The run whose end the row tells: archived ones are only in the archived list. */
  const ended = run ?? archivedRun;
  const archivedAt = app ? app.archivedAt : run ? undefined : archivedRun?.archivedAt;

  // A run that is going puts the row in the queue, archived or finished as it may be; otherwise
  // the files decide (F26, F48).
  const place: HomeRow["place"] =
    run?.status === "running" ? "running" : active ? "generating" : archivedAt !== undefined ? "archived" : finished ? "ready" : "generating";

  let state: RowState;
  let tone: RowTone;
  if (run && active) {
    state = run.status === "running" ? "running" : run.status === "queued" ? "waiting" : waitingToFetch(run) ? "waiting to fetch" : "fetching the posting";
    tone = run.status === "running" ? "green" : "neutral";
  } else if (hasProblems) {
    [state, tone] = ["has problems", "red"];
  } else if (finished) {
    [state, tone] = [app?.resumeStatus ?? "draft", "green"];
  } else if (ended?.status === "failed") {
    [state, tone] = ended.fetchFailed ? ["needs the posting's text", "amber"] : ["failed", "red"];
  } else {
    // Cancelled, or not in memory any more: nothing restarts by itself after a restart (F50).
    [state, tone] = ["cancelled", "neutral"];
  }

  const applicationId = app?.id ?? ended?.applicationId;
  const archived = place === "archived";
  const usable = !active && !hasProblems;
  const indeed = app ? app.indeed : ended?.url !== undefined && isIndeedLink(ended.url);
  const needsText = usable && !finished && (ended ? ended.fetchFailed : app ? !app.hasText : false);
  const can = new Set<RowAction>();
  if (applicationId !== undefined) can.add("open");
  if (run?.stop && run.status !== "running") can.add(run.stop);
  // An Indeed link is never requested, so it is never tried again (F47).
  if (usable && !archived && !finished && !(needsText && indeed) && (app ? true : run?.retryable === true)) can.add("try-again");
  if (!archived && needsText) can.add("paste");
  if (!active && !archived && (app ? !jobProblem : run?.archivable === true)) can.add("archive");
  if (!active && archived) can.add("restore");
  if (finished && !hasProblems) can.add("view-pdf");
  if (!active && archived && !finished) can.add("delete");

  const main = place === "running" ? null : mainAction(state, can, { finished, archived });
  const shown = run ?? archivedRun;
  const queue = place === "generating" && run ? run : undefined;
  const label = (place === "running" || place === "generating") && run ? KIND_LABELS[run.kind] : undefined;
  const row: HomeRow = {
    key,
    place,
    ...(applicationId === undefined ? {} : { applicationId }),
    ...(shown ? { runId: shown.runId, kind: shown.kind } : {}),
    ...(label ? { label } : {}),
    ...known({
      title: app?.title ?? shown?.title,
      company: app?.company ?? shown?.company,
      companyUrl: app?.companyUrl ?? shown?.companyUrl,
      source: app?.source ?? shown?.source,
      url: app?.url ?? shown?.url,
      date: app?.date,
      archivedAt,
      error: queue?.error,
    }),
    state,
    tone,
    steps: queue?.steps ?? [],
    warnings: queue?.warnings ?? {},
    main,
    // The generation in progress has only its X, next to its running step (F48).
    menu: place === "running" ? [] : MENU_ORDER.filter((action) => can.has(action) && action !== main),
    ...(can.has("paste") ? { pasteTo: ended?.fetchFailed && ended === run ? "run" : "application" } : {}),
    ...(can.has("view-pdf") && app?.printBlockers ? { printBlockers: app.printBlockers } : {}),
  };
  return { row, run };
}

/**
 * The main action of a row (F26): a link waiting to fetch or being fetched is removed, a run
 * waiting for the model is cancelled, and so is an Indeed link that needs its text; a failed
 * fetch, a failed generation and a cancelled run are tried again (or get their text pasted, when
 * they can't be tried again); a finished application opens its printable resume; an archived
 * row that never finished is deleted. A row with problems is opened, where its files are named.
 */
function mainAction(state: RowState, can: ReadonlySet<RowAction>, row: { finished: boolean; archived: boolean }): RowAction | null {
  const first = (...actions: RowAction[]) => actions.find((action) => can.has(action)) ?? null;
  if (state === "has problems") return first("open");
  if (can.has("remove") || can.has("cancel")) return first("remove", "cancel");
  if (row.finished) return first("view-pdf");
  if (row.archived) return first("delete");
  return first("try-again", "paste");
}

/** Only the values that are known. */
function known<T extends object>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** Milliseconds of an ISO time, or null when it is missing or not a time. */
function time(iso: string | undefined): number | null {
  const parsed = iso === undefined ? NaN : Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Newest first; rows without a time come last, then by key. */
function newestFirst(a: string | undefined, b: string | undefined): number {
  const [x, y] = [time(a), time(b)];
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y - x;
}

/**
 * The table of a profile's applications and runs (F26). `runs` are the profile's runs as the
 * Runs list orders them (`runsOf`: the running one, the waiting ones in order, the fetch queue,
 * then the ended ones, latest first), without the archived ones, which come in `archivedRuns`.
 */
export function homeTable(
  applications: readonly ApplicationSummary[],
  runs: readonly HomeRun[],
  archivedRuns: readonly HomeRun[] = [],
): HomeTable {
  const keyOf = (run: HomeRun) => run.applicationId ?? run.runId;
  const group = (list: readonly HomeRun[]) => {
    const byKey = new Map<string, HomeRun>();
    // The first of each key is its latest: the running one, then the waiting one, then the latest ended.
    for (const run of list) if (!byKey.has(keyOf(run))) byKey.set(keyOf(run), run);
    return byKey;
  };
  const apps = new Map(applications.map((app) => [app.id, app]));
  const latest = group(runs);
  const archived = group(archivedRuns);
  const keys = new Set([...apps.keys(), ...latest.keys(), ...archived.keys()]);
  const derived = [...keys].map((key) => deriveRow(key, apps.get(key), latest.get(key), archived.get(key)));

  const position = new Map(runs.map((run, index) => [run.runId, index]));
  const rows = (place: HomeRow["place"]) => derived.filter(({ row }) => row.place === place);
  const generating = rows("generating").sort((a, b) => queueOrder(a, position) - queueOrder(b, position) || byDate(a, b));
  const table = {
    running: rows("running")[0]?.row ?? null,
    ready: rows("ready")
      .sort((a, b) => newestFirst(a.row.date, b.row.date) || a.row.key.localeCompare(b.row.key))
      .map(({ row }) => row),
    generating: generating.map(({ row }) => row),
    archived: rows("archived")
      .sort((a, b) => newestFirst(a.row.archivedAt, b.row.archivedAt) || a.row.key.localeCompare(b.row.key))
      .map(({ row }) => row),
  };
  return { ...table, counts: generatingCounts(table.generating), firstTab: firstTab(table) };
}

/**
 * Where a row of Generating sits: the rows that ended first, where they were when they ended,
 * so a failed generation stays at its position (F26); then the runs waiting for the model, in
 * the order they will start; then the fetch queue, in the order the links are fetched. Rows with
 * no run in memory (after a restart) come before all of them.
 */
function queueOrder({ run }: Derived, position: ReadonlyMap<string, number>): number {
  if (!run) return -Infinity;
  const index = position.get(run.runId) ?? 0;
  const size = position.size;
  // The ended runs are listed latest first, so the one that ended first has the highest index.
  if (run.status === "queued") return size + index;
  if (run.status === "fetching") return 2 * size + index;
  return -index;
}

/** Rows with no run in memory: oldest first by their date, those without one last, then by key. */
function byDate(a: Derived, b: Derived): number {
  if (a.run || b.run) return 0;
  const [x, y] = [time(a.row.date), time(b.row.date)];
  if (x !== y) return x === null ? 1 : y === null ? -1 : x - y;
  return a.row.key.localeCompare(b.row.key);
}

/** The Generating tab's numbers (F26): runs waiting for the model / links still being fetched, and the rows with problems. */
export function generatingCounts(rows: readonly Pick<HomeRow, "state">[]): GeneratingCounts {
  const count = (...states: RowState[]) => rows.filter((row) => states.includes(row.state)).length;
  return {
    waiting: count("waiting"),
    fetching: count("waiting to fetch", "fetching the posting"),
    problems: count("failed", "needs the posting's text"),
  };
}

/**
 * The tab shown first: Generating while a resume is being generated (a run is running, waiting
 * for the model or fetching its posting), otherwise Ready (F26).
 */
export function firstTab(table: Pick<HomeTable, "running" | "generating">): HomeTab {
  return table.running !== null || table.generating.some((row) => ACTIVE_STATES.includes(row.state)) ? "generating" : "ready";
}
