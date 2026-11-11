"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const ID = "lettere-impegno/minimi";

// La pagina originale (calcolo e lettera Word) gira in un riquadro; i minimi tabellari
// sono salvati nel gestionale, così sono gli stessi per tutti.
export default function LettereImpegno({ gestisce }: { gestisce: boolean }) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    const sb = supabaseBrowser();
    let attesa: ReturnType<typeof setTimeout> | undefined;
    sb.from("impostazioni").select("dati").eq("id", ID).maybeSingle().then(({ data }) => {
      let salvati: string | null = data?.dati && Object.keys(data.dati).length ? JSON.stringify(data.dati) : null;
      (window as unknown as { KIMATIC_LETTERE: unknown }).KIMATIC_LETTERE = {
        minimi: () => salvati,
        salvaMinimi: (m: Record<string, number> | null) => {
          if (!gestisce) return;
          salvati = m ? JSON.stringify(m) : null;
          clearTimeout(attesa);
          attesa = setTimeout(() => {
            if (m) sb.from("impostazioni").upsert({ id: ID, modulo_id: "lettere-impegno", dati: m }).then(() => {});
            else sb.from("impostazioni").delete().eq("id", ID).then(() => {});
          }, 800);
        },
      };
      setPronto(true);
    });
    return () => clearTimeout(attesa);
  }, [gestisce]);
  if (!pronto) return <div className="empty">Caricamento…</div>;
  return (
    <iframe src="/lettere/index.html" title="Lettere d'impegno"
      style={{ width: "100%", height: "calc(100vh - 56px)", border: "1px solid var(--line)", borderRadius: 10, background: "#fff" }} />
  );
}
