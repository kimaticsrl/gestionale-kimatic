// PDF delle verifiche delle scadenze aziendali: una o più verifiche, con controlli, note, foto e firma.
import type { jsPDF as JsPDF } from "jspdf";

export type VerificaPdf = {
  data: string; chi: string; esito?: string; note?: string; registrata?: string;
  controlli?: { voce: string; ok: boolean; nota?: string }[];
  firma?: string; foto?: string[]; // immagini come data URL
};

const fd = (s?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };

export function pdfVerifiche(jsPDF: typeof JsPDF, voce: { nome: string; frequenza?: string; procedura?: string }, lista: VerificaPdf[], logo?: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 14, R = 196, W = R - L, FONDO = 280, COL = "#c2410c";
  let y = 0;
  const t = (s: string, x: number, yy: number, o: { b?: boolean; sz?: number; c?: string; al?: "left" | "right" | "center"; mw?: number } = {}) => {
    doc.setFont("helvetica", o.b ? "bold" : "normal"); doc.setFontSize(o.sz || 9.5); doc.setTextColor(o.c || "#1b1b1b");
    doc.text(s, x, yy, { align: o.al || "left", maxWidth: o.mw });
  };
  const righe = (s: string, w: number, sz: number) => { doc.setFontSize(sz); return doc.splitTextToSize(s, w) as string[]; };
  function testata() {
    if (logo) { try { const p = doc.getImageProperties(logo), k = Math.min(38 / p.width, 13 / p.height); doc.addImage(logo, "PNG", L, 9, p.width * k, p.height * k); } catch { /* senza logo */ } }
    t("VERIFICA PERIODICA", R, 14, { b: true, sz: 13, al: "right" });
    t(voce.nome, R, 20, { sz: 10, al: "right", c: "#444444" });
    doc.setDrawColor(COL); doc.setLineWidth(0.7); doc.line(L, 25, R, 25); y = 32;
    doc.setFontSize(7); doc.setTextColor("#888888");
    doc.text("Kimatic S.r.l. · Via G. Matteotti 26, 40057 Cadriano di Granarolo dell'Emilia (BO) · P.IVA 03286631209", 105, 290, { align: "center" });
  }
  const spazio = (n: number) => { if (y + n > FONDO) { doc.addPage(); testata(); } };

  lista.forEach((v, n) => {
    if (n === 0) testata(); else { doc.addPage(); testata(); }
    // dati della verifica
    const dati: [string, string][] = [["Data della verifica", fd(v.data)], ["Eseguita da", v.chi || "–"], ["Esito", v.esito || "–"], ["Frequenza", voce.frequenza || "–"]];
    dati.forEach(([k, x], i) => {
      const xx = i % 2 ? L + W / 2 : L, yy = y + Math.floor(i / 2) * 7;
      t(k, xx, yy, { sz: 8, c: "#666666" });
      t(x, xx + 34, yy, { sz: 10, b: k === "Esito", c: k === "Esito" && x === "Non conforme" ? "#b91c1c" : k === "Esito" ? "#15803d" : undefined });
    });
    y += 16;

    if (v.controlli?.length) {
      spazio(14);
      doc.setFillColor(COL); doc.rect(L, y - 4.5, W, 6.5, "F");
      t(`Controlli (${v.controlli.filter((c) => c.ok).length} di ${v.controlli.length} OK)`, L + 2, y, { b: true, c: "#ffffff" }); y += 7;
      v.controlli.forEach((c, i) => {
        const testo = righe(c.voce, 118, 9), nota = c.nota ? righe(c.nota, 52, 8) : [];
        const h = Math.max(testo.length, nota.length, 1) * 4.2 + 1.8;
        spazio(h);
        if (i % 2) { doc.setFillColor("#f6f2ef"); doc.rect(L, y - 3.8, W, h, "F"); }
        t(c.ok ? "OK" : "NO", L + 2, y, { b: true, sz: 8.5, c: c.ok ? "#15803d" : "#b91c1c" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor("#1b1b1b"); doc.text(testo, L + 12, y);
        if (nota.length) { doc.setFontSize(8); doc.setTextColor("#b91c1c"); doc.text(nota, L + 132, y); }
        y += h;
      });
      y += 3;
    }
    if (v.note) {
      const r = righe(v.note, W - 4, 9.5);
      spazio(r.length * 4.6 + 10);
      t("Note", L, y, { b: true }); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor("#1b1b1b"); doc.text(r, L, y); y += r.length * 4.6 + 3;
    }
    // firma
    spazio(34);
    t("Firma di chi ha eseguito la verifica", L, y, { sz: 8, c: "#666666" }); y += 2;
    if (v.firma) { try { const p = doc.getImageProperties(v.firma), k = Math.min(70 / p.width, 24 / p.height); doc.addImage(v.firma, "PNG", L, y, p.width * k, p.height * k); } catch { /* firma non leggibile */ } }
    doc.setDrawColor("#999999"); doc.setLineWidth(0.2); doc.line(L, y + 25, L + 75, y + 25);
    t(v.chi || "", L, y + 29, { sz: 8.5 });
    if (v.registrata) t("Registrata nel gestionale il " + v.registrata, R, y + 29, { sz: 7.5, c: "#888888", al: "right" });
    y += 36;
    // foto, due per riga
    if (v.foto?.length) {
      spazio(12); t("Foto", L, y, { b: true }); y += 4;
      const w = (W - 6) / 2;
      let riga = 0;
      v.foto.forEach((f, i) => {
        try {
          const p = doc.getImageProperties(f), h = Math.min(85, (w * p.height) / p.width), ww = (h * p.width) / p.height;
          if (i % 2 === 0) { spazio(85 + 4); riga = 0; }
          doc.addImage(f, "JPEG", i % 2 ? L + w + 6 : L, y, ww, h);
          riga = Math.max(riga, h);
        } catch { /* foto non leggibile */ }
        if (i % 2 === 1 || i === v.foto!.length - 1) y += riga + 5;
      });
    }
  });
  if (!lista.length) { testata(); t("Nessuna verifica registrata.", L, y); }
  return doc;
}
