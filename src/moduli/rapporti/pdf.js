// @ts-nocheck
// Rapporto d'intervento: PDF con lo stesso schema del modulo C00007_23 (A4 orizzontale).
// Portato senza modifiche dalla versione su claude.ai.
export const RI = (function () {
  const pad = n => String(n).padStart(2, '0');
  const tm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const hm = n => pad(Math.floor(n / 60) % 24) + ':' + pad(n % 60);
  const hrs = n => { const h = Math.round(n / 6) / 10; return (Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', ',')); };
  const d2n = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null; };
  const n2s = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const fd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
  const dow = n => (((n + 3) % 7) + 7) % 7; // 0 = lunedì
  const DUR = (a, b) => { a = tm(a); b = tm(b); if (a == null || b == null) return 0; let d = b - a; if (d < 0) d += 1440; return d; };

  /* divide le fasce di lavoro: le prime 8 ore sono ordinarie, il resto straordinario */
  function split(day) {
    const ord = [], ext = []; let used = 0;
    (day.f || []).forEach(f => {
      const a = tm(f.da), d = DUR(f.da, f.a); if (a == null || !d) return;
      const left = Math.max(0, 480 - used);
      if (d <= left) ord.push([a, a + d]);
      else if (left > 0) { ord.push([a, a + left]); ext.push([a + left, a + d]); }
      else ext.push([a, a + d]);
      used += d;
    });
    const sum = r => r.reduce((s, x) => s + x[1] - x[0], 0);
    return { ord, ext, tOrd: sum(ord), tExt: sum(ext), tot: used };
  }
  function totals(r) {
    let ord = 0, ext = 0, ordU = 0, extU = 0, ordG = 0, extG = 0, km = 0, viaggio = 0, viaggioU = 0, training = 0;
    (r.giorni || []).forEach(g => {
      const s = split(g), nt = Math.max(1, +g.nt || 1);
      ord += s.tOrd; ext += s.tExt; ordU += s.tOrd * nt; extU += s.tExt * nt;
      if (g.gar) { ordG += s.tOrd * nt; extG += s.tExt * nt; }
      const v = g.v || {}; km += +v.km || 0; const vd = DUR(v.da, v.a); viaggio += vd; viaggioU += vd * Math.max(1, +v.nt || 1);
      const t = g.tr || {}; training += DUR(t.da, t.a);
    });
    return { giorni: (r.giorni || []).length, ord, ext, ordU, extU, ordG, extG, km, viaggio, viaggioU, training, ricambi: (r.ric || []).filter(x => x.cod || x.des).length };
  }

  const LAB = {
    it: { title: "RAPPORTO D' INTERVENTO", man: 'MANUTENZIONE', inst: 'INSTALLAZIONE' },
    en: { title: 'MAINTENANCE VISIT REPORT', man: 'MAINTENANCE', inst: 'INSTALLATION' }
  };
  const DAYS = [['LUN', 'MON'], ['MAR', 'TUE'], ['MER', 'WED'], ['GIO', 'THU'], ['VEN', 'FRI'], ['SAB', 'SAT'], ['DOM', 'SUN']];
  const FOOT = 'KIMATIC S.R.L. Via G. Matteotti 26, 40057 Loc. CADRIANO di Granarolo dell’Emilia (BO)  Tel.: +39 051 6926178 – e-mail: sales@bmtek.it  P.IVA / C.F.: 03286631209';

  function build(jsPDF, r, logo) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, L = 8, R = 289, CW = R - L;
    const line = (x1, y1, x2, y2, w) => { doc.setLineWidth(w || 0.2); doc.line(x1, y1, x2, y2); };
    const box = (x, y, w, h, lw) => { doc.setLineWidth(lw || 0.2); doc.rect(x, y, w, h); };
    const txt = (s, x, y, o) => { o = o || {}; doc.setFont('helvetica', o.b ? 'bold' : (o.i ? 'italic' : 'normal')); doc.setFontSize(o.sz || 8); doc.setTextColor(o.c || '#000000'); doc.text(String(s == null ? '' : s), x, y, { align: o.al || 'left', maxWidth: o.mw, baseline: o.bl || 'alphabetic' }); };
    const fit = (s, w, sz) => { doc.setFontSize(sz); let t = String(s || ''); while (t && doc.getTextWidth(t) > w) t = t.slice(0, -1); return t.length < String(s || '').length ? t.slice(0, -1) + '…' : t; };
    const footer = () => {
      box(L, 200, CW, 6);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor('#d0021b');
      const k = 'KIMATIC'; const rest = FOOT.slice(k.length); const wk = doc.getTextWidth(k);
      doc.setFont('helvetica', 'normal'); const wr = doc.getTextWidth(rest);
      const x0 = W / 2 - (wk + wr) / 2;
      doc.setFont('helvetica', 'bold'); doc.setTextColor('#d0021b'); doc.text(k, x0, 204);
      doc.setFont('helvetica', 'normal'); doc.setTextColor('#000000'); doc.text(rest, x0 + wk, 204);
    };
    const signRow = (y, h) => {
      box(L, y, CW, h);
      line(L + 70, y, L + 70, y + h); line(L + 175, y, L + 175, y + h);
      txt('Data / Date', L + 35, y + 3.5, { al: 'center', sz: 7 });
      txt('Firma del tecnico / Signature of the technician', L + 122.5, y + 3.5, { al: 'center', sz: 7 });
      txt('Timbro e firma del cliente / Stamp and signature of the customer', L + 232, y + 3.5, { al: 'center', sz: 7 });
      const f = r.firma || {};
      if (f.ts) txt(fd(f.ts.slice(0, 10)) + '  ' + f.ts.slice(11, 16), L + 35, y + h / 2 + 3, { al: 'center', sz: 10 });
      if (f.tec) try { doc.addImage(f.tec, 'PNG', L + 92, y + 4.5, 60, h - 9); } catch (e) {}
      if (f.tecNome) txt(f.tecNome, L + 122.5, y + h - 1.5, { al: 'center', sz: 6.5 });
      if (f.cli) try { doc.addImage(f.cli, 'PNG', L + 202, y + 4.5, 60, h - 9); } catch (e) {}
      if (f.cliNome) txt(f.cliNome, L + 232, y + h - 1.5, { al: 'center', sz: 6.5 });
    };
    const t = r.tipo;
    const giorni = (r.giorni || []).filter(g => d2n(g.d) != null).slice().sort((a, b) => a.d.localeCompare(b.d));
    const weeks = []; giorni.forEach(g => { const n = d2n(g.d), mo = n - dow(n); let wk = weeks.find(w => w.mo === mo); if (!wk) weeks.push(wk = { mo, days: {} }); (wk.days[dow(n)] ??= []).push(g); });
    if (!weeks.length) weeks.push({ mo: null, days: {} });
    const dates = giorni.map(g => g.d);
    const dataInt = dates.length ? (dates.length === 1 ? fd(dates[0]) : 'dal ' + fd(dates[0]) + ' al ' + fd(dates[dates.length - 1])) : '';

    weeks.forEach((wk, wi) => {
      if (wi) doc.addPage();
      // intestazione
      box(L, 4, CW, 30);
      if (logo) try { doc.addImage(logo, 'PNG', L + 2, 6, 47, 25); } catch (e) {}
      txt(LAB.it.title, 148, 15, { sz: 15, i: 1, al: 'center' });
      txt(LAB.en.title, 148, 23, { sz: 15, i: 1, al: 'center' });
      txt('C00007_23', R - 2, 8, { sz: 7, al: 'right' });
      [['man', 'MANUTENZIONE / MAINTENANCE', 12], ['inst', 'INSTALLAZIONE / INSTALLATION', 18]].forEach(([k, lab, y]) => {
        box(212, y - 3, 3.4, 3.4, 0.3); if (t === k) { line(212.4, y - 2.6, 215, y, 0.4); line(215, y - 2.6, 212.4, y, 0.4); }
        txt(lab, 217, y, { sz: 9, b: 1 });
      });
      txt('Nr. ' + (r.num || ''), 217, 27, { sz: 8.5, b: 1 });
      if (weeks.length > 1) txt('Settimana ' + (wi + 1) + ' di ' + weeks.length, 217, 31.5, { sz: 7 });
      // righe anagrafiche
      const H = [['Data Intervento / Date of the visit', dataInt], ['Nome Tecnico/i Bmtek - Name of technician/s Bmtek', r.tecnici], ['Ragione sociale / Company name', r.cli && r.cli.nome], ['Indirizzo / Address', r.cli && r.cli.indirizzo], ['Persona di riferimento cliente / Customer contact person', r.cli && r.cli.contatto], ['NUMERO DI SERIE MACCHINA / SERIAL NUMBER OF THE MACHINE', [r.matr, r.macDesc].filter(Boolean).join('  –  ')], ['Ore lavoro macchina / Working hours machine', r.oreMac], ['Conteggio sacchi / Bags counter', r.sacchi]];
      let y = 34; H.forEach(([k, v]) => { box(L, y, CW, 4.6); txt(k, L + 1.5, y + 3.4, { sz: 7.5 }); txt(fit(v, CW - 112, 8.5), L + 110, y + 3.4, { sz: 8.5, b: 1 }); y += 4.6; });
      // viaggio + training
      y += 0.6; const half = CW / 2;
      box(L, y, CW, 5.2); line(L + half + 10, y, L + half + 10, y + 5.2);
      txt('VIAGGIO / TRAVEL', L + (half + 10) / 2, y + 3.7, { b: 1, al: 'center', sz: 8 }); txt('TRAINING', L + half + 10 + (half - 10) / 2, y + 3.7, { b: 1, al: 'center', sz: 8 });
      y += 5.2;
      const cV = [L, L + 12, L + 34, L + 61, L + 88, L + 118, L + half + 10];
      const cT = [L + half + 10, L + half + 34, L + half + 61, L + half + 85, L + half + 116, R];
      const hh = 7;
      box(L, y, CW, hh); [...cV.slice(1), ...cT.slice(1, -1)].forEach(x => line(x, y, x, y + hh));
      ['Data/Date', 'Dalle ore / From time', 'Alle ore / to time', 'Km totali percorsi', 'Nr. Tecnici /\nNr. Technicians'].forEach((s, i) => txt(s, (cV[i + 1] + cV[i + 2]) / 2, y + (s.includes('\n') ? 2.8 : 4.4), { sz: 6.5, al: 'center' }));
      ['Data/Date', 'Dalle ore / From time', 'Alle ore / To time', 'Nome / Name', 'Firma / Signature'].forEach((s, i) => txt(s, (cT[i] + cT[i + 1]) / 2, y + 4.4, { sz: 6.5, al: 'center' }));
      y += hh;
      const rh = 4.75;
      for (let d = 0; d < 7; d++) {
        box(L, y, CW, rh); [...cV.slice(1), ...cT.slice(1, -1)].forEach(x => line(x, y, x, y + rh));
        txt(DAYS[d][0] + '/' + DAYS[d][1], L + 1.2, y + 3.3, { sz: 5.5, b: 1, i: 1 });
        const gs = wk.days[d] || []; const g = gs[0];
        if (g) {
          const v = g.v || {}, tr = g.tr || {};
          const c = (x1, x2, s) => txt(s, (x1 + x2) / 2, y + 3.4, { sz: 7.5, al: 'center' });
          if (v.da || v.a || v.km) { c(cV[1], cV[2], fd(g.d)); c(cV[2], cV[3], v.da); c(cV[3], cV[4], v.a); c(cV[4], cV[5], v.km); c(cV[5], cV[6], v.nt); }
          if (tr.da || tr.a || tr.nome) { c(cT[0], cT[1], fd(g.d)); c(cT[1], cT[2], tr.da); c(cT[2], cT[3], tr.a); txt(fit(tr.nome, 29, 7), cT[3] + 1, y + 3.4, { sz: 7 }); }
        }
        y += rh;
      }
      // assistenza
      box(L, y, CW, 5.2); txt('ASSISTENZA-INSTALLAZIONE-TRAINING/MAINTENANCE-INSTALLATION-TRAINING', W / 2, y + 3.7, { b: 1, al: 'center', sz: 8 }); y += 5.2;
      box(L, y, CW, 5); line(L + half + 10, y, L + half + 10, y + 5);
      txt('ORE ORDINARIE/ ORDINARY HRS', L + (half + 10) / 2, y + 3.5, { b: 1, al: 'center', sz: 6.5 });
      txt('ORE EXTRA/ EXTRA HRS  (DOPO 8 ore lavorative - AFTER 8 working hours)', L + half + 10 + (half - 10) / 2, y + 3.5, { b: 1, al: 'center', sz: 6.5 }); y += 5;
      const cO = [L, L + 12, L + 34, L + 61, L + 88, L + 118, L + half + 10];
      const cE = [L + half + 10, L + half + 33, L + half + 60, L + half + 80, L + half + 114, R];
      const h2 = 8.5;
      box(L, y, CW, h2); [...cO.slice(1), ...cE.slice(1, -1)].forEach(x => line(x, y, x, y + h2));
      [['Data/Date'], ['Dalle ore / Alle ore', 'From time / To time'], ['Dalle ore / Alle ore', 'From time / To time'], ['TOTALE ORE ORDINARIE', 'TOTAL STANDARD HRS'], ['IN GARANZIA/', 'UNDER WARRANTY']].forEach((s, i) => s.forEach((q, j) => txt(q, (cO[i + 1] + cO[i + 2]) / 2, y + (s.length > 1 ? 3.3 + j * 3 : 5), { sz: 5.8, al: 'center' })));
      [['Dalle ore / Alle ore', 'From time / To time'], ['TOT. ORE STRAORDINARIE/', 'TOTAL EXTRA HRS'], ['IN GARANZIA/', 'UNDER WARRANTY'], ['FIRMA RESPONSABILE/', 'SIGNATURE RESPONSIBLE'], ['Nr. Tecnici/', 'Nr. Technicians']].forEach((s, i) => s.forEach((q, j) => txt(q, (cE[i] + cE[i + 1]) / 2, y + 3.3 + j * 3, { sz: 5.3, al: 'center' })));
      y += h2;
      for (let d = 0; d < 7; d++) {
        box(L, y, CW, rh); [...cO.slice(1), ...cE.slice(1, -1)].forEach(x => line(x, y, x, y + rh));
        txt(DAYS[d][0] + '/' + DAYS[d][1], L + 1.2, y + 3.3, { sz: 5.5, b: 1, i: 1 });
        const g = (wk.days[d] || [])[0];
        const c = (x1, x2, s, o) => txt(s, (x1 + x2) / 2, y + 3.4, Object.assign({ sz: 7.5, al: 'center' }, o || {}));
        if (g) {
          const s = split(g), rr = a => a.map(x => hm(x[0]) + ' / ' + hm(x[1]));
          const o = rr(s.ord), e = rr(s.ext);
          if (s.tot) {
            c(cO[1], cO[2], fd(g.d)); c(cO[2], cO[3], o[0] || ''); c(cO[3], cO[4], o.slice(1).join(' ; '), { sz: o.length > 2 ? 5.5 : 7.5 }); c(cO[4], cO[5], hrs(s.tOrd), { b: 1 }); c(cO[5], cO[6], g.gar ? 'SI' : 'NO');
            if (s.tExt) { c(cE[0], cE[1], e.join(' ; '), { sz: e.length > 1 ? 5.5 : 7.5 }); c(cE[1], cE[2], hrs(s.tExt), { b: 1 }); c(cE[2], cE[3], g.gar ? 'SI' : 'NO'); c(cE[3], cE[4], r.firma && r.firma.cli ? 'v. firma finale' : '', { sz: 6 }); }
            c(cE[4], cE[5], g.nt || '');
          }
        } else { c(cO[2], cO[3], '/', { c: '#888888' }); c(cO[3], cO[4], '/', { c: '#888888' }); c(cE[0], cE[1], '/', { c: '#888888' }); }
        y += rh;
      }
      signRow(y, 200 - y);
      footer();
    });

    // pagina 2: descrizione, ricambi
    doc.addPage();
    box(L, 4, CW, 6); txt('DESCRIZIONE INTERVENTO (eventuali note) / INTERVENTION DESCRIPTION (possible notes)', W / 2, 8.2, { b: 1, al: 'center', sz: 8.5 });
    const ric = (r.ric || []).filter(x => x.cod || x.des);
    const ricRows = Math.max(9, ric.length);
    const ricTop = 200 - 22 - 12 - 5 - ricRows * 4.5;
    // testo descrizione
    const lines = [];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    giorni.forEach(g => { if (!String(g.att || '').trim()) return; const wrapped = doc.splitTextToSize(String(g.att).trim(), CW - 30); wrapped.forEach((l, i) => lines.push([i ? '' : fd(g.d), l])); });
    if (String(r.note || '').trim()) { lines.push(['', '']); doc.splitTextToSize('Note: ' + String(r.note).trim(), CW - 30).forEach((l, i) => lines.push(['', l])); }
    const lh = 4.4, avail = Math.floor((ricTop - 10.5) / lh);
    let y = 10;
    for (let i = 0; i < avail; i++) { line(L, y + lh, R, y + lh, 0.1); y += lh; }
    line(L, 10, L, ricTop); line(R, 10, R, ricTop);
    const shown = lines.slice(0, avail);
    shown.forEach((l, i) => { if (l[0]) txt(l[0], L + 2, 10 + lh * (i + 1) - 1.1, { sz: 7.5, b: 1 }); txt(l[1], L + 24, 10 + lh * (i + 1) - 1.1, { sz: 8.5 }); });
    if (lines.length > avail) txt('(continua nella pagina seguente)', R - 2, 10 + lh * avail - 1.1, { sz: 7, i: 1, al: 'right' });
    // ricambi
    y = ricTop; const c1 = L + 200, c2 = L + 222;
    box(L, y, CW, 5); line(c1, y, c1, y + 5); line(c2, y, c2, y + 5);
    txt('Codice parte sostituite  /  Part code replaced', (L + c1) / 2, y + 3.6, { b: 1, al: 'center', sz: 8.5 }); txt('Q.ty', (c1 + c2) / 2, y + 3.6, { b: 1, al: 'center', sz: 8.5 }); txt('Parte in garanzia / Part in warranty', (c2 + R) / 2, y + 3.6, { b: 1, al: 'center', sz: 8.5 });
    y += 5;
    for (let i = 0; i < ricRows; i++) {
      box(L, y, CW, 4.5, 0.1); line(c1, y, c1, y + 4.5, 0.1); line(c2, y, c2, y + 4.5, 0.1);
      const x = ric[i]; if (x) { txt(fit([x.cod, x.des].filter(Boolean).join('  –  '), c1 - L - 4, 8), L + 2, y + 3.3, { sz: 8 }); txt(x.q, (c1 + c2) / 2, y + 3.3, { al: 'center', sz: 8 }); txt(x.gar ? 'SI' : 'NO', (c2 + R) / 2, y + 3.3, { al: 'center', sz: 8 }); }
      y += 4.5;
    }
    signRow(y, 200 - 12 - y);
    y = 200 - 12; box(L, y, CW, 12);
    txt('La firma sul presente documento implica l’accettazione senza riserve dei lavori eseguiti  /  The signature on the present document implicates the acceptance without reservations of the  performed jobs', L + 1.5, y + 3.4, { sz: 6.3 });
    txt('Il servizio corrisposto sarà fatturato a fine mese  /  The offered service will be invoiced at the end of the month', L + 1.5, y + 6.8, { sz: 6.3 });
    if (r.firma && r.firma.hash) txt('Firma elettronica raccolta su dispositivo il ' + fd(r.firma.ts.slice(0, 10)) + ' alle ' + r.firma.ts.slice(11, 16) + ' – impronta del rapporto SHA-256: ' + r.firma.hash, L + 1.5, y + 10.4, { sz: 5.6, c: '#444444' });
    footer();
    // eventuale pagina di continuazione
    if (lines.length > avail) {
      let rest = lines.slice(avail);
      while (rest.length) {
        doc.addPage(); box(L, 4, CW, 6); txt('DESCRIZIONE INTERVENTO (segue) / INTERVENTION DESCRIPTION (continued)', W / 2, 8.2, { b: 1, al: 'center', sz: 8.5 });
        const per = Math.floor((196 - 10) / lh); let yy = 10;
        rest.slice(0, per).forEach(l => { line(L, yy + lh, R, yy + lh, 0.1); if (l[0]) txt(l[0], L + 2, yy + lh - 1.1, { sz: 7.5, b: 1 }); txt(l[1], L + 24, yy + lh - 1.1, { sz: 8.5 }); yy += lh; });
        rest = rest.slice(per); footer();
      }
    }
    return doc;
  }
  return { build, split, totals, tm, hm, hrs, fd, d2n, n2s, dow, DUR };
})();
