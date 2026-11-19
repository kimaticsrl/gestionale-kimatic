"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { daTabella, type Ordine, type OpSam } from "./sam";
import "./mancanti.css";

type Props = { me: string; gestisce: boolean; modifica: boolean };
export type Mancante = {
  id: number; commessa: string; matricola: string; macchina: string; op: string; op_descr: string; op_num: string;
  codice: string; descr: string; qta: number | null; giac_mp: number | null; giac_mg: number | null; giac_grezzi: number | null;
  fornitore: string; cella: string; cdep: string; ultima_lav: string; ordini: Ordine[]; consegna: string | null;
  aperto: boolean; primo_il: string; visto_il: string; chiuso_il: string | null;
  nota: string; nota_il: string | null; responsabile: string | null; prevista: string | null; priorita: "" | "alta" | "bassa";
  ids?: number[]; // righe accorpate (stesso codice nella stessa commessa)
};
type Commessa = { commessa: string; cliente: string; montaggio: string | null; note: string; nascosta: boolean };
type MacchinaPiano = { code: string; desc: string; s: string | null; e: string | null; done: boolean; chi: string | null };
type CommessaPiano = { commessa: string; cliente: string; chiusa: boolean; macchine: MacchinaPiano[] };
type Assegnazione = { tipo: "fornitore" | "cella" | "cdep"; valore: string; persona: string };
type Import = { il: string; origine: string; file: string; commesse: string[]; righe: number; nuovi: number; chiusi: number };

// stato di un mancante, dal più vicino al montaggio al più lontano
const STATI = [
  ["magazzino", "Pronto a magazzino", "c'è giacenza: si può prelevare"],
  ["cdep", "In conto deposito", "presso un fornitore in conto deposito"],
  ["cella", "Produzione interna", "costruttivo o gruppo fatto in Kimatic: in una cella interna, con un'OP di produzione o senza ordine d'acquisto"],
  ["esterna", "Lavorazione esterna", "presso un terzista per una lavorazione"],
  ["ordinato", "Ordinato", "c'è un ordine d'acquisto al fornitore"],
  ["scoperto", "Da ordinare", "commerciale senza giacenza né ordine"],
] as const;
type Stato = (typeof STATI)[number][0];
// celle di lavorazione interne a Kimatic (le altre «celle» di SAM sono terzisti)
const CELLA_INTERNA = /^(AREA |TORN|FRES|CONTROLLO|PRODUZIONE KIMATIC|MONTAGGIO|MAGAZZINO|STAMPANT|PIEGATUR|SALDATUR|VERNICIAT|ASSEMBLA|COLLAUD)/i;
export const cellaInterna = (c: string) => !!c && CELLA_INTERNA.test(c.trim());
// costruttivi (20., 21., 90.), gruppi (21.5…) e sottoassiemi della macchina (10.–12.): si producono in Kimatic o da terzisti
const costruttivo = (c: string) => /^(1[0-2]|2[01]|90)\./.test(c);
const assieme = (c: string) => /^(21\.50[0-5]|1[0-2]\.)/.test(c);
export const gruppo = (c: string) => /^21\.50[0-5]/.test(c);
const oaFornitore = (m: Mancante) => m.ordini.some((o) => !/grezz/i.test(o.tipo || ""));
// fase di un'OP già fatta: in SAM «Chiusa», o «Rientrata» dal terzista (le altre: Da Iniziare, In Lavorazione, Da Spedire)
const FASE_CHIUSA = /chius|rientrat|termin|evas/i;
// stati delle OP in SAM: P proposto, C confermato, M movimentato, E evaso, A annullato
const STATO_OP: Record<string, string> = { P: "proposto", C: "confermato", M: "movimentato", E: "evaso", A: "annullato" };
const statoOp = (o: OpSam) => STATO_OP[o.stato.trim().toUpperCase()] || o.stato;
// finita: evasa, annullata o con tutta la quantità prodotta
const opFinita = (o: OpSam) => /^[ea]$/i.test(o.stato.trim()) || ((o.qta ?? 0) > 0 && (o.prod ?? 0) >= (o.qta ?? 0));
// proposta o confermata: non ancora movimentata, quindi il materiale non è stato prelevato
const opDaLanciare = (o: OpSam) => /^[pc]$/i.test(o.stato.trim());
const numOp = (op: string) => { const [n, a] = op.split("/"); return (a || "0").padStart(4, "0") + (n || "").padStart(8, "0"); };
type Materiale = "" | "non prelevato" | "da prelevare" | "prelevato";
// coperto: la giacenza (unica per tutte le commesse) basta per questa riga, dopo le righe con il montaggio prima
export function statoDi(m: Mancante, haOp = false, cellaOp = "", coperto?: boolean): Stato {
  if (coperto ?? (m.qta != null && m.giac_mp != null && m.giac_mp >= m.qta && m.qta > 0)) return "magazzino";
  if (m.cdep) return "cdep";
  const cella = m.cella || cellaOp;
  if (cella) return cellaInterna(cella) ? "cella" : "esterna";
  if (oaFornitore(m)) return "ordinato";
  if (haOp || costruttivo(m.codice)) return "cella";
  if (m.ordini.length || m.fornitore) return "ordinato";
  return "scoperto";
}
const nomeStato = (s: string) => STATI.find((x) => x[0] === s)?.[1] || s;

