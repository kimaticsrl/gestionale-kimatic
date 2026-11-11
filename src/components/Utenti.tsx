"use client";
import { useTransition, useState } from "react";
import { impostaProfilo, impostaRuolo } from "@/app/(app)/azioni";

type P = { id: string; email: string; nome: string; is_admin: boolean; attivo: boolean; ruoli: string[] };

export default function Utenti({ persone, ruoli, io }: { persone: P[]; ruoli: { id: string; nome: string }[]; io: string }) {
  const [pending, start] = useTransition();
  const [errore, setErrore] = useState("");
  const esegui = (fn: () => Promise<void>) => start(async () => {
    setErrore("");
    try { await fn(); } catch (e) { setErrore(e instanceof Error ? e.message : "Operazione non riuscita"); }
  });

  return (
    <div className="box" style={{ opacity: pending ? 0.7 : 1 }}>
      <h2>Persone con accesso</h2>
      <p className="tag">Spunta i ruoli di ogni persona: le modifiche si salvano subito.</p>
      {errore && <div className="msg err" role="alert">{errore}</div>}
      <div className="mx">
        <table style={{ minWidth: 760 }}>
          <thead><tr><th>Persona</th><th>Ruoli</th><th>Amministratore</th><th>Accesso</th></tr></thead>
          <tbody>
            {persone.map((p) => (
              <tr key={p.id} style={{ opacity: p.attivo ? 1 : 0.55 }}>
                <td><b>{p.nome || p.email}</b><small>{p.email}</small></td>
                <td>
                  {ruoli.map((r) => (
                    <label key={r.id} className="ck">
                      <input type="checkbox" checked={p.ruoli.includes(r.id)}
                        onChange={(e) => esegui(() => impostaRuolo(p.id, r.id, e.target.checked))} />
                      {r.nome}
                    </label>
                  ))}
                </td>
                <td>
                  <input type="checkbox" aria-label={`${p.nome || p.email} amministratore`} checked={p.is_admin} disabled={p.id === io}
                    onChange={(e) => esegui(() => impostaProfilo(p.id, "is_admin", e.target.checked))} />
                </td>
                <td>
                  {p.id === io ? <small>Sei tu</small> : (
                    <button type="button" className={`btn ${p.attivo ? "danger" : "sec"}`}
                      onClick={() => esegui(() => impostaProfilo(p.id, "attivo", !p.attivo))}>
                      {p.attivo ? "Disattiva" : "Riattiva"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
