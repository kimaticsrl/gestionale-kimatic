// Note spese nel «Da fatturare» dei Rapporti d'intervento: totali per trasferta, righe per l'Excel e PDF
import type { SupabaseClient } from "@supabase/supabase-js";
import { MEZZI } from "@/moduli/rapporti/addebito";
import { daRimborsare, giornoCambio, inEuro, leggiCambio, nomeCat, nomeMetodo, nomeStato, totali, valuteDi, type Cambio, type Nota, type Rap } from "./calcolo";

export type RigaNS = {
  nota: string; stato: string; autore: string; data: string; categoria: string; esercente: string; mezzo: string;
  metodo: string; rimborsare: boolean; importo: number; valuta: string; tasso: number | null; euro: number | null; fatt: boolean; note: string;
};
export type NSRapporto = {
  note: { id: string; numero: string; stato: string; autore: string }[];
  daChiudere: number;        // note ancora in compilazione (non contate)
  daVerificare: number;
  n: number; euro: number; rimborsare: number; fatturabile: number;
  perValuta: { valuta: string; totale: number }[];
  senzaCambio: string[];
  cambio: { data: string; data_bce: string; provvisorio: boolean } | null;
  righe: RigaNS[];
};

/** Per ogni rapporto: note spese chiuse o verificate, convertite in € al cambio BCE del giorno della firma. */
export async function noteSpesePerRapporti(sb: SupabaseClient): Promise<Record<string, NSRapporto>> {
  const [{ data: note, error }, { data: rap }] = await Promise.all([
    sb.from("note_spese").select("*").order("numero"),
    sb.rpc("rapporti_per_note"),
  ]);
  if (error || !note) return {};
  const R = Object.fromEntries(((rap ?? []) as Rap[]).map((r) => [r.id, r]));
  const perRap = new Map<string, Nota[]>();
  for (const n of note as Nota[]) perRap.set(n.rapporto_id, [...(perRap.get(n.rapporto_id) || []), n]);
  const out: Record<string, NSRapporto> = {};
  const cache = new Map<string, Promise<Cambio>>();
  await Promise.all([...perRap.entries()].map(async ([rid, L]) => {
    const valide = L.filter((n) => n.stato !== "bozza");
    const spese = valide.flatMap((n) => (n.dati.spese || []).map((s) => ({ s, n })));
    const g = giornoCambio(R[rid]);
    const valute = valuteDi(spese.map((x) => x.s)).filter((v) => v !== "EUR");
    let c: Cambio | null = null;
    if (valute.length) {
      const k = g.data + "|" + valute.join(",");
      if (!cache.has(k)) cache.set(k, leggiCambio(g.data, valute, g.provvisorio));
      c = await cache.get(k)!;
    }
    const t = totali(spese.map((x) => x.s), c);
    out[rid] = {
      note: L.map((n) => ({ id: n.id, numero: n.numero, stato: nomeStato(n.stato), autore: n.dati.autore || "" })),
      daChiudere: L.filter((n) => n.stato === "bozza").length,
      daVerificare: L.filter((n) => n.stato === "chiusa").length,
      n: t.n, euro: t.euro, rimborsare: t.rimborsare, fatturabile: t.fatturabile,
      perValuta: t.perValuta.map((v) => ({ valuta: v.valuta, totale: v.totale })), senzaCambio: t.senzaCambio,
      cambio: c ? { data: c.data, data_bce: c.data_bce, provvisorio: c.provvisorio } : null,
      righe: spese.map(({ s, n }) => ({
        nota: n.numero, stato: nomeStato(n.stato), autore: n.dati.autore || "", data: s.data, categoria: nomeCat(s.cat), esercente: s.esercente || "",
        mezzo: s.mezzo === "altro" ? s.mezzoAltro || "Altro" : s.mezzo ? `${MEZZI.find((m) => m.targa === s.mezzo)?.nome || ""} ${s.mezzo}`.trim() : "",
        metodo: nomeMetodo(s.metodo, n.dati.carta), rimborsare: daRimborsare(s), importo: s.importo, valuta: s.valuta || "EUR",
        tasso: (s.valuta || "EUR") === "EUR" ? 1 : c?.tassi[s.valuta] ?? null, euro: inEuro(s, c), fatt: !!s.fatt, note: s.note || "",
      })),
    };
  }));
  return out;
}

/** PDF di tutte le note spese (chiuse o verificate) di un rapporto, una dopo l'altra in un solo file. */
export async function pdfNoteSpeseRapporto(sb: SupabaseClient, rid: string): Promise<{ blob: Blob; nome: string } | null> {
  const [{ data: note }, { data: rap }, { jsPDF }, { pdfNotaSpese }] = await Promise.all([
    sb.from("note_spese").select("*").eq("rapporto_id", rid).neq("stato", "bozza").order("numero"),
    sb.rpc("rapporti_per_note"),
    import("jspdf"), import("./pdf"),
  ]);
  const L = (note ?? []) as Nota[];
  if (!L.length) return null;
  const r = ((rap ?? []) as Rap[]).find((x) => x.id === rid) || null;
  const g = giornoCambio(r);
  const c = await leggiCambio(g.data, valuteDi(L.flatMap((n) => n.dati.spese || [])), g.provvisorio);
  const logo = await fetch("/logo/kimatic").then((x) => x.blob()).then(aDataUrl).catch(() => "");
  const { PDFDocument } = await import("pdf-lib").catch(() => ({ PDFDocument: null as null }));
  const pdfs: Uint8Array[] = [];
  for (const n of L) {
    const immagini: Record<string, string> = {};
    for (const p of (n.dati.spese || []).flatMap((s) => s.foto || [])) {
      const { data } = await sb.storage.from("note-spese").download(p);
      if (data && data.type.startsWith("image/")) immagini[p] = await aDataUrl(data);
    }
    pdfs.push(new Uint8Array(pdfNotaSpese(jsPDF, n, r, c, { logo, immagini }).output("arraybuffer")));
  }
  const nome = `Note spese ${r?.numero || ""} ${r?.cliente || ""}`.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() + ".pdf";
  if (pdfs.length === 1 || !PDFDocument) return { blob: new Blob([pdfs[0] as BlobPart], { type: "application/pdf" }), nome };
  const tutto = await PDFDocument.create();
  for (const b of pdfs) { const d = await PDFDocument.load(b); (await tutto.copyPages(d, d.getPageIndices())).forEach((p) => tutto.addPage(p)); }
  return { blob: new Blob([(await tutto.save()) as BlobPart], { type: "application/pdf" }), nome };
}

function aDataUrl(b: Blob) {
  return new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(b); });
}
