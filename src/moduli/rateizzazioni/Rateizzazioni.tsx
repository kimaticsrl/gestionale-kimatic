"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { creaClaude } from "@/moduli/offerte-bmtek/shim";
import { Riquadro } from "@/moduli/riquadro";

type Utente = { id: string; nome: string; email: string };
type Base = { use: (n: string) => Promise<unknown> };

// La pagina originale gira in un riquadro; i piani stanno nella tabella rt_docs.
// Modifica chi ha almeno «Modifica» sul modulo. I dati di claude.ai si portano qui con
// «Backup» sulla pagina di claude.ai e «Ripristina backup» qui.
export default function Rateizzazioni({ livello, utente }: { livello: string; utente: Utente }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    const modifica = livello === "gestisce" || livello === "modifica";
    const base = creaClaude({ supabase: sb, utente, livello, tabella: "rt_docs", capacita: ["db", "user", "downloads"], tempoReale: true }) as Base;
    const user = { id: async () => utente.id, canEdit: async () => modifica, can: async (k: string) => (k === "data.write" ? modifica : null) };
    (window as unknown as { KIMATIC_RT: unknown }).KIMATIC_RT = {
      use: async (n: string) => (n === "user" ? user : base.use(n)),
    };
    setPronto(true);
  }, [livello, utente]);
  if (!pronto) return <div className="empty">Caricamento…</div>;
  return <Riquadro modulo="rateizzazioni" titolo="Rateizzazioni fiscali" />;
}
