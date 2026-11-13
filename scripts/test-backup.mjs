// Prova il backup riservato alla Direzione su un Postgres in memoria (PGlite)
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
  try { await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8')); } catch (e) { console.log('ERR in ' + f + ': ' + e.message); process.exit(1); }
}
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
const ok = (c, m) => { console.log((c ? 'OK  ' : 'ERR ') + m); if (!c) process.exitCode = 1; };
const asUser = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false);`); try { return await fn(); } finally { await db.exec(`reset role`); } };
const sara = (await q(`insert into auth.users(email) values ('S.Bartolini@kimatic.it') returning id`)).rows[0].id;
await asUser(sara, () => q(`insert into inviti(email,nome,ruoli) values ('m@kimatic.it','M','{operativo}'),('d@kimatic.it','D','{direzione}')`));
const op = (await q(`insert into auth.users(email) values ('m@kimatic.it') returning id`)).rows[0].id;
const dir = (await q(`insert into auth.users(email) values ('d@kimatic.it') returning id`)).rows[0].id;
await asUser(dir, async () => {
  ok((await q(`select di_direzione() d`)).rows[0].d === true, 'Direzione riconosciuta');
  const t = (await q(`select * from backup_tabelle()`)).rows.map((r) => r.backup_tabelle);
  ok(t.includes('profili') && t.includes('pp_docs') && t.includes('inviti'), `elenco tabelle (${t.length})`);
  const p = (await q(`select backup_tabella('profili',0) r`)).rows[0].r;
  ok(p.length === 3, 'Direzione (non amministratore) legge tutti i profili');
  try { await q(`select backup_tabella('pg_class',0)`); ok(false, 'rifiuta tabelle di sistema'); } catch (e) { ok(true, 'rifiuta tabelle di sistema'); }
});
await asUser(op, async () => {
  ok((await q(`select di_direzione() d`)).rows[0].d === false, 'Operativo non è Direzione');
  try { await q(`select * from backup_tabelle()`); ok(false, 'Operativo non fa il backup'); } catch (e) { ok(/Direzione/.test(e.message), 'Operativo non fa il backup'); }
});
