// Progress events streamed by POST /api/applications, one JSON object per line (F30).

export type RunStep = "analyse" | "save";

export type RunEvent =
  | { type: "step"; step: RunStep; status: "running" | "done" }
  | { type: "done"; id: string }
  | { type: "error"; message: string };
