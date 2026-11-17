-- =============================================================
-- Gestionale Kimatic — il Tesserino trasferta prende i dipendenti dall'Anagrafica dipendenti
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0037_rateizzazioni_rientro_tesserino_organigramma.sql
-- =============================================================
-- L'Anagrafica dipendenti resta visibile solo alla Direzione. Chi usa il Tesserino riceve
-- soltanto i dati che vanno stampati (nome, nascita, codice fiscale, assunzione) e il reparto,
-- dei soli dipendenti in forza: niente RAL, contratto, contatti o note.
create or replace function public.tesserino_dipendenti()
returns table (id text, nome text, reparto text, luogo text, nascita text, cf text, assunzione text)
language sql stable security definer set search_path = public as $$
  select d.id, d.dati ->> 'nome', d.dati ->> 'cc', d.dati ->> 'luogo', d.dati ->> 'nascita',
         d.dati ->> 'cf', d.dati ->> 'assunzione'
  from public.dipendenti d
  where public.puo('tesserino-trasferta', 'legge')
    and d.attivo
    and (coalesce(d.dati ->> 'scadenza', '') = '' or d.dati ->> 'scadenza' >= to_char(current_date, 'YYYY-MM-DD'))
  order by d.dati ->> 'nome';
$$;
revoke all on function public.tesserino_dipendenti() from public, anon;
grant execute on function public.tesserino_dipendenti() to authenticated;

-- La tabella «tesserini» ora conserva solo la foto del tesserino di ogni dipendente
-- (id = id del dipendente in anagrafica).

-- Operativi (collaudo, montaggio…) e Tecnici service compilano i tesserini e caricano le foto.
-- Se un livello era già stato cambiato dalla pagina Permessi, resta com'è.
insert into public.permessi (ruolo_id, modulo_id, livello) values
  ('operativo',       'tesserino-trasferta', 'modifica'),
  ('tecnico-service', 'tesserino-trasferta', 'modifica')
on conflict (ruolo_id, modulo_id) do update set livello = excluded.livello
  where public.permessi.livello = 'nessuno';

select ruolo_id, livello from public.permessi where modulo_id = 'tesserino-trasferta' order by ruolo_id;
