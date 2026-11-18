// Mancanti montaggi: dalle righe di SAM alle righe del gestionale (una per commessa|matricola|OP|codice)

export type Ordine = { num: string; fornitore: string; consegna: string | null; qta: number | null; tipo: string };
export type RigaImport = {
  commessa: string; matricola: string; macchina: string; op: string; op_descr: string; op_num: string;
  codice: string; descr: string; qta: number | null; giac_mp: number | null; giac_mg: number | null; giac_grezzi: number | null;
  fornitore: string; cella: string; cdep: string; ultima_lav: string; ordini: Ordine[]; consegna: string | null;
};

const t = (v: unknown) => { const x = v == null ? "" : String(v).trim(); return /^\(vuoto\)$/i.test(x) ? "" : x; };
const nr = (v: unknown) => { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".")); return isFinite(n) ? n : null; };
const anno = (num: unknown, a: unknown) => (t(num) ? `${t(num)}${t(a) ? "/" + t(a) : ""}` : "");
// date di SAM: «2025-09-03T00:00:00», Date, numero seriale Excel; 1899-12-30 = nessuna data
function data(v: unknown): string | null {
  if (v == null || v === "") return null;
  let s: string;
  if (v instanceof Date) s = v.toISOString().slice(0, 10);
  else if (typeof v === "number") s = new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  else { s = t(v).slice(0, 10); if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) s = `${s.slice(6)}-${s.slice(3, 5)}-${s.slice(0, 2)}`; }
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && s > "1900-01-01" ? s : null;
}

function unisci(L: RigaImport[]): RigaImport[] {
  const m = new Map<string, RigaImport>();
  for (const r of L) {
    if (!r.commessa || !r.codice) continue;
    const k = [r.commessa, r.matricola, r.op, r.codice].join("|");
    const x = m.get(k);
    if (!x) { m.set(k, { ...r, ordini: [...r.ordini] }); continue; }
    for (const o of r.ordini) if (!x.ordini.some((y) => y.num === o.num)) x.ordini.push(o);
    if (!x.fornitore && r.fornitore) x.fornitore = r.fornitore;
  }
  for (const r of m.values()) {
    r.ordini.sort((a, b) => (a.consegna || "9999").localeCompare(b.consegna || "9999"));
    r.consegna = r.ordini.find((o) => o.consegna)?.consegna ?? r.consegna;
    if (!r.fornitore) r.fornitore = r.ordini[0]?.fornitore || "";
  }
  return [...m.values()];
}

/** Righe della vista SAM EXT_KIMATIC_MATERIALI_DA_PRELEVARE (colonne con i nomi della vista). */
export function daVista(righe: Record<string, unknown>[]): RigaImport[] {
  return unisci(righe.map((r) => {
    const g = (k: string) => r[k] ?? r[k.toUpperCase()] ?? r[k.toLowerCase()];
    const num = t(g("Num_Ordine"));
    const ordine: Ordine | null = num ? { num: anno(num, g("Anno_Ordine")), fornitore: t(g("Fornitore")), consegna: data(g("Data_Consegna_Ordine")), qta: nr(g("QTA_Ordine")), tipo: t(g("Tipo_Ordine")) } : null;
    return {
      commessa: anno(g("NUM_OV"), g("ANNO_OV")), matricola: t(g("Articolo_OV")), macchina: t(g("Descr_Articolo_OV")),
      op: t(g("Articolo_OP")), op_descr: t(g("Descr_Articolo_OP")), op_num: anno(g("NUM_OP"), g("ANNO_OP")),
      codice: t(g("Componente")), descr: t(g("Descr_Componente")), qta: nr(g("QTA_RES_Da_Prel")),
      giac_mp: nr(g("GIACENZA_COMP")), giac_mg: null, giac_grezzi: nr(g("GIACENZA_GREZZI")),
      fornitore: t(g("Fornitore")), cella: "", cdep: "", ultima_lav: "", ordini: ordine ? [ordine] : [], consegna: ordine?.consegna ?? null,
    };
  }));
}

