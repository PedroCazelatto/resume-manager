import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  contextWarning,
  estimatePromptTokens,
  generateWithWarning,
  LlmError,
  parseLlmReply,
  type LlmClient,
  type LlmRequest,
} from "./llm";

const schema = z.object({ company: z.string(), seniority: z.enum(["junior", "senior"]) });

function errorOf(fn: () => unknown): LlmError {
  try {
    fn();
  } catch (error) {
    if (error instanceof LlmError) return error;
    throw error;
  }
  throw new Error("expected an LlmError");
}

describe("parseLlmReply", () => {
  it("returns the validated reply", () => {
    expect(parseLlmReply(schema, '{"company":"Globex","seniority":"senior"}')).toEqual({
      company: "Globex",
      seniority: "senior",
    });
  });

  it("rejects a reply that is not JSON", () => {
    const error = errorOf(() => parseLlmReply(schema, "Sure! Here is the JSON:"));

    expect(error.kind).toBe("invalid-output");
    expect(error.message).toBe("The model's reply is not valid JSON.");
  });

  it("lists the fields that don't match the schema", () => {
    const error = errorOf(() => parseLlmReply(schema, '{"seniority":"mid"}'));

    expect(error.kind).toBe("invalid-output");
    expect(error.message).toMatch(/^The model's reply doesn't match the expected structure: company: .+; seniority: .+/);
  });

  it("never puts reply text in the error message", () => {
    const error = errorOf(() => parseLlmReply(schema, '{"company":"Secret Corp","seniority":"Secret level"}'));

    expect(error.message).not.toContain("Secret");
  });
});

describe("estimatePromptTokens", () => {
  const empty = z.object({});
  const emptyLength = JSON.stringify(z.toJSONSchema(empty)).length;

  it("counts the characters of the system prompt, the prompt and the JSON schema, divided by 3", () => {
    const request = { system: "a".repeat(300), prompt: "b".repeat(600), schema: empty };

    expect(estimatePromptTokens(request)).toBe(Math.ceil((900 + emptyLength) / 3));
  });

  it("rounds up", () => {
    // Fills the total up to exactly 300 characters, then adds one more.
    const system = "a".repeat(300 - emptyLength);

    expect(estimatePromptTokens({ system, prompt: "", schema: empty })).toBe(100);
    expect(estimatePromptTokens({ system, prompt: "b", schema: empty })).toBe(101);
  });

  it("grows with the schema", () => {
    const small = estimatePromptTokens({ system: "", prompt: "", schema: empty });

    expect(estimatePromptTokens({ system: "", prompt: "", schema })).toBeGreaterThan(small);
  });
});

describe("contextWarning", () => {
  it("says nothing for a prompt of up to half of the context window", () => {
    expect(contextWarning(1, 16_384)).toBeNull();
    expect(contextWarning(8192, 16_384)).toBeNull();
  });

  it("warns above half of the context window, with the estimate and the window in plain digits, and the setting", () => {
    expect(contextWarning(8193, 16_384)).toBe(
      "This step's prompt is about 8193 tokens, more than half of the 16384-token context window. If the step fails, raise OLLAMA_NUM_CTX.",
    );
  });

  it("still only warns when the prompt is larger than the whole window", () => {
    expect(contextWarning(20_000, 16_384)).toContain("about 20000 tokens");
  });
});

describe("generateWithWarning", () => {
  const request: LlmRequest<{ company: string }> = {
    system: "Extract the company.",
    prompt: "x".repeat(3000),
    schema: z.object({ company: z.string() }),
    temperature: 0.1,
  };

  function fakeLlm(contextTokens: number) {
    const requests: unknown[] = [];
    const llm: LlmClient = {
      model: "fake-model",
      contextTokens,
      async generate<T>(sent: LlmRequest<T>): Promise<T> {
        requests.push(sent);
        return sent.schema.parse({ company: "Globex" });
      },
    };
    return { llm, requests };
  }

  it("warns before a call whose prompt is above the threshold, and still makes the call", async () => {
    const { llm, requests } = fakeLlm(2000);
    const onWarning = vi.fn(() => expect(requests).toHaveLength(0));

    expect(await generateWithWarning(llm, request, onWarning)).toEqual({ company: "Globex" });

    expect(onWarning).toHaveBeenCalledExactlyOnceWith(contextWarning(estimatePromptTokens(request), 2000));
    expect(requests).toEqual([request]);
  });

  it("says nothing below the threshold", async () => {
    const { llm, requests } = fakeLlm(16_384);
    const onWarning = vi.fn();

    await generateWithWarning(llm, request, onWarning);

    expect(onWarning).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
  });

  it("makes the call when nobody listens for the warning", async () => {
    const { llm } = fakeLlm(10);

    expect(await generateWithWarning(llm, request)).toEqual({ company: "Globex" });
  });
});
