import type { Metadata } from "next";
import { Suspense } from "react";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { SiteHeader, SiteHeaderFallback } from "@/components/site-header";
import { CartProvider } from "@/components/cart/cart-provider";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const displayFont = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const uiFont = Geist({
  variable: "--font-ui",
  subsets: ["latin"],
});

const monoFont = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Red Sneakers HQ",
    template: "%s | Red Sneakers HQ",
  },
  description: "Katalog sneakers dengan ketersediaan ukuran dan warna per lokasi.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${displayFont.variable} ${uiFont.variable} ${monoFont.variable}`}
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <CartProvider>
            <Suspense fallback={<SiteHeaderFallback />}>
              <SiteHeader />
            </Suspense>
            {children}
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
