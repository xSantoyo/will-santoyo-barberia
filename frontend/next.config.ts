import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // imagen Docker liviana y compatible con Amplify
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
    ];
    return [
      // /embed es el widget para incrustar en otros sitios: se deja enmarcable
      { source: "/embed/:path*", headers: base },
      {
        // Todo lo demás no debe poder meterse en un iframe (clickjacking)
        source: "/((?!embed).*)",
        headers: [...base, { key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
