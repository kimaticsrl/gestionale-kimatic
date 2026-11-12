"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Voce = { id: number; tabella: string; record_id: string | null; azione: string; prima: Rec | null; dopo: Rec | null; utente: string | null; quando: string };
type Rec = Record<string, unknown>;
type Persona = { id: string; nome: string | null; email: string };

const AREE: [string, string, string[]][] = [
  ["", "Tutte le aree", []],
  ["offerte", "Offerte BMTEK", ["bm_docs"]],
  ["rapporti", "Rapporti d'intervento", ["rapporti", "fatture_rapporti"]],
  ["clienti", "Anagrafica clienti", ["clienti"]],
  ["ts", "Troubleshooting", ["ts_casi", "ts_liste"]],
  ["costificatore", "Costificatore", ["cost_docs"]],
  ["nc", "Non conformità", ["nc"]],
  ["lettere", "Impostazioni (Lettere, Costificatore)", ["impostazioni"]],
  ["utenti", "Utenti e permessi", ["permessi", "profilo_ruoli", "profili", "regole_propri"]],
];
const AREA_DI: Record<string, string> = Object.fromEntries(AREE.flatMap(([, n, t]) => t.map((x) => [x, n])));
const AZIONE: Record<string, string> = { INSERT: "Creato", UPDATE: "Modificato", DELETE: "Eliminato" };
const IGNORA = new Set(["aggiornato_il", "aggiornato_da", "creato_il", "creato_da", "firma_ts", "numero"]);
const PAG = 100;

const s = (v: unknown) => (v == null ? "" : String(v));
const corto = (v: unknown) => {
  if (v === undefined) return "—";
  const t = typeof v === "string" ? v : JSON.stringify(v);
  if (/^data:|^[A-Za-z0-9+/=]{300,}$/.test(t)) return "(file)";
  return t.length > 140 ? t.slice(0, 140) + "…" : t || "(vuoto)";
};
// Appiattisce un oggetto in percorsi «a.b.0.c» per confrontare prima e dopo
function piatto(o: unknown, pre = "", out: Record<string, unknown> = {}, prof = 0): Record<string, unknown> {
  if (o && typeof o === "object" && prof < 5) {
    const e = Array.isArray(o) ? o.map((v, i) => [String(i + 1), v] as const) : Object.entries(o as Rec);
    if (!e.length) out[pre] = Array.isArray(o) ? [] : {};
    for (const [k, v] of e) if (!(prof === 0 && IGNORA.has(k))) piatto(v, pre ? `${pre}.${k}` : k, out, prof + 1);
  } else out[pre] = o;
  return out;
}
const corpo = (r: Rec | null) => (r && typeof r.dati === "object" ? { ...(r.nome != null ? { nome: r.nome } : {}), ...(r.dati as Rec) } : r);
function differenze(v: Voce) {
  const a = piatto(corpo(v.prima) ?? {}), b = piatto(corpo(v.dopo) ?? {});
  const chiavi = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return chiavi.map((k) => ({ k, prima: a[k], dopo: b[k] }));
}

