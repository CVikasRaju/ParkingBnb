import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ParkPeer — parking, found in seconds",
    template: "%s · ParkPeer",
  },
  description:
    "ParkPeer is a real-time peer-to-peer parking marketplace. Atomic 10-minute holds prevent double bookings, check-in is verified by QR, PIN and geofence, and host payouts settle automatically through escrow.",
  keywords: [
    "parking",
    "peer-to-peer parking",
    "parking marketplace",
    "driveway rental",
    "parking app",
  ],
  openGraph: {
    title: "ParkPeer — parking, found in seconds",
    description:
      "Reserve verified private parking with an atomic 10-minute hold, verified check-in and automatic host payouts.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-ink-950 text-mist-100">
        {children}
      </body>
    </html>
  );
}
