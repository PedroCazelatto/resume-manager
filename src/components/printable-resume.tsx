"use client";

import { useRef } from "react";
import { ResumePreview } from "@/components/resume-preview";
import { Button } from "@/components/ui/button";

/**
 * The printable resume that "View PDF" opens (F26): the same HTML as the application page's
 * preview, printed the same way, through the browser's print dialog (Art. V.9, F22). The dialog
 * opens once, as soon as the resume has loaded, so "Save as PDF" is one step away; the button
 * opens it again.
 */
export function PrintableResume({ html, maxPages }: { html: string; maxPages?: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const opened = useRef(false);
  const print = () => frame.current?.contentWindow?.print();

  function loaded() {
    if (opened.current) return;
    opened.current = true;
    // After the preview has shown its page count.
    setTimeout(print, 0);
  }

  return (
    <div className="space-y-3">
      <Button onClick={print}>Print / Save as PDF</Button>
      <ResumePreview html={html} maxPages={maxPages} frameRef={frame} onLoaded={loaded} />
    </div>
  );
}
