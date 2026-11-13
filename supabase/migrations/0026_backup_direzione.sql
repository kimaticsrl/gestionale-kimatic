-- =============================================================
-- Gestionale Kimatic — un unico backup, solo per la Direzione
-- Da eseguire una volta nell'SQL Editor di Supabase (dopo 0024 se il Piano è già stato attivato,
-- altrimenti va bene anche prima: le parti sul Piano vengono saltate).
-- =============================================================
-- Il backup si fa solo dalla pagina «Backup» del gestionale, che vede solo chi ha il ruolo Direzione.
-- I moduli non fanno più copie interne (Offerte BMTEK e Piano produzione): qui si cancellano quelle già fatte.

create or replace function public.di_direzione()
returns boolean language sql stable security definer set search_path = public as $$
  select public.utente_attivo() and exists (
    select 1 from profilo_ruoli where profilo_id = auth.uid() and ruolo_id = 'direzione');
$$;
grant execute on function public.di_direzione() to authenticated;

-- Elenco delle tabelle del gestionale da salvare
create or replace function public.backup_tabelle()
returns setof text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.di_direzione() then raise exception 'Backup riservato alla Direzione'; end if;
  return query select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1;
end;
$$;

-- Una pagina (fino a 1000 righe) di una tabella, in ordine di chiave primaria
create or replace function public.backup_tabella(p_tabella text, p_da integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  ordine text;
  r jsonb;
begin
  if not public.di_direzione() then raise exception 'Backup riservato alla Direzione'; end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relkind = 'r' and c.relname = p_tabella) then
    raise exception 'Tabella sconosciuta: %', p_tabella;
  end if;
  select string_agg(format('t.%I', a.attname), ', ' order by array_position(i.indkey::int2[], a.attnum))
    into ordine
    from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
   where i.indrelid = format('public.%I', p_tabella)::regclass and i.indisprimary;
  execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (select * from public.%I t order by %s limit 1000 offset %s) t',
                 p_tabella, coalesce(ordine, '1'), greatest(p_da, 0))
    into r;
  return r;
end;
$$;
grant execute on function public.backup_tabelle() to authenticated;
grant execute on function public.backup_tabella(text, integer) to authenticated;

-- La Direzione può scaricare tutti i file caricati (foto, documenti, manuali) per il backup
create policy "backup direzione" on storage.objects for select to authenticated using (public.di_direzione());

-- Copie interne dei moduli, ormai inutili
delete from public.bm_docs where coll like 'backup%';
do $$ begin
  if to_regclass('public.pp_docs') is not null then
    execute 'delete from public.pp_docs where coll like ''backup%''';
  end if;
end $$;
