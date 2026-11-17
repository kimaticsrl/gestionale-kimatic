"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Dati = { inq?: string; finecontr?: string; indirizzo?: string; cellaz?: string; nome?: string; cc?: string; mansione?: string; contratto?: string; liv?: string; ral?: number | null; assunzione?: string; scadenza?: string; nascita?: string; luogo?: string; sesso?: string; cf?: string; email?: string; telefono?: string; pid?: string; note?: string };
type Dip = { id: string; dati: Dati; attivo: boolean };
type Persona = { id: string; name: string };
type Pers = { n?: string; cc?: string; liv?: string; ral?: number; att?: number; pid?: string };

const CONTRATTI = ["Socio titolare", "Tempo indeterminato", "Tempo determinato", "Apprendistato", "Somministrato", "Collaborazione", "Stage / tirocinio"];
const eur = (n?: number | null) => (n == null || isNaN(n) ? "" : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const fd = (s?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
const num = (s: string) => { const z = s.replace(/[€\s]/g, ""); const v = Number(/,\d{1,2}$/.test(z) ? z.replace(/\./g, "").replace(",", ".") : z.replace(/,/g, "")); return z === "" || isNaN(v) ? null : v; };
const oggi = () => new Date().toLocaleDateString("sv-SE");
const socio = (x: Dip) => x.dati.contratto === "Socio titolare";
const eta = (d?: string) => { if (!d) return null; const n = new Date(d + "T12:00:00"), o = new Date(); let a = o.getFullYear() - n.getFullYear(); if (o < new Date(o.getFullYear(), n.getMonth(), n.getDate())) a--; return a; };
const anni = (d?: string) => (d ? (Date.now() - new Date(d + "T12:00:00").getTime()) / 31557600000 : null);
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
  const [ord, setOrd] = useState<{ k: string; dir: 1 | -1 }>({ k: "nome", dir: 1 });
  const [stat, setStat] = useState(false);
  const [coeff, setCoeff] = useState(1.39);

  async function carica() {
    const [d, p] = await Promise.all([
      sb.from("dipendenti").select("id,dati,attivo"),
      sb.from("pp_docs").select("id,name:dati->>name").eq("coll", "persone"),
    ]);
    if (d.error) setMsg({ t: "Errore nel caricamento: " + d.error.message, err: true });
    setLista(((d.data ?? []) as Dip[]).sort((a, b) => norm(a.dati.nome).localeCompare(norm(b.dati.nome))));
    const cfg = await sb.from("cg_docs").select("dati").eq("coll", "costi").eq("id", "cfg").maybeSingle();
    const cf = Number((cfg.data?.dati as { coeff?: number } | undefined)?.coeff);
    if (cf > 0) setCoeff(cf);
    setPersone(((p.data ?? []) as Persona[]).filter((x) => x.name).sort((a, b) => a.name.localeCompare(b.name)));
    setCarico(false);
  }
  useEffect(() => { carica(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nomePiano = (pid?: string) => persone.find((p) => p.id === pid)?.name || "";
  const vis = lista.filter((x) => (tutti || inForzaD(x)) && (!q || norm([x.dati.nome, x.dati.cc, x.dati.mansione, x.dati.email, nomePiano(x.dati.pid)].join(" ")).includes(norm(q))));
  const VAL: Record<string, (x: Dip) => string | number> = {
    nome: (x) => norm(x.dati.nome), cc: (x) => norm(x.dati.cc), mansione: (x) => norm(x.dati.mansione), contratto: (x) => norm(x.dati.contratto),
    liv: (x) => norm(x.dati.liv).padStart(4, "0"), ral: (x) => Number(x.dati.ral) || 0, assunzione: (x) => x.dati.assunzione || "", piano: (x) => norm(nomePiano(x.dati.pid)),
  };
  vis.sort((a, b) => { const f = VAL[ord.k], va = f(a), vb = f(b); return (va < vb ? -1 : va > vb ? 1 : 0) * ord.dir || norm(a.dati.nome).localeCompare(norm(b.dati.nome)); });
  const th = (k: string, l: string, destra = false) => (
    <th style={{ cursor: "pointer", whiteSpace: "nowrap", textAlign: destra ? "right" : undefined }} title="Clic per ordinare"
      onClick={() => setOrd((o) => ({ k, dir: o.k === k ? (o.dir === 1 ? -1 : 1) : k === "ral" ? -1 : 1 }))}>
      {l}{ord.k === k ? (ord.dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );
  const inForza = lista.filter(inForzaD);
  const dipF = inForza.filter((x) => !socio(x));
  const totRal = dipF.reduce((a, x) => a + (Number(x.dati.ral) || 0), 0);
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
    const piano = await allineaPiano(dati, ed.attivo);
    setMsg({ t: `${nome} salvato.${piano}` });
    setEd(null);
    carica();
  }
  // Chi si dimette esce anche dal Piano di produzione: l'ultimo giorno passa alla sua persona del planning
  // (dopo quella data non viene più proposta) e, se la data è già passata, la persona diventa non attiva.
  async function allineaPiano(d: Dati, attivo: boolean): Promise<string> {
    if (!d.pid) return "";
    const { data: pp } = await sb.from("pp_docs").select("dati").eq("coll", "persone").eq("id", d.pid).maybeSingle();
    if (!pp) return "";
    const p = (pp.dati || {}) as { fine?: string; att?: boolean; name?: string };
    const uscito = !attivo || (!!d.scadenza && d.scadenza < new Date().toLocaleDateString("sv-SE"));
    const nuovo = { ...p, ...(d.scadenza ? { fine: d.scadenza } : {}), ...(uscito ? { att: false } : {}) };
    if (nuovo.fine === p.fine && nuovo.att === p.att) return "";
    const { error } = await sb.from("pp_docs").update({ dati: nuovo }).eq("coll", "persone").eq("id", d.pid);
    if (error) return ` Piano di produzione non aggiornato (${error.message}): togli la persona a mano in Persone e reparti.`;
    return uscito ? " Tolto anche dal Piano di produzione." : ` Nel Piano di produzione non sarà più proposto dopo il ${d.scadenza!.split("-").reverse().join("/")}.`;
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
    const H = ["Nome e cognome", "Reparto / centro di costo", "Mansione", "Inquadramento", "Contratto", "Livello", "RAL", "Assunzione", "Scadenza contratto", "Fine rapporto", "Data di nascita", "Luogo di nascita", "Sesso", "Codice fiscale", "E-mail", "Telefono", "Cellulare aziendale", "Indirizzo", "Persona nel Piano", "In forza", "Note"];
    const c = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const L = vis.map((x) => { const d = x.dati; return [d.nome, d.cc, d.mansione, d.inq, d.contratto, d.liv, d.ral != null ? String(d.ral).replace(".", ",") : "", fd(d.assunzione), fd(d.finecontr), fd(d.scadenza), fd(d.nascita), d.luogo, d.sesso, d.cf, d.email, d.telefono, d.cellaz, d.indirizzo, nomePiano(d.pid), inForzaD(x) ? "sì" : "no", d.note].map(c).join(";"); });
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
          <FotoDipendente id={ed.id} modifica={modifica} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
            {campo("nome", "Nome e cognome")}
            {campo("cc", "Reparto / centro di costo", "text", <datalist id="dl-cc">{reparti.map((r) => <option key={r} value={r} />)}</datalist>)}
            {campo("mansione", "Mansione")}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Contratto
              <select value={ed.dati.contratto || ""} disabled={!modifica} onChange={(e) => set("contratto", e.target.value)}><option value="">—</option>{CONTRATTI.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Inquadramento
              <select value={ed.dati.inq || ""} disabled={!modifica} onChange={(e) => set("inq", e.target.value)}><option value="">—</option><option>Operaio</option><option>Impiegato</option><option>Quadro</option><option>Dirigente</option></select>
            </label>
            {campo("liv", "Livello")}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>RAL (€)
              <input type="text" inputMode="decimal" value={ralTxt} disabled={!modifica} onChange={(e) => setRalTxt(e.target.value)} style={{ padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--surface)" }} />
            </label>
            {campo("assunzione", "Data di assunzione", "date")}
            {campo("finecontr", "Scadenza contratto (a termine / apprendistato)", "date")}
            {campo("scadenza", "Fine rapporto (ultimo giorno)", "date")}
            {campo("nascita", "Data di nascita", "date")}
            {campo("luogo", "Luogo di nascita")}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>Sesso
              <select value={ed.dati.sesso || ""} disabled={!modifica} onChange={(e) => set("sesso", e.target.value)}><option value="">—</option><option value="M">M</option><option value="F">F</option></select>
            </label>
            {campo("cf", "Codice fiscale")}
            {campo("email", "E-mail", "email")}
            {campo("telefono", "Telefono")}
            {campo("cellaz", "Cellulare aziendale")}
            {campo("indirizzo", "Indirizzo")}
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
            <span className="tag" style={{ margin: 0 }}>{dipF.length} dipendenti in forza{inForza.length > dipF.length ? ` + ${inForza.length - dipF.length} soci` : ""} · RAL totale {eur(totRal)}</span>
            <button className={"btn" + (stat ? "" : " sec")} onClick={() => setStat(!stat)}>Statistiche</button>
            <span style={{ flex: 1 }} />
            <button className="btn sec" onClick={csv}>Esporta CSV (Excel)</button>
            {modifica && <button className="btn" onClick={() => apri(null)}>Nuovo dipendente</button>}
          </div>
          {stat && <Statistiche dip={dipF} soci={inForza.length - dipF.length} coeff={coeff} />}
          <div className="mx">
            <table>
              <thead><tr>{th("nome", "Nome e cognome")}{th("cc", "Reparto")}{th("mansione", "Mansione")}{th("contratto", "Contratto")}{th("liv", "Livello")}{th("ral", "RAL", true)}{th("assunzione", "Assunzione")}{th("piano", "Piano")}</tr></thead>
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

const FASCE = ["fino a 29 anni", "30–39 anni", "40–49 anni", "50–59 anni", "60 anni e oltre"];
// livelli dal più basso al più alto: apprendisti, poi i numeri (9Q dopo 9), quadri e dirigenti in fondo
const ordLiv = (l: string) => { const u = l.toUpperCase().trim(); if (u.startsWith("APP")) return 0; const m = /^(\d+)(Q?)/.exec(u); if (m) return Number(m[1]) * 10 + (m[2] ? 5 : 0); return u === "Q" ? 900 : u === "D" ? 1000 : 950; };
// Statistiche sui dipendenti in forza (soci titolari esclusi)
function Statistiche({ dip, soci, coeff }: { dip: Dip[]; soci: number; coeff: number }) {
  const n = dip.length || 1;
  const ral = (l: Dip[]) => l.reduce((a, x) => a + (Number(x.dati.ral) || 0), 0);
  const gruppi = (f: (x: Dip) => string, ordine?: (k: string) => number) => {
    const m: Record<string, Dip[]> = {};
    dip.forEach((x) => { const k = f(x) || "non indicato"; (m[k] ??= []).push(x); });
    const nd = (k: string) => (k === "non indicato" ? 1 : 0);
    return Object.entries(m).sort((a, b) => nd(a[0]) - nd(b[0]) || (ordine ? ordine(a[0]) - ordine(b[0]) : b[1].length - a[1].length) || a[0].localeCompare(b[0]));
  };
  const media = (v: (number | null)[]) => { const ok = v.filter((x): x is number => x != null); return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null; };
  const etaM = media(dip.map((x) => eta(x.dati.nascita))), anzM = media(dip.map((x) => anni(x.dati.assunzione)));
  const tot = ral(dip);
  const tab = (titolo: string, f: (x: Dip) => string, costi = false, ordine?: (k: string) => number) => (
    <div style={{ flex: "1 1 300px" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{titolo}</h3>
      <table>
        <thead><tr><th></th><th style={{ textAlign: "right" }}>Persone</th><th style={{ textAlign: "right" }}>%</th>{costi && <><th style={{ textAlign: "right" }}>RAL</th><th style={{ textAlign: "right" }}>Costo azienda</th><th style={{ textAlign: "right" }}>RAL media</th></>}</tr></thead>
        <tbody>
          {gruppi(f, ordine).map(([k, l]) => (
            <tr key={k}><td>{k}</td><td style={{ textAlign: "right" }}>{l.length}</td><td style={{ textAlign: "right" }}>{Math.round((l.length / n) * 100)}%</td>
              {costi && <><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(ral(l))}</td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(ral(l) * coeff)}</td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(ral(l) / l.length)}</td></>}
            </tr>
          ))}
          {costi && <tr><td><b>Totale</b></td><td style={{ textAlign: "right" }}><b>{dip.length}</b></td><td></td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}><b>{eur(tot)}</b></td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}><b>{eur(tot * coeff)}</b></td><td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{eur(tot / n)}</td></tr>}
        </tbody>
      </table>
    </div>
  );
  const sesso = (x: Dip) => (x.dati.sesso === "M" ? "Uomini" : x.dati.sesso === "F" ? "Donne" : "");
  const fascia = (x: Dip) => { const e = eta(x.dati.nascita); return e == null ? "" : e < 30 ? "fino a 29 anni" : e < 40 ? "30–39 anni" : e < 50 ? "40–49 anni" : e < 60 ? "50–59 anni" : "60 anni e oltre"; };
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 14, marginBottom: 14 }}>
      <div className="row" style={{ gap: 24, marginBottom: 14 }}>
        <div><small className="tag">Dipendenti in forza</small><div style={{ fontSize: 22, fontWeight: 700 }}>{dip.length}</div></div>
        <div><small className="tag">RAL totale</small><div style={{ fontSize: 22, fontWeight: 700 }}>{eur(tot)}</div></div>
        <div><small className="tag">Costo azienda stimato (× {String(coeff).replace(".", ",")})</small><div style={{ fontSize: 22, fontWeight: 700 }}>{eur(tot * coeff)}</div></div>
        <div><small className="tag">Età media</small><div style={{ fontSize: 22, fontWeight: 700 }}>{etaM != null ? Math.round(etaM) + " anni" : "—"}</div></div>
        <div><small className="tag">Anzianità media</small><div style={{ fontSize: 22, fontWeight: 700 }}>{anzM != null ? anzM.toFixed(1).replace(".", ",") + " anni" : "—"}</div></div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {tab("Per reparto", (x) => x.dati.cc || "", true)}
        {tab("Per inquadramento", (x) => x.dati.inq || "", true)}
        {tab("Per contratto", (x) => x.dati.contratto || "")}
        {tab("Per sesso", sesso)}
        {tab("Per età", fascia, false, (k) => FASCE.indexOf(k))}
        {tab("Per livello", (x) => (x.dati.liv ? "Livello " + x.dati.liv : ""), true, (k) => ordLiv(k.replace("Livello ", "")))}
      </div>
      <p className="tag" style={{ marginBottom: 0 }}>Solo dipendenti in forza{soci ? `; esclusi i ${soci} soci titolari` : ""}. Il costo azienda è la RAL moltiplicata per il coefficiente del Controllo di gestione ({String(coeff).replace(".", ",")}): è una stima, non comprende straordinari, trasferte e premi.</p>
    </div>
  );
}

// Foto del dipendente (per il Tesserino trasferta). Sta nella tabella «tesserini», con lo stesso id
// del dipendente, così l'elenco dell'anagrafica resta leggero; si salva subito, senza «Salva».
function FotoDipendente({ id, modifica }: { id: string; modifica: boolean }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [foto, setFoto] = useState<string | null>(null);
  const [stato, setStato] = useState("");
  useEffect(() => {
    setFoto(null); setStato("");
    if (!id) return;
    sb.from("tesserini").select("dati").eq("id", id).maybeSingle().then(({ data }) => setFoto((data?.dati as { photo?: string } | undefined)?.photo || ""));
  }, [id, sb]);
  async function salva(nuova: string) {
    const { error } = nuova ? await sb.from("tesserini").upsert({ id, dati: { photo: nuova } }) : await sb.from("tesserini").delete().eq("id", id);
    if (error) { setStato("Foto non salvata: " + error.message); return; }
    setFoto(nuova); setStato(nuova ? "Foto salvata." : "Foto tolta.");
  }
  function carica(f?: File) {
    if (!f) return;
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 600 / Math.max(im.width, im.height)), c = document.createElement("canvas");
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext("2d")!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(im.src); salva(c.toDataURL("image/jpeg", 0.88));
    };
    im.onerror = () => setStato("Il file non è un'immagine leggibile.");
    im.src = URL.createObjectURL(f);
  }
  if (!id) return <p className="tag" style={{ margin: 0 }}>La foto si aggiunge dopo aver salvato il dipendente.</p>;
  return (
    <div className="row" style={{ gap: 14, alignItems: "center" }}>
      <div style={{ width: 84, height: 104, borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", overflow: "hidden", display: "grid", placeItems: "center", color: "var(--muted)", fontSize: 12 }}>
        {foto === null ? "…" : foto ? <img src={foto} alt="Foto del dipendente" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "nessuna foto"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 13 }}>Foto per il tesserino di trasferta</span>
        {modifica && <div className="row" style={{ gap: 8 }}>
          <label className="btn sec" style={{ cursor: "pointer" }}>{foto ? "Cambia foto" : "Carica foto"}<input type="file" accept="image/*" hidden onChange={(e) => { carica(e.target.files?.[0]); e.target.value = ""; }} /></label>
          {foto && <button className="btn link" onClick={() => salva("")}>Togli</button>}
        </div>}
        {stato && <small style={{ color: "var(--muted)" }}>{stato}</small>}
      </div>
    </div>
  );
}
