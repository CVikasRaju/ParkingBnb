import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import "./globals.css";

/* Display: automotive/geometric. Data: monospaced, so countdowns, GPS
   coordinates, plates and PINs never jitter as the digits change. */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ParkPeer — Park anywhere. Own the curb.",
    template: "%s · ParkPeer",
  },
  description:
    "ParkPeer is a peer-to-peer parking marketplace. Lock a private driveway in ten minutes, arrive to a verified gate, and settle automatically when you leave.",
  keywords: [
    "parking",
    "peer-to-peer parking",
    "parking marketplace",
    "driveway rental",
    "parking app",
  ],
  openGraph: {
    title: "ParkPeer — Park anywhere. Own the curb.",
    description:
      "A real-time marketplace for private parking: 10-minute atomic holds, QR and geofence check-in, automatic payouts.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#090e1a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${jakarta.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('parkpeer-theme') || 'dark';
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(saved);
                  document.documentElement.setAttribute('data-theme', saved);
                  document.documentElement.style.colorScheme = saved;
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full bg-obsidian font-sans text-slate-200 transition-colors duration-200">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
