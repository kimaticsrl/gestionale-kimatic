// Prova le regole del modulo Rapporti d'intervento su un Postgres in memoria
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
  create role anon; create role authenticated; create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to authenticated; grant execute on function auth.uid() to authenticated;`);
for (const f of ['0001_base.sql', '0002_rapporti_intervento.sql']) await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
const ok = (c, m) => { console.log((c ? 'OK  ' : 'ERR ') + m); if (!c) process.exitCode = 1; };
const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false);`); try { return await fn(); } finally { await db.exec('reset role'); } };
const nuovo = async (email, ruoli) => {
  await q(`insert into inviti(email,ruoli) values ($1,$2)`, [email, ruoli]);
  return (await q(`insert into auth.users(email) values ($1) returning id`, [email])).rows[0].id;
};
const sara = (await q(`insert into auth.users(email) values ('s.bartolini@kimatic.it') returning id`)).rows[0].id;
const amm = await nuovo('amm@kimatic.it', '{amministrazione}');
const t1 = await nuovo('t1@kimatic.it', '{tecnico-service}');
const t2 = await nuovo('t2@kimatic.it', '{tecnico-service}');
const acq = await nuovo('acq@kimatic.it', '{acquisti}');
const op = await nuovo('op@kimatic.it', '{operativo}');
const dati = (num) => JSON.stringify({ num, tipo: 'man', cli: { nome: 'Cliente' }, giorni: [] });

await as(t1, async () => { await q(`insert into rapporti(id,dati) values ('r1',$1)`, [dati('RI-1')]); });
await as(t2, async () => { await q(`insert into rapporti(id,dati) values ('r2',$1)`, [dati('RI-2')]); });
ok((await q(`select creato_da from rapporti where id='r1'`)).rows[0].creato_da === t1, 'autore registrato');

await as(t1, async () => {
  const ids = (await q(`select id from rapporti`)).rows.map(r => r.id);
  ok(ids.length === 1 && ids[0] === 'r1', 'il tecnico vede solo i propri rapporti');
  const r = await q(`update rapporti set dati = dati || '{"note":"x"}' where id='r2'`);
  ok(r.affectedRows === 0, 'il tecnico non modifica i rapporti altrui');
  await q(`update rapporti set dati = jsonb_set(dati,'{firma}','{"ts":"2026-11-11T10:00:00","hash":"h"}') where id='r1'`);
  ok((await q(`select firma_ts from rapporti where id='r1'`)).rows[0].firma_ts !== null, 'il tecnico firma il proprio rapporto');
  const r2 = await q(`update rapporti set dati = dati || '{"note":"dopo"}' where id='r1'`);
  ok(r2.affectedRows === 0, 'dopo la firma il tecnico non può più modificarlo');
  const r3 = await q(`delete from rapporti where id='r1'`);
  ok(r3.affectedRows === 0, 'un rapporto firmato non si cancella');
  try { await q(`insert into fatture_rapporti(rapporto_id) values ('r1')`); ok(false, 'il tecnico non fattura'); }
  catch { ok(true, 'il tecnico non fattura'); }
});
await as(amm, async () => {
  ok((await q(`select count(*)::int n from rapporti`)).rows[0].n === 2, "l'Amministrazione vede tutti i rapporti");
  await q(`insert into fatture_rapporti(rapporto_id,dati) values ('r1','{"nf":"12"}')`);
  ok(true, "l'Amministrazione segna fatturato");
  await q(`update rapporti set dati = dati - 'firma' where id='r1'`);
  ok((await q(`select firma_ts from rapporti where id='r1'`)).rows[0].firma_ts === null, "l'Amministrazione riapre un rapporto firmato");
  await q(`insert into clienti(id,nome) values ('c1','Cliente')`); ok(true, "l'Amministrazione modifica l'anagrafica");
});
await as(acq, async () => {
  ok((await q(`select count(*)::int n from rapporti`)).rows[0].n === 2, 'Acquisti legge tutti i rapporti');
  const r = await q(`update rapporti set dati = dati || '{"note":"x"}'`);
  ok(r.affectedRows === 0, 'Acquisti non modifica');
  try { await q(`insert into rapporti(id,dati) values ('r9','{}')`); ok(false, 'Acquisti non crea rapporti'); }
  catch { ok(true, 'Acquisti non crea rapporti'); }
});
await as(op, async () => {
  ok((await q(`select count(*)::int n from rapporti`)).rows[0].n === 0, "l'Operativo non vede i rapporti");
});
await as(sara, async () => {
  ok((await q(`select count(*)::int n from rapporti`)).rows[0].n === 2, "l'amministratore vede tutto");
});
