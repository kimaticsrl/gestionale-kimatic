// @ts-nocheck
// Strato di compatibilità: il modulo Offerte BMTEK è stato scritto per claude.ai e usa
// claude.use('user' | 'db' | 'downloads'). Qui quelle funzioni sono fornite dal gestionale:
// i documenti stanno nella tabella bm_docs di Supabase e l'utente è quello collegato.

// Utenti della versione su claude.ai, per mostrare i nomi nello storico delle offerte vecchie
const NOMI_VECCHI = {
  u_h1fbE_KGxfqn3u1j5C7SUw: 'Sara Bartolini',
  u_g9JkLhA0W0NFSJBwLcMyaQ: 'Sofia Passerini',
  u_mooOnpdp92ewgTnrgDofYQ: 'Moreno Roveri',
  u_wlwvfrJlnpIzParWDXsFWA: 'Moreno Roveri',
};
const TUTTI = { costi: true, impost: true, listino: true, offerte: true, utenti: true };

const nuovoId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const copia = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

// Unione profonda come in update(): un campo {__delete__:true} viene tolto
function unisci(base, campi) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(campi)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.__delete__ === true) { delete out[k]; continue; }
      out[k] = unisci(out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? out[k] : {}, v);
    } else out[k] = v;
  }
  return out;
}
const pulisci = (x) => JSON.parse(JSON.stringify(x, (k, v) => (v && typeof v === 'object' && v.__delete__ === true ? undefined : v)));

// tabella: dove stanno i documenti; raccolta: trasforma il percorso usato dalla pagina
// (es. 'data/users/<id>/archivio/componenti') nel nome della raccolta in tabella.
export function creaClaude({ supabase, utente, livello, tabella = 'bm_docs', raccolta = (c) => c, capacita = null }) {
  const gestisce = livello === 'gestisce';
  const modifica = gestisce || livello === 'modifica';
  const [nome, ...resto] = String(utente.nome || '').trim().split(/\s+/);
  const mioProfilo = {
    nome: nome || '', cognome: resto.join(' '), email: utente.email, att: true,
    ruolo: gestisce ? 'Amministratore' : modifica ? 'Commerciale' : 'Sola lettura',
    perm: gestisce ? TUTTI : modifica ? { offerte: true } : {},
  };
  const VIRTUALI = {
    utenti: () => [{ id: utente.id, dati: mioProfilo }],
    richieste: () => [],
  };

  const ascolti = new Map(); // coll -> Set di funzioni di aggiornamento
  async function righe(coll) {
    if (VIRTUALI[coll]) return VIRTUALI[coll]();
    const out = [];
    for (let da = 0; ; da += 1000) {
      const { data, error } = await supabase.from(tabella).select('id,dati').eq('coll', coll).range(da, da + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) return out;
    }
  }
  const avvisa = (coll) => (ascolti.get(coll) || new Set()).forEach((f) => f());
  setInterval(() => ascolti.forEach((s) => s.forEach((f) => f())), 20000);

  const docSnap = (id, dati) => ({ id, exists: dati != null, data: () => copia(dati) });

  function collezione(percorsoPagina, ordine = null, max = null) {
    const coll = raccolta(percorsoPagina);
    const ref = {
      id: percorsoPagina.split('/').pop(), path: percorsoPagina,
      orderBy: (campo, dir = 'asc') => collezione(percorsoPagina, { campo, dir }, max),
      limit: (n) => collezione(percorsoPagina, ordine, n),
      doc: (id) => documento(percorsoPagina + '/' + (id || nuovoId())),
      async add(dati) { const d = documento(percorsoPagina + '/' + nuovoId()); await d.set(dati); return d; },
      onSnapshot(ok, err) {
        let vivo = true;
        const carica = async () => {
          try {
            let L = await righe(coll);
            if (ordine) {
              const s = ordine.dir === 'desc' ? -1 : 1;
              L = L.slice().sort((a, b) => ((a.dati?.[ordine.campo] ?? 0) > (b.dati?.[ordine.campo] ?? 0) ? s : -s));
            }
            if (max) L = L.slice(0, max);
            const docs = L.map((r) => docSnap(r.id, r.dati));
            if (vivo) ok({ docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) });
          } catch (e) { if (vivo && err) err(e); }
        };
        if (!ascolti.has(coll)) ascolti.set(coll, new Set());
        ascolti.get(coll).add(carica);
        carica();
        return () => { vivo = false; ascolti.get(coll)?.delete(carica); };
      },
      async get() {
        const L = await righe(coll);
        const docs = L.map((r) => docSnap(r.id, r.dati));
        return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
      },
    };
    return ref;
  }

  function documento(percorso) {
    const parti = percorso.split('/');
    const id = parti.pop(), coll = raccolta(parti.join('/'));
    const leggi = async () => {
      if (VIRTUALI[coll]) return VIRTUALI[coll]().find((r) => r.id === id)?.dati ?? null;
      const { data, error } = await supabase.from(tabella).select('dati').eq('coll', coll).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? data.dati : null;
    };
    const scrivi = async (dati) => {
      if (VIRTUALI[coll]) return; // utenti e richieste si gestiscono nel gestionale
      const { error } = await supabase.from(tabella).upsert({ coll, id, dati: pulisci(dati) });
      if (error) throw Object.assign(new Error(error.message), { code: 'not_granted' });
      avvisa(coll);
    };
    return {
      id, path: percorso,
      collection: (sotto) => collezione(percorso + '/' + sotto),
      set: (dati) => scrivi(dati),
      async update(campi) { await scrivi(unisci(await leggi(), campi)); },
      async delete() {
        if (VIRTUALI[coll]) return;
        const { error } = await supabase.from(tabella).delete().eq('coll', coll).eq('id', id);
        if (error) throw Object.assign(new Error(error.message), { code: 'not_granted' });
        avvisa(coll);
      },
      async get() { return docSnap(id, await leggi()); },
      onSnapshot(ok, err) {
        let vivo = true;
        const carica = async () => { try { const d = await leggi(); if (vivo) ok(docSnap(id, d)); } catch (e) { if (vivo && err) err(e); } };
        if (!ascolti.has(coll)) ascolti.set(coll, new Set());
        ascolti.get(coll).add(carica);
        carica();
        return () => { vivo = false; ascolti.get(coll)?.delete(carica); };
      },
    };
  }

  const db = { collection: (c) => collezione(c), doc: (p) => documento(p) };

  const nomi = {};
  const user = {
    id: async () => utente.id,
    me: async () => ({ id: utente.id, name: utente.nome || utente.email, email: utente.email, isOwner: gestisce, canEdit: gestisce }),
    isOwner: () => gestisce,
    canEdit: async () => gestisce,
    can: async (k) => (k === 'data.write' ? modifica : null),
    async profiles(ids) {
      const out = {};
      const nuovi = ids.filter((i) => /^[0-9a-f-]{36}$/.test(i) && !(i in nomi));
      if (nuovi.length) {
        const { data } = await supabase.from('profili').select('id,nome,email').in('id', nuovi);
        (data || []).forEach((p) => { nomi[p.id] = p.nome || p.email; });
      }
      ids.forEach((i) => { out[i] = { name: NOMI_VECCHI[i] || nomi[i] || '' }; });
      return out;
    },
    search: async () => [],
  };

  const downloads = {
    async save({ filename, data }) {
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    },
  };

  const cap = capacita ? Object.fromEntries(capacita.map((k) => [k, { user, db, downloads }[k]])) : { user, db, downloads };
  return { use: async (nome) => cap[nome] ?? null };
}
