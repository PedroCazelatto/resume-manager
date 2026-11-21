"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** On narrow screens the sidebar opens from a menu button in the top bar (F35). */
export function MobileMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Open the menu" onClick={() => setOpen(true)}>
        <Icon name="list" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="bg-sidebar p-0 text-sidebar-foreground data-[side=left]:w-64"
          // Following a link closes the menu.
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}
