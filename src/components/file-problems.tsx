import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FileError } from "@/core/markdown/validate";

/** Lists invalid files with their problems (Art. IV.6). */
export function FileProblems({ title, hint, errors }: { title: string; hint: string; errors: FileError[] }) {
  return (
    <Card className="ring-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">
          {errors.map((error) => (
            <li key={error.file}>
              <code className="font-mono break-all">{error.file}</code>
              <ul className="list-disc pl-6">
                {error.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
