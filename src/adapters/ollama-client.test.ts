import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmError } from "@/core/llm";
import type { OllamaSettings } from "./config";
import { createOllamaClient } from "./ollama-client";

const settings: OllamaSettings = {
  baseUrl: "http://ollama.test:11434",
  model: "test-model",
  timeoutMs: 1000,
  numCtx: 4096,
};

const request = {
  system: "Extract the company.",
  prompt: "<posting>Globex is hiring.</posting>",
  schema: z.object({ company: z.string() }),
  temperature: 0.1,
};

/** A streamed Ollama chat response (one JSON object per line). */
function stream(...parts: object[]): Response {
  return new Response(parts.map((part) => `${JSON.stringify(part)}\n`).join(""), {
    headers: { "content-type": "application/x-ndjson" },
  });
}

const thought = (thinking: string) => ({ message: { role: "assistant", content: "", thinking }, done: false });
const chunk = (content: string) => ({ message: { role: "assistant", content }, done: false });
const done = (done_reason = "stop") => ({ message: { role: "assistant", content: "" }, done: true, done_reason });

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    return respond();
  };
  return { fetchImpl, calls };
}

async function errorOf(promise: Promise<unknown>): Promise<LlmError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof LlmError) return error;
    throw error;
  }
  throw new Error("expected an LlmError");
}

describe("createOllamaClient", () => {
  it("joins the streamed reply and validates it", async () => {
    const { fetchImpl } = fakeFetch(() => stream(chunk('{"comp'), chunk('any":"Globex"}'), done()));

    const client = createOllamaClient(settings, fetchImpl);

    expect(client.model).toBe("test-model");
    expect(await client.generate(request)).toEqual({ company: "Globex" });
  });

  it("sends the model, messages, JSON schema and context settings", async () => {
    const { fetchImpl, calls } = fakeFetch(() => stream(chunk('{"company":"Globex"}'), done()));

    await createOllamaClient(settings, fetchImpl).generate(request);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://ollama.test:11434/api/chat");
    expect(calls[0].body).toMatchObject({
      model: "test-model",
      messages: [
        { role: "system", content: "Extract the company." },
        { role: "user", content: "<posting>Globex is hiring.</posting>" },
      ],
      format: { type: "object", properties: { company: { type: "string" } }, required: ["company"] },
      options: { temperature: 0.1, num_ctx: 4096 },
      truncate: false,
      shift: false,
      stream: true,
    });
    expect(calls[0].body).not.toHaveProperty("think");
  });

  it("sends the thinking setting only when it is configured", async () => {
    const { fetchImpl, calls } = fakeFetch(() => stream(chunk('{"company":"Globex"}'), done()));

    await createOllamaClient({ ...settings, think: false }, fetchImpl).generate(request);

    expect(calls[0].body).toMatchObject({ think: false });
  });

  it("reports a reply that ran out of context", async () => {
    const { fetchImpl } = fakeFetch(() => stream(chunk('{"comp'), done("length")));

    const error = await errorOf(createOllamaClient(settings, fetchImpl).generate(request));

    expect(error.kind).toBe("context");
    expect(error.message).toContain("OLLAMA_NUM_CTX (now 4096)");
  });

  it("reports a prompt that doesn't fit the context window", async () => {
    const { fetchImpl } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({ error: "request (20000 tokens) exceeds the available context size (4096 tokens), try increasing it" }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    );

    const error = await errorOf(createOllamaClient(settings, fetchImpl).generate(request));

    expect(error.kind).toBe("context");
    expect(error.message).toBe("The prompt is too long for the context window. Increase OLLAMA_NUM_CTX (now 4096).");
  });

  it("passes on other Ollama errors", async () => {
    const { fetchImpl } = fakeFetch(
      () =>
        new Response(JSON.stringify({ error: "model 'test-model' not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    );

    const error = await errorOf(createOllamaClient(settings, fetchImpl).generate(request));

    expect(error.kind).toBe("ollama");
    expect(error.message).toBe("Ollama error: model 'test-model' not found");
  });

  it("passes on errors sent in the middle of the stream", async () => {
    const { fetchImpl } = fakeFetch(() => stream(chunk('{"comp'), { error: "model runner stopped" }));

    const error = await errorOf(createOllamaClient(settings, fetchImpl).generate(request));

    expect(error).toMatchObject({ kind: "ollama", message: "Ollama error: model runner stopped" });
  });

  it("rejects a reply that doesn't match the schema", async () => {
    const { fetchImpl } = fakeFetch(() => stream(chunk('{"name":"Globex"}'), done()));

    const error = await errorOf(createOllamaClient(settings, fetchImpl).generate(request));

    expect(error.kind).toBe("invalid-output");
  });

  it("reports when Ollama can't be reached", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };

    const error = await errorOf(createOllamaClient(settings, fetchImpl).generate(request));

    expect(error).toMatchObject({
      kind: "unreachable",
      message: "Can't reach Ollama at http://ollama.test:11434. Is it running?",
    });
  });

  it("gives up when Ollama sends nothing for the configured timeout", async () => {
    const hanging: typeof fetch = (_input, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));

    const error = await errorOf(createOllamaClient({ ...settings, timeoutMs: 20 }, hanging).generate(request));

    expect(error.kind).toBe("timeout");
    expect(error.message).toContain("OLLAMA_TIMEOUT_MS");
  });

  /** A response that sends one part every `gapMs`, and fails like fetch does when the call is aborted. */
  function slowFetch(parts: object[], gapMs: number): typeof fetch {
    return async (_input, init) => {
      const encoder = new TextEncoder();
      let timer: ReturnType<typeof setTimeout>;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          let i = 0;
          const next = () => {
            if (i === parts.length) return controller.close();
            controller.enqueue(encoder.encode(`${JSON.stringify(parts[i++])}\n`));
            timer = setTimeout(next, gapMs);
          };
          next();
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            controller.error(init.signal?.reason);
          });
        },
      });
      return new Response(body, { headers: { "content-type": "application/x-ndjson" } });
    };
  }

  it("lets a call run longer than the timeout while tokens keep arriving", async () => {
    const parts = [thought("Let me"), thought(" check"), thought(" the"), thought(" posting."), chunk('{"company":"Globex"}'), done()];

    const client = createOllamaClient({ ...settings, timeoutMs: 60 }, slowFetch(parts, 25));

    expect(await client.generate(request)).toEqual({ company: "Globex" });
  });

  it("gives up when the stream stalls for longer than the timeout", async () => {
    const error = await errorOf(
      createOllamaClient({ ...settings, timeoutMs: 20 }, slowFetch([thought("Let me"), chunk("{")], 200)).generate(request),
    );

    expect(error.kind).toBe("timeout");
  });

  it("reports thinking and writing progress, and leaves the thinking out of the reply", async () => {
    const { fetchImpl } = fakeFetch(() =>
      stream(thought("Let me"), thought(" check."), chunk('{"comp'), chunk('any":"Globex"}'), done()),
    );
    const progress: object[] = [];

    const reply = await createOllamaClient(settings, fetchImpl).generate({ ...request, onProgress: (p) => progress.push(p) });

    expect(reply).toEqual({ company: "Globex" });
    expect(progress).toEqual([
      { phase: "thinking", tokens: 1 },
      { phase: "writing", tokens: 1 },
    ]);
  });
});
