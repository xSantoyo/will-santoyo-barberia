import type { Metadata, Viewport } from "next";
import { Anton, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Utilitaria de datos: precios, horas, códigos, etiquetas — el vocabulario
// material de la barbería (etiqueta de precio, recibo, números de guarda).
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bad Boys Barbershop — Elegancia con actitud",
    template: "%s · Bad Boys Barbershop",
  },
  description:
    "Barbería en Colombia. Cortes, barba y estilo con estándar de estudio. Agenda tu turno en línea.",
  appleWebApp: {
    capable: true,
    title: "Bad Boys",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  viewportFit: "cover", // respeta el notch: la barra fija usa safe-area-inset
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${anton.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
