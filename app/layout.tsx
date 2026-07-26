import type { Metadata } from "next";
import "./globals.css";
import { assetPath } from "./site-path";

export const metadata: Metadata = {
  title: "Trailer Stability | Native Engineering Suite",
  description: "Standalone trailer stability and optimiser application.",
  manifest: assetPath("/manifest.webmanifest"),
  icons: {
    icon: assetPath("/favicon.svg"),
    shortcut: assetPath("/favicon.svg"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
