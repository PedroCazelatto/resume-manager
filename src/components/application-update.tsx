"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateApplications } from "@/app/actions";
import type { ShownUpdate } from "@/app/update";
import type { FileError } from "@/core/markdown/validate";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";

/**
 * What the one-time update will do to the selected profile's old applications, and the button
 * that confirms it. Nothing changes until it is pressed (Art. IV.8, F50).
 */
export function ApplicationUpdate({ update, problems }: { update: ShownUpdate; problems: FileError[] }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState<string[] | null>(null);
  const changes = update.rewrite.length + update.rename.length + update.delete.length;

  async function confirm() {
    setWorking(true);
    setFailed(null);
    const result = await updateApplications(update).catch(() => ({ ok: false as const, problems: ["Can't reach the app."] }));
    setWorking(false);
    if (result.ok) router.refresh();
    else setFailed(result.problems);
  }

  return (
    <SectionCard
      title="Update the saved applications"
      description="These applications were saved before each application's folder was named by a random UUID. Nothing changes until you confirm."
      contentClassName="space-y-3 text-sm"
    >
      <Folders title="job.md rewritten to the new fields (role becomes title, source names the job platform):" names={update.rewrite.map((id) => `applications/${id}/job.md`)} />
      <Folders title="Renamed to a new random UUID, with everything inside:" names={update.rename.map((id) => `applications/${id}/`)} />
      <Folders title="Deleted, folder and all, because their job.md has no link:" names={update.delete.map((id) => `applications/${id}/`)} />
      {problems.length > 0 && (
        <div className="space-y-1">
          <p>Left as they are until their job.md is fixed:</p>
          <ul className="list-disc pl-6">
            {problems.map(({ file, problems: found }) => (
              <li key={file}>
                <code className="font-mono break-all">{file}</code>: {found.join("; ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {changes > 0 && (
        <Button disabled={working} onClick={confirm}>
          {working ? "Updating…" : "Update the applications"}
        </Button>
      )}
      {failed?.map((problem) => (
        <p key={problem} className="text-destructive">
          {problem}
        </p>
      ))}
    </SectionCard>
  );
}

/** One list of folders, when it has any. */
function Folders({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="space-y-1">
      <p>{title}</p>
      <ul className="list-disc pl-6">
        {names.map((name) => (
          <li key={name}>
            <code className="font-mono break-all">{name}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
