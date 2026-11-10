import { Ollama } from "ollama";
import { z } from "zod";
import { LlmError, parseLlmReply, type LlmClient, type LlmRequest } from "@/core/llm";
import type { OllamaSettings } from "./config";

/** LlmClient backed by the configured Ollama instance (Art. III.1, V.6). */
export function createOllamaClient(settings: OllamaSettings, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    model: settings.model,

    async generate<T>(request: LlmRequest<T>): Promise<T> {
      const timeout = AbortSignal.timeout(settings.timeoutMs);
      const ollama = new Ollama({
        host: settings.baseUrl,
        fetch: (input, init) =>
          fetchImpl(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout }),
      });

      const chat = {
        model: settings.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        format: z.toJSONSchema(request.schema),
        options: { temperature: request.temperature, num_ctx: settings.numCtx },
        // Only sent when configured: models without a thinking mode keep their default.
        ...(settings.think === undefined ? {} : { think: settings.think }),
        // Fail instead of silently dropping prompt text when the prompt or the reply
        // doesn't fit in the context window (OLLAMA_NUM_CTX).
        truncate: false,
        shift: false,
        // Streaming keeps long generations from hitting HTTP header timeouts.
        stream: true as const,
      };

      let reply = "";
      let doneReason: string | undefined;
      try {
        for await (const part of await ollama.chat(chat)) {
          reply += part.message.content;
          if (part.done) doneReason = part.done_reason;
        }
      } catch (error) {
        throw toLlmError(error, settings, timeout);
      }

      if (doneReason === "length") {
        throw new LlmError(
          "context",
          `The model ran out of context before finishing its reply. Increase OLLAMA_NUM_CTX (now ${settings.numCtx}).`,
        );
      }
      return parseLlmReply(request.schema, reply);
    },
  };
}

function toLlmError(error: unknown, settings: OllamaSettings, timeout: AbortSignal): LlmError {
  if (timeout.aborted) {
    return new LlmError(
      "timeout",
      `Ollama did not finish within ${Math.round(settings.timeoutMs / 1000)} s. Increase OLLAMA_TIMEOUT_MS if the model needs longer.`,
    );
  }
  // fetch reports network failures (nothing listening, DNS) as a TypeError.
  if (error instanceof TypeError) {
    return new LlmError("unreachable", `Can't reach Ollama at ${settings.baseUrl}. Is it running?`);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("exceeds the available context size")) {
    return new LlmError(
      "context",
      `The prompt is too long for the context window. Increase OLLAMA_NUM_CTX (now ${settings.numCtx}).`,
    );
  }
  return new LlmError("ollama", `Ollama error: ${message}`);
}
