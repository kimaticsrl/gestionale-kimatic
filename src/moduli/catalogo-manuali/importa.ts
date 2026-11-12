// Importazione di una cartella di manuali (es. «MANUALI IN VIGORE») nel Catalogo manuali.
// Dal nome di ogni PDF ricava macchina (cartella), lingua e revisione:
//   AMW/AMW-FR_rev04.pdf · COMPENSATORE/Compensatore_IT_rev04.pdf · ASP/ASP-IT_rev00_(05-2026).pdf
// I PDF nelle sottocartelle «Obsoleti», «REVISIONI PRECEDENTI», «z_old»… vanno nello storico.

export type FilePdf = { percorso: string; size: number; file?: File };
export type Voce = { cartella: string; documento: string; lingua: string; rev: string; data: string; percorso: string; size: number; obsoleto: boolean; file?: File };
export type Scartato = { percorso: string; motivo: string };

const OBSOLETI = /(^|\/)(obsolet[ie]?|revisioni precedenti|z_old|old|vecchi|archivio)(\/|$)/i;
const BOZZA = /(^|\/)bozz[ae]|bozza/i;
const NOME = /[-_ ]([A-Za-z]{2})[-_ ]?rev\.?[-_ ]?(\d{1,3})(?:[_ -]*\((\d{1,2})-(\d{4})\))?/i;

export const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function analizza(files: FilePdf[]) {
  const voci: Voce[] = [], scartati: Scartato[] = [];
  const visti = new Map<string, Voce>();
  for (const f of files) {
    const p = f.percorso.replace(/\\/g, "/");
    if (!/\.pdf$/i.test(p)) continue;
    const parti = p.split("/");
    // il primo livello è la cartella scelta (es. «MANUALI IN VIGORE»), il secondo la macchina
    const dentro = parti.length > 2 ? parti.slice(1) : parti;
    if (dentro.length < 2) { scartati.push({ percorso: p, motivo: "non è dentro la cartella di una macchina" }); continue; }
    const cartella = dentro[0].trim(), nome = dentro[dentro.length - 1];
    const sotto = dentro.slice(1, -1).join("/");
    if (BOZZA.test(sotto) || /bozza/i.test(nome)) { scartati.push({ percorso: p, motivo: "bozza" }); continue; }
    const m = NOME.exec(nome);
    if (!m) { scartati.push({ percorso: p, motivo: "lingua o revisione non riconosciute nel nome" }); continue; }
    // nome del documento: la parte del nome prima della lingua (es. «LW_GEFRAN», «Shuttle_Special_(763-2024)»)
    const documento = nome.slice(0, m.index).replace(/[-_ ]+$/, "").trim() || cartella;
    const v: Voce = {
      cartella, documento, lingua: m[1].toUpperCase(), rev: m[2].padStart(2, "0"), data: m[4] ? `${m[3].padStart(2, "0")} - ${m[4]}` : "",
      percorso: p, size: f.size, obsoleto: OBSOLETI.test(sotto), file: f.file,
    };
    // stesso manuale in due posti (es. una copia in una sottocartella): tiene il percorso più corto
    const k = `${slug(cartella)}|${slug(documento)}|${v.lingua}|${v.rev}`;
    const prima = visti.get(k);
    if (prima) {
      const tieni = (!v.obsoleto && prima.obsoleto) || (v.obsoleto === prima.obsoleto && v.percorso.length < prima.percorso.length) ? v : prima;
      const scarta = tieni === v ? prima : v;
      scartati.push({ percorso: scarta.percorso, motivo: "doppione di " + tieni.percorso });
      visti.set(k, tieni);
    } else visti.set(k, v);
  }
  voci.push(...visti.values());
  return { voci, scartati };
}

export type Macchina = { id: string; modello: string; categoria?: string; codice?: string; originale?: string; note?: string; lingue?: Record<string, Lingua>; aggiornato?: string };
export type Pdf = { id: string; nome: string; size: number };
export type Lingua = { rev?: string; data?: string; stato?: string; note?: string; pdf?: Pdf; storico?: { rev: string; data: string; pdf?: Pdf }[] };

