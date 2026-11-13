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
  /* durata di un viaggio: se partenza e arrivo sono stati presi col tasto «Adesso» in fusi diversi,
     tiene conto della differenza di fuso (daOff / aOff = minuti rispetto a UTC) */
  const DURV = (v) => {
    v = v || {}; const a = tm(v.da), b = tm(v.a); if (a == null || b == null) return 0;
    let d = b - a; if (typeof v.daOff === 'number' && typeof v.aOff === 'number') d -= v.aOff - v.daOff;
    while (d < 0) d += 1440; while (d >= 1440) d -= 1440; return d;
  };
  const viaggi = (g) => [g.v || {}, g.vr || {}];

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
      viaggi(g).forEach(v => { km += +v.km || 0; const vd = DURV(v); viaggio += vd; viaggioU += vd * Math.max(1, +v.nt || 1); });
      const t = g.tr || {}; training += DUR(t.da, t.a);
    });
    return { giorni: (r.giorni || []).length, ord, ext, ordU, extU, ordG, extG, km, viaggio, viaggioU, training, ricambi: (r.ric || []).filter(x => x.cod || x.des).length };
  }

  /* testi del modulo C00007_23 in quattro lingue: la lingua del cliente affiancata all'inglese
     (italiano / inglese come il modulo originale); in inglese solo inglese */
  const T = {
    title:   ["RAPPORTO D' INTERVENTO", 'MAINTENANCE VISIT REPORT', "RAPPORT D'INTERVENTION", 'INFORME DE INTERVENCIÓN'],
    man:     ['MANUTENZIONE', 'MAINTENANCE', 'MAINTENANCE', 'MANTENIMIENTO'],
    inst:    ['INSTALLAZIONE', 'INSTALLATION', 'INSTALLATION', 'INSTALACIÓN'],
    days:    [['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'], ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'], ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']],
    week:    ['Settimana {a} di {b}', 'Week {a} of {b}', 'Semaine {a} sur {b}', 'Semana {a} de {b}'],
    range:   ['dal {a} al {b}', 'from {a} to {b}', 'du {a} au {b}', 'del {a} al {b}'],
    hDate:   ['Data Intervento', 'Date of the visit', "Date de l'intervention", 'Fecha de la intervención'],
    hTec:    ['Nome Tecnico/i Bmtek', 'Name of technician/s Bmtek', 'Nom du/des technicien(s) Bmtek', 'Nombre técnico/s Bmtek'],
    hCli:    ['Ragione sociale', 'Company name', 'Raison sociale', 'Razón social'],
    hInd:    ['Indirizzo', 'Address', 'Adresse', 'Dirección'],
    hCon:    ['Persona di riferimento cliente', 'Customer contact person', 'Contact chez le client', 'Persona de contacto del cliente'],
    hMat:    ['NUMERO DI SERIE MACCHINA', 'SERIAL NUMBER OF THE MACHINE', 'NUMÉRO DE SÉRIE DE LA MACHINE', 'NÚMERO DE SERIE DE LA MÁQUINA'],
    hOre:    ['Ore lavoro macchina', 'Working hours machine', 'Heures de travail machine', 'Horas de trabajo máquina'],
    hSac:    ['Conteggio sacchi', 'Bags counter', 'Compteur de sacs', 'Contador de bolsas'],
    travel:  ['VIAGGIO', 'TRAVEL', 'VOYAGE', 'VIAJE'],
    training:['TRAINING', 'TRAINING', 'FORMATION', 'FORMACIÓN'],
    date:    ['Data', 'Date', 'Date', 'Fecha'],
    from:    ['Dalle ore', 'From time', 'Heure de début', 'Hora de inicio'],
    to:      ['Alle ore', 'To time', 'Heure de fin', 'Hora de fin'],
    km:      ['Km totali percorsi', 'Total km travelled', 'Km totaux parcourus', 'Km totales recorridos'],
    nt:      ['Nr. Tecnici', 'Nr. Technicians', 'Nr de techniciens', 'N.º de técnicos'],
    name:    ['Nome', 'Name', 'Nom', 'Nombre'],
    sign:    ['Firma', 'Signature', 'Signature', 'Firma'],
    assist:  ['ASSISTENZA-INSTALLAZIONE-TRAINING', 'MAINTENANCE-INSTALLATION-TRAINING', 'ASSISTANCE-INSTALLATION-FORMATION', 'ASISTENCIA-INSTALACIÓN-FORMACIÓN'],
    ord:     ['ORE ORDINARIE', 'ORDINARY HRS', 'HEURES ORDINAIRES', 'HORAS ORDINARIAS'],
    ext:     ['ORE EXTRA (DOPO 8 ore lavorative)', 'EXTRA HRS (AFTER 8 working hours)', 'HEURES SUPPL. (APRÈS 8 heures de travail)', 'HORAS EXTRA (TRAS 8 horas de trabajo)'],
    fascia:  ['Dalle ore / Alle ore', 'From time / To time', 'De / À', 'Desde / Hasta'],
    totOrd:  ['TOTALE ORE ORDINARIE', 'TOTAL STANDARD HRS', 'TOTAL HEURES ORDINAIRES', 'TOTAL HORAS ORDINARIAS'],
    gar:     ['IN GARANZIA', 'UNDER WARRANTY', 'SOUS GARANTIE', 'EN GARANTÍA'],
    totExt:  ['TOT. ORE STRAORDINARIE', 'TOTAL EXTRA HRS', 'TOTAL HEURES SUPPL.', 'TOTAL HORAS EXTRA'],
    resp:    ['FIRMA RESPONSABILE', 'SIGNATURE RESPONSIBLE', 'SIGNATURE RESPONSABLE', 'FIRMA RESPONSABLE'],
    yes:     ['SI', 'YES', 'OUI', 'SÍ'],
    no:      ['NO', 'NO', 'NON', 'NO'],
    vFirma:  ['v. firma finale', 'see final signature', 'voir signature finale', 'ver firma final'],
    sTec:    ['Firma del tecnico', 'Signature of the technician', 'Signature du technicien', 'Firma del técnico'],
    sCli:    ['Timbro e firma del cliente', 'Stamp and signature of the customer', 'Cachet et signature du client', 'Sello y firma del cliente'],
    desc:    ['DESCRIZIONE INTERVENTO (eventuali note)', 'INTERVENTION DESCRIPTION (possible notes)', "DESCRIPTION DE L'INTERVENTION (remarques éventuelles)", 'DESCRIPCIÓN DE LA INTERVENCIÓN (posibles notas)'],
    descSeg: ['DESCRIZIONE INTERVENTO (segue)', 'INTERVENTION DESCRIPTION (continued)', "DESCRIPTION DE L'INTERVENTION (suite)", 'DESCRIPCIÓN DE LA INTERVENCIÓN (continuación)'],
    note:    ['Note', 'Notes', 'Remarques', 'Notas'],
    cont:    ['(continua nella pagina seguente)', '(continued on the next page)', '(suite à la page suivante)', '(continúa en la página siguiente)'],
    parts:   ['Codice parti sostituite', 'Part code replaced', 'Code des pièces remplacées', 'Código de piezas sustituidas'],
    qty:     ['Q.tà', 'Q.ty', 'Qté', 'Cant.'],
    partGar: ['Parte in garanzia', 'Part in warranty', 'Pièce sous garantie', 'Pieza en garantía'],
    acc:     ['La firma sul presente documento implica l’accettazione senza riserve dei lavori eseguiti', 'The signature on the present document implies the acceptance without reservations of the performed jobs', 'La signature du présent document implique l’acceptation sans réserve des travaux effectués', 'La firma del presente documento implica la aceptación sin reservas de los trabajos realizados'],
    fatt:    ['Il servizio corrisposto sarà fatturato a fine mese', 'The offered service will be invoiced at the end of the month', 'Le service rendu sera facturé à la fin du mois', 'El servicio prestado se facturará a final de mes'],
    elettr:  ['Firma elettronica raccolta su dispositivo il {a} alle {b} – impronta del rapporto SHA-256: ', 'Electronic signature collected on device on {a} at {b} – report fingerprint SHA-256: ', 'Signature électronique recueillie sur appareil le {a} à {b} – empreinte du rapport SHA-256 : ', 'Firma electrónica recogida en dispositivo el {a} a las {b} – huella del informe SHA-256: '],
  };
  const LINGUE = ['IT', 'EN', 'FR', 'ES'];
  const testi = (lingua) => {
    const i = Math.max(0, LINGUE.indexOf(String(lingua || 'IT').toUpperCase()));
    const solo = (k) => T[k][i];                                                  // solo la lingua del cliente
    const righe = (k) => (i === 1 || T[k][i] === T[k][1] ? [T[k][1]] : [T[k][i], T[k][1]]); // lingua cliente + inglese
    const P = (k, sep = ' / ') => righe(k).join(sep);
    const F = (k, a, b) => solo(k).replace('{a}', a).replace('{b}', b);
    return { i, solo, righe, P, F };
  };
  const FOOT = 'KIMATIC S.R.L. Via G. Matteotti 26, 40057 Loc. CADRIANO di Granarolo dell’Emilia (BO)  Tel.: +39 051 6926178 – e-mail: sales@bmtek.it  P.IVA / C.F.: 03286631209';

  function build(jsPDF, r, logo) {
    const X = testi(r.lingua), DAYS = T.days[X.i];
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
      txt(X.P('date'), L + 35, y + 3.5, { al: 'center', sz: 7 });
      txt(fit(X.P('sTec'), 103, 7), L + 122.5, y + 3.5, { al: 'center', sz: 7 });
      txt(fit(X.P('sCli'), 110, 7), L + 232, y + 3.5, { al: 'center', sz: 7 });
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
    const dataInt = dates.length ? (dates.length === 1 ? fd(dates[0]) : X.F('range', fd(dates[0]), fd(dates[dates.length - 1]))) : '';

    weeks.forEach((wk, wi) => {
      if (wi) doc.addPage();
      // intestazione
      box(L, 4, CW, 30);
      if (logo) try { doc.addImage(logo, 'PNG', L + 2, 6, 47, 25); } catch (e) {}
      const tit = X.righe('title');
      if (tit.length > 1) { txt(tit[0], 148, 15, { sz: 15, i: 1, al: 'center' }); txt(tit[1], 148, 23, { sz: 15, i: 1, al: 'center' }); }
      else txt(tit[0], 148, 19, { sz: 15, i: 1, al: 'center' });
      txt('C00007_23', R - 2, 8, { sz: 7, al: 'right' });
      [['man', X.P('man'), 12], ['inst', X.P('inst'), 18]].forEach(([k, lab, y]) => {
        box(212, y - 3, 3.4, 3.4, 0.3); if (t === k) { line(212.4, y - 2.6, 215, y, 0.4); line(215, y - 2.6, 212.4, y, 0.4); }
        txt(lab, 217, y, { sz: 9, b: 1 });
      });
      txt('Nr. ' + (r.num || ''), 217, 27, { sz: 8.5, b: 1 });
      if (weeks.length > 1) txt(X.F('week', wi + 1, weeks.length), 217, 31.5, { sz: 7 });
      // righe anagrafiche
      const H = [[X.P('hDate'), dataInt], [X.P('hTec'), r.tecnici], [X.P('hCli'), r.cli && r.cli.nome], [X.P('hInd'), r.cli && r.cli.indirizzo], [X.P('hCon'), r.cli && r.cli.contatto], [X.P('hMat'), [r.matr, r.macDesc].filter(Boolean).join('  –  ')], [X.P('hOre'), r.oreMac], [X.P('hSac'), r.sacchi]];
      let y = 34; H.forEach(([k, v]) => { box(L, y, CW, 4.6); txt(fit(k, 106, 7.5), L + 1.5, y + 3.4, { sz: 7.5 }); txt(fit(v, CW - 112, 8.5), L + 110, y + 3.4, { sz: 8.5, b: 1 }); y += 4.6; });
      // viaggio + training
      y += 0.6; const half = CW / 2;
      box(L, y, CW, 5.2); line(L + half + 10, y, L + half + 10, y + 5.2);
      txt(X.P('travel'), L + (half + 10) / 2, y + 3.7, { b: 1, al: 'center', sz: 8 }); txt(X.P('training'), L + half + 10 + (half - 10) / 2, y + 3.7, { b: 1, al: 'center', sz: 8 });
      y += 5.2;
      const cV = [L, L + 12, L + 34, L + 61, L + 88, L + 118, L + half + 10];
      const cT = [L + half + 10, L + half + 34, L + half + 61, L + half + 85, L + half + 116, R];
      const hh = 7;
      box(L, y, CW, hh); [...cV.slice(1), ...cT.slice(1, -1)].forEach(x => line(x, y, x, y + hh));
      const cella = (k, x1, x2, yy, h, sz) => { const L2 = X.righe(k); L2.forEach((q, j) => txt(fit(q, x2 - x1 - 1, sz), (x1 + x2) / 2, yy + (L2.length > 1 ? h / 2 - 0.6 + j * 2.6 : h / 2 + 1.2), { sz, al: 'center' })); };
      ['date', 'from', 'to', 'km', 'nt'].forEach((k, i) => cella(k, cV[i + 1], cV[i + 2], y, hh, 6));
      ['date', 'from', 'to', 'name', 'sign'].forEach((k, i) => cella(k, cT[i], cT[i + 1], y, hh, 6));
      y += hh;
      const rh = 4.75;
      for (let d = 0; d < 7; d++) {
        box(L, y, CW, rh); [...cV.slice(1), ...cT.slice(1, -1)].forEach(x => line(x, y, x, y + rh));
        txt(DAYS[d] + (X.i === 1 ? '' : '/' + T.days[1][d]), L + 1.2, y + 3.3, { sz: 5.5, b: 1, i: 1 });
        const gs = wk.days[d] || []; const g = gs[0];
        if (g) {
          const va = g.v || {}, vr = g.vr || {}, tr = g.tr || {};
          const due = (va.da || va.a) && (vr.da || vr.a);
          const v = due ? { da: 'A ' + (va.da || '–') + ' R ' + (vr.da || '–'), a: 'A ' + (va.a || '–') + ' R ' + (vr.a || '–'), km: (+va.km || 0) + (+vr.km || 0) || '', nt: va.nt || vr.nt }
            : (vr.da || vr.a || vr.km) && !(va.da || va.a || va.km) ? vr : va;
          const c = (x1, x2, s) => txt(s, (x1 + x2) / 2, y + 3.4, { sz: 7.5, al: 'center' });
          if (v.da || v.a || v.km) { c(cV[1], cV[2], fd(g.d)); if (due) { txt(v.da, (cV[2] + cV[3]) / 2, y + 3.4, { sz: 6, al: 'center' }); txt(v.a, (cV[3] + cV[4]) / 2, y + 3.4, { sz: 6, al: 'center' }); } else { c(cV[2], cV[3], v.da); c(cV[3], cV[4], v.a); } c(cV[4], cV[5], v.km); c(cV[5], cV[6], v.nt); }
          if (tr.da || tr.a || tr.nome) { c(cT[0], cT[1], fd(g.d)); c(cT[1], cT[2], tr.da); c(cT[2], cT[3], tr.a); txt(fit(tr.nome, 29, 7), cT[3] + 1, y + 3.4, { sz: 7 }); }
        }
        y += rh;
      }
      // assistenza
      box(L, y, CW, 5.2); txt(X.P('assist', '/'), W / 2, y + 3.7, { b: 1, al: 'center', sz: 8 }); y += 5.2;
      box(L, y, CW, 5); line(L + half + 10, y, L + half + 10, y + 5);
      txt(X.P('ord'), L + (half + 10) / 2, y + 3.5, { b: 1, al: 'center', sz: 6.5 });
      txt(fit(X.P('ext'), half - 12, 6.5), L + half + 10 + (half - 10) / 2, y + 3.5, { b: 1, al: 'center', sz: 6.5 }); y += 5;
      const cO = [L, L + 12, L + 34, L + 61, L + 88, L + 118, L + half + 10];
      const cE = [L + half + 10, L + half + 33, L + half + 60, L + half + 80, L + half + 114, R];
      const h2 = 8.5;
      box(L, y, CW, h2); [...cO.slice(1), ...cE.slice(1, -1)].forEach(x => line(x, y, x, y + h2));
      const cella2 = (k, x1, x2, sz) => { const L2 = X.righe(k); L2.forEach((q, j) => txt(fit(q, x2 - x1 - 1, sz), (x1 + x2) / 2, y + (L2.length > 1 ? 3.3 + j * 3 : 5), { sz, al: 'center' })); };
      ['date', 'fascia', 'fascia', 'totOrd', 'gar'].forEach((k, i) => cella2(k, cO[i + 1], cO[i + 2], 5.8));
      ['fascia', 'totExt', 'gar', 'resp', 'nt'].forEach((k, i) => cella2(k, cE[i], cE[i + 1], 5.3));
      y += h2;
      for (let d = 0; d < 7; d++) {
        box(L, y, CW, rh); [...cO.slice(1), ...cE.slice(1, -1)].forEach(x => line(x, y, x, y + rh));
        txt(DAYS[d] + (X.i === 1 ? '' : '/' + T.days[1][d]), L + 1.2, y + 3.3, { sz: 5.5, b: 1, i: 1 });
        const g = (wk.days[d] || [])[0];
        const c = (x1, x2, s, o) => txt(s, (x1 + x2) / 2, y + 3.4, Object.assign({ sz: 7.5, al: 'center' }, o || {}));
        if (g) {
          const s = split(g), rr = a => a.map(x => hm(x[0]) + ' / ' + hm(x[1]));
          const o = rr(s.ord), e = rr(s.ext);
          if (s.tot) {
            c(cO[1], cO[2], fd(g.d)); c(cO[2], cO[3], o[0] || ''); c(cO[3], cO[4], o.slice(1).join(' ; '), { sz: o.length > 2 ? 5.5 : 7.5 }); c(cO[4], cO[5], hrs(s.tOrd), { b: 1 }); c(cO[5], cO[6], X.solo(g.gar ? 'yes' : 'no'));
            if (s.tExt) { c(cE[0], cE[1], e.join(' ; '), { sz: e.length > 1 ? 5.5 : 7.5 }); c(cE[1], cE[2], hrs(s.tExt), { b: 1 }); c(cE[2], cE[3], X.solo(g.gar ? 'yes' : 'no')); c(cE[3], cE[4], r.firma && r.firma.cli ? X.solo('vFirma') : '', { sz: 6 }); }
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
    box(L, 4, CW, 6); txt(fit(X.P('desc'), CW - 4, 8.5), W / 2, 8.2, { b: 1, al: 'center', sz: 8.5 });
    const ric = (r.ric || []).filter(x => x.cod || x.des);
    const ricRows = Math.max(9, ric.length);
    const ricTop = 200 - 22 - 12 - 5 - ricRows * 4.5;
    // testo descrizione
    const lines = [];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    giorni.forEach(g => { if (!String(g.att || '').trim()) return; const wrapped = doc.splitTextToSize(String(g.att).trim(), CW - 30); wrapped.forEach((l, i) => lines.push([i ? '' : fd(g.d), l])); });
    if (String(r.note || '').trim()) { lines.push(['', '']); doc.splitTextToSize(X.solo('note') + ': ' + String(r.note).trim(), CW - 30).forEach((l, i) => lines.push(['', l])); }
    const lh = 4.4, avail = Math.floor((ricTop - 10.5) / lh);
    let y = 10;
    for (let i = 0; i < avail; i++) { line(L, y + lh, R, y + lh, 0.1); y += lh; }
    line(L, 10, L, ricTop); line(R, 10, R, ricTop);
    const shown = lines.slice(0, avail);
    shown.forEach((l, i) => { if (l[0]) txt(l[0], L + 2, 10 + lh * (i + 1) - 1.1, { sz: 7.5, b: 1 }); txt(l[1], L + 24, 10 + lh * (i + 1) - 1.1, { sz: 8.5 }); });
    if (lines.length > avail) txt(X.solo('cont'), R - 2, 10 + lh * avail - 1.1, { sz: 7, i: 1, al: 'right' });
    // ricambi
    y = ricTop; const c1 = L + 200, c2 = L + 222;
    box(L, y, CW, 5); line(c1, y, c1, y + 5); line(c2, y, c2, y + 5);
    txt(X.P('parts', '  /  '), (L + c1) / 2, y + 3.6, { b: 1, al: 'center', sz: 8.5 }); txt(fit(X.P('qty', '/'), c2 - c1 - 1, 8.5), (c1 + c2) / 2, y + 3.6, { b: 1, al: 'center', sz: 8.5 }); txt(fit(X.P('partGar'), R - c2 - 1, 8.5), (c2 + R) / 2, y + 3.6, { b: 1, al: 'center', sz: 8.5 });
    y += 5;
    for (let i = 0; i < ricRows; i++) {
      box(L, y, CW, 4.5, 0.1); line(c1, y, c1, y + 4.5, 0.1); line(c2, y, c2, y + 4.5, 0.1);
      const x = ric[i]; if (x) { txt(fit([x.cod, x.des].filter(Boolean).join('  –  '), c1 - L - 4, 8), L + 2, y + 3.3, { sz: 8 }); txt(x.q, (c1 + c2) / 2, y + 3.3, { al: 'center', sz: 8 }); txt(X.solo(x.gar ? 'yes' : 'no'), (c2 + R) / 2, y + 3.3, { al: 'center', sz: 8 }); }
      y += 4.5;
    }
    signRow(y, 200 - 12 - y);
    y = 200 - 12; box(L, y, CW, 12);
    txt(fit(X.P('acc', '  /  '), CW - 3, 6.3), L + 1.5, y + 3.4, { sz: 6.3 });
    txt(fit(X.P('fatt', '  /  '), CW - 3, 6.3), L + 1.5, y + 6.8, { sz: 6.3 });
    if (r.firma && r.firma.hash) txt(X.F('elettr', fd(r.firma.ts.slice(0, 10)), r.firma.ts.slice(11, 16)) + r.firma.hash, L + 1.5, y + 10.4, { sz: 5.6, c: '#444444' });
    footer();
    // eventuale pagina di continuazione
    if (lines.length > avail) {
      let rest = lines.slice(avail);
      while (rest.length) {
        doc.addPage(); box(L, 4, CW, 6); txt(fit(X.P('descSeg'), CW - 4, 8.5), W / 2, 8.2, { b: 1, al: 'center', sz: 8.5 });
        const per = Math.floor((196 - 10) / lh); let yy = 10;
        rest.slice(0, per).forEach(l => { line(L, yy + lh, R, yy + lh, 0.1); if (l[0]) txt(l[0], L + 2, yy + lh - 1.1, { sz: 7.5, b: 1 }); txt(l[1], L + 24, yy + lh - 1.1, { sz: 8.5 }); yy += lh; });
        rest = rest.slice(per); footer();
      }
    }
    return doc;
  }
  /* notte fuori sede: scelta del tecnico; se non indicata, sì quando il giorno dopo
     c'è un'altra giornata dello stesso rapporto (il tecnico non è rientrato) */
  function notte(r, g) {
    if (g.notte === true || g.notte === false) return g.notte;
    const n = d2n(g.d); if (n == null) return false;
    return (r.giorni || []).some(x => d2n(x.d) === n + 1);
  }

  return { build, split, totals, notte, tm, hm, hrs, fd, d2n, n2s, dow, DUR, DURV, viaggi };
})();
