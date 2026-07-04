import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
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

export const metadata: Metadata = {
  title: {
    default: "Bad Boys Barbershop — Elegancia con actitud",
    template: "%s · Bad Boys Barbershop",
  },
  description:
    "Barbería en Colombia. Cortes, barba y estilo con estándar de estudio. Agenda tu turno en línea.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${anton.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-ink text-bone antialiased">{children}</body>
    </html>
  );
}
