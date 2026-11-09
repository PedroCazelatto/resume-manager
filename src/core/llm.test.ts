import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LlmError, parseLlmReply } from "./llm";

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
