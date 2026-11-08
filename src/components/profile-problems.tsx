import type { ProfileFileError } from "@/core/profile/validate";

export function ProfileProblems({ errors }: { errors: ProfileFileError[] }) {
  return (
    <section className="space-y-3 rounded-lg border border-destructive/40 p-4">
      <h2 className="font-medium text-destructive">This profile has problems</h2>
      <p className="text-sm text-muted-foreground">Fix these files in your editor, then reload. Generation is blocked until the profile is valid.</p>
      <ul className="space-y-2 text-sm">
        {errors.map((error) => (
          <li key={error.file}>
            <code className="font-mono">{error.file}</code>
            <ul className="list-disc pl-6">
              {error.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
