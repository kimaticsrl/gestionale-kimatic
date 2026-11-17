"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { simula } from "@/app/(app)/azioni";

type Ruolo = { id: string; nome: string };

/** Solo per gli amministratori: scegliere un ruolo e vedere il gestionale come lo vede chi ce l'ha. */
export default function VediCome({ ruoli, attuale }: { ruoli: Ruolo[]; attuale: string | null }) {
  const [inCorso, avvia] = useTransition();
  const router = useRouter();
  const cambia = (v: string) => avvia(async () => {
    try { await simula(v || null); router.refresh(); }
    catch (e) { alert("Non riesco a cambiare vista: " + (e instanceof Error ? e.message : "errore")); }
  });
  const nome = ruoli.find((r) => r.id === attuale)?.nome ?? attuale;
  return (
    <div className={"vedi-come" + (attuale ? " attiva" : "")} role="region" aria-label="Vedi come un altro ruolo">
      <label>
        Vedi come
        <select value={attuale ?? ""} disabled={inCorso} onChange={(e) => cambia(e.target.value)}>
          <option value="">Amministratore (tu)</option>
          {ruoli.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
        </select>
      </label>
      {attuale
        ? <span>Stai usando il gestionale con i soli permessi di <b>{nome}</b>: vedi e puoi fare solo quello che vede e fa chi ha questo ruolo. Le modifiche che fai sono vere.</span>
        : <span className="nota">Scegli un ruolo per vedere il gestionale come lo vedono gli altri utenti.</span>}
      {attuale && <button type="button" className="btn" disabled={inCorso} onClick={() => cambia("")}>Torna amministratore</button>}
      {inCorso && <span className="nota">Cambio vista…</span>}
    </div>
  );
}
