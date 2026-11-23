import { APPLICATION_FILES } from "@/core/application/folder";
import { summarizeApplication, type ApplicationSources } from "@/core/application/summary";
import { homeTable, type HomeTable } from "@/core/home/table";
import { profileStore } from "@/app/profiles";
import { runRegistry } from "@/app/run";
import type { RunSummary } from "@/app/runs";

// The home page's table (F26), read for the selected profile only (Art. III.7): its applications'
// files through ProfileStore, and its runs in memory. `GET /api/runs` answers it every time the
// table refreshes, and the page renders it first.

/** What the home page shows: the profile's runs, which the notifications follow (F38), and its table. */
export interface Home {
  runs: RunSummary[];
  table: HomeTable;
}

/** The profile's runs and table. */
export async function readHome(slug: string): Promise<Home> {
  const store = profileStore();
  const ids = await store.listApplications(slug);
  const summaries = await Promise.all(
    ids.map(async (id) => {
      const files: ApplicationSources = {};
      await Promise.all(APPLICATION_FILES.map(async (file) => (files[file] = await store.readApplicationFile(slug, id, file))));
      return summarizeApplication(id, files);
    }),
  );
  const registry = runRegistry();
  const runs = registry.list(slug);
  return { runs, table: homeTable(summaries.filter((summary) => summary !== null), runs, registry.listArchived(slug)) };
}
