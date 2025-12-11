import type { Metadata } from "next";
import "@fontsource/libre-barcode-128";
import "@fontsource/libre-barcode-39";
import "./globals.css";
import AsteroidCatWrapper from "./components/AsteroidCatWrapper";

export const metadata: Metadata = {
  title: "Stasis - Hack Club Hardware Hackathon",
  description: "50/50 Hardware Hackathon - February 2026 - Austin, Texas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.svg" />
      </head>
      <body className="antialiased">
        {children}
        <AsteroidCatWrapper />
      </body>
    </html>
  );
}
