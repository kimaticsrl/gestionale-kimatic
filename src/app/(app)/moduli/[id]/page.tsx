import { notFound } from "next/navigation";
import { NOME_LIVELLO, utenteCorrente, type Livello } from "@/lib/dati";

const COSA: Record<Livello, string> = {
  gestisce: "Puoi vedere, modificare e cancellare i dati, configurare il modulo e vedere lo storico delle modifiche.",
  modifica: "Puoi vedere i dati e inserirli o modificarli.",
  legge: "Puoi vedere i dati ma non modificarli.",
  nessuno: "",
};

export default async function PaginaModulo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await utenteCorrente();
  const { data } = await supabase.rpc("miei_moduli");
  const m = (data ?? []).find((x: { id: string }) => x.id === id) as
    | { nome: string; descrizione: string; link_attuale: string | null; migrato: boolean; livello: Livello }
    | undefined;
  if (!m) notFound();
  return (
    <>
      <header>
        <h1>{m.nome}</h1>
        <p className="sub">{m.descrizione}</p>
      </header>
      <div className="box">
        <h2>Il tuo accesso: <span className={`chip ${m.livello}`}>{NOME_LIVELLO[m.livello]}</span></h2>
        <p className="tag">{COSA[m.livello]}</p>
      </div>
      {!m.migrato && (
        <div className="box">
          <h2>In arrivo nel nuovo gestionale</h2>
          <p className="tag">Questo modulo non è ancora stato trasferito. Nel frattempo continua a usare la versione attuale su claude.ai.</p>
          {m.link_attuale && <a className="btn" href={m.link_attuale} target="_blank" rel="noopener">Apri la versione attuale ↗</a>}
        </div>
      )}
    </>
  );
}
