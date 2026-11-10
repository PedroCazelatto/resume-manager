// Progress events streamed by POST /api/applications, one JSON object per line (F30).

export type RunStep = "analyse" | "save" | "tailor";

export type RunEvent =
  | { type: "step"; step: RunStep; status: "running" | "done" }
  /** The application folder exists from here on, even if a later step fails. */
  | { type: "saved"; id: string }
  | { type: "done"; id: string }
  | { type: "error"; message: string };
