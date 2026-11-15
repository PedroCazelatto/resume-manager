import { Ollama } from "ollama";
import { z } from "zod";
import { LlmError, parseLlmReply, type LlmClient, type LlmRequest } from "@/core/llm";
import type { OllamaSettings } from "./config";

const PROGRESS_INTERVAL_MS = 1000;

/** LlmClient backed by the configured Ollama instance (Art. III.1, V.6). */
export function createOllamaClient(settings: OllamaSettings, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    model: settings.model,

    async generate<T>(request: LlmRequest<T>): Promise<T> {
      // The timeout is an idle limit: it restarts with every token, so a model that is
      // still thinking or writing is never cut off, however long the whole call takes.
      const idle = new AbortController();
      const timeout = idle.signal;
      // The call also stops when the user cancels the run (F32). Closing the connection
      // is what makes Ollama stop generating.
      const stop = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
      let timer = setTimeout(() => idle.abort(), settings.timeoutMs);
      const alive = () => {
        clearTimeout(timer);
        timer = setTimeout(() => idle.abort(), settings.timeoutMs);
      };
      const ollama = new Ollama({
        host: settings.baseUrl,
        fetch: (input, init) =>
          fetchImpl(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, stop]) : stop }),
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
      const tokens = { thinking: 0, writing: 0 };
      let reported = { phase: "", at: 0 };
      try {
        for await (const part of await ollama.chat(chat)) {
          alive();
          reply += part.message.content;
          if (part.done) doneReason = part.done_reason;

          const phase = part.message.content ? "writing" : part.message.thinking ? "thinking" : null;
          if (!phase) continue;
          tokens[phase]++;
          // At most one report per interval, plus one whenever the phase changes.
          if (phase !== reported.phase || Date.now() - reported.at >= PROGRESS_INTERVAL_MS) {
            reported = { phase, at: Date.now() };
            request.onProgress?.({ phase, tokens: tokens[phase] });
          }
        }
      } catch (error) {
        throw toLlmError(error, settings, timeout, request.signal);
      } finally {
        clearTimeout(timer);
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

function toLlmError(error: unknown, settings: OllamaSettings, timeout: AbortSignal, cancel?: AbortSignal): LlmError {
  if (cancel?.aborted) return new LlmError("cancelled", "The run was cancelled.");
  if (timeout.aborted) {
    return new LlmError(
      "timeout",
      `Ollama sent nothing for ${Math.round(settings.timeoutMs / 1000)} s. Increase OLLAMA_TIMEOUT_MS if the model needs longer to start.`,
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
