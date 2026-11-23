"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// CSS pixels per millimetre; A4 is the page size when the template's @page sets none.
const PX_PER_MM = 96 / 25.4;
const A4 = { width: 210 * PX_PER_MM, height: 297 * PX_PER_MM };

interface PageBox {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

/** Reads the page size and margins from the template's @page rule, in CSS pixels. */
function pageBox(doc: Document): PageBox {
  const probe = doc.createElement("div");
  probe.style.position = "absolute";
  doc.body.append(probe);
  const px = (length: string) => {
    probe.style.width = "0";
    probe.style.width = length;
    return probe.getBoundingClientRect().width;
  };

  const box: PageBox = { ...A4, margin: { top: 0, right: 0, bottom: 0, left: 0 } };
  for (const sheet of doc.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (!rule.cssText.startsWith("@page")) continue;
      const style = (rule as CSSPageRule).style;
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const value = style.getPropertyValue(`margin-${side}`);
        if (value) box.margin[side] = px(value);
      }
      const size = style.getPropertyValue("size").trim().split(/\s+/);
      if (size.length === 2 && px(size[0]) > 0 && px(size[1]) > 0) {
        box.width = px(size[0]);
        box.height = px(size[1]);
      }
    }
  }
  probe.remove();
  return box;
}

interface Measured {
  page: PageBox;
  contentHeight: number;
  pages: number;
}

/**
 * The rendered resume at its printed width, scaled to fit (F20). The frame runs no
 * scripts; the app reads its layout to count pages and to open the print dialog (F22).
 * `onLoaded` is told once the frame's document has loaded and been measured (F26).
 */
export function ResumePreview({
  html,
  maxPages,
  frameRef,
  onLoaded,
}: {
  html: string;
  maxPages?: number;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onLoaded?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [measured, setMeasured] = useState<Measured | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function measure() {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    const page = pageBox(doc);
    const { top, right, bottom, left } = page.margin;
    // On screen the page margins become padding, so lines wrap as they do on paper.
    const style = doc.createElement("style");
    style.textContent = `@media screen { html { box-sizing: border-box; width: ${page.width}px; padding: ${top}px ${right}px ${bottom}px ${left}px; } }`;
    doc.head.append(style);
    const contentHeight = doc.body.getBoundingClientRect().height;
    const pages = Math.max(1, Math.ceil((contentHeight - 1) / (page.height - top - bottom)));
    setMeasured({ page, contentHeight, pages });
    onLoaded?.();
  }

  const page = measured?.page ?? { ...A4, margin: { top: 0, right: 0, bottom: 0, left: 0 } };
  const frameHeight = Math.max(page.height, (measured?.contentHeight ?? 0) + page.margin.top + page.margin.bottom);
  const scale = containerWidth > 0 ? containerWidth / page.width : 1;

  return (
    <div className="space-y-2">
      <div
        ref={container}
        className="overflow-hidden rounded-lg border bg-white"
        style={{ height: frameHeight * scale }}
      >
        <iframe
          ref={frameRef}
          title="Resume preview"
          sandbox="allow-same-origin allow-modals"
          srcDoc={html}
          onLoad={measure}
          style={{ width: page.width, height: frameHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
      </div>
      {measured && (
        <p className={`text-sm ${maxPages && measured.pages > maxPages ? "text-destructive" : "text-muted-foreground"}`}>
          About {measured.pages} page{measured.pages === 1 ? "" : "s"}
          {maxPages && measured.pages > maxPages
            ? `: longer than the template's limit of ${maxPages}. You can still print it.`
            : maxPages
              ? ` (the template allows ${maxPages}).`
              : "."}
        </p>
      )}
    </div>
  );
}
