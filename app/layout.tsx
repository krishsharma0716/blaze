/**
 * Root layout for the judge-facing Next.js app.
 * Connected to app/page.tsx and app/globals.css.
 * It does not fetch data.
 */
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Incident board",
  description: "Live incident board for the wildfire and NYC call brief.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
