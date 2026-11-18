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
  nota: string; responsabile: string | null; prevista: string | null; priorita: "" | "alta" | "bassa";
};
type Commessa = { commessa: string; cliente: string; montaggio: string | null; note: string; nascosta: boolean };
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
// «247/2026» → «2026/000247»: prima l'anno, poi il numero
const ordComm = (c: string) => { const [n, a] = c.split("/"); return `${a || ""}/${(n || "").padStart(6, "0")}`; };
const pezzi = (v: string) => v.split(/\s+/).filter(Boolean);
const trova = (m: Mancante, q: string) => !q || pezzi(q.toLowerCase()).every((p) => [m.codice, m.descr, m.macchina, m.matricola, m.op, m.op_descr, m.fornitore, m.cella, m.cdep, m.nota, m.commessa, ...m.ordini.map((o) => o.num + " " + o.fornitore)].join(" ").toLowerCase().includes(p));

export default function Mancanti({ me, gestisce, modifica }: Props) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [righe, setRighe] = useState<Mancante[]>([]);
  const [comm, setComm] = useState<Record<string, Commessa>>({});
  const [ult, setUlt] = useState<Import | null>(null);
  const [persone, setPersone] = useState<{ id: string; nome: string }[]>([]);
  const [carico, setCarico] = useState(true);
  const [vista, setVista] = useState<"commesse" | "fornitori" | "reparti" | "prelevati">("commesse");
  const [aperta, setAperta] = useState<string>("");          // commessa / fornitore / reparto aperto
  const [q, setQ] = useState("");
  const [filtroStato, setFiltroStato] = useState<string>("");
  const [soloRitardi, setSoloRitardi] = useState(false);
  const [nascoste, setNascoste] = useState(false);
  const [msg, setMsg] = useState("");
  const [lavoro, setLavoro] = useState(false);

  async function carica() {
    const tutte: Mancante[] = [];
    const da14 = new Date(Date.now() - 14 * 864e5).toISOString();
    for (let da = 0; ; da += 1000) {
      const { data, error } = await sb.from("mancanti").select("*").or(`aperto.eq.true,chiuso_il.gte.${da14}`).order("id").range(da, da + 999);
      if (error) { setMsg(/does not exist|schema cache/.test(error.message) ? "Manca la migrazione 0048 (mancanti montaggi): lanciala nell'SQL Editor di Supabase." : "Non riesco a leggere i mancanti: " + error.message); break; }
      tutte.push(...((data ?? []) as Mancante[]).map((x) => ({ ...x, qta: x.qta == null ? null : Number(x.qta), giac_mp: x.giac_mp == null ? null : Number(x.giac_mp), giac_mg: x.giac_mg == null ? null : Number(x.giac_mg), giac_grezzi: x.giac_grezzi == null ? null : Number(x.giac_grezzi) })));
      if (!data || data.length < 1000) break;
    }
    const [{ data: C }, { data: I }] = await Promise.all([
      sb.from("mancanti_commesse").select("*"),
      sb.from("mancanti_import").select("*").order("il", { ascending: false }).limit(1),
    ]);
    setRighe(tutte);
    setComm(Object.fromEntries(((C ?? []) as Commessa[]).map((c) => [c.commessa, c])));
    setUlt(((I ?? []) as Import[])[0] ?? null);
    setCarico(false);
  }
  useEffect(() => {
    carica();
    sb.from("profili").select("id,nome,attivo").then(({ data }) => setPersone(((data ?? []) as { id: string; nome: string; attivo: boolean }[]).filter((p) => p.attivo && p.nome && p.nome !== "Utente generico").map((p) => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome))));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aperti = righe.filter((m) => m.aperto);
  const visibileComm = (c: string) => nascoste || !comm[c]?.nascosta;
  const filtrati = aperti.filter((m) => visibileComm(m.commessa) && trova(m, q) && (!filtroStato || statoDi(m) === filtroStato) && (!soloRitardi || ritardo(m, comm[m.commessa]?.montaggio)));

  // ---------- salvataggi ----------
  async function salvaRiga(m: Mancante, campi: Partial<Pick<Mancante, "nota" | "responsabile" | "prevista" | "priorita">>) {
    setRighe((L) => L.map((x) => (x.id === m.id ? { ...x, ...campi } : x)));
    const { error } = await sb.from("mancanti").update(campi).eq("id", m.id);
    if (error) { setMsg("Non salvato: " + error.message); carica(); }
  }
  async function salvaComm(c: string, campi: Partial<Commessa>) {
    const v = { ...(comm[c] || { commessa: c, cliente: "", montaggio: null, note: "", nascosta: false }), ...campi };
    setComm((x) => ({ ...x, [c]: v }));
    const { error } = await sb.from("mancanti_commesse").upsert(v);
    if (error) setMsg("Non salvato: " + error.message);
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
      ["Stato", 20], ["Fornitore", 24], ["Ordini", 26], ["Consegna ordine", 12], ["Cella lavorazione", 20], ["C/deposito", 18], ["Data prevista", 12], ["Responsabile", 18], ["Priorità", 8], ["Note", 36]]
      .map(([header, width]) => ({ header: String(header), width: Number(width) }));
    ws.getRow(1).font = { bold: true };
    const nomeP = Object.fromEntries(persone.map((p) => [p.id, p.nome]));
    for (const m of L) {
      const c = comm[m.commessa], rit = ritardo(m, c?.montaggio);
      const row = ws.addRow([m.commessa, c?.cliente || "", c?.montaggio ? new Date(c.montaggio + "T12:00:00") : "", m.matricola, m.macchina, m.op, m.op_descr, m.codice, m.descr, m.qta, m.giac_mp,
        nomeStato(statoDi(m)), m.fornitore, m.ordini.map((o) => o.num).join(", "), m.consegna ? new Date(m.consegna + "T12:00:00") : "", m.cella, m.cdep,
        m.prevista ? new Date(m.prevista + "T12:00:00") : "", m.responsabile ? nomeP[m.responsabile] || "" : "", m.priorita, m.nota]);
      if (rit) row.font = { color: { argb: "FFB42318" } };
    }
    ["C", "O", "R"].forEach((k) => (ws.getColumn(k).numFmt = "dd/mm/yyyy"));
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
      <thead><tr>{o.commessa && <th>Commessa</th>}{o.macchina !== false && <th>Macchina / gruppo</th>}<th>Codice</th><th className="n">Q.tà</th><th className="n hide-s">Giac.</th><th>Stato</th><th>Fornitore / ordine</th><th>Attesa</th>{modifica || gestisce ? <th>Gestione</th> : <th>Note</th>}</tr></thead>
      <tbody>{L.map((m) => {
        const st = statoDi(m), rit = ritardo(m, comm[m.commessa]?.montaggio), ed = modifica || gestisce;
        return (
          <tr key={m.id} className={(rit ? "rit " : "") + (m.priorita === "alta" ? "alta" : "")}>
            {o.commessa && <td><b>{m.commessa}</b><small>{comm[m.commessa]?.cliente}</small></td>}
            {o.macchina !== false && <td><span className="mono">{m.op}</span><small>{m.op_descr || m.macchina}</small></td>}
            <td><span className="mono">{m.codice}</span><small>{m.descr}</small></td>
            <td className="n mono">{q2(m.qta)}</td>
            <td className="n mono hide-s">{q2(m.giac_mp)}</td>
            <td><span className={"st s-" + st}>{nomeStato(st)}</span>{m.cella && <small>{m.cella}</small>}{m.cdep && <small>{m.cdep}</small>}</td>
            <td>{m.fornitore}{m.ordini.length > 0 && <small>{m.ordini.map((x) => `OA ${x.num}${x.consegna ? " · " + fd(x.consegna) : ""}${x.fornitore && x.fornitore !== m.fornitore ? " · " + x.fornitore : ""}`).join("; ")}</small>}</td>
            <td className="mono">{fd(attesa(m))}{rit && <small className="r">{rit === "scaduta" ? "data passata" : "dopo il montaggio"}</small>}</td>
            <td className="gest">{ed ? <>
              <input type="date" value={m.prevista || ""} title="Data prevista (se diversa dalla consegna dell'ordine)" aria-label="Data prevista" onChange={(e) => salvaRiga(m, { prevista: e.target.value || null })} />
              <select value={m.responsabile || ""} aria-label="Chi lo segue" onChange={(e) => salvaRiga(m, { responsabile: e.target.value || null })}><option value="">chi lo segue…</option>{persone.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.id === me ? " (tu)" : ""}</option>)}</select>
              <select value={m.priorita} aria-label="Priorità" onChange={(e) => salvaRiga(m, { priorita: e.target.value as Mancante["priorita"] })}><option value="">priorità</option><option value="alta">alta</option><option value="bassa">bassa</option></select>
              <input defaultValue={m.nota} placeholder="nota" aria-label="Nota" onBlur={(e) => e.target.value !== m.nota && salvaRiga(m, { nota: e.target.value })} />
            </> : <>{m.nota}{m.prevista && <small>prevista {fd(m.prevista)}</small>}</>}</td>
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
          const rit = tutti.filter((m) => ritardo(m, C?.montaggio)).length, prel = righe.filter((m) => !m.aperto && m.commessa === c).length;
          const macchine = [...new Set(tutti.map((m) => m.macchina || m.matricola))];
          const ap = aperta === c;
          return (
            <section key={c} className={"box carta" + (ap ? " aperta" : "") + (C?.nascosta ? " nasc" : "")}>
              <div className="testa" onClick={() => setAperta(ap ? "" : c)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setAperta(ap ? "" : c); }} aria-expanded={ap}>
                <div><h2>{c}{C?.cliente && <span> · {C.cliente}</span>}</h2>
                  <p className="nota">{macchine.slice(0, 3).join(" · ")}{macchine.length > 3 ? ` e altre ${macchine.length - 3}` : ""}</p></div>
                <div className="num"><b>{tutti.length}</b> mancanti{rit > 0 && <span className="r"> · {rit} in ritardo</span>}{prel > 0 && <span className="nota"> · {prel} prelevati in 14 gg</span>}
                  <span className="nota">{C?.montaggio ? "montaggio " + fd(C.montaggio) : "montaggio da indicare"}</span></div>
              </div>
              {barra(tutti)}
              {ap && <div className="dett">
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <label className="f">Cliente<input defaultValue={C?.cliente || ""} disabled={!modifica} onBlur={(e) => e.target.value !== (C?.cliente || "") && salvaComm(c, { cliente: e.target.value })} /></label>
                  <label className="f">Inizio montaggio<input type="date" value={C?.montaggio || ""} disabled={!modifica} onChange={(e) => salvaComm(c, { montaggio: e.target.value || null })} /></label>
                  <label className="f w">Note sulla commessa<input defaultValue={C?.note || ""} disabled={!modifica} onBlur={(e) => e.target.value !== (C?.note || "") && salvaComm(c, { note: e.target.value })} /></label>
                  <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
                    <button className="btn sec" onClick={() => esporta(L, "Mancanti " + c)}>Excel</button>
                    {modifica && <button className="btn sec" onClick={() => salvaComm(c, { nascosta: !C?.nascosta })}>{C?.nascosta ? "Rimetti nel quadro" : "Togli dal quadro"}</button>}
                  </div>
                </div>
                {raggruppa(L, (m) => `${m.matricola}  ${m.macchina}`).map(([k, G]) => (
                  <div key={k} className="gruppo"><h3>{k} <small className="nota">{G.length}</small></h3>{tabella(G)}</div>
                ))}
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
          const ap = aperta === k, rit = L.filter((m) => ritardo(m, comm[m.commessa]?.montaggio)).length, cc = [...new Set(L.map((m) => m.commessa))];
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
          {([["commesse", "Per commessa"], ["fornitori", "Per fornitore"], ["reparti", "Per reparto"], ["prelevati", "Prelevati"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={vista === k} aria-pressed={vista === k} onClick={() => { setVista(k); setAperta(""); }}>{l}</button>)}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input type="search" placeholder="Cerca codice, descrizione, fornitore, OA, nota…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 260px" }} aria-label="Cerca" />
          <select value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)} aria-label="Stato"><option value="">Tutti gli stati</option>{STATI.map(([k, l]) => <option key={k} value={k}>{l} ({aperti.filter((m) => visibileComm(m.commessa) && statoDi(m) === k).length})</option>)}</select>
          <label className="ck"><input type="checkbox" checked={soloRitardi} onChange={(e) => setSoloRitardi(e.target.checked)} /> Solo in ritardo</label>
          <label className="ck"><input type="checkbox" checked={nascoste} onChange={(e) => setNascoste(e.target.checked)} /> Anche commesse tolte dal quadro</label>
        </div>
        <div className="leg">{STATI.map(([k, l, d]) => <span key={k} title={d}><i className={"b-" + k} />{l}</span>)}<span><i className="b-rit" />in ritardo: data passata o dopo l&apos;inizio montaggio</span></div>
      </div>
      {carico ? <p className="nota">Carico i mancanti…</p> : corpo}
    </div>
  );
}
