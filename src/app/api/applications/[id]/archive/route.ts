import { archiveApplication, restoreApplication } from "@/app/archive";

/** Archives an application of the selected profile: `archived_at` goes into its job.md (F48). */
export async function POST(_request: Request, context: RouteContext<"/api/applications/[id]/archive">): Promise<Response> {
  const { id } = await context.params;
  return archiveApplication(id);
}

/** Restores an archived application of the selected profile: `archived_at` leaves its job.md (F48). */
export async function DELETE(_request: Request, context: RouteContext<"/api/applications/[id]/archive">): Promise<Response> {
  const { id } = await context.params;
  return restoreApplication(id);
}
