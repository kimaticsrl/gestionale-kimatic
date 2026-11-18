-- =============================================================
-- Backup: le tabelle con documenti grandi (cg_docs, pp_docs…) andavano
-- oltre il tempo massimo di una richiesta (8 secondi) leggendo 1000
-- righe alla volta. Ora la pagina ha la dimensione chiesta dal gestionale
-- (che la riduce da solo se serve) e il risultato si costruisce in json
-- semplice, molto più veloce di jsonb.
-- =============================================================

drop function if exists public.backup_tabella(text, integer);

create or replace function public.backup_tabella(p_tabella text, p_da integer, p_n integer default 1000)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  ordine text;
  r json;
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
  execute format('select coalesce(json_agg(t), ''[]''::json) from (select * from public.%I t order by %s limit %s offset %s) t',
                 p_tabella, coalesce(ordine, '1'), least(greatest(coalesce(p_n, 1000), 1), 1000), greatest(p_da, 0))
    into r;
  return r;
end;
$$;
grant execute on function public.backup_tabella(text, integer, integer) to authenticated;

select 'ok' as backup_pagine;
