"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Riquadro } from "@/moduli/riquadro";

type Riga = { id: string; nome: string | null; reparto: string | null; luogo: string | null; nascita: string | null; cf: string | null; assunzione: string | null };

// «Mario Rossi» → nome «Mario», cognome «Rossi» (l'ultima parola è il cognome; si corregge sul tesserino)
function dividi(completo: string) {
  const p = completo.trim().split(/\s+/);
  return p.length < 2 ? { nome: completo.trim(), cognome: "" } : { nome: p.slice(0, -1).join(" "), cognome: p[p.length - 1] };
}

// La pagina originale gira in un riquadro. I dipendenti arrivano dall'Anagrafica dipendenti
// (funzione tesserino_dipendenti: solo i dati da stampare, solo chi è in forza);
// la foto di ognuno sta nella tabella «tesserini», con lo stesso id del dipendente.
export default function TesserinoTrasferta({ livello }: { livello: string }) {
  const [pronto, setPronto] = useState(false);
  const [errore, setErrore] = useState("");
  useEffect(() => {
    const sb = supabaseBrowser();
    const modifica = livello === "gestisce" || livello === "modifica";
    Promise.all([sb.rpc("tesserino_dipendenti"), sb.from("tesserini").select("id,dati")]).then(([dip, foto]) => {
      if (dip.error) setErrore("Non riesco a leggere l'anagrafica dei dipendenti: " + dip.error.message);
      const foti = new Map((foto.data || []).map((r: { id: string; dati: { photo?: string } }) => [r.id, r.dati?.photo || ""]));
      const personale = ((dip.data || []) as Riga[]).map((r) => ({
        id: r.id, etichetta: r.nome || "Senza nome", reparto: r.reparto || "", ...dividi(r.nome || ""),
        luogo: r.luogo || "", nascita: r.nascita || "", cf: (r.cf || "").toUpperCase(), assunzione: r.assunzione || "",
        photo: foti.get(r.id) || "",
      }));
      (window as unknown as { KIMATIC_TES: unknown }).KIMATIC_TES = {
        personale: () => JSON.parse(JSON.stringify(personale)),
        salvaFoto: async (id: string, photo: string) => {
          if (!modifica) return false;
          const { error } = await sb.from("tesserini").upsert({ id, dati: { photo } });
          return !error;
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
