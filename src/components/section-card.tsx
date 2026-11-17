import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  title: ReactNode;
  description?: ReactNode;
  /** Shown at the right of the title, e.g. a status badge. */
  action?: ReactNode;
  id?: string;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}

/** A section of a page as a card with a clear title (F35). */
export function SectionCard({ title, description, action, id, className, contentClassName, children }: Props) {
  return (
    <Card id={id} className={cn("scroll-mt-20", className)}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {children && <CardContent className={contentClassName}>{children}</CardContent>}
    </Card>
  );
}
