-- =============================================================
-- Gestionale Kimatic — modulo Non conformità fornitori
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0012_costificatore.sql
-- =============================================================
-- Tutti possono aprire una non conformità e modificarla finché è «aperta» (solo le proprie).
-- Magazzino e controllo qualità (e la Direzione) la gestiscono: trattamento, costi,
-- risposta del fornitore e chiusura.

-- Nuovo ruolo
insert into public.ruoli (id, nome, descrizione, ordine) values
  ('magazzino-qualita', 'Magazzino e controllo qualità', 'Accettazione merce, non conformità dei fornitori', 9)
on conflict (id) do nothing;

insert into public.moduli (id, reparto_id, nome, descrizione, migrato, ordine)
values ('non-conformita', 'acq', 'Non conformità fornitori',
        'Segnalazione, gestione e chiusura delle non conformità sul materiale dei fornitori.', true, 25)
on conflict (id) do nothing;

insert into public.permessi (ruolo_id, modulo_id, livello) values
  ('magazzino-qualita', 'non-conformita', 'gestisce'),
  ('direzione',         'non-conformita', 'gestisce'),
  ('amministrazione',   'non-conformita', 'modifica'),
  ('commerciale',       'non-conformita', 'modifica'),
  ('ufficio-tecnico',   'non-conformita', 'modifica'),
  ('acquisti',          'non-conformita', 'modifica'),
  ('pianificatore',     'non-conformita', 'modifica'),
  ('operativo',         'non-conformita', 'modifica'),
  ('tecnico-service',   'non-conformita', 'modifica')
on conflict (ruolo_id, modulo_id) do update set livello = excluded.livello;

-- Chi ha solo «Modifica» vede tutte le NC ma cambia solo quelle che ha aperto
insert into public.regole_propri (modulo_id, ruolo_id, lettura, modifica)
select 'non-conformita', r, false, true
from unnest(array['amministrazione','commerciale','ufficio-tecnico','acquisti','pianificatore','operativo','tecnico-service']) r
on conflict (modulo_id, ruolo_id) do nothing;

-- -------------------------------------------------------------
-- Non conformità
-- -------------------------------------------------------------
create table public.nc (
  id            text primary key default gen_random_uuid()::text,
  numero        text unique,                  -- NC-2026-001, assegnato dal database
  anno          int,
  stato         text not null default 'aperta'
                check (stato in ('aperta', 'in-gestione', 'attesa-fornitore', 'chiusa', 'annullata')),
  dati          jsonb not null default '{}',  -- segnalazione; dati.gestione = parte di chi gestisce
  creato_da     uuid references public.profili(id) on delete set null default auth.uid(),
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
create index on public.nc (anno, stato);

create or replace function public.prepara_nc()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  new.aggiornato_il := now();
  if tg_op = 'INSERT' then
    new.creato_il := now();
    if auth.uid() is not null then new.creato_da := auth.uid(); end if;
    new.anno := extract(year from now())::int;
    perform pg_advisory_xact_lock(hashtext('nc-numero'), new.anno);
    select coalesce(max(split_part(numero, '-', 3)::int), 0) + 1 into n from nc where anno = new.anno;
    new.numero := 'NC-' || new.anno || '-' || lpad(n::text, 3, '0');
  else
    new.id := old.id; new.numero := old.numero; new.anno := old.anno;
    new.creato_da := old.creato_da; new.creato_il := old.creato_il;
  end if;
  -- La parte di gestione e lo stato li cambia solo chi Gestisce
  if auth.uid() is not null and not public.puo('non-conformita', 'gestisce') then
    if tg_op = 'INSERT' then
      new.stato := 'aperta';
      new.dati := new.dati - 'gestione';
    else
      if new.stato is distinct from old.stato or (new.dati -> 'gestione') is distinct from (old.dati -> 'gestione') then
        raise exception 'Solo Magazzino e controllo qualità può gestire o chiudere la non conformità';
      end if;
      if old.stato <> 'aperta' then
        raise exception 'La non conformità è già in gestione: non si può più modificare la segnalazione';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger prepara before insert or update on public.nc
  for each row execute function public.prepara_nc();

alter table public.nc enable row level security;
create policy lettura on public.nc for select to authenticated using (public.puo('non-conformita', 'legge'));
create policy inserimento on public.nc for insert to authenticated with check (public.puo('non-conformita', 'modifica'));
create policy modifica on public.nc for update to authenticated using (
  public.puo('non-conformita', 'gestisce')
  or (public.puo('non-conformita', 'modifica')
      and (not public.solo_propri('non-conformita', 'modifica') or creato_da = auth.uid()))
) with check (public.puo('non-conformita', 'modifica'));
create policy cancellazione on public.nc for delete to authenticated using (public.puo('non-conformita', 'gestisce'));

create trigger storico after insert or update or delete on public.nc
  for each row execute function public.registra_sessione();

-- -------------------------------------------------------------
-- Foto e documenti delle NC: archivio file privato «non-conformita»
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('non-conformita', 'non-conformita', false, 20971520)
on conflict (id) do nothing;

create policy "nc lettura" on storage.objects for select to authenticated
  using (bucket_id = 'non-conformita' and public.puo('non-conformita', 'legge'));
create policy "nc caricamento" on storage.objects for insert to authenticated
  with check (bucket_id = 'non-conformita' and public.puo('non-conformita', 'modifica'));
create policy "nc cancellazione" on storage.objects for delete to authenticated
  using (bucket_id = 'non-conformita' and public.puo('non-conformita', 'gestisce'));
