"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { creaClaude } from "@/moduli/offerte-bmtek/shim";
import { Riquadro } from "@/moduli/riquadro";

type Utente = { id: string; nome: string; email: string };

// La pagina originale gira in un riquadro; fornitori e impostazioni stanno nella tabella rf_docs.
// I dati di claude.ai si portano qui con «Backup» sulla pagina di claude.ai e «Ripristina backup» qui.
export default function RientroFornitori({ livello, utente }: { livello: string; utente: Utente }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    (window as unknown as { KIMATIC_RF: unknown }).KIMATIC_RF =
      creaClaude({ supabase: sb, utente, livello, tabella: "rf_docs", capacita: ["db", "user", "downloads"], tempoReale: true });
    setPronto(true);
  }, [livello, utente]);
  if (!pronto) return <div className="empty">Caricamento…</div>;
  return <Riquadro modulo="rientro-fornitori" titolo="Piano di rientro fornitori" />;
}
