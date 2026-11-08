import { Suspense } from "react";
import { ProfilePicker } from "@/components/profile-picker";
import { ProfileProblems } from "@/components/profile-problems";
import { profileStore, readSelectedProfile } from "./profiles";

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
        No profiles found in <code className="font-mono">data/profiles/</code>. Copy{" "}
        <code className="font-mono">data.example/profiles/jane-doe</code> there, rename the folder and edit the files.
      </p>
    );
  }

  const result = selected ? await store.loadProfile(selected) : null;

  return (
    <div className="space-y-4">
      <ProfilePicker slugs={slugs} selected={selected} />
      {invalidNames.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Ignored folders (names must be lowercase kebab-case): {invalidNames.join(", ")}
        </p>
      )}
      {result && !result.ok && <ProfileProblems errors={result.errors} />}
      {result?.ok && (
        <p className="text-sm">
          Profile of <strong>{result.profile.personal.data.name}</strong> is valid.
        </p>
      )}
    </div>
  );
}
