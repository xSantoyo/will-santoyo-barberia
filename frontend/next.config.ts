import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // imagen Docker liviana y compatible con Amplify
  images: {
    // Las imágenes vienen del backend local o de CloudFront: se sirven tal cual
    unoptimized: true,
  },
};

export default nextConfig;
