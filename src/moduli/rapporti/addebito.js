// @ts-nocheck
// Importo da fatturare di un rapporto firmato, secondo il listino assistenza (Service Price List),
// e valore di quanto eseguito in garanzia (stesse tariffe, non addebitato).
// Regole:
//  - lavoro: prime 8 ore del giorno feriale a tariffa ordinaria, il resto a tariffa extra;
//    sabato, domenica e festivi interamente a tariffa extra; × nr. tecnici della giornata;
//  - viaggio: per tecnico e per giornata le prime 8 ore a tariffa «fino a 8 ore», le successive a quella «oltre 8 ore»;
//  - km: auto o furgone, a scelta per il rapporto;
//  - pasti: due indennità per tecnico e per giornata (pranzo e cena), tranne quelli che il tecnico
//    ha segnato come pagati dal cliente (g.pranzoCli, g.cenaCli);
//  - le giornate segnate «in garanzia» (lavoro, viaggio, km, pasti) e le parti in garanzia non si addebitano:
//    sono riportate a parte con il loro valore;
//  - viaggi, alloggio e trasporti locali: a costo, importi scritti a mano.
import { RI } from './pdf.js';
import { festivo } from './reportOre.js';

// Parco mezzi Kimatic: targa, modello, tipo (decide la tariffa km auto o furgone)
export const MEZZI = [
  { targa: 'HD922TR', nome: 'IVECO DAILY', tipo: 'furgone' },
  { targa: 'GD852NM', nome: 'Volvo', tipo: 'auto' },
  { targa: 'GG928ZD', nome: 'Jumper', tipo: 'furgone' },
  { targa: 'GX806HS', nome: 'SKODA Andrea', tipo: 'auto' },
  { targa: 'GS435RD', nome: 'CUPRA Giulio', tipo: 'auto' },
  { targa: 'GX809HS', nome: 'SKODA Moreno', tipo: 'auto' },
  { targa: 'GZ358KF', nome: 'Tiguan Matthias', tipo: 'auto' },
];
// Mezzo del rapporto: scelto nell'addebito (o.mezzo) oppure dal tecnico nel rapporto (r.mezzo); 'altro' = testo libero
export function mezzoDi(r, o) {
  const t = (o && o.mezzo) || r.mezzo || '';
  if (!t) return null;
  if (t === 'altro') { const x = ((o && o.mezzo === 'altro' ? o.mezzoAltro : r.mezzoAltro) || '').trim(); return { targa: '', nome: x || 'Altro mezzo', tipo: '', testo: x || 'Altro mezzo' }; }
  const m = MEZZI.find((x) => x.targa === t);
  return m ? { ...m, testo: m.nome + ', targa ' + m.targa } : { targa: t, nome: t, tipo: '', testo: t };
}

export const LISTINO_BASE = { ore: 65, oreExtra: 75, viaggio: 35, viaggioOltre: 40, kmAuto: 0.7, kmFurgone: 0.8, pasto: 25, remoto: 55, officina: 55 };

const UE = /\b(ital[iy]a?|austria|belgi(o|um|que)|bulgaria|cipro|cyprus|croazia|croatia|danimarca|denmark|estonia|finlandia|finland|suomi|francia|france|germania|germany|deutschland|grecia|greece|irlanda|ireland|lettonia|latvia|lituania|lithuania|lussemburgo|luxembourg|malta|olanda|paesi bassi|netherlands|polonia|poland|polska|portogallo|portugal|rep\.? ceca|repubblica ceca|czech|česko|romania|slovacchia|slovakia|slovenia|spagna|spain|españa|svezia|sweden|ungheria|hungary|magyarország)\b/i;
// Listino proposto dal paese del cliente: Unione europea (Italia compresa) o extra Europa
export function listinoPerPaese(paese) {
  if (!paese) return { id: 'EU', certo: false };
  return { id: UE.test(paese) ? 'EU' : 'EXTRA_EU', certo: true };
}

const h = (min) => Math.round(min / 6) / 10; // ore al decimo
const eur = (x) => Math.round(x * 100) / 100;
const GG = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

