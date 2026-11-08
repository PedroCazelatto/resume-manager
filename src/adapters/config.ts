import path from "node:path";

// Settings come only from environment variables, documented in .env.example (Art. V.5).

/** Absolute path of the folder holding the profile folders. Relative values resolve against the working directory. */
export function profilesDir(): string {
  // The ignore comment stops the build from tracing (and copying) the whole project,
  // profiles/ and .env included, into the standalone output (Art. III.3).
  return path.resolve(/* turbopackIgnore: true */ process.env.PROFILES_DIR ?? "/app/profiles");
}
