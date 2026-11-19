// Elenco mancanti in PDF (A4 orizzontale): commessa, macchina, codice, descrizione, quantità, fase o fornitore
type JsPDF = new (o: object) => any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type RigaPdf = { commessa: string; cliente: string; macchina: string; macchinaDescr: string; codice: string; descr: string; qta: string; dove: string; dettaglio: string; rosso?: boolean };

const BLU = "#1f3a5f", GRIGIO = "#666666";

export function pdfMancanti(jsPDF: JsPDF, righe: RigaPdf[], o: { titolo: string; filtri: string; logo?: string }) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const X = 10, R = 287, FONDO = 200;
  // colonne: larghezze in mm (totale 277)
  const C = [
    { t: "Commessa", w: 32 },
    { t: "Macchina", w: 50 },
    { t: "Codice", w: 30 },
    { t: "Descrizione", w: 70 },
    { t: "Q.tà", w: 14, dx: true },
    { t: "Fase / fornitore", w: 81 },
  ];
  const txt = (s: unknown, x: number, y: number, op: { b?: boolean; sz?: number; c?: string; al?: string } = {}) => {
    doc.setFont("helvetica", op.b ? "bold" : "normal"); doc.setFontSize(op.sz || 8); doc.setTextColor(op.c || "#1b1b1b");
    doc.text(String(s ?? ""), x, y, { align: op.al || "left" });
  };
  const oggi = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date());
  let y = 0;
  const intestazioneTabella = () => {
    doc.setFillColor("#e1ecf4"); doc.rect(X, y - 4, R - X, 6, "F");
    let x = X;
    for (const c of C) { txt(c.t.toUpperCase(), c.dx ? x + c.w - 1.5 : x + 1.5, y, { b: true, sz: 7.5, c: BLU, al: c.dx ? "right" : "left" }); x += c.w; }
    y += 5;
  };
  const testata = () => {
    if (o.logo) { try { const p = doc.getImageProperties(o.logo), h = 11, w = Math.min(36, h * p.width / p.height); doc.addImage(o.logo, "PNG", X, 7, w, w * p.height / p.width); } catch { /* senza logo */ } }
    txt("MANCANTI MONTAGGI", R, 11, { b: true, sz: 13, al: "right" });
    txt(o.titolo, R, 16.5, { sz: 9, al: "right", c: "#444444" });
    doc.setDrawColor(BLU); doc.setLineWidth(0.6); doc.line(X, 20, R, 20);
    y = 26;
    if (o.filtri && doc.getNumberOfPages() === 1) { txt("Filtri: " + o.filtri, X, y, { sz: 7.5, c: GRIGIO }); y += 6; }
    intestazioneTabella();
  };
  testata();

  let prima = "", primaMacc = "";
  doc.setLineWidth(0.15);
  const disegna = (r: RigaPdf, i: number): void => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    // commessa e macchina si scrivono solo quando cambiano (e in cima a ogni pagina)
    const nuovaComm = r.commessa !== prima, nuovaMacc = nuovaComm || r.macchina !== primaMacc;
    const celle = [
      nuovaComm ? [r.commessa, r.cliente] : [],
      nuovaMacc ? [r.macchina, r.macchinaDescr] : [],
      [r.codice],
      [r.descr],
      [r.qta],
      [r.dove, r.dettaglio],
    ].map((parti, k) => parti.filter(Boolean).flatMap((p, j) => {
      doc.setFontSize(j ? 7 : 8);
      return (doc.splitTextToSize(String(p), C[k].w - 3) as string[]).map((l) => ({ l, piccolo: j > 0 }));
    }));
    const h = Math.max(...celle.map((L) => L.reduce((t, x) => t + (x.piccolo ? 3.1 : 3.5), 0))) + 2.2;
    if (y + h > FONDO) {
      doc.addPage(); testata(); prima = ""; primaMacc = "";
      return disegna(r, i);
    }
    // stacco tra una commessa e l'altra
    if (prima && nuovaComm) { doc.setDrawColor(BLU); doc.setLineWidth(0.4); doc.line(X, y - 3.4, R, y - 3.4); doc.setLineWidth(0.15); }
    if (i % 2) { doc.setFillColor("#f4f6f8"); doc.rect(X, y - 3.4, R - X, h, "F"); }
    let x = X;
    celle.forEach((L, k) => {
      let yy = y;
      const c = C[k];
      L.forEach((x2) => {
        txt(x2.l, c.dx ? x + c.w - 1.5 : x + 1.5, yy, { sz: x2.piccolo ? 7 : 8, c: x2.piccolo ? GRIGIO : k === 5 && r.rosso ? "#a3352b" : "#1b1b1b", al: c.dx ? "right" : "left", b: k === 2 });
        yy += x2.piccolo ? 3.1 : 3.5;
      });
      x += c.w;
    });
    doc.setDrawColor("#d5dbe1"); doc.line(X, y - 3.4 + h, R, y - 3.4 + h);
    y += h;
    prima = r.commessa; primaMacc = r.macchina;
  };
  righe.forEach((r, i) => disegna(r, i));
  if (!righe.length) txt("Nessun mancante con questi filtri.", X, y + 2, { sz: 9, c: GRIGIO });

  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    txt(`${righe.length} righe · stampato il ${oggi}`, X, 205, { sz: 7, c: GRIGIO });
    txt(`Pagina ${p} di ${n}`, R, 205, { sz: 7, c: GRIGIO, al: "right" });
  }
  return doc;
}
