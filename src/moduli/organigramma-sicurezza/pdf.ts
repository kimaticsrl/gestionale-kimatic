// PDF dell'Organigramma della sicurezza (A4 verticale), disegnato con jsPDF.
import type { jsPDF as JsPDF } from "jspdf";

export type Persona = { nome: string; note: string };
export type Scheda = { ruolo: string; persone: Persona[] };
export type Livello = { tipo: "autorita" | "supporto" | "linea" | "emergenza"; schede: Scheda[] };
export type Gruppo = { reparto: string; persone: string[] };

const COLORI: Record<string, { bordo: [number, number, number]; sfondo: [number, number, number] }> = {
  autorita: { bordo: [43, 76, 92], sfondo: [228, 235, 238] },
  supporto: { bordo: [92, 107, 76], sfondo: [235, 238, 227] },
  linea: { bordo: [61, 106, 128], sfondo: [225, 234, 238] },
  emergenza: { bordo: [168, 90, 46], sfondo: [244, 231, 219] },
  base: { bordo: [89, 84, 74], sfondo: [238, 236, 229] },
};

export function pdfOrganigramma(jsPDF: typeof JsPDF, livelli: Livello[], gruppi: Gruppo[], data: string, logo?: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14, LARGO = W - 2 * M, GAP = 5, FILO = 6;
  const linea = (y1: number, y2: number) => { doc.setDrawColor(170, 166, 156); doc.setLineWidth(0.3); doc.line(W / 2, y1, W / 2, y2); };

  // intestazione
  let y = M;
  if (logo) {
    try {
      // proporzioni originali del logo: al massimo 40 × 13 mm
      const { width, height } = doc.getImageProperties(logo);
      const k = Math.min(40 / width, 13 / height);
      doc.addImage(logo, "PNG", M, y - 3, width * k, height * k);
    } catch { /* logo facoltativo */ }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(34, 38, 42);
  doc.text("Organigramma della sicurezza sul lavoro", W - M, y + 3, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(107, 111, 114);
  doc.text(`Ruoli e responsabilità ai sensi del D.Lgs. 81/08 · aggiornato al ${data}`, W - M, y + 8, { align: "right" });
  doc.setDrawColor(194, 65, 12); doc.setLineWidth(0.8); doc.line(M, y + 12, W - M, y + 12);
  y += 20;

  // una scheda: ruolo in piccolo maiuscolo, poi i nomi
  const misura = (s: Scheda, w: number) => {
    doc.setFontSize(10.5);
    const righe = s.persone.flatMap((p) => doc.splitTextToSize(p.nome, w - 8) as string[]);
    doc.setFontSize(7);
    const r = doc.splitTextToSize(s.ruolo.toUpperCase(), w - 8) as string[];
    return { righe, r, h: 5 + r.length * 3.2 + righe.length * 4.8 + 2 };
  };
  const scheda = (s: Scheda, x: number, yy: number, w: number, h: number, tipo: string) => {
    const c = COLORI[tipo];
    doc.setFillColor(...c.sfondo); doc.setDrawColor(199, 196, 187); doc.setLineWidth(0.25);
    doc.roundedRect(x, yy, w, h, 1.5, 1.5, "FD");
    doc.setFillColor(...c.bordo); doc.rect(x, yy, 1.4, h, "F");
    const m = misura(s, w);
    let ty = yy + 4.5;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(107, 111, 114);
    m.r.forEach((t) => { doc.text(t, x + 4.5, ty); ty += 3.2; });
    ty += 1.6;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(34, 38, 42);
    m.righe.forEach((t) => { doc.text(t, x + 4.5, ty); ty += 4.8; });
  };

  livelli.forEach((l, i) => {
    const schede = l.schede.filter((s) => s.persone.length);
    if (!schede.length) return;
    if (i > 0) { linea(y - FILO, y); }
    const n = schede.length, w = Math.min(62, (LARGO - GAP * (n - 1)) / n);
    const h = Math.max(...schede.map((s) => misura(s, w).h));
    let x = W / 2 - (n * w + (n - 1) * GAP) / 2;
    schede.forEach((s) => { scheda(s, x, y, w, h, l.tipo); x += w + GAP; });
    y += h + FILO;
  });

  // lavoratori per reparto, su due colonne
  linea(y - FILO, y);
  const col = 2, cw = (LARGO - 10 - 8) / col;
  doc.setFontSize(9);
  const blocchi = gruppi.map((g) => ({ g, righe: doc.splitTextToSize(g.persone.join(" · "), cw) as string[] }));
  const altezze = blocchi.map((b) => 4 + b.righe.length * 4 + 3);
  const colonne: number[][] = [[], []]; const alt = [0, 0];
  altezze.forEach((h, k) => { const c = alt[0] <= alt[1] ? 0 : 1; colonne[c].push(k); alt[c] += h; });
  const H = 11 + Math.max(...alt) + 2;
  const c = COLORI.base;
  doc.setFillColor(...c.sfondo); doc.setDrawColor(199, 196, 187); doc.roundedRect(M, y, LARGO, H, 1.5, 1.5, "FD");
  doc.setFillColor(...c.bordo); doc.rect(M, y, 1.4, H, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(107, 111, 114);
  doc.text("LAVORATORI", M + 5, y + 5);
  colonne.forEach((ks, ci) => {
    let yy = y + 11;
    const x = M + 5 + ci * (cw + 8);
    ks.forEach((k) => {
      const b = blocchi[k];
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(107, 111, 114);
      doc.text(b.g.reparto, x, yy); yy += 4;
      doc.setFontSize(9); doc.setTextColor(34, 38, 42);
      b.righe.forEach((t) => { doc.text(t, x, yy); yy += 4; });
      yy += 3;
    });
  });
  y += H + 8;

  // legenda
  const voci: [string, string][] = [["autorita", "Datore di lavoro"], ["supporto", "Funzioni di supporto"], ["linea", "Dirigente e preposti"], ["emergenza", "Addetti alle emergenze"], ["base", "Lavoratori"]];
  doc.setFontSize(7.5);
  const tot = voci.reduce((s, [, t]) => s + doc.getTextWidth(t) + 9, 0);
  let lx = W / 2 - tot / 2;
  voci.forEach(([k, t]) => { doc.setFillColor(...COLORI[k].bordo); doc.rect(lx, y - 2.4, 2.6, 2.6, "F"); doc.setTextColor(107, 111, 114); doc.text(t, lx + 4, y); lx += doc.getTextWidth(t) + 9; });
  doc.setFontSize(7); doc.setTextColor(140, 140, 140);
  doc.text("Kimatic S.r.l. · Via G. Matteotti 26, 40057 Cadriano di Granarolo dell'Emilia (BO) · P.IVA 03286631209", W / 2, 289, { align: "center" });
  return doc;
}
