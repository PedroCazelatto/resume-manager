import { z } from "zod";

// The model interface pipeline steps depend on. The Ollama implementation lives in
// src/adapters; tests use fakes (Art. IX.2).

/** One structured call to the model (Art. V.6). */
export interface LlmRequest<T> {
  system: string;
  prompt: string;
  /** Shape of the reply: sent to the model as a JSON schema, then used to validate the reply. */
  schema: z.ZodType<T>;
  /** Use a low value for extraction and verification (Art. V.6). */
  temperature: number;
  /** Called while the model works, so the UI can show it is alive (Art. V.8). */
  onProgress?: (progress: LlmProgress) => void;
  /** Aborted when the user cancels the run; the call then fails as `cancelled` (F32). */
  signal?: AbortSignal;
}

/** How far a call is: the model thinks first (when it has a thinking mode), then writes the reply. */
export interface LlmProgress {
  phase: "thinking" | "writing";
  /** Tokens received in this phase so far. */
  tokens: number;
}

export interface LlmClient {
  /** The configured model name, recorded in generated files. */
  readonly model: string;
  /** Size of the model's context window in tokens (OLLAMA_NUM_CTX). */
  readonly contextTokens: number;
  generate<T>(request: LlmRequest<T>): Promise<T>;
}

export type LlmErrorKind = "unreachable" | "timeout" | "context" | "ollama" | "invalid-output" | "cancelled";

/** A failed model call. Messages never include prompt or reply text (Art. III.4). */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;

  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
  }
}

/** Stops a run between two steps once the user has cancelled it (F32). */
export function stopIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new LlmError("cancelled", "The run was cancelled.");
}

/**
 * Roughly how many tokens a call sends to the model: the characters of the system prompt,
 * the prompt and the JSON schema, divided by 3. An estimate with a margin, not a count.
 */
export function estimatePromptTokens(request: Pick<LlmRequest<unknown>, "system" | "prompt" | "schema">): number {
  const schema = JSON.stringify(z.toJSONSchema(request.schema));
  return Math.ceil((request.system.length + request.prompt.length + schema.length) / 3);
}

/**
 * The warning for a prompt that takes more than half of the context window, or null (F40).
 * The other half is for the model's thinking and reply, whose size can't be known in advance.
 */
export function contextWarning(promptTokens: number, contextTokens: number): string | null {
  if (promptTokens * 2 <= contextTokens) return null;
  const n = (tokens: number) => tokens.toLocaleString("en");
  return `This step's prompt is about ${n(promptTokens)} tokens, more than half of the ${n(contextTokens)}-token context window. If the step fails, raise OLLAMA_NUM_CTX.`;
}

/** Calls the model, after warning when the prompt may not leave room for the reply (F40). The call is made either way. */
export function generateWithWarning<T>(
  llm: LlmClient,
  request: LlmRequest<T>,
  onWarning?: (message: string) => void,
): Promise<T> {
  const warning = contextWarning(estimatePromptTokens(request), llm.contextTokens);
  if (warning) onWarning?.(warning);
  return llm.generate(request);
}

/** Parses the model's JSON reply and validates it against the request schema. */
export function parseLlmReply<T>(schema: z.ZodType<T>, reply: string): T {
  let data: unknown;
  try {
    data = JSON.parse(reply);
  } catch {
    throw new LlmError("invalid-output", "The model's reply is not valid JSON.");
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    const problems = result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    );
    throw new LlmError("invalid-output", `The model's reply doesn't match the expected structure: ${problems.join("; ")}`);
  }
  return result.data;
}
