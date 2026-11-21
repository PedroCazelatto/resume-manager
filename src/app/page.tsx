import { Suspense } from "react";
import { updateNeeded } from "@/core/application/update";
import { ApplicationUpdate } from "@/components/application-update";
import { ProfilePicker } from "@/components/profile-picker";
import { FileProblems } from "@/components/file-problems";
import { NewApplicationForm } from "@/components/new-application-form";
import { RunsList } from "@/components/runs-list";
import { profileStore, readSelectedProfile } from "./profiles";
import { DEFAULT_TEMPLATE, templateStore } from "./templates";
import { readUpdate, shownUpdate } from "./update";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <h1 className="sr-only">Resume Manager</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading profiles…</p>}>
        <ProfileSection />
      </Suspense>
    </main>
  );
}

async function ProfileSection() {
  const store = profileStore();
  const { slugs, invalidNames } = await store.listProfiles();
  const selected = await readSelectedProfile(slugs);

  if (slugs.length === 0) {
    return (
      <p className="text-sm">
        No profiles found in <code className="font-mono">profiles/</code>. Copy{" "}
        <code className="font-mono">example-profiles/jane-doe</code> there, rename the folder and edit the files.
      </p>
    );
  }

  const [result, template, update] = await Promise.all([
    selected ? store.loadProfile(selected) : null,
    templateStore().loadTemplate(DEFAULT_TEMPLATE),
    // Applications saved before F50 wait for the user to confirm their update.
    selected ? readUpdate(selected) : null,
  ]);

  return (
    <div className="space-y-6">
      {/* The sidebar holds the picker; the page shows it too while no profile is chosen (F35). */}
      {!selected && (
        <div className="max-w-64">
          <ProfilePicker slugs={slugs} selected={selected} />
        </div>
      )}
      {invalidNames.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Ignored folders (names must be lowercase kebab-case): {invalidNames.join(", ")}
        </p>
      )}
      {update && updateNeeded(update) && <ApplicationUpdate update={shownUpdate(update)} problems={update.problems} />}
      {result && !result.ok && (
        <FileProblems
          title="This profile has problems"
          hint="Fix these files in your editor, then reload. Generation is blocked until the profile is valid."
          errors={result.errors}
        />
      )}
      {result?.ok && (
        <>
          <div className="space-y-1">
            <p className="text-sm">
              Profile of <strong>{result.profile.personal.data.name}</strong> is valid.
            </p>
            {template.ok && (
              <p className="text-sm text-muted-foreground">
                Template: {template.template.country}
                {template.template.maxPages ? ` · up to ${template.template.maxPages} page(s)` : ""}
              </p>
            )}
          </div>
          {!template.ok && (
            <FileProblems
              title="The resume template isn't ready"
              hint="Tailoring is blocked until it's fixed. You can still analyse postings."
              errors={[template.error]}
            />
          )}
          <NewApplicationForm />
          {/* A new key empties the list when the profile changes (Art. III.7). */}
          <RunsList key={selected} />
        </>
      )}
    </div>
  );
}
