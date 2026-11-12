"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import "./nc.css";

// ---------- tipi e liste ----------
export type Gestione = {
  trattamento?: string; istruzioni?: string; segregato?: boolean;
  invio_data?: string; invio_rif?: string; risposta?: string; risposta_data?: string; azione_fornitore?: string; scadenza_risposta?: string;
  ore?: string; costo_ora?: string; costo_materiale?: string; costo_trasporto?: string; addebito?: string; nota_credito?: string;
  verifica?: string; chiusa_il?: string; chiusa_da?: string;
};
export type Riga = { codice: string; descrizione: string; um: string; q_ricevuta: string; q_nc: string };
export type Fornitore = { codice: string; nome: string; dati: { indirizzo?: string; citta?: string; provincia?: string; piva?: string; telefono?: string; contatto?: string } };
export type DatiNC = {
  data?: string; fase?: string; fornitore?: string; fornitore_codice?: string; ddt?: string; ddt_data?: string; ordine?: string; commessa?: string;
  righe?: Riga[];
  codice?: string; articolo?: string; q_ricevuta?: string; q_nc?: string; um?: string; // vecchio formato (un solo articolo)
  tipo?: string; gravita?: string; descrizione?: string; foto?: string[]; gestione?: Gestione;
};
export type NC = { id: string; numero: string; anno: number; stato: string; dati: DatiNC; creato_da: string | null; creato_il: string };

export const STATI: [string, string][] = [["aperta", "Aperta"], ["in-gestione", "In gestione"], ["attesa-fornitore", "In attesa del fornitore"], ["chiusa", "Chiusa"], ["annullata", "Annullata"]];
export const FASI = ["Accettazione merce", "Magazzino", "Lavorazione", "Montaggio", "Collaudo", "Presso il cliente"];
export const TIPI = ["Dimensionale / fuori tolleranza", "Materiale errato o non certificato", "Trattamento o finitura", "Danneggiato nel trasporto", "Quantità errata", "Codice o articolo errato", "Documentazione mancante o errata", "Funzionale / non funziona", "Altro"];
export const GRAVITA: [string, string][] = [["lieve", "Lieve – utilizzabile"], ["maggiore", "Maggiore – da trattare"], ["critica", "Critica – blocca la produzione"]];
export const TRATTAMENTI = ["Reso al fornitore", "Sostituzione da parte del fornitore", "Rilavorazione dal fornitore", "Rilavorazione interna (con addebito)", "Accettazione in deroga", "Scarto / rottamazione"];
const nomeStato = (s: string) => STATI.find((x) => x[0] === s)?.[1] || s;
const oggi = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fd = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const n = (s?: string) => { const v = parseFloat(String(s ?? "").replace(",", ".")); return isFinite(v) ? v : 0; };
const eur = (v: number) => v.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
export const COSTO_ORA = 45; // costo interno orario predefinito
export const costoOra = (g: Gestione = {}) => (String(g.costo_ora ?? "").trim() === "" ? COSTO_ORA : n(g.costo_ora));
export const costoTotale = (g: Gestione = {}) => n(g.ore) * costoOra(g) + n(g.costo_materiale) + n(g.costo_trasporto);
const rigaVuota = (): Riga => ({ codice: "", descrizione: "", um: "PZ", q_ricevuta: "", q_nc: "" });
// articoli della NC (anche quelle salvate col vecchio formato a un solo articolo)
export const righeDi = (d: DatiNC): Riga[] => d.righe?.length ? d.righe
  : d.codice || d.articolo || d.q_nc ? [{ codice: d.codice || "", descrizione: d.articolo || "", um: d.um || "PZ", q_ricevuta: d.q_ricevuta || "", q_nc: d.q_nc || "" }] : [];

// Foto ridimensionata (lato lungo 1600 px) prima del caricamento
async function comprimi(f: File): Promise<Blob> {
  if (!f.type.startsWith("image/")) return f;
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b || f), "image/jpeg", 0.85));
}

