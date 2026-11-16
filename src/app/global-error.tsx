"use client";
import Errore from "@/components/Errore";
import "./globals.css";

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it"><body><Errore {...props} /></body></html>
  );
}
