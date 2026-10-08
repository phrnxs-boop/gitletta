import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Swixo runs the floor for Indian restaurants: point-of-sale, live order flow, " +
  "QR table ordering, staff PIN sessions, reservations, analytics and GST-compliant bills.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Swixo — Restaurant POS & QR Ordering",
    template: "%s · Swixo",
  },
  description: DESCRIPTION,
  applicationName: "Swixo",
  keywords: [
    "restaurant POS",
    "QR ordering",
    "restaurant software India",
    "GST billing",
    "table ordering",
  ],
  openGraph: {
    type: "website",
    siteName: "Swixo",
    title: "Swixo — Restaurant POS & QR Ordering",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Swixo — Restaurant POS & QR Ordering",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%23ff7e6b'/%3E%3Ctext x='16' y='22' font-size='18' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='bold'%3ES%3C/text%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ff7e6b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script to prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var stored = localStorage.getItem('tablo-theme');
                var theme = stored || 'dark';
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch(e) {
                document.documentElement.classList.add('dark');
              }
            })();
          `
        }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <Sonner />
      </body>
    </html>
  );
}
