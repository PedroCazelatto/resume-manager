import { describe, expect, it } from "vitest";
import { endedRuns, noticeTabTitle, runNotice, showsNotification } from "./notice";
import type { RunStatus } from "./queue";

describe("runNotice", () => {
  it("says the resume is ready, with the company and title", () => {
    expect(runNotice({ kind: "new", status: "done", company: "Globex", title: "Backend Engineer" })).toEqual({
      title: "Resume ready",
      body: "Globex · Backend Engineer",
      tab: "Done",
    });
  });

  it("says the run failed, with the company and title", () => {
    expect(runNotice({ kind: "new", status: "failed", company: "Globex", title: "Backend Engineer" })).toEqual({
      title: "Run failed",
      body: "Globex · Backend Engineer",
      tab: "Failed",
    });
  });

  it("has no body while the company and title aren't known", () => {
    expect(runNotice({ kind: "new", status: "failed" })).toEqual({ title: "Run failed", tab: "Failed" });
    expect(runNotice({ kind: "new", status: "done", company: "", title: "" })).toEqual({ title: "Resume ready", tab: "Done" });
  });

  it("says the same for \"Try again\" as for a new run", () => {
    expect(runNotice({ kind: "retry", status: "done" })).toEqual({ title: "Resume ready", tab: "Done" });
    expect(runNotice({ kind: "retry", status: "failed" })).toEqual({ title: "Run failed", tab: "Failed" });
  });

  it("has its own words for \"Verify again\"", () => {
    expect(runNotice({ kind: "verify", status: "done", company: "Globex", title: "Backend Engineer" })).toEqual({
      title: "Verification finished",
      body: "Globex · Backend Engineer",
      tab: "Done",
    });
    expect(runNotice({ kind: "verify", status: "failed" })).toEqual({ title: "Verification failed", tab: "Failed" });
    expect(runNotice({ kind: "verify", status: "cancelled" })).toBeNull();
  });

  it("tells a failed fetch with its own words and the link as the body (F48)", () => {
    const link = "https://jobs.example.com/backend-engineer";

    expect(runNotice({ kind: "new", status: "failed", fetchFailed: true, url: link })).toEqual({
      title: "Couldn't read the posting: paste the text",
      body: link,
      tab: "Failed",
    });
    expect(runNotice({ kind: "new", status: "failed", fetchFailed: true })).toEqual({
      title: "Couldn't read the posting: paste the text",
      tab: "Failed",
    });
    // Other failures keep their words, also when the run came from a link.
    expect(runNotice({ kind: "new", status: "failed", fetchFailed: false, url: link, company: "Globex", title: "Backend Engineer" })).toEqual({
      title: "Run failed",
      body: "Globex · Backend Engineer",
      tab: "Failed",
    });
    expect(runNotice({ kind: "new", status: "done", fetchFailed: false, url: link })).toEqual({ title: "Resume ready", tab: "Done" });
    // A cancelled run is never told about, whatever it is.
    expect(runNotice({ kind: "new", status: "cancelled", fetchFailed: true, url: link })).toBeNull();
  });

  it("has nothing to tell about a run the user cancelled (F32)", () => {
    expect(runNotice({ kind: "new", status: "cancelled", company: "Globex", title: "Backend Engineer" })).toBeNull();
  });

  it("has nothing to tell about a run that hasn't ended", () => {
    expect(runNotice({ kind: "new", status: "queued" })).toBeNull();
    expect(runNotice({ kind: "new", status: "running", company: "Globex", title: "Backend Engineer" })).toBeNull();
  });
});

describe("showsNotification", () => {
  it("shows nothing while the user is looking at the tab", () => {
    expect(showsNotification({ hidden: false, focused: true })).toBe(false);
  });

  it("shows the notification when the page is hidden or its window isn't focused", () => {
    expect(showsNotification({ hidden: true, focused: false })).toBe(true);
    expect(showsNotification({ hidden: true, focused: true })).toBe(true);
    expect(showsNotification({ hidden: false, focused: false })).toBe(true);
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
