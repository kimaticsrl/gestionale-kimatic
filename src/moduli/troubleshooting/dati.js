// @ts-nocheck
// Adattatore Supabase per il modulo Troubleshooting: casi, elenchi e file (foto/PDF).
const BUCKET = 'troubleshooting';

export function creaDb(supabase) {
  const ascolti = { casi: [], liste: [] };
  async function caricaCasi() {
    const { data, error } = await supabase.from('ts_casi').select('id,dati,creato_da');
    if (error) { ascolti.casi.forEach((a) => a.err && a.err(error)); return; }
    const snap = { docs: data.map((r) => ({ id: r.id, data: () => ({ ...r.dati, _by: r.creato_da }) })) };
    ascolti.casi.forEach((a) => a.ok(snap));
  }
  async function caricaListe() {
    const { data } = await supabase.from('ts_liste').select('dati').eq('id', 'liste').maybeSingle();
    const s = { exists: !!data, data: () => (data ? data.dati : {}) };
    ascolti.liste.forEach((a) => a.ok(s));
  }
  const tutto = () => { caricaCasi(); caricaListe(); };
  const vis = () => { if (document.visibilityState === 'visible') tutto(); };
  document.addEventListener('visibilitychange', vis);
  const timer = setInterval(tutto, 60000);
  const pulisci = (d) => { const { _by, ...x } = d; return x; };
  const fallo = async (p) => { const { data, error } = await p; if (error) throw error; return data; };

  return {
    collection(nome) {
      return {
        onSnapshot(ok, err) { ascolti.casi.push({ ok, err }); caricaCasi(); return () => {}; },
        async add(d) { await fallo(supabase.from('ts_casi').insert({ dati: pulisci(d) })); caricaCasi(); },
      };
    },
    doc(p) {
      const [nome, id] = p.split('/');
      if (nome === 'config') return {
        onSnapshot(ok) { ascolti.liste.push({ ok }); caricaListe(); return () => {}; },
        async set(d) { await fallo(supabase.from('ts_liste').upsert({ id: 'liste', dati: d })); caricaListe(); },
      };
      return {
        async set(d) {
          const r = await fallo(supabase.from('ts_casi').update({ dati: pulisci(d) }).eq('id', id).select('id'));
          if (!r.length) throw new Error('Modifica non permessa');
          caricaCasi();
        },
        async update(campi) {
          const { data } = await supabase.from('ts_casi').select('dati').eq('id', id).single();
          await fallo(supabase.from('ts_casi').update({ dati: { ...(data?.dati || {}), ...campi } }).eq('id', id));
          caricaCasi();
        },
        async delete() {
          const r = await fallo(supabase.from('ts_casi').delete().eq('id', id).select('id'));
          if (!r.length) throw new Error('Cancellazione non permessa');
          caricaCasi();
        },
      };
    },
    stop() { clearInterval(timer); document.removeEventListener('visibilitychange', vis); },
  };
}

export function creaFile(supabase) {
  return {
    async upload(blob, { type }) {
      const ext = /pdf/.test(type) ? 'pdf' : /png/.test(type) ? 'png' : /webp/.test(type) ? 'webp' : 'jpg';
      const id = crypto.randomUUID();
      const path = `${id}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
      if (error) throw { code: /size/i.test(error.message) ? 'too_large' : 'upload', message: error.message };
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      return { id, path, contentType: type, url: data?.signedUrl };
    },
    async delete(path) { await supabase.storage.from(BUCKET).remove([path]); },
    async urls(paths) {
      const out = {};
      for (let i = 0; i < paths.length; i += 100) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths.slice(i, i + 100), 3600);
        (data || []).forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
      }
      return out;
    },
  };
}