export default function Registro() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [persone, setPersone] = useState<Persona[]>([]);
  const [voci, setVoci] = useState<Voce[]>([]);
  const [altri, setAltri] = useState(false);
  const [area, setArea] = useState("");
  const [chi, setChi] = useState("");
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");
  const [aperta, setAperta] = useState<number | null>(null);
  const [stato, setStato] = useState("Caricamento…");

  useEffect(() => { sb.from("profili").select("id,nome,email").order("nome").then(({ data }) => setPersone((data ?? []) as Persona[])); }, [sb]);

  async function carica(da = 0) {
    setStato("Caricamento…");
    let q = sb.from("registro_modifiche").select("*").order("quando", { ascending: false }).range(da, da + PAG - 1);
    const t = AREE.find((x) => x[0] === area)?.[2] ?? [];
    if (t.length) q = q.in("tabella", t);
    if (chi) q = q.eq("utente", chi);
    if (dal) q = q.gte("quando", new Date(dal + "T00:00:00").toISOString());
    if (al) q = q.lt("quando", new Date(new Date(al + "T00:00:00").getTime() + 86400000).toISOString());
    const { data, error } = await q;
    if (error) { setStato("Non caricato: " + error.message); return; }
    const righe = (data ?? []) as Voce[];
    setVoci((v) => (da ? [...v, ...righe] : righe));
    setAltri(righe.length === PAG);
    setStato("");
  }
  useEffect(() => { carica(0); }, [area, chi, dal, al]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeDi = (id: string | null) => { if (!id) return "Sistema / import"; const p = persone.find((x) => x.id === id); return p ? p.nome || p.email : "Utente eliminato"; };
  function documento(v: Voce) {
    const r = (v.dopo || v.prima || {}) as Rec, d = (r.dati || {}) as Rec;
    switch (v.tabella) {
      case "bm_docs":
        if (r.coll === "offerte") return `Offerta ${s(d.num) || s(r.id)}${d.cliente ? " · " + s(d.cliente) : ""}`;
        return `${s(r.coll)} · ${s(r.id)}`;
      case "rapporti": return `Rapporto ${s(d.num) || s(r.id)}${(d.cli as Rec)?.nome ? " · " + s((d.cli as Rec).nome) : ""}`;
      case "fatture_rapporti": return `Fattura del rapporto ${s(r.rapporto_id)}${d.nf ? " · n. " + s(d.nf) : ""}`;
      case "clienti": return `Cliente ${s(r.nome)}`;
      case "ts_casi": return `Caso ${s(d.titolo) || s(r.id)}`;
      case "ts_liste": return `Elenco ${s(r.id)}`;
      case "impostazioni": return `Impostazioni ${s(r.id)}`;
      case "nc": return `Non conformità ${s(r.numero)}${d.fornitore ? " · " + s(d.fornitore) : ""}`;
      case "cost_docs": return `${r.coll === "preventivi" ? "Preventivo" : "Componente"} ${s(d.codice) || s(d.rif) || s(r.id)}${d.fornitore ? " · " + s(d.fornitore) : ""}`;
      case "permessi": return `Permesso ${s(r.ruolo_id)} → ${s(r.modulo_id)}: ${s(r.livello)}`;
      case "profilo_ruoli": return `Ruolo ${s(r.ruolo_id)} a ${nomeDi(s(r.profilo_id))}`;
      case "profili": return `Utente ${s(r.nome) || s(r.email)}`;
      default: return `${v.tabella} · ${s(v.record_id)}`;
    }
  }
  const quando = (t: string) => new Date(t).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <div className="box row" style={{ gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>Area
          <select value={area} onChange={(e) => setArea(e.target.value)}>{AREE.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>Persona
          <select value={chi} onChange={(e) => setChi(e.target.value)}><option value="">Tutti</option>{persone.map((p) => <option key={p.id} value={p.id}>{p.nome || p.email}</option>)}</select></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>Dal<input type="date" value={dal} onChange={(e) => setDal(e.target.value)} /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>Al<input type="date" value={al} onChange={(e) => setAl(e.target.value)} /></label>
      </div>
      <div className="box" style={{ overflowX: "auto" }}>
        <table className="tab" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ textAlign: "left" }}><th>Quando</th><th>Chi</th><th>Cosa</th><th>Area</th><th>Documento</th><th></th></tr></thead>
          <tbody>
            {voci.map((v) => {
              const diff = aperta === v.id ? differenze(v) : [];
              return (
                <Fragment key={v.id}>
                  <tr style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ whiteSpace: "nowrap", padding: "6px 8px 6px 0" }}>{quando(v.quando)}</td>
                    <td style={{ padding: "6px 8px 6px 0" }}>{nomeDi(v.utente)}</td>
                    <td style={{ padding: "6px 8px 6px 0" }}>{AZIONE[v.azione] || v.azione}</td>
                    <td style={{ padding: "6px 8px 6px 0" }}><small>{AREA_DI[v.tabella] || v.tabella}</small></td>
                    <td style={{ padding: "6px 8px 6px 0" }}>{documento(v)}</td>
                    <td><button className="btn link" onClick={() => setAperta(aperta === v.id ? null : v.id)}>{aperta === v.id ? "Chiudi" : "Dettagli"}</button></td>
                  </tr>
                  {aperta === v.id && (
                    <tr><td colSpan={6} style={{ paddingBottom: 12 }}>
                      {v.azione === "UPDATE" ? (
                        diff.length ? (
                          <table style={{ width: "100%", fontSize: 13, background: "var(--accent-soft)", borderRadius: 6 }}>
                            <thead><tr style={{ textAlign: "left" }}><th style={{ padding: 6 }}>Campo</th><th style={{ padding: 6 }}>Prima</th><th style={{ padding: 6 }}>Dopo</th></tr></thead>
                            <tbody>{diff.slice(0, 60).map((x) => (
                              <tr key={x.k}><td style={{ padding: 6, fontFamily: "var(--mono, monospace)" }}>{x.k}</td><td style={{ padding: 6, color: "var(--muted)" }}>{corto(x.prima)}</td><td style={{ padding: 6 }}>{corto(x.dopo)}</td></tr>
                            ))}</tbody>
                          </table>
                        ) : <p className="sub">Nessun campo cambiato.</p>
                      ) : (
                        <p className="sub">{v.azione === "INSERT" ? "Creato" : "Eliminato"}. {v.azione === "DELETE" ? "Contenuto al momento della cancellazione:" : "Contenuto:"} {corto(corpo(v.dopo || v.prima))}</p>
                      )}
                      {diff.length > 60 && <p className="sub">…e altri {diff.length - 60} campi.</p>}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {stato && <p className="sub" role="status">{stato}</p>}
        {!stato && !voci.length && <p className="sub">Nessuna modifica con questi filtri.</p>}
        {altri && !stato && <button className="btn sec" style={{ marginTop: 10 }} onClick={() => carica(voci.length)}>Carica altre</button>}
      </div>
    </>
  );
}
