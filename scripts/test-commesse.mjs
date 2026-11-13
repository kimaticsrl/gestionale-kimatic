// Prova lo storico commesse clienti (0027 + dati 0028) su un Postgres in memoria (PGlite)
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
const db = new PGlite({ extensions: { pg_trgm } });
const q = (s, p) => db.query(s, p);
await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create publication supabase_realtime;`);
for (const f of fs.readdirSync('supabase/migrations').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) {
  try { await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8')); } catch (e) { console.log('ERR in ' + f + ': ' + e.message); process.exit(1); }
}
const ok = (c, m) => { console.log((c ? 'OK  ' : 'ERR ') + m); if (!c) process.exitCode = 1; };
ok((await q(`select nome_confronto('***REFORM PLASTICS ltd') a, nome_confronto('Reform Plastics Ltd.') b`)).rows.every((r) => r.a === r.b), 'nome_confronto ignora asterischi e forme societarie');
await q(`insert into clienti (id,nome,dati) values ('c1','I.P.T. Industria Plastica Toscana','{"codice_sam":"001369"}'),('c2','Eos Plast','{}'),('c3','Plasgal','{"ragione_sociale":"Plasgal - Produção de Embalagens, Lda"}')`);
if (process.argv[2]) {
  const sql = fs.readFileSync(process.argv[2], 'utf8');
  await db.exec(sql.slice(0, sql.indexOf('-- Commesse senza cliente')));
  const r = (await q(`select id, cliente_id, leasing from commesse_clienti where id in ('2026/554','2025/359','2022/370','2026/692')  order by id`)).rows;
  console.log(r);
  ok(r.find((x) => x.id === '2026/554')?.cliente_id === 'c1', 'leasing GRENKE abbinato a IPT per codice SAM');
  ok(r.filter((x) => x.cliente_id === 'c2').length === 2, 'due leasing abbinati a Eos Plast per nome');
  ok(r.find((x) => x.id === '2026/692')?.cliente_id === 'c3', 'abbinato per ragione sociale');
  await q(`insert into clienti (id,nome,dati) values ('c4','Hanmere Polythene','{}')`);
  ok((await q(`select count(*)::int n from commesse_clienti where cliente_id='c4'`)).rows[0].n > 0, 'nuovo cliente: commesse abbinate in automatico');
  console.log((await q(`select tipo, count(*)::int from commesse_clienti group by 1`)).rows);
}
