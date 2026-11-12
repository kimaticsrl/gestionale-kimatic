// @ts-nocheck
// Report ore per l'ufficio amministrativo: una riga per tecnico e per giornata, con ore di
// lavoro (ordinarie e straordinarie), viaggio, km e notti fuori sede (indennità di trasferta).
import { RI } from './pdf.js';

const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

// Pasqua (calendario gregoriano) per il Lunedì dell'Angelo
function pasqua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mese = Math.floor((h + l - 7 * m + 114) / 31), gg = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, mese - 1, gg) / 864e5;
}
// Festività nazionali (più San Petronio, patrono di Bologna, 4 ottobre)
export function festivo(iso) {
  const n = RI.d2n(iso); if (n == null) return '';
  const md = iso.slice(5);
  const FISSE = { '01-01': 'Capodanno', '01-06': 'Epifania', '04-25': 'Liberazione', '05-01': 'Festa del lavoro', '06-02': 'Festa della Repubblica',
    '08-15': 'Ferragosto', '10-04': 'San Petronio', '11-01': 'Ognissanti', '12-08': 'Immacolata', '12-25': 'Natale', '12-26': 'Santo Stefano' };
  if (FISSE[md]) return FISSE[md];
  if (n === pasqua(+iso.slice(0, 4)) + 1) return "Lunedì dell'Angelo";
  return '';
}

