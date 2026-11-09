import type { FileError } from "@/core/markdown/validate";

/** Lists invalid files with their problems (Art. IV.6). */
export function FileProblems({ title, hint, errors }: { title: string; hint: string; errors: FileError[] }) {
  return (
    <section className="space-y-3 rounded-lg border border-destructive/40 p-4">
      <h2 className="font-medium text-destructive">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
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