// r: rapporto; L: prezzi del listino; o: opzioni dell'addebito (addebiti_rapporti.dati)
export function calcola(r, L, o) {
  L = Object.assign({}, LISTINO_BASE, L || {}); o = o || {};
  const vuoto = () => ({ ord: 0, ext: 0, vIn: 0, vOl: 0, km: 0, pasti: 0 });
  const A = vuoto(), G = vuoto(), giorni = [];
  const avvisi = []; let pagatiCli = 0;
  const ordinati = (r.giorni || []).slice().sort((a, b) => String(a.d || '').localeCompare(String(b.d || '')));
  for (const g of ordinati) {
    const B = g.gar ? G : A;
    const nt = Math.max(1, +g.nt || 1), s = RI.split(g);
    const n = RI.d2n(g.d), fest = g.d ? festivo(g.d) : '', extraGiorno = n != null && (RI.dow(n) >= 5 || !!fest);
    const gOrd = extraGiorno ? 0 : s.tOrd * nt, gExt = extraGiorno ? (s.tOrd + s.tExt) * nt : s.tExt * nt;
    B.ord += gOrd; B.ext += gExt;
    let usato = 0, viaggiato = false, gV = 0, gKm = 0;
    for (const v of RI.viaggi(g)) {
      const d = RI.DURV(v), vnt = Math.max(1, +v.nt || nt);
      gKm += +v.km || 0;
      if (!d) continue; viaggiato = true;
      const dentro = Math.min(d, Math.max(0, 480 - usato));
      B.vIn += dentro * vnt; B.vOl += (d - dentro) * vnt; usato += d; gV += d * vnt;
    }
    B.km += gKm;
    const presente = s.tot || viaggiato, pr = presente && !g.pranzoCli, ce = presente && !g.cenaCli;
    if (presente) pagatiCli += (g.pranzoCli ? 1 : 0) + (g.cenaCli ? 1 : 0);
    const p = ((pr ? 1 : 0) + (ce ? 1 : 0)) * nt; B.pasti += p;
    const pasto = !presente ? '' : pr && ce ? 'pranzo e cena' : pr ? 'solo pranzo' : ce ? 'solo cena' : 'pagati dal cliente';
    giorni.push({ d: g.d, gg: n != null ? GG[RI.dow(n)] : '', fest, nt, ord: h(gOrd), ext: h(gExt), viaggio: h(gV), km: gKm, pasti: p, pasto, gar: !!g.gar, att: String(g.att || '').trim() });
  }
  const mz = mezzoDi(r, o);
  const furgone = o.veicolo ? o.veicolo === 'furgone' : !!(mz && mz.tipo === 'furgone');
  const voci = (B, conExtra) => [
    ['Ore di lavoro (giorni feriali, fino a 8 ore/giorno)', h(B.ord), 'h', L.ore],
    ['Ore extra, sabato, domenica e festivi', h(B.ext), 'h', L.oreExtra],
    ['Ore di viaggio (fino a 8 ore/giorno)', h(B.vIn), 'h', L.viaggio],
    ['Ore di viaggio (oltre 8 ore/giorno)', h(B.vOl), 'h', L.viaggioOltre],
    [(furgone ? 'Rimborso km furgone' : 'Rimborso km auto') + (mz ? ' (' + mz.testo + ')' : ''), o.km === false ? 0 : B.km, 'km', furgone ? L.kmFurgone : L.kmAuto],
    ['Indennità pasti (pranzo e cena × tecnici)', o.pasti === false ? 0 : B.pasti, 'n.', L.pasto],
    ...(conExtra ? [['Ore di assistenza da remoto', +o.oreRemote || 0, 'h', L.remoto], ['Ore di premontaggio/lavoro in Kimatic', +o.oreOfficina || 0, 'h', L.officina]] : []),
  ].map(([voce, qta, um, prezzo]) => ({ voce, qta, um, prezzo: +prezzo || 0, importo: eur(qta * (+prezzo || 0)) })).filter((x) => x.qta);
  const costi = [['Spese di viaggio (a costo)', o.speseViaggio], ['Alloggio e trasporti locali (a costo)', o.alloggio], ['Altre spese (a costo)', o.altre]]
    .map(([voce, x]) => ({ voce, qta: 1, um: '', prezzo: eur(+x || 0), importo: eur(+x || 0), costo: true })).filter((x) => x.importo);
  const righe = voci(A, true).concat(costi);
  const gRighe = voci(G, false);
  const parti = (r.ric || []).filter((x) => x.cod || x.des).map((x) => ({ cod: x.cod || '', des: x.des || '', q: x.q || '1', gar: !!x.gar }));
  const ricAdd = parti.filter((x) => !x.gar), ricGar = parti.filter((x) => x.gar);
  const nGar = giorni.filter((g) => g.gar).length;
  if (nGar) avvisi.push(nGar === 1 ? '1 giornata in garanzia non addebitata' : nGar + ' giornate in garanzia non addebitate');
  if (pagatiCli) avvisi.push(pagatiCli === 1 ? '1 pasto pagato dal cliente non addebitato' : pagatiCli + ' pasti pagati dal cliente non addebitati');
  if (ricAdd.length) avvisi.push('parti sostituite da addebitare: prezzo da listino ricambi');
  return {
    righe, totale: eur(righe.reduce((t, x) => t + x.importo, 0)),
    garanzia: { righe: gRighe, totale: eur(gRighe.reduce((t, x) => t + x.importo, 0)), giorni: nGar, parti: ricGar },
    ricambi: ricAdd, giorni, avvisi, mezzo: mz ? mz.testo : '', furgone,
  };
}

