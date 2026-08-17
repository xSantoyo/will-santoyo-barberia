import type { NextConfig } from "next";

/** Orígenes desde los que el navegador puede cargar recursos.
 *
 * El backend sirve las imágenes y los videos (`/media/`), así que su origen
 * tiene que aparecer en `img-src`, `media-src` y `connect-src` o la CSP los
 * bloquea. En producción es el dominio del CDN; en desarrollo, localhost. */
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POSTHOG = process.env.NEXT_PUBLIC_POSTHOG_KEY
  ? [process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com"]
  : [];
const TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  ? ["https://challenges.cloudflare.com"]
  : [];

/** Content-Security-Policy.
 *
 * Nota honesta sobre `'unsafe-inline'` en `script-src`: Next.js inyecta el
 * script de hidratación en línea, y quitarlo exige servir un `nonce` por
 * petición desde un middleware. Eso convierte cada página en dinámica y tira
 * abajo el renderizado estático, que es lo que hace que este sitio cargue
 * rápido en un celular con mala señal — la prioridad declarada del proyecto.
 * Se acepta el compromiso porque el resto de la política sigue cerrada
 * (`object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`) y porque
 * no hay ningún punto de inyección de HTML en la aplicación: cero usos de
 * `dangerouslySetInnerHTML`, `innerHTML` o `eval`, verificado en la auditoría.
 *
 * `style-src` también lo necesita: Tailwind v4 inyecta estilos en línea.
 */
function csp(): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    // 'unsafe-eval' SOLO en desarrollo: el recargado en caliente de Next compila
    // los módulos con eval(). En un build de producción no aparece ni un eval,
    // así que la política que llega a internet no lo lleva.
    `script-src 'self' 'unsafe-inline' ${
      process.env.NODE_ENV === "production" ? "" : "'unsafe-eval'"
    } ${[...POSTHOG, ...TURNSTILE].join(" ")}`.replace(/\s+/g, " ").trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${API}`,
    `media-src 'self' ${API}`,
    `connect-src 'self' ${API} ${POSTHOG.join(" ")}`.trim(),
    `frame-src ${TURNSTILE.length ? TURNSTILE.join(" ") : "'none'"}`,
    "font-src 'self' data:",
    // Solo en producción. En desarrollo el backend se sirve por HTTP en
    // localhost, y esta directiva reescribe esas peticiones a HTTPS: el video
    // y las fotos dejan de cargar sin que el navegador reporte un error.
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

const nextConfig: NextConfig = {
  output: "standalone", // imagen Docker liviana y compatible con Amplify
  // Sin esto Next anuncia "X-Powered-By: Next.js" en cada respuesta: le regala
  // al atacante el framework y su familia de exploits sin que tenga que mirar.
  poweredByHeader: false,
  images: {
    // Las imágenes vienen del backend local o de CloudFront: se sirven tal cual
    unoptimized: true,
  },
  async headers() {
    const base = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
      },
      { key: "Content-Security-Policy", value: csp() },
    ];
    // HSTS solo en producción: en desarrollo se sirve por HTTP y esta cabecera
    // dejaría el localhost del navegador clavado en HTTPS durante dos años.
    const prod =
      process.env.NODE_ENV === "production"
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
          ]
        : [];
    return [
      // /embed es el widget para incrustar en otros sitios: se deja enmarcable.
      // Por eso su CSP no lleva frame-ancestors 'none' — se lo quitamos aquí.
      {
        source: "/embed/:path*",
        headers: [
          ...base.filter((h) => h.key !== "Content-Security-Policy"),
          ...prod,
          {
            key: "Content-Security-Policy",
            value: csp().replace("frame-ancestors 'none'", "frame-ancestors *"),
          },
        ],
      },
      {
        // Todo lo demás no debe poder meterse en un iframe (clickjacking)
        source: "/((?!embed).*)",
        headers: [...base, ...prod, { key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
