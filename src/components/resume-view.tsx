import { decideInference } from "@/app/applications/[id]/actions";
import { Button } from "@/components/ui/button";
import type { Inference } from "@/core/resume/schema";

/** The rendered resume, isolated in a sandboxed frame (no scripts, no access to the app). */
export function ResumePreview({ html }: { html: string }) {
  return (
    <iframe
      title="Resume preview"
      sandbox=""
      srcDoc={html}
      className="aspect-[210/297] w-full rounded-lg border bg-white"
    />
  );
}

/** Skills the model inferred; they stay out of the resume until approved (Art. II.3, F16). */
export function InferenceList({ id, inferences }: { id: string; inferences: Inference[] }) {
  if (inferences.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-medium">Implied skills</h2>
      <p className="text-sm text-muted-foreground">
        Your profile implies these skills without stating them. They stay out of the resume until you approve them.
      </p>
      <ul className="space-y-2 text-sm">
        {inferences.map((inference) => (
          <li key={inference.skill}>
            <strong>{inference.skill}</strong> · {inference.status}
            <div>{inference.reason}</div>
            <div className="font-mono text-xs text-muted-foreground">{inference.sources.join(", ")}</div>
            <div className="mt-1 flex gap-2">
              <form action={decideInference.bind(null, id, inference.skill, "approved")}>
                <Button type="submit" variant="outline" size="sm" disabled={inference.status === "approved"}>
                  Approve
                </Button>
              </form>
              <form action={decideInference.bind(null, id, inference.skill, "rejected")}>
                <Button type="submit" variant="outline" size="sm" disabled={inference.status === "rejected"}>
                  Reject
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
