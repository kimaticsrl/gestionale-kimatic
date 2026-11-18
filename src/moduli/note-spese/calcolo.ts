// Note spese: tipi, liste e conti (usati dal modulo, dal PDF e dal «Da fatturare» dei rapporti)

export type Metodo = "aziendale" | "personale" | "contanti";
export type Spesa = {
  id: string;
  data: string;          // AAAA-MM-GG
  cat: string;
  esercente?: string;
  importo: number;       // nella valuta della spesa, IVA inclusa
  valuta: string;        // EUR, USD, CHF…
  metodo: Metodo;
  mezzo?: string;        // targa (carburante); "altro" = mezzoAltro
  mezzoAltro?: string;
  fatt?: boolean;        // da addebitare al cliente
  note?: string;
  foto?: string[];       // percorsi nell'archivio «note-spese»
};
export type DatiNota = {
  titolo?: string; note?: string; spese?: Spesa[];
  carta?: string; autore?: string;
  chiusa_il?: string; chiusa_da?: string; verificata_il?: string; verificata_da?: string; rimandata?: string;
};
export type Nota = { id: string; numero: string; anno: number; rapporto_id: string; stato: "bozza" | "chiusa" | "verificata"; dati: DatiNota; creato_da: string; creato_il: string; aggiornato_il: string };
export type Rap = { id: string; numero: string; cliente: string | null; dal: string | null; al: string | null; firma_ts: string | null; tecnici: string | null };
export type Cambio = { data: string; data_bce: string; tassi: Record<string, number>; provvisorio: boolean; mancano?: string[] };

export const CATEGORIE: { id: string; nome: string; fatt: boolean }[] = [
  { id: "ristorante", nome: "Ristorante / pasti", fatt: false },
  { id: "albergo", nome: "Albergo", fatt: false },
  { id: "carburante", nome: "Carburante", fatt: true },
  { id: "pedaggi", nome: "Pedaggi autostradali", fatt: true },
  { id: "parcheggio", nome: "Parcheggio", fatt: true },
  { id: "viaggio", nome: "Treno / aereo / traghetto", fatt: true },
  { id: "taxi", nome: "Taxi / mezzi pubblici", fatt: true },
  { id: "noleggio", nome: "Noleggio auto", fatt: true },
  { id: "materiale", nome: "Materiale / acquisti", fatt: true },
  { id: "altro", nome: "Altro", fatt: false },
];
export const nomeCat = (id: string) => CATEGORIE.find((c) => c.id === id)?.nome || id || "—";

export const VALUTE = ["EUR", "USD", "GBP", "CHF", "PLN", "CZK", "HUF", "RON", "BGN", "SEK", "NOK", "DKK", "TRY", "CNY", "JPY", "INR", "BRL", "MXN", "CAD", "AUD", "ZAR", "THB", "KRW", "ILS", "IDR", "MYR", "PHP", "SGD", "HKD", "NZD", "ISK"];

export const METODI: [Metodo, string][] = [["aziendale", "Carta aziendale"], ["personale", "Carta personale"], ["contanti", "Contanti"]];
export const nomeMetodo = (m: string, carta?: string) => m === "aziendale" ? "Carta aziendale" + (carta ? " ••" + carta : "") : METODI.find((x) => x[0] === m)?.[1] || m;
export const daRimborsare = (s: Spesa) => s.metodo !== "aziendale";

export const STATI: [Nota["stato"], string][] = [["bozza", "Da completare"], ["chiusa", "Da verificare"], ["verificata", "Verificata"]];
export const nomeStato = (s: string) => STATI.find((x) => x[0] === s)?.[1] || s;

export const fd = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
export const num = (v: number, dec = 2) => (v || 0).toLocaleString("it-IT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
export const imp = (v: number, valuta = "EUR") => `${num(v)} ${valuta === "EUR" ? "€" : valuta}`;
export const tondo = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Importo in euro (null se manca il cambio). 1 € = tasso valuta. */
export function inEuro(s: Pick<Spesa, "importo" | "valuta">, c?: Cambio | null): number | null {
  const v = (s.valuta || "EUR").toUpperCase();
  if (v === "EUR") return s.importo || 0;
  const t = c?.tassi[v];
  return t ? tondo((s.importo || 0) / t) : null;
}

/** Giorno del cambio di una trasferta: firma del rapporto (altrimenti oggi, provvisorio). */
export function giornoCambio(r?: Pick<Rap, "firma_ts"> | null): { data: string; provvisorio: boolean } {
  const g = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(d);
  return r?.firma_ts ? { data: g(new Date(r.firma_ts)), provvisorio: false } : { data: g(new Date()), provvisorio: true };
}

export const valuteDi = (spese: Spesa[]) => [...new Set(spese.map((s) => (s.valuta || "EUR").toUpperCase()))].sort((a, b) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)));

