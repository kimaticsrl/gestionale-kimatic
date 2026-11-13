// Prova il modulo Piano produzione su un Postgres in memoria (PGlite), simulando Supabase.
// Uso: node scripts/test-piano.mjs [percorso di 0025_import_dati_piano.sql]
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
const db = new PGlite({ extensions: { pg_trgm } });
const q = (s, p) => db.query(s, p);
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to authenticated; grant select on all tables in schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`);
for (const f of fs.readdirSync('supabase/migrations').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) {
  try { await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8')); }
  catch (e) { console.log('ERR in ' + f + ': ' + e.message); process.exit(1); }
}
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
const ok = (c, m) => { console.log((c ? 'OK  ' : 'ERR ') + m); if (!c) process.exitCode = 1; };
const asUser = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false);`); try { return await fn(); } finally { await db.exec(`reset role`); } };

const sara = (await q(`insert into auth.users(email) values ('S.Bartolini@kimatic.it') returning id`)).rows[0].id;
await asUser(sara, async () => {
  await q(`insert into inviti(email,nome,ruoli) values ('m.bortolini@kimatic.it','Matteo','{operativo}'), ('c@kimatic.it','Comm','{commerciale}'), ('t@kimatic.it','Tec','{tecnico-service}')`);
});
const matteo = (await q(`insert into auth.users(email) values ('m.bortolini@kimatic.it') returning id`)).rows[0].id;
const comm = (await q(`insert into auth.users(email) values ('c@kimatic.it') returning id`)).rows[0].id;


// unione profonda come update() su claude.ai
const u = (a, b) => q(`select pp_unisci($1::jsonb,$2::jsonb) r`, [JSON.stringify(a), JSON.stringify(b)]).then((r) => r.rows[0].r);
ok(JSON.stringify(await u({ a: 1, r: { x: { s: '1', e: '2' }, y: { s: '3' } } }, { r: { x: { e: '9' }, y: { __delete__: true } }, b: [1] }))
  === JSON.stringify({ a: 1, b: [1], r: { x: { e: '9', s: '1' } } }), 'pp_unisci: unisce, cancella, sostituisce elenchi');

await asUser(sara, async () => {
  await q(`insert into pp_docs (coll,id,dati) values ('config','chiusure','{"r":{"a":{"s":"2026-12-21","e":"2027-01-06","n":"Natale"}}}')`);
  await q(`select pp_aggiorna('config','chiusure','{"r":{"b":{"s":"2026-12-07","n":"ponte"}}}')`);
  await q(`select pp_aggiorna('config','chiusure','{"r":{"a":{"n":"Chiusura natalizia"}}}')`);
  const d = (await q(`select dati from pp_docs where coll='config' and id='chiusure'`)).rows[0].dati;
  ok(d.r.a.n === 'Chiusura natalizia' && d.r.a.s === '2026-12-21' && d.r.b.s === '2026-12-07', 'pp_aggiorna unisce due modifiche successive');
  await q(`select pp_aggiorna('commesse','cnuova','{"num":"999/2026"}')`);
  ok((await q(`select count(*)::int n from pp_docs where id='cnuova'`)).rows[0].n === 1, 'pp_aggiorna crea il documento se manca');
  await q(`insert into pp_docs (coll,id,dati) values ('accessi','ruoli','{}')`);
});
await asUser(matteo, async () => {
  ok((await q(`select count(*)::int n from pp_docs`)).rows[0].n >= 3, 'Operativo legge il piano');
  await q(`select pp_aggiorna('agenda','2026-11-16_p001','{"k":"Ferie","b":true}')`);
  ok((await q(`select count(*)::int n from pp_docs where coll='agenda'`)).rows[0].n === 1, 'Operativo scrive nel piano');
  try { await q(`select pp_aggiorna('accessi','ruoli','{"x":1}')`); ok(false, 'Operativo non cambia i permessi interni'); }
  catch (e) { ok(true, 'Operativo non cambia i permessi interni'); }
});
await asUser(comm, async () => {
  ok((await q(`select count(*)::int n from pp_docs`)).rows[0].n >= 3, 'Commerciale legge (Gantt per i clienti)');
  try { await q(`select pp_aggiorna('commesse','cnuova','{"num":"x"}')`); ok(false, 'Commerciale non modifica'); }
  catch (e) { ok(true, 'Commerciale non modifica'); }
  const r = await q(`delete from pp_docs where coll='commesse'`);
  ok(r.affectedRows === 0, 'Commerciale non cancella');
});
const log = (await q(`select count(*)::int n from registro_modifiche where tabella='pp_docs'`)).rows[0].n;
ok(log > 0, `modifiche nello storico (${log})`);

if (process.argv[2]) {
  await db.exec(fs.readFileSync(process.argv[2], 'utf8'));
  const n = (await q(`select coll, count(*)::int n from pp_docs group by coll order by coll`)).rows;
  console.log('importati:', n.map((r) => r.coll + ' ' + r.n).join(', '));
  ok(n.find((r) => r.coll === 'macchine')?.n >= 200, 'import dati del piano');
  ok((await q(`select count(*)::int n from moduli where migrato and id in ('piano-produzione','gantt-linee')`)).rows[0].n === 2, 'moduli attivati');
}
