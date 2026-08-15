import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { Toaster } from "sonner";
import { DIRECCION_COMPLETA, NEGOCIO } from "@/lib/negocio";
import "./globals.css";

// Única fuente descargada: la voz de marca vive en los titulares (Fraunces,
// serif óptica). Cuerpo y datos usan las pilas del sistema — apple-design §15.
const fraunces = Fraunces({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const DESCRIPCION =
  `Barbero profesional en ${NEGOCIO.ciudad}, ${NEGOCIO.region}. Fades, barba y ` +
  "diseño, con cita reservada en línea. Sin filas, sin llamadas.";

export const metadata: Metadata = {
  metadataBase: new URL("https://willsantoyo.com"),
  title: {
    default: `Will Santoyo — Barbero en ${NEGOCIO.ciudad}`,
    template: "%s · Will Santoyo",
  },
  description: DESCRIPCION,
  keywords: [
    "barbero Soacha",
    "barbería Soacha",
    "corte de cabello Soacha",
    "fade Soacha",
    "barbería Cundinamarca",
    "Will Santoyo",
    "reservar turno barbería",
  ],
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Will Santoyo",
    title: `Will Santoyo — Barbero en ${NEGOCIO.ciudad}`,
    description: DESCRIPCION,
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: {
    capable: true,
    title: "Will Santoyo",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f1eee6",
  viewportFit: "cover", // respeta el notch: la barra fija usa safe-area-inset
};

/** Negocio local con Will como profesional único. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "HairSalon",
  name: NEGOCIO.nombre,
  description: DESCRIPCION,
  image: "/icon.png",
  address: {
    "@type": "PostalAddress",
    streetAddress: NEGOCIO.calle,
    addressLocality: NEGOCIO.ciudad,
    addressRegion: NEGOCIO.region,
    addressCountry: NEGOCIO.pais,
  },
  telephone: NEGOCIO.telefonoE164,
  priceRange: "$$",
  currenciesAccepted: "COP",
  sameAs: [NEGOCIO.instagram, NEGOCIO.tiktok, NEGOCIO.facebook],
  founder: {
    "@type": "Person",
    name: NEGOCIO.nombre,
    jobTitle: NEGOCIO.oficio,
    sameAs: [NEGOCIO.instagram],
  },
  employee: {
    "@type": "Person",
    name: NEGOCIO.nombre,
    jobTitle: NEGOCIO.oficio,
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday"],
      opens: "09:00",
      closes: "19:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Friday",
      opens: "09:00",
      closes: "20:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: "Saturday",
      opens: "08:00",
      closes: "18:00",
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={fraunces.variable}>
      <body className="min-h-screen bg-paper text-ink antialiased">
        <script
          type="application/ld+json"
          // Objeto propio y estático: no hay entrada de usuario que escapar.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        {children}
        {/* Un solo Toaster, montado en la raíz: dos duplicarían cada aviso. */}
        <Toaster
          theme="light"
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: "!bg-card !border-line !text-ink !rounded-sm",
              title: "!font-semibold",
              description: "!text-ink-soft",
            },
          }}
        />
      </body>
    </html>
  );
}
