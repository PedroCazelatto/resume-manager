import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Manager",
  description: "Tailored resumes from your own profile, written by a local model.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
