import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
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
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
