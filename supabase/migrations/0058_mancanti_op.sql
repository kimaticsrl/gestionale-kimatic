-- =============================================================
-- Mancanti montaggi: ordini di produzione (OP) di SAM.
-- Il PC manda anche le fasi delle OP dei codici mancanti (vista
-- sA1.CS_OP_FASI_LAVORAZIONI): così si sa cosa è in produzione interna,
-- in quale cella e fase, e se l'OP di un gruppo 21.5… esiste.
-- Ogni invio sostituisce l'elenco.
-- =============================================================

create table if not exists public.mancanti_op (
  codice   text not null,
  op       text not null,
  commessa text not null default '',
  stato    text not null default '',
  qta      numeric,
  prod     numeric,
  fasi     jsonb not null default '[]',
  il       timestamptz not null default now(),
  primary key (codice, op)
);
alter table public.mancanti_op enable row level security;
drop policy if exists lettura on public.mancanti_op;
create policy lettura on public.mancanti_op for select to authenticated using ((select public.puo('mancanti-montaggi', 'legge')));
grant select on public.mancanti_op to authenticated;

create or replace function public.importa_op(p_op jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not public.puo('mancanti-montaggi', 'modifica') then
    raise exception 'Non hai il permesso di caricare le OP';
  end if;
  delete from mancanti_op where true;
  insert into mancanti_op (codice, op, commessa, stato, qta, prod, fasi)
  select distinct on (codice, op) codice, op, commessa, stato, qta, prod, fasi
  from (
    select trim(coalesce(x ->> 'codice', '')) codice, trim(coalesce(x ->> 'op', '')) op, trim(coalesce(x ->> 'commessa', '')) commessa,
           coalesce(x ->> 'stato', '') stato, nullif(x ->> 'qta', '')::numeric qta, nullif(x ->> 'prod', '')::numeric prod,
           coalesce(x -> 'fasi', '[]'::jsonb) fasi
    from jsonb_array_elements(p_op) x
  ) y
  where codice <> '' and op <> ''
  order by codice, op;
  get diagnostics n = row_count;
  insert into mancanti_import (origine, file, commesse, righe, nuovi, chiusi, riaperti)
  values ('Invio automatico (OP)', '', '{}', n, 0, 0, 0);
  return n;
end;
$$;
revoke execute on function public.importa_op(jsonb) from public, anon;
grant execute on function public.importa_op(jsonb) to authenticated, service_role;

select 'ok' as mancanti_op;
