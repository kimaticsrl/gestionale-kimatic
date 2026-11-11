"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Macchina = { matr: string; desc: string };
type Commessa = { num: string; chiusa?: boolean; macchine: Macchina[] };
type Dati = { codice_sam?: string; ragione_sociale?: string; paese?: string; provincia?: string; cellulare?: string; agente?: string; cliente_dal?: string; indirizzo?: string; contatto?: string; email?: string; telefono?: string; piva?: string; lingua?: string; note?: string; fonti?: string[]; commesse?: Commessa[] };
type Cliente = { id: string; nome: string; dati: Dati };
type Offerta = { id: string; num: string; cliente: string; cr: string; addr?: string[]; rifC?: string; mailC?: string; lang?: string };
type Rapporto = { id: string; numero: string; firma_ts: string | null; creato_il: string; cli: { id?: string; nome?: string } | null };
type Caso = { id: string; titolo: string; cliente: string; data: string };

const CAMPI: [keyof Dati, string][] = [["codice_sam", "Codice SAM"], ["ragione_sociale", "Ragione sociale completa"], ["indirizzo", "Indirizzo"], ["provincia", "Provincia"], ["paese", "Paese"], ["piva", "P.IVA / VAT"], ["contatto", "Persona di riferimento"], ["email", "E-mail"], ["telefono", "Telefono"], ["cellulare", "Cellulare"], ["agente", "Agente"], ["lingua", "Lingua documenti"], ["cliente_dal", "In SAM dal"]];
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(srl|s\.r\.l\.|spa|s\.p\.a\.|ltd|llc|gmbh|sa|sas|snc|oy|ab|uab)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const simile = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (x.length > 3 && y.includes(x)) || (y.length > 3 && x.includes(y))); };
const slug = (s: string) => norm(s).replace(/ /g, "-") || "c" + Date.now().toString(36);
const fd = (s?: string | null) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

