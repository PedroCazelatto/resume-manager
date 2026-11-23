import { readHome } from "@/app/home";
import { selectedProfile } from "@/app/run";

/**
 * The selected profile's runs (the active one, the waiting ones in order, then the finished ones,
 * F42) and the home page's table of its applications, which reads it every 2 seconds (F26).
 */
export async function GET(): Promise<Response> {
  const selected = await selectedProfile();
  if ("error" in selected) return selected.error;

  return Response.json(await readHome(selected.slug), { headers: { "Cache-Control": "no-store" } });
}
