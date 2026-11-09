import type { Analysis, Requirement } from "@/core/application/schemas";

const STATUS_STYLE: Record<Requirement["status"], string> = {
  matched: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  partial: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100",
  missing: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
};

/** The fit/gap table: must-haves first, each with its match, sources and note (F12). */
export function AnalysisView({ analysis }: { analysis: Analysis }) {
  const requirements = [...analysis.requirements].sort(
    (a, b) => Number(a.importance === "nice-to-have") - Number(b.importance === "nice-to-have"),
  );
  const mustHaves = requirements.filter((r) => r.importance === "must-have");
  const matched = mustHaves.filter((r) => r.status === "matched").length;

  return (
    <section className="space-y-3">
      <h2 className="font-medium">Fit/gap analysis</h2>
      <p className="text-sm text-muted-foreground">
        {matched} of {mustHaves.length} must-haves matched · {analysis.model}
      </p>
      <table className="w-full text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 font-medium">Requirement</th>
            <th className="py-2 pr-3 font-medium">Match</th>
            <th className="py-2 font-medium">Why</th>
          </tr>
        </thead>
        <tbody>
          {requirements.map((r, i) => (
            <tr key={i} className="border-b align-top">
              <td className="py-2 pr-3">
                {r.text}
                <div className="text-xs text-muted-foreground">{r.importance}</div>
              </td>
              <td className="py-2 pr-3">
                <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{r.status}</span>
              </td>
              <td className="py-2">
                {r.note}
                {r.sources.length > 0 && (
                  <div className="font-mono text-xs text-muted-foreground">{r.sources.join(", ")}</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {analysis.keywords.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Keywords:</span> {analysis.keywords.join(", ")}
        </p>
      )}
    </section>
  );
}
