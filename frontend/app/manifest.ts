import type { MetadataRoute } from "next";

/** PWA instalable: en el celular se agrega a la pantalla de inicio con ícono
 * propio y abre a pantalla completa, como una app nativa. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bad Boys Barbershop",
    short_name: "Bad Boys",
    description:
      "Agenda tu turno, mira la fila en vivo y gestiona tu cita en Bad Boys Barbershop.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
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
