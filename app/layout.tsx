import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trailer Stability | Native Engineering Suite",
  description: "Standalone trailer stability and optimiser application.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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
