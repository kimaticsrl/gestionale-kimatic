import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // I file dei moduli Offerte BMTEK, Lettere d'impegno, Costificatore, Catalogo manuali, Piano produzione e Controllo di gestione vengono serviti dalle route /bmtek, /lettere, /costificatore, /manuali, /piano e /cdg (Rateizzazioni, Rientro fornitori, Tesserino da /pagine/<modulo>) dopo il controllo dell'accesso
  outputFileTracingIncludes: {
    "/bmtek/[...path]": ["./privato/bmtek/**/*"],
    "/lettere/[...path]": ["./privato/lettere/**/*"],
    "/costificatore/[...path]": ["./privato/costificatore/**/*"],
    "/manuali/[...path]": ["./privato/manuali/**/*"],
    "/piano/[...path]": ["./privato/piano/**/*"],
    "/cdg/[...path]": ["./privato/cdg/**/*"],
    "/pagine/[modulo]/[...path]": ["./privato/rateizzazioni/**/*", "./privato/rientro/**/*", "./privato/tesserino/**/*"],
  },
};

export default nextConfig;
