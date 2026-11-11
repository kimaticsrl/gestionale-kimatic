"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { creaClaude } from "./shim.js";

type Props = { utente: { id: string; nome: string; email: string }; livello: string };

export default function OfferteBmtek({ utente, livello }: Props) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    const w = window as unknown as { KIMATIC_CLAUDE: unknown; KIMATIC_CLIENTI: () => Promise<unknown[]> };
    w.KIMATIC_CLAUDE = creaClaude({ supabase: sb, utente, livello });
    // Elenco dell'Anagrafica clienti, usato dalla scheda offerta per compilare i dati del cliente
    w.KIMATIC_CLIENTI = async () => {
      const tutti: unknown[] = [];
      for (let da = 0; ; da += 1000) {
        const { data } = await sb.from("clienti").select("id,nome,dati").order("nome").range(da, da + 999);
        tutti.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return tutti;
    };
    setPronto(true);
  }, [utente, livello]);
  if (!pronto) return <div className="empty">Caricamento delle offerte…</div>;
  return (
    <iframe src="/bmtek/index.html" title="Offerte BMTEK"
      style={{ width: "100%", height: "calc(100vh - 56px)", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
  );
}
