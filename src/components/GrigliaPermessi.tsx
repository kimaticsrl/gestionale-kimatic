"use client";
import { useState, useTransition } from "react";
import { impostaPermesso } from "@/app/(app)/azioni";
import { LIVELLI, NOME_LIVELLO, type Livello } from "@/lib/livelli";

type Props = {
  ruoli: { id: string; nome: string }[];
  moduli: { id: string; nome: string; sigla: string; reparto: string; nomeReparto: string }[];
  iniziale: Record<string, Livello>;
};

export default function GrigliaPermessi({ ruoli, moduli, iniziale }: Props) {
  const [valori, setValori] = useState(iniziale);
  const [stato, setStato] = useState("");
  const [, start] = useTransition();

  function cambia(ruolo: string, modulo: string, livello: Livello) {
    const k = `${ruolo}|${modulo}`;
    const prima = valori[k];
    setValori((v) => ({ ...v, [k]: livello }));
    setStato("Salvo…");
    start(async () => {
      try { await impostaPermesso(ruolo, modulo, livello); setStato("Salvato"); }
      catch { setValori((v) => ({ ...v, [k]: prima })); setStato("Non salvato: riprova"); }
    });
  }

  return (
    <div className="box">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="tag" style={{ margin: 0 }}>Ogni modifica si salva da sola e vale subito per tutti.</p>
        <span className="tag" style={{ margin: 0 }} aria-live="polite">{stato}</span>
      </div>
      <div className="mx">
        <table style={{ minWidth: 980 }}>
          <thead><tr><th>Modulo</th>{ruoli.map((r) => <th key={r.id}>{r.nome}</th>)}</tr></thead>
          <tbody>
            {moduli.map((m, i) => {
              const c = `var(--${m.reparto})`;
              const primo = i === 0 || moduli[i - 1].reparto !== m.reparto;
              return [
              primo && (
                <tr key={"g-" + m.reparto}>
                  <td colSpan={ruoli.length + 1} style={{ background: `color-mix(in srgb,${c} 16%,var(--surface))`, borderLeft: `5px solid ${c}`, color: c, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", fontSize: 12 }}>
                    {m.sigla} · {m.nomeReparto}
                  </td>
                </tr>
              ),
              <tr key={m.id} style={{ background: `color-mix(in srgb,${c} 6%,var(--surface))` }}>
                <td style={{ borderLeft: `5px solid ${c}` }}><small style={{ color: c, fontWeight: 700 }}>{m.sigla}</small>{m.nome}</td>
                {ruoli.map((r) => {
                  const lv = valori[`${r.id}|${m.id}`] ?? "nessuno";
                  return (
                    <td key={r.id}>
                      <select className={`lv-${lv}`} value={lv} aria-label={`${m.nome}, ${r.nome}`}
                        onChange={(e) => cambia(r.id, m.id, e.target.value as Livello)}>
                        {LIVELLI.map((l) => <option key={l} value={l}>{NOME_LIVELLO[l]}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
