// Backup Excel della Sicurezza, sul modello del file «Elenco dipendenti in forza» (foglio DIPENDENTI KIMATIC)
// più i fogli di dettaglio: storico corsi, addetti, scadenze aziendali, verifiche, infortuni.
import type ExcelJSNs from "exceljs";

type Cella = string | number | Date | null | undefined;
export type Foglio = { nome: string; titolo?: string[]; gruppi?: [string, number, number][]; intestazioni: [string, number][]; righe: { v: Cella[]; grigia?: boolean; colori?: Record<number, "scad" | "presto" | "ok"> }[]; blocca?: number };

const COLORI = { scad: "FFF4B4B4", presto: "FFFFE08A", ok: "FFD3EDD5" };
const ARANCIO = "FFC2410C", CHIARO = "FFFBEEE6";

export async function creaBackup(ExcelJS: typeof ExcelJSNs, fogli: Foglio[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Gestionale Kimatic"; wb.created = new Date();
  for (const f of fogli) {
    const ws = wb.addWorksheet(f.nome.slice(0, 31));
    let r = 1;
    (f.titolo || []).forEach((t, i) => { const c = ws.getCell(r, 1); c.value = t; c.font = { bold: i === 0, size: i === 0 ? 13 : 10, color: { argb: i === 0 ? ARANCIO : "FF444444" } }; r++; });
    if (f.titolo?.length) r++;
    if (f.gruppi?.length) {
      f.gruppi.forEach(([t, da, a]) => {
        if (a > da) ws.mergeCells(r, da, r, a);
        const c = ws.getCell(r, da); c.value = t;
        c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.alignment = { horizontal: "center", vertical: "middle" };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARANCIO } };
      });
      r++;
    }
    const hr = ws.getRow(r);
    f.intestazioni.forEach(([t, w], i) => {
      const c = hr.getCell(i + 1); c.value = t;
      c.font = { bold: true }; c.alignment = { wrapText: true, vertical: "middle" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CHIARO } };
      c.border = { bottom: { style: "thin", color: { argb: "FF999999" } } };
      ws.getColumn(i + 1).width = w;
    });
    hr.height = 32;
    const primaDati = r + 1;
    f.righe.forEach((x) => {
      r++;
      const row = ws.getRow(r);
      x.v.forEach((v, i) => {
        const c = row.getCell(i + 1);
        c.value = v == null || v === "" ? null : v;
        if (v instanceof Date) c.numFmt = "dd/mm/yyyy";
        c.alignment = { vertical: "top", wrapText: typeof v === "string" && v.length > 40 };
        const col = x.colori?.[i];
        if (col) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORI[col] } };
        if (x.grigia) c.font = { color: { argb: "FF888888" } };
      });
    });
    ws.views = [{ state: "frozen", xSplit: f.blocca ?? 1, ySplit: primaDati - 1 }];
    if (f.righe.length) ws.autoFilter = { from: { row: primaDati - 1, column: 1 }, to: { row: r, column: f.intestazioni.length } };
  }
  return wb.xlsx.writeBuffer();
}
