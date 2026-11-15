import { Suspense } from "react";
import { ProfilePicker } from "@/components/profile-picker";
import { FileProblems } from "@/components/file-problems";
import { NewApplicationForm } from "@/components/new-application-form";
import { RunsList } from "@/components/runs-list";
import { profileStore, readSelectedProfile } from "./profiles";
import { DEFAULT_TEMPLATE, templateStore } from "./templates";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Resume Manager</h1>
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

  const [result, template] = await Promise.all([
    selected ? store.loadProfile(selected) : null,
    templateStore().loadTemplate(DEFAULT_TEMPLATE),
  ]);

  return (
    <div className="space-y-4">
      <ProfilePicker slugs={slugs} selected={selected} />
      {invalidNames.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Ignored folders (names must be lowercase kebab-case): {invalidNames.join(", ")}
        </p>
      )}
      {result && !result.ok && (
        <FileProblems
          title="This profile has problems"
          hint="Fix these files in your editor, then reload. Generation is blocked until the profile is valid."
          errors={result.errors}
        />
      )}
      {result?.ok && (
        <>
          <p className="text-sm">
            Profile of <strong>{result.profile.personal.data.name}</strong> is valid.
          </p>
          {template.ok ? (
            <p className="text-sm text-muted-foreground">
              Template: {template.template.country}
              {template.template.maxPages ? ` · up to ${template.template.maxPages} page(s)` : ""}
            </p>
          ) : (
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
