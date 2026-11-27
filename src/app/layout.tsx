import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Ambient, RippleListener } from "@/components/Fx";

export const metadata: Metadata = {
  title: "DataPay",
  description: "Every hour counts. Every contribution matters.",
  icons: { icon: "/favicon-icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#060a1c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased"><Ambient /><RippleListener /><Providers>{children}</Providers></body>
    </html>
  );
}
