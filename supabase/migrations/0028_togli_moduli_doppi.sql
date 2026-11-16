-- =============================================================
-- Gestionale Kimatic — tolti i moduli doppioni del Piano produzione
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0027_commesse_clienti.sql
-- =============================================================
-- «Gantt linee produzione», «Planning giornaliero Kimatic» e «Planning giornaliero operativi»
-- sono già schede dentro il Piano produzione (Gantt, Persone e giorni, Operativi).
-- Chi aveva accesso a queste tessere ha già accesso al Piano, quindi nessuno perde niente.

-- I dati del Piano li vede chi ha almeno «Legge» sul Piano produzione
drop policy if exists lettura on public.pp_docs;
create policy lettura on public.pp_docs for select to authenticated
  using (public.puo('piano-produzione', 'legge'));

-- Toglie le tre tessere e i loro permessi
delete from public.moduli where id in ('gantt-linee', 'planning-kimatic', 'planning-operativi');

select id, nome from public.moduli where reparto_id = 'pro' order by ordine;
