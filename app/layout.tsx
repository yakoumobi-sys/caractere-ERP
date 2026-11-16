import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Caractère ERP", description: "ERP de l'atelier Caractère — Aïn Benian" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#6d28d9" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
