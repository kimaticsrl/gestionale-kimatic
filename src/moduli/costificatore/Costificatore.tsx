"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { creaClaude } from "@/moduli/offerte-bmtek/shim";

const ID = "costificatore/parametri";
type Utente = { id: string; nome: string; email: string };

// La pagina originale gira in un riquadro. L'archivio (componenti e preventivi) sta nella
// tabella cost_docs ed è condiviso; tariffe, materiali e trattamenti in «impostazioni».
export default function Costificatore({ livello, utente }: { livello: string; utente: Utente }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    let attesa: ReturnType<typeof setTimeout> | undefined;
    sb.from("impostazioni").select("dati").eq("id", ID).maybeSingle().then(({ data }) => {
      const parametri = data?.dati && Object.keys(data.dati).length ? data.dati : null;
      (window as unknown as { KIMATIC_COST: unknown }).KIMATIC_COST = {
        parametri: () => (parametri ? JSON.parse(JSON.stringify(parametri)) : null),
        salvaParametri: (S: unknown) => {
          if (livello !== "gestisce") return;
          clearTimeout(attesa);
          attesa = setTimeout(() => { sb.from("impostazioni").upsert({ id: ID, modulo_id: "costificatore", dati: S }).then(() => {}); }, 1000);
        },
        // archivio: 'data/users/<id>/archivio/componenti' → raccolta 'componenti'
        claude: creaClaude({ supabase: sb, utente, livello, tabella: "cost_docs", raccolta: (c: string) => c.split("/").pop() || c, capacita: ["db", "user", "downloads"] }),
      };
      setPronto(true);
    });
    return () => clearTimeout(attesa);
  }, [livello, utente]);
  if (!pronto) return <div className="empty">Caricamento…</div>;
  return (
    <iframe src="/costificatore/index.html" title="Costificatore pezzi meccanici"
      style={{ width: "100%", height: "calc(100vh - 56px)", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
  );
}
