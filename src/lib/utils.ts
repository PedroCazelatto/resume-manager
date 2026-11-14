export { cn } from "cn"

/** Elapsed seconds as MMmSSs, e.g. 125 → "02m05s". */
export function formatElapsed(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}m${pad(seconds % 60)}s`;
}