type Props = { me: string; nome: string; gestisce: boolean; modifica: boolean };
type NCR = NC & { r?: Riga };

export default function NonConformita({ me, gestisce, modifica }: Props) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [lista, setLista] = useState<NC[]>([]);
  const [nomi, setNomi] = useState<Record<string, string>>({});
  const [carico, setCarico] = useState(true);
  const [filtro, setFiltro] = useState("attive");
  const [q, setQ] = useState("");
  const [anno, setAnno] = useState("");
  const [ed, setEd] = useState<NC | null>(null);
  const [msg, setMsg] = useState("");
  const [foto, setFoto] = useState<Record<string, string>>({});
  const [salvo, setSalvo] = useState(false);
  const [anagForn, setAnagForn] = useState<Fornitore[]>([]);
  const [sugg, setSugg] = useState<{ codice: string; descrizione: string; um: string }[]>([]);

  async function carica() {
    const tutte: NC[] = [];
    for (let da = 0; ; da += 1000) {
      const { data, error } = await sb.from("nc").select("*").order("creato_il", { ascending: false }).range(da, da + 999);
      if (error) { setMsg("Non riesco a leggere le non conformità: " + error.message); break; }
      tutte.push(...((data ?? []) as NC[]));
      if (!data || data.length < 1000) break;
    }
    setLista(tutte); setCarico(false);
  }
  useEffect(() => {
    carica();
    (async () => {
      const tutti: Fornitore[] = [];
      for (let da = 0; ; da += 1000) {
        const { data } = await sb.from("fornitori").select("codice,nome,dati").order("nome").range(da, da + 999);
        tutti.push(...((data ?? []) as Fornitore[]));
        if (!data || data.length < 1000) break;
      }
      setAnagForn(tutti);
    })();
    sb.from("profili").select("id,nome,email").then(({ data }) => setNomi(Object.fromEntries((data ?? []).map((p: { id: string; nome: string | null; email: string }) => [p.id, p.nome || p.email]))));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // anteprime delle foto della NC aperta
  useEffect(() => {
    const mancano = (ed?.dati.foto || []).filter((p) => !foto[p]);
    if (!mancano.length) return;
    sb.storage.from("non-conformita").createSignedUrls(mancano, 3600).then(({ data }) => {
      if (data) setFoto((f) => ({ ...f, ...Object.fromEntries(data.filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl as string])) }));
    });
  }, [ed?.dati.foto]); // eslint-disable-line react-hooks/exhaustive-deps

  const anni = [...new Set(lista.map((x) => x.anno))].sort((a, b) => b - a);
  const fornitori = [...new Set([...anagForn.map((f) => f.nome), ...lista.map((x) => x.dati.fornitore?.trim()).filter(Boolean) as string[]])].sort((a, b) => a.localeCompare(b));
  const fornDi = (d: DatiNC) => anagForn.find((f) => f.codice === d.fornitore_codice) || anagForn.find((f) => f.nome.toLowerCase() === (d.fornitore || "").trim().toLowerCase());
  const visibili = lista.filter((x) => {
    if (filtro === "attive" && ["chiusa", "annullata"].includes(x.stato)) return false;
    if (filtro !== "attive" && filtro !== "tutte" && x.stato !== filtro) return false;
    if (anno && String(x.anno) !== anno) return false;
    const t = q.trim().toLowerCase();
    return !t || [x.numero, x.dati.fornitore, x.dati.commessa, x.dati.ddt, x.dati.ordine, x.dati.descrizione, ...righeDi(x.dati).flatMap((r) => [r.codice, r.descrizione])].join(" ").toLowerCase().includes(t);
  });
  const conta = (f: string) => lista.filter((x) => (f === "attive" ? !["chiusa", "annullata"].includes(x.stato) : f === "tutte" ? true : x.stato === f)).length;

  // chi può modificare cosa
  const mia = (x: NC) => x.creato_da === me;
  const puoSegnalazione = (x: NC) => gestisce || (modifica && x.stato === "aperta" && (!x.id || mia(x)));
  const nuova = !ed?.id;

  function apri(x: NC) {
    const c: NC = JSON.parse(JSON.stringify(x));
    c.dati.righe = righeDi(c.dati); delete c.dati.codice; delete c.dati.articolo; delete c.dati.q_ricevuta; delete c.dati.q_nc; delete c.dati.um;
    if (!c.dati.righe.length) c.dati.righe = [rigaVuota()];
    setEd(c); setMsg(""); window.scrollTo(0, 0);
  }
  function crea() {
    setEd({ id: "", numero: "", anno: new Date().getFullYear(), stato: "aperta", creato_da: me, creato_il: "", dati: { data: oggi(), fase: FASI[0], gravita: "maggiore", righe: [rigaVuota()], foto: [] } });
    setMsg(""); window.scrollTo(0, 0);
  }
  const setD = (k: keyof DatiNC, v: unknown) => ed && setEd({ ...ed, dati: { ...ed.dati, [k]: v } });
  const setR = (i: number, v: Partial<Riga>) => ed && setEd({ ...ed, dati: { ...ed.dati, righe: (ed.dati.righe || []).map((x, j) => (j === i ? { ...x, ...v } : x)) } });
  // suggerimenti dall'anagrafica articoli mentre si scrive il codice o la descrizione
  async function cercaArticoli(t: string) {
    t = t.trim(); if (t.length < 3) { setSugg([]); return; }
    const p = "%" + t.replace(/[%_]/g, "") + "%";
    const { data } = await sb.from("articoli").select("codice,descrizione,um").or(`codice.ilike.${p},descrizione.ilike.${p}`).order("codice").limit(25);
    setSugg((data ?? []) as typeof sugg);
  }
  async function compilaArticolo(i: number, codice: string) {
    const c = codice.trim(); if (!c) return;
    const hit = sugg.find((x) => x.codice === c) || (await sb.from("articoli").select("codice,descrizione,um").eq("codice", c).maybeSingle()).data;
    if (hit) setR(i, { codice: hit.codice, descrizione: hit.descrizione, um: hit.um || "PZ" });
  }
  function sceltaFornitore(v: string) {
    if (!ed) return;
    const f = anagForn.find((x) => x.nome.toLowerCase() === v.trim().toLowerCase());
    setEd({ ...ed, dati: { ...ed.dati, fornitore: v, fornitore_codice: f?.codice || "" } });
  }
  const setG = (k: keyof Gestione, v: unknown) => ed && setEd({ ...ed, dati: { ...ed.dati, gestione: { ...(ed.dati.gestione || {}), [k]: v } } });

  async function salva(chiudi = false) {
    if (!ed) return;
    if (!ed.dati.fornitore?.trim()) { setMsg("Indica il fornitore."); return; }
    if (!ed.dati.descrizione?.trim()) { setMsg("Descrivi la non conformità."); return; }
    setSalvo(true);
    const dati = { ...ed.dati, righe: (ed.dati.righe || []).filter((x) => x.codice.trim() || x.descrizione.trim() || x.q_nc.trim()) };
    let stato = ed.stato;
    if (gestisce) {
      const g = { ...(dati.gestione || {}) };
      if (stato === "chiusa" && !g.chiusa_il) { g.chiusa_il = oggi(); g.chiusa_da = me; }
      if (stato !== "chiusa") { delete g.chiusa_il; delete g.chiusa_da; }
      dati.gestione = g;
    } else { stato = ed.id ? ed.stato : "aperta"; } // la parte di gestione resta com'era
    const r = ed.id
      ? await sb.from("nc").update({ dati, stato }).eq("id", ed.id).select().single()
      : await sb.from("nc").insert({ dati, stato }).select().single();
    setSalvo(false);
    if (r.error) { setMsg("Non salvata: " + r.error.message); return; }
    const salvata = r.data as NC;
    setMsg(`Non conformità ${salvata.numero} salvata.`);
    await carica();
    if (chiudi) setEd(null); else setEd(JSON.parse(JSON.stringify(salvata)));
  }
  async function elimina() {
    if (!ed?.id || !confirm(`Eliminare definitivamente la non conformità ${ed.numero}? Se è solo un errore, puoi metterla «Annullata».`)) return;
    const { error } = await sb.from("nc").delete().eq("id", ed.id);
    if (error) { setMsg("Non eliminata: " + error.message); return; }
    if (ed.dati.foto?.length) await sb.storage.from("non-conformita").remove(ed.dati.foto);
    setEd(null); setMsg("Non conformità eliminata."); carica();
  }
  async function aggiungiFoto(files: FileList | null) {
    if (!ed || !files?.length) return;
    const cartella = ed.id || "nuove/" + me;
    const nuove: string[] = [];
    setMsg("Carico le foto…");
    for (const f of Array.from(files)) {
      const blob = await comprimi(f);
      const est = blob.type === "image/jpeg" ? "jpg" : (f.name.split(".").pop() || "bin").toLowerCase();
      const path = `${cartella}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${est}`;
      const { error } = await sb.storage.from("non-conformita").upload(path, blob, { contentType: blob.type || f.type });
      if (error) { setMsg("Foto non caricata: " + error.message); return; }
      nuove.push(path);
    }
    setD("foto", [...(ed.dati.foto || []), ...nuove]);
    setMsg(`${nuove.length} ${nuove.length === 1 ? "foto aggiunta" : "foto aggiunte"}: ricordati di salvare.`);
  }

  async function pdf(lingua: "it" | "en") {
    if (!ed?.id) return;
    const [{ jsPDF }, { pdfNC }] = await Promise.all([import("jspdf"), import("./pdf")]);
    const logo = await fetch("/logo-kimatic.png").then((r) => r.blob()).then((b) => new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b); })).catch(() => "");
    const immagini: string[] = [];
    for (const p of (ed.dati.foto || []).filter((p) => /\.(jpe?g|png)$/i.test(p)).slice(0, 4)) {
      const { data } = await sb.storage.from("non-conformita").download(p);
      if (data) immagini.push(await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(data); }));
    }
    const doc = pdfNC(jsPDF, ed, { logo, immagini, lingua, aperta: nomi[ed.creato_da || ""] || "", fornitore: fornDi(ed.dati) });
    const url = URL.createObjectURL(doc.output("blob")), a = document.createElement("a");
    a.href = url; a.download = `${ed.numero} ${ed.dati.fornitore || ""}.pdf`.replace(/[\\/:*?"<>|]+/g, " "); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function excel() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Non conformità");
    const cols: [string, number, (x: NC) => unknown][] = [
      ["Numero", 13, (x) => x.numero], ["Data", 11, (x) => fd(x.dati.data)], ["Stato", 16, (x) => nomeStato(x.stato)], ["Fornitore", 28, (x) => x.dati.fornitore],
      ["Fase", 16, (x) => x.dati.fase], ["DDT", 12, (x) => x.dati.ddt], ["Ordine", 12, (x) => x.dati.ordine], ["Commessa", 12, (x) => x.dati.commessa],
      ["Codice", 16, (x) => (x as NCR).r?.codice], ["Articolo", 30, (x) => (x as NCR).r?.descrizione], ["UM", 6, (x) => (x as NCR).r?.um], ["Q.tà ricevuta", 10, (x) => n((x as NCR).r?.q_ricevuta) || ""], ["Q.tà NC", 9, (x) => n((x as NCR).r?.q_nc) || ""],
      ["Tipo difetto", 24, (x) => x.dati.tipo], ["Gravità", 10, (x) => x.dati.gravita], ["Descrizione", 40, (x) => x.dati.descrizione],
      ["Trattamento", 26, (x) => x.dati.gestione?.trattamento], ["Costo interno €", 13, (x) => costoTotale(x.dati.gestione) || ""], ["Addebito al fornitore €", 14, (x) => n(x.dati.gestione?.addebito) || ""],
      ["Nota credito/addebito", 14, (x) => x.dati.gestione?.nota_credito], ["Chiusa il", 11, (x) => fd(x.dati.gestione?.chiusa_il)], ["Aperta da", 18, (x) => nomi[x.creato_da || ""] || ""],
    ];
    const h = ws.addRow(cols.map((c) => c[0])); h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } }; c.alignment = { wrapText: true, vertical: "middle" }; });
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
    // una riga per ogni articolo; i costi solo sulla prima riga della NC
    visibili.forEach((x) => { const rr = righeDi(x.dati); (rr.length ? rr : [undefined]).forEach((r, i) => ws.addRow(cols.map((c) => (i > 0 && c[0].includes("€") ? "" : c[2]({ ...x, r } as NCR) ?? "")))); });
    ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    const url = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = `Non_conformita_${oggi()}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ---------- dettaglio ----------
  if (ed) {
    const ro = !puoSegnalazione(ed), g = ed.dati.gestione || {}, d = ed.dati;
    const testo = (k: keyof DatiNC, l: string, o: { w?: boolean; tipo?: string; ph?: string; lista?: string } = {}) => (
      <label className={"f" + (o.w ? " w" : "")}>{l}
        <input type={o.tipo || "text"} value={String(d[k] ?? "")} disabled={ro} placeholder={o.ph} list={o.lista} onChange={(e) => setD(k, e.target.value)} /></label>
    );
    const scelta = (k: keyof DatiNC, l: string, opz: ([string, string] | string)[]) => (
      <label className="f">{l}<select value={String(d[k] ?? "")} disabled={ro} onChange={(e) => setD(k, e.target.value)}>
        <option value="">—</option>{opz.map((o) => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o}>{o}</option>)}</select></label>
    );
    const gt = (k: keyof Gestione, l: string, o: { w?: boolean; tipo?: string; ph?: string; area?: boolean } = {}) => (
      <label className={"f" + (o.w ? " w" : "")}>{l}
        {o.area ? <textarea value={String(g[k] ?? "")} disabled={!gestisce} onChange={(e) => setG(k, e.target.value)} />
          : <input type={o.tipo || "text"} inputMode={o.tipo === "num" ? "decimal" : undefined} value={String(g[k] ?? "")} disabled={!gestisce} placeholder={o.ph} onChange={(e) => setG(k, e.target.value)} />}</label>
    );
    const costo = costoTotale(g);
    return (
      <div className="nc" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <div className="row">
            <button className="btn sec" onClick={() => { setEd(null); setMsg(""); }}>← Elenco</button>
            <h1 style={{ fontSize: 24 }}>{ed.numero || "Nuova non conformità"}</h1>
            {ed.id && <span className={"st st-" + ed.stato}>{nomeStato(ed.stato)}</span>}
          </div>
          {ed.id && <div className="row">
            <button className="btn sec" onClick={() => pdf("it")}>PDF per il fornitore</button>
            <button className="btn sec" onClick={() => pdf("en")}>PDF in inglese</button>
          </div>}
        </header>
        {msg && <div className="msg" role="status">{msg}</div>}
        {ro && ed.stato === "aperta" && !gestisce && <p className="nota">Puoi consultare questa non conformità; la modifica chi l&apos;ha aperta o Magazzino e controllo qualità.</p>}
        {ro && ed.stato !== "aperta" && !gestisce && <p className="nota">La non conformità è già in gestione: la segnalazione non si modifica più.</p>}

        <section className="box sez">
          <h2>Segnalazione</h2>
          <div className="fl">
            {testo("data", "Data rilevazione", { tipo: "date" })}
            {scelta("fase", "Dove è stata rilevata", FASI)}
            <label className="f">Fornitore *
              <input type="text" value={d.fornitore || ""} disabled={ro} list="nc-fornitori" placeholder="Scrivi per cercare" onChange={(e) => sceltaFornitore(e.target.value)} />
              {(() => { const f = fornDi(d); return f ? <small className="nota">{[f.codice && "cod. " + f.codice, [f.dati.indirizzo, f.dati.citta, f.dati.provincia && `(${f.dati.provincia})`].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</small>
                : d.fornitore ? <small className="nota">non in anagrafica fornitori</small> : null; })()}</label>
            {testo("ddt", "DDT n.")}
            {testo("ddt_data", "Data DDT", { tipo: "date" })}
            {testo("ordine", "Ordine di acquisto n.")}
            {testo("commessa", "Commessa")}
            {scelta("tipo", "Tipo di difetto", TIPI)}
            {scelta("gravita", "Gravità", GRAVITA)}
            <label className="f w">Descrizione della non conformità *
              <textarea value={d.descrizione || ""} disabled={ro} placeholder="Cosa non va: quote misurate, difetti visibili, documenti mancanti…" onChange={(e) => setD("descrizione", e.target.value)} /></label>
          </div>
          <div>
            <p className="nota" style={{ marginBottom: 6 }}>Articoli non conformi <span>· scrivi almeno 3 caratteri del codice o della descrizione e scegli dall&apos;elenco</span></p>
            <div className="mx">
              <table className="righe">
                <thead><tr><th style={{ width: "24%" }}>Codice</th><th>Descrizione</th><th style={{ width: 70 }}>UM</th><th style={{ width: 95 }}>Q.tà ricevuta</th><th style={{ width: 95 }}>Q.tà non conforme</th>{!ro && <th style={{ width: 36 }} />}</tr></thead>
                <tbody>
                  {(d.righe || []).map((x, i) => (
                    <tr key={i}>
                      <td><input value={x.codice} disabled={ro} list="nc-articoli" aria-label="Codice articolo"
                        onChange={(e) => { const v = e.target.value, hit = sugg.find((a) => a.codice === v); setR(i, hit ? { codice: hit.codice, descrizione: hit.descrizione, um: hit.um || "PZ" } : { codice: v }); if (!hit) cercaArticoli(v); }}
                        onBlur={(e) => { if (!x.descrizione) compilaArticolo(i, e.target.value); }}
                        onKeyDown={(e) => { if (e.key === "Enter") compilaArticolo(i, (e.target as HTMLInputElement).value); }} /></td>
                      <td><input value={x.descrizione} disabled={ro} aria-label="Descrizione articolo" onChange={(e) => setR(i, { descrizione: e.target.value })} /></td>
                      <td><input value={x.um} disabled={ro} aria-label="Unità di misura" onChange={(e) => setR(i, { um: e.target.value })} /></td>
                      <td><input value={x.q_ricevuta} disabled={ro} inputMode="decimal" aria-label="Quantità ricevuta" onChange={(e) => setR(i, { q_ricevuta: e.target.value })} /></td>
                      <td><input value={x.q_nc} disabled={ro} inputMode="decimal" aria-label="Quantità non conforme" onChange={(e) => setR(i, { q_nc: e.target.value })} /></td>
                      {!ro && <td><button type="button" className="btn link" aria-label="Togli articolo" onClick={() => setD("righe", (d.righe || []).filter((_, j) => j !== i))}>✕</button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!ro && <button type="button" className="btn sec" style={{ marginTop: 8 }} onClick={() => setD("righe", [...(d.righe || []), rigaVuota()])}>+ Articolo</button>}
            <datalist id="nc-articoli">{sugg.map((a) => <option key={a.codice} value={a.codice}>{a.descrizione}</option>)}</datalist>
          </div>
          <datalist id="nc-fornitori">{fornitori.map((f) => <option key={f} value={f} />)}</datalist>
          <div>
            <p className="nota" style={{ marginBottom: 6 }}>Foto e documenti</p>
            <div className="foto">
              {(d.foto || []).map((p) => (
                <figure key={p}>
                  {/\.(jpe?g|png|webp)$/i.test(p) ? (foto[p] ? <a href={foto[p]} target="_blank" rel="noreferrer"><img src={foto[p]} alt="Foto della non conformità" /></a> : null)
                    : <a href={foto[p]} target="_blank" rel="noreferrer" style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 12 }}>{p.split(".").pop()?.toUpperCase()}</a>}
                  {!ro && <button type="button" aria-label="Togli" onClick={() => setD("foto", (d.foto || []).filter((x) => x !== p))}>✕</button>}
                </figure>
              ))}
              {!ro && <label className="btn sec" style={{ height: 90, width: 120, justifyContent: "center", textAlign: "center" }}>
                + Foto<input type="file" accept="image/*,.pdf" multiple capture="environment" hidden onChange={(e) => { aggiungiFoto(e.target.files); e.target.value = ""; }} /></label>}
            </div>
          </div>
        </section>

        {(gestisce || ed.id) && (
          <section className="box sez">
            <h2>Gestione <small className="nota">{gestisce ? "Magazzino e controllo qualità" : "a cura di Magazzino e controllo qualità"}</small></h2>
            <div className="fl">
              <label className="f">Stato<select value={ed.stato} disabled={!gestisce} onChange={(e) => setEd({ ...ed, stato: e.target.value })}>
                {STATI.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="f">Trattamento deciso<select value={g.trattamento || ""} disabled={!gestisce} onChange={(e) => setG("trattamento", e.target.value)}>
                <option value="">—</option>{TRATTAMENTI.map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="f" style={{ justifyContent: "flex-end" }}><span className="ck"><input type="checkbox" style={{ width: "auto" }} checked={!!g.segregato} disabled={!gestisce} onChange={(e) => setG("segregato", e.target.checked)} /> Materiale segregato / bloccato</span></label>
              {gt("istruzioni", "Istruzioni per il trattamento", { w: true, area: true })}
            </div>
            <h3 style={{ margin: "6px 0 0", fontSize: 14 }}>Comunicazione con il fornitore</h3>
            <div className="fl">
              {gt("invio_data", "Inviata al fornitore il", { tipo: "date" })}
              {gt("invio_rif", "Riferimento / a chi")}
              {gt("scadenza_risposta", "Risposta richiesta entro", { tipo: "date" })}
              {gt("risposta_data", "Risposta ricevuta il", { tipo: "date" })}
              {gt("risposta", "Risposta del fornitore", { w: true, area: true })}
              {gt("azione_fornitore", "Azione correttiva del fornitore", { w: true, area: true })}
            </div>
            <h3 style={{ margin: "6px 0 0", fontSize: 14 }}>Costi</h3>
            <div className="fl">
              {gt("ore", "Ore interne", { tipo: "num" })}
              {gt("costo_ora", "Costo orario interno €", { tipo: "num", ph: String(COSTO_ORA) })}
              {gt("costo_materiale", "Materiale / rilavorazione €", { tipo: "num" })}
              {gt("costo_trasporto", "Trasporto / spedizione €", { tipo: "num" })}
              <label className="f">Costo totale<span className="tot" style={{ padding: "8px 0" }}>{eur(costo)}</span></label>
              {gt("addebito", "Da addebitare al fornitore €", { tipo: "num", ph: costo ? String(costo.toFixed(2)).replace(".", ",") : "" })}
              {gt("nota_credito", "Nota di credito / addebito n.")}
            </div>
            <h3 style={{ margin: "6px 0 0", fontSize: 14 }}>Chiusura</h3>
            <div className="fl">
              {gt("verifica", "Verifica dell'efficacia", { w: true, area: true })}
              {g.chiusa_il && <p className="nota">Chiusa il {fd(g.chiusa_il)}{g.chiusa_da ? " da " + (nomi[g.chiusa_da] || "") : ""}.</p>}
            </div>
          </section>
        )}

        <div className="row">
          {(puoSegnalazione(ed) || gestisce) && <>
            <button className="btn" disabled={salvo} onClick={() => salva(false)}>{nuova ? "Apri la non conformità" : "Salva"}</button>
            <button className="btn sec" disabled={salvo} onClick={() => salva(true)}>Salva e torna all&apos;elenco</button>
          </>}
          <span style={{ flex: 1 }} />
          {gestisce && ed.id && <button className="btn danger" onClick={elimina}>Elimina</button>}
        </div>
        {ed.id && <p className="nota">Aperta da {nomi[ed.creato_da || ""] || "—"} il {new Date(ed.creato_il).toLocaleString("it-IT")}</p>}
      </div>
    );
  }

  // ---------- elenco ----------
  const costoAnno = visibili.reduce((t, x) => t + n(x.dati.gestione?.addebito), 0);
  return (
    <div className="nc" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div><h1>Non conformità fornitori</h1><p className="sub">Segnala il materiale non conforme: Magazzino e controllo qualità lo gestisce con il fornitore.</p></div>
        <div className="row">
          {lista.length > 0 && <button className="btn sec" onClick={excel}>Esporta Excel</button>}
          {modifica && <button className="btn" onClick={crea}>Nuova non conformità</button>}
        </div>
      </header>
      {msg && <div className="msg" role="status">{msg}</div>}
      <div className="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="stati" role="group" aria-label="Filtra per stato">
          {[["attive", "Da chiudere"], ...STATI, ["tutte", "Tutte"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l} <span style={{ opacity: .6 }}>{conta(k)}</span></button>
          ))}
        </div>
        <div className="row">
          <input type="search" placeholder="Cerca numero, fornitore, codice, commessa, DDT…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 260px", padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 6 }} aria-label="Cerca" />
          <select value={anno} onChange={(e) => setAnno(e.target.value)} aria-label="Anno"><option value="">Tutti gli anni</option>{anni.map((a) => <option key={a}>{a}</option>)}</select>
        </div>
      </div>
      <div className="box mx">
        {carico ? <p className="sub">Caricamento…</p> : !visibili.length ? <div className="empty">{lista.length ? "Nessuna non conformità con questi filtri." : "Nessuna non conformità ancora. Premi «Nuova non conformità» quando trovi materiale non conforme."}</div> : (
          <table>
            <thead><tr><th>Numero</th><th>Data</th><th>Fornitore</th><th className="hide-s">Articolo</th><th className="hide-s">Difetto</th><th>Stato</th><th className="hide-s">Aperta da</th></tr></thead>
            <tbody>
              {visibili.map((x) => (
                <tr key={x.id} onClick={() => apri(x)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") apri(x); }}>
                  <td><b>{x.numero}</b>{x.dati.gravita === "critica" && <small className="g-critica">critica</small>}</td>
                  <td>{fd(x.dati.data)}</td>
                  <td>{x.dati.fornitore}<small>{[x.dati.ddt && "DDT " + x.dati.ddt, x.dati.commessa && "comm. " + x.dati.commessa].filter(Boolean).join(" · ")}</small></td>
                  {(() => { const rr = righeDi(x.dati), r0 = rr[0]; return <>
                    <td className="hide-s">{r0?.codice}{rr.length > 1 && <b> +{rr.length - 1}</b>}<small>{r0?.descrizione}</small></td>
                    <td className="hide-s">{x.dati.tipo}<small>{rr.length === 1 && r0.q_nc ? `${r0.q_nc} ${r0.um || ""} su ${r0.q_ricevuta || "?"}` : rr.length > 1 ? `${rr.length} articoli` : ""}</small></td></>; })()}
                  <td><span className={"st st-" + x.stato}>{nomeStato(x.stato)}</span>{x.dati.gestione?.trattamento && <small>{x.dati.gestione.trattamento}</small>}</td>
                  <td className="hide-s">{nomi[x.creato_da || ""] || ""}{mia(x) && <small>tu</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {costoAnno > 0 && <p className="nota" style={{ marginTop: 10 }}>Totale da addebitare ai fornitori (elenco filtrato): <span className="tot">{eur(costoAnno)}</span></p>}
      </div>
    </div>
  );
}
