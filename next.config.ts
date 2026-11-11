import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // I file del modulo Offerte BMTEK vengono serviti dalla route /bmtek dopo il controllo dell'accesso
  outputFileTracingIncludes: { "/bmtek/[...path]": ["./privato/bmtek/**/*"] },
};

export default nextConfig;
