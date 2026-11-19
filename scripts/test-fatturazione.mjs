// Prova il permesso «Fatturazione rapporti d'intervento» (migrazione 0060) su un Postgres in memoria, con tutte le migrazioni
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
  create role anon; create role authenticated; create role service_role; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;`);
for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
  try { await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8')); }
  catch (e) { if (f >= '0059') throw e; console.log('salto ' + f + ': ' + e.message.split('\n')[0]); }
}
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
const ok = (c, m) => { console.log((c ? 'OK  ' : 'ERR ') + m); if (!c) process.exitCode = 1; };
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const nuovo = async (email, ruoli) => {
  await q(`insert into inviti(email,ruoli) values ($1,$2)`, [email, ruoli]);
  return (await q(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
};
const com = await nuovo('com@kimatic.it', '{commerciale}');
const amm = await nuovo('amm@kimatic.it', '{amministrazione}');
const t1 = await nuovo('t1@kimatic.it', '{tecnico-service}');
const prova = async (fn) => { try { await fn(); return true; } catch { return false; } };

await as(t1, async () => { await q(`insert into rapporti(id,dati) values ('a','{"num":"RI-1","firma":{"ts":"2026-11-18T18:00:00"}}')`); });
await as(amm, async () => { await q(`insert into listini_assistenza(id,dati) values ('EU','{"ore":80}') on conflict (id) do nothing`); });
await as(com, async () => {
  ok((await q(`select livello_modulo('fatturazione-rapporti') l`)).rows[0].l === 'modifica', 'il Commerciale ha la fatturazione in modifica');
  ok((await q(`select id from miei_moduli() where id='fatturazione-rapporti'`)).rows.length === 1, 'il Commerciale vede il modulo nel menu');
  ok((await q(`select count(*)::int n from rapporti`)).rows[0].n === 1, 'il Commerciale vede i rapporti firmati');
  ok(await prova(() => q(`insert into addebiti_rapporti(rapporto_id,dati) values ('a','{"note":"x"}')`)), 'il Commerciale compila gli importi');
  ok((await q(`select count(*)::int n from addebiti_rapporti`)).rows[0].n === 1, 'il Commerciale legge gli importi');
  ok(await prova(() => q(`insert into fatture_rapporti(rapporto_id,dati) values ('a','{"nf":"12"}')`)), 'il Commerciale segna fatturato');
  ok(await prova(() => q(`delete from fatture_rapporti where rapporto_id='a'`)), 'il Commerciale annulla la fattura');
  const l = await q(`update listini_assistenza set dati = dati where true`);
  ok(l.affectedRows === 0, 'il Commerciale non cambia i listini');
  const r = await q(`update rapporti set dati = dati - 'firma' where id='a'`);
  ok(r.affectedRows === 0, 'il Commerciale non riapre i rapporti firmati');
});
await as(amm, async () => {
  ok((await q(`select livello_modulo('fatturazione-rapporti') l`)).rows[0].l === 'gestisce', "l'Amministrazione gestisce la fatturazione");
});
await as(t1, async () => {
  ok((await q(`select count(*)::int n from addebiti_rapporti`)).rows[0].n === 0, 'il tecnico non vede gli importi');
  ok(!(await prova(() => q(`insert into fatture_rapporti(rapporto_id) values ('a')`))), 'il tecnico non fattura');
});
