"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pdfOrganigramma, type Livello } from "./pdf";

type Dip = { id: string; nome: string | null; cc: string | null; mansione: string | null; reparto: string | null };
type Inc = { ruolo: string; dip?: string | null; esterno?: string | null; note?: string | null };

// Reparti nell'ordine dell'organigramma; quelli nuovi scritti a mano vanno in fondo, in ordine alfabetico.
const ORDINE = ["Direzione", "Amministrazione", "Commerciale", "Acquisti e logistica", "Ufficio tecnico",
  "Produzione — tornitura e fresatura", "Montaggio e cablaggio", "Collaudo e service", "Controllo qualità", "Magazzino"];
// Reparto proposto dal centro di costo quando non è stato scelto (la produzione va divisa a mano)
const DA_CC: Record<string, string> = {
  AMMINISTRAZIONE: "Amministrazione", "UFFICIO COMMERCIALE": "Commerciale", "UFFICIO ACQUISTI": "Acquisti e logistica",
  "UFFICIO TECNICO": "Ufficio tecnico", DIREZIONE: "Direzione",
};
const DA_ASSEGNARE = "Da assegnare";

// «DI BENEDETTO SILVIA» → «Di Benedetto Silvia»
const titolo = (s: string) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
const oggi = () => new Date().toLocaleDateString("it-IT");