// Nomi dei tecnici scritti nel rapporto: «Mario Rossi, Luca Bianchi» / «Rossi e Bianchi»
export function nomiTecnici(s) {
  return String(s || '').split(/\s*(?:,|;|\/|\+|&|\be\b|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
}

const ore = (min) => Math.round(min / 6) / 10; // in ore, al decimo

// rapporti: righe della tabella (con dati); da/a: 'AAAA-MM-GG' compresi
export function righeReport(rapporti, da, a) {
  const out = [];
  for (const row of rapporti) {
    const r = row.dati || {};
    const nomi = nomiTecnici(r.tecnici);
    for (const g of r.giorni || []) {
      if (!g.d || g.d < da || g.d > a) continue;
      const s = RI.split(g), nt = Math.max(1, +g.nt || 1), v = g.v || {}, vnt = Math.max(1, +v.nt || 1);
      const viaggio = RI.DUR(v.da, v.a), tr = g.tr || {}, training = RI.DUR(tr.da, tr.a);
      const notte = RI.notte(r, g);
      const n = RI.d2n(g.d), dw = RI.dow(n), fest = festivo(g.d);
      const avvisi = [];
      if (!nomi.length) avvisi.push('tecnici non indicati nel rapporto');
      else if (nomi.length !== nt) avvisi.push(`nr. tecnici della giornata: ${nt}, nomi nel rapporto: ${nomi.length}`);
      if (viaggio && vnt !== nt) avvisi.push(`viaggio fatto da ${vnt} tecnici`);
      if (!s.tot && !viaggio) avvisi.push('giornata senza ore');
      const chi = nomi.length ? nomi : ['(non indicato)'];
      for (const t of chi) {
        out.push({
          tecnico: t, data: g.d, giorno: GIORNI[dw], festivo: fest || (dw === 6 ? 'domenica' : dw === 5 ? 'sabato' : ''),
          cliente: r.cli?.nome || '', rapporto: r.num || '', stato: r.firma ? 'firmato' : 'in compilazione',
          lavoro: ore(s.tot), ordinarie: ore(s.tOrd), straordinario: ore(s.tExt), viaggio: ore(viaggio), km: +v.km || 0,
          training: ore(training), notte: notte ? 1 : 0, garanzia: g.gar ? 'sì' : '', avvisi: avvisi.join('; '),
        });
      }
    }
  }
  return out.sort((x, y) => x.tecnico.localeCompare(y.tecnico) || x.data.localeCompare(y.data) || x.rapporto.localeCompare(y.rapporto));
}

export function riepilogo(righe) {
  const m = new Map();
  for (const x of righe) {
    const t = m.get(x.tecnico) || { tecnico: x.tecnico, giornate: new Set(), lavoro: 0, ordinarie: 0, straordinario: 0, viaggio: 0, km: 0, notti: 0, festivi: 0 };
    t.giornate.add(x.data); t.lavoro += x.lavoro; t.ordinarie += x.ordinarie; t.straordinario += x.straordinario;
    t.viaggio += x.viaggio; t.km += x.km; t.notti += x.notte; if (x.festivo) t.festivi += x.lavoro;
    m.set(x.tecnico, t);
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  return [...m.values()].map((t) => ({ ...t, giornate: t.giornate.size, lavoro: r1(t.lavoro), ordinarie: r1(t.ordinarie), straordinario: r1(t.straordinario), viaggio: r1(t.viaggio), festivi: r1(t.festivi) }));
}

// File Excel con due fogli: riepilogo per tecnico e dettaglio delle giornate
export async function creaExcel(ExcelJS, righe, da, a) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gestionale Kimatic';
  const intest = (ws, titolo) => {
    ws.addRow([titolo]).font = { bold: true, size: 14 };
    ws.addRow([`Periodo: dal ${RI.fd(da)} al ${RI.fd(a)} · ore in ore e decimi (7,5 = 7 ore e 30 minuti)`]).font = { italic: true, color: { argb: 'FF555555' } };
    ws.addRow([]);
  };
  const testata = (ws, cols) => {
    const r = ws.addRow(cols.map((c) => c[0]));
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
    r.height = 30;
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c[1]; });
  };

  const R = riepilogo(righe);
  const w1 = wb.addWorksheet('Riepilogo per tecnico', { views: [{ state: 'frozen', ySplit: 4 }] });
  intest(w1, 'Report ore tecnici – riepilogo');
  testata(w1, [['Tecnico', 26], ['Giornate', 10], ['Ore lavoro', 11], ['di cui ordinarie', 12], ['Straordinario (oltre 8 h/giorno)', 15], ['di cui sab./dom./festivi', 13], ['Ore viaggio', 11], ['Km', 9], ['Notti fuori = indennità di trasferta', 16]]);
  R.forEach((t) => w1.addRow([t.tecnico, t.giornate, t.lavoro, t.ordinarie, t.straordinario, t.festivi, t.viaggio, t.km, t.notti]));
  const tot = w1.addRow(['Totale', ...['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map((c) => ({ formula: `SUM(${c}5:${c}${4 + R.length})` }))]);
  tot.font = { bold: true };
  [3, 4, 5, 6, 7].forEach((c) => { w1.getColumn(c).numFmt = '0.0'; });

  const w2 = wb.addWorksheet('Dettaglio giornate', { views: [{ state: 'frozen', ySplit: 4 }] });
  intest(w2, 'Report ore tecnici – dettaglio giornate');
  testata(w2, [['Tecnico', 22], ['Data', 11], ['Giorno', 11], ['Sab./dom./festivo', 15], ['Cliente', 28], ['Rapporto', 18], ['Stato', 14], ['Ore lavoro', 9], ['Ordinarie', 9], ['Straordinario', 12], ['Ore viaggio', 9], ['Km', 8], ['Training', 9], ['Notte fuori (indennità)', 12], ['Garanzia', 9], ['Da verificare', 40]]);
  righe.forEach((x) => {
    const r = w2.addRow([x.tecnico, new Date(x.data + 'T00:00:00Z'), x.giorno, x.festivo, x.cliente, x.rapporto, x.stato, x.lavoro, x.ordinarie, x.straordinario, x.viaggio, x.km, x.training, x.notte ? 'sì' : '', x.garanzia, x.avvisi]);
    if (x.festivo) r.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    if (x.notte) r.getCell(14).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
    if (x.avvisi) r.getCell(16).font = { color: { argb: 'FFB3261E' } };
  });
  w2.getColumn(2).numFmt = 'dd/mm/yyyy';
  [8, 9, 10, 11, 13].forEach((c) => { w2.getColumn(c).numFmt = '0.0'; });
  w2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 16 } };

  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
