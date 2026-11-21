import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// The route only reads the request; queueing is replaced, so no run starts and nothing is fetched (Art. IX.2).
const queued = vi.hoisted(() => ({ run: vi.fn(), runs: vi.fn() }));

vi.mock("@/app/run", () => ({
  enqueueRun: async (...args: unknown[]) => {
    queued.run(...args);
    return Response.json({ runId: "run-1" }, { status: 202 });
  },
  enqueueRuns: async (...args: unknown[]) => {
    queued.runs(...args);
    return Response.json({ runIds: ["run-1"] }, { status: 202 });
  },
}));

const post = (body: unknown) =>
  POST(new Request("http://127.0.0.1:3000/api/applications", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/applications", () => {
  beforeEach(() => {
    queued.run.mockClear();
    queued.runs.mockClear();
  });

  it("refuses a single link with 400 and queues nothing (F47)", async () => {
    const response = await post({ url: "https://jobs.example.com/7" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Paste the posting's text first." });
    expect(queued.run).not.toHaveBeenCalled();
    expect(queued.runs).not.toHaveBeenCalled();
  });

  it("refuses pasted text without its link with 400 (F47)", async () => {
    const response = await post({ posting: "Globex is hiring." });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Give the posting's link with its text: every posting keeps its link." });
    expect(queued.run).not.toHaveBeenCalled();
  });

  it("queues pasted text with its link, in place of the run whose fetch failed", async () => {
    const response = await post({ posting: "Globex is hiring.", url: "https://jobs.example.com/7", replaces: "failed-run" });

    expect(response.status).toBe(202);
    expect(queued.run).toHaveBeenCalledWith("new", { start: { posting: "Globex is hiring.", url: "https://jobs.example.com/7" } }, "failed-run");
  });

  it("queues a list of links", async () => {
    const response = await post({ urls: ["https://jobs.example.com/1", "https://jobs.example.com/2"] });

    expect(response.status).toBe(202);
    expect(queued.runs).toHaveBeenCalledWith([{ start: { url: "https://jobs.example.com/1" } }, { start: { url: "https://jobs.example.com/2" } }]);
  });
});
