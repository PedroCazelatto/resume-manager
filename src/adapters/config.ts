import path from "node:path";
import { z } from "zod";

// Settings come only from environment variables, documented in .env.example (Art. V.5).

/** Absolute path of the folder holding the profile folders. Relative values resolve against the working directory. */
export function profilesDir(): string {
  // The ignore comment stops the build from tracing (and copying) the whole project,
  // profiles/ and .env included, into the build output (Art. III.3).
  return path.resolve(/* turbopackIgnore: true */ process.env.PROFILES_DIR ?? "./profiles");
}

/** Absolute path of templates/ in the working directory. */
export function templatesDir(): string {
  return path.resolve(/* turbopackIgnore: true */ "templates");
}

export interface OllamaSettings {
  baseUrl: string;
  /** No default: the model is never hard-coded (Art. V.6). */
  model: string;
  timeoutMs: number;
  /** Context window sent with every call. Prompts that don't fit fail instead of being truncated. */
  numCtx: number;
  /** Thinking mode for models that have one; left to the model's default when unset. */
  think?: boolean;
}

const ollamaEnv = z.object({
  OLLAMA_BASE_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
  OLLAMA_NUM_CTX: z.coerce.number().int().positive().default(16_384),
  OLLAMA_THINK: z.enum(["true", "false"]).optional(),
});

export function ollamaSettings(env: Record<string, string | undefined> = process.env): OllamaSettings {
  const result = ollamaEnv.safeParse(env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Missing or invalid setting: ${names.join(", ")}. See .env.example.`);
  }
  const { OLLAMA_BASE_URL, OLLAMA_MODEL, OLLAMA_TIMEOUT_MS, OLLAMA_NUM_CTX, OLLAMA_THINK } = result.data;
  return {
    baseUrl: OLLAMA_BASE_URL,
    model: OLLAMA_MODEL,
    timeoutMs: OLLAMA_TIMEOUT_MS,
    numCtx: OLLAMA_NUM_CTX,
    ...(OLLAMA_THINK ? { think: OLLAMA_THINK === "true" } : {}),
  };
}
