import { describe, expect, it } from "vitest";
import type { RunKind, RunStatus } from "./queue";
import { activeRun, elapsedSeconds } from "./reconnect";

const ID = "2026-11-10-globex-backend-engineer";
const OTHER = "2026-11-12-initech-data-engineer";

const run = (runId: string, kind: RunKind, status: RunStatus, applicationId?: string) => ({
  runId,
  kind,
  status,
  applicationId,
});

describe("elapsedSeconds", () => {
  it("counts from the moment the run started, in whole seconds", () => {
    const startedAt = Date.UTC(2026, 10, 16, 10, 0, 0);
    expect(elapsedSeconds(startedAt, startedAt)).toBe(0);
    expect(elapsedSeconds(startedAt, startedAt + 999)).toBe(0);
    expect(elapsedSeconds(startedAt, startedAt + 125_400)).toBe(125);
  });

  it("is never negative when the two clocks disagree", () => {
    expect(elapsedSeconds(5_000, 2_000)).toBe(0);
  });
});

describe("activeRun", () => {
  it("finds the run that is working on the application", () => {
    const runs = [run("a", "new", "running", ID), run("b", "new", "queued")];
    expect(activeRun(runs, ID, "resume")?.runId).toBe("a");
  });

  it("finds a run that is waiting for the application", () => {
    const runs = [run("a", "new", "running"), run("b", "retry", "queued", ID)];
    expect(activeRun(runs, ID, "resume")?.runId).toBe("b");
  });

  it("prefers the running run, then the waiting run that starts first", () => {
    const runs = [run("a", "retry", "running", ID), run("b", "retry", "queued", ID), run("c", "retry", "queued", ID)];
    expect(activeRun(runs, ID, "resume")?.runId).toBe("a");
    expect(activeRun(runs.slice(1), ID, "resume")?.runId).toBe("b");
  });

  it("ignores runs that are over", () => {
    const runs = [run("a", "new", "done", ID), run("b", "retry", "failed", ID), run("c", "retry", "cancelled", ID)];
    expect(activeRun(runs, ID, "resume")).toBeNull();
  });

  it("ignores runs of other applications and runs without one yet", () => {
    const runs = [run("a", "retry", "running", OTHER), run("b", "new", "queued")];
    expect(activeRun(runs, ID, "resume")).toBeNull();
  });

  it('keeps "Verify again" apart from the runs that write the resume', () => {
    const runs = [run("a", "verify", "running", ID), run("b", "retry", "queued", ID)];
    expect(activeRun(runs, ID, "verification")?.runId).toBe("a");
    expect(activeRun(runs, ID, "resume")?.runId).toBe("b");
    expect(activeRun([runs[1]], ID, "verification")).toBeNull();
  });
});
