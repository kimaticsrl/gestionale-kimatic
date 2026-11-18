-- =============================================================
-- Mancanti montaggi:
--  * assegnazione del conto deposito a una persona (tipo «cdep»:
--    valore «*» = tutto il conto deposito, oppure un deposito preciso);
--    tutto il conto deposito va a Marcello Ferrari;
--  * «(vuoto)» dei file Excel non è una cella né un deposito;
--  * distinte dal Controllo di gestione per i gruppi 21.5… che nel file
--    di SAM non hanno figli (OP del gruppo non ancora in SAM).
-- =============================================================

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.mancanti_assegnazioni'::regclass and contype = 'c' loop
    execute format('alter table public.mancanti_assegnazioni drop constraint %I', c);
  end loop;
end $$;
alter table public.mancanti_assegnazioni add constraint mancanti_assegnazioni_tipo_check check (tipo in ('fornitore', 'cella', 'cdep'));

insert into public.mancanti_assegnazioni (tipo, valore, persona)
select 'cdep', '*', id from public.mancanti_persone where nome = 'Marcello Ferrari'
on conflict do nothing;

update public.mancanti set cella = '' where cella ~* '^\s*\(vuoto\)\s*$';
update public.mancanti set cdep = '' where cdep ~* '^\s*\(vuoto\)\s*$';
update public.mancanti set ultima_lav = '' where ultima_lav ~* '^\s*\(vuoto\)\s*$';

create or replace function public.mancanti_distinte()
returns jsonb language sql stable security definer set search_path = public as $$
  with g as (
    select distinct m.matricola, m.codice from mancanti m
    where m.aperto and m.codice like '21.5%'
      and not exists (select 1 from mancanti f where f.commessa = m.commessa and f.op = m.codice)
  )
  select case when not public.puo('mancanti-montaggi', 'legge') then '{}'::jsonb else coalesce(jsonb_object_agg(
    g.matricola || '|' || g.codice,
    jsonb_build_object('op', d.dati ->> 'op', 'righe',
      (select coalesce(jsonb_agg(jsonb_build_array(r ->> 0, r ->> 1, r -> 2)), '[]'::jsonb) from jsonb_array_elements(d.dati -> 'rows') r))
  ), '{}'::jsonb) end
  from g join cg_docs d on d.coll = 'sam' and d.dati ->> 'key' = g.codice and d.dati ->> 'mat' = g.matricola
  where d.dati ->> 'kind' in ('op', 'bom');
$$;
grant execute on function public.mancanti_distinte() to authenticated;

select 'ok' as cdep_distinte;
