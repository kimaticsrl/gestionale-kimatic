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
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const nomeMese = (m) => MESI[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); // 'AAAA-MM'

// Il cliente è all'estero? Dal paese dell'Anagrafica clienti o, se manca, dall'indirizzo del rapporto
const ITALIA = /\b(ital[iy]a?|italy)\b/i;
const ESTERI = /\b(spagna|spain|españa|francia|france|germania|germany|deutschland|polonia|poland|polska|regno unito|united kingdom|uk|england|inghilterra|portogallo|portugal|austria|svizzera|switzerland|schweiz|belgio|belgium|olanda|paesi bassi|netherlands|grecia|greece|romania|bulgaria|croazia|slovenia|serbia|ungheria|hungary|rep\.? ceca|czech|slovacchia|turchia|turkey|tunisia|marocco|morocco|algeria|egitto|egypt|usa|stati uniti|united states|canada|messico|mexico|brasile|brazil|argentina|cile|chile|cina|china|india|israele|svezia|sweden|norvegia|norway|danimarca|denmark|finlandia|finland|irlanda|ireland|lituania|lettonia|estonia|ucraina|russia)\b/i;
export function estero(paese, indirizzo) {
  if (paese) return !ITALIA.test(paese);
  return ESTERI.test(String(indirizzo || ''));
}

// rapporti: righe della tabella (con dati); da/a: 'AAAA-MM-GG' compresi;
// paeseDi(r): paese del cliente dall'anagrafica (facoltativo)
export function righeReport(rapporti, da, a, paeseDi) {
  const out = [];
  for (const row of rapporti) {
    const r = row.dati || {};
    const nomi = nomiTecnici(r.tecnici);
    const fuori = estero(paeseDi ? paeseDi(r) : '', r.cli?.indirizzo);
    for (const g of r.giorni || []) {
      if (!g.d || g.d < da || g.d > a) continue;
      const s = RI.split(g), nt = Math.max(1, +g.nt || 1), vv = RI.viaggi(g).filter((v) => v.da || v.a || v.km);
      const viaggio = vv.reduce((t, v) => t + RI.DURV(v), 0), km = vv.reduce((t, v) => t + (+v.km || 0), 0), tr = g.tr || {}, training = RI.DUR(tr.da, tr.a);
      const vnt = vv.length ? Math.max(...vv.map((v) => Math.max(1, +v.nt || 1))) : nt;
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
          lavoro: ore(s.tot), ordinarie: ore(s.tOrd), straordinario: ore(s.tExt), viaggio: ore(viaggio), km,
          training: ore(training), notte: notte ? 1 : 0, estero: fuori, garanzia: g.gar ? 'sì' : '', avvisi: avvisi.join('; '),
        });
      }
    }
  }
  return out.sort((x, y) => x.tecnico.localeCompare(y.tecnico) || x.data.localeCompare(y.data) || x.rapporto.localeCompare(y.rapporto));
}

