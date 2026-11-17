"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Dati = { nome?: string; cc?: string; mansione?: string; contratto?: string; liv?: string; ral?: number | null; assunzione?: string; scadenza?: string; nascita?: string; luogo?: string; sesso?: string; cf?: string; email?: string; telefono?: string; pid?: string; note?: string };
type Dip = { id: string; dati: Dati; attivo: boolean };
type Persona = { id: string; name: string };
type Pers = { n?: string; cc?: string; liv?: string; ral?: number; att?: number; pid?: string };

const CONTRATTI = ["Tempo indeterminato", "Tempo determinato", "Apprendistato", "Somministrato", "Collaborazione", "Stage / tirocinio"];
const eur = (n?: number | null) => (n == null || isNaN(n) ? "" : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const fd = (s?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const num = (s: string) => { const z = s.replace(/[€\s]/g, ""); const v = Number(/,\d{1,2}$/.test(z) ? z.replace(/\./g, "").replace(",", ".") : z.replace(/,/g, "")); return z === "" || isNaN(v) ? null : v; };
const oggi = () => new Date().toLocaleDateString("sv-SE");
const inForzaD = (x: Dip) => x.attivo && !(x.dati.scadenza && x.dati.scadenza < oggi());
const norm = (s?: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function Dipendenti({ modifica }: { modifica: boolean }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [lista, setLista] = useState<Dip[]>([]);
  const [persone, setPersone] = useState<Persona[]>([]);
  const [carico, setCarico] = useState(true);
  const [q, setQ] = useState("");
  const [tutti, setTutti] = useState(false);
  const [ed, setEd] = useState<Dip | null>(null);
  const [ralTxt, setRalTxt] = useState("");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  async function carica() {
    const [d, p] = await Promise.all([
      sb.from("dipendenti").select("id,dati,attivo"),
      sb.from("pp_docs").select("id,name:dati->>name").eq("coll", "persone"),
    ]);
    if (d.error) setMsg({ t: "Errore nel caricamento: " + d.error.message, err: true });
    setLista(((d.data ?? []) as Dip[]).sort((a, b) => norm(a.dati.nome).localeCompare(norm(b.dati.nome))));
    setPersone(((p.data ?? []) as Persona[]).filter((x) => x.name).sort((a, b) => a.name.localeCompare(b.name)));
    setCarico(false);
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nomePiano = (pid?: string) => persone.find((p) => p.id === pid)?.name || "";
  const vis = lista.filter((x) => (tutti || inForzaD(x)) && (!q || norm([x.dati.nome, x.dati.cc, x.dati.mansione, x.dati.email, nomePiano(x.dati.pid)].join(" ")).includes(norm(q))));
  const inForza = lista.filter(inForzaD);
  const totRal = inForza.reduce((a, x) => a + (Number(x.dati.ral) || 0), 0);
  const reparti = [...new Set(lista.map((x) => x.dati.cc).filter(Boolean))].sort() as string[];

  function apri(x: Dip | null) {
    const d = x ?? { id: "", dati: { contratto: "Tempo indeterminato" }, attivo: true };
    setEd(JSON.parse(JSON.stringify(d)));
    setRalTxt(d.dati.ral != null ? String(d.dati.ral).replace(".", ",") : "");
    setMsg(null);
  }
  const set = (k: keyof Dati, v: string) => setEd((e) => (e ? { ...e, dati: { ...e.dati, [k]: v } } : e));

  async function salva() {
    if (!ed) return;
    const nome = (ed.dati.nome || "").trim();
    if (!nome) { setMsg({ t: "Scrivi nome e cognome.", err: true }); return; }
    const ral = num(ralTxt);
    if (ralTxt.trim() && ral == null) { setMsg({ t: "RAL non valida: scrivi solo il numero, per esempio 32.500,00.", err: true }); return; }
    const dati: Dati = Object.fromEntries(Object.entries({ ...ed.dati, nome, ral }).filter(([, v]) => v !== "" && v != null)) as Dati;
    const riga = { dati, attivo: ed.attivo, ...(ed.id ? { id: ed.id } : {}) };
    const { error } = await sb.from("dipendenti").upsert(riga);
    if (error) { setMsg({ t: "Non salvato: " + error.message, err: true }); return; }
    setMsg({ t: `${nome} salvato.` });
    setEd(null);
    carica();
  }
  async function elimina() {
    if (!ed?.id || !confirm(`Eliminare ${ed.dati.nome} dall'anagrafica? Se ha solo lasciato l'azienda, togli invece la spunta «In forza».`)) return;
    const { error } = await sb.from("dipendenti").delete().eq("id", ed.id);
    if (error) { setMsg({ t: "Non eliminato: " + error.message, err: true }); return; }
    setMsg({ t: `${ed.dati.nome} eliminato.` });
    setEd(null);
    carica();
  }

  // Prima importazione: i dipendenti del Controllo di gestione (Tariffe e costi fissi → Personale)
  async function importa() {
    const { data, error } = await sb.from("cg_docs").select("dati").eq("coll", "costi").eq("id", "pers").maybeSingle();
    if (error || !data) { setMsg({ t: "Non trovo l'elenco del personale nel Controllo di gestione.", err: true }); return; }
    const P = ((data.dati as { p?: Record<string, Pers> }).p) || {};
    const righe = Object.values(P).filter((x) => x.n).map((x) => ({
      attivo: x.att !== 0,
      dati: Object.fromEntries(Object.entries({ nome: x.n, cc: x.cc, liv: x.liv, ral: x.ral, pid: x.pid, contratto: x.liv === "APP" ? "Apprendistato" : undefined }).filter(([, v]) => v !== "" && v != null)),
    }));
    if (!righe.length) { setMsg({ t: "L'elenco del personale nel Controllo di gestione è vuoto.", err: true }); return; }
    const { error: e2 } = await sb.from("dipendenti").insert(righe);
    if (e2) { setMsg({ t: "Importazione non riuscita: " + e2.message, err: true }); return; }
    setMsg({ t: `Importati ${righe.length} dipendenti dal Controllo di gestione.` });
    carica();
  }

  function csv() {
    const H = ["Nome e cognome", "Reparto / centro di costo", "Mansione", "Contratto", "Livello", "RAL", "Assunzione", "Fine rapporto", "Data di nascita", "Luogo di nascita", "Sesso", "Codice fiscale", "E-mail", "Telefono", "Persona nel Piano", "In forza", "Note"];
    const c = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const L = vis.map((x) => { const d = x.dati; return [d.nome, d.cc, d.mansione, d.contratto, d.liv, d.ral != null ? String(d.ral).replace(".", ",") : "", fd(d.assunzione), fd(d.scadenza), fd(d.nascita), d.luogo, d.sesso, d.cf, d.email, d.telefono, nomePiano(d.pid), inForzaD(x) ? "sì" : "no", d.note].map(c).join(";"); });
    const url = URL.createObjectURL(new Blob(["﻿" + [H.map(c).join(";"), ...L].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `Anagrafica_dipendenti_${new Date().toLocaleDateString("sv-SE")}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  const campo = (k: keyof Dati, l: string, tipo = "text", extra?: React.ReactNode) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>{l}
      <input type={tipo} list={extra ? "dl-" + k : undefined} value={String(ed?.dati[k] ?? "")} disabled={!modifica} onChange={(e) => set(k, e.target.value)}
        style={{ padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)" }} />{extra}
    </label>
  );

  if (carico) return <div className="empty">Caricamento…</div>;
  return (
    <>
      <header><h1>Anagrafica dipendenti</h1><p className="sub">Riservata alla Direzione · reparto, mansione, contratto, livello, RAL e contatti del personale.</p></header>
      {msg && <div className={"msg" + (msg.err ? " err" : "")}>{msg.t}</div>}
      {!lista.length && (
        <div className="box">
          <h2>L'anagrafica è vuota</h2>
          <p className="tag">Puoi partire dai dipendenti già inseriti nel Controllo di gestione (nome, centro di costo, livello e RAL) e completare il resto qui.</p>
          {modifica && <div className="row"><button className="btn" onClick={importa}>Importa dal Controllo di gestione</button><button className="btn sec" onClick={() => apri(null)}>Inserisci a mano</button></div>}
        </div>
      )}
      {ed && (
        <div className="box" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2>{ed.id ? ed.dati.nome : "Nuovo dipendente"}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
            {campo("nome", "Nome e cognome")}
            {campo("cc", "Reparto / centro di costo", "text", <datalist id="dl-cc">{reparti.map((r) => <option key={r} value={r} />)}</datalist>)}
            {campo("mansione", "Mansione")}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Contratto
              <select value={ed.dati.contratto || ""} disabled={!modifica} onChange={(e) => set("contratto", e.target.value)}><option value="">—</option>{CONTRATTI.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            {campo("liv", "Livello")}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>RAL (€)
              <input type="text" inputMode="decimal" value={ralTxt} disabled={!modifica} onChange={(e) => setRalTxt(e.target.value)} style={{ padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)" }} />
            </label>
            {campo("assunzione", "Data di assunzione", "date")}
            {campo("scadenza", "Fine rapporto (ultimo giorno)", "date")}
            {campo("nascita", "Data di nascita", "date")}
            {campo("luogo", "Luogo di nascita")}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Sesso
              <select value={ed.dati.sesso || ""} disabled={!modifica} onChange={(e) => set("sesso", e.target.value)}><option value="">—</option><option value="M">M</option><option value="F">F</option></select>
            </label>
            {campo("cf", "Codice fiscale")}
            {campo("email", "E-mail", "email")}
            {campo("telefono", "Telefono")}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Persona nel Piano produzione
              <select value={ed.dati.pid || ""} disabled={!modifica} onChange={(e) => set("pid", e.target.value)}><option value="">— non collegata —</option>{persone.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Note
            <textarea rows={2} value={ed.dati.note || ""} disabled={!modifica} onChange={(e) => set("note", e.target.value)} style={{ padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)", font: "inherit" }} />
          </label>
          <div className="row">
            <label className="ck"><input type="checkbox" checked={ed.attivo} disabled={!modifica} onChange={(e) => setEd({ ...ed, attivo: e.target.checked })} /> In forza</label>
            <span style={{ flex: 1 }} />
            {modifica && ed.id && <button className="btn danger" onClick={elimina}>Elimina</button>}
            <button className="btn sec" onClick={() => setEd(null)}>{modifica ? "Annulla" : "Chiudi"}</button>
            {modifica && <button className="btn" onClick={salva}>Salva</button>}
          </div>
        </div>
      )}
      {!!lista.length && (
        <div className="box">
          <div className="row" style={{ marginBottom: 12 }}>
            <input type="text" placeholder="Cerca nome, reparto, mansione…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
            <label className="ck"><input type="checkbox" checked={tutti} onChange={(e) => setTutti(e.target.checked)} /> Mostra anche chi non è più in forza</label>
            <span className="tag" style={{ margin: 0 }}>{inForza.length} in forza · RAL totale {eur(totRal)}</span>
            <span style={{ flex: 1 }} />
            <button className="btn sec" onClick={csv}>Esporta CSV (Excel)</button>
            {modifica && <button className="btn" onClick={() => apri(null)}>Nuovo dipendente</button>}
          </div>
          <div className="mx">
            <table>
              <thead><tr><th>Nome e cognome</th><th>Reparto</th><th>Mansione</th><th>Contratto</th><th>Livello</th><th style={{ textAlign: "right" }}>RAL</th><th>Assunzione</th><th>Piano</th></tr></thead>
              <tbody>
                {vis.map((x) => (
                  <tr key={x.id} onClick={() => apri(x)} style={{ cursor: "pointer", opacity: inForzaD(x) ? 1 : 0.55, background: ed?.id === x.id ? "var(--accent-soft)" : undefined }}>
                    <td><b>{x.dati.nome}</b>{x.dati.scadenza ? <small>{x.dati.scadenza < oggi() ? "terminato il " : "termina il "}{fd(x.dati.scadenza)}</small> : !x.attivo && <small>non più in forza</small>}</td>
                    <td>{x.dati.cc}</td><td>{x.dati.mansione}</td><td>{x.dati.contratto}</td><td>{x.dati.liv}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(x.dati.ral)}</td><td>{fd(x.dati.assunzione)}</td><td>{nomePiano(x.dati.pid)}</td>
                  </tr>
                ))}
                {!vis.length && <tr><td colSpan={8} style={{ color: "var(--muted)" }}>Nessun dipendente trovato.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
