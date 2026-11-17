"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A sidebar entry; `current` highlights it (F35). */
export function NavItem({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-8 items-center justify-between gap-2 rounded-md px-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        current && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}

/** A sidebar entry that is highlighted on its own page. It reads the URL, so it renders inside `<Suspense>`. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <NavItem href={href} current={usePathname() === href}>
      {children}
    </NavItem>
  );
}
