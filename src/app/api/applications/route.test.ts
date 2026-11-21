import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

// The route only reads the request; queueing is replaced, so no run starts and nothing is fetched (Art. IX.2).
const queued = vi.hoisted(() => ({ run: vi.fn(), links: vi.fn() }));

vi.mock("@/app/run", () => ({
  enqueueRun: async (...args: unknown[]) => {
    queued.run(...args);
    return Response.json({ runId: "run-1" }, { status: 202 });
  },
  enqueueLinks: async (...args: unknown[]) => {
    queued.links(...args);
    return Response.json({ runIds: ["run-1"], skipped: [], problems: [] }, { status: 202 });
  },
}));

const post = (body: unknown) =>
  POST(new Request("http://127.0.0.1:3000/api/applications", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/applications", () => {
  beforeEach(() => {
    queued.run.mockClear();
    queued.links.mockClear();
  });

  it("refuses a single link with 400 and queues nothing (F47)", async () => {
    const response = await post({ url: "https://jobs.example.com/7" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Paste the posting's text first." });
    expect(queued.run).not.toHaveBeenCalled();
    expect(queued.links).not.toHaveBeenCalled();
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

  it("queues a list of links, each with its line, an Indeed link included (F47)", async () => {
    const response = await post({ urls: ["https://jobs.example.com/1", "", "https://ie.indeed.com/viewjob?jk=1"] });

    expect(response.status).toBe(202);
    expect(queued.links).toHaveBeenCalledWith([
      { line: 1, text: "https://jobs.example.com/1", url: "https://jobs.example.com/1" },
      { line: 3, text: "https://ie.indeed.com/viewjob?jk=1", url: "https://ie.indeed.com/viewjob?jk=1" },
    ]);
  });

  it("refuses a list with a line that isn't a link the server may fetch, and queues nothing", async () => {
    const response = await post({ urls: ["https://jobs.example.com/1", "http://127.0.0.1:11434/api/tags"] });

    expect(response.status).toBe(400);
    expect(queued.links).not.toHaveBeenCalled();
  });
});
