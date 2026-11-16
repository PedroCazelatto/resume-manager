import { describe, expect, it } from "vitest";
import { endedRuns, noticeTabTitle, runNotice } from "./notice";
import type { RunStatus } from "./queue";

describe("runNotice", () => {
  it("says the resume is ready, with the company and role", () => {
    expect(runNotice({ status: "done", company: "Globex", role: "Backend Engineer" })).toEqual({
      title: "Resume ready",
      body: "Globex · Backend Engineer",
      tab: "Done",
    });
  });

  it("says the run failed, with the company and role", () => {
    expect(runNotice({ status: "failed", company: "Globex", role: "Backend Engineer" })).toEqual({
      title: "Run failed",
      body: "Globex · Backend Engineer",
      tab: "Failed",
    });
  });

  it("has no body while the company and role aren't known", () => {
    expect(runNotice({ status: "failed" })).toEqual({ title: "Run failed", tab: "Failed" });
    expect(runNotice({ status: "done", company: "", role: "" })).toEqual({ title: "Resume ready", tab: "Done" });
  });

  it("has nothing to tell about a run the user cancelled (F32)", () => {
    expect(runNotice({ status: "cancelled", company: "Globex", role: "Backend Engineer" })).toBeNull();
  });

  it("has nothing to tell about a run that hasn't ended", () => {
    expect(runNotice({ status: "queued" })).toBeNull();
    expect(runNotice({ status: "running", company: "Globex", role: "Backend Engineer" })).toBeNull();
  });
});

describe("noticeTabTitle", () => {
  it("starts the tab title with Done or Failed", () => {
    expect(noticeTabTitle({ title: "Resume ready", tab: "Done" }, "Resume Manager")).toBe("Done · Resume Manager");
    expect(noticeTabTitle({ title: "Run failed", tab: "Failed" }, "Resume Manager")).toBe("Failed · Resume Manager");
  });
});

describe("endedRuns", () => {
  const run = (runId: string, status: RunStatus) => ({ runId, status });

  it("returns a run once it is over, after it was seen waiting or running", () => {
    const first = endedRuns(new Set(), [run("a", "running"), run("b", "queued")]);
    expect(first.ended).toEqual([]);
    expect([...first.watched]).toEqual(["a", "b"]);

    const second = endedRuns(first.watched, [run("b", "running"), run("a", "done")]);
    expect(second.ended).toEqual([run("a", "done")]);
    expect([...second.watched]).toEqual(["b"]);
  });

  it("returns each run only once", () => {
    const seen = endedRuns(new Set(["a"]), [run("a", "failed")]);
    expect(seen.ended).toEqual([run("a", "failed")]);
    expect(endedRuns(seen.watched, [run("a", "failed")]).ended).toEqual([]);
  });

  it("never returns a run that was already over when the tab first saw it", () => {
    const { watched, ended } = endedRuns(new Set(), [run("a", "done"), run("b", "failed"), run("c", "cancelled")]);
    expect(ended).toEqual([]);
    expect(watched.size).toBe(0);
  });

  it("returns a run this tab queued even if it ended before the list showed it waiting", () => {
    expect(endedRuns(new Set(["a"]), [run("a", "failed")]).ended).toEqual([run("a", "failed")]);
  });

  it("returns a cancelled run too, so it is no longer watched", () => {
    const { watched, ended } = endedRuns(new Set(["a"]), [run("a", "cancelled")]);
    expect(ended).toEqual([run("a", "cancelled")]);
    expect(watched.size).toBe(0);
  });

  it("keeps watching a run the list doesn't show, and leaves the given set alone", () => {
    const before = new Set(["a"]);
    const { watched, ended } = endedRuns(before, [run("b", "queued")]);
    expect(ended).toEqual([]);
    expect([...watched]).toEqual(["a", "b"]);
    expect([...before]).toEqual(["a"]);
  });
});
