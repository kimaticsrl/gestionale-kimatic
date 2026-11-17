"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvaRegolaNotifica, provaNotifiche, spedisciOra } from "@/app/(app)/azioni";

type Regola = { evento: string; nome: string; descrizione: string; attivo: boolean; ruoli: string[]; persone: string[]; email_extra: string[]; anticipi: number[] };
type Persona = { id: string; nome: string; email: string };
type Riga = { id: number; evento: string; oggetto: string; destinatari: string[]; creata_il: string; inviata_il: string | null; tentativi: number; errore: string | null };

const quando = (s: string) => new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function Notifiche({ regole, ruoli, persone, storico, manca }: {
  regole: Regola[]; ruoli: { id: string; nome: string }[]; persone: Persona[]; storico: Riga[]; manca: string[];
}) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [testo, setTesto] = useState<Record<string, { extra: string; anticipi: string }>>(() =>
    Object.fromEntries(regole.map((r) => [r.evento, { extra: r.email_extra.join(", "), anticipi: r.anticipi.join(", ") }])));

  const esegui = (fn: () => Promise<string | null>, ok?: string) => avvia(async () => {
    setMsg(null);
    const e = await fn();
    setMsg(e ? { t: e, err: true } : ok ? { t: ok } : null);
    router.refresh();
  });
  const salva = (r: Regola, campi: Partial<Regola>) => esegui(() => salvaRegolaNotifica(r.evento, campi));
  const togli = (a: string[], v: string, si: boolean) => si ? [...new Set([...a, v])] : a.filter((x) => x !== v);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: inCorso ? 0.7 : 1 }}>
      {manca.length > 0 && (
        <div className="msg err">
          Le mail non partono ancora: su Vercel mancano le impostazioni {manca.join(", ")}. Le notifiche restano in coda e partono appena le inserisci.
        </div>
      )}
      {msg && <div className={"msg" + (msg.err ? " err" : "")} role="status">{msg.t}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={inCorso} onClick={() => esegui(provaNotifiche, "Mail di prova spedita al tuo indirizzo: controlla la posta (anche lo spam).")}>Mandami una mail di prova</button>
        <button type="button" className="btn sec" disabled={inCorso} onClick={() => esegui(spedisciOra, "Fatto: coda spedita e riepilogo scadenze di oggi preparato (se c'erano scadenze).")}>Spedisci ora la coda e le scadenze di oggi</button>
      </div>

      {regole.map((r) => (
        <div className="box" key={r.evento} style={{ opacity: r.attivo ? 1 : 0.65 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{r.nome}</h2>
            <label className="ck"><input type="checkbox" checked={r.attivo} onChange={(e) => salva(r, { attivo: e.target.checked })} /> Attiva</label>
          </div>
          <p className="tag">{r.descrizione}</p>
          <p style={{ margin: "10px 0 4px", fontWeight: 600, fontSize: 14 }}>Ruoli (tutte le persone che hanno il ruolo)</p>
          <div>{ruoli.map((x) => (
            <label key={x.id} className="ck"><input type="checkbox" checked={r.ruoli.includes(x.id)} onChange={(e) => salva(r, { ruoli: togli(r.ruoli, x.id, e.target.checked) })} />{x.nome}</label>
          ))}</div>
          <p style={{ margin: "10px 0 4px", fontWeight: 600, fontSize: 14 }}>Persone</p>
          <div>{persone.map((p) => (
            <label key={p.id} className="ck" title={p.email}><input type="checkbox" checked={r.persone.includes(p.id)} onChange={(e) => salva(r, { persone: togli(r.persone, p.id, e.target.checked) })} />{p.nome || p.email}</label>
          ))}</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, fontWeight: 600, flex: "1 1 320px" }}>
              Altri indirizzi (separati da virgola)
              <input type="text" value={testo[r.evento]?.extra ?? ""} placeholder="es. qualita@kimatic.it"
                onChange={(e) => setTesto((t) => ({ ...t, [r.evento]: { ...t[r.evento], extra: e.target.value } }))}
                onBlur={(e) => { const v = e.target.value.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean); if (v.join() !== r.email_extra.join()) salva(r, { email_extra: v }); }} />
            </label>
            {r.evento.startsWith("scadenze") && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14, fontWeight: 600, flex: "0 1 260px" }}>
                Avvisa quanti giorni prima (0 = il giorno stesso)
                <input type="text" value={testo[r.evento]?.anticipi ?? ""} placeholder="30, 7, 0"
                  onChange={(e) => setTesto((t) => ({ ...t, [r.evento]: { ...t[r.evento], anticipi: e.target.value } }))}
                  onBlur={(e) => { const v = [...new Set(e.target.value.split(/[\s,;]+/).map((x) => parseInt(x, 10)).filter((n) => n >= 0 && n <= 365))].sort((a, b) => b - a); if (v.join() !== r.anticipi.join()) salva(r, { anticipi: v }); }} />
              </label>
            )}
          </div>
        </div>
      ))}

      <div className="box">
        <h2>Ultime notifiche</h2>
        {storico.length === 0 ? <p className="tag">Ancora nessuna notifica.</p> : (
          <div className="mx"><table style={{ minWidth: 720 }}>
            <thead><tr><th>Quando</th><th>Oggetto</th><th>A</th><th>Stato</th></tr></thead>
            <tbody>{storico.map((n) => (
              <tr key={n.id}>
                <td>{quando(n.creata_il)}</td>
                <td>{n.oggetto}</td>
                <td><small>{n.destinatari.join(", ")}</small></td>
                <td>{n.inviata_il ? "Spedita" : n.errore ? <span title={n.errore}>Errore{n.tentativi >= 5 ? " (abbandonata)" : ", si riprova"}</span> : "In coda"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
