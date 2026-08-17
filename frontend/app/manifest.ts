import type { MetadataRoute } from "next";

/** PWA instalable: en el celular se agrega a la pantalla de inicio con ícono
 * propio y abre a pantalla completa, como una app nativa. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Will Barber Shop — Barbero en Soacha",
    // Bajo el ícono de la pantalla de inicio caben ~12 caracteres: "Will
    // Barber Shop" se cortaría a "Will Barbers…", así que ahí va solo "Will".
    short_name: "Will",
    description:
      "Agenda tu turno con Will, mira la fila en vivo y gestiona tu cita.",
    start_url: "/",
    display: "standalone",
    // Paleta «Después de las 6»: si esto queda en el crema viejo, el splash de
    // la PWA parpadea en claro antes de abrir un sitio oscuro.
    background_color: "#141210",
    theme_color: "#141210",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