// Abbina un documento a una macchina già nel catalogo: per id, per nome, per sigla tra parentesi
// («Taglia e Salda (LW)») o, se il nome ha almeno due parole, quando tutte compaiono nel modello
export function abbina(nome: string, macchine: Macchina[]) {
  const s = slug(nome), parole = s.split("-").filter(Boolean);
  return macchine.find((m) => m.id === s || slug(m.modello) === s)
    || macchine.find((m) => new RegExp(`\\(${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\s*$`, "i").test(m.modello))
    || (parole.length >= 2 ? macchine.find((m) => { const t = new Set(slug(m.modello).split("-")); return parole.every((w) => t.has(w)); }) : undefined);
}

const revN = (r?: string) => parseInt(String(r ?? "").replace(/\D/g, ""), 10);

// Piano: per ogni macchina, quale PDF diventa quello in vigore e quali vanno nello storico
// Ogni cartella è una macchina; se dentro ci sono documenti diversi (es. «LW» e «LW_GEFRAN», o le
// versioni speciali per una commessa), il documento principale è quello con più PDF in vigore e gli
// altri diventano voci a sé («LW – GEFRAN»).
export function piano(voci: Voce[], macchine: Macchina[]) {
  const perCartella = new Map<string, Voce[]>();
  voci.forEach((v) => perCartella.set(v.cartella, [...(perCartella.get(v.cartella) || []), v]));
  const gruppi: { nome: string; principale: boolean; cartella: string; L: Voce[] }[] = [];
  for (const [cartella, L] of perCartella) {
    const docs = new Map<string, Voce[]>();
    L.forEach((v) => { const k = slug(v.documento); docs.set(k, [...(docs.get(k) || []), v]); });
    const ordine = [...docs.entries()].sort((a, b) => b[1].filter((v) => !v.obsoleto).length - a[1].filter((v) => !v.obsoleto).length || a[0].length - b[0].length);
    ordine.forEach(([, Ld], i) => {
      if (!Ld.some((v) => !v.obsoleto) && i > 0) { gruppi.find((g) => g.cartella === cartella && g.principale)?.L.push(...Ld.map((v) => ({ ...v, obsoleto: true }))); return; }
      const bello = Ld[0].documento.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
      gruppi.push({ nome: i === 0 ? cartella : `${cartella} – ${bello}`, principale: i === 0, cartella, L: [...Ld] });
    });
  }
  // le macchine del catalogo già abbinate a una cartella non si abbinano anche ai documenti speciali
  const usate = new Set(gruppi.filter((g) => g.principale).map((g) => abbina(g.cartella, macchine)?.id).filter(Boolean));
  return gruppi.sort((a, b) => a.nome.localeCompare(b.nome)).map(({ nome, principale, cartella, L }) => {
    let esistente = principale ? abbina(cartella, macchine) : undefined;
    if (!principale) {
      const doc = L[0].documento.replace(/[_]+/g, " "), c = abbina(doc, macchine);
      if (c && !usate.has(c.id) && slug(doc).split("-").length >= 2) esistente = c;
    }
    const lingue = [...new Set(L.map((v) => v.lingua))].sort();
    const perLingua = lingue.map((lingua) => {
      const tutte = L.filter((v) => v.lingua === lingua).sort((a, b) => revN(b.rev) - revN(a.rev) || Number(a.obsoleto) - Number(b.obsoleto));
      const attuali = tutte.filter((v) => !v.obsoleto);
      const vigore = attuali[0] || null; // se ci sono solo obsoleti, nessun PDF «in vigore»
      const storico = tutte.filter((v) => v !== vigore);
      const gia = esistente?.lingue?.[lingua];
      const giaCaricato = !!(vigore && gia?.pdf && revN(gia.rev) === revN(vigore.rev));
      return { lingua, vigore, storico, giaCaricato };
    });
    return { cartella: nome, esistente, perLingua };
  });
}
