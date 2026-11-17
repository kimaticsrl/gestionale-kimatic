-- =============================================================
-- «Vedi come»: un amministratore può usare il gestionale come se
-- avesse solo un certo ruolo (Commerciale, Tecnico service…), per
-- controllare che cosa vedono e che cosa possono fare gli altri.
-- Durante la simulazione valgono SOLO i permessi di quel ruolo,
-- anche nel database (stesse regole degli utenti veri): niente
-- pagine di amministrazione, niente dati riservati.
-- Si torna amministratori in qualsiasi momento (simula_ruolo(null)),
-- perché il controllo usa l'amministratore «reale».
-- =============================================================

create table if not exists public.simulazioni (
  profilo_id uuid primary key references public.profili(id) on delete cascade,
  ruolo_id   text not null references public.ruoli(id) on delete cascade,
  dal        timestamptz not null default now()
);
alter table public.simulazioni enable row level security;
drop policy if exists propria on public.simulazioni;
create policy propria on public.simulazioni for select to authenticated using (profilo_id = auth.uid());
-- si scrive solo con simula_ruolo()

-- Amministratore vero, indipendente dalla simulazione
create or replace function public.admin_reale()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin and attivo from profili where id = auth.uid()), false);
$$;

-- Ruolo che l'amministratore collegato sta simulando (null se nessuno)
create or replace function public.ruolo_simulato()
returns text language sql stable security definer set search_path = public as $$
  select s.ruolo_id from simulazioni s
  where s.profilo_id = auth.uid() and public.admin_reale();
$$;

-- Durante la simulazione l'amministratore non è amministratore
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_reale() and public.ruolo_simulato() is null;
$$;

-- Ruoli dell'utente collegato (o il solo ruolo simulato)
create or replace function public.miei_ruoli()
returns setof text language sql stable security definer set search_path = public as $$
  select public.ruolo_simulato() where public.ruolo_simulato() is not null
  union all
  select pr.ruolo_id from profilo_ruoli pr
  where pr.profilo_id = auth.uid() and public.ruolo_simulato() is null;
$$;

create or replace function public.livello_modulo(p_modulo text)
returns public.livello language sql stable security definer set search_path = public as $$
  select case
    when not public.utente_attivo() then 'nessuno'::livello
    when public.is_admin() then 'gestisce'::livello
    else coalesce((
      select max(p.livello) from permessi p
      where p.modulo_id = p_modulo and p.ruolo_id in (select public.miei_ruoli())
    ), 'nessuno'::livello)
  end;
$$;

create or replace function public.solo_propri(p_modulo text, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_admin() and not exists (
    select 1
    from permessi p
    where p.modulo_id = p_modulo and p.ruolo_id in (select public.miei_ruoli())
      and p.livello >= case p_tipo when 'modifica' then 'modifica'::livello else 'legge'::livello end
      and not exists (
        select 1 from regole_propri r
        where r.modulo_id = p_modulo and r.ruolo_id = p.ruolo_id
          and case p_tipo when 'modifica' then r.modifica else r.lettura end
      )
  );
$$;

create or replace function public.di_direzione()
returns boolean language sql stable security definer set search_path = public as $$
  select public.utente_attivo() and 'direzione' in (select public.miei_ruoli());
$$;

-- Avvia (p_ruolo) o termina (null) la simulazione. Solo per amministratori veri.
create or replace function public.simula_ruolo(p_ruolo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.admin_reale() then
    raise exception 'Solo gli amministratori possono vedere il gestionale come un altro ruolo';
  end if;
  if p_ruolo is null or p_ruolo = '' then
    delete from simulazioni where profilo_id = auth.uid();
  else
    insert into simulazioni (profilo_id, ruolo_id) values (auth.uid(), p_ruolo)
    on conflict (profilo_id) do update set ruolo_id = excluded.ruolo_id, dal = now();
  end if;
end;
$$;

revoke all on function public.simula_ruolo(text) from public, anon;
grant execute on function public.admin_reale(), public.ruolo_simulato(), public.miei_ruoli(), public.simula_ruolo(text) to authenticated;
