// @ts-nocheck
// Importo da fatturare di un rapporto firmato, secondo il listino assistenza (Service Price List).
// Regole:
//  - lavoro: prime 8 ore del giorno feriale a tariffa ordinaria, il resto a tariffa extra;
//    sabato, domenica e festivi interamente a tariffa extra; × nr. tecnici della giornata;
//    le giornate segnate «in garanzia» non si addebitano (né lavoro né viaggio né km né pasti).
//  - viaggio: per tecnico e per giornata le prime 8 ore a tariffa «fino a 8 ore», le successive a quella «oltre 8 ore».
//  - km: auto o furgone, a scelta per il rapporto.
//  - pasti: indennità per tecnico e per giornata, se il cliente non li paga.
//  - viaggi, alloggio e trasporti locali: a costo, importi scritti a mano.
import { RI } from './pdf.js';
import { festivo } from './reportOre.js';

export const LISTINO_BASE = { ore: 65, oreExtra: 75, viaggio: 35, viaggioOltre: 40, kmAuto: 0.7, kmFurgone: 0.8, pasto: 25, remoto: 55, officina: 55 };

const UE = /\b(ital[iy]a?|austria|belgi(o|um|que)|bulgaria|cipro|cyprus|croazia|croatia|danimarca|denmark|estonia|finlandia|finland|suomi|francia|france|germania|germany|deutschland|grecia|greece|irlanda|ireland|lettonia|latvia|lituania|lithuania|lussemburgo|luxembourg|malta|olanda|paesi bassi|netherlands|polonia|poland|polska|portogallo|portugal|rep\.? ceca|repubblica ceca|czech|česko|romania|slovacchia|slovakia|slovenia|spagna|spain|españa|svezia|sweden|ungheria|hungary|magyarország)\b/i;
// Listino proposto dal paese del cliente: Unione europea (Italia compresa) o extra Europa
export function listinoPerPaese(paese) {
  if (!paese) return { id: 'EU', certo: false };
  return { id: UE.test(paese) ? 'EU' : 'EXTRA_EU', certo: true };
}

const h = (min) => Math.round(min / 6) / 10; // ore al decimo
const eur = (x) => Math.round(x * 100) / 100;

// r: rapporto; L: prezzi del listino; o: opzioni dell'addebito (addebiti_rapporti.dati)
export function calcola(r, L, o) {
  L = Object.assign({}, LISTINO_BASE, L || {}); o = o || {};
  let ord = 0, ext = 0, vIn = 0, vOl = 0, km = 0, pasti = 0, gar = 0;
  const avvisi = [];
  for (const g of r.giorni || []) {
    const nt = Math.max(1, +g.nt || 1), s = RI.split(g);
    if (g.gar) { gar++; continue; }
    const n = RI.d2n(g.d), extraGiorno = n != null && (RI.dow(n) >= 5 || !!festivo(g.d));
    if (extraGiorno) ext += (s.tOrd + s.tExt) * nt; else { ord += s.tOrd * nt; ext += s.tExt * nt; }
    let usato = 0, viaggiato = false;
    for (const v of RI.viaggi(g)) {
      const d = RI.DURV(v), vnt = Math.max(1, +v.nt || nt);
      km += +v.km || 0;
      if (!d) continue; viaggiato = true;
      const dentro = Math.min(d, Math.max(0, 480 - usato));
      vIn += dentro * vnt; vOl += (d - dentro) * vnt; usato += d;
    }
    if (s.tot || viaggiato) pasti += nt;
  }
  if (gar) avvisi.push(gar === 1 ? '1 giornata in garanzia non addebitata' : gar + ' giornate in garanzia non addebitate');
  if ((r.ric || []).some((x) => x.cod || x.des)) avvisi.push('parti sostituite da quotare a parte');
  const furgone = o.veicolo === 'furgone';
  const R = [
    ['Ore di lavoro (giorni feriali, fino a 8 ore/giorno)', h(ord), 'h', L.ore],
    ['Ore extra, sabato, domenica e festivi', h(ext), 'h', L.oreExtra],
    ['Ore di viaggio (fino a 8 ore/giorno)', h(vIn), 'h', L.viaggio],
    ['Ore di viaggio (oltre 8 ore/giorno)', h(vOl), 'h', L.viaggioOltre],
    [furgone ? 'Rimborso km (furgone)' : 'Rimborso km (auto)', o.km === false ? 0 : km, 'km', furgone ? L.kmFurgone : L.kmAuto],
    ['Indennità pasti (giorni × tecnici)', o.pasti === false ? 0 : pasti, 'n.', L.pasto],
    ['Ore di assistenza da remoto', +o.oreRemote || 0, 'h', L.remoto],
    ['Ore di premontaggio/lavoro in Kimatic', +o.oreOfficina || 0, 'h', L.officina],
  ].map(([voce, qta, um, prezzo]) => ({ voce, qta, um, prezzo: +prezzo || 0, importo: eur(qta * (+prezzo || 0)) }));
  const costi = [['Spese di viaggio (a costo)', o.speseViaggio], ['Alloggio e trasporti locali (a costo)', o.alloggio], ['Altre spese (a costo)', o.altre]]
    .map(([voce, x]) => ({ voce, qta: 1, um: '', prezzo: eur(+x || 0), importo: eur(+x || 0), costo: true }));
  const righe = R.concat(costi).filter((x) => x.importo || (!x.costo && x.qta));
  return { righe, totale: eur(righe.reduce((t, x) => t + x.importo, 0)), avvisi };
}
