import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ollamaSettings, profilesDir } from "./config";

describe("profilesDir", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves a relative PROFILES_DIR against the working directory", () => {
    vi.stubEnv("PROFILES_DIR", "./example-profiles");

    expect(profilesDir()).toBe(path.resolve("example-profiles"));
  });
});

describe("ollamaSettings", () => {
  it("uses the documented defaults when only the model is set", () => {
    expect(ollamaSettings({ OLLAMA_MODEL: "qwen3.5:27b" })).toEqual({
      baseUrl: "http://host.docker.internal:11434",
      model: "qwen3.5:27b",
      timeoutMs: 600_000,
      numCtx: 16_384,
    });
  });

  it("reads every setting from the environment", () => {
    const settings = ollamaSettings({
      OLLAMA_BASE_URL: "http://localhost:11434",
      OLLAMA_MODEL: "qwen2.5:7b",
      OLLAMA_TIMEOUT_MS: "120000",
      OLLAMA_NUM_CTX: "32768",
    });

    expect(settings).toEqual({
      baseUrl: "http://localhost:11434",
      model: "qwen2.5:7b",
      timeoutMs: 120_000,
      numCtx: 32_768,
    });
  });

  it("requires the model, since no model name is hard-coded", () => {
    expect(() => ollamaSettings({})).toThrow("Missing or invalid setting: OLLAMA_MODEL. See .env.example.");
  });

  it("names every invalid setting", () => {
    expect(() =>
      ollamaSettings({ OLLAMA_MODEL: "m", OLLAMA_TIMEOUT_MS: "soon", OLLAMA_NUM_CTX: "-1", OLLAMA_BASE_URL: "file:///x" }),
    ).toThrow("Missing or invalid setting: OLLAMA_BASE_URL, OLLAMA_TIMEOUT_MS, OLLAMA_NUM_CTX. See .env.example.");
  });
});