export function riepilogo(righe) {
  const m = new Map();
  for (const x of righe) {
    const t = m.get(x.tecnico) || { tecnico: x.tecnico, giornate: new Set(), lavoro: 0, ordinarie: 0, straordinario: 0, viaggio: 0, km: 0, notti: 0, nottiIt: 0, nottiEst: 0, festivi: 0 };
    t.giornate.add(x.data); t.lavoro += x.lavoro; t.ordinarie += x.ordinarie; t.straordinario += x.straordinario;
    t.viaggio += x.viaggio; t.km += x.km; t.notti += x.notte; if (x.notte) { if (x.estero) t.nottiEst++; else t.nottiIt++; } if (x.festivo) t.festivi += x.lavoro;
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

  // riepilogo per mese e per tecnico (un periodo può comprendere più mesi)
  const R = [...new Set(righe.map((x) => x.data.slice(0, 7)))].sort()
    .flatMap((m) => riepilogo(righe.filter((x) => x.data.startsWith(m))).map((t) => ({ ...t, mese: nomeMese(m) })));
  const w1 = wb.addWorksheet('Riepilogo per tecnico', { views: [{ state: 'frozen', ySplit: 4 }] });
  intest(w1, 'Report ore tecnici – riepilogo');
  testata(w1, [['Mese', 15], ['Tecnico', 26], ['Giornate', 10], ['Ore lavoro', 11], ['di cui ordinarie', 12], ['Straordinario (oltre 8 h/giorno)', 15], ['di cui sab./dom./festivi', 13], ['Ore viaggio', 11], ['Notti fuori Italia (indennità)', 14], ['Notti fuori estero (indennità)', 14]]);
  R.forEach((t) => w1.addRow([t.mese, t.tecnico, t.giornate, t.lavoro, t.ordinarie, t.straordinario, t.festivi, t.viaggio, t.nottiIt, t.nottiEst]));
  const tot = w1.addRow(['Totale periodo', '', ...['C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((c) => ({ formula: `SUM(${c}5:${c}${4 + R.length})` }))]);
  tot.font = { bold: true };
  [4, 5, 6, 7, 8].forEach((c) => { w1.getColumn(c).numFmt = '0.0'; });

  // Un foglio per ogni tecnico: le sue giornate, con il totale di ogni mese
  const usati = new Set();
  for (const tec of [...new Set(righe.map((x) => x.tecnico))]) {
    let nome = tec.replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31).trim() || 'Tecnico';
    for (let i = 2; usati.has(nome.toLowerCase()); i++) nome = nome.slice(0, 28) + ' ' + i;
    usati.add(nome.toLowerCase());
    const w2 = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 4 }] });
    intest(w2, 'Report ore – ' + tec);
    testata(w2, [['Data', 11], ['Giorno', 11], ['Sab./dom./festivo', 15], ['Cliente', 28], ['Rapporto', 18], ['Stato', 14], ['Ore lavoro', 9], ['Ordinarie', 9], ['Straordinario', 12], ['Ore viaggio', 9], ['Training', 9], ['Notte fuori (indennità)', 14], ['Garanzia', 9], ['Da verificare', 40]]);
    const mie = righe.filter((x) => x.tecnico === tec);
    for (const m of [...new Set(mie.map((x) => x.data.slice(0, 7)))].sort()) {
      const rm = mie.filter((x) => x.data.startsWith(m));
      rm.forEach((x) => {
        const r = w2.addRow([new Date(x.data + 'T00:00:00Z'), x.giorno, x.festivo, x.cliente, x.rapporto, x.stato, x.lavoro, x.ordinarie, x.straordinario, x.viaggio, x.training, x.notte ? (x.estero ? 'sì – estero' : 'sì – Italia') : '', x.garanzia, x.avvisi]);
        if (x.festivo) r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        if (x.notte) r.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } };
        if (x.avvisi) r.getCell(14).font = { color: { argb: 'FFB3261E' } };
      });
      const t = riepilogo(rm)[0];
      const tr = w2.addRow([`Totale ${nomeMese(m)}`, '', '', `${t.giornate} giornate`, '', '', t.lavoro, t.ordinarie, t.straordinario, t.viaggio, '',
        [t.nottiIt ? `${t.nottiIt} Italia` : '', t.nottiEst ? `${t.nottiEst} estero` : ''].filter(Boolean).join(', ') || '–']);
      tr.font = { bold: true };
      tr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1ECF4' } }; });
      w2.addRow([]);
    }
    w2.getColumn(1).numFmt = 'dd/mm/yyyy';
    [7, 8, 9, 10, 11].forEach((c) => { w2.getColumn(c).numFmt = '0.0'; });
  }

  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// PDF del report ore di un singolo rapporto (A4 verticale)
