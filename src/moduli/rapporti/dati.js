// @ts-nocheck
// Adattatore: offre al modulo la stessa interfaccia «collezioni e documenti» della versione
// su claude.ai, ma legge e scrive sulle tabelle Supabase. I permessi li controlla il database.

const TABELLE = {
  rapporti: {
    tabella: 'rapporti', chiave: 'id', campi: 'id,dati,creato_da',
    leggi: (r) => ({ ...r.dati, by: r.creato_da }),
    scrivi: (id, d) => { const { by, ...dati } = d; return { id, dati }; },
  },
  clienti: {
    tabella: 'clienti', chiave: 'id', campi: 'id,nome,dati',
    leggi: (r) => ({ ...r.dati, nome: r.nome }),
    scrivi: (id, d) => { const { nome, ...dati } = d; return { id, nome, dati }; },
  },
  fatture: {
    tabella: 'fatture_rapporti', chiave: 'rapporto_id', campi: 'rapporto_id,dati',
    leggi: (r) => r.dati,
    scrivi: (id, d) => ({ rapporto_id: id, dati: d }),
  },
  listini: {
    tabella: 'listini_assistenza', chiave: 'id', campi: 'id,dati',
    leggi: (r) => r.dati,
    scrivi: (id, d) => ({ id, dati: d }),
  },
  addebiti: {
    tabella: 'addebiti_rapporti', chiave: 'rapporto_id', campi: 'rapporto_id,dati',
    leggi: (r) => r.dati,
    scrivi: (id, d) => ({ rapporto_id: id, dati: d }),
  },
};

export function creaDb(supabase) {
  const ascolti = {};   // collezione -> [{ok, err}]
  const ultimi = {};    // collezione -> Set di id presenti
  let timer = null;

  async function carica(nome) {
    const t = TABELLE[nome];
    // a pagine da 1000 righe (limite di Supabase per ogni richiesta)
    let data = [], error = null;
    for (let da = 0; ; da += 1000) {
      const res = await supabase.from(t.tabella).select(t.campi).order(t.chiave).range(da, da + 999);
      if (res.error) { error = res.error; break; }
      data = data.concat(res.data || []);
      if (!res.data || res.data.length < 1000) break;
    }
    const L = ascolti[nome] || [];
    if (error) { L.forEach((a) => a.err && a.err(error)); return; }
    ultimi[nome] = new Set(data.map((r) => r[t.chiave]));
    const qs = { docs: data.map((r) => ({ id: r[t.chiave], data: () => t.leggi(r) })) };
    L.forEach((a) => a.ok(qs));
  }
  const ricaricaTutto = () => Object.keys(ascolti).forEach(carica);
  const alRitorno = () => { if (document.visibilityState === 'visible') ricaricaTutto(); };
  document.addEventListener('visibilitychange', alRitorno);
  window.addEventListener('focus', ricaricaTutto);
  timer = setInterval(ricaricaTutto, 30000);

  function percorso(p) {
    const [nome, id] = p.split('/');
    if (!TABELLE[nome] || !id) throw new Error('Percorso non valido: ' + p);
    return { nome, id, t: TABELLE[nome] };
  }

  return {
    collection(nome) {
      return {
        onSnapshot(ok, err) {
          (ascolti[nome] ||= []).push({ ok, err });
          carica(nome);
          return () => { ascolti[nome] = (ascolti[nome] || []).filter((a) => a.ok !== ok); };
        },
      };
    },
    doc(p) {
      const { nome, id, t } = percorso(p);
      return {
        async set(d) {
          const riga = t.scrivi(id, d);
          if (nome === 'rapporti' && ultimi[nome]?.has(id)) {
            const { data, error } = await supabase.from(t.tabella).update({ dati: riga.dati }).eq(t.chiave, id).select('id');
            if (error) throw error;
            if (!data.length) throw new Error('Modifica non permessa');
          } else {
            const { error } = await supabase.from(t.tabella).upsert(riga);
            if (error) throw error;
            (ultimi[nome] ||= new Set()).add(id);
          }
          carica(nome);
        },
        async delete() {
          const { data, error } = await supabase.from(t.tabella).delete().eq(t.chiave, id).select(t.chiave);
          if (error) throw error;
          if (!data.length) throw new Error('Cancellazione non permessa');
          carica(nome);
        },
      };
    },
    stop() {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alRitorno);
      window.removeEventListener('focus', ricaricaTutto);
    },
  };
}