export default function Clienti({ gestisce }: { gestisce: boolean }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [offerte, setOfferte] = useState<Offerta[]>([]);
  const [rapporti, setRapporti] = useState<Rapporto[]>([]);
  const [casi, setCasi] = useState<Caso[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [ed, setEd] = useState<Cliente | null>(null);
  const [msg, setMsg] = useState("");
  const [carico, setCarico] = useState(true);

  async function carica() {
    const [c, o, r, t] = await Promise.all([
      sb.from("clienti").select("id,nome,dati").order("nome"),
      sb.from("bm_docs").select("id,num:dati->>num,cliente:dati->>cliente,cr:dati->>cr,addr:dati->addr,rifC:dati->>rifC,mailC:dati->>mailC,lang:dati->>lang").eq("coll", "offerte"),
      sb.from("rapporti").select("id,numero,firma_ts,creato_il,cli:dati->cli"),
      sb.from("ts_casi").select("id,titolo:dati->>titolo,cliente:dati->>cliente,data:dati->>data"),
    ]);
    setClienti((c.data ?? []) as Cliente[]);
    setOfferte(((o.data ?? []) as Offerta[]).filter((x) => x.cliente && !/da inserire/i.test(x.cliente)));
    setRapporti((r.data ?? []) as Rapporto[]);
    setCasi(((t.data ?? []) as Caso[]).filter((x) => x.cliente));
    setCarico(false);
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const n = norm(q);
    return clienti.filter((c) => !n || norm([c.nome, c.dati.ragione_sociale, c.dati.codice_sam, c.dati.piva, c.dati.paese, c.dati.contatto, c.dati.indirizzo, ...(c.dati.commesse || []).flatMap((k) => [k.num, ...(k.macchine || []).map((m) => m.matr)])].join(" ")).includes(n));
  }, [clienti, q]);

  // Clienti presenti nelle offerte ma non ancora in anagrafica
  const mancanti = useMemo(() => {
    const visti = new Set<string>();
    return offerte.filter((o) => {
      const k = norm(o.cliente);
      if (visti.has(k) || clienti.some((c) => simile(c.nome, o.cliente))) return false;
      visti.add(k); return true;
    });
  }, [offerte, clienti]);

  const c = clienti.find((x) => x.id === sel) || null;
  const legati = useMemo(() => !c ? null : ({
    offerte: offerte.filter((o) => simile(o.cliente, c.nome)).sort((a, b) => (b.cr || "").localeCompare(a.cr || "")),
    rapporti: rapporti.filter((r) => r.cli && (r.cli.id === c.id || simile(r.cli.nome || "", c.nome))).sort((a, b) => b.creato_il.localeCompare(a.creato_il)),
    casi: casi.filter((t) => simile(t.cliente, c.nome)),
  }), [c, offerte, rapporti, casi]);

  async function salva() {
    if (!ed) return;
    const nome = ed.nome.trim();
    if (!nome) { setMsg("Serve la ragione sociale."); return; }
    let id = ed.id;
    if (!id) {
      if (clienti.some((x) => simile(x.nome, nome))) { setMsg(`Esiste già un cliente simile: «${clienti.find((x) => simile(x.nome, nome))!.nome}».`); return; }
      id = slug(nome); while (clienti.some((x) => x.id === id)) id += "-2";
    }
    const dati: Dati = { ...ed.dati, commesse: (ed.dati.commesse || []).filter((k) => k.num.trim()).map((k) => ({ ...k, macchine: (k.macchine || []).filter((m) => m.matr.trim() || m.desc.trim()) })) };
    if (!ed.id) dati.fonti = [...(dati.fonti || []), "Inserito a mano"];
    const { error } = await sb.from("clienti").upsert({ id, nome, dati });
    if (error) { setMsg("Non salvato: " + error.message); return; }
    setEd(null); setSel(id); setMsg("Cliente salvato."); carica();
  }
  async function elimina(x: Cliente) {
    if (!confirm(`Eliminare «${x.nome}» dall'anagrafica? Offerte e rapporti già fatti restano, con i dati scritti dentro.`)) return;
    const { error } = await sb.from("clienti").delete().eq("id", x.id);
    if (error) { setMsg("Non eliminato: " + error.message); return; }
    setSel(null); setMsg("Cliente eliminato."); carica();
  }
  const daOfferta = (o: Offerta) => setEd({ id: "", nome: o.cliente, dati: { indirizzo: (o.addr || []).filter(Boolean).join(", "), contatto: o.rifC || "", email: o.mailC || "", lingua: o.lang || "", fonti: ["Offerte BMTEK"], commesse: [] } });
  const setD = (k: keyof Dati, v: string) => ed && setEd({ ...ed, dati: { ...ed.dati, [k]: v } });
  const setK = (i: number, k: Partial<Commessa>) => ed && setEd({ ...ed, dati: { ...ed.dati, commesse: (ed.dati.commesse || []).map((x, j) => j === i ? { ...x, ...k } : x) } });

  return (
    <>
      <header className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><h1>Anagrafica clienti</h1><p className="sub">{clienti.length} clienti · dati, commesse e matricole, con offerte, interventi e casi collegati.</p></div>
        {gestisce && <button className="btn" onClick={() => { setEd({ id: "", nome: "", dati: { commesse: [] } }); setSel(null); setMsg(""); }}>Nuovo cliente</button>}
      </header>
      {msg && <div className="msg" role="status">{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,320px) minmax(0,1fr)", gap: 16, alignItems: "start" }} className="cli-grid">
        <div className="box" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input type="text" placeholder="Cerca nome, codice SAM, paese, commessa, matricola…" aria-label="Cerca cliente" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "70vh", overflow: "auto" }}>
            {carico ? <p className="sub">Caricamento…</p> : lista.map((x) => (
              <button key={x.id} type="button" className="btn sec" onClick={() => { setSel(x.id); setEd(null); setMsg(""); }}
                style={{ justifyContent: "flex-start", textAlign: "left", flexDirection: "column", alignItems: "flex-start", gap: 0, fontWeight: 500, borderColor: sel === x.id ? "var(--accent)" : "var(--line)", background: sel === x.id ? "var(--accent-soft)" : "transparent", color: "var(--fg)" }}>
                <b>{x.nome}</b><small style={{ color: "var(--muted)" }}>{[x.dati.paese, (x.dati.commesse || []).length ? (x.dati.commesse || []).length + " commesse" : "", x.dati.contatto].filter(Boolean).join(" · ") || "—"}</small>
              </button>
            ))}
            {!carico && !lista.length && <p className="sub">Nessun cliente.</p>}
          </div>
          {gestisce && mancanti.length > 0 && (
            <details style={{ marginTop: 8 }}>
              <summary>Nelle offerte ma non in anagrafica ({mancanti.length})</summary>
              <ul style={{ paddingLeft: 16 }}>{mancanti.map((o) => <li key={o.id}>{o.cliente} <button className="btn link" onClick={() => { daOfferta(o); setSel(null); }}>Aggiungi</button></li>)}</ul>
            </details>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {ed ? (
            <div className="box">
              <h2>{ed.id ? "Modifica cliente" : "Nuovo cliente"}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 10 }}>
                <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>Ragione sociale<input type="text" value={ed.nome} onChange={(e) => setEd({ ...ed, nome: e.target.value })} /></label>
                {CAMPI.map(([k, l]) => <label key={k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>{l}<input type="text" value={String(ed.dati[k] ?? "")} onChange={(e) => setD(k, e.target.value)} /></label>)}
                <label style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 4 }}>Note<textarea rows={3} value={ed.dati.note || ""} onChange={(e) => setD("note", e.target.value)} style={{ padding: 8, border: "1px solid var(--line)", borderRadius: 6, font: "inherit" }} /></label>
              </div>
              <h2 style={{ marginTop: 16 }}>Commesse e matricole</h2>
              {(ed.dati.commesse || []).map((k, i) => (
                <div key={i} className="box" style={{ marginTop: 8, padding: 12 }}>
                  <div className="row">
                    <input type="text" placeholder="Numero commessa" aria-label="Numero commessa" value={k.num} onChange={(e) => setK(i, { num: e.target.value })} />
                    <label className="ck"><input type="checkbox" checked={!!k.chiusa} onChange={(e) => setK(i, { chiusa: e.target.checked })} /> chiusa</label>
                    <button className="btn link" onClick={() => setEd({ ...ed, dati: { ...ed.dati, commesse: (ed.dati.commesse || []).filter((_, j) => j !== i) } })}>Togli commessa</button>
                  </div>
                  {(k.macchine || []).map((m, j) => (
                    <div key={j} className="row" style={{ marginTop: 6 }}>
                      <input type="text" placeholder="Matricola" aria-label="Matricola" value={m.matr} onChange={(e) => setK(i, { macchine: k.macchine.map((x, h) => h === j ? { ...x, matr: e.target.value } : x) })} />
                      <input type="text" placeholder="Descrizione macchina" aria-label="Descrizione macchina" value={m.desc} style={{ flex: 1 }} onChange={(e) => setK(i, { macchine: k.macchine.map((x, h) => h === j ? { ...x, desc: e.target.value } : x) })} />
                      <button className="btn link" aria-label="Togli matricola" onClick={() => setK(i, { macchine: k.macchine.filter((_, h) => h !== j) })}>✕</button>
                    </div>
                  ))}
                  <button className="btn link" style={{ marginTop: 6 }} onClick={() => setK(i, { macchine: [...(k.macchine || []), { matr: "", desc: "" }] })}>+ Matricola</button>
                </div>
              ))}
              <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setEd({ ...ed, dati: { ...ed.dati, commesse: [...(ed.dati.commesse || []), { num: "", macchine: [] }] } })}>+ Commessa</button>
              <div className="row" style={{ marginTop: 16 }}><button className="btn" onClick={salva}>Salva</button><button className="btn sec" onClick={() => setEd(null)}>Annulla</button></div>
            </div>
          ) : c && legati ? (
            <>
              <div className="box">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <h2 style={{ fontSize: 20 }}>{c.nome}</h2>
                  {gestisce && <div className="row"><button className="btn sec" onClick={() => setEd(JSON.parse(JSON.stringify(c)))}>Modifica</button><button className="btn danger" onClick={() => elimina(c)}>Elimina</button></div>}
                </div>
                <p className="tag">{(c.dati.fonti || []).join(" · ")}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
                  {CAMPI.map(([k, l]) => <div key={k}><small style={{ color: "var(--muted)" }}>{l}</small><div>{String(c.dati[k] || "—")}</div></div>)}
                </div>
                {c.dati.note && <p style={{ whiteSpace: "pre-wrap" }}>{c.dati.note}</p>}
              </div>
              <div className="box">
                <h2>Commesse e matricole</h2>
                {(c.dati.commesse || []).length ? (
                  <div className="mx"><table><thead><tr><th>Commessa</th><th>Matricola</th><th>Macchina</th></tr></thead><tbody>
                    {(c.dati.commesse || []).flatMap((k) => (k.macchine?.length ? k.macchine : [{ matr: "", desc: "" }]).map((m, j) => (
                      <tr key={k.num + j}><td>{j === 0 ? <b>{k.num}{k.chiusa ? " · chiusa" : ""}</b> : ""}</td><td style={{ fontFamily: "var(--f-mono)" }}>{m.matr || "—"}</td><td>{m.desc}</td></tr>
                    )))}
                  </tbody></table></div>
                ) : <p className="sub">Nessuna commessa.</p>}
              </div>
              <div className="box">
                <h2>Collegati a questo cliente</h2>
                <p className="tag">Trovati per nome del cliente: vedi solo quelli dei moduli a cui hai accesso.</p>
                <div className="mx"><table><thead><tr><th>Dove</th><th>Riferimento</th><th>Data</th></tr></thead><tbody>
                  {legati.offerte.map((o) => <tr key={"o" + o.id}><td><a href="/moduli/offerte-bmtek">Offerta BMTEK</a></td><td>{o.num}</td><td>{fd(o.cr)}</td></tr>)}
                  {legati.rapporti.map((r) => <tr key={"r" + r.id}><td><a href="/moduli/rapporti-intervento">Rapporto d&apos;intervento</a></td><td>{r.numero}{r.firma_ts ? " · firmato" : " · in corso"}</td><td>{fd(r.creato_il)}</td></tr>)}
                  {legati.casi.map((t) => <tr key={"t" + t.id}><td><a href="/moduli/troubleshooting">Troubleshooting</a></td><td>{t.titolo}</td><td>{fd(t.data)}</td></tr>)}
                  {!legati.offerte.length && !legati.rapporti.length && !legati.casi.length && <tr><td colSpan={3} className="sub">Niente di collegato.</td></tr>}
                </tbody></table></div>
              </div>
            </>
          ) : <div className="empty">Scegli un cliente dall&apos;elenco{gestisce ? " oppure creane uno nuovo" : ""}.</div>}
        </div>
      </div>
    </>
  );
}
