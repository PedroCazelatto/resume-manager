import { runRegistry, selectedProfile } from "@/app/run";

/**
 * Streams a run of the selected profile, one JSON event per line: the events so far,
 * then the new ones until the run ends (F30, F42).
 */
export async function GET(_request: Request, context: RouteContext<"/api/runs/[runId]/events">): Promise<Response> {
  const { runId } = await context.params;
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;

  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let stop: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    // The browser went away; the run goes on.
    cancel() {
      stop?.();
    },
  });
  stop = runRegistry().follow(selected.slug, runId, {
    event: (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)),
    close: () => controller.close(),
  });
  if (!stop) return Response.json({ error: "Unknown run." }, { status: 404 });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
