import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // I file dei moduli Offerte BMTEK, Lettere d'impegno, Costificatore e Catalogo manuali vengono serviti dalle route /bmtek, /lettere, /costificatore e /manuali dopo il controllo dell'accesso
  outputFileTracingIncludes: {
    "/bmtek/[...path]": ["./privato/bmtek/**/*"],
    "/lettere/[...path]": ["./privato/lettere/**/*"],
    "/costificatore/[...path]": ["./privato/costificatore/**/*"],
    "/manuali/[...path]": ["./privato/manuali/**/*"],
    "/piano/[...path]": ["./privato/piano/**/*"],
  },
};

export default nextConfig;
