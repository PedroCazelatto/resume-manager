import { StatusBadge, type Tone } from "@/components/status-badge";
import { SectionCard } from "@/components/section-card";
import type { Analysis, Requirement } from "@/core/application/schemas";

const STATUS_TONE: Record<Requirement["status"], Tone> = {
  matched: "green",
  partial: "amber",
  missing: "red",
};

/** The fit/gap table: must-haves first, each with its match, sources and note (F12). */
export function AnalysisView({ analysis }: { analysis: Analysis }) {
  const requirements = [...analysis.requirements].sort(
    (a, b) => Number(a.importance === "nice-to-have") - Number(b.importance === "nice-to-have"),
  );
  const mustHaves = requirements.filter((r) => r.importance === "must-have");
  const matched = mustHaves.filter((r) => r.status === "matched").length;

  return (
    <SectionCard
      title="Fit/gap analysis"
      description={`${matched} of ${mustHaves.length} must-haves matched · ${analysis.model}`}
      contentClassName="space-y-3"
    >
      <div className="overflow-x-auto">
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
              <tr key={i} className="border-b align-top last:border-b-0">
                <td className="py-2 pr-3">
                  {r.text}
                  <div className="text-xs text-muted-foreground">{r.importance}</div>
                </td>
                <td className="py-2 pr-3">
                  <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge>
                </td>
                <td className="py-2">
                  {r.note}
                  {r.sources.length > 0 && (
                    <div className="font-mono text-xs break-all text-muted-foreground">{r.sources.join(", ")}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {analysis.keywords.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">Keywords:</span> {analysis.keywords.join(", ")}
        </p>
      )}
    </SectionCard>
  );
}
