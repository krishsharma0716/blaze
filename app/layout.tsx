/**
 * Root layout for the judge-facing Next.js app.
 * Connected to app/page.tsx and app/globals.css.
 * It does not fetch data.
 */
import type { ReactNode } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata = {
  title: "Wildfire map and NYC brief",
  description: "Live incident board for the wildfire and NYC call brief.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
