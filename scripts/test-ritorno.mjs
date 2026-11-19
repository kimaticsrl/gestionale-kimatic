// Prova la funzione ritorno_rapporto (migrazione 0059) su un Postgres in memoria, con tutte le migrazioni
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
const amm = await nuovo('amm@kimatic.it', '{amministrazione}');
const t1 = await nuovo('t1@kimatic.it', '{tecnico-service}');
const t2 = await nuovo('t2@kimatic.it', '{tecnico-service}');
const g = (d) => ({ d, v: { da: '06:00' }, vr: {}, f: [] });
const firmato = (v) => JSON.stringify({ num: 'P-1', cli: { nome: 'C' }, giorni: [g('2026-11-18'), g('2026-11-17')], firma: { ts: '2026-11-18T18:00:00', hash: 'h', v } });
const rit = (id, i, vr) => q(`select ritorno_rapporto($1,$2,$3)`, [id, i, JSON.stringify(vr)]);
const prova = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };

await as(t1, async () => {
  await q(`insert into rapporti(id,dati) values ('a',$1),('b',$2)`, [firmato(2), firmato(undefined)]);
  ok(!(await prova(() => rit('a', 0, { da: '19:00', a: '23:30', km: '40' }))), 'il tecnico compila il ritorno dopo la firma');
  const r = (await q(`select dati, firma_ts from rapporti where id='a'`)).rows[0];
  ok(r.dati.giorni[0].vr.a === '23:30' && r.firma_ts !== null && r.dati.giorni[1].v.da === '06:00', 'cambia solo il ritorno, la firma resta');
  ok(/ultima giornata/.test(await prova(() => rit('a', 1, { da: '1' }))), 'non si tocca il ritorno delle altre giornate');
  ok(/riaperto/.test(await prova(() => rit('b', 0, { da: '1' }))), 'non vale per i rapporti firmati prima');
  ok(/non valido/.test(await prova(() => rit('a', 0, 'x'))), 'rifiuta dati non validi');
});
await as(t2, async () => {
  ok(!!(await prova(() => rit('a', 0, { da: '1' }))), 'un altro tecnico non modifica il rapporto altrui');
});
await as(amm, async () => { await q(`insert into fatture_rapporti(rapporto_id) values ('a')`); });
await as(t1, async () => {
  ok(/fatturato/.test(await prova(() => rit('a', 0, { da: '2' }))), 'dopo la fattura il ritorno è bloccato');
});
