import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmError, type LlmClient } from "@/core/llm";
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

const statuses = (registry: RunRegistry, profile = "jane-doe") => registry.list(profile).map((run) => run.status);

describe("run registry", () => {
  afterEach(() => vi.restoreAllMocks());

  it("runs the first run and keeps the second waiting until the first ends", async () => {
    const { execute, started, ends } = manualRuns();
    const registry = createRunRegistry(execute);

    const first = registry.enqueue("jane-doe", "new", posting());
    const second = registry.enqueue("jane-doe", "retry", { start: { id: ID }, language: "pt" });

    expect(registry.list("jane-doe")).toEqual([
      { runId: first, kind: "new", status: "running", applicationId: undefined, error: undefined, language: null },
      { runId: second, kind: "retry", status: "queued", applicationId: ID, error: undefined, language: "pt" },
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
    const registry = createRunRegistry(execute);
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
      { type: "started" },
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

  it("stops sending events to a stream that was closed", async () => {
    const { execute, sends } = manualRuns();
    const registry = createRunRegistry(execute);
    const runId = registry.enqueue("jane-doe", "new", posting());
    const events: QueueEvent[] = [];

    const stop = registry.follow("jane-doe", runId, { event: (e) => events.push(e), close: () => {} });
    stop!();
    sends.get(runId)!({ type: "step", step: "analyse", status: "running" });

    expect(events).toEqual([{ type: "started" }]);
  });

  it("ends a failed run with its error and starts the next one", async () => {
    const { execute, started, ends } = manualRuns();
    const registry = createRunRegistry(execute);
    const first = registry.enqueue("jane-doe", "new", posting());
    const second = registry.enqueue("jane-doe", "new", posting());

    const events = followed(registry, "jane-doe", first);
    ends.get(first)!.reject(new Error("Can't reach Ollama."));

    expect(await events).toEqual([{ type: "started" }, { type: "error", message: "Can't reach Ollama." }]);
    expect(registry.list("jane-doe")).toMatchObject([
      { runId: second, status: "running" },
      { runId: first, status: "failed", error: "Can't reach Ollama." },
    ]);
    expect(started).toHaveLength(2);
  });

  it("never shows, streams or removes another profile's run (Art. III.7)", () => {
    const { execute } = manualRuns();
    const registry = createRunRegistry(execute);
    registry.enqueue("jane-doe", "new", posting());
    const waiting = registry.enqueue("jane-doe", "new", posting());

    expect(registry.list("john-roe")).toEqual([]);
    expect(registry.follow("john-roe", waiting, { event: () => {}, close: () => {} })).toBeNull();
    expect(registry.remove("john-roe", waiting)).toBe("unknown");
    expect(statuses(registry)).toEqual(["running", "queued"]);
  });

  it("removes a waiting run, which then never starts", async () => {
    const { execute, started, ends } = manualRuns();
    const registry = createRunRegistry(execute);
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
    const registry = createRunRegistry(execute);
    const runId = registry.enqueue("jane-doe", "new", posting());

    const ended = followed(registry, "jane-doe", runId);
    ends.get(runId)!.resolve();
    await ended;
    expect(registry.remove("jane-doe", runId)).toBe("ended");
    expect(registry.remove("jane-doe", "no-such-run")).toBe("unknown");
    expect(statuses(registry)).toEqual(["done"]);
  });

  describe("cancelling the running run (F32)", () => {
    /** A run whose model call hangs until the run's signal aborts it, like the Ollama client's. */
    const untilCancelled: ExecuteRun = (_run, send, signal) =>
      new Promise((_, reject) => {
        send({ type: "step", step: "analyse", status: "running" });
        signal.addEventListener("abort", () => reject(new LlmError("cancelled", "The run was cancelled.")));
      });

    it("aborts the run's signal, ends it as cancelled and starts the next one", async () => {
      const started: string[] = [];
      const registry = createRunRegistry((run, send, signal) => {
        started.push(run.runId);
        return untilCancelled(run, send, signal);
      });
      const first = registry.enqueue("jane-doe", "new", posting());
      const second = registry.enqueue("jane-doe", "new", posting());
      const events = followed(registry, "jane-doe", first);

      expect(registry.remove("jane-doe", first)).toBe("cancelling");

      // Cancelling is not an error: no error event, no error in the list.
      expect(await events).toEqual([
        { type: "started" },
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
      const registry = createRunRegistry(execute);
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
      const registry = createRunRegistry(execute);
      const runId = registry.enqueue("jane-doe", "new", posting());
      const ended = followed(registry, "jane-doe", runId);

      registry.remove("jane-doe", runId);
      ends.get(runId)!.resolve();
      await ended;

      expect(statuses(registry)).toEqual(["done"]);
    });

    it("doesn't cancel another profile's run (Art. III.7)", () => {
      const { execute, signals } = manualRuns();
      const registry = createRunRegistry(execute);
      const runId = registry.enqueue("jane-doe", "new", posting());

      expect(registry.remove("john-roe", runId)).toBe("unknown");
      expect(signals.get(runId)!.aborted).toBe(false);
      expect(statuses(registry)).toEqual(["running"]);
    });
  });

  it("never logs the posting a run holds (Art. III.4)", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const { execute, ends } = manualRuns();
    const registry = createRunRegistry(execute);
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