const euro = (x) => (+x || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nn = (x) => (x ? String(x).replace('.', ',') : '–');

// PDF per chi fattura: cosa addebitare, cosa è stato fatto in garanzia, dettaglio delle giornate
export function pdfAddebiti(jsPDF, r, A, info) {
  info = info || {};
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const L = 12, R = 198, W = R - L, FONDO = 282, BLU = '#1f3a5f';
  const t = (s, x, y, o = {}) => { doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.sz || 8.5); doc.setTextColor(o.c || '#1b1b1b'); doc.text(String(s ?? ''), x, y, { align: o.al || 'left', maxWidth: o.mw }); };
  const taglia = (s, w, sz) => { doc.setFontSize(sz); let x = String(s ?? ''); if (doc.getTextWidth(x) <= w) return x; while (x && doc.getTextWidth(x + '…') > w) x = x.slice(0, -1); return x + '…'; };
  let y = 14;
  function testata() {
    if (info.logo) { try { const p = doc.getImageProperties(info.logo), k = Math.min(34 / p.width, 11 / p.height); doc.addImage(info.logo, 'PNG', L, 8, p.width * k, p.height * k); } catch (e) { /* senza logo */ } }
    t('RIEPILOGO ADDEBITI', R, 13, { b: true, sz: 13, al: 'right' });
    t(`${r.num || ''} · ${r.firma && r.firma.ts ? 'firmato il ' + RI.fd(r.firma.ts.slice(0, 10)) : 'non ancora firmato'}`, R, 18.5, { sz: 9, al: 'right', c: '#555555' });
    doc.setDrawColor(BLU); doc.setLineWidth(0.6); doc.line(L, 22, R, 22); y = 28;
  }
  const spazio = (n) => { if (y + n > FONDO) { doc.addPage(); testata(); } };
  function titolo(s, colore) { spazio(14); doc.setFillColor(colore || BLU); doc.rect(L, y - 4.2, W, 6.2, 'F'); t(s, L + 2, y, { b: true, sz: 9.5, c: '#ffffff' }); y += 6; }
  // tabella generica: cols = [[intestazione, larghezza, allineamento]], rows = array di array
  function tabella(cols, rows, o = {}) {
    const xs = []; let x = L; cols.forEach((c) => { xs.push(x); x += c[1]; });
    const cella = (v, i, opt) => { const [, w, al] = cols[i]; const tx = al === 'right' ? xs[i] + w - 1.5 : xs[i] + 1.5; t(taglia(v, w - 3, opt.sz || 8.5), tx, y, Object.assign({ al: al === 'right' ? 'right' : 'left' }, opt)); };
    spazio(12);
    cols.forEach((c, i) => cella(c[0], i, { b: true, sz: 7.5, c: '#555555' })); y += 1.5;
    doc.setDrawColor('#bbbbbb'); doc.setLineWidth(0.2); doc.line(L, y, R, y); y += 4;
    rows.forEach((row, k) => { spazio(6); if (k % 2) { doc.setFillColor('#f3f5f8'); doc.rect(L, y - 3.6, W, 5, 'F'); } row.forEach((v, i) => cella(v, i, {})); y += 5; });
    if (o.totale) { spazio(8); doc.setDrawColor('#444444'); doc.line(L, y - 3, R, y - 3); y += 1.5; t(o.totale[0], L + 1.5, y, { b: true, sz: 10 }); t(o.totale[1], R - 1.5, y, { b: true, sz: 10, al: 'right' }); y += 7; }
    else y += 2;
  }
  testata();
  // dati dell'intervento
  const date = A.giorni.map((g) => g.d).filter(Boolean);
  const periodo = date.length ? (date.length === 1 ? RI.fd(date[0]) : `dal ${RI.fd(date[0])} al ${RI.fd(date[date.length - 1])}`) : '–';
  [['Cliente', r.cli && r.cli.nome], ['P.IVA / VAT', info.piva], ['Indirizzo', r.cli && r.cli.indirizzo], ['Listino', info.listino],
    ['Intervento', r.tipo === 'inst' ? 'Installazione' : 'Manutenzione'], ['Periodo', periodo],
    ['Macchina', [r.macDesc, r.matr && 'matr. ' + r.matr].filter(Boolean).join(' – ')], ['Tecnici', r.tecnici],
    ['Mezzo', A.mezzo ? (A.furgone ? 'Furgone' : 'Auto') + ' (' + A.mezzo + ')' : '']]
    .forEach(([k, v], i) => { const x = i % 2 ? L + W / 2 : L, yy = y + Math.floor(i / 2) * 6; t(k, x, yy, { sz: 7.5, c: '#666666' }); t(taglia(v || '–', W / 2 - 26, 9), x + 22, yy, { sz: 9 }); });
  y += 33;

  const colVoci = [['Voce', 104], ['Quantità', 26, 'right'], ['Prezzo €', 26, 'right'], ['Importo €', 30, 'right']];
  const rigaVoce = (x) => [x.voce, x.costo ? 'a costo' : nn(x.qta) + ' ' + x.um, x.costo ? '' : euro(x.prezzo), euro(x.importo)];
  titolo('DA ADDEBITARE AL CLIENTE');
  if (A.righe.length) tabella(colVoci, A.righe.map(rigaVoce), { totale: ['Totale servizi (IVA esclusa)', '€ ' + euro(A.totale)] });
  else { t('Niente da addebitare per ore, viaggi e spese.', L + 1.5, y + 1); y += 8; }
  if (A.ricambi.length) {
    spazio(14); t('Parti sostituite da addebitare (prezzo da listino ricambi)', L, y, { b: true, sz: 9 }); y += 5;
    tabella([['Codice', 40], ['Descrizione', 126], ['Q.tà', 20, 'right']], A.ricambi.map((x) => [x.cod, x.des, x.q]));
  }
  const G = A.garanzia;
  if (G.righe.length || G.parti.length) {
    y += 2; titolo('ESEGUITO IN GARANZIA – NON ADDEBITATO', '#2e7d4f');
    if (G.righe.length) tabella([...colVoci.slice(0, 3), ['Valore €', 30, 'right']], G.righe.map(rigaVoce), { totale: ['Valore dei servizi in garanzia', '€ ' + euro(G.totale)] });
    if (G.parti.length) {
      spazio(14); t('Parti sostituite in garanzia', L, y, { b: true, sz: 9 }); y += 5;
      tabella([['Codice', 40], ['Descrizione', 126], ['Q.tà', 20, 'right']], G.parti.map((x) => [x.cod, x.des, x.q]));
    }
  } else { spazio(10); t('Nessuna attività o parte in garanzia in questo intervento.', L, y, { sz: 8.5, c: '#555555' }); y += 7; }

  y += 2; titolo('DETTAGLIO DELLE GIORNATE');
  tabella([['Data', 24], ['Tecn.', 12, 'right'], ['Lavoro h', 20, 'right'], ['Extra h', 18, 'right'], ['Viaggio h', 20, 'right'], ['Km', 16, 'right'], ['Pasti', 22, 'right'], ['Garanzia', 18], ['Attività', 36]],
    A.giorni.map((g) => [`${g.gg} ${RI.fd(g.d)}`, g.nt, nn(g.ord), nn(g.ext), nn(g.viaggio), g.km || '–', g.pasti ? g.pasti + (g.pasto && g.pasto !== 'pranzo e cena' ? ' (' + g.pasto.replace('solo ', '') + ')' : '') : '–', g.gar ? 'sì' : '', g.fest ? g.fest + (g.att ? ' · ' + g.att : '') : g.att]));
  t('Ore in ore uomo (ore × nr. tecnici). Sabati, domeniche e festivi sono tutti a tariffa extra.', L, y, { sz: 7, c: '#666666' }); y += 6;

  const note = [info.note, ...A.avvisi].filter(Boolean);
  if (note.length) { spazio(8 + note.length * 5); t('Note', L, y, { b: true, sz: 9 }); y += 5; note.forEach((s) => { const w = doc.splitTextToSize('• ' + s, W); spazio(w.length * 4.5); t(w, L, y, { sz: 8.5 }); y += w.length * 4.5; }); }
  const tot = doc.getNumberOfPages();
  for (let i = 1; i <= tot; i++) { doc.setPage(i); t(`${r.num || ''} · pagina ${i} di ${tot}`, R, 290, { sz: 7, c: '#888888', al: 'right' }); }
  return doc;
}
