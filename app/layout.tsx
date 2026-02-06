import type { Metadata } from "next";
import { Libre_Barcode_128, Libre_Barcode_39 } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import AsteroidCatWrapper from "./components/AsteroidCatWrapper";

const departureMono = localFont({
  src: "../public/fonts/DepartureMono-Regular.woff2",
  variable: "--font-mono",
  display: "swap",
});

const libreBarcode128 = Libre_Barcode_128({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-barcode",
});

const libreBarcode39 = Libre_Barcode_39({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-qr",
});

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
      <body className={`antialiased ${departureMono.variable} ${libreBarcode128.variable} ${libreBarcode39.variable}`}>
        {children}
        <AsteroidCatWrapper />
      </body>
    </html>
  );
}