export type Totali = {
  n: number;
  perValuta: { valuta: string; totale: number; euro: number | null; tasso: number | null }[];
  euro: number;               // somma in € (le spese senza cambio sono escluse)
  senzaCambio: string[];      // valute senza cambio
  rimborsare: number;         // in €, pagate con carta personale o contanti
  rimborsarePerValuta: { valuta: string; totale: number }[];
  fatturabile: number;        // in €
  aziendale: number;          // in €
  perCategoria: { cat: string; n: number; euro: number }[];
  perMetodo: { metodo: Metodo; n: number; euro: number }[];
};

export function totali(spese: Spesa[], c?: Cambio | null): Totali {
  const perV = new Map<string, number>(), rimbV = new Map<string, number>();
  const perC = new Map<string, { n: number; euro: number }>(), perM = new Map<Metodo, { n: number; euro: number }>();
  let euro = 0, rimborsare = 0, fatturabile = 0, aziendale = 0;
  const senza = new Set<string>();
  for (const s of spese) {
    const v = (s.valuta || "EUR").toUpperCase();
    perV.set(v, tondo((perV.get(v) || 0) + (s.importo || 0)));
    const e = inEuro(s, c);
    if (e == null) senza.add(v);
    const ee = e ?? 0;
    euro += ee;
    if (daRimborsare(s)) { rimborsare += ee; rimbV.set(v, tondo((rimbV.get(v) || 0) + (s.importo || 0))); } else aziendale += ee;
    if (s.fatt) fatturabile += ee;
    const pc = perC.get(s.cat) || { n: 0, euro: 0 }; pc.n++; pc.euro += ee; perC.set(s.cat, pc);
    const pm = perM.get(s.metodo) || { n: 0, euro: 0 }; pm.n++; pm.euro += ee; perM.set(s.metodo, pm);
  }
  const ord = (a: string, b: string) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b));
  return {
    n: spese.length,
    perValuta: [...perV.entries()].sort((a, b) => ord(a[0], b[0])).map(([valuta, totale]) => ({
      valuta, totale, tasso: valuta === "EUR" ? 1 : c?.tassi[valuta] ?? null,
      euro: valuta === "EUR" ? totale : c?.tassi[valuta] ? tondo(spese.filter((s) => (s.valuta || "EUR").toUpperCase() === valuta).reduce((t, s) => t + (inEuro(s, c) || 0), 0)) : null,
    })),
    euro: tondo(euro), senzaCambio: [...senza],
    rimborsare: tondo(rimborsare), rimborsarePerValuta: [...rimbV.entries()].sort((a, b) => ord(a[0], b[0])).map(([valuta, totale]) => ({ valuta, totale })),
    fatturabile: tondo(fatturabile), aziendale: tondo(aziendale),
    perCategoria: [...perC.entries()].map(([cat, x]) => ({ cat, n: x.n, euro: tondo(x.euro) })).sort((a, b) => b.euro - a.euro),
    perMetodo: [...perM.entries()].map(([metodo, x]) => ({ metodo, n: x.n, euro: tondo(x.euro) })),
  };
}

/** Cambi del giorno per le valute indicate (dal gestionale, con i cambi BCE salvati). */
export async function leggiCambio(data: string, valute: string[], provvisorio = false): Promise<Cambio> {
  const v = valute.filter((x) => x !== "EUR");
  if (!v.length) return { data, data_bce: data, tassi: {}, provvisorio };
  try {
    const r = await fetch(`/api/cambi?data=${data}&valute=${v.join(",")}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.errore || "errore");
    return { data: j.data, data_bce: j.data_bce, tassi: j.tassi || {}, provvisorio, mancano: j.mancano };
  } catch {
    return { data, data_bce: data, tassi: {}, provvisorio, mancano: v };
  }
}
