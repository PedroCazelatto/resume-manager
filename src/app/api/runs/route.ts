import { runRegistry, selectedProfile } from "@/app/run";

/** The selected profile's runs: the active one, the waiting ones in order, then the finished ones (F42). */
export async function GET(): Promise<Response> {
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;

  return Response.json({ runs: runRegistry().list(selected.slug) }, { headers: { "Cache-Control": "no-store" } });
}
