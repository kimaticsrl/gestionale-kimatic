// Rapporto di non conformità da inviare al fornitore (A4, italiano o inglese)
import type { NC, Fornitore } from "./NonConformita";
import { righeDi } from "./NonConformita";

const T = {
  it: {
    titolo: "RAPPORTO DI NON CONFORMITÀ", sotto: "Non conformità del materiale fornito", fornitore: "Fornitore", data: "Data rilevazione", fase: "Rilevata in",
    ddt: "DDT", ordine: "Ordine di acquisto", commessa: "Commessa", codice: "Codice / disegno", articolo: "Articolo", articoli: "Articoli non conformi", qric: "Q.tà ricevuta", qnc: "Q.tà non conforme",
    tipo: "Tipo di difetto", gravita: "Gravità", descr: "Descrizione della non conformità", foto: "Documentazione fotografica",
    tratt: "Trattamento richiesto", istr: "Istruzioni", richiesta: "Richiesta al fornitore",
    testoRich: (d: string) => `Vi chiediamo di analizzare la causa della non conformità e di comunicarci l'azione correttiva adottata${d ? " entro il " + d : ""}, citando il numero di questo rapporto.`,
    costi: "Costi sostenuti", addebito: "Importo che verrà addebitato", rif: "Rif.", stato: "Stato", aperta: "Segnalata da", pag: "Pagina",
    grav: { lieve: "Lieve", maggiore: "Maggiore", critica: "Critica – blocca la produzione" } as Record<string, string>,
  },
  en: {
    titolo: "NON-CONFORMITY REPORT", sotto: "Non-conforming supplied material", fornitore: "Supplier", data: "Detected on", fase: "Detected at",
    ddt: "Delivery note", ordine: "Purchase order", commessa: "Job", codice: "Part no. / drawing", articolo: "Item", articoli: "Non-conforming items", qric: "Qty received", qnc: "Qty non-conforming",
    tipo: "Defect type", gravita: "Severity", descr: "Description of the non-conformity", foto: "Photos",
    tratt: "Required action", istr: "Instructions", richiesta: "Request to the supplier",
    testoRich: (d: string) => `Please analyse the root cause of this non-conformity and inform us of the corrective action taken${d ? " by " + d : ""}, quoting the number of this report.`,
    costi: "Costs incurred", addebito: "Amount to be charged", rif: "Ref.", stato: "Status", aperta: "Reported by", pag: "Page",
    grav: { lieve: "Minor", maggiore: "Major", critica: "Critical – production stopped" } as Record<string, string>,
  },
};
const FASI_EN: Record<string, string> = { "Accettazione merce": "Goods-in inspection", Magazzino: "Warehouse", Lavorazione: "Machining", Montaggio: "Assembly", Collaudo: "Testing", "Presso il cliente": "At customer site" };
const TIPI_EN: Record<string, string> = {
  "Dimensionale / fuori tolleranza": "Dimensional / out of tolerance", "Materiale errato o non certificato": "Wrong or uncertified material", "Trattamento o finitura": "Treatment or finish",
  "Danneggiato nel trasporto": "Damaged in transit", "Quantità errata": "Wrong quantity", "Codice o articolo errato": "Wrong part / code", "Documentazione mancante o errata": "Missing or wrong documents",
  "Funzionale / non funziona": "Functional failure", Altro: "Other",
};
const TRATT_EN: Record<string, string> = {
  "Reso al fornitore": "Return to supplier", "Sostituzione da parte del fornitore": "Replacement by supplier", "Rilavorazione dal fornitore": "Rework by supplier",
  "Rilavorazione interna (con addebito)": "Rework by Kimatic (charged to supplier)", "Accettazione in deroga": "Accepted under concession", "Scarto / rottamazione": "Scrap",
};
const fd = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const num = (s?: string) => { const v = parseFloat(String(s ?? "").replace(",", ".")); return isFinite(v) ? v : 0; };

type JsPDF = new (o: object) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

