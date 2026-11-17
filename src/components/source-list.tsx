"use client";

import { useState } from "react";
import { SectionCard } from "@/components/section-card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SourcedItem } from "@/core/resume/sources";

/** The text of each cited file, null when the profile no longer has it; null when the profile can't be read. */
export type CitedFiles = Record<string, string | null> | null;

interface Props {
  items: SourcedItem[];
  files: CitedFiles;
  className?: string;
}

/** The profile files behind each item of the resume (Art. II.4, F18). */
export function SourceList({ items, files, className }: Props) {
  return (
    <SectionCard
      title="Sources"
      description={
        files
          ? "The profile files each item of the resume comes from."
          : "Your profile has problems, so its files can't be shown. Fix them on the home page."
      }
      className={className}
    >
      <ul className="space-y-2 text-sm">
        {items.map((item, index) => (
          <li key={index}>
            <div>
              <span className="text-muted-foreground">{item.section}</span>
              {item.title && <> · {item.title}</>}
            </div>
            {item.sources.length === 0 ? (
              <div className="text-xs text-destructive">No source recorded</div>
            ) : (
              <SourceFiles sources={item.sources} files={files} />
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/**
 * The names of cited profile files; a file opens in a dialog with its current text. A file
 * the profile no longer has is marked missing, and no name is a link when the profile
 * can't be read.
 */
export function SourceFiles({ sources, files }: { sources: string[]; files: CitedFiles }) {
  const [open, setOpen] = useState(false);
  // The dialog keeps its last file while it closes.
  const [shown, setShown] = useState<string | null>(null);

  function show(file: string) {
    setShown(file);
    setOpen(true);
  }

  return (
    <>
      <ul className="font-mono text-xs">
        {sources.map((file) => (
          <li key={file} className="break-all">
            {!files ? (
              <span className="text-muted-foreground">{file}</span>
            ) : files[file] == null ? (
              <span className="text-destructive">{file} · missing from the profile</span>
            ) : (
              <button
                type="button"
                className="cursor-pointer text-left text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => show(file)}
              >
                {file}
              </button>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-8 font-mono text-sm break-all">{shown}</DialogTitle>
            <DialogDescription>This file as it is in your profile now.</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[70vh] overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
            {shown !== null && files?.[shown]}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}
