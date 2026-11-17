import type { Metadata } from "next";
import { AppName, SidebarContent } from "@/components/app-sidebar";
import { MobileMenu } from "@/components/mobile-menu";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Manager",
  description: "Tailored resumes from your own profile, written by a local model.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script adds the `dark` class before React hydrates, so the DOM wins here.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <div className="flex min-h-svh flex-col md:flex-row">
          {/* A sidebar on wide screens, a top bar with a menu on narrow ones (F35). */}
          <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
            <SidebarContent />
          </aside>
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-sidebar px-2 text-sidebar-foreground md:hidden">
            <AppName />
            <MobileMenu>
              <SidebarContent />
            </MobileMenu>
          </header>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