export function pdfNC(jsPDF: JsPDF, nc: NC, o: { logo: string; immagini: string[]; lingua: "it" | "en"; aperta: string; fornitore?: Fornitore }) {
  const L = o.lingua, t = T[L], en = L === "en";
  const tr = (m: Record<string, string>, v?: string) => (en && v && m[v]) || v || "";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const X = 14, R = 196, W = R - X, FONDO = 285;
  const d = nc.dati, g = d.gestione || {};
  const txt = (s: unknown, x: number, y: number, op: { b?: boolean; sz?: number; c?: string; al?: string; mw?: number } = {}) => {
    doc.setFont("helvetica", op.b ? "bold" : "normal"); doc.setFontSize(op.sz || 9); doc.setTextColor(op.c || "#1b1b1b");
    doc.text(String(s ?? ""), x, y, { align: op.al || "left", maxWidth: op.mw });
  };
  let y = 0;
  const testata = () => {
    if (o.logo) { try { doc.addImage(o.logo, "PNG", X, 9, 38, 12); } catch { /* senza logo */ } }
    txt(t.titolo, R, 14, { b: true, sz: 14, al: "right" });
    txt(`${nc.numero}  ·  ${fd(d.data)}`, R, 20, { sz: 10, al: "right", c: "#444444" });
    doc.setDrawColor("#1f3a5f"); doc.setLineWidth(0.7); doc.line(X, 24, R, 24);
    y = 31;
  };
  const spazio = (h: number) => { if (y + h > FONDO) { doc.addPage(); testata(); } };
  const titolo = (s: string) => { spazio(14); doc.setFillColor("#e1ecf4"); doc.rect(X, y - 4.5, W, 7, "F"); txt(s.toUpperCase(), X + 2, y, { b: true, sz: 9, c: "#1f3a5f" }); y += 7; };
  const griglia = (righe: [string, string | undefined][], col = 2) => {
    const w = W / col, vis = righe.filter(([, v]) => v);
    for (let i = 0; i < vis.length; i += col) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const blocchi = vis.slice(i, i + col).map(([k, v]) => [k, doc.splitTextToSize(String(v), w - 4) as string[]] as const);
      const h = 6.4 + Math.max(...blocchi.map(([, l]) => l.length)) * 4.4;
      spazio(h);
      blocchi.forEach(([k, l], j) => { txt(k, X + j * w, y, { sz: 7.5, c: "#666666" }); l.forEach((r, m) => txt(r, X + j * w, y + 4.6 + m * 4.4, { sz: 10 })); });
      y += h;
    }
  };
  const paragrafo = (s?: string) => {
    if (!s) return;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const linee: string[] = doc.splitTextToSize(s, W);
    linee.forEach((l) => { spazio(5.5); txt(l, X, y, { sz: 10 }); y += 5; });
    y += 3;
  };

  testata();
  txt(t.sotto, X, y, { sz: 9, c: "#666666" }); y += 7;
  const fo = o.fornitore?.dati || {};
  const indForn = [fo.indirizzo, [fo.citta, fo.provincia && `(${fo.provincia})`].filter(Boolean).join(" "), fo.piva && (en ? "VAT " : "P.IVA ") + fo.piva].filter(Boolean).join(" – ");
  griglia([[t.fornitore, [d.fornitore, indForn].filter(Boolean).join("\n")], [t.data, fd(d.data)]]);
  griglia([[t.ddt, [d.ddt, fd(d.ddt_data)].filter(Boolean).join(" – ")], [t.ordine, d.ordine], [t.commessa, d.commessa], [t.fase, tr(FASI_EN, d.fase)]], 4);
  titolo(t.articoli);
  // tabella degli articoli non conformi
  const righe = righeDi(d);
  if (righe.length) {
    const C = [{ k: t.codice, w: 44 }, { k: t.articolo, w: 82 }, { k: t.qric, w: 28, n: 1 }, { k: t.qnc, w: 28, n: 1 }];
    spazio(14);
    doc.setFillColor("#1f3a5f"); doc.rect(X, y - 4.2, W, 6.4, "F");
    let x = X; C.forEach((c) => { txt(c.k, c.n ? x + c.w - 2 : x + 2, y, { b: true, sz: 8, c: "#ffffff", al: c.n ? "right" : "left" }); x += c.w; });
    y += 6.4;
    righe.forEach((r, i) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
      const desc: string[] = doc.splitTextToSize(r.descrizione || "", C[1].w - 4), h = Math.max(1, desc.length) * 4.4 + 2.4;
      spazio(h + 2);
      if (i % 2) { doc.setFillColor("#f3f5f7"); doc.rect(X, y - 4.2, W, h, "F"); }
      txt(r.codice, X + 2, y, { sz: 9.5 }); desc.forEach((l, m) => txt(l, X + C[0].w + 2, y + m * 4.4, { sz: 9.5 }));
      txt(r.q_ricevuta ? `${r.q_ricevuta} ${r.um || ""}` : "", X + C[0].w + C[1].w + C[2].w - 2, y, { sz: 9.5, al: "right" });
      txt(r.q_nc ? `${r.q_nc} ${r.um || ""}` : "", R - 2, y, { sz: 9.5, al: "right", b: true });
      y += h;
    });
    y += 5;
  }
  griglia([[t.tipo, tr(TIPI_EN, d.tipo)], [t.gravita, t.grav[d.gravita || ""] || d.gravita]]);
  titolo(t.descr);
  paragrafo(d.descrizione);

  if (o.immagini.length) {
    titolo(t.foto);
    const lato = (W - 12) / 3, alt = 46; // tre foto per riga
    o.immagini.forEach((img, i) => {
      if (i % 3 === 0) spazio(alt + 4);
      const x = X + (i % 3) * (lato + 6);
      try {
        const p = doc.getImageProperties(img), k = Math.min(lato / p.width, alt / p.height);
        doc.addImage(img, img.startsWith("data:image/png") ? "PNG" : "JPEG", x + (lato - p.width * k) / 2, y, p.width * k, p.height * k);
      } catch { /* immagine non leggibile */ }
      if (i % 3 === 2 || i === o.immagini.length - 1) y += alt + 4;
    });
  }

  if (g.trattamento || g.istruzioni) {
    titolo(t.tratt);
    griglia([[t.tratt, tr(TRATT_EN, g.trattamento)]], 1);
    if (g.istruzioni) { txt(t.istr, X, y, { sz: 7.5, c: "#666666" }); y += 4.6; paragrafo(g.istruzioni); }
  }
  const addebito = num(g.addebito);
  if (addebito) {
    titolo(t.costi);
    griglia([[t.addebito, addebito.toLocaleString(en ? "en-GB" : "it-IT", { style: "currency", currency: "EUR" })], [t.rif, g.nota_credito]]);
  }
  spazio(28); // titolo, testo e firma restano insieme
  titolo(t.richiesta);
  paragrafo(t.testoRich(fd(g.scadenza_risposta)));
  txt(`${t.aperta}: ${o.aperta || "—"}`, X, y + 1, { sz: 8.5, c: "#555555" });

  const tot = doc.getNumberOfPages();
  for (let p = 1; p <= tot; p++) {
    doc.setPage(p);
    txt("Kimatic S.r.l. · Via G. Matteotti 26, 40057 Cadriano di Granarolo dell'Emilia (BO) · P.IVA 03286631209", X, 290, { sz: 7, c: "#888888" });
    txt(`${t.pag} ${p}/${tot}`, R, 290, { sz: 7, c: "#888888", al: "right" });
  }
  return doc;
}
