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
  title: "Stasis",
  description: "A High School Hardware Hackathon in Austin, TX on May 15-19",
  themeColor:"#C4B9A2",
  openGraph: {
    title: "Stasis",
    description: "A High School Hardware Hackathon in Austin, TX on May 15-19",
    siteName: "Stasis",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stasis",
    description: "A High School Hardware Hackathon in Austin, TX on May 15-19",
  },
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
        <meta name="msapplication-navbutton-color" content="#C4B9A2" />
        <meta name="apple-mobile-web-app-status-bar-style" content="#C4B9A2" />
      </head>
      <body className={`antialiased ${departureMono.variable} ${libreBarcode128.variable} ${libreBarcode39.variable}`}>
        {children}
        <AsteroidCatWrapper />
      </body>
    </html>
  );
}
