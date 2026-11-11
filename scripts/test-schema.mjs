// Prova lo schema su un Postgres in memoria (PGlite), simulando Supabase
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const db = new PGlite();
const q = (s, p) => db.query(s, p);
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema public, auth to authenticated; grant select on all tables in schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`);
await db.exec(fs.readFileSync(process.argv[2], 'utf8'));
await db.exec(`grant select, insert, update, delete on all tables in schema public to authenticated;`);
const ok = (c, m) => { console.log((c ? 'OK  ' : 'ERR ') + m); if (!c) process.exitCode = 1; };

// Non invitato: rifiutato
try { await q(`insert into auth.users(email) values ('x@ext.it')`); ok(false, 'rifiuta non invitati'); }
catch (e) { ok(/non invitato/.test(e.message), 'rifiuta non invitati'); }

// Sara si registra -> admin + direzione
const sara = (await q(`insert into auth.users(email) values ('S.Bartolini@kimatic.it') returning id`)).rows[0].id;
ok((await q(`select count(*)::int n from inviti`)).rows[0].n === 0, 'invito consumato');
const asUser = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid','${uid}',false);`); try { return await fn(); } finally { await db.exec(`reset role`); } };

await asUser(sara, async () => {
  ok((await q(`select is_admin() a`)).rows[0].a === true, 'Sara è amministratore');
  ok((await q(`select count(*)::int n from miei_moduli()`)).rows[0].n === 13, 'Sara vede 13 moduli');
  await q(`insert into inviti(email,nome,ruoli) values ('m.bortolini@kimatic.it','Matteo','{operativo}')`);
  try { await q(`update profili set is_admin=false where id=$1`, [sara]); ok(false, 'admin non si declassa da solo'); }
  catch (e) { ok(true, 'admin non si declassa da solo'); }
});

const matteo = (await q(`insert into auth.users(email) values ('m.bortolini@kimatic.it') returning id`)).rows[0].id;
await asUser(matteo, async () => {
  const mods = (await q(`select id, livello from miei_moduli()`)).rows;
  ok(!mods.some(m => m.id === 'controllo-gestione'), 'Operativo non vede Controllo di gestione');
  ok(mods.find(m => m.id === 'planning-kimatic')?.livello === 'modifica', 'Operativo modifica Planning Kimatic');
  ok(mods.find(m => m.id === 'gantt-linee')?.livello === 'legge', 'Operativo legge il Gantt');
  ok((await q(`select count(*)::int n from permessi`)).rows[0].n === 0, 'Operativo non legge la griglia permessi');
  ok((await q(`select count(*)::int n from inviti`)).rows[0].n === 0, 'Operativo non vede gli inviti');
  const r = await q(`update permessi set livello='gestisce' where ruolo_id='operativo'`);
  ok(r.affectedRows === 0, 'Operativo non può cambiare permessi');
  try { await q(`update profili set is_admin=true where id=$1`, [matteo]); ok(false, 'Operativo non si promuove'); }
  catch (e) { ok(true, 'Operativo non si promuove'); }
  await q(`update profili set nome='Matteo Bortolini' where id=$1`, [matteo]);
  ok(true, 'Operativo cambia il proprio nome');
});

// Somma dei ruoli: aggiungo commerciale a Matteo
await asUser(sara, async () => { await q(`insert into profilo_ruoli values ($1,'commerciale')`, [matteo]); });
await asUser(matteo, async () => {
  ok((await q(`select livello_modulo('offerte-bmtek') l`)).rows[0].l === 'modifica', 'ruoli si sommano');
});
// Disattivato: non vede nulla
await asUser(sara, async () => { await q(`update profili set attivo=false where id=$1`, [matteo]); });
await asUser(matteo, async () => {
  ok((await q(`select count(*)::int n from miei_moduli()`)).rows[0].n === 0, 'disattivato non vede moduli');
});
const log = (await q(`select count(*)::int n from registro_modifiche`)).rows[0].n;
ok(log > 0, `storico registrato (${log} righe)`);
