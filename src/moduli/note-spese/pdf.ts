// Nota spese in PDF (A4): elenco spese, totali per valuta e in euro al cambio BCE, riepiloghi e foto degli scontrini
import { MEZZI } from "@/moduli/rapporti/addebito";
import { daRimborsare, fd, imp, inEuro, nomeCat, nomeMetodo, nomeStato, num, totali, type Cambio, type Nota, type Rap } from "./calcolo";

type JsPDF = new (o: object) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
const ARANCIO = "#c2410c", BLU = "#1f3a5f", GRIGIO = "#666666";
// jsPDF con i font standard non ha «€» in tutte le versioni: si scrive «EUR»
const eu = (v: number, valuta = "EUR") => `${num(v)} ${valuta}`;

export function pdfNotaSpese(jsPDF: JsPDF, n: Nota, r: Rap | null | undefined, c: Cambio | null, o: { logo: string; immagini: Record<string, string> }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const X = 14, R = 196, W = R - X, FONDO = 282;
  const d = n.dati, spese = d.spese || [], t = totali(spese, c);
  const txt = (s: unknown, x: number, y: number, op: { b?: boolean; sz?: number; c?: string; al?: string; mw?: number } = {}) => {
    doc.setFont("helvetica", op.b ? "bold" : "normal"); doc.setFontSize(op.sz || 9); doc.setTextColor(op.c || "#1b1b1b");
    doc.text(String(s ?? ""), x, y, { align: op.al || "left", maxWidth: op.mw });
  };
  let y = 0;
  const testata = () => {
    if (o.logo) { try { const p = doc.getImageProperties(o.logo), h = 13, w = Math.min(40, h * p.width / p.height); doc.addImage(o.logo, "PNG", X, 8, w, w * p.height / p.width); } catch { /* senza logo */ } }
    txt("NOTA SPESE", R, 13, { b: true, sz: 14, al: "right" });
    txt(`${n.numero}  ·  ${d.autore || ""}`, R, 19, { sz: 10, al: "right", c: "#444444" });
    doc.setDrawColor(BLU); doc.setLineWidth(0.7); doc.line(X, 23, R, 23);
    y = 30;
  };
  const spazio = (h: number) => { if (y + h > FONDO) { doc.addPage(); testata(); } };
  const titolo = (s: string) => { spazio(14); doc.setFillColor("#e1ecf4"); doc.rect(X, y - 4.5, W, 7, "F"); txt(s.toUpperCase(), X + 2, y, { b: true, sz: 9, c: BLU }); y += 8; };
  const coppia = (k: string, v: string, x: number, w: number) => { txt(k, x, y, { sz: 7.5, c: GRIGIO }); txt(v, x, y + 4.6, { sz: 10, mw: w - 3 }); };

  testata();
  // intestazione
  const periodo = r?.dal ? (r.al && r.al !== r.dal ? `${fd(r.dal)} – ${fd(r.al)}` : fd(r.dal)) : "";
  coppia("Trasferta (rapporto d'intervento)", [r?.numero || "—", r?.cliente].filter(Boolean).join(" – "), X, W / 2);
  coppia("Periodo", periodo || "—", X + W / 2, W / 4);
  coppia("Stato", nomeStato(n.stato), X + W * 3 / 4, W / 4);
  y += 11;
  coppia("Compilata da", d.autore || "—", X, W / 2);
  coppia("Carta aziendale", d.carta ? "•• " + d.carta : "non indicata", X + W / 2, W / 4);
  coppia("Firma del rapporto", r?.firma_ts ? fd(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date(r.firma_ts))) : "non ancora firmato", X + W * 3 / 4, W / 4);
  y += 11;
  if (d.titolo) { coppia("Descrizione", d.titolo, X, W); y += 11; }
  const passi = [d.chiusa_il && `Chiusa il ${fd(d.chiusa_il.slice(0, 10))}${d.chiusa_da ? " da " + d.chiusa_da : ""}`, d.verificata_il && `Verificata il ${fd(d.verificata_il.slice(0, 10))} da ${d.verificata_da}`].filter(Boolean).join("   ·   ");
  if (passi) { txt(passi, X, y, { sz: 9, c: "#444444" }); y += 7; }

  // spese
  titolo(`Spese (${spese.length})`);
  const col = { n: X, data: X + 8, descr: X + 27, met: X + 100, imp: X + 152, eur: R };
  txt("#", col.n, y, { b: true, sz: 8, c: GRIGIO }); txt("Data", col.data, y, { b: true, sz: 8, c: GRIGIO }); txt("Descrizione", col.descr, y, { b: true, sz: 8, c: GRIGIO });
  txt("Pagata con", col.met, y, { b: true, sz: 8, c: GRIGIO }); txt("Importo", col.imp, y, { b: true, sz: 8, c: GRIGIO, al: "right" }); txt("In euro", col.eur, y, { b: true, sz: 8, c: GRIGIO, al: "right" });
  y += 2; doc.setDrawColor("#cccccc"); doc.setLineWidth(0.2); doc.line(X, y, R, y); y += 4.5;
  spese.forEach((s, i) => {
    const mz = s.mezzo === "altro" ? s.mezzoAltro : MEZZI.find((m) => m.targa === s.mezzo) ? `${MEZZI.find((m) => m.targa === s.mezzo)!.nome} ${s.mezzo}` : "";
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    const righe: string[] = doc.splitTextToSize([nomeCat(s.cat) + (s.esercente ? " – " + s.esercente : ""), mz && "Mezzo: " + mz, s.note, s.fatt && "da addebitare al cliente", !s.foto?.length && "senza foto dello scontrino"].filter(Boolean).join("\n"), 70);
    const h = Math.max(daRimborsare(s) ? 2 : 1, righe.length) * 4 + 2.5;
    spazio(h);
    const p = daRimborsare(s), e1 = inEuro(s, c);
    if (p) { doc.setFillColor("#fdebe1"); doc.rect(X - 1, y - 3.6, W + 2, h, "F"); }
    txt(i + 1, col.n, y, { sz: 9 }); txt(fd(s.data), col.data, y, { sz: 9 });
    righe.forEach((l, k) => txt(l, col.descr, y + k * 4, { sz: k ? 8 : 9, c: k ? "#444444" : "#1b1b1b" }));
    txt(p ? (s.metodo === "contanti" ? "CONTANTI" : "CARTA PERSONALE") : "Carta az." + (d.carta ? " ••" + d.carta : ""), col.met, y, { sz: 8, b: p, c: p ? ARANCIO : "#1b1b1b" });
    if (p) txt("da rimborsare", col.met, y + 4, { sz: 7.5, c: ARANCIO });
    txt(eu(s.importo, s.valuta), col.imp, y, { sz: 9, al: "right" });
    txt(e1 != null ? eu(e1) : "—", col.eur, y, { sz: 9, al: "right", b: true });
    y += h;
    doc.setDrawColor("#eeeeee"); doc.line(X, y - 3, R, y - 3);
  });

  // totali
  y += 2;
  titolo("Totale trasferta");
  const riga = (k: string, v: string, op: { b?: boolean; c?: string; sz?: number } = {}) => { spazio(6); txt(k, X, y, { sz: op.sz || 10, b: op.b, c: op.c }); txt(v, R, y, { sz: op.sz || 10, b: op.b, c: op.c, al: "right" }); y += 5.6; };
  t.perValuta.forEach((v) => riga(
    `Totale in ${v.valuta}${v.valuta !== "EUR" && v.tasso ? `  (1 EUR = ${String(v.tasso).replace(".", ",")} ${v.valuta})` : ""}`,
    v.valuta === "EUR" ? eu(v.totale) : `${eu(v.totale, v.valuta)}  =  ${v.euro != null ? eu(v.euro) : "cambio non disponibile"}`));
  riga("TOTALE IN EURO", eu(t.euro), { b: true, sz: 11.5 });
  riga("Da rimborsare (carta personale / contanti)", eu(t.rimborsare), { b: t.rimborsare > 0, c: t.rimborsare > 0 ? ARANCIO : undefined });
  riga("Pagato con carta aziendale", eu(t.aziendale));
  riga("Da addebitare al cliente", eu(t.fatturabile));
  if (t.perValuta.some((v) => v.valuta !== "EUR")) {
    y += 1;
    const nota = c?.provvisorio
      ? "Cambio provvisorio (rapporto non ancora firmato): BCE del " + fd(c.data_bce) + "."
      : `Cambio di riferimento BCE del ${fd(c?.data_bce)}${c && c.data_bce !== c.data ? `, ultimo disponibile alla firma del rapporto (${fd(c.data)})` : ", giorno della firma del rapporto"}.`;
    txt(nota + (t.senzaCambio.length ? ` Senza cambio: ${t.senzaCambio.join(", ")} (escluse dal totale in euro).` : ""), X, y, { sz: 8, c: GRIGIO, mw: W }); y += 7;
  }

  // riepiloghi
  titolo("Riepilogo per metodo di pagamento");
  t.perMetodo.forEach((m) => riga(`${nomeMetodo(m.metodo, d.carta)} (${m.n})`, eu(m.euro), { c: m.metodo !== "aziendale" ? ARANCIO : undefined }));
  y += 2;
  titolo("Riepilogo per categoria");
  t.perCategoria.forEach((x) => riga(`${nomeCat(x.cat)} (${x.n})`, eu(x.euro)));

  // foto degli scontrini: due per pagina
  const conFoto = spese.flatMap((s, i) => (s.foto || []).filter((p) => o.immagini[p]).map((p) => ({ s, i, p })));
  conFoto.forEach((f, k) => {
    if (k % 2 === 0) { doc.addPage(); testata(); txt("SCONTRINI", X, y, { b: true, sz: 9, c: BLU }); y += 5; }
    const top = y + (k % 2) * 127, hMax = 115, wMax = W;
    txt(`#${f.i + 1} – ${nomeCat(f.s.cat)}${f.s.esercente ? " – " + f.s.esercente : ""} – ${imp(f.s.importo, f.s.valuta).replace("€", "EUR")} – ${fd(f.s.data)}`, X, top + 3, { sz: 9, b: true });
    try {
      const img = o.immagini[f.p], p = doc.getImageProperties(img);
      const k2 = Math.min(wMax / p.width, hMax / p.height), w = p.width * k2, h = p.height * k2;
      doc.addImage(img, img.startsWith("data:image/png") ? "PNG" : "JPEG", X + (wMax - w) / 2, top + 6, w, h);
    } catch { txt("(immagine non leggibile)", X, top + 12, { sz: 9, c: GRIGIO }); }
  });

  // piè di pagina
  const tot = doc.getNumberOfPages();
  for (let i = 1; i <= tot; i++) {
    doc.setPage(i);
    txt(`Nota spese ${n.numero} – ${d.autore || ""}`, X, 291, { sz: 7.5, c: GRIGIO });
    txt(`Pagina ${i}/${tot}`, R, 291, { sz: 7.5, c: GRIGIO, al: "right" });
  }
  return doc;
}