const oggi = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
const fd = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}` : "");
const quando = (s?: string | null) => (s ? new Date(s).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const q2 = (v: number | null) => (v == null ? "" : v.toLocaleString("it-IT", { maximumFractionDigits: 2 }));
/** In ritardo: data attesa passata, o oltre l'inizio montaggio della commessa. */
function ritardo(m: Mancante, montaggio: string | null | undefined, st: Stato, a: string | null): "" | "scaduta" | "oltre" {
  if (!m.aperto || st === "magazzino") return "";
  if (a && a < oggi()) return "scaduta";
  if (montaggio && (!a || a > montaggio) && st !== "cdep") return "oltre";
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

/** Menu a tendina con più scelte: caselle da spuntare e ricerca. */
function Multi({ etichetta, tutti, voci, scelti, cambia, largo }: {
  etichetta: string; tutti: string; voci: { v: string; l: string; n?: number }[]; scelti: string[]; cambia: (v: string[]) => void; largo?: boolean;
}) {
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const rif = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => { if (rif.current && !rif.current.contains(e.target as Node)) setAperto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAperto(false); };
    document.addEventListener("mousedown", fuori); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuori); document.removeEventListener("keydown", esc); };
  }, [aperto]);
  const vis = cerca ? voci.filter((x) => x.l.toLowerCase().includes(cerca.toLowerCase())) : voci;
  const testo = !scelti.length ? tutti : scelti.length === 1 ? (voci.find((x) => x.v === scelti[0])?.l || scelti[0]) : `${etichetta}: ${scelti.length} scelti`;
  const inverti = (v: string) => cambia(scelti.includes(v) ? scelti.filter((x) => x !== v) : [...scelti, v]);
  return (
    <div className={"multi" + (scelti.length ? " on" : "")} ref={rif}>
      <button type="button" className="multi-b" aria-haspopup="listbox" aria-expanded={aperto} aria-label={etichetta} title={scelti.map((v) => voci.find((x) => x.v === v)?.l || v).join("\n")} onClick={() => setAperto((a) => !a)}>
        <span>{testo}</span><b aria-hidden>▾</b>
      </button>
      {aperto && (
        <div className={"multi-p" + (largo ? " largo" : "")} role="listbox" aria-multiselectable>
          {voci.length > 8 && <input type="search" autoFocus placeholder="Cerca…" value={cerca} onChange={(e) => setCerca(e.target.value)} />}
          <div className="multi-a">
            <button type="button" onClick={() => cambia([...new Set([...scelti, ...vis.map((x) => x.v)])])}>Seleziona {cerca ? "trovati" : "tutti"}</button>
            <button type="button" onClick={() => cambia([])} disabled={!scelti.length}>Nessuno</button>
          </div>
          <ul>
            {vis.map((x) => (
              <li key={x.v}><label><input type="checkbox" checked={scelti.includes(x.v)} onChange={() => inverti(x.v)} /><span>{x.l}</span>{x.n != null && <small>{x.n}</small>}</label></li>
            ))}
            {!vis.length && <li className="nota">Nessuna voce</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Mancanti({ me, gestisce, modifica }: Props) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [righe, setRighe] = useState<Mancante[]>([]);
  const [comm, setComm] = useState<Record<string, Commessa>>({});
  const [ult, setUlt] = useState<Import | null>(null);
  const [persone, setPersone] = useState<{ id: string; nome: string; colore: string | null; profilo: string | null; ordine: number }[]>([]);
  const [carico, setCarico] = useState(true);
  const [vista, setVista] = useState<"commesse" | "elenco" | "fornitori" | "reparti" | "prelevati" | "assegnazioni">("commesse");
  const [aperta, setAperta] = useState<string>("");          // commessa / fornitore / reparto aperto
  const [q, setQ] = useState("");
  const [filtroStato, setFiltroStato] = useState<string[]>([]);
  const [soloRitardi, setSoloRitardi] = useState(false);
  const [soloRipetuti, setSoloRipetuti] = useState(false);
  const [nascoste, setNascoste] = useState(false);
  const [msg, setMsg] = useState("");
  const [lavoro, setLavoro] = useState(false);
  const [piano, setPiano] = useState<Record<string, CommessaPiano>>({});
  const [assegn, setAssegn] = useState<Assegnazione[]>([]);
  const [colori, setColori] = useState<Record<string, string>>({});
  const [ops, setOps] = useState<Map<string, OpSam[]>>(new Map());
  const [distinte, setDistinte] = useState<Record<string, { op: string; righe: [string, string, number | null][] }>>({});
  const [filtroComm, setFiltroComm] = useState<string[]>([]);
  const [filtroForn, setFiltroForn] = useState<string[]>([]);
  const [filtroPers, setFiltroPers] = useState<string[]>([]);
  const [liste, setListe] = useState<string[]>([]);
  const [filtroFase, setFiltroFase] = useState<string[]>([]);
  // ordinamento personalizzato: elenco di chiavi (es. fornitore, poi commessa, poi codice), ricordato sul dispositivo
  const [ordine, setOrdineS] = useState<string[]>([]);
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem("mancanti-ordine") || "[]"); if (Array.isArray(v)) setOrdineS(v.filter((x) => typeof x === "string")); } catch { /* niente */ } }, []);
  const setOrdine = (v: string[]) => { setOrdineS(v); try { localStorage.setItem("mancanti-ordine", JSON.stringify(v)); } catch { /* niente */ } };

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
      sb.from("mancanti_import").select("*").not("origine", "like", "Invio automatico (%").order("il", { ascending: false }).limit(1),
      sb.rpc("mancanti_piano"),
      sb.from("mancanti_assegnazioni").select("*"),
      sb.from("mancanti_colori").select("*"),
    ]);
    const { data: PP } = await sb.from("mancanti_persone").select("*").order("ordine").order("nome");
    // OP di produzione di SAM (con le fasi) e distinte del Controllo di gestione per i gruppi senza figli nel file
    const O = new Map<string, OpSam[]>();
    for (let da = 0; ; da += 1000) {
      const { data, error } = await sb.from("mancanti_op").select("codice,op,commessa,stato,qta,prod,fasi").order("codice").range(da, da + 999);
      if (error || !data) break;
      for (const x of data as OpSam[]) O.set(x.codice, [...(O.get(x.codice) || []), x]);
      if (data.length < 1000) break;
    }
    setOps(O);
    const { data: D } = await sb.rpc("mancanti_distinte");
    setDistinte((D ?? {}) as typeof distinte);
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
  // ---------- giacenza e ordinato condivisi tra commesse ----------
  // La giacenza di un codice è unica (la stessa su tutte le righe): si assegna alle righe partendo dal montaggio
  // più vicino. Le righe che la giacenza non copre prendono l'ordinato, ordine dopo ordine per data di consegna,
  // e la loro data di arrivo è la consegna dell'ultimo ordine che serve a coprirle.
  type Quota = { giac: number; daGiac: number; coperto: boolean; arrivo: string | null; ordiniUsati: string[]; scoperta: number; ordiniNoti: boolean };
  const quote = useMemo(() => {
    const Q = new Map<number, Quota>();
    const perCod = new Map<string, Mancante[]>();
    for (const m of righe) if (m.aperto) perCod.set(m.codice, [...(perCod.get(m.codice) || []), m]);
    for (const L of perCod.values()) {
      L.sort((a, b) => (montaggioDi(a) || "9999").localeCompare(montaggioDi(b) || "9999") || ordComm(a.commessa).localeCompare(ordComm(b.commessa)) || a.id - b.id);
      const giac = Math.max(0, ...L.map((m) => m.giac_mp ?? 0));
      const ordini = new Map<string, { num: string; consegna: string | null; resto: number }>();
      for (const m of L) for (const o of m.ordini) if (!/grezz/i.test(o.tipo || "") && !ordini.has(o.num)) ordini.set(o.num, { num: o.num, consegna: o.consegna, resto: o.qta == null ? Infinity : Math.max(0, o.qta) });
      const coda = [...ordini.values()].sort((a, b) => (a.consegna || "9999").localeCompare(b.consegna || "9999"));
      let resto = giac;
      for (const m of L) {
        const serve = Math.max(0, m.qta ?? 0), daGiac = Math.min(serve, resto); resto -= daGiac;
        let manca = serve - daGiac, arrivo: string | null = null; const usati: string[] = [];
        for (const o of coda) { if (manca <= 0) break; if (o.resto <= 0) continue; const x = Math.min(manca, o.resto); o.resto -= x; manca -= x; usati.push(o.num); if (o.consegna && (!arrivo || o.consegna > arrivo)) arrivo = o.consegna; }
        Q.set(m.id, { giac, daGiac, coperto: serve > 0 && daGiac >= serve, arrivo: serve - daGiac > 0 ? arrivo : null, ordiniUsati: usati, scoperta: coda.length ? manca : 0, ordiniNoti: coda.length > 0 });
      }
    }
    return Q;
  }, [righe, piano, comm]); // eslint-disable-line react-hooks/exhaustive-deps
  // per le righe accorpate (stesso codice nella stessa commessa) valgono tutte le righe unite
  const quotaDi = (m: Mancante): Quota | undefined => {
    const L = (m.ids || [m.id]).map((i) => quote.get(i)).filter(Boolean) as Quota[];
    if (L.length < 2) return L[0];
    return { giac: L[0].giac, daGiac: L.reduce((t, x) => t + x.daGiac, 0), coperto: L.every((x) => x.coperto), arrivo: L.map((x) => x.arrivo).filter(Boolean).sort().pop() || null,
      ordiniUsati: [...new Set(L.flatMap((x) => x.ordiniUsati))], scoperta: L.reduce((t, x) => t + x.scoperta, 0), ordiniNoti: L.some((x) => x.ordiniNoti) };
  };
  /** Data attesa: la data prevista scritta a mano, poi la consegna dell'ordinato assegnato alla riga, poi la prima consegna. */
  const attesaDi = (m: Mancante) => { const x = quotaDi(m); return m.prevista || x?.arrivo || (x?.ordiniNoti ? null : m.consegna); };
  // OP di produzione del codice (prima quella della stessa commessa) e fase in corso
  // l'OP che riguarda la riga: tra quelle non finite, prima quella della stessa commessa, poi quella la cui fase in corso
  // è nella cella indicata da SAM per la riga, poi la più recente
  const cacheOp = useMemo(() => new Map<number, OpSam | null>(), [ops]); // eslint-disable-line react-hooks/exhaustive-deps
  const opDi = (m: Mancante) => {
    if (cacheOp.has(m.id)) return cacheOp.get(m.id)!;
    const o = scegliOp(m); cacheOp.set(m.id, o); return o;
  };
  const scegliOp = (m: Mancante) => {
    const L = (ops.get(m.codice) || []).filter((o) => !opFinita(o)); if (!L.length) return null;
    const cellaFase = (o: OpSam) => o.fasi.find((f) => !FASE_CHIUSA.test(f.stato))?.cella || "";
    const punti = (o: OpSam) => (norm(o.commessa) === norm(m.commessa) ? 4 : 0) + (m.cella && cellaFase(o) === m.cella ? 2 : 0);
    return [...L].sort((a, b) => punti(b) - punti(a) || numOp(b.op).localeCompare(numOp(a.op)))[0];
  };
  // il materiale dell'OP: non prelevato se l'OP non è lanciata, da prelevare se nel file ci sono ancora suoi componenti
  const materialeDi = (m: Mancante): Materiale => {
    const o = opDi(m); if (!o) return "";
    if (opDaLanciare(o)) return "non prelevato";
    return figli.has(m.commessa + "|" + m.codice) ? "da prelevare" : "prelevato";
  };
  const faseDi = (m: Mancante) => { const o = opDi(m); return o ? (o.fasi.find((f) => !FASE_CHIUSA.test(f.stato)) || null) : null; };
  const cellaOra = (m: Mancante) => m.cella || faseDi(m)?.cella || "";
  const stDi = (m: Mancante) => statoDi(m, !!opDi(m), faseDi(m)?.cella || "", quotaDi(m)?.coperto ?? false);
  const ritDi = (m: Mancante) => ritardo(m, montaggioDi(m), stDi(m), attesaDi(m));
  const clienteDi = (c: string) => piano[norm(c)]?.cliente || comm[c]?.cliente || "";
  const nelPiano = (c: string) => !!piano[norm(c)] && !piano[norm(c)].chiusa;
  // chi segue il codice: scelto sulla riga, altrimenti dalle assegnazioni (cella, poi fornitore)
  // per le celle vale anche una parte del nome (es. «TORNI» per tutti i torni), la più lunga che corrisponde
  const cellaDi = (cella: string) => {
    if (!cella) return null;
    const C = cella.toUpperCase();
    return assegn.find((a) => a.tipo === "cella" && a.valore === cella)?.persona
      || assegn.filter((a) => a.tipo === "cella" && C.includes(a.valore.toUpperCase())).sort((a, b) => b.valore.length - a.valore.length)[0]?.persona || null;
  };
  const cdepDi = (cdep: string) => (cdep ? (assegn.find((a) => a.tipo === "cdep" && a.valore === cdep) || assegn.find((a) => a.tipo === "cdep" && a.valore === "*"))?.persona || null : null);
  const personaDi = (m: Mancante) => m.responsabile
    || cdepDi(m.cdep)
    || cellaDi(cellaOra(m))
    || assegn.find((a) => a.tipo === "fornitore" && (a.valore === m.fornitore || m.ordini.some((o) => o.fornitore === a.valore)))?.persona || null;
  const coloreDi = (m: Mancante) => (stDi(m) === "magazzino" ? colori.giacenti : (() => { const p = personaDi(m); return p ? colori[p] : undefined; })());
  const nomeDi = (id: string | null) => persone.find((p) => p.id === id)?.nome || "";
  const aperti = righe.filter((m) => m.aperto);
  // si vedono tutte le commesse aperte del Piano produzione (non si nascondono più a mano)
  const visibileComm = (c: string) => nascoste || nelPiano(c);
  // lo stesso codice aperto su più righe (altre macchine/OP della commessa) o su più commesse
  const perCodice = useMemo(() => {
    const M = new Map<string, Mancante[]>();
    for (const m of righe) if (m.aperto) { const L = M.get(m.codice); if (L) L.push(m); else M.set(m.codice, [m]); }
    return M;
  }, [righe]);
  const ripetuto = (m: Mancante) => (perCodice.get(m.codice)?.length || 0) > 1;
  // figli dei gruppi: righe della stessa commessa che hanno come OP il codice del gruppo
  const figli = useMemo(() => {
    const M = new Map<string, Mancante[]>();
    for (const m of righe) if (m.aperto) { const k = m.commessa + "|" + m.op; M.set(k, [...(M.get(k) || []), m]); }
    return M;
  }, [righe]);
  const figliDi = (m: Mancante) => figli.get(m.commessa + "|" + m.codice) || [];
  const fornitoriDi = (m: Mancante) => [...new Set([m.fornitore, ...m.ordini.map((o) => o.fornitore)].filter(Boolean))];
  const LISTE: Record<string, { l: string; f: (m: Mancante) => boolean }> = {
    prelevabili: { l: "Prelevabili da magazzino", f: (m) => stDi(m) === "magazzino" },
    sollecitare: { l: "Da sollecitare ai fornitori (in ritardo)", f: (m) => (stDi(m) === "ordinato" || stDi(m) === "esterna") && !!ritDi(m) },
    ordinati: { l: "Ordinati, in arrivo", f: (m) => stDi(m) === "ordinato" },
    daordinare: { l: "Da ordinare", f: (m) => stDi(m) === "scoperto" },
    interna: { l: "Produzione interna", f: (m) => stDi(m) === "cella" },
    taglio: { l: "Al taglio", f: (m) => /TAGLIO/i.test(cellaOra(m)) },
    tornio: { l: "Al tornio", f: (m) => /TORN/i.test(cellaOra(m)) },
    fresa: { l: "Alla fresa", f: (m) => /FRES/i.test(cellaOra(m)) },
    esterna: { l: "Presso terzisti (lavorazione esterna)", f: (m) => stDi(m) === "esterna" },
    cdep: { l: "In conto deposito", f: (m) => stDi(m) === "cdep" },
    gruppi: { l: "Gruppi 21.5… senza figli nel file", f: (m) => gruppo(m.codice) && !figliDi(m).length },
    lavorabili: { l: "In produzione, materiale prelevato (lavorabili)", f: (m) => materialeDi(m) === "prelevato" },
    nonlavorabili: { l: "In produzione, materiale non prelevato", f: (m) => materialeDi(m) === "non prelevato" || materialeDi(m) === "da prelevare" },
  };
  const base = aperti.filter((m) => visibileComm(m.commessa));
  // dentro lo stesso filtro le scelte valgono in «oppure» (questo fornitore o quell'altro), tra filtri diversi in «e»
  const filtrati = base.filter((m) => trova(m, q) && (!filtroStato.length || filtroStato.includes(stDi(m))) && (!soloRitardi || ritDi(m)) && (!soloRipetuti || ripetuto(m))
    && (!filtroComm.length || filtroComm.includes(m.commessa)) && (!filtroForn.length || fornitoriDi(m).some((f) => filtroForn.includes(f)))
    && (!filtroPers.length || filtroPers.includes(personaDi(m) || "-")) && (!liste.length || liste.some((k) => LISTE[k]?.f(m)))
    && (!filtroFase.length || filtroFase.includes(faseDi(m)?.lav || "-")));
  const filtroAttivo = !!(q || filtroStato.length || soloRitardi || soloRipetuti || filtroComm.length || filtroForn.length || filtroPers.length || liste.length || filtroFase.length);
  const elenco = (L: string[], tanti: string, f: (v: string) => string = (v) => v) => (L.length > 3 ? `${L.length} ${tanti}` : L.map(f).join(", "));
  const nomeLista = () => ["Mancanti", elenco(liste, "liste", (k) => LISTE[k]?.l || k), elenco(filtroComm, "commesse"), elenco(filtroForn, "fornitori"),
    elenco(filtroPers, "persone", (p) => (p === "-" ? "senza persona" : nomeDi(p))), elenco(filtroStato, "stati", (x) => nomeStato(x)), elenco(filtroFase, "fasi", (x) => (x === "-" ? "senza fase" : x.toLowerCase()))].filter(Boolean).join(" - ");
  const segnoFigli = (m: Mancante) => {
    if (!assieme(m.codice)) return null;
    const F = figliDi(m), o = opDi(m), d = distinte[m.matricola + "|" + m.codice];
    if (F.length) return <span className="dup fg" title={`Figli del gruppo ancora da prelevare (${F.length}):\n` + F.map((x) => `${x.codice} ${x.descr} · q.tà ${q2(x.qta)} · ${nomeStato(stDi(x))}`).join("\n")}><i>{F.length} figli mancanti</i></span>;
    const elenco = d ? `\n\nDistinta (Controllo di gestione, OP ${d.op}):\n` + d.righe.map((r) => `${r[0]} ${r[1]} · q.tà ${r[2] ?? ""}`).join("\n") : "";
    const evasa = !o && (ops.get(m.codice) || []).find((x) => /^e$/i.test(x.stato.trim()));
    if (evasa) return <span className="dup ok" title={`OP ${evasa.op} evasa: il gruppo è stato prodotto (prodotti ${q2(evasa.prod ?? 0)} di ${q2(evasa.qta)}).` + elenco}><i>OP evasa</i></span>;
    if (o && opDaLanciare(o)) return <span className="dup no" title={`OP ${o.op} ${statoOp(o)}, non ancora movimentata: i componenti non sono ancora stati prelevati.` + elenco}><i>figli non prelevati</i></span>;
    return o
      ? <span className="dup ok" title={`OP ${o.op} (${statoOp(o)}): nessun figlio da prelevare, quindi i componenti sono già stati prelevati.` + elenco}><i>figli prelevati</i></span>
      : <span className="dup no" title={"Nel file di SAM non ci sono figli di questo gruppo e non risulta un'OP di produzione: i componenti sono già tutti prelevati oppure l'OP del gruppo non è ancora stata lanciata." + (elenco || "\n\nDistinta non trovata nel Controllo di gestione.")}><i>{d ? `figli: ${d.righe.length} in distinta` : "figli non nel file"}</i></span>;
  };
  const segnoOp = (m: Mancante) => {
    const o = opDi(m); if (!o) return null;
    const f = faseDi(m), mat = materialeDi(m), altre = (ops.get(m.codice) || []).filter((x) => x !== o);
    const spiega = mat === "non prelevato" ? "OP " + statoOp(o) + ", non ancora movimentata: il materiale non è stato prelevato, il pezzo non si può lavorare."
      : mat === "da prelevare" ? "Nel file ci sono ancora componenti da prelevare per questa OP." : "Materiale dell'OP prelevato.";
    return <small title={`OP ${o.op}${o.commessa ? " · commessa " + o.commessa : ""}${o.stato ? " · " + statoOp(o) : ""} · prodotti ${q2(o.prod ?? 0)} di ${q2(o.qta)}\n${spiega}\n` + o.fasi.map((x) => `${x === f ? "▸ " : "   "}${x.seq ?? ""} ${x.lav}${x.cella ? " · " + x.cella : ""}${x.stato ? " · " + x.stato : ""}${x.scad ? " · " + fd(x.scad) : ""}`).join("\n")
      + (altre.length ? "\n\nAltre OP dello stesso codice: " + altre.map((x) => `${x.op} (${statoOp(x)})`).join(", ") : "")}>
      OP {o.op}{f ? ` · ${f.lav.toLowerCase()}` : ""}{mat && <span className={"mat m-" + mat.replace(" ", "-")}>{mat === "non prelevato" ? "materiale non prelevato" : mat === "da prelevare" ? "materiale da prelevare" : "materiale prelevato"}</span>}</small>;
  };
  const segnoRipetuto = (m: Mancante) => {
    const L = perCodice.get(m.codice) || [];
    if (L.length < 2) return null;
    const stessa = L.filter((x) => x.commessa === m.commessa).length - 1;
    const altre = [...new Set(L.filter((x) => x.commessa !== m.commessa).map((x) => x.commessa))];
    const tot = L.reduce((t, x) => t + (x.qta || 0), 0);
    const elenco = L.map((x) => `${x === m ? "▸ " : "   "}${x.commessa} · ${x.op || x.matricola}${x.op_descr ? " " + x.op_descr : ""} · q.tà ${q2(x.qta)}${x.nota ? " · nota: " + x.nota : ""}`).join("\n");
    return <span className="dup" title={`Codice ${m.codice} mancante in ${L.length} righe (totale ${q2(tot)}):\n${elenco}`}>
      {stessa > 0 && <i>{stessa === 1 ? "+1 riga" : `+${stessa} righe`}</i>}{altre.length > 0 && <i className="ac">{altre.length === 1 ? "anche " + altre[0] : `anche in ${altre.length} commesse`}</i>}
    </span>;
  };

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
  // stesso codice nella stessa commessa (per più gruppi o macchine) → una riga sola, con le quantità sommate
  const accorpa = (L: Mancante[]) => {
    const M = new Map<string, Mancante>();
    const unisci = (a: string, b: string) => (!b || a.split(", ").includes(b) ? a : a ? a + ", " + b : b);
    for (const m of L) {
      const k = m.commessa + "|" + m.codice, x = M.get(k);
      if (!x) { M.set(k, { ...m, ordini: [...m.ordini], ids: [m.id] }); continue; }
      x.ids = [...(x.ids || [x.id]), m.id];
      x.qta = (x.qta ?? 0) + (m.qta ?? 0);
      x.op = unisci(x.op, m.op); x.op_descr = unisci(x.op_descr, m.op_descr);
      if (x.matricola !== m.matricola) { x.matricola = unisci(x.matricola, m.matricola); x.macchina = unisci(x.macchina, m.macchina); }
      x.nota = unisci(x.nota, m.nota);
      for (const o of m.ordini) if (!x.ordini.some((y) => y.num === o.num)) x.ordini.push(o);
      if (m.prevista && (!x.prevista || m.prevista > x.prevista)) x.prevista = m.prevista;
      if (m.consegna && (!x.consegna || m.consegna > x.consegna)) x.consegna = m.consegna;
    }
    return [...M.values()];
  };

  // PDF di quello che si vede: commessa, macchina, codice, descrizione, quantità, fase o fornitore
  const [pdfInCorso, setPdfInCorso] = useState(false);
  async function scaricaPdf(L0: Mancante[]) {
    setPdfInCorso(true);
    const L = accorpa(L0);
    try {
      const comeUrl = (b: Blob) => new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(b); });
      const [{ jsPDF }, { pdfMancanti }, logo] = await Promise.all([import("jspdf"), import("./pdf"), fetch("/logo/kimatic").then((r) => r.blob()).then(comeUrl).catch(() => undefined)]);
      const posComm = (c: string) => montaggioComm(c) || "9999";
      const ord = ordine.length ? ordina(L) : [...L].sort((a, b) => posComm(a.commessa).localeCompare(posComm(b.commessa)) || ordComm(b.commessa).localeCompare(ordComm(a.commessa))
        || a.matricola.localeCompare(b.matricola) || a.op.localeCompare(b.op) || a.codice.localeCompare(b.codice));
      const righePdf = ord.map((m) => {
        const st = stDi(m), f = faseDi(m), o = opDi(m);
        let dove = "", dettaglio = "";
        if (st === "magazzino") { dove = "Pronto a magazzino"; dettaglio = `giacenza ${q2(m.giac_mp)}`; }
        else if (st === "cdep") { dove = m.cdep.replace(/^C\/Dep\.\s*Forn\.\s*/i, "") || "Conto deposito"; dettaglio = "in conto deposito"; }
        else if (f) { const mat = materialeDi(m); dove = f.lav; dettaglio = [f.cella, f.stato && f.stato.toLowerCase(), o && "OP " + o.op, mat && "materiale " + mat].filter(Boolean).join(" · "); }
        else if (m.cella) { dove = m.cella; dettaglio = [st === "esterna" ? "lavorazione esterna" : "", m.ultima_lav && "chiusa: " + m.ultima_lav.toLowerCase()].filter(Boolean).join(" · "); }
        else if (st === "ordinato") { dove = m.fornitore || m.ordini[0]?.fornitore || "Ordinato"; const a = attesaDi(m); dettaglio = [m.ordini.map((x) => x.num).filter(Boolean).join(", ") && "ord. " + m.ordini.map((x) => x.num).filter(Boolean).join(", "), a && "consegna " + fd(a)].filter(Boolean).join(" · "); }
        else if (st === "cella") { dove = "Produzione interna"; dettaglio = o ? "OP " + o.op : "OP non presente"; }
        else { dove = "Da ordinare"; }
        return { commessa: m.commessa, cliente: clienteDi(m.commessa) || "", macchina: m.matricola, macchinaDescr: m.macchina + (m.op.includes(", ") ? " · per " + m.op : ""), codice: m.codice, descr: m.descr, qta: q2(m.qta), dove, dettaglio, rosso: !!ritDi(m) || materialeDi(m) === "non prelevato" };
      });
      const filtri = nomeLista().replace(/^Mancanti( - )?/, "") + (q ? (nomeLista() === "Mancanti" ? "" : " - ") + "ricerca: " + q : "") + (soloRitardi ? " - solo in ritardo" : "");
      const doc = pdfMancanti(jsPDF, righePdf, { titolo: `${righePdf.length} righe · ${new Set(righePdf.map((r) => r.commessa)).size} commesse`, filtri, logo });
      doc.save(`${nomeLista()} ${oggi()}.pdf`.replace(/[\\/:*?"<>|]+/g, " "));
    } catch (e) { alert("PDF non riuscito: " + (e instanceof Error ? e.message : String(e))); }
    setPdfInCorso(false);
  }

  async function esporta(L0: Mancante[], nome: string) {
    const L = accorpa(L0);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("Mancanti");
    ws.columns = [["Commessa", 12], ["Cliente", 20], ["Inizio montaggio", 12], ["Matricola", 15], ["Macchina", 30], ["OP", 16], ["Gruppo (OP)", 30], ["Codice", 16], ["Descrizione", 36], ["Q.tà", 7], ["Giacenza totale", 9], ["Giacenza assegnata", 10],
      ["Stato", 20], ["Fornitore", 24], ["Ordini", 26], ["Consegna ordine", 12], ["Arrivo previsto", 12], ["Cella lavorazione", 20], ["C/deposito", 18], ["Data prevista", 12], ["Chi lo segue", 18], ["Note", 36], ["Nota aggiornata il", 14], ["OP produzione / fase", 26], ["Figli del gruppo", 22]]
      .map(([header, width]) => ({ header: String(header), width: Number(width) }));
    ws.getRow(1).font = { bold: true };
    const nomeP = Object.fromEntries(persone.map((p) => [p.id, p.nome]));
    const ordinati = ordine.length ? ordina(L) : liste.includes("sollecitare") || filtroForn.length ? [...L].sort((a, b) => (a.fornitore || "~").localeCompare(b.fornitore || "~") || (attesaDi(a) || "9999").localeCompare(attesaDi(b) || "9999")) : L;
    for (const m of ordinati) {
      const rit = ritDi(m), mo = montaggioDi(m), o = opDi(m), f = faseDi(m), F = assieme(m.codice) ? figliDi(m) : null;
      const row = ws.addRow([m.commessa, clienteDi(m.commessa), mo ? new Date(mo + "T12:00:00") : "", m.matricola, m.macchina, m.op, m.op_descr, m.codice, m.descr, m.qta, m.giac_mp, quotaDi(m)?.daGiac ?? "",
        nomeStato(stDi(m)), m.fornitore, m.ordini.map((o) => o.num).join(", "), m.consegna ? new Date(m.consegna + "T12:00:00") : "", attesaDi(m) ? new Date(attesaDi(m) + "T12:00:00") : "", cellaOra(m), m.cdep,
        m.prevista ? new Date(m.prevista + "T12:00:00") : "", nomeP[personaDi(m) || ""] || "", m.nota, m.nota_il ? new Date(m.nota_il) : "",
        o ? `OP ${o.op}${f ? " · " + f.lav : ""}${materialeDi(m) ? " · materiale " + materialeDi(m) : ""}` : "", F ? (F.length ? `${F.length} figli mancanti` : o ? "figli prelevati" : "figli non nel file") : ""]);
      const col = coloreDi(m);
      if (col) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + col.slice(1).toUpperCase() } };
      if (col && scuro(col)) row.font = { color: { argb: "FFFFFFFF" } };
      if (rit) row.font = { ...(row.font || {}), bold: true, color: col && scuro(col) ? { argb: "FFFFFFFF" } : { argb: "FFB42318" } };
    }
    ["C", "P", "Q", "T", "W"].forEach((k) => (ws.getColumn(k).numFmt = "dd/mm/yyyy"));
    ws.autoFilter = { from: "A1", to: "Y1" }; ws.views = [{ state: "frozen", ySplit: 1 }];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([await wb.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = `${nome} ${oggi()}.xlsx`.replace(/[\\/:*?"<>|]+/g, " "); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  // ---------- ordinamento personalizzato ----------
  const CHIAVI: Record<string, { l: string; f: (m: Mancante) => string }> = {
    montaggio: { l: "Inizio montaggio", f: (m) => montaggioDi(m) || "9999" },
    commessa: { l: "Commessa", f: (m) => ordComm(m.commessa) },
    macchina: { l: "Macchina", f: (m) => m.matricola },
    gruppo: { l: "Gruppo (OP)", f: (m) => m.op },
    codice: { l: "Codice", f: (m) => m.codice },
    fornitore: { l: "Fornitore", f: (m) => (m.fornitore || m.ordini[0]?.fornitore || "~").toLowerCase() },
    stato: { l: "Stato", f: (m) => String(STATI.findIndex((x) => x[0] === stDi(m))) },
    arrivo: { l: "Data di arrivo", f: (m) => attesaDi(m) || "9999" },
    persona: { l: "Seguito da", f: (m) => nomeDi(personaDi(m)).toLowerCase() || "~" },
    fase: { l: "Fase", f: (m) => (faseDi(m)?.lav || "~").toLowerCase() },
    cella: { l: "Cella / reparto", f: (m) => (cellaOra(m) || m.cdep || "~").toLowerCase() },
  };
  const ordina = (L: Mancante[]) => {
    const K = ordine.filter((k) => CHIAVI[k]); if (!K.length) return L;
    const V = new Map(L.map((m) => [m, K.map((k) => CHIAVI[k].f(m))]));
    return [...L].sort((a, b) => { const x = V.get(a)!, y = V.get(b)!; for (let i = 0; i < K.length; i++) { const c = x[i].localeCompare(y[i], "it", { numeric: true }); if (c) return c; } return 0; });
  };
  // ---------- pezzi di interfaccia ----------
  const conteggi = (L: Mancante[]) => Object.fromEntries(STATI.map(([k]) => [k, L.filter((m) => stDi(m) === k).length])) as Record<Stato, number>;
  const barra = (L: Mancante[]) => {
    const c = conteggi(L), n = L.length || 1;
    return <div className="barra" aria-hidden>{STATI.map(([k]) => c[k] ? <span key={k} className={"b-" + k} style={{ width: `${(c[k] / n) * 100}%` }} title={`${nomeStato(k)}: ${c[k]}`} /> : null)}</div>;
  };
  const tabella = (L: Mancante[], o: { commessa?: boolean; macchina?: boolean } = {}) => (
    <div className="mx"><table className={"tm fit" + (o.commessa ? " con-comm" : "") + (o.macchina === false ? " senza-mac" : "")}>
      <thead><tr>{o.commessa && <th className="c-comm">Commessa</th>}{o.macchina !== false && <th className="c-mac">Macchina / gruppo</th>}<th className="c-cod">Codice</th><th className="n c-q">Q.tà</th><th className="n hide-s c-g" title="Giacenza assegnata a questa riga, di quella totale del codice">Giac.</th><th className="c-st">Stato</th><th className="c-for">Fornitore / ordine</th><th className="c-att">Arrivo</th><th className="c-chi" title="Chi lo segue">Segue</th><th className="c-prev">Prevista</th><th className="c-nt">Nota</th></tr></thead>
      <tbody>{ordina(L).map((m) => {
        const st = stDi(m), rit = ritDi(m), ed = modifica || gestisce;
        return (
          <tr key={m.id} className={(rit ? "rit " : "") + (coloreDi(m) && scuro(coloreDi(m)!) ? " scura" : "")} style={coloreDi(m) ? { background: coloreDi(m) } : undefined}>
            {o.commessa && <td className="l1" title={clienteDi(m.commessa)}><b>{m.commessa}</b><small>{clienteDi(m.commessa)}</small></td>}
            {o.macchina !== false && <td className="l1" title={m.op_descr || m.macchina}><span className="mono">{m.op}</span><small>{m.op_descr || m.macchina}</small></td>}
            <td className="l1" title={m.descr}><span className="mono">{m.codice}</span>{segnoFigli(m)}{segnoRipetuto(m)}<small>{m.descr}</small></td>
            <td className="n mono">{q2(m.qta)}</td>
            <td className="n mono hide-s">{(() => { const x = quotaDi(m); if (!x || !x.giac) return q2(m.giac_mp);
              return <span title={`Giacenza totale del codice: ${q2(x.giac)}, la stessa per tutte le commesse.\nAssegnata a questa riga: ${q2(x.daGiac)} di ${q2(m.qta)} (prima le righe con il montaggio più vicino).`}>{q2(x.daGiac)}<small>di {q2(x.giac)}</small></span>; })()}</td>
            <td className="l1" title={[cellaOra(m), m.ultima_lav && "ultima fase chiusa: " + m.ultima_lav, m.cdep].filter(Boolean).join("\n")}><span className={"st s-" + st}>{nomeStato(st)}</span>{cellaOra(m) && <small>{cellaOra(m)}{m.ultima_lav ? " · chiusa: " + m.ultima_lav.toLowerCase() : ""}</small>}{m.cdep && <small>{m.cdep}</small>}{segnoOp(m)}</td>
            <td className="l1" title={m.ordini.map((x) => `OA ${x.num}${x.consegna ? " · " + fd(x.consegna) : ""}${x.fornitore ? " · " + x.fornitore : ""}`).join("\n")}>{m.fornitore}{m.ordini.length > 0 && <small>{(() => { const u = quotaDi(m)?.ordiniUsati || []; const L = u.length ? m.ordini.filter((x) => u.includes(x.num)) : m.ordini; return L.map((x) => `OA ${x.num}${x.consegna ? " · " + fd(x.consegna) : ""}${x.fornitore && x.fornitore !== m.fornitore ? " · " + x.fornitore : ""}`).join("; "); })()}</small>}{(quotaDi(m)?.scoperta || 0) > 0 && <small className="r" title="Le quantità ordinate vanno prima alle commesse con il montaggio più vicino">ordinato non basta: mancano {q2(quotaDi(m)!.scoperta)}</small>}</td>
            <td className="mono l1">{fd(attesaDi(m))}{rit && <small className="r">{rit === "scaduta" ? "data passata" : "dopo il montaggio"}</small>}</td>
            <td className="chi">{(() => { const p = personaDi(m), c = p ? colori[p] : undefined; return ed
              ? <select value={m.responsabile || ""} aria-label="Chi lo segue" title={p ? nomeDi(p) + (m.responsabile ? "" : " (dall'assegnazione)") : "Chi lo segue"} onChange={(e) => salvaRiga(m, { responsabile: e.target.value || null })} style={c ? { background: c, borderColor: "rgba(0,0,0,.35)" } : undefined}>
                  <option value="">{p && !m.responsabile ? "↳ " + nomeDi(p) : "—"}</option>{persone.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
              : <i className="pal" style={{ background: c || "transparent" }} title={nomeDi(p)} />; })()}</td>
            <td>{ed ? <input type="date" value={m.prevista || ""} title="Data prevista (se diversa dalla consegna dell'ordine)" aria-label="Data prevista" onChange={(e) => salvaRiga(m, { prevista: e.target.value || null })} /> : <span className="mono">{fd(m.prevista)}</span>}</td>
            <td className="nt l1" title={m.nota}>{ed ? <input defaultValue={m.nota} placeholder="nota" aria-label="Nota" onBlur={(e) => e.target.value !== m.nota && salvaRiga(m, { nota: e.target.value })} /> : m.nota}
              {m.nota && m.nota_il && <small title={"Nota aggiornata il " + quando(m.nota_il)}>agg. {fd(m.nota_il.slice(0, 10))}</small>}</td>
          </tr>
        );
      })}</tbody>
    </table></div>
  );

  // ultimo pezzo in arrivo di una commessa o di una macchina: la data più lontana tra i codici non coperti dalla giacenza
  // (data prevista, consegna dell'ordinato assegnato, o fine dell'ultima fase dell'OP di produzione)
  const fineOp = (m: Mancante) => (opDi(m)?.fasi || []).map((f) => f.scad).filter(Boolean).sort().pop() || null;
  const ultimoPezzo = (L: Mancante[]) => {
    let max: string | null = null, senza = 0, n = 0;
    for (const m of L) { if (stDi(m) === "magazzino") continue; n++; const d = attesaDi(m) || fineOp(m); if (!d) senza++; else if (!max || d > max) max = d; }
    return { max, senza, n };
  };
  const testoUltimo = (L: Mancante[]) => {
    const u = ultimoPezzo(L);
    if (!u.n) return <span className="ult ok">tutto disponibile a magazzino</span>;
    return <span className={"ult" + (u.max && u.max < oggi() ? " r" : "")} title={u.senza ? `${u.senza} ${u.senza === 1 ? "codice" : "codici"} senza data di arrivo (da ordinare, ordinato senza consegna o produzione senza scadenza)` : undefined}>
      {u.max ? <>ultimo pezzo in arrivo il <b>{fd(u.max)}</b></> : "ultimo pezzo in arrivo: data non nota"}{u.max && u.senza > 0 && <> · {u.senza} senza data</>}{u.max && u.max < oggi() && " (data passata)"}</span>;
  };
  // ---------- viste ----------
  const commesse = [...new Set(aperti.map((m) => m.commessa))].filter(visibileComm)
    .filter((c) => !filtroComm.length || filtroComm.includes(c))
    .sort((a, b) => (montaggioComm(a) || "9999").localeCompare(montaggioComm(b) || "9999") || ordComm(b).localeCompare(ordComm(a)));
  const raggruppa = (L: Mancante[], k: (m: Mancante) => string) => { const g = new Map<string, Mancante[]>(); L.forEach((m) => g.set(k(m), [...(g.get(k(m)) || []), m])); return [...g.entries()]; };

  let corpo: React.ReactNode;
  if (vista === "commesse") {
    corpo = (
      <div className="carte">
        {commesse.map((c) => {
          const L = filtrati.filter((m) => m.commessa === c), tutti = aperti.filter((m) => m.commessa === c), C = comm[c];
          if (!L.length && filtroAttivo) return null;
          const rit = tutti.filter((m) => ritDi(m)).length, prel = righe.filter((m) => !m.aperto && m.commessa === c).length;
          const macchine = [...new Set(tutti.map((m) => m.macchina || m.matricola))];
          const ap = aperta === c || (filtroComm.length === 1 && filtroComm[0] === c);
          return (
            <section key={c} className={"box carta" + (ap ? " aperta" : "")}>
              <div className="testa" onClick={() => setAperta(ap ? "" : c)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setAperta(ap ? "" : c); }} aria-expanded={ap}>
                <div><h2>{c}{clienteDi(c) && <span> · {clienteDi(c)}</span>}</h2>
                  <p className="nota">{macchine.slice(0, 3).join(" · ")}{macchine.length > 3 ? ` e altre ${macchine.length - 3}` : ""}</p></div>
                <div className="num"><b>{tutti.length}</b> mancanti{rit > 0 && <span className="r"> · {rit} in ritardo</span>}{prel > 0 && <span className="nota"> · {prel} prelevati in 14 gg</span>}
                  <span className="nota">{montaggioComm(c) ? "montaggio " + fd(montaggioComm(c)) : "montaggio non pianificato"}{!nelPiano(c) && " · non nel Piano produzione"}</span>{testoUltimo(tutti)}</div>
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
                  </div>
                </div>
                {raggruppa(L, (m) => `${m.matricola}  ${m.macchina}`).map(([k, G]) => {
                  const mo = montaggioDi(G[0]), x = macchinaDi(G[0]);
                  const tuttiM = aperti.filter((m) => m.commessa === c && m.matricola === G[0].matricola);
                  return <div key={k} className="gruppo"><h3>{k} <small className="nota">{G.length} · {mo ? `montaggio ${fd(mo)}${x?.chi ? " (" + x.chi + ")" : ""}` : "montaggio non pianificato"}</small> <small>{testoUltimo(tuttiM)}</small></h3>{tabella(G)}</div>;
                })}
              </div>}
            </section>
          );
        })}
        {!commesse.length && <p className="nota">Nessuna commessa con mancanti aperti.</p>}
      </div>
    );
  } else if (vista === "elenco") {
    // tutte le righe in una tabella sola, nell'ordine scelto (predefinito: montaggio, commessa, macchina, codice)
    const MAX = 1500;
    const L = ordine.length ? ordina(filtrati) : [...filtrati].sort((a, b) => (montaggioDi(a) || "9999").localeCompare(montaggioDi(b) || "9999") || ordComm(a.commessa).localeCompare(ordComm(b.commessa)) || a.matricola.localeCompare(b.matricola) || a.codice.localeCompare(b.codice));
    corpo = (
      <div className="box" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p className="nota">{L.length} righe{L.length > MAX ? ` · ne mostro ${MAX}: restringi con i filtri o scarica l'Excel per vederle tutte` : ""}{ordine.length ? " · ordinate per " + ordine.map((k) => CHIAVI[k]?.l.toLowerCase()).filter(Boolean).join(", poi ") : ""}</p>
        {L.length ? tabella(L.slice(0, MAX), { commessa: true }) : <p className="nota">Nessun mancante con questi filtri.</p>}
      </div>
    );
  } else if (vista === "fornitori" || vista === "reparti") {
    const chiave = vista === "fornitori" ? (m: Mancante) => m.fornitore || (stDi(m) === "scoperto" ? "— senza fornitore né ordine —" : "") : (m: Mancante) => cellaOra(m) || m.cdep || (stDi(m) === "magazzino" ? "Da prelevare a magazzino" : stDi(m) === "cella" ? "Produzione interna, cella non indicata" : "");
    const G = raggruppa(filtrati.filter((m) => chiave(m)), chiave).sort((a, b) => b[1].length - a[1].length);
    corpo = (
      <div className="carte">
        {G.map(([k, L]) => {
          const ap = aperta === k, rit = L.filter((m) => ritDi(m)).length, cc = [...new Set(L.map((m) => m.commessa))];
          return (
            <section key={k} className={"box carta" + (ap ? " aperta" : "")}>
              <div className="testa" onClick={() => setAperta(ap ? "" : k)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setAperta(ap ? "" : k); }} aria-expanded={ap}>
                <div><h2>{k}</h2><p className="nota">{cc.length} {cc.length === 1 ? "commessa" : "commesse"}: {cc.slice(0, 6).join(", ")}{cc.length > 6 ? "…" : ""}</p></div>
                <div className="num"><b>{L.length}</b> mancanti{rit > 0 && <span className="r"> · {rit} in ritardo</span>}</div>
              </div>
              {ap && <div className="dett"><div><button className="btn sec" onClick={() => esporta(L, "Mancanti " + k)}>Excel</button></div>{tabella(L.sort((a, b) => (attesaDi(a) || "9999").localeCompare(attesaDi(b) || "9999")), { commessa: true })}</div>}
            </section>
          );
        })}
        {!G.length && <p className="nota">{vista === "reparti" ? "Nessun mancante in lavorazione interna o in conto deposito con questi filtri. (Le celle di lavorazione arrivano con l'invio automatico dal PC (vista KI_ANALISI_COMMESSE_MANCANTI).)" : "Nessun mancante con questi filtri."}</p>}
      </div>
    );
  } else if (vista === "assegnazioni") {
    const conta = (k: (m: Mancante) => string[]) => { const c = new Map<string, number>(); aperti.filter((m) => visibileComm(m.commessa)).forEach((m) => k(m).filter(Boolean).forEach((v) => c.set(v, (c.get(v) || 0) + 1))); return [...c.entries()].sort((a, b) => b[1] - a[1]); };
    const forn = conta((m) => [...new Set([m.fornitore, ...m.ordini.map((o) => o.fornitore)])]).filter(([v]) => !q || v.toLowerCase().includes(q.toLowerCase()));
    const depositi = conta((m) => [m.cdep]);
    const celle = conta((m) => [cellaOra(m)]).filter(([v]) => !q || v.toLowerCase().includes(q.toLowerCase()));
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
          <p className="nota">Sono le persone (o i gruppi, come «Magazzino») che si possono scegliere come «chi lo segue». Ogni codice prende il colore della persona che lo segue: quella scelta sulla riga, altrimenti quella del conto deposito, poi quella della cella di lavorazione, poi quella del fornitore. I codici giacenti a magazzino hanno sempre il loro colore.</p>
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
          <h2 style={{ margin: 0 }}>Conto deposito <small className="nota">{depositi.length}</small></h2>
          <div className="mx"><table className="tm"><thead><tr><th>Deposito</th><th className="n">Mancanti</th><th>Chi lo segue</th></tr></thead>
            <tbody>
              <tr><td><b>Tutto il conto deposito</b><small>vale per ogni deposito senza una persona sua</small></td><td className="n mono">{aperti.filter((m) => visibileComm(m.commessa) && m.cdep).length}</td><td>{sel("cdep", "*")}</td></tr>
              {depositi.map(([v, n]) => <tr key={v}><td>{v}</td><td className="n mono">{n}</td><td>{sel("cdep", v)}</td></tr>)}
            </tbody></table></div>
        </section>
        <section className="box" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 style={{ margin: 0 }}>Celle di lavorazione <small className="nota">{celle.length}</small></h2>
          <p className="nota">Puoi assegnare una cella intera oppure una parte del nome: «TORNI» vale per tutti i torni (CNC e tradizionali), «FRES» per frese e fresatrici, «TAGLIO» per l&apos;area taglio. Le regole valgono anche per le celle che arriveranno dopo.</p>
          {(() => {
            const regole = assegn.filter((a) => a.tipo === "cella" && !celle.some(([v]) => v === a.valore)).sort((a, b) => a.valore.localeCompare(b.valore));
            return <div className="mx"><table className="tm"><thead><tr><th>Cella o parte del nome</th><th className="n">Mancanti</th><th>Chi la segue</th></tr></thead>
              <tbody>
                {regole.map((a) => { const n = aperti.filter((m) => visibileComm(m.commessa) && m.cella.toUpperCase().includes(a.valore.toUpperCase())).length;
                  return <tr key={"r" + a.valore}><td>contiene «{a.valore}»</td><td className="n mono">{n}</td><td>{sel("cella", a.valore)}</td></tr>; })}
                {celle.map(([v, n]) => <tr key={v}><td>{v}{!cellaInterna(v) && <small>terzista</small>}{!assegn.some((a) => a.tipo === "cella" && a.valore === v) && cellaDi(v) && <small>da regola: {nomeDi(cellaDi(v))}</small>}</td><td className="n mono">{n}</td><td>{sel("cella", v)}</td></tr>)}
                {modifica && <tr><td colSpan={3}><input placeholder="+ cella o parte del nome (es. TORNI), poi Invio" style={{ width: 300 }} onKeyDown={(e) => { const t = e.target as HTMLInputElement; if (e.key === "Enter" && t.value.trim()) { const v = t.value.trim().toUpperCase(); if (!assegn.some((a) => a.tipo === "cella" && a.valore === v)) setAssegn((L) => [...L, { tipo: "cella", valore: v, persona: "" }]); t.value = ""; } }} /></td></tr>}
              </tbody></table></div>;
          })()}
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
          <p className="sub">{ult ? <>Aggiornato {quando(ult.il)} · {ult.origine || "—"} · {ult.righe} righe, {ult.nuovi} nuove, {ult.chiusi} prelevate{Date.now() - new Date(ult.il).getTime() > 26 * 3600e3 && <b style={{ color: "#b91c1c" }}> · più di un giorno fa: l&apos;invio automatico dal PC non sta girando</b>}</> : "Nessun aggiornamento ancora: carica l'estrazione di SAM o attiva l'invio automatico."}</p></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sec" onClick={() => esporta(filtrati, nomeLista())} disabled={!filtrati.length} title="Scarica in Excel quello che vedi con i filtri scelti">Excel ({filtrati.length})</button>
          <button className="btn sec" onClick={() => scaricaPdf(filtrati)} disabled={!filtrati.length || pdfInCorso} title="PDF di quello che vedi: commessa, macchina, codice, descrizione, quantità, fase o fornitore">{pdfInCorso ? "Preparo il PDF…" : "PDF"}</button>
          {modifica && <label className="btn" aria-disabled={lavoro}>{lavoro ? "Carico…" : "Carica file SAM"}<input type="file" accept=".xlsx" hidden disabled={lavoro} onChange={(e) => { caricaFile(e.target.files?.[0]); e.target.value = ""; }} /></label>}
        </div>
      </header>
      {msg && <div className="msg" role="status">{msg}</div>}
      <div className="box" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="stati" role="tablist" aria-label="Vista">
          {([["commesse", "Per commessa"], ["elenco", "Elenco unico"], ["fornitori", "Per fornitore"], ["reparti", "Per reparto"], ["prelevati", "Prelevati"], ["assegnazioni", "Assegnazioni e colori"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={vista === k} aria-pressed={vista === k} onClick={() => { setVista(k); setAperta(""); }}>{l}</button>)}
        </div>
        <div className="row filtri" style={{ gap: 8, flexWrap: "wrap" }}>
          <Multi etichetta="Liste" tutti="Liste pronte…" largo voci={Object.entries(LISTE).map(([k, x]) => ({ v: k, l: x.l, n: base.filter(x.f).length }))} scelti={liste} cambia={setListe} />
          <Multi etichetta="Commesse" tutti="Tutte le commesse" largo scelti={filtroComm} cambia={(v) => { setFiltroComm(v); setAperta(""); }}
            voci={[...new Set(base.map((m) => m.commessa))].sort((a, b) => (montaggioComm(a) || "9999").localeCompare(montaggioComm(b) || "9999") || ordComm(b).localeCompare(ordComm(a)))
              .map((c) => ({ v: c, l: c + (clienteDi(c) ? " · " + clienteDi(c) : "") + (montaggioComm(c) ? " · mont. " + fd(montaggioComm(c)) : ""), n: base.filter((m) => m.commessa === c).length }))} />
          <Multi etichetta="Fornitori" tutti="Tutti i fornitori" largo scelti={filtroForn} cambia={setFiltroForn}
            voci={(() => { const c = new Map<string, number>(); base.forEach((m) => fornitoriDi(m).forEach((f) => c.set(f, (c.get(f) || 0) + 1))); return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([f, n]) => ({ v: f, l: f, n })); })()} />
          <Multi etichetta="Fasi" tutti="Tutte le fasi" largo scelti={filtroFase} cambia={setFiltroFase}
            voci={(() => { const c = new Map<string, number>(); let senza = 0; base.forEach((m) => { const l = faseDi(m)?.lav; if (l) c.set(l, (c.get(l) || 0) + 1); else senza++; }); return [...[...c.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([v, n]) => ({ v, l: v, n })), { v: "-", l: "— senza fase in corso", n: senza }]; })()} />
          <Multi etichetta="Seguiti da" tutti="Seguiti da tutti" scelti={filtroPers} cambia={setFiltroPers}
            voci={[...persone.map((p) => ({ v: p.id, l: p.nome, n: base.filter((m) => personaDi(m) === p.id).length })), { v: "-", l: "— nessuno", n: base.filter((m) => !personaDi(m)).length }]} />
          {filtroAttivo && <button type="button" className="btn sec" onClick={() => { setQ(""); setFiltroStato([]); setSoloRitardi(false); setSoloRipetuti(false); setFiltroComm([]); setFiltroForn([]); setFiltroPers([]); setListe([]); setFiltroFase([]); }}>Togli filtri</button>}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input type="search" placeholder="Cerca codice, descrizione, fornitore, OA, nota…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 260px" }} aria-label="Cerca" />
          <Multi etichetta="Stati" tutti="Tutti gli stati" scelti={filtroStato} cambia={setFiltroStato} voci={STATI.map(([k, l]) => ({ v: k, l, n: base.filter((m) => stDi(m) === k).length }))} />
          <label className="ck"><input type="checkbox" checked={soloRitardi} onChange={(e) => setSoloRitardi(e.target.checked)} /> Solo in ritardo</label>
          <label className="ck" title="Codici mancanti su più righe della stessa commessa o su più commesse"><input type="checkbox" checked={soloRipetuti} onChange={(e) => setSoloRipetuti(e.target.checked)} /> Solo codici ripetuti</label>
          <label className="ck"><input type="checkbox" checked={nascoste} onChange={(e) => setNascoste(e.target.checked)} /> Anche commesse fuori dal Piano produzione</label>
        </div>
        <div className="row ordina" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }} aria-label="Ordinamento">
          <span className="nota">Ordina per</span>
          {[...ordine, ""].slice(0, 6).map((k, i) => (
            <span key={i} className="row" style={{ gap: 6, alignItems: "center" }}>
              {i > 0 && <span className="nota" aria-hidden>→</span>}
              <select className={k ? "on" : ""} value={k} aria-label={i ? `Poi per (livello ${i + 1})` : "Ordina per"} onChange={(e) => setOrdine([...ordine.slice(0, i), ...(e.target.value ? [e.target.value] : [])])}>
                <option value="">{i ? "poi per…" : "ordine predefinito"}</option>
                {Object.entries(CHIAVI).filter(([x]) => x === k || !ordine.includes(x)).map(([x, c]) => <option key={x} value={x}>{c.l}</option>)}
              </select>
            </span>
          ))}
          {ordine.length > 0 && <button type="button" className="btn sec" onClick={() => setOrdine([])}>Ordine predefinito</button>}
          <span className="nota">vale per le tabelle, l&apos;Excel e il PDF{vista === "commesse" ? " (dentro ogni commessa e macchina; «Elenco unico» per una tabella sola)" : ""}</span>
        </div>
        <div className="leg">{STATI.map(([k, l, d]) => <span key={k} title={d}><i className={"b-" + k} />{l}</span>)}<span><i className="b-rit" />in ritardo: data passata o dopo l&apos;inizio montaggio</span></div>
        {Object.keys(colori).length > 0 && <div className="leg">{colori.giacenti && <span><i style={{ background: colori.giacenti }} />giacenti disponibili</span>}{persone.filter((p) => colori[p.id]).map((p) => <span key={p.id}><i style={{ background: colori[p.id] }} />{p.nome}</span>)}</div>}
      </div>
      {carico ? <p className="nota">Carico i mancanti…</p> : corpo}
    </div>
  );
}
