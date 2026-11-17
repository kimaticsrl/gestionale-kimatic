-- =============================================================
-- Gestionale Kimatic — Sicurezza: anche la scadenza del contratto
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0033_sicurezza.sql
-- =============================================================
-- La funzione che passa le persone alla Sicurezza aggiunge la scadenza del contratto
-- (tempo determinato / apprendistato) letta dall'Anagrafica dipendenti.

drop function if exists public.sic_dipendenti();
create function public.sic_dipendenti()
returns table (id text, nome text, mansione text, reparto text, contratto text, attivo boolean,
               assunzione text, fine text, finecontr text)
language sql stable security definer set search_path = public as $$
  select d.id, d.dati->>'nome', d.dati->>'mansione', d.dati->>'cc', d.dati->>'contratto', d.attivo,
         d.dati->>'assunzione', d.dati->>'scadenza', d.dati->>'finecontr'
  from public.dipendenti d
  where public.puo('sicurezza', 'legge')
  order by d.dati->>'nome';
$$;
revoke all on function public.sic_dipendenti() from public, anon;
grant execute on function public.sic_dipendenti() to authenticated;
