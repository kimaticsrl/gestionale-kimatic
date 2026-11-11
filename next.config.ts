import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // I file dei moduli Offerte BMTEK e Lettere d'impegno vengono serviti dalle route /bmtek e /lettere dopo il controllo dell'accesso
  outputFileTracingIncludes: {
    "/bmtek/[...path]": ["./privato/bmtek/**/*"],
    "/lettere/[...path]": ["./privato/lettere/**/*"],
  },
};

export default nextConfig;
