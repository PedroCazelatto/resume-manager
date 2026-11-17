import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmError, type LlmClient } from "@/core/llm";
import type { FetchedPosting } from "@/core/posting/job-fetcher";
import type { QueueEvent } from "@/core/runs/queue";
import { createRunRegistry, type AppRun, type ExecuteRun, type RunRegistry, type RunRequest } from "./runs";

const POSTING = "Globex is hiring a Backend Engineer.";
const posting = (text = POSTING): RunRequest => ({ start: { posting: text }, language: null });
const ID = "2026-11-10-globex-backend-engineer";

/** Lets each run be ended by hand, in any order. */
function manualRuns() {
  const started: AppRun[] = [];
  const ends = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const sends = new Map<string, Parameters<ExecuteRun>[1]>();
  const signals = new Map<string, AbortSignal>();
  const execute: ExecuteRun = (run, send, signal) => {
    started.push(run);
    sends.set(run.runId, send);
    signals.set(run.runId, signal);
    return new Promise((resolve, reject) => ends.set(run.runId, { resolve, reject }));
  };
  return { execute, started, ends, sends, signals };
}

/** Follows a run and resolves with every event it got, once the stream closes. */
function followed(registry: RunRegistry, profile: string, runId: string): Promise<QueueEvent[]> {
  return new Promise((resolve, reject) => {
    const events: QueueEvent[] = [];
    const stop = registry.follow(profile, runId, { event: (e) => events.push(e), close: () => resolve(events) });
    if (!stop) reject(new Error("unknown run"));
  });
}

/** A run whose model call hangs until the run's signal aborts it, like the Ollama client's. */
const untilCancelled: ExecuteRun = (_run, send, signal) =>
  new Promise((_, reject) => {
    send({ type: "step", step: "analyse", status: "running" });
    signal.addEventListener("abort", () => reject(new LlmError("cancelled", "The run was cancelled.")));
  });

/** Every run of these tests started at this moment. */
const STARTED = Date.UTC(2026, 10, 16, 10, 0, 0);
const STARTED_EVENT: QueueEvent = { type: "started", at: STARTED };

const statuses = (registry: RunRegistry, profile = "jane-doe") => registry.list(profile).map((run) => run.status);

