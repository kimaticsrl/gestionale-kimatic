-- =============================================================
-- Utenti disattivati in automatico alla cessazione del contratto.
-- L'utente del gestionale si abbina al dipendente dell'Anagrafica
-- dipendenti per nome e cognome (maiuscole, accenti e ordine non
-- contano). Dal giorno dopo la data di cessazione (campo «scadenza»),
-- o se il dipendente è segnato come non attivo, l'utente non vede
-- più niente, come se fosse stato disattivato dalla pagina Utenti.
-- Se lo stesso nome ha anche una scheda ancora in forza (riassunto),
-- l'utente resta attivo. Chi non è in anagrafica non cambia.
-- =============================================================

-- Data da cui l'utente risulta cessato (null = in forza o non in anagrafica)
create or replace function public.cessato_dal(p_profilo uuid)
returns date language sql stable security definer set search_path = public as $$
  with p as (
    select public.nome_normalizzato(nome) n from profili where id = p_profilo
  ), d as (
    select x.attivo,
           case when coalesce(x.dati ->> 'scadenza', '') ~ '^\d{4}-\d{2}-\d{2}$'
                then (x.dati ->> 'scadenza')::date end as fine
    from dipendenti x, p
    where p.n <> '' and public.nome_normalizzato(x.dati ->> 'nome') = p.n
  )
  select case
    when not exists (select 1 from d) then null
    -- in forza: attivo e senza cessazione o con cessazione da oggi in avanti
    when exists (select 1 from d where attivo and (fine is null or fine >= current_date)) then null
    else coalesce((select max(fine) + 1 from d where fine is not null), current_date)
  end;
$$;
revoke all on function public.cessato_dal(uuid) from public, anon;
grant execute on function public.cessato_dal(uuid) to authenticated;

create or replace function public.utente_attivo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select attivo from profili where id = auth.uid()), false)
     and public.cessato_dal(auth.uid()) is null;
$$;

create or replace function public.admin_reale()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profili where id = auth.uid()), false)
     and public.utente_attivo();
$$;

-- Per la pagina Utenti: chi è cessato secondo l'anagrafica (solo amministratori)
create or replace function public.utenti_cessati()
returns table (profilo_id uuid, dal date)
language sql stable security definer set search_path = public as $$
  select p.id, public.cessato_dal(p.id) from profili p
  where public.is_admin() and public.cessato_dal(p.id) is not null;
$$;
revoke all on function public.utenti_cessati() from public, anon;
grant execute on function public.utenti_cessati() to authenticated;

-- Controllo: utenti che oggi risultano cessati
select p.nome, p.email, public.cessato_dal(p.id) as cessato_dal
from public.profili p where public.cessato_dal(p.id) is not null;
