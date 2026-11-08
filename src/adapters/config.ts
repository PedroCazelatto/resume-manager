import path from "node:path";

// Settings come only from environment variables, documented in .env.example (Art. V.5).

/** Absolute path of the data folder. Relative values resolve against the working directory. */
export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? "/app/data");
}
