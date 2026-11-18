"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { daTabella, type Ordine } from "./sam";
import "./mancanti.css";

type Props = { me: string; gestisce: boolean; modifica: boolean };
export type Mancante = {
  id: number; commessa: string; matricola: string; macchina: string; op: string; op_descr: string; op_num: string;
  codice: string; descr: string; qta: number | null; giac_mp: number | null; giac_mg: number | null; giac_grezzi: number | null;
  fornitore: string; cella: string; cdep: string; ultima_lav: string; ordini: Ordine[]; consegna: string | null;
  aperto: boolean; primo_il: string; visto_il: string; chiuso_il: string | null;
  nota: string; nota_il: string | null; responsabile: string | null; prevista: string | null; priorita: "" | "alta" | "bassa";
};
type Commessa = { commessa: string; cliente: string; montaggio: string | null; note: string; nascosta: boolean };
type MacchinaPiano = { code: string; desc: string; s: string | null; e: string | null; done: boolean; chi: string | null };
type CommessaPiano = { commessa: string; cliente: string; chiusa: boolean; macchine: MacchinaPiano[] };
type Assegnazione = { tipo: "fornitore" | "cella"; valore: string; persona: string };
type Import = { il: string; origine: string; file: string; commesse: string[]; righe: number; nuovi: number; chiusi: number };

// stato di un mancante, dal più vicino al montaggio al più lontano
const STATI = [
  ["magazzino", "Pronto a magazzino", "c'è giacenza: si può prelevare"],
  ["cdep", "In conto deposito", "presso un fornitore in conto deposito"],
  ["cella", "In lavorazione interna", "in una cella di lavorazione Kimatic"],
  ["ordinato", "Ordinato", "c'è un ordine o un fornitore"],
  ["scoperto", "Scoperto", "né giacenza, né ordine, né lavorazione"],
] as const;
type Stato = (typeof STATI)[number][0];
export function statoDi(m: Mancante): Stato {
  if (m.qta != null && m.giac_mp != null && m.giac_mp >= m.qta && m.qta > 0) return "magazzino";
  if (m.cdep) return "cdep";
  if (m.cella) return "cella";
  if (m.ordini.length || m.fornitore) return "ordinato";
  return "scoperto";
}
const nomeStato = (s: string) => STATI.find((x) => x[0] === s)?.[1] || s;

const oggi = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const fd = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : "");
const quando = (s?: string | null) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const q2 = (v: number | null) => (v == null ? "" : v.toLocaleString("it-IT", { maximumFractionDigits: 2 }));
/** Data attesa: prima la data prevista scritta a mano, poi la consegna dell'ordine. */
const attesa = (m: Mancante) => m.prevista || m.consegna;
/** In ritardo: data attesa passata, o oltre l'inizio montaggio della commessa. */
function ritardo(m: Mancante, montaggio?: string | null): "" | "scaduta" | "oltre" {
  if (!m.aperto || statoDi(m) === "magazzino") return "";
  const a = attesa(m);
  if (a && a < oggi()) return "scaduta";
  if (montaggio && (!a || a > montaggio) && statoDi(m) !== "cdep") return "oltre";
  return "";
}
// «080/2026» → «80/2026» (come in SAM)
const norm = (c: string) => { const m = /^0*(\d+)\/(\d{4})$/.exec((c || "").trim()); return m ? `${+m[1]}/${m[2]}` : (c || "").trim(); };
// testo leggibile sopra un colore di sfondo
const scuro = (hex: string) => { const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5; };
// «247/2026» → «2026/000247»: prima l'anno, poi il numero
const ordComm = (c: string) => { const [n, a] = c.split("/"); return `${a || ""}/${(n || "").padStart(6, "0")}`; };
const pezzi = (v: string) => v.split(/\s+/).filter(Boolean);
const trova = (m: Mancante, q: string) => !q || pezzi(q.toLowerCase()).every((p) => [m.codice, m.descr, m.macchina, m.matricola, m.op, m.op_descr, m.fornitore, m.cella, m.cdep, m.nota, m.commessa, ...m.ordini.map((o) => o.num + " " + o.fornitore)].join(" ").toLowerCase().includes(p));

