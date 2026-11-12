import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // I file dei moduli Offerte BMTEK, Lettere d'impegno e Costificatore vengono serviti dalle route /bmtek, /lettere e /costificatore dopo il controllo dell'accesso
  outputFileTracingIncludes: {
    "/bmtek/[...path]": ["./privato/bmtek/**/*"],
    "/lettere/[...path]": ["./privato/lettere/**/*"],
    "/costificatore/[...path]": ["./privato/costificatore/**/*"],
  },
};

export default nextConfig;