export default function Organigramma({ gestisce }: { gestisce: boolean }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [dip, setDip] = useState<Dip[] | null>(null);
  const [inc, setInc] = useState<Inc[]>([]);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [modReparti, setModReparti] = useState(false);
  const [pdfInCorso, setPdfInCorso] = useState(false);

  async function carica() {
    const { data, error } = await sb.rpc("organigramma_dati");
    if (error || !data) { setMsg({ t: "Non riesco a leggere i dati: " + (error?.message || "accesso negato"), err: true }); setDip([]); return; }
    setDip(data.dipendenti as Dip[]); setInc(data.incarichi as Inc[]);
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => Object.fromEntries((dip || []).map((d) => [d.id, d])), [dip]);
  const nome = (d?: Dip | null) => (d?.nome ? titolo(d.nome) : "");
  // Persone di un incarico: solo dipendenti in forza (o esterni)
  const chi = (ruolo: string) => inc.filter((i) => i.ruolo === ruolo && (i.esterno || (i.dip && byId[i.dip])))
    .map((i) => ({ nome: i.dip ? nome(byId[i.dip]) : i.esterno || "", note: i.note || "" }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  const reparto = (d: Dip) => d.reparto || (d.cc && DA_CC[d.cc.toUpperCase()]) || DA_ASSEGNARE;

  if (!dip) return <div className="empty">Caricamento…</div>;

  // Datore di lavoro, dirigenti e preposti non sono ripetuti tra i lavoratori
  const vertici = new Set(inc.filter((i) => ["dl", "dirs", "prep"].includes(i.ruolo) && i.dip).map((i) => i.dip as string));
  const lavoratori = dip.filter((d) => !vertici.has(d.id));
  const nomiReparti = [...new Set(lavoratori.map(reparto))].sort((a, b) => {
    const x = a === DA_ASSEGNARE ? 999 : ORDINE.indexOf(a) < 0 ? 500 : ORDINE.indexOf(a);
    const y = b === DA_ASSEGNARE ? 999 : ORDINE.indexOf(b) < 0 ? 500 : ORDINE.indexOf(b);
    return x - y || a.localeCompare(b);
  });
  const gruppi = nomiReparti.map((r) => ({ reparto: r, persone: lavoratori.filter((d) => reparto(d) === r).map(nome).sort((a, b) => a.localeCompare(b)) }));
  const tuttiReparti = [...new Set([...ORDINE, ...dip.map((d) => d.reparto).filter(Boolean) as string[]])];

  const livelli: Livello[] = [
    { tipo: "autorita", schede: [{ ruolo: "Datore di lavoro", persone: chi("dl") }] },
    { tipo: "supporto", schede: [
      { ruolo: "RSPP", persone: chi("rspp") }, { ruolo: "Medico competente", persone: chi("mc") }, { ruolo: "RLS", persone: chi("rls") }] },
    { tipo: "linea", schede: [{ ruolo: "Dirigente", persone: chi("dirs") }] },
    { tipo: "linea", schede: chi("prep").map((p) => ({ ruolo: "Preposto" + (p.note ? " — " + p.note : ""), persone: [{ nome: p.nome, note: "" }] })) },
    { tipo: "emergenza", schede: [{ ruolo: "Addetti primo soccorso", persone: chi("ps") }, { ruolo: "Addetti antincendio", persone: chi("ai") }] },
  ].filter((l) => l.schede.some((s) => s.persone.length)) as Livello[];

  async function scaricaPdf() {
    setPdfInCorso(true);
    try {
      const [{ jsPDF }, logo] = await Promise.all([import("jspdf"), fetch("/logo/kimatic").then((r) => r.blob()).then((b) => new Promise<string>((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.readAsDataURL(b); })).catch(() => undefined)]);
      const doc = pdfOrganigramma(jsPDF, livelli, gruppi.map((g) => (g.reparto === DA_ASSEGNARE ? { ...g, reparto: "Altri lavoratori" } : g)), oggi(), logo);
      doc.save(`Organigramma sicurezza Kimatic ${new Date().toLocaleDateString("sv-SE")}.pdf`);
    } catch (e) { setMsg({ t: "PDF non riuscito: " + (e as Error).message, err: true }); }
    setPdfInCorso(false);
  }

  async function cambiaReparto(id: string, r: string) {
    const { error } = await sb.rpc("organigramma_reparto", { p_dip: id, p_reparto: r });
    if (error) { setMsg({ t: "Reparto non salvato: " + error.message, err: true }); return; }
    setDip((l) => (l || []).map((d) => (d.id === id ? { ...d, reparto: r || null } : d)));
  }

  const daAssegnare = lavoratori.filter((d) => reparto(d) === DA_ASSEGNARE);
  const mancanti = ["dl", "rspp", "mc", "rls", "ps", "ai"].filter((r) => !chi(r).length);
  const NOMI: Record<string, string> = { dl: "datore di lavoro", rspp: "RSPP", mc: "medico competente", rls: "RLS", ps: "addetti primo soccorso", ai: "addetti antincendio" };

  return (
    <>
      <header>
        <div className="row" style={{ float: "right", gap: 8 }}>
          {gestisce && <button className="btn sec" onClick={() => setModReparti((x) => !x)}>{modReparti ? "Chiudi reparti" : "Cambia reparti"}</button>}
          <button className="btn" onClick={scaricaPdf} disabled={pdfInCorso}>{pdfInCorso ? "Preparo il PDF…" : "Scarica PDF"}</button>
        </div>
        <h1>Organigramma della sicurezza</h1>
        <p className="sub">Ruoli e responsabilità ai sensi del D.Lgs. 81/08 · aggiornato al {oggi()}. Le figure arrivano da <Link href="/moduli/sicurezza">Sicurezza e formazione</Link> (scheda Addetti), i lavoratori dall&apos;Anagrafica dipendenti: chi esce dall&apos;azienda sparisce da solo.</p>
      </header>
      {msg && <div className={"msg" + (msg.err ? " err" : "")}>{msg.t}</div>}
      {gestisce && (daAssegnare.length > 0 || mancanti.length > 0) && (
        <div className="msg">
          {daAssegnare.length > 0 && <div><b>Senza reparto nell&apos;organigramma:</b> {daAssegnare.map(nome).join(", ")}. Assegnalo con «Cambia reparti».</div>}
          {mancanti.length > 0 && <div><b>Incarichi da inserire in Sicurezza e formazione:</b> {mancanti.map((r) => NOMI[r]).join(", ")}.</div>}
        </div>
      )}

      {modReparti && (
        <div className="box">
          <h2>Reparti nell&apos;organigramma</h2>
          <p className="tag">Il reparto qui è solo per l&apos;organigramma: non cambia il centro di costo in anagrafica. Per un reparto nuovo scrivilo nella casella.</p>
          <datalist id="reparti">{tuttiReparti.map((r) => <option key={r} value={r} />)}</datalist>
          <div className="mx"><table>
            <thead><tr><th>Dipendente</th><th>Mansione</th><th>Centro di costo</th><th>Reparto nell&apos;organigramma</th></tr></thead>
            <tbody>{lavoratori.map((d) => (
              <tr key={d.id}>
                <td>{nome(d)}</td><td><small>{d.mansione}</small></td><td><small>{d.cc}</small></td>
                <td><input type="text" list="reparti" defaultValue={d.reparto || ""} placeholder={reparto(d)} style={{ width: "100%" }}
                  onBlur={(e) => { if ((e.target.value.trim() || null) !== (d.reparto || null)) cambiaReparto(d.id, e.target.value.trim()); }} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}

      <div className="org">
        {livelli.map((l, i) => (
          <div key={i}>
            {i > 0 && <div className="org-fil" />}
            <div className="org-liv">
              {l.schede.filter((s) => s.persone.length).map((s) => (
                <div key={s.ruolo} className={"org-sch " + l.tipo}>
                  <p className="org-ruolo">{s.ruolo}</p>
                  {s.persone.map((p) => <p key={p.nome} className="org-nome">{p.nome}</p>)}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="org-fil" />
        <div className="org-sch base org-lav">
          <p className="org-ruolo">Lavoratori</p>
          <div className="org-rep">
            {gruppi.map((g) => (
              <div key={g.reparto}>
                <p className="org-rnome">{g.reparto}</p>
                <p className="org-rlista">{g.persone.join(" · ")}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="org-leg">
          <span><i style={{ background: "#2B4C5C" }} />Datore di lavoro</span>
          <span><i style={{ background: "#5C6B4C" }} />Funzioni di supporto</span>
          <span><i style={{ background: "#3D6A80" }} />Dirigente e preposti</span>
          <span><i style={{ background: "#A85A2E" }} />Addetti alle emergenze</span>
          <span><i style={{ background: "#59544A" }} />Lavoratori</span>
        </div>
      </div>
      <style>{`
        .org{display:flex;flex-direction:column;align-items:center;max-width:1000px;width:100%;margin:0 auto}
        .org>div{width:100%}
        .org-liv{display:flex;justify-content:center;gap:16px;flex-wrap:wrap}
        .org-fil{width:1px;height:26px;background:var(--line);margin:0 auto}
        .org-sch{border:1px solid var(--line);border-left:4px solid var(--a);border-radius:6px;padding:10px 14px;min-width:170px;background:color-mix(in srgb,var(--a) 10%,var(--surface))}
        .org-sch.autorita{--a:#2B4C5C}.org-sch.supporto{--a:#5C6B4C}.org-sch.linea{--a:#3D6A80}.org-sch.emergenza{--a:#A85A2E}.org-sch.base{--a:#59544A}
        .org-ruolo{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin:0 0 3px}
        .org-nome{font-size:15px;font-weight:500;margin:0;line-height:1.35}
        .org-lav{max-width:820px;margin:0 auto}
        .org-rep{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px 24px;margin-top:8px}
        .org-rnome{font-size:12px;color:var(--muted);margin:0 0 2px}.org-rlista{font-size:13px;margin:0;line-height:1.5}
        .org-leg{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:28px;font-size:12px;color:var(--muted)}
        .org-leg span{display:inline-flex;align-items:center;gap:6px}.org-leg i{width:9px;height:9px;border-radius:2px;display:inline-block}
      `}</style>
    </>
  );
}
