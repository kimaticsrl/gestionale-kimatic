-- =============================================================
-- Gestionale Kimatic — nuova scheda «Personale»
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0031_anagrafica_dipendenti.sql
-- =============================================================
-- Nuovo gruppo di moduli Personale (sigla PER, colore azzurro petrolio) con dentro
-- l'Anagrafica dipendenti. I permessi del modulo non cambiano (solo Direzione).

insert into public.reparti (id, nome, sigla, ordine)
values ('per', 'Personale', 'PER', 6)
on conflict (id) do nothing;

update public.moduli set reparto_id = 'per', ordine = 10 where id = 'anagrafica-dipendenti';

select m.id, m.nome, r.nome as scheda from public.moduli m join public.reparti r on r.id = m.reparto_id
where m.id = 'anagrafica-dipendenti';
