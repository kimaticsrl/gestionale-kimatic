"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { creaClaude } from "@/moduli/offerte-bmtek/shim";

type Utente = { id: string; nome: string; email: string };
const nuovoId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

// La pagina originale del catalogo gira in un riquadro: i dati stanno nella tabella man_docs,
// i PDF nell'archivio file privato «manuali» (un file <id>.pdf per ogni manuale).
export default function Manuali({ livello, utente }: { livello: string; utente: Utente }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    const base = creaClaude({ supabase: sb, utente, livello, tabella: "man_docs", capacita: ["db", "user", "downloads"] }) as { use: (n: string) => Promise<unknown> };
    const assets = {
      async upload(file: File) {
        const id = nuovoId();
        const { error } = await sb.storage.from("manuali").upload(`${id}.pdf`, file, { contentType: "application/pdf" });
        if (error) throw Object.assign(new Error(error.message), { code: /size|large/i.test(error.message) ? "too_large" : "upload" });
        return { id, sizeBytes: file.size };
      },
    };
    const puo = livello === "modifica" || livello === "gestisce";
    (window as unknown as { KIMATIC_MAN: unknown }).KIMATIC_MAN = {
      use: async (n: string) => (n === "assets" ? (puo ? assets : null) : base.use(n)),
    };
    setPronto(true);
  }, [livello, utente]);
  if (!pronto) return <div className="empty">Caricamento…</div>;
  return (
    <iframe src="/manuali/index.html" title="Catalogo manuali BMTEK"
      style={{ width: "100%", height: "calc(100vh - 56px)", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
  );
}