export default function Mancanti({ me, gestisce, modifica }: Props) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [righe, setRighe] = useState<Mancante[]>([]);
  const [comm, setComm] = useState<Record<string, Commessa>>({});
  const [ult, setUlt] = useState<Import | null>(null);
  const [persone, setPersone] = useState<{ id: string; nome: string; colore: string | null; profilo: string | null; ordine: number }[]>([]);
  const [carico, setCarico] = useState(true);
  const [vista, setVista] = useState<"commesse" | "fornitori" | "reparti" | "prelevati" | "assegnazioni">("commesse");
  const [aperta, setAperta] = useState<string>("");          // commessa / fornitore / reparto aperto
  const [q, setQ] = useState("");
  const [filtroStato, setFiltroStato] = useState<string>("");
  const [soloRitardi, setSoloRitardi] = useState(false);
  const [nascoste, setNascoste] = useState(false);
  const [msg, setMsg] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [piano, setPiano] = useState<Record<string, CommessaPiano>>({});
  const [assegn, setAssegn] = useState<Assegnazione[]>([]);
  const [colori, setColori] = useState<Record<string, string>>({});

  async function carica() {
    const tutte: Mancante[] = [];
    const da14 = new Date(Date.now() - 14 * 864e5).toISOString();
    for (let da = 0; ; da += 1000) {
      const { data, error } = await sb.from("mancanti").select("*").or(`aperto.eq.true,chiuso_il.gte.${da14}`).order("id").range(da, da + 999);
      if (error) { setMsg(/does not exist|schema cache/.test(error.message) ? "Manca la migrazione 0048 (mancanti montaggi): lanciala nell'SQL Editor di Supabase." : "Non riesco a leggere i mancanti: " + error.message); break; }
      tutte.push(...((data ?? []) as Mancante[]).map((x) => ({ ...x, qta: x.qta == null ? null : Number(x.qta), giac_mp: x.giac_mp == null ? null : Number(x.giac_mp), giac_mg: x.giac_mg == null ? null : Number(x.giac_mg), giac_grezzi: x.giac_grezzi == null ? null : Number(x.giac_grezzi) })));
      if (!data || data.length < 1000) break;
    }
    const [{ data: C }, { data: I }, { data: P }, { data: A }, { data: K }] = await Promise.all([
      sb.from("mancanti_commesse").select("*"),
      sb.from("mancanti_import").select("*").order("il", { ascending: false }).limit(1),
      sb.rpc("mancanti_piano"),
      sb.from("mancanti_assegnazioni").select("*"),
      sb.from("mancanti_colori").select("*"),
    ]);
    const { data: PP } = await sb.from("mancanti_persone").select("*").order("ordine").order("nome");
    setPersone((PP ?? []) as typeof persone);
    setPiano(Object.fromEntries(((P ?? []) as CommessaPiano[]).map((c) => [norm(c.commessa), c])));
    setAssegn((A ?? []) as Assegnazione[]);
    setColori(Object.fromEntries([...((K ?? []) as { chiave: string; colore: string }[]).map((k) => [k.chiave, k.colore]),
      ...((PP ?? []) as { id: string; colore: string | null }[]).filter((x) => x.colore).map((x) => [x.id, x.colore as string])]));
    setRighe(tutte);
    setComm(Object.fromEntries(((C ?? []) as Commessa[]).map((c) => [c.commessa, c])));
    setUlt(((I ?? []) as Import[])[0] ?? null);
    setCarico(false);
  }
  useEffect(() => {
    carica();
    // l'elenco delle persone si carica con il resto (mancanti_persone)
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // inizio montaggio (fase 3B del Piano produzione): della macchina o del gruppo, altrimenti il primo della commessa
  const montaggioComm = (c: string): string | null => {
    const P = piano[norm(c)];
    const d = (P?.macchine || []).filter((x) => !x.done && x.s).map((x) => x.s as string).sort()[0];
    return d || comm[c]?.montaggio || null;
  };
  const macchinaDi = (m: Mancante) => { const P = piano[norm(m.commessa)]; return P?.macchine.find((x) => x.code && x.code === m.op) || P?.macchine.find((x) => x.code && x.code === m.matricola) || null; };
  const montaggioDi = (m: Mancante) => { const x = macchinaDi(m); return (x && !x.done && x.s) || montaggioComm(m.commessa); };
  const clienteDi = (c: string) => piano[norm(c)]?.cliente || comm[c]?.cliente || "";
  const nelPiano = (c: string) => !!piano[norm(c)] && !piano[norm(c)].chiusa;
  // chi segue il codice: scelto sulla riga, altrimenti dalle assegnazioni (cella, poi fornitore)
  const personaDi = (m: Mancante) => m.responsabile
    || (m.cella && assegn.find((a) => a.tipo === "cella" && a.valore === m.cella)?.persona)
    || assegn.find((a) => a.tipo === "fornitore" && (a.valore === m.fornitore || m.ordini.some((o) => o.fornitore === a.valore)))?.persona || null;
  const coloreDi = (m: Mancante) => (statoDi(m) === "magazzino" ? colori.giacenti : (() => { const p = personaDi(m); return p ? colori[p] : undefined; })());
  const nomeDi = (id: string | null) => persone.find((p) => p.id === id)?.nome || "";
  const aperti = righe.filter((m) => m.aperto);
  const visibileComm = (c: string) => nascoste || (nelPiano(c) && !comm[c]?.nascosta);
  const filtrati = aperti.filter((m) => visibileComm(m.commessa) && trova(m, q) && (!filtroStato || statoDi(m) === filtroStato) && (!soloRitardi || ritardo(m, montaggioDi(m))));

  // ---------- salvataggi ----------
  async function salvaRiga(m: Mancante, campi: Partial<Pick<Mancante, "nota" | "responsabile" | "prevista" | "priorita">>) {
    const ora = "nota" in campi ? { nota_il: campi.nota ? new Date().toISOString() : null } : {};
    setRighe((L) => L.map((x) => (x.id === m.id ? { ...x, ...campi, ...ora } : x)));
    const { error } = await sb.from("mancanti").update(campi).eq("id", m.id);
    if (error) { setMsg("Non salvato: " + error.message); carica(); }
  }
  async function salvaComm(c: string, campi: Partial<Commessa>) {
    const v = { ...(comm[c] || { commessa: c, cliente: "", montaggio: null, note: "", nascosta: false }), ...campi };
    setComm((x) => ({ ...x, [c]: v }));
    const { error } = await sb.from("mancanti_commesse").upsert(v);
    if (error) setMsg("Non salvato: " + error.message);
  }
  async function assegna(tipo: Assegnazione["tipo"], valore: string, persona: string) {
    setAssegn((L) => [...L.filter((a) => !(a.tipo === tipo && a.valore === valore)), ...(persona ? [{ tipo, valore, persona }] : [])]);
    const { error } = persona
      ? await sb.from("mancanti_assegnazioni").upsert({ tipo, valore, persona })
      : await sb.from("mancanti_assegnazioni").delete().eq("tipo", tipo).eq("valore", valore);
    if (error) setMsg("Non salvato: " + error.message);
  }
  async function colora(chiave: string, colore: string) {
    setColori((c) => ({ ...c, [chiave]: colore }));
    const { error } = chiave === "giacenti"
      ? await sb.from("mancanti_colori").upsert({ chiave, colore })
      : await sb.from("mancanti_persone").update({ colore }).eq("id", chiave);
    if (error) setMsg("Non salvato: " + error.message);
  }
  async function nuovaPersona(nome: string) {
    const n = nome.trim(); if (!n) return;
    const { data, error } = await sb.from("mancanti_persone").insert({ nome: n, ordine: persone.length + 1, colore: "#fde68a" }).select().single();
    if (error) { setMsg(/duplicate/.test(error.message) ? `«${n}» c'è già.` : "Non salvato: " + error.message); return; }
    setPersone((L) => [...L, data as (typeof persone)[number]]); setColori((c) => ({ ...c, [data.id]: data.colore }));
  }
  async function togliPersona(id: string) {
    const p = persone.find((x) => x.id === id); if (!p) return;
    const usata = assegn.filter((a) => a.persona === id).length + righe.filter((m) => m.responsabile === id).length;
    if (!confirm(`Tolgo «${p.nome}» dall'elenco?${usata ? ` Le sue ${usata} assegnazioni restano senza persona.` : ""}`)) return;
    const { error } = await sb.from("mancanti_persone").delete().eq("id", id);
    if (error) { setMsg("Non tolta: " + error.message); return; }
    setPersone((L) => L.filter((x) => x.id !== id)); setAssegn((L) => L.filter((a) => a.persona !== id));
    setRighe((L) => L.map((m) => (m.responsabile === id ? { ...m, responsabile: null } : m)));
  }
  async function caricaFile(f: File | undefined) {
    if (!f) return;
    setLavoro(true); setMsg("Leggo il file…");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await f.arrayBuffer());
      let L: ReturnType<typeof daTabella> = [];
      for (const ws of wb.worksheets) {
        const vals: unknown[][] = [];
        ws.eachRow({ includeEmpty: false }, (r) => { vals.push((r.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v && typeof v === "object" && "richText" in (v as object) ? (v as { richText: { text: string }[] }).richText.map((x) => x.text).join("") : v))); });
        const h = vals.findIndex((r) => r.some((c) => String(c ?? "").trim().toUpperCase() === "CODICE ARTICOLO") && r.some((c) => String(c ?? "").trim().toUpperCase() === "COMMESSA") || r.some((c) => String(c ?? "").trim() === "Componente") && r.some((c) => String(c ?? "").trim() === "NUM_OV"));
        if (h >= 0) { L = daTabella(vals[h].map((c) => String(c ?? "")), vals.slice(h + 1)); if (L.length) break; }
      }
      if (!L.length) { setMsg("Nel file non trovo l'elenco dei mancanti: servono le colonne COMMESSA e CODICE ARTICOLO (estrazione SAM) oppure NUM_OV e Componente (vista di SAM)."); return; }
      const { data, error } = await sb.rpc("importa_mancanti", { p_righe: L, p_origine: "", p_file: f.name });
      if (error) { setMsg("Non caricato: " + error.message); return; }
      const r = data as { righe: number; nuovi: number; chiusi: number; commesse: string[] };
      setMsg(`Caricato: ${r.righe} mancanti di ${r.commesse.length} ${r.commesse.length === 1 ? "commessa" : "commesse"}; ${r.nuovi} nuovi, ${r.chiusi} prelevati da quest'ultimo aggiornamento.`);
      await carica();
    } catch (e) { setMsg("Non riesco a leggere il file: " + (e instanceof Error ? e.message : "errore")); }
    finally { setLavoro(false); }
  }
  async function esporta(L: Mancante[], nome: string) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Mancanti");
    ws.columns = [["Commessa", 12], ["Cliente", 20], ["Inizio montaggio", 12], ["Matricola", 15], ["Macchina", 30], ["OP", 16], ["Gruppo (OP)", 30], ["Codice", 16], ["Descrizione", 36], ["Q.tà", 7], ["Giacenza", 9],
      ["Stato", 20], ["Fornitore", 24], ["Ordini", 26], ["Consegna ordine", 12], ["Cella lavorazione", 20], ["C/deposito", 18], ["Data prevista", 12], ["Chi lo segue", 18], ["Note", 36], ["Nota aggiornata il", 14]]
      .map(([header, width]) => ({ header: String(header), width: Number(width) }));
    ws.getRow(1).font = { bold: true };
    const nomeP = Object.fromEntries(persone.map((p) => [p.id, p.nome]));
    for (const m of L) {
      const rit = ritardo(m, montaggioDi(m)), mo = montaggioDi(m);
      const row = ws.addRow([m.commessa, clienteDi(m.commessa), mo ? new Date(mo + "T12:00:00") : "", m.matricola, m.macchina, m.op, m.op_descr, m.codice, m.descr, m.qta, m.giac_mp,
        nomeStato(statoDi(m)), m.fornitore, m.ordini.map((o) => o.num).join(", "), m.consegna ? new Date(m.consegna + "T12:00:00") : "", m.cella, m.cdep,
        m.prevista ? new Date(m.prevista + "T12:00:00") : "", nomeP[personaDi(m) || ""] || "", m.nota, m.nota_il ? new Date(m.nota_il) : ""]);
      const col = coloreDi(m);
      if (col) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + col.slice(1).toUpperCase() } };
      if (col && scuro(col)) row.font = { color: { argb: "FFFFFFFF" } };
      if (rit) row.font = { ...(row.font || {}), bold: true, color: col && scuro(col) ? { argb: "FFFFFFFF" } : { argb: "FFB42318" } };
    }
    ["C", "O", "R", "U"].forEach((k) => (ws.getColumn(k).numFmt = "dd/mm/yyyy"));
    ws.autoFilter = { from: "A1", to: "U1" }; ws.views = [{ state: "frozen", ySplit: 1 }];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `${nome} ${oggi()}.xlsx`.replace(/[\\/:*?"<>|]+/g, " "); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  // ---------- pezzi di interfaccia ----------
  const conteggi = (L: Mancante[]) => Object.fromEntries(STATI.map(([k]) => [k, L.filter((m) => statoDi(m) === k).length])) as Record<Stato, number>;
  const barra = (L: Mancante[]) => {
    const c = conteggi(L), n = L.length || 1;
    return <div className="barra" aria-hidden>{STATI.map(([k]) => c[k] ? <span key={k} className={"b-" + k} style={{ width: `${(c[k] / n) * 100}%` }} title={`${nomeStato(k)}: ${c[k]}`} /> : null)}</div>;
  };
  const tabella = (L: Mancante[], o: { commessa?: boolean; macchina?: boolean } = {}) => (
    <div className="mx"><table className="tm">
      <thead><tr>{o.commessa && <th>Commessa</th>}{o.macchina !== false && <th>Macchina / gruppo</th>}<th>Codice</th><th className="n">Q.tà</th><th className="n hide-s">Giac.</th><th>Stato</th><th>Fornitore / ordine</th><th>Attesa</th><th>Segue</th><th>Prevista</th><th>Nota</th></tr></thead>
      <tbody>{L.map((m) => {
        const st = statoDi(m), rit = ritardo(m, montaggioDi(m)), ed = modifica || gestisce;
        return (
          <tr key={m.id} className={(rit ? "rit " : "") + (coloreDi(m) && scuro(coloreDi(m)!) ? " scura" : "")} style={coloreDi(m) ? { background: coloreDi(m) } : undefined}>
            {o.commessa && <td><b>{m.commessa}</b><small>{clienteDi(m.commessa)}</small></td>}
            {o.macchina !== false && <td><span className="mono">{m.op}</span><small>{m.op_descr || m.macchina}</small></td>}
            <td><span className="mono">{m.codice}</span><small>{m.descr}</small></td>
            <td className="n mono">{q2(m.qta)}</td>
            <td className="n mono hide-s">{q2(m.giac_mp)}</td>
            <td><span className={"st s-" + st}>{nomeStato(st)}</span>{m.cella && <small>{m.cella}</small>}{m.cdep && <small>{m.cdep}</small>}</td>
            <td>{m.fornitore}{m.ordini.length > 0 && <small>{m.ordini.map((x) => `OA ${x.num}${x.consegna ? " · " + fd(x.consegna) : ""}${x.fornitore && x.fornitore !== m.fornitore ? " · " + x.fornitore : ""}`).join("; ")}</small>}</td>
            <td className="mono">{fd(attesa(m))}{rit && <small className="r">{rit === "scaduta" ? "data passata" : "dopo il montaggio"}</small>}</td>
            <td className="chi">{(() => { const p = personaDi(m), c = p ? colori[p] : undefined; return ed
              ? <select value={m.responsabile || ""} aria-label="Chi lo segue" title={p ? nomeDi(p) + (m.responsabile ? "" : " (dall'assegnazione)") : "Chi lo segue"} onChange={(e) => salvaRiga(m, { responsabile: e.target.value || null })} style={c ? { background: c, borderColor: "rgba(0,0,0,.35)" } : undefined}>
                  <option value="">{p && !m.responsabile ? "↳ " + nomeDi(p) : "—"}</option>{persone.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
              : <i className="pal" style={{ background: c || "transparent" }} title={nomeDi(p)} />; })()}</td>
            <td>{ed ? <input type="date" value={m.prevista || ""} title="Data prevista (se diversa dalla consegna dell'ordine)" aria-label="Data prevista" onChange={(e) => salvaRiga(m, { prevista: e.target.value || null })} /> : <span className="mono">{fd(m.prevista)}</span>}</td>
            <td className="nt">{ed ? <input defaultValue={m.nota} placeholder="nota" aria-label="Nota" onBlur={(e) => e.target.value !== m.nota && salvaRiga(m, { nota: e.target.value })} /> : m.nota}
              {m.nota && m.nota_il && <small title={"Nota aggiornata il " + quando(m.nota_il)}>agg. {fd(m.nota_il.slice(0, 10))}</small>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );

  // ---------- viste ----------
  const commesse = [...new Set(aperti.map((m) => m.commessa))].filter(visibileComm)
    .sort((a, b) => (comm[a]?.montaggio || "9999").localeCompare(comm[b]?.montaggio || "9999") || ordComm(b).localeCompare(ordComm(a)));
  const raggruppa = (L: Mancante[], k: (m: Mancante) => string) => { const g = new Map<string, Mancante[]>(); L.forEach((m) => g.set(k(m), [...(g.get(k(m)) || []), m])); return [...g.entries()]; };

  let corpo: React.ReactNode;
  if (vista === "commesse") {
    corpo = (
      <div className="carte">
        {commesse.map((c) => {
          const L = filtrati.filter((m) => m.commessa === c), tutti = aperti.filter((m) => m.commessa === c), C = comm[c];
          if (!L.length && (q || filtroStato || soloRitardi)) return null;
          const rit = tutti.filter((m) => ritardo(m, montaggioDi(m))).length, prel = righe.filter((m) => !m.aperto && m.commessa === c).length;
          const macchine = [...new Set(tutti.map((m) => m.macchina || m.matricola))];
          const ap = aperta === c;
          return (
            <section key={c} className={"box carta" + (ap ? " aperta" : "") + (C?.nascosta ? " nasc" : "")}>
              <div className="testa" onClick={() => setAperta(ap ? "" : c)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setAperta(ap ? "" : c); }} aria-expanded={ap}>
                <div><h2>{c}{clienteDi(c) && <span> · {clienteDi(c)}</span>}</h2>
                  <p className="nota">{macchine.slice(0, 3).join(" · ")}{macchine.length > 3 ? ` e altre ${macchine.length - 3}` : ""}</p></div>
                <div className="num"><b>{tutti.length}</b> mancanti{rit > 0 && <span className="r"> · {rit} in ritardo</span>}{prel > 0 && <span className="nota"> · {prel} prelevati in 14 gg</span>}
                  <span className="nota">{montaggioComm(c) ? "montaggio " + fd(montaggioComm(c)) : "montaggio non pianificato"}{!nelPiano(c) && " · non nel Piano produzione"}</span></div>
              </div>
              {barra(tutti)}
              {ap && <div className="dett">
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  {piano[norm(c)]?.cliente ? <label className="f">Cliente<input value={piano[norm(c)].cliente} disabled title="dal Piano produzione" /></label>
                    : <label className="f">Cliente<input defaultValue={C?.cliente || ""} disabled={!modifica} onBlur={(e) => e.target.value !== (C?.cliente || "") && salvaComm(c, { cliente: e.target.value })} /></label>}
                  {(piano[norm(c)]?.macchine || []).some((x) => x.s && !x.done)
                    ? <label className="f">Inizio montaggio<input value={fd(montaggioComm(c))} disabled title="fase 3B del Piano produzione" /><small className="nota">dal Piano produzione</small></label>
                    : <label className="f">Inizio montaggio<input type="date" value={C?.montaggio || ""} disabled={!modifica} onChange={(e) => salvaComm(c, { montaggio: e.target.value || null })} /><small className="nota">non pianificato nel Piano produzione</small></label>}
                  <label className="f w">Note sulla commessa<input defaultValue={C?.note || ""} disabled={!modifica} onBlur={(e) => e.target.value !== (C?.note || "") && salvaComm(c, { note: e.target.value })} /></label>
                  <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
                    <button className="btn sec" onClick={() => esporta(L, "Mancanti " + c)}>Excel</button>
                    {modifica && <button className="btn sec" onClick={() => salvaComm(c, { nascosta: !C?.nascosta })}>{C?.nascosta ? "Rimetti nel quadro" : "Togli dal quadro"}</button>}
                  </div>
                </div>
                {raggruppa(L, (m) => `${m.matricola}  ${m.macchina}`).map(([k, G]) => {
                  const mo = montaggioDi(G[0]), x = macchinaDi(G[0]);
                  return <div key={k} className="gruppo"><h3>{k} <small className="nota">{G.length} · {mo ? `montaggio ${fd(mo)}${x?.chi ? " (" + x.chi + ")" : ""}` : "montaggio non pianificato"}</small></h3>{tabella(G)}</div>;
                })}
              </div>}
            </section>
          );
        })}
        {!commesse.length && <p className="nota">Nessuna commessa con mancanti aperti.</p>}
      </div>
    );
  } else if (vista === "fornitori" || vista === "reparti") {
    const chiave = vista === "fornitori" ? (m: Mancante) => m.fornitore || (statoDi(m) === "scoperto" ? "— senza fornitore né ordine —" : "") : (m: Mancante) => m.cella || m.cdep || (statoDi(m) === "magazzino" ? "Da prelevare a magazzino" : "");
    const G = raggruppa(filtrati.filter((m) => chiave(m)), chiave).sort((a, b) => b[1].length - a[1].length);
    corpo = (
      <div className="carte">
        {G.map(([k, L]) => {
          const ap = aperta === k, rit = L.filter((m) => ritardo(m, montaggioDi(m))).length, cc = [...new Set(L.map((m) => m.commessa))];
          return (
            <section key={k} className={"box carta" + (ap ? " aperta" : "")}>
              <div className="testa" onClick={() => setAperta(ap ? "" : k)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setAperta(ap ? "" : k); }} aria-expanded={ap}>
                <div><h2>{k}</h2><p className="nota">{cc.length} {cc.length === 1 ? "commessa" : "commesse"}: {cc.slice(0, 6).join(", ")}{cc.length > 6 ? "…" : ""}</p></div>
                <div className="num"><b>{L.length}</b> mancanti{rit > 0 && <span className="r"> · {rit} in ritardo</span>}</div>
              </div>
              {ap && <div className="dett"><div><button className="btn sec" onClick={() => esporta(L, "Mancanti " + k)}>Excel</button></div>{tabella(L.sort((a, b) => (attesa(a) || "9999").localeCompare(attesa(b) || "9999")), { commessa: true })}</div>}
            </section>
          );
        })}
        {!G.length && <p className="nota">{vista === "reparti" ? "Nessun mancante in lavorazione interna o in conto deposito con questi filtri. (Le celle di lavorazione arrivano solo con l'estrazione Excel dei mancanti, non dalla vista automatica di SAM.)" : "Nessun mancante con questi filtri."}</p>}
      </div>
    );
  } else if (vista === "assegnazioni") {
    const conta = (k: (m: Mancante) => string[]) => { const c = new Map<string, number>(); aperti.filter((m) => visibileComm(m.commessa)).forEach((m) => k(m).filter(Boolean).forEach((v) => c.set(v, (c.get(v) || 0) + 1))); return [...c.entries()].sort((a, b) => b[1] - a[1]); };
    const forn = conta((m) => [...new Set([m.fornitore, ...m.ordini.map((o) => o.fornitore)])]).filter(([v]) => !q || v.toLowerCase().includes(q.toLowerCase()));
    const celle = conta((m) => [m.cella]).filter(([v]) => !q || v.toLowerCase().includes(q.toLowerCase()));
    const conColore = persone;
    const sel = (tipo: Assegnazione["tipo"], v: string) => {
      const a = assegn.find((x) => x.tipo === tipo && x.valore === v)?.persona || "";
      return <select value={a} disabled={!modifica} onChange={(e) => assegna(tipo, v, e.target.value)} style={a && colori[a] ? { background: colori[a], color: scuro(colori[a]) ? "#fff" : undefined } : undefined}>
        <option value="">— nessuno —</option>{persone.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>;
    };
    corpo = (
      <div className="carte">
        <section className="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Colori</h2>
          <p className="nota">Sono le persone (o i gruppi, come «Magazzino») che si possono scegliere come «chi lo segue». Ogni codice prende il colore della persona che lo segue: quella scelta sulla riga, altrimenti quella assegnata alla cella di lavorazione, altrimenti quella del fornitore. I codici giacenti a magazzino hanno sempre il loro colore.</p>
          <div className="colori">
            <label><input type="color" value={colori.giacenti || "#d6f2d3"} disabled={!modifica} onChange={(e) => colora("giacenti", e.target.value)} /> Giacenti disponibili</label>
            {conColore.map((p) => <label key={p.id}><input type="color" value={colori[p.id] || "#ffffff"} disabled={!modifica} onChange={(e) => colora(p.id, e.target.value)} /> {p.nome}{modifica && <button type="button" className="x" title={"Togli " + p.nome} onClick={(e) => { e.preventDefault(); togliPersona(p.id); }}>✕</button>}</label>)}
            {modifica && <input placeholder="+ aggiungi persona o gruppo (Invio)" style={{ width: 230 }} onKeyDown={(e) => { if (e.key === "Enter") { nuovaPersona((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = ""; } }} />}
          </div>
        </section>
        <section className="box" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: 0 }}>Fornitori <small className="nota">{forn.length}</small></h2>
          <div className="mx"><table className="tm"><thead><tr><th>Fornitore</th><th className="n">Mancanti</th><th>Chi lo segue</th></tr></thead>
            <tbody>{forn.map(([v, n]) => <tr key={v}><td>{v}</td><td className="n mono">{n}</td><td>{sel("fornitore", v)}</td></tr>)}</tbody></table></div>
        </section>
        <section className="box" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: 0 }}>Celle di lavorazione <small className="nota">{celle.length}</small></h2>
          {!celle.length ? <p className="nota">Le celle arriveranno da SAM appena aggiungiamo la vista con cella di lavorazione e conto deposito.</p>
            : <div className="mx"><table className="tm"><thead><tr><th>Cella</th><th className="n">Mancanti</th><th>Chi la segue</th></tr></thead>
              <tbody>{celle.map(([v, n]) => <tr key={v}><td>{v}</td><td className="n mono">{n}</td><td>{sel("cella", v)}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    );
  } else {
    const L = righe.filter((m) => !m.aperto && trova(m, q) && visibileComm(m.commessa)).sort((a, b) => (b.chiuso_il || "").localeCompare(a.chiuso_il || ""));
    corpo = (
      <div className="box">
        <p className="nota" style={{ marginBottom: 8 }}>Codici spariti dall&apos;estrazione di SAM negli ultimi 14 giorni: risultano prelevati.</p>
        {!L.length ? <p className="nota">Nessuno.</p> : <div className="mx"><table className="tm"><thead><tr><th>Prelevato</th><th>Commessa</th><th>Macchina / gruppo</th><th>Codice</th><th className="n">Q.tà</th><th>Note</th></tr></thead>
          <tbody>{L.slice(0, 500).map((m) => <tr key={m.id}><td className="mono">{quando(m.chiuso_il)}</td><td><b>{m.commessa}</b></td><td><span className="mono">{m.op}</span><small>{m.op_descr || m.macchina}</small></td><td><span className="mono">{m.codice}</span><small>{m.descr}</small></td><td className="n mono">{q2(m.qta)}</td><td>{m.nota}</td></tr>)}</tbody></table></div>}
      </div>
    );
  }

  return (
    <div className="mc" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <header className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div><h1>Mancanti montaggi</h1>
          <p className="sub">{ult ? <>Aggiornato {quando(ult.il)} · {ult.origine || "—"} · {ult.righe} righe, {ult.nuovi} nuove, {ult.chiusi} prelevate</> : "Nessun aggiornamento ancora: carica l'estrazione di SAM o attiva l'invio automatico."}</p></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sec" onClick={() => esporta(filtrati, "Mancanti")} disabled={!filtrati.length}>Excel</button>
          {modifica && <label className="btn" aria-disabled={lavoro}>{lavoro ? "Carico…" : "Carica file SAM"}<input type="file" accept=".xlsx" hidden disabled={lavoro} onChange={(e) => { caricaFile(e.target.files?.[0]); e.target.value = ""; }} /></label>}
        </div>
      </header>
      {msg && <div className="msg" role="status">{msg}</div>}
      <div className="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="stati" role="tablist" aria-label="Vista">
          {([["commesse", "Per commessa"], ["fornitori", "Per fornitore"], ["reparti", "Per reparto"], ["prelevati", "Prelevati"], ["assegnazioni", "Assegnazioni e colori"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={vista === k} aria-pressed={vista === k} onClick={() => { setVista(k); setAperta(""); }}>{l}</button>)}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input type="search" placeholder="Cerca codice, descrizione, fornitore, OA, nota…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 260px" }} aria-label="Cerca" />
          <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)} aria-label="Stato"><option value="">Tutti gli stati</option>{STATI.map(([k, l]) => <option key={k} value={k}>{l} ({aperti.filter((m) => visibileComm(m.commessa) && statoDi(m) === k).length})</option>)}</select>
          <label className="ck"><input type="checkbox" checked={soloRitardi} onChange={(e) => setSoloRitardi(e.target.checked)} /> Solo in ritardo</label>
          <label className="ck"><input type="checkbox" checked={nascoste} onChange={(e) => setNascoste(e.target.checked)} /> Anche commesse fuori dal Piano produzione o tolte dal quadro</label>
        </div>
        <div className="leg">{STATI.map(([k, l, d]) => <span key={k} title={d}><i className={"b-" + k} />{l}</span>)}<span><i className="b-rit" />in ritardo: data passata o dopo l&apos;inizio montaggio</span></div>
        {Object.keys(colori).length > 0 && <div className="leg">{colori.giacenti && <span><i style={{ background: colori.giacenti }} />giacenti disponibili</span>}{persone.filter((p) => colori[p.id]).map((p) => <span key={p.id}><i style={{ background: colori[p.id] }} />{p.nome}</span>)}</div>}
      </div>
      {carico ? <p className="nota">Carico i mancanti…</p> : corpo}
    </div>
  );
}
