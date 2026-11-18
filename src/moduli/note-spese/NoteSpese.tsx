"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MEZZI } from "@/moduli/rapporti/addebito";
import {
  CATEGORIE, METODI, STATI, VALUTE, daRimborsare, fd, giornoCambio, imp, inEuro, leggiCambio, nomeCat, nomeMetodo, nomeStato,
  totali, valuteDi, type Cambio, type Nota, type Rap, type Spesa,
} from "./calcolo";
import "./ns.css";

type Props = { me: string; nome: string; gestisce: boolean; modifica: boolean };

const oggi = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
// «1.234,56», «14,50» e anche «14.50» (tastiere col punto)
const leggiImporto = (t: string) => { const v = t.trim().replace(/\s/g, ""); const n = parseFloat(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const rid = () => Math.random().toString(36).slice(2, 10);
const periodo = (r?: Rap | null) => (r?.dal ? (r.al && r.al !== r.dal ? `${fd(r.dal)} – ${fd(r.al)}` : fd(r.dal)) : "");
const etichettaRap = (r?: Rap | null) => (r ? [r.numero || "Rapporto senza numero", r.cliente, periodo(r)].filter(Boolean).join(" · ") : "Rapporto non disponibile");

// Foto dello scontrino ridimensionata (lato lungo 1800 px: si legge ancora bene)
async function comprimi(f: File): Promise<Blob> {
  if (!f.type.startsWith("image/")) return f;
  const img = await createImageBitmap(f);
  const k = Math.min(1, 1800 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob((b) => ok(b || f), "image/jpeg", 0.82));
}

export default function NoteSpese({ me, nome, gestisce, modifica }: Props) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [lista, setLista] = useState<Nota[]>([]);
  const [rap, setRap] = useState<Record<string, Rap>>({});
  const [carico, setCarico] = useState(true);
  const [filtro, setFiltro] = useState<string>(gestisce ? "chiusa" : "bozza");
  const [q, setQ] = useState("");
  const [ed, setEd] = useState<Nota | null>(null);         // nota aperta
  const [es, setEs] = useState<Spesa | null>(null);        // spesa in modifica
  const [nuova, setNuova] = useState<{ rapporto_id: string; titolo: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [foto, setFoto] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState("");
  const [cambio, setCambio] = useState<Cambio | null>(null);
  const [miaCarta, setMiaCarta] = useState("");

  async function carica() {
    const [{ data, error }, { data: R }] = await Promise.all([
      sb.from("note_spese").select("*").order("creato_il", { ascending: false }),
      sb.rpc("rapporti_per_note"),
    ]);
    if (error) setMsg("Non riesco a leggere le note spese: " + error.message);
    setLista((data ?? []) as Nota[]);
    setRap(Object.fromEntries(((R ?? []) as Rap[]).map((r) => [r.id, r])));
    setCarico(false);
    return (data ?? []) as Nota[];
  }
  useEffect(() => {
    carica();
    sb.rpc("mia_carta").then(({ data }) => setMiaCarta(typeof data === "string" ? data : ""));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // cambi della nota aperta: giorno della firma del rapporto (prima della firma: oggi, provvisorio)
  const spese = ed?.dati.spese ?? [];
  const chiaveValute = valuteDi(spese).join(",");
  const r = ed ? rap[ed.rapporto_id] : null;
  useEffect(() => {
    if (!ed) { setCambio(null); return; }
    const g = giornoCambio(r);
    leggiCambio(g.data, chiaveValute.split(",").filter(Boolean), g.provvisorio).then(setCambio);
  }, [ed?.id, chiaveValute, r?.firma_ts]); // eslint-disable-line react-hooks/exhaustive-deps

  // anteprime delle foto
  useEffect(() => {
    const mancano = [...new Set([...spese.flatMap((s) => s.foto || []), ...(es?.foto || [])])].filter((p) => !foto[p]);
    if (!mancano.length) return;
    sb.storage.from("note-spese").createSignedUrls(mancano, 3600).then(({ data }) => {
      if (data) setFoto((f) => ({ ...f, ...Object.fromEntries(data.filter((x) => x.signedUrl && x.path).map((x) => [x.path as string, x.signedUrl as string])) }));
    });
  }, [ed?.dati.spese, es?.foto]); // eslint-disable-line react-hooks/exhaustive-deps

  const mia = (n: Nota) => n.creato_da === me;
  const puoModificare = (n: Nota | null) => !!n && (gestisce || (modifica && mia(n) && n.stato === "bozza"));
  const ro = !puoModificare(ed);

  const visibili = lista.filter((n) => {
    if (filtro !== "tutte" && n.stato !== filtro) return false;
    const t = q.trim().toLowerCase();
    const R = rap[n.rapporto_id];
    return !t || [n.numero, n.dati.titolo, n.dati.autore, R?.numero, R?.cliente].join(" ").toLowerCase().includes(t);
  });
  const conta = (f: string) => lista.filter((n) => f === "tutte" || n.stato === f).length;

  // ---------- salvataggi ----------
  async function salvaDati(n: Nota, dati: Nota["dati"], stato?: Nota["stato"]) {
    setLavoro(true);
    const { data, error } = await sb.from("note_spese").update({ dati, ...(stato ? { stato } : {}) }).eq("id", n.id).select().single();
    setLavoro(false);
    if (error) { setMsg("Non salvato: " + error.message); return null; }
    const x = data as Nota;
    setEd(x); setLista((L) => L.map((y) => (y.id === x.id ? x : y)));
    return x;
  }
  async function creaNota() {
    if (!nuova?.rapporto_id) { setMsg("Scegli il rapporto d'intervento della trasferta."); return; }
    setLavoro(true);
    const { data, error } = await sb.from("note_spese").insert({ rapporto_id: nuova.rapporto_id, dati: { titolo: nuova.titolo.trim(), spese: [] } }).select().single();
    setLavoro(false);
    if (error) { setMsg("Non creata: " + error.message); return; }
    const x = data as Nota;
    setLista((L) => [x, ...L]); setNuova(null); setEd(x); setMsg("");
    nuovaSpesa(x);
  }
  function nuovaSpesa(n: Nota | null = ed) {
    if (!n) return;
    const ultima = (n.dati.spese || []).slice(-1)[0];
    const R = rap[n.rapporto_id];
    const d = oggi();
    setEs({ id: rid(), data: R?.dal && R.al && (d < R.dal || d > R.al) ? R.al : d, cat: "", esercente: "", importo: 0, valuta: ultima?.valuta || "EUR", metodo: "aziendale", fatt: false, foto: [], note: "" });
  }
  async function salvaSpesa() {
    if (!ed || !es) return;
    if (!es.cat) { setMsg("Scegli la categoria."); return; }
    if (!(es.importo > 0)) { setMsg("Scrivi l'importo."); return; }
    if (es.cat === "carburante" && !es.mezzo) { setMsg("Per il carburante indica il mezzo aziendale."); return; }
    if (es.mezzo === "altro" && !es.mezzoAltro?.trim()) { setMsg("Scrivi quale mezzo hai usato."); return; }
    if (!es.foto?.length && !confirm("Non hai allegato la foto dello scontrino. Salvo lo stesso?")) return;
    const L = [...(ed.dati.spese || [])];
    const i = L.findIndex((s) => s.id === es.id);
    if (i >= 0) L[i] = es; else L.push(es);
    L.sort((a, b) => a.data.localeCompare(b.data));
    if (await salvaDati(ed, { ...ed.dati, spese: L })) { setEs(null); setMsg(""); }
  }
  async function togliSpesa() {
    if (!ed || !es) return;
    if (!confirm("Elimino questa spesa e le sue foto?")) return;
    const L = (ed.dati.spese || []).filter((s) => s.id !== es.id);
    if (await salvaDati(ed, { ...ed.dati, spese: L })) {
      if (es.foto?.length) await sb.storage.from("note-spese").remove(es.foto);
      setEs(null);
    }
  }
  async function aggiungiFoto(files: FileList | null) {
    if (!ed || !es || !files?.length) return;
    setLavoro(true); setMsg("");
    const nuove: string[] = [];
    for (const f of Array.from(files)) {
      const blob = await comprimi(f);
      const path = `${ed.id}/${es.id}-${rid()}.${blob.type === "image/jpeg" ? "jpg" : (f.name.split(".").pop() || "bin").toLowerCase()}`;
      const { error } = await sb.storage.from("note-spese").upload(path, blob, { contentType: blob.type || f.type });
      if (error) { setMsg("Foto non caricata: " + error.message); continue; }
      nuove.push(path);
    }
    setLavoro(false);
    setEs((s) => s && { ...s, foto: [...(s.foto || []), ...nuove] });
  }
  async function togliFoto(p: string) {
    if (!es || !confirm("Tolgo questa foto?")) return;
    await sb.storage.from("note-spese").remove([p]);
    setEs({ ...es, foto: (es.foto || []).filter((x) => x !== p) });
    // se la spesa era già salvata, aggiorna subito la nota
    if (ed && (ed.dati.spese || []).some((s) => s.id === es.id)) {
      await salvaDati(ed, { ...ed.dati, spese: (ed.dati.spese || []).map((s) => (s.id === es.id ? { ...s, foto: (s.foto || []).filter((x) => x !== p) } : s)) });
    }
  }
  async function chiudi() {
    if (!ed) return;
    if (!spese.length) { setMsg("Aggiungi almeno una spesa prima di chiudere la nota."); return; }
    const senzaFoto = spese.filter((s) => !s.foto?.length).length;
    const t = totali(spese, cambio);
    const avvisi = [senzaFoto && `${senzaFoto} ${senzaFoto === 1 ? "spesa è" : "spese sono"} senza foto dello scontrino`,
      t.rimborsare > 0 && "ci sono spese pagate con carta personale o contanti (da rimborsare)"].filter(Boolean);
    if (!confirm(`Chiudo la nota spese ${ed.numero} e la mando all'Amministrazione per la verifica?${avvisi.length ? "\n\nAttenzione: " + avvisi.join("; ") + "." : ""}\n\nDopo non potrai più modificarla.`)) return;
    if (await salvaDati(ed, ed.dati, "chiusa")) {
      setMsg(`Nota spese ${ed.numero} chiusa e inviata in verifica.`);
      fetch("/api/notifiche", { method: "POST" }).catch(() => {});
    }
  }
  async function verifica() {
    if (!ed || !confirm(`Segno la nota spese ${ed.numero} come verificata?`)) return;
    if (await salvaDati(ed, { ...ed.dati, rimandata: undefined }, "verificata")) setMsg(`Nota spese ${ed.numero} verificata.`);
  }
  async function rimanda() {
    if (!ed) return;
    const m = prompt("Perché la rimandi indietro? Il trasfertista riceve una mail con questo motivo.", ed.dati.rimandata || "");
    if (m == null) return;
    if (!m.trim()) { setMsg("Scrivi il motivo."); return; }
    if (await salvaDati(ed, { ...ed.dati, rimandata: m.trim() }, "bozza")) {
      setMsg(`Nota spese ${ed.numero} rimandata a ${ed.dati.autore || "chi l'ha compilata"}.`);
      fetch("/api/notifiche", { method: "POST" }).catch(() => {});
    }
  }
  async function riapri() {
    if (!ed || !confirm("Riporto la nota tra quelle da verificare?")) return;
    await salvaDati(ed, ed.dati, "chiusa");
  }
  async function elimina() {
    if (!ed || !confirm(`Elimino la nota spese ${ed.numero} con tutte le spese e le foto?`)) return;
    const tutte = spese.flatMap((s) => s.foto || []);
    const { error } = await sb.from("note_spese").delete().eq("id", ed.id);
    if (error) { setMsg("Non eliminata: " + error.message); return; }
    if (tutte.length) await sb.storage.from("note-spese").remove(tutte);
    setLista((L) => L.filter((x) => x.id !== ed.id)); setEd(null); setMsg("Nota spese eliminata.");
  }
  async function cambiaRapporto(id: string) {
    if (!ed || !id || id === ed.rapporto_id) return;
    setLavoro(true);
    const { data, error } = await sb.from("note_spese").update({ rapporto_id: id }).eq("id", ed.id).select().single();
    setLavoro(false);
    if (error) { setMsg("Non salvato: " + error.message); return; }
    setEd(data as Nota); setLista((L) => L.map((y) => (y.id === ed.id ? (data as Nota) : y)));
  }
  async function pdf() {
    if (!ed) return;
    setLavoro(true); setMsg("");
    try {
      const [{ jsPDF }, { pdfNotaSpese }] = await Promise.all([import("jspdf"), import("./pdf")]);
      const immagini: Record<string, string> = {};
      for (const p of spese.flatMap((s) => s.foto || [])) {
        const { data } = await sb.storage.from("note-spese").download(p);
        if (data && data.type.startsWith("image/")) immagini[p] = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(data); });
      }
      const logo = await fetch("/logo/kimatic").then((x) => x.blob()).then((b) => new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b); })).catch(() => "");
      const doc = pdfNotaSpese(jsPDF, ed, r, cambio, { logo, immagini });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(doc.output("blob"));
      a.download = `Nota spese ${ed.numero} ${ed.dati.autore || ""} ${r?.cliente || ""}.pdf`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { setMsg("Non riesco a creare il PDF: " + (e instanceof Error ? e.message : "errore")); }
    setLavoro(false);
  }

  // ---------- viste ----------
  const zoomEl = zoom && <div className="zoom" onClick={() => setZoom("")} role="dialog" aria-label="Foto dello scontrino"><img src={zoom} alt="Scontrino" /></div>;

  // Nuova nota: scelta della trasferta
  if (nuova) {
    const L = Object.values(rap);
    return (
      <div className="ns" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <header className="row"><button className="btn sec" onClick={() => setNuova(null)}>← Elenco</button><h1 style={{ fontSize: 24 }}>Nuova nota spese</h1></header>
        {msg && <div className="msg" role="status">{msg}</div>}
        <section className="box" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="f">Trasferta: rapporto d&apos;intervento *
            <select value={nuova.rapporto_id} onChange={(e) => setNuova({ ...nuova, rapporto_id: e.target.value })}>
              <option value="">— scegli —</option>
              {L.map((x) => <option key={x.id} value={x.id}>{etichettaRap(x)}</option>)}
            </select>
            <small className="nota">{L.length ? "Ci sono i rapporti che hai creato tu o in cui sei indicato tra i tecnici." : "Non trovo rapporti d'intervento a tuo nome: prima va creato il rapporto della trasferta (o devi essere indicato tra i tecnici)."}</small>
          </label>
          <label className="f">Descrizione (facoltativa)
            <input value={nuova.titolo} placeholder="es. trasferta Samaplast" onChange={(e) => setNuova({ ...nuova, titolo: e.target.value })} />
          </label>
          <div className="azioni"><button className="btn" disabled={lavoro} onClick={creaNota}>Crea e aggiungi la prima spesa</button></div>
        </section>
      </div>
    );
  }

  // Spesa in modifica
  if (ed && es) {
    const pers = daRimborsare(es);
    const e1 = inEuro(es, cambio);
    const roS = ro;
    return (
      <div className="ns" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {zoomEl}
        <header className="row"><button className="btn sec" onClick={() => { setEs(null); setMsg(""); }}>← Nota {ed.numero}</button><h1 style={{ fontSize: 22 }}>{(ed.dati.spese || []).some((s) => s.id === es.id) ? "Spesa" : "Nuova spesa"}</h1></header>
        {msg && <div className="msg" role="status">{msg}</div>}
        <section className="box" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <p className="nota" style={{ marginBottom: 6 }}>Foto dello scontrino</p>
            <div className="foto">
              {(es.foto || []).map((p) => (
                <figure key={p}>{foto[p] ? <img src={foto[p]} alt="Scontrino" onClick={() => setZoom(foto[p])} /> : <span className="nota" style={{ padding: 6 }}>Carico…</span>}
                  {!roS && <button type="button" onClick={() => togliFoto(p)} aria-label="Togli la foto">✕</button>}</figure>
              ))}
              {!roS && <label className="scatta">📷<br />Fotografa o carica lo scontrino
                <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { aggiungiFoto(e.target.files); e.target.value = ""; }} /></label>}
            </div>
          </div>
          <div className="fl">
            <label className="f">Data *<input type="date" value={es.data} disabled={roS} onChange={(e) => setEs({ ...es, data: e.target.value })} /></label>
            <label className="f">Categoria *
              <select value={es.cat} disabled={roS} onChange={(e) => { const c = CATEGORIE.find((x) => x.id === e.target.value); setEs({ ...es, cat: e.target.value, fatt: c?.fatt ?? false, ...(e.target.value !== "carburante" ? { mezzo: undefined, mezzoAltro: undefined } : {}) }); }}>
                <option value="">— scegli —</option>{CATEGORIE.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select></label>
            <label className="f">Esercente<input value={es.esercente || ""} disabled={roS} placeholder="es. Pepesale, Esso…" onChange={(e) => setEs({ ...es, esercente: e.target.value })} /></label>
            <label className="f">Importo (IVA inclusa) *
              <input inputMode="decimal" disabled={roS} defaultValue={es.importo ? String(es.importo).replace(".", ",") : ""} placeholder="0,00"
                onChange={(e) => setEs({ ...es, importo: leggiImporto(e.target.value) })} /></label>
            <label className="f">Valuta
              <select value={es.valuta} disabled={roS} onChange={(e) => setEs({ ...es, valuta: e.target.value })}>{VALUTE.map((v) => <option key={v} value={v}>{v}</option>)}</select>
              {es.valuta !== "EUR" && <small className="nota">{e1 != null ? `≈ ${imp(e1)} al cambio ${cambio?.provvisorio ? "di oggi (provvisorio)" : "del " + fd(cambio?.data)}` : "cambio non disponibile"}</small>}
            </label>
          </div>
          <div>
            <p className="nota" style={{ marginBottom: 6 }}>Pagata con</p>
            <div className="metodi" role="group" aria-label="Metodo di pagamento">
              {METODI.map(([m, l]) => (
                <button key={m} type="button" disabled={roS} className={m !== "aziendale" ? "p" : ""} aria-pressed={es.metodo === m} onClick={() => setEs({ ...es, metodo: m })}>
                  {m === "aziendale" ? nomeMetodo(m, ed.dati.carta || (mia(ed) ? miaCarta : "")) : l}
                </button>
              ))}
            </div>
            {pers && <p className="avviso" style={{ marginTop: 8 }}>Pagata con <b>{es.metodo === "contanti" ? "contanti" : "carta personale"}</b>: la spesa risulterà <b>da rimborsare</b> ed è evidenziata per l&apos;Amministrazione.</p>}
            {!pers && !(ed.dati.carta || miaCarta) && <p className="nota" style={{ marginTop: 6 }}>Le ultime cifre della tua carta aziendale non sono nell&apos;Anagrafica dipendenti: chiedi all&apos;Amministrazione di inserirle.</p>}
          </div>
          {es.cat === "carburante" && (
            <div className="fl">
              <label className="f">Mezzo aziendale *
                <select value={es.mezzo || ""} disabled={roS} onChange={(e) => setEs({ ...es, mezzo: e.target.value })}>
                  <option value="">— scegli —</option>
                  {MEZZI.map((m) => <option key={m.targa} value={m.targa}>{m.nome} · {m.targa}</option>)}
                  <option value="altro">Altro (noleggio…)</option>
                </select></label>
              {es.mezzo === "altro" && <label className="f">Quale mezzo *<input value={es.mezzoAltro || ""} disabled={roS} placeholder="es. auto a noleggio, targa" onChange={(e) => setEs({ ...es, mezzoAltro: e.target.value })} /></label>}
            </div>
          )}
          <label className="f w">Note<textarea value={es.note || ""} disabled={roS} onChange={(e) => setEs({ ...es, note: e.target.value })} /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input type="checkbox" checked={!!es.fatt} disabled={roS} onChange={(e) => setEs({ ...es, fatt: e.target.checked })} /> Da addebitare al cliente
          </label>
          {!roS && <div className="azioni">
            <button className="btn" disabled={lavoro} onClick={salvaSpesa}>{lavoro ? "Attendi…" : "Salva la spesa"}</button>
            {(ed.dati.spese || []).some((s) => s.id === es.id) && <button className="btn sec" disabled={lavoro} onClick={togliSpesa}>Elimina la spesa</button>}
          </div>}
        </section>
      </div>
    );
  }

  // Nota aperta
  if (ed) {
    const t = totali(spese, cambio);
    const L = Object.values(rap);
    return (
      <div className="ns" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {zoomEl}
        <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="row">
            <button className="btn sec" onClick={() => { setEd(null); setMsg(""); }}>← Elenco</button>
            <h1 style={{ fontSize: 24 }}>Nota spese {ed.numero}</h1>
            <span className={"st st-" + ed.stato}>{nomeStato(ed.stato)}</span>
          </div>
          <div className="azioni">
            <button className="btn sec" disabled={lavoro || !spese.length} onClick={pdf}>Scarica PDF</button>
            {!ro && ed.stato === "bozza" && <button className="btn" disabled={lavoro} onClick={() => nuovaSpesa()}>+ Aggiungi spesa</button>}
            {ed.stato === "bozza" && mia(ed) && <button className="btn" disabled={lavoro || !spese.length} onClick={chiudi}>Chiudi e invia in verifica</button>}
            {gestisce && ed.stato === "chiusa" && <><button className="btn" disabled={lavoro} onClick={verifica}>Verificata</button><button className="btn sec" disabled={lavoro} onClick={rimanda}>Rimanda indietro</button></>}
            {gestisce && ed.stato === "verificata" && <button className="btn sec" disabled={lavoro} onClick={riapri}>Togli la verifica</button>}
            {(gestisce || (mia(ed) && ed.stato === "bozza")) && <button className="btn sec" disabled={lavoro} onClick={elimina}>Elimina</button>}
          </div>
        </header>
        {msg && <div className="msg" role="status">{msg}</div>}
        {ed.stato === "bozza" && ed.dati.rimandata && <div className="avviso"><b>Rimandata dall&apos;Amministrazione:</b> {ed.dati.rimandata}</div>}
        {ed.stato !== "bozza" && !gestisce && <p className="nota">La nota è chiusa: per correggerla chiedi all&apos;Amministrazione di rimandarla indietro.</p>}

        <section className="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="fl">
            <label className="f">Trasferta: rapporto d&apos;intervento
              {!ro ? <select value={ed.rapporto_id} onChange={(e) => cambiaRapporto(e.target.value)}>
                {!rap[ed.rapporto_id] && <option value={ed.rapporto_id}>Rapporto non visibile</option>}
                {L.map((x) => <option key={x.id} value={x.id}>{etichettaRap(x)}</option>)}
              </select> : <input disabled value={etichettaRap(r)} />}
            </label>
            <label className="f">Descrizione
              <input value={ed.dati.titolo || ""} disabled={ro} placeholder="es. trasferta Samaplast" onChange={(e) => setEd({ ...ed, dati: { ...ed.dati, titolo: e.target.value } })} onBlur={() => !ro && salvaDati(ed, ed.dati)} />
            </label>
          </div>
          <p className="nota">
            {[ed.dati.autore && "Compilata da " + ed.dati.autore,
              ed.dati.carta ? "carta aziendale ••" + ed.dati.carta : "carta aziendale non indicata in anagrafica",
              ed.dati.chiusa_il && "chiusa il " + fd(ed.dati.chiusa_il.slice(0, 10)),
              ed.dati.verificata_il && `verificata il ${fd(ed.dati.verificata_il.slice(0, 10))} da ${ed.dati.verificata_da}`].filter(Boolean).join(" · ")}
          </p>
        </section>

        <section className="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Spese <small className="nota">{spese.length}</small></h2>
          {!spese.length ? <p className="nota">Nessuna spesa. {!ro && "Premi «+ Aggiungi spesa» e fotografa lo scontrino."}</p> : (
            <div className="spese">
              {spese.map((s) => {
                const e1 = inEuro(s, cambio), p = daRimborsare(s), f0 = (s.foto || [])[0];
                const mz = s.mezzo === "altro" ? s.mezzoAltro : MEZZI.find((m) => m.targa === s.mezzo)?.nome;
                return (
                  <button key={s.id} type="button" className={"spesa" + (p ? " p" : "")} onClick={() => { setEs(JSON.parse(JSON.stringify(s))); setMsg(""); }}>
                    <span className="thumb">{f0 ? (foto[f0] ? <img src={foto[f0]} alt="" /> : "…") : "senza foto"}</span>
                    <span style={{ minWidth: 0 }}>
                      <b>{nomeCat(s.cat)}</b>{s.esercente && " – " + s.esercente}<br />
                      <span className="nota">{[fd(s.data), mz && "⛽ " + mz, s.fatt && "da addebitare"].filter(Boolean).join(" · ")}</span><br />
                      {p ? <span className="tag-pers">{s.metodo === "contanti" ? "Contanti" : "Carta personale"} · da rimborsare</span> : <span className="nota">{nomeMetodo(s.metodo, ed.dati.carta)}</span>}
                    </span>
                    <span className="imp">{imp(s.importo, s.valuta)}{s.valuta !== "EUR" && <small>{e1 != null ? "≈ " + imp(e1) : "senza cambio"}</small>}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {spese.length > 0 && (
          <section className="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 style={{ margin: 0 }}>Totale trasferta</h2>
            <div className="tot">
              {t.perValuta.map((v) => (
                <span key={v.valuta} style={{ display: "contents" }}>
                  <span>In {v.valuta}{v.valuta !== "EUR" && v.tasso ? <span className="nota"> (1 € = {String(v.tasso).replace(".", ",")} {v.valuta})</span> : ""}</span>
                  <span className="v">{imp(v.totale, v.valuta)}{v.valuta !== "EUR" && <span className="nota" style={{ fontWeight: 400 }}> = {v.euro != null ? imp(v.euro) : "—"}</span>}</span>
                </span>
              ))}
              <span className="big"><b>Totale in euro</b></span><span className="v big">{imp(t.euro)}</span>
              <span className={t.rimborsare ? "pers" : ""}>Da rimborsare (carta personale / contanti)</span><span className={"v" + (t.rimborsare ? " pers" : "")}>{imp(t.rimborsare)}</span>
              <span>Pagato con carta aziendale</span><span className="v">{imp(t.aziendale)}</span>
              <span>Da addebitare al cliente</span><span className="v">{imp(t.fatturabile)}</span>
            </div>
            {valuteDi(spese).some((v) => v !== "EUR") && (
              <p className="nota">
                {cambio?.provvisorio
                  ? "Cambio provvisorio di oggi: quando il cliente firma il rapporto d'intervento si usa il cambio BCE del giorno della firma."
                  : `Cambio BCE del ${fd(cambio?.data_bce)}${cambio && cambio.data_bce !== cambio.data ? ` (firma del rapporto il ${fd(cambio.data)}, giorno senza cambio BCE)` : ", giorno della firma del rapporto"}.`}
                {t.senzaCambio.length > 0 && ` Cambio non disponibile per ${t.senzaCambio.join(", ")}: queste spese non sono nel totale in euro.`}
              </p>
            )}
          </section>
        )}
      </div>
    );
  }

  // Elenco
  return (
    <div className="ns" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div><h1>Note spese</h1><p className="sub">Spese di trasferta con la foto degli scontrini, legate al rapporto d&apos;intervento.</p></div>
        {modifica && <button className="btn" onClick={() => { setNuova({ rapporto_id: "", titolo: "" }); setMsg(""); }}>+ Nuova nota spese</button>}
      </header>
      {msg && <div className="msg" role="status">{msg}</div>}
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <div className="stati" role="group" aria-label="Filtra per stato">
          {[...STATI, ["tutte", "Tutte"] as [string, string]].map(([k, l]) => <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l} ({conta(k)})</button>)}
        </div>
        <input type="search" placeholder="Cerca numero, cliente, persona…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} aria-label="Cerca" />
      </div>
      {carico ? <p className="nota">Carico…</p> : !visibili.length ? <p className="nota">Nessuna nota spese {filtro !== "tutte" ? `«${nomeStato(filtro).toLowerCase()}»` : ""}.</p> : (
        <div className="lista">
          {visibili.map((n) => {
            const R = rap[n.rapporto_id], S = n.dati.spese || [];
            const tv = totali(S).perValuta.map((v) => imp(v.totale, v.valuta)).join(" + ") || imp(0);
            const p = S.some(daRimborsare);
            return (
              <button key={n.id} type="button" className="riga" onClick={() => { setEd(n); setMsg(""); window.scrollTo(0, 0); }}>
                <span style={{ minWidth: 0 }}>
                  <b>{n.numero}</b> <span className={"st st-" + n.stato}>{nomeStato(n.stato)}</span>{n.stato === "bozza" && n.dati.rimandata && <> <span className="tag-pers">rimandata</span></>}<br />
                  <span className="nota">{[R ? [R.numero, R.cliente].filter(Boolean).join(" · ") : "", periodo(R), (gestisce || !mia(n)) && n.dati.autore, n.dati.titolo].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="dx">{tv}<br /><span className="nota" style={{ fontWeight: 400 }}>{S.length} {S.length === 1 ? "spesa" : "spese"}</span>{p && <><br /><span className="tag-pers">carta personale</span></>}</span>
              </button>
            );
          })}
        </div>
      )}
      {!gestisce && <p className="nota">Vedi solo le tue note spese. {nome && `Collegato come ${nome}.`}</p>}
    </div>
  );
}
