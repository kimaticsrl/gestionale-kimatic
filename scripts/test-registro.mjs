// Prova il registro delle modifiche (0010) su un Postgres in memoria
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
  create role anon; create role authenticated; create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;`);
for (const f of ['0001_base.sql', '0002_rapporti_intervento.sql', '0004_troubleshooting.sql', '0006_offerte_bmtek.sql', '0008_anagrafica_clienti.sql', '0010_registro_modifiche.sql', '0011_lettere_impegno.sql', '0012_costificatore.sql'])
  await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
const ok = (c, m) => { console.log((c ? 'OK  ' : 'ERR ') + m); if (!c) process.exitCode = 1; };
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const sara = (await q(`insert into auth.users(email) values ('s.bartolini@kimatic.it') returning id`)).rows[0].id;
await q(`insert into inviti(email,ruoli) values ('com@kimatic.it','{commerciale}')`);
const com = (await q(`insert into auth.users(email) values ('com@kimatic.it') returning id`)).rows[0].id;
const n = async (w = '') => (await q(`select count(*)::int n from registro_modifiche where tabella in ('bm_docs','rapporti','clienti') ${w}`)).rows[0].n;

await as(com, async () => {
  await q(`insert into bm_docs(coll,id,dati) values ('offerte','o1','{"cliente":"A"}')`);
  for (let i = 0; i < 5; i++) await q(`update bm_docs set dati = dati || jsonb_build_object('nota', $1::text) where coll='offerte' and id='o1'`, ['n' + i]);
  await q(`insert into bm_docs(coll,id,dati) values ('backup/x/parti','p1','{}')`);
  await q(`insert into bm_docs(coll,id,dati) values ('immagini','i1','{}')`);
});
ok(await n() === 1, 'creazione e 5 salvataggi automatici dello stesso utente = una voce');
const v = (await q(`select record_id, dopo->'dati'->>'nota' nota, utente from registro_modifiche where tabella='bm_docs'`)).rows[0];
ok(v.record_id === 'offerte/o1' && v.nota === 'n4' && v.utente === com, 'la voce ha lo stato finale e l\'autore');

await as(sara, async () => { await q(`update bm_docs set dati = dati || '{"sc":5}' where coll='offerte' and id='o1'`); });
ok(await n() === 2, 'un altro utente apre una voce nuova');
await q(`update registro_modifiche set quando = now() - interval '1 hour'`);
await as(sara, async () => { await q(`update bm_docs set dati = dati || '{"sc":6}' where coll='offerte' and id='o1'`); });
ok(await n() === 3, 'dopo 15 minuti si apre una voce nuova');
const u = (await q(`select prima->'dati'->>'sc' p, dopo->'dati'->>'sc' d from registro_modifiche where tabella='bm_docs' order by id desc limit 1`)).rows[0];
ok(u.p === '5' && u.d === '6', 'prima e dopo corretti');
await as(sara, async () => { await q(`update bm_docs set aggiornato_il = now() + interval '1 second' where coll='offerte' and id='o1'`); });
ok(await n() === 3, 'un salvataggio senza cambiamenti non crea voci');
await as(sara, async () => { await q(`delete from bm_docs where coll='offerte' and id='o1'`); });
ok(await n(`and azione='DELETE'`) === 1, 'la cancellazione è registrata');
await as(sara, async () => {
  await q(`insert into clienti(id,nome) values ('c1','Cliente')`);
  await q(`update clienti set dati = '{"email":"a@b.it"}' where id='c1'`);
  await q(`insert into rapporti(id,dati) values ('r1','{"num":"RI-1"}')`);
  await q(`update rapporti set dati = dati || '{"note":"x"}' where id='r1'`);
});
ok(await n(`and tabella in ('clienti','rapporti')`) === 2, 'clienti e rapporti registrati, salvataggi raggruppati');
await as(com, async () => {
  const r = await q(`select count(*)::int n from registro_modifiche`);
  ok(r.rows[0].n === 0, 'solo gli amministratori leggono il registro');
});

// Lettere d'impegno: impostazioni condivise
await as(sara, async () => { await q(`insert into impostazioni(id,modulo_id,dati) values ('lettere-impegno/minimi','lettere-impegno','{"1":1700}')`); });
await as(com, async () => {
  ok((await q(`select count(*)::int n from impostazioni`)).rows[0].n === 0, 'il Commerciale non vede le impostazioni delle Lettere');
  const r = await q(`update impostazioni set dati='{}'`); ok(r.affectedRows === 0, 'il Commerciale non le modifica');
});
ok((await q(`select migrato from moduli where id='lettere-impegno'`)).rows[0].migrato === true, 'Lettere d\'impegno segnato come migrato');

// Costificatore: archivio condiviso
await db.exec(fs.readFileSync('/mnt/user-data/outputs/0013_import_dati_costificatore.sql', 'utf8'));
ok((await q(`select count(*)::int n from cost_docs`)).rows[0].n === 13, 'archivio importato: 12 componenti e 1 preventivo');
await as(com, async () => {
  ok((await q(`select count(*)::int n from cost_docs`)).rows[0].n === 13, 'il Commerciale (Legge) vede l\'archivio');
  let errore = false; try { await q(`insert into cost_docs(coll,id,dati) values ('componenti','x','{}')`); } catch { errore = true; }
  ok(errore, 'il Commerciale non salva nell\'archivio');
});
