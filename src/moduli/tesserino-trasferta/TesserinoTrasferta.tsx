"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Riquadro } from "@/moduli/riquadro";

type Dip = Record<string, unknown> & { _id?: string; cognome?: string };

// La pagina originale gira in un riquadro. L'elenco dei dipendenti salvati (dati e foto)
// sta nella tabella «tesserini», condiviso da chi usa il modulo (su claude.ai era solo nel browser).
export default function TesserinoTrasferta({ livello }: { livello: string }) {
  const [pronto, setPronto] = useState(false);
  const [errore, setErrore] = useState("");
  useEffect(() => {
    const sb = supabaseBrowser();
    const modifica = livello === "gestisce" || livello === "modifica";
    let lista: Dip[] = [];
    sb.from("tesserini").select("id,dati").then(({ data, error }) => {
      if (error) setErrore("Non riesco a leggere i dipendenti salvati: " + error.message);
      lista = (data || []).map((r: { id: string; dati: Dip }) => ({ ...r.dati, _id: r.id }))
        .sort((a, b) => String(a.cognome || "").localeCompare(String(b.cognome || "")));
      (window as unknown as { KIMATIC_TES: unknown }).KIMATIC_TES = {
        lista: () => JSON.parse(JSON.stringify(lista)),
        salva: (nuova: Dip[]) => {
          if (!modifica) { setErrore("Puoi creare i tesserini, ma per salvare i dipendenti nell'elenco serve il livello «Modifica»."); return; }
          const prima = new Set(lista.map((d) => d._id));
          lista = nuova.map((d) => ({ ...d, _id: d._id || crypto.randomUUID() }));
          const ora = new Set(lista.map((d) => d._id));
          const togli = [...prima].filter((id) => id && !ora.has(id)) as string[];
          const righe = lista.filter((d) => !prima.has(d._id)).map(({ _id, ...dati }) => ({ id: _id as string, dati }));
          (async () => {
            if (righe.length) { const { error } = await sb.from("tesserini").upsert(righe); if (error) setErrore("Dipendente non salvato: " + error.message); }
            if (togli.length) { const { error } = await sb.from("tesserini").delete().in("id", togli); if (error) setErrore("Dipendente non eliminato: " + error.message); }
          })();
        },
      };
      setPronto(true);
    });
  }, [livello]);
  if (!pronto) return <div className="empty">Caricamento…</div>;
  return (
    <>
      {errore && <div className="box" style={{ marginBottom: 8, padding: "8px 12px" }}><b>{errore}</b></div>}
      <Riquadro modulo="tesserino-trasferta" titolo="Tesserino trasferta" alto={errore ? 46 : 0} />
    </>
  );
}