/** Estrazione Excel dei mancanti (CODICE MACCHINA, COMMESSA, CODICE OP, CODICE ARTICOLO, Q.tà, Giac MP+MV…). */
export function daEstrazione(righe: Record<string, unknown>[]): RigaImport[] {
  return unisci(righe.map((r) => {
    const g = (...k: string[]) => { for (const x of k) { const v = r[x]; if (v != null && v !== "") return v; } return null; };
    return {
      commessa: t(g("COMMESSA")), matricola: t(g("CODICE MACCHINA")), macchina: t(g("DESCRIZIONE MACCHINA")),
      op: t(g("CODICE OP")), op_descr: t(g("DESCRIZIONE OP")), op_num: "",
      codice: t(g("CODICE ARTICOLO")), descr: t(g("DESCRIZIONE ARTICOLO")), qta: nr(g("Q.TÀ", "Q.TA", "QTA")),
      giac_mp: nr(g("GIAC MP+MV")), giac_mg: nr(g("GIAC MG")), giac_grezzi: null,
      fornitore: t(g("FORNITORE OP")), cella: t(g("CELLA LAV DISPONIBILE")), cdep: t(g("IN C/DEP PRESSO")), ultima_lav: t(g("ULTIMA LAV CHIUSA")),
      ordini: [], consegna: null,
    };
  }));
}

/** Vista SAM KI_ANALISI_COMMESSE_MANCANTI (quella del file Mancanti_2025): celle, ultima lavorazione chiusa, conto deposito.
 *  L'ultima lavorazione chiusa si tiene solo se è della cella in cui il pezzo si trova adesso. */
export function daCelle(righe: Record<string, unknown>[]): RigaImport[] {
  return daEstrazione(righe.map((r) => {
    const cella = t(r["CELLA LAV DISPONIBILE"]), chiusa = t(r["CELLA_LAV_CHIUSA"]);
    return {
      ...r,
      "Q.TA": r["QTA RES DA PRELEVARE"] ?? r["Q.TA"],
      "GIAC MP+MV": r["GIACENZA MAG PRINC E VERTICALI"] ?? r["GIAC MP+MV"],
      "FORNITORE OP": r["FORNITORE"] ?? r["FORNITORE OP"],
      "ULTIMA LAV CHIUSA": !chiusa || !cella || chiusa === cella ? r["ULTIMA LAV CHIUSA"] : "",
    };
  }));
}

/** Righe con intestazione (già lette da Excel o CSV): riconosce da solo il formato. */
export function daTabella(intestazione: string[], righe: unknown[][]): RigaImport[] {
  const H = intestazione.map((h) => t(h));
  const vista = H.includes("Componente") || H.includes("COMPONENTE");
  const celle = H.some((h) => /^(CELLA_LAV_CHIUSA|QTA RES DA PRELEVARE)$/i.test(h));
  const oggetti = righe.map((r) => Object.fromEntries(H.map((h, i) => [vista ? h : h.toUpperCase(), r[i]])));
  return vista ? daVista(oggetti) : celle ? daCelle(oggetti) : daEstrazione(oggetti);
}

/** OP di SAM con le loro fasi (vista sA1.CS_OP_FASI_LAVORAZIONI, una riga per fase). */
export type Fase = { seq: number | null; lav: string; cella: string; stato: string; scad: string | null };
export type OpSam = { codice: string; op: string; commessa: string; stato: string; qta: number | null; prod: number | null; fasi: Fase[] };
export function daOp(righe: Record<string, unknown>[]): OpSam[] {
  const m = new Map<string, OpSam>();
  for (const r of righe) {
    const g = (k: string) => r[k] ?? r[k.toUpperCase()] ?? r[k.toLowerCase()];
    const codice = t(g("CodArtOP")), op = anno(g("NumOP"), g("AnnoOP"));
    if (!codice || !op) continue;
    const k = codice + "|" + op;
    let x = m.get(k);
    if (!x) { x = { codice, op, commessa: anno(g("NumComm"), g("AnnoComm")), stato: t(g("StatoOP")), qta: nr(g("QtaOrdine")), prod: nr(g("QtaProd")), fasi: [] }; m.set(k, x); }
    const seq = nr(g("SeqFaf")), lav = t(g("DesLav"));
    if ((seq != null || lav) && !x.fasi.some((f) => f.seq === seq && f.lav === lav))
      x.fasi.push({ seq, lav, cella: t(g("DesCella")), stato: t(g("StatoFase")), scad: data(g("DataScaFas")) });
  }
  for (const x of m.values()) x.fasi.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return [...m.values()];
}