describe("run registry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the first run and keeps the second waiting until the first ends", async () => {
    const { execute, started, ends } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);

    const first = registry.enqueue("jane-doe", "new", posting());
    const second = registry.enqueue("jane-doe", "retry", { start: { id: ID }, language: "pt" });

    expect(registry.list("jane-doe")).toEqual([
      { runId: first, kind: "new", status: "running", startedAt: STARTED, language: null, steps: [], warnings: {}, retryable: false, fetchFailed: false },
      {
        runId: second,
        kind: "retry",
        status: "queued",
        applicationId: ID,
        language: "pt",
        steps: [],
        warnings: {},
        retryable: false,
        fetchFailed: false,
      },
    ]);
    expect(started.map((run) => run.runId)).toEqual([first]);

    const ended = followed(registry, "jane-doe", first);
    ends.get(first)!.resolve();
    await ended;

    expect(started.map((run) => run.runId)).toEqual([first, second]);
    expect(registry.list("jane-doe").map((run) => [run.runId, run.status])).toEqual([
      [second, "running"],
      [first, "done"],
    ]);
  });

  it("never sends the model two calls at the same time, across profiles", async () => {
    let active = 0;
    let most = 0;
    let calls = 0;
    const llm: LlmClient = {
      model: "fake-model",
      contextTokens: 1_000_000,
      async generate(request) {
        calls += 1;
        active += 1;
        most = Math.max(most, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return request.schema.parse({});
      },
    };
    const request = { system: "", prompt: "", schema: z.object({}), temperature: 0 };
    // Every run calls the model three times, like the pipeline's steps.
    const registry = createRunRegistry(async () => {
      for (let step = 0; step < 3; step++) await llm.generate(request);
    });

    const runs = [
      ["jane-doe", registry.enqueue("jane-doe", "new", posting())],
      ["john-roe", registry.enqueue("john-roe", "new", posting())],
      ["jane-doe", registry.enqueue("jane-doe", "verify", { start: { id: ID }, language: null })],
      ["john-roe", registry.enqueue("john-roe", "retry", { start: { id: ID }, language: null })],
    ];
    await Promise.all(runs.map(([profile, runId]) => followed(registry, profile, runId)));

    expect(calls).toBe(12);
    expect(most).toBe(1);
    expect([...statuses(registry), ...statuses(registry, "john-roe")]).toEqual(["done", "done", "done", "done"]);
  });

  it("replays a run's events to a stream opened at any time, then follows", async () => {
    const { execute, ends, sends } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);
    const blocker = registry.enqueue("jane-doe", "new", posting());
    const runId = registry.enqueue("jane-doe", "new", posting());

    const fromTheQueue = followed(registry, "jane-doe", runId);
    ends.get(blocker)!.resolve();
    await followed(registry, "jane-doe", blocker);
    const send = sends.get(runId)!;
    send({ type: "step", step: "analyse", status: "running" });
    send({ type: "progress", step: "analyse", phase: "thinking", tokens: 5 });
    send({ type: "progress", step: "analyse", phase: "thinking", tokens: 9 });
    const fromTheMiddle = followed(registry, "jane-doe", runId);
    send({ type: "step", step: "analyse", status: "done" });
    send({ type: "saved", id: ID });
    send({ type: "done", id: ID });
    ends.get(runId)!.resolve();

    const replayed: QueueEvent[] = [
      STARTED_EVENT,
      { type: "step", step: "analyse", status: "running" },
      { type: "progress", step: "analyse", phase: "thinking", tokens: 9 },
      { type: "step", step: "analyse", status: "done" },
      { type: "saved", id: ID },
      { type: "done", id: ID },
    ];
    // Whoever was following got every progress event; a replay only has the latest.
    expect(await fromTheQueue).toEqual([
      ...replayed.slice(0, 2),
      { type: "progress", step: "analyse", phase: "thinking", tokens: 5 },
      ...replayed.slice(2),
    ]);
    expect(await fromTheMiddle).toEqual(replayed);
    expect(await followed(registry, "jane-doe", runId)).toEqual(replayed);
    expect(await followed(registry, "jane-doe", runId)).toEqual(replayed);
    expect(registry.list("jane-doe")[0]).toMatchObject({ runId, status: "done", applicationId: ID });
  });

  it("tells when a run started, in the list and to a stream opened later, so a reloaded page counts from there (F39)", async () => {
    const { execute, ends, sends } = manualRuns();
    let clock = STARTED;
    const registry = createRunRegistry(execute, undefined, () => clock);
    const first = registry.enqueue("jane-doe", "new", posting());
    const second = registry.enqueue("jane-doe", "new", posting());
    sends.get(first)!({ type: "step", step: "analyse", status: "running" });
    sends.get(first)!({ type: "progress", step: "analyse", phase: "writing", tokens: 120 });

    // The page is opened two minutes into the first run; the second one is still waiting.
    clock = STARTED + 120_000;
    expect(registry.list("jane-doe").map((run) => [run.runId, run.startedAt])).toEqual([
      [first, STARTED],
      [second, undefined],
    ]);
    expect(registry.list("jane-doe")[0].steps).toEqual([{ step: "analyse", status: "running" }]);
    const late: QueueEvent[] = [];
    registry.follow("jane-doe", first, { event: (e) => late.push(e), close: () => {} });
    expect(late).toEqual([
      { type: "started", at: STARTED },
      { type: "step", step: "analyse", status: "running" },
      { type: "progress", step: "analyse", phase: "writing", tokens: 120 },
    ]);

    // The second run starts when its turn comes, not when it was queued, and keeps that time after it ends.
    ends.get(first)!.resolve();
    await followed(registry, "jane-doe", first);
    ends.get(second)!.resolve();
    expect((await followed(registry, "jane-doe", second))[0]).toEqual({ type: "started", at: STARTED + 120_000 });
    expect(registry.list("jane-doe").map((run) => [run.runId, run.startedAt])).toEqual([
      [second, STARTED + 120_000],
      [first, STARTED],
    ]);
  });

  it("stops sending events to a stream that was closed", async () => {
    const { execute, sends } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);
    const runId = registry.enqueue("jane-doe", "new", posting());
    const events: QueueEvent[] = [];

    const stop = registry.follow("jane-doe", runId, { event: (e) => events.push(e), close: () => {} });
    stop!();
    sends.get(runId)!({ type: "step", step: "analyse", status: "running" });

    expect(events).toEqual([STARTED_EVENT]);
  });

  it("ends a failed run with its error and starts the next one", async () => {
    const { execute, started, ends } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);
    const first = registry.enqueue("jane-doe", "new", posting());
    const second = registry.enqueue("jane-doe", "new", posting());

    const events = followed(registry, "jane-doe", first);
    ends.get(first)!.reject(new Error("Can't reach Ollama."));

    expect(await events).toEqual([STARTED_EVENT, { type: "error", message: "Can't reach Ollama." }]);
    expect(registry.list("jane-doe")).toMatchObject([
      { runId: second, status: "running" },
      { runId: first, status: "failed", error: "Can't reach Ollama." },
    ]);
    expect(started).toHaveLength(2);
  });

  it("never shows, streams or removes another profile's run (Art. III.7)", () => {
    const { execute } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);
    registry.enqueue("jane-doe", "new", posting());
    const waiting = registry.enqueue("jane-doe", "new", posting());

    expect(registry.list("john-roe")).toEqual([]);
    expect(registry.follow("john-roe", waiting, { event: () => {}, close: () => {} })).toBeNull();
    expect(registry.remove("john-roe", waiting)).toBe("unknown");
    expect(statuses(registry)).toEqual(["running", "queued"]);
  });

  it("removes a waiting run, which then never starts", async () => {
    const { execute, started, ends } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);
    const first = registry.enqueue("jane-doe", "new", posting());
    const second = registry.enqueue("jane-doe", "new", posting());
    const third = registry.enqueue("jane-doe", "new", posting());
    const events = followed(registry, "jane-doe", second);

    expect(registry.remove("jane-doe", second)).toBe("removed");

    expect(await events).toEqual([{ type: "removed" }]);
    expect(registry.list("jane-doe").map((run) => run.runId)).toEqual([first, third]);
    expect(registry.follow("jane-doe", second, { event: () => {}, close: () => {} })).toBeNull();

    const ended = followed(registry, "jane-doe", first);
    ends.get(first)!.resolve();
    await ended;
    expect(started.map((run) => run.runId)).toEqual([first, third]);
  });

  it("doesn't remove a run that has ended or that it doesn't know", async () => {
    const { execute, ends } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);
    const runId = registry.enqueue("jane-doe", "new", posting());

    const ended = followed(registry, "jane-doe", runId);
    ends.get(runId)!.resolve();
    await ended;
    expect(registry.remove("jane-doe", runId)).toBe("ended");
    expect(registry.remove("jane-doe", "no-such-run")).toBe("unknown");
    expect(statuses(registry)).toEqual(["done"]);
  });

  describe("cancelling the running run (F32)", () => {
    it("aborts the run's signal, ends it as cancelled and starts the next one", async () => {
      const started: string[] = [];
      const registry = createRunRegistry((run, send, signal) => {
        started.push(run.runId);
        return untilCancelled(run, send, signal);
      }, undefined, () => STARTED);
      const first = registry.enqueue("jane-doe", "new", posting());
      const second = registry.enqueue("jane-doe", "new", posting());
      const events = followed(registry, "jane-doe", first);

      expect(registry.remove("jane-doe", first)).toBe("cancelling");

      // Cancelling is not an error: no error event, no error in the list.
      expect(await events).toEqual([
        STARTED_EVENT,
        { type: "step", step: "analyse", status: "running" },
        { type: "cancelled" },
      ]);
      expect(registry.list("jane-doe")).toMatchObject([
        { runId: second, status: "running" },
        { runId: first, status: "cancelled", error: undefined },
      ]);
      expect(started).toEqual([first, second]);
      expect(await followed(registry, "jane-doe", first)).toContainEqual({ type: "cancelled" });
      expect(registry.remove("jane-doe", first)).toBe("ended");
    });

    it("keeps the next run waiting until the cancelled one has really stopped", async () => {
      const { execute, started, ends, signals } = manualRuns();
      const registry = createRunRegistry(execute, undefined, () => STARTED);
      const first = registry.enqueue("jane-doe", "new", posting());
      registry.enqueue("jane-doe", "new", posting());

      expect(registry.remove("jane-doe", first)).toBe("cancelling");
      expect(signals.get(first)!.aborted).toBe(true);
      expect(statuses(registry)).toEqual(["running", "queued"]);
      expect(started).toHaveLength(1);

      const ended = followed(registry, "jane-doe", first);
      ends.get(first)!.reject(new LlmError("cancelled", "The run was cancelled."));
      await ended;
      expect(statuses(registry)).toEqual(["running", "cancelled"]);
      expect(started).toHaveLength(2);
    });

    it("keeps the application of a cancelled run, so it can be tried again", async () => {
      const registry = createRunRegistry((run, send, signal) => {
        send({ type: "saved", id: ID });
        return untilCancelled(run, send, signal);
      });
      const runId = registry.enqueue("jane-doe", "new", posting());
      const events = followed(registry, "jane-doe", runId);

      registry.remove("jane-doe", runId);
      await events;

      expect(registry.list("jane-doe")).toMatchObject([{ runId, status: "cancelled", applicationId: ID }]);
    });

    it("finishes a run that got to its end although it was cancelled", async () => {
      const { execute, ends } = manualRuns();
      const registry = createRunRegistry(execute, undefined, () => STARTED);
      const runId = registry.enqueue("jane-doe", "new", posting());
      const ended = followed(registry, "jane-doe", runId);

      registry.remove("jane-doe", runId);
      ends.get(runId)!.resolve();
      await ended;

      expect(statuses(registry)).toEqual(["done"]);
    });

    it("doesn't cancel another profile's run (Art. III.7)", () => {
      const { execute, signals } = manualRuns();
      const registry = createRunRegistry(execute, undefined, () => STARTED);
      const runId = registry.enqueue("jane-doe", "new", posting());

      expect(registry.remove("john-roe", runId)).toBe("unknown");
      expect(signals.get(runId)!.aborted).toBe(false);
      expect(statuses(registry)).toEqual(["running"]);
    });
  });

  it("keeps the steps and the context warning of a run that ended, for as long as it is listed", async () => {
    const { execute, ends, sends } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);
    const warning = "This step's prompt is about 8193 tokens.";
    const steps = [
      { step: "analyse", status: "done" },
      { step: "save", status: "running" },
    ];

    for (const end of ["resolve", "reject"] as const) {
      const runId = registry.enqueue("jane-doe", "new", posting());
      const ended = followed(registry, "jane-doe", runId);
      const send = sends.get(runId)!;
      send({ type: "step", step: "analyse", status: "running" });
      send({ type: "warning", step: "analyse", message: warning });
      send({ type: "step", step: "analyse", status: "done" });
      send({ type: "step", step: "save", status: "running" });
      expect(registry.list("jane-doe")[0]).toMatchObject({ runId, status: "running", steps, warnings: { analyse: warning } });

      ends.get(runId)![end](new Error("The model took too long."));
      await ended;
      expect(registry.list("jane-doe")[0]).toMatchObject({
        runId,
        status: end === "resolve" ? "done" : "failed",
        steps,
        warnings: { analyse: warning },
      });
    }
  });

  describe("trying a run without an application again (F19)", () => {
    /** A new run in German that failed before its application was saved. */
    async function failedRun() {
      const runs = manualRuns();
      const registry = createRunRegistry(runs.execute, undefined, () => STARTED);
      const runId = registry.enqueue("jane-doe", "new", { start: { posting: POSTING }, language: "de" });
      const ended = followed(registry, "jane-doe", runId);
      runs.ends.get(runId)!.reject(new Error("Can't reach Ollama."));
      await ended;
      return { ...runs, registry, runId };
    }

    it("queues a new run with the same posting and language", async () => {
      const { registry, runId, started } = await failedRun();
      expect(registry.list("jane-doe")).toMatchObject([{ runId, status: "failed", retryable: true }]);

      const again = registry.retry("jane-doe", runId);

      if (typeof again === "string") throw new Error(again);
      expect(again.runId).not.toBe(runId);
      expect(registry.list("jane-doe")).toMatchObject([
        { runId: again.runId, kind: "new", status: "running", language: "de", retryable: false },
        { runId, status: "failed", language: "de", retryable: true },
      ]);
      expect(started[1]).toMatchObject({ runId: again.runId, input: { start: { posting: POSTING }, language: "de" } });
      // The posting stays on the server (Art. III.4).
      expect(JSON.stringify(registry.list("jane-doe"))).not.toContain(POSTING);
    });

    it("tries a run again that was cancelled in its first step", async () => {
      const registry = createRunRegistry(untilCancelled, undefined, () => STARTED);
      const runId = registry.enqueue("jane-doe", "new", posting());
      const events = followed(registry, "jane-doe", runId);
      registry.remove("jane-doe", runId);
      await events;

      expect(registry.list("jane-doe")).toMatchObject([{ runId, status: "cancelled", retryable: true }]);
      expect(registry.retry("jane-doe", runId)).toEqual({ runId: expect.any(String) });
      expect(statuses(registry)).toEqual(["running", "cancelled"]);
    });

    it("refuses a run that has an application, is still waiting or running, or finished", async () => {
      const { execute, ends, sends } = manualRuns();
      const registry = createRunRegistry(execute, undefined, () => STARTED);
      const saved = registry.enqueue("jane-doe", "new", posting());
      const finished = registry.enqueue("jane-doe", "new", posting());
      const running = registry.enqueue("jane-doe", "new", posting());
      const waiting = registry.enqueue("jane-doe", "new", posting());

      let ended = followed(registry, "jane-doe", saved);
      sends.get(saved)!({ type: "saved", id: ID });
      ends.get(saved)!.reject(new Error("The model took too long."));
      await ended;
      ended = followed(registry, "jane-doe", finished);
      ends.get(finished)!.resolve();
      await ended;

      for (const runId of [saved, finished, running, waiting]) expect(registry.retry("jane-doe", runId)).toBe("refused");
      expect(registry.retry("jane-doe", "no-such-run")).toBe("unknown");
      expect(registry.list("jane-doe").map((run) => run.retryable)).toEqual([false, false, false, false]);
    });

    it("never tries another profile's run again (Art. III.7)", async () => {
      const { registry, runId } = await failedRun();

      expect(registry.retry("john-roe", runId)).toBe("unknown");
      expect(registry.list("john-roe")).toEqual([]);
      expect(statuses(registry)).toEqual(["failed"]);
    });

    it("logs nothing (Art. III.4)", async () => {
      const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => {}),
      );
      const { registry, runId } = await failedRun();

      registry.retry("jane-doe", runId);

      for (const log of logs) expect(log).not.toHaveBeenCalled();
    });
  });

  describe("a run started from a link (F10)", () => {
    const LINK = "https://jobs.example.com/backend-engineer";
    const PAGE = "https://jobs.example.com/backend-engineer?from=redirect";
    const link = (url = LINK, language: string | null = "de"): RunRequest => ({ start: { url }, language });
    const fetched: FetchedPosting = { ok: true, text: POSTING, url: PAGE };
    const refused: FetchedPosting = { ok: false, reason: "The page answered 403." };

    /** Lets each fetch be answered by hand. */
    function manualFetches() {
      const asked: string[] = [];
      const answers = new Map<string, (result: FetchedPosting) => void>();
      const signals = new Map<string, AbortSignal>();
      const fetchPosting = (url: string, signal?: AbortSignal) => {
        asked.push(url);
        if (signal) signals.set(url, signal);
        return new Promise<FetchedPosting>((resolve) => answers.set(url, resolve));
      };
      return { fetchPosting, asked, answers, signals };
    }

    /** Lets the registry act on an answered fetch. */
    const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

    it("fetches the posting at once, while another run is using the model", async () => {
      const { execute, started } = manualRuns();
      const { fetchPosting, asked, answers } = manualFetches();
      const registry = createRunRegistry(execute, fetchPosting, () => STARTED);
      const busy = registry.enqueue("jane-doe", "new", posting());

      const runId = registry.enqueue("jane-doe", "new", link());

      expect(asked).toEqual([LINK]);
      expect(registry.list("jane-doe")).toEqual([
        { runId: busy, kind: "new", status: "running", startedAt: STARTED, language: null, steps: [], warnings: {}, retryable: false, fetchFailed: false },
        {
          runId,
          kind: "new",
          status: "fetching",
          language: "de",
          steps: [{ step: "fetch", status: "running" }],
          warnings: {},
          retryable: false,
          url: LINK,
          fetchFailed: false,
        },
      ]);

      answers.get(LINK)!(fetched);
      await settled();

      // It waits its turn for the model like a pasted posting.
      expect(registry.list("jane-doe")[1]).toMatchObject({ runId, status: "queued", steps: [{ step: "fetch", status: "done" }], url: PAGE });
      expect(started.map((run) => run.runId)).toEqual([busy]);
    });

    it("joins the run queue with the fetched posting once the fetch worked, and starts by itself", async () => {
      const { execute, started } = manualRuns();
      const { fetchPosting, answers } = manualFetches();
      const registry = createRunRegistry(execute, fetchPosting);
      const runId = registry.enqueue("jane-doe", "new", link());
      expect(started).toEqual([]);

      answers.get(LINK)!(fetched);
      await settled();

      expect(started.map((run) => run.runId)).toEqual([runId]);
      expect(started[0].input).toEqual({ start: { posting: POSTING, url: PAGE, fetched: true }, language: "de" });
      expect(statuses(registry)).toEqual(["running"]);
      expect(JSON.stringify(registry.list("jane-doe"))).not.toContain(POSTING);
    });

    it("joins the run queue behind the runs that were already waiting when its fetch ended", async () => {
      const { execute } = manualRuns();
      const { fetchPosting, answers } = manualFetches();
      const registry = createRunRegistry(execute, fetchPosting);
      const busy = registry.enqueue("jane-doe", "new", posting());
      const fromLink = registry.enqueue("jane-doe", "new", link());
      const pasted = registry.enqueue("jane-doe", "new", posting());

      answers.get(LINK)!(fetched);
      await settled();

      expect(registry.list("jane-doe").map((run) => [run.runId, run.status])).toEqual([
        [busy, "running"],
        [pasted, "queued"],
        [fromLink, "queued"],
      ]);
    });

    it("fetches one link at a time, in the order given", async () => {
      const { execute } = manualRuns();
      const { fetchPosting, asked, answers } = manualFetches();
      const registry = createRunRegistry(execute, fetchPosting);
      const first = registry.enqueue("jane-doe", "new", link("https://jobs.example.com/1"));
      const second = registry.enqueue("john-roe", "new", link("https://jobs.example.com/2"));

      expect(asked).toEqual(["https://jobs.example.com/1"]);
      expect(registry.list("john-roe")).toMatchObject([{ runId: second, status: "fetching", steps: [] }]);

      answers.get("https://jobs.example.com/1")!(refused);
      await settled();

      expect(asked).toEqual(["https://jobs.example.com/1", "https://jobs.example.com/2"]);
      expect(registry.list("jane-doe")).toMatchObject([{ runId: first, status: "failed" }]);
      expect(registry.list("john-roe")).toMatchObject([{ runId: second, steps: [{ step: "fetch", status: "running" }] }]);
    });

    /** A link run whose fetch failed. */
    async function failedFetch() {
      const runs = manualRuns();
      const fetches = manualFetches();
      const registry = createRunRegistry(runs.execute, fetches.fetchPosting);
      const runId = registry.enqueue("jane-doe", "new", link());
      const ended = followed(registry, "jane-doe", runId);
      fetches.answers.get(LINK)!(refused);
      const events = await ended;
      return { registry, runId, events, ...runs, ...fetches };
    }

    it("never reaches the model when its fetch failed, and is listed as needing the posting's text", async () => {
      const { registry, runId, events, started } = await failedFetch();

      expect(started).toEqual([]);
      expect(events).toEqual([
        { type: "step", step: "fetch", status: "running" },
        { type: "error", message: "The page answered 403." },
      ]);
      expect(registry.list("jane-doe")).toEqual([
        {
          runId,
          kind: "new",
          status: "failed",
          error: "The page answered 403.",
          language: "de",
          steps: [{ step: "fetch", status: "running" }],
          warnings: {},
          retryable: true,
          url: LINK,
          fetchFailed: true,
        },
      ]);
    });

    it("fails a fetch that throws or returns more text than a posting may have", async () => {
      const { execute, started } = manualRuns();
      const throwing = createRunRegistry(execute, async () => {
        throw new Error("boom");
      });
      throwing.enqueue("jane-doe", "new", link());
      const tooLong = createRunRegistry(execute, async () => ({ ok: true, text: "x".repeat(50_001), url: PAGE }));
      tooLong.enqueue("jane-doe", "new", link());
      await settled();

      expect(throwing.list("jane-doe")[0]).toMatchObject({ status: "failed", fetchFailed: true, error: "Something went wrong while fetching the posting." });
      expect(tooLong.list("jane-doe")[0]).toMatchObject({ status: "failed", fetchFailed: true, error: expect.stringContaining("longer than 50000") });
      expect(started).toEqual([]);
    });

    it("puts the pasted text in the run queue in place of the run whose fetch failed", async () => {
      const { registry, runId, started } = await failedFetch();

      const pasted = registry.enqueue("jane-doe", "new", { start: { posting: POSTING, url: LINK }, language: "de" }, runId);

      expect(registry.list("jane-doe").map((run) => [run.runId, run.status, run.url])).toEqual([[pasted, "running", LINK]]);
      expect(started.at(-1)!.input).toEqual({ start: { posting: POSTING, url: LINK }, language: "de" });
    });

    it("only replaces a run of the same profile whose fetch failed", async () => {
      const { registry, runId } = await failedFetch();
      const other = registry.enqueue("jane-doe", "new", posting());

      registry.enqueue("john-roe", "new", posting(), runId);
      registry.enqueue("jane-doe", "new", posting(), other);

      expect(registry.list("jane-doe").map((run) => run.runId)).toContain(runId);
      expect(registry.list("jane-doe").map((run) => run.runId)).toContain(other);
    });

    it("fetches the same link again on Try again", async () => {
      const { registry, runId, asked } = await failedFetch();

      const again = registry.retry("jane-doe", runId);

      expect(again).not.toBe("refused");
      expect(asked).toEqual([LINK, LINK]);
      expect(statuses(registry)).toEqual(["fetching", "failed"]);
    });

    it("removes a run while its posting is fetched, stopping the fetch, and it never starts", async () => {
      const { execute, started } = manualRuns();
      const { fetchPosting, answers, signals, asked } = manualFetches();
      const registry = createRunRegistry(execute, fetchPosting);
      const runId = registry.enqueue("jane-doe", "new", link());
      const next = registry.enqueue("jane-doe", "new", link("https://jobs.example.com/2"));
      const events = followed(registry, "jane-doe", runId);

      expect(registry.remove("john-roe", runId)).toBe("unknown");
      expect(registry.remove("jane-doe", runId)).toBe("removed");

      expect(signals.get(LINK)!.aborted).toBe(true);
      expect((await events).at(-1)).toEqual({ type: "removed" });
      // The fetcher answers a stopped fetch like a failed one; the run is gone all the same.
      answers.get(LINK)!({ ok: false, reason: "The run was cancelled." });
      await settled();
      expect(registry.list("jane-doe").map((run) => run.runId)).toEqual([next]);
      expect(asked).toEqual([LINK, "https://jobs.example.com/2"]);
      expect(started).toEqual([]);
    });

    it("removes a run that waits behind another fetch without stopping that fetch", () => {
      const { execute } = manualRuns();
      const { fetchPosting, signals } = manualFetches();
      const registry = createRunRegistry(execute, fetchPosting);
      registry.enqueue("jane-doe", "new", link());
      const waiting = registry.enqueue("jane-doe", "new", link("https://jobs.example.com/2"));

      expect(registry.remove("jane-doe", waiting)).toBe("removed");

      expect(signals.get(LINK)!.aborted).toBe(false);
      expect(statuses(registry)).toEqual(["fetching"]);
    });

    it("doesn't ask for pasted text when the run failed after its fetch, and tries again without fetching", async () => {
      const { execute, ends, started } = manualRuns();
      const { fetchPosting, answers, asked } = manualFetches();
      const registry = createRunRegistry(execute, fetchPosting);
      const runId = registry.enqueue("jane-doe", "new", link());
      answers.get(LINK)!(fetched);
      await settled();
      const ended = followed(registry, "jane-doe", runId);
      ends.get(runId)!.reject(new Error("Can't reach Ollama."));
      await ended;

      expect(registry.list("jane-doe")[0]).toMatchObject({ url: PAGE, fetchFailed: false, retryable: true });

      registry.retry("jane-doe", runId);
      expect(asked).toEqual([LINK]);
      expect(started.at(-1)!.input).toEqual({ start: { posting: POSTING, url: PAGE, fetched: true }, language: "de" });
    });

    it("lists the link kept with a pasted posting, never the posting", () => {
      const { execute } = manualRuns();
      const registry = createRunRegistry(execute);
      registry.enqueue("jane-doe", "new", { start: { posting: POSTING, url: LINK }, language: null });

      expect(registry.list("jane-doe")[0]).toMatchObject({ url: LINK, fetchFailed: false });
      expect(JSON.stringify(registry.list("jane-doe"))).not.toContain(POSTING);
    });

    it("logs nothing, and neither lists nor streams the fetched posting (Art. III.4)", async () => {
      const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
      const { execute, ends } = manualRuns();
      const { fetchPosting, answers } = manualFetches();
      const registry = createRunRegistry(execute, fetchPosting);
      const runId = registry.enqueue("jane-doe", "new", link());
      const ended = followed(registry, "jane-doe", runId);
      answers.get(LINK)!(fetched);
      await settled();
      ends.get(runId)!.reject(new Error("The model took too long."));
      const events = await ended;

      for (const log of logs) expect(log).not.toHaveBeenCalled();
      expect(JSON.stringify([registry.list("jane-doe"), events])).not.toContain(POSTING);
    });
  });

  it("never logs the posting a run holds (Art. III.4)", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { execute, ends } = manualRuns();
    const registry = createRunRegistry(execute, undefined, () => STARTED);
    const failing = registry.enqueue("jane-doe", "new", posting());
    const waiting = registry.enqueue("jane-doe", "new", posting());
    const removed = registry.enqueue("jane-doe", "new", posting());

    registry.remove("jane-doe", removed);
    const failed = followed(registry, "jane-doe", failing);
    ends.get(failing)!.reject(new Error("The model took too long."));
    const events = await failed;
    const done = followed(registry, "jane-doe", waiting);
    ends.get(waiting)!.resolve();
    await done;

    for (const log of logs) expect(log).not.toHaveBeenCalled();
    // The posting isn't in what the list or the stream hand out either.
    expect(JSON.stringify([registry.list("jane-doe"), events])).not.toContain(POSTING);
  });
});
