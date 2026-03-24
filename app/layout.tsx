import type { Metadata } from "next";
import { Libre_Barcode_128, Libre_Barcode_39 } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import AsteroidCatWrapper from "./components/AsteroidCatWrapper";
import EventJsonLd from "./components/EventJsonLd";

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
  metadataBase: new URL("https://stasis.hackclub.com"),
  title: "Stasis | High School Hardware Hackathon in Austin, TX",
  description: "A High School Hardware Hackathon in Austin, TX on May 15-18. Build hardware projects, earn badges, and qualify for up to $350 in funding.",
  keywords: ["hackathon", "hardware", "high school", "Austin TX", "Hack Club", "electronics", "PCB", "maker", "engineering", "STEM"],
  themeColor:"#C4B9A2",
  icons: {
    icon: "/favicon.svg",
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://stasis.hackclub.com" },
  openGraph: {
    title: "Stasis | High School Hardware Hackathon in Austin, TX",
    description: "A High School Hardware Hackathon in Austin, TX on May 15-18. Build hardware projects, earn badges, and qualify for up to $350 in funding.",
    siteName: "Stasis",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Stasis - High School Hardware Hackathon",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Stasis | High School Hardware Hackathon in Austin, TX",
    description: "A High School Hardware Hackathon in Austin, TX on May 15-18. Build hardware projects, earn badges, and qualify for up to $350 in funding.",
    images: ["/og-image.jpg"],
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
        <meta name="msapplication-navbutton-color" content="#C4B9A2" />
        <meta name="apple-mobile-web-app-status-bar-style" content="#C4B9A2" />
        <Script
          defer
          src="https://plausible.io/js/pa-dauQpiTVbXInL_522ZKfx.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-init" strategy="afterInteractive">
          {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`}
        </Script>
      </head>
      <body className={`antialiased ${departureMono.variable} ${libreBarcode128.variable} ${libreBarcode39.variable}`}>
        <EventJsonLd />
        {children}
        <AsteroidCatWrapper />
      </body>
    </html>
  );
}