export function pdfReport(jsPDF, r, logo, paeseDi) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 12, R = 198, W = R - L, FONDO = 282;
  const righe = righeReport([{ dati: r }], '0000-01-01', '9999-12-31', paeseDi ? () => paeseDi(r) : null);
  const num = (n) => (n ? String(Math.round(n * 10) / 10).replace('.', ',') : '–');
  const t = (s, x, y, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.sz || 8.5); doc.setTextColor(o.c || '#1b1b1b'); doc.text(String(s ?? ''), x, y, { align: o.al || 'left', maxWidth: o.mw }); };
  const taglia = (s, w, sz) => { doc.setFontSize(sz); let x = String(s ?? ''); if (doc.getTextWidth(x) <= w) return x; while (x && doc.getTextWidth(x + '…') > w) x = x.slice(0, -1); return x + '…'; };
  let y = 14;

  function testata() {
    if (logo) { try { const p = doc.getImageProperties(logo), k = Math.min(34 / p.width, 11 / p.height); doc.addImage(logo, 'PNG', L, 8, p.width * k, p.height * k); } catch (e) { /* senza logo */ } }
    t("REPORT ORE D'INTERVENTO", R, 13, { b: true, sz: 13, al: 'right' });
    t(`${r.num || ''} · ${r.firma ? 'firmato dal cliente' : 'in compilazione'}`, R, 18.5, { sz: 9, al: 'right', c: '#555555' });
    doc.setDrawColor('#1f3a5f'); doc.setLineWidth(0.6); doc.line(L, 22, R, 22);
    y = 28;
  }
  function nuovaPagina(spazio) { if (y + spazio > FONDO) { doc.addPage(); testata(); } }

  testata();
  // Dati dell'intervento
  const date = (r.giorni || []).map((g) => g.d).filter(Boolean).sort();
  const periodo = date.length ? (date.length === 1 ? RI.fd(date[0]) : `dal ${RI.fd(date[0])} al ${RI.fd(date[date.length - 1])}`) : '–';
  const info = [
    ['Cliente', r.cli?.nome], ['Indirizzo', r.cli?.indirizzo], ['Tipo', r.tipo === 'inst' ? 'Installazione' : 'Manutenzione'],
    ['Macchina', [r.macDesc, r.matr && 'matr. ' + r.matr].filter(Boolean).join(' – ')], ['Periodo', periodo], ['Tecnici', r.tecnici],
  ];
  info.forEach(([k, v], i) => {
    const x = i % 2 ? L + W / 2 : L, yy = y + Math.floor(i / 2) * 6;
    t(k, x, yy, { sz: 7.5, c: '#666666' }); t(taglia(v || '–', W / 2 - 24, 9), x + 20, yy, { sz: 9 });
  });
  y += 22;

  // Tabella generica con intestazione ripetuta a ogni pagina
  function tabella(titolo, cols, dati, opz = {}) {
    nuovaPagina(22);
    t(titolo, L, y, { b: true, sz: 10.5 }); y += 4;
    const intest = () => {
      doc.setFillColor('#1f3a5f'); doc.rect(L, y, W, 7, 'F');
      let x = L; cols.forEach((c) => { t(c.t, c.n ? x + c.w - 1.5 : x + 1.5, y + 4.7, { b: true, sz: 7.3, c: '#ffffff', al: c.n ? 'right' : 'left' }); x += c.w; });
      y += 7;
    };
    intest();
    dati.forEach((d, i) => {
      if (y + 6.2 > FONDO) { doc.addPage(); testata(); intest(); }
      if (opz.evidenzia && opz.evidenzia(d)) { doc.setFillColor('#fff6dc'); doc.rect(L, y, W, 6.2, 'F'); }
      else if (i % 2) { doc.setFillColor('#f3f5f7'); doc.rect(L, y, W, 6.2, 'F'); }
      let x = L;
      cols.forEach((c) => { const v = c.v(d); t(taglia(v, c.w - 3, 8), c.n ? x + c.w - 1.5 : x + 1.5, y + 4.2, { sz: 8, al: c.n ? 'right' : 'left', b: opz.grassetto && opz.grassetto(d) }); x += c.w; });
      y += 6.2;
    });
    doc.setDrawColor('#c9d1d9'); doc.setLineWidth(0.2); doc.line(L, y, R, y);
    y += 8;
  }

  if (!righe.length) { t('Nessuna giornata compilata in questo rapporto.', L, y, { sz: 10 }); }
  else {
    // Una sezione (e una pagina) per ogni tecnico e, se l'intervento è a cavallo di più mesi, per ogni mese
    const mesi = [...new Set(righe.map((d) => d.data.slice(0, 7)))].sort();
    const tecnici = [...new Set(righe.map((d) => d.tecnico))];
    const nota = [tecnici.length > 1 ? `una pagina per ciascuno dei ${tecnici.length} tecnici` : '', mesi.length > 1 ? `ore divise per mese (${mesi.map(nomeMese).join(', ')})` : ''].filter(Boolean).join('; ');
    if (nota) { t(nota.charAt(0).toUpperCase() + nota.slice(1) + '.', L, y - 4, { sz: 8.5, c: '#1f3a5f', b: true }); y += 3; }
    let prima = true;
    tecnici.forEach((tec) => mesi.forEach((m) => {
      const rm = righe.filter((d) => d.tecnico === tec && d.data.startsWith(m));
      if (!rm.length) return;
      if (!prima) { doc.addPage(); testata(); }
      prima = false;
      doc.setFillColor('#1f3a5f'); doc.rect(L, y - 5.5, W, 10, 'F');
      t(tec.toUpperCase(), L + 3, y + 1.2, { b: true, sz: 12, c: '#ffffff' });
      t(nomeMese(m), R - 3, y + 1.2, { b: true, sz: 10, c: '#ffffff', al: 'right' });
      y += 12;
      tabella('Giornate', [
        { t: 'Data', w: 22, v: (d) => RI.fd(d.data) }, { t: 'Giorno', w: 40, v: (d) => d.festivo && d.festivo !== d.giorno ? `${d.giorno} (${d.festivo})` : d.giorno },
        { t: 'Ore lavoro', w: 21, n: 1, v: (d) => num(d.lavoro) }, { t: 'Ordinarie', w: 21, n: 1, v: (d) => num(d.ordinarie) },
        { t: 'Straordinario', w: 24, n: 1, v: (d) => num(d.straordinario) }, { t: 'Ore viaggio', w: 22, n: 1, v: (d) => num(d.viaggio) },
        { t: 'Notte fuori', w: 36, v: (d) => (d.notte ? (d.estero ? '   sì – estero' : '   sì – Italia') : '   no') },
      ], rm, { evidenzia: (d) => !!d.festivo });
      const tt = riepilogo(rm)[0];
      tabella('Totale ' + tec + ' – ' + nomeMese(m), [
        { t: 'Giornate', w: 18, n: 1, v: (d) => d.giornate }, { t: 'Ore lavoro', w: 21, n: 1, v: (d) => num(d.lavoro) },
        { t: 'Ordinarie', w: 20, n: 1, v: (d) => num(d.ordinarie) }, { t: 'Straordinario', w: 24, n: 1, v: (d) => num(d.straordinario) },
        { t: 'di cui sab/dom/fest.', w: 29, n: 1, v: (d) => num(d.festivi) }, { t: 'Ore viaggio', w: 22, n: 1, v: (d) => num(d.viaggio) },
        { t: 'Indenn. Italia', w: 26, n: 1, v: (d) => (d.nottiIt ? `${d.nottiIt} ${d.nottiIt === 1 ? 'notte' : 'notti'}` : '–') },
        { t: 'Indenn. estero', w: 26, n: 1, v: (d) => (d.nottiEst ? `${d.nottiEst} ${d.nottiEst === 1 ? 'notte' : 'notti'}` : '–') },
      ], [tt], { grassetto: () => true });
    }));

    const avvisi = [...new Set(righe.filter((d) => d.avvisi).map((d) => `${RI.fd(d.data)}: ${d.avvisi}`))];
    if (avvisi.length) {
      nuovaPagina(10 + avvisi.length * 5);
      t('Da verificare', L, y, { b: true, sz: 10.5, c: '#b3261e' }); y += 5;
      avvisi.forEach((a) => { nuovaPagina(6); t('• ' + a, L + 2, y, { sz: 8.5, mw: W - 4 }); y += 5; });
      y += 3;
    }
    nuovaPagina(14);
    t("Ore in ore e decimi (7,5 = 7 ore e 30 minuti). Straordinario: ore oltre le 8 nella stessa giornata. Notte fuori: indicata dal tecnico o, se non indicata, quando il giorno dopo c'è un'altra giornata dello stesso rapporto; Italia o estero secondo il paese del cliente.", L, y, { sz: 7.3, c: '#666666', mw: W });
  }

  const n = doc.getNumberOfPages();
  const oggi = new Date().toLocaleDateString('it-IT');
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    t(`Kimatic S.r.l. · report generato il ${oggi}`, L, 290, { sz: 7, c: '#888888' });
    t(`Pagina ${p} di ${n}`, R, 290, { sz: 7, c: '#888888', al: 'right' });
  }
  return doc;
}
