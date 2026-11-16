"use client";
import { useEffect, useState } from "react";

// Dopo ogni aggiornamento del gestionale, una pagina aperta da prima può cercare file che non esistono
// più (ChunkLoadError): in quel caso basta ricaricare, e lo facciamo da soli una volta.
const vecchiaVersione = (e: Error) =>
  /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(`${e?.name} ${e?.message}`);

export default function Errore({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [ricarico, setRicarico] = useState(false);
  useEffect(() => {
    console.error(error);
    if (!vecchiaVersione(error)) return;
    let ultimo = 0;
    try { ultimo = Number(sessionStorage.getItem("gk-ricarica") || 0); } catch {}
    if (Date.now() - ultimo > 60000) {
      try { sessionStorage.setItem("gk-ricarica", String(Date.now())); } catch {}
      setRicarico(true);
      window.location.reload();
    }
  }, [error]);
  if (ricarico) return <div className="empty">È uscita una nuova versione del gestionale: ricarico la pagina…</div>;
  return (
    <div className="box" style={{ maxWidth: 560, margin: "40px auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <h2>Qualcosa non ha funzionato</h2>
      <p className="tag" style={{ margin: 0 }}>Di solito basta ricaricare la pagina. Se l&apos;errore si ripete, manda questo messaggio a chi gestisce il gestionale:</p>
      <code style={{ fontSize: 12, background: "var(--bg)", padding: 8, borderRadius: 6, wordBreak: "break-word" }}>{error?.name}: {error?.message}{error?.digest ? ` (${error.digest})` : ""}</code>
      <div className="row">
        <button className="btn" onClick={() => window.location.reload()}>Ricarica la pagina</button>
        <button className="btn sec" onClick={() => reset()}>Riprova</button>
      </div>
    </div>
  );
}
