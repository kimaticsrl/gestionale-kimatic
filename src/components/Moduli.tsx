import Link from "next/link";
import { NOME_LIVELLO, type Livello } from "@/lib/livelli";

export type Modulo = { id: string; reparto_id: string; nome: string; descrizione: string; livello: Livello; ordine: number };
export type Reparto = { id: string; nome: string; sigla: string };

export default function Moduli({ moduli, reparti }: { moduli: Modulo[]; reparti: Reparto[] }) {
  if (!moduli.length) return <div className="empty">Non hai ancora accesso a nessun modulo. Chiedi a un amministratore di assegnarti un ruolo.</div>;
  return (
    <>
      {reparti.filter((r) => moduli.some((m) => m.reparto_id === r.id)).map((r) => {
        const lista = moduli.filter((m) => m.reparto_id === r.id);
        return (
          <section key={r.id} className="group" style={{ "--c": `var(--${r.id})` } as React.CSSProperties}>
            <div className="ghead"><h2>{r.nome}</h2></div>
            <div className="grid">
              {lista.map((m, i) => (
                <Link key={m.id} className="card" href={`/moduli/${m.id}`} style={{ "--c": `var(--${r.id})` } as React.CSSProperties}>
                  <span className="code">{r.sigla}-{String(i + 1).padStart(2, "0")}<span className={`chip ${m.livello}`}>{NOME_LIVELLO[m.livello]}</span></span>
                  <h3>{m.nome}</h3>
                  <p>{m.descrizione}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
