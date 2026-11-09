import { ollamaSettings } from "@/adapters/config";
import { createOllamaClient } from "@/adapters/ollama-client";

export function llmClient() {
  return createOllamaClient(ollamaSettings());
}
