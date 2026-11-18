-- =============================================================
-- Mancanti montaggi:
--  · commesse, clienti e inizio montaggio presi dal Piano produzione
--    (fase 3B «Montaggio meccanico e pneumatico» delle macchine);
--  · assegnazioni: fornitori e celle di lavorazione → persona che li segue;
--  · colori delle persone e dei codici giacenti disponibili.
-- =============================================================

-- «080/2026» e «80/2026» sono la stessa commessa
create or replace function public.commessa_norm(p text)
returns text language sql immutable as $$
  select case when trim(coalesce(p, '')) ~ '^0*\d+/\d{4}$'
              then (split_part(trim(p), '/', 1))::int::text || '/' || split_part(trim(p), '/', 2)
              else trim(coalesce(p, '')) end;
$$;

-- Commesse del Piano produzione con le macchine e la fase di montaggio (3B).
-- Leggibile da chi vede i Mancanti, anche senza accesso al Piano produzione.
create or replace function public.mancanti_piano()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.puo('mancanti-montaggi', 'legge') then '[]'::jsonb else coalesce(jsonb_agg(x order by x ->> 'commessa'), '[]'::jsonb) end
  from (
    select jsonb_build_object(
      'commessa', public.commessa_norm(c.dati ->> 'num'),
      'cliente', coalesce(c.dati ->> 'cliente', ''),
      'chiusa', coalesce((c.dati ->> 'chiusa')::boolean, false),
      'macchine', coalesce((
        select jsonb_agg(jsonb_build_object(
          'code', coalesce(m.dati ->> 'code', ''), 'desc', coalesce(m.dati ->> 'desc', ''),
          's', m.dati #>> '{phases,3B,s}', 'e', m.dati #>> '{phases,3B,e}',
          'done', coalesce((m.dati #>> '{phases,3B,done}')::boolean, false), 'chi', m.dati #>> '{phases,3B,w}'))
        from pp_docs m where m.coll = 'macchine' and m.dati ->> 'line' = c.id), '[]'::jsonb)
    ) x
    from pp_docs c
    where c.coll = 'commesse' and coalesce(c.dati ->> 'num', '') <> ''
  ) t;
$$;
grant execute on function public.mancanti_piano() to authenticated;

create table if not exists public.mancanti_assegnazioni (
  tipo    text not null check (tipo in ('fornitore', 'cella')),
  valore  text not null,
  persona uuid not null references public.profili(id) on delete cascade,
  primary key (tipo, valore)
);
create table if not exists public.mancanti_colori (
  chiave text primary key,     -- id della persona, oppure 'giacenti'
  colore text not null check (colore ~ '^#[0-9a-fA-F]{6}$')
);
alter table public.mancanti_assegnazioni enable row level security;
alter table public.mancanti_colori enable row level security;
drop policy if exists lettura on public.mancanti_assegnazioni;
drop policy if exists scrittura on public.mancanti_assegnazioni;
drop policy if exists lettura on public.mancanti_colori;
drop policy if exists scrittura on public.mancanti_colori;
create policy lettura on public.mancanti_assegnazioni for select to authenticated using ((select public.puo('mancanti-montaggi', 'legge')));
create policy scrittura on public.mancanti_assegnazioni for all to authenticated
  using ((select public.puo('mancanti-montaggi', 'modifica'))) with check ((select public.puo('mancanti-montaggi', 'modifica')));
create policy lettura on public.mancanti_colori for select to authenticated using ((select public.puo('mancanti-montaggi', 'legge')));
create policy scrittura on public.mancanti_colori for all to authenticated
  using ((select public.puo('mancanti-montaggi', 'modifica'))) with check ((select public.puo('mancanti-montaggi', 'modifica')));

-- colori richiesti: Sara rosa chiaro, Benedetta lilla, Marcello azzurro, Edoardo verde scuro; giacenti verde chiaro
insert into public.mancanti_colori (chiave, colore)
select p.id::text, v.colore from public.profili p
join (values ('sara bartolini', '#f9d3e3'), ('benedetta zanetti', '#dccbf2'), ('marcello ferrari', '#cfe6fb'), ('edoardo bernasconi', '#2e6b45')) v(nome, colore)
  on lower(trim(p.nome)) = v.nome
on conflict (chiave) do nothing;
insert into public.mancanti_colori (chiave, colore) values ('giacenti', '#d6f2d3') on conflict (chiave) do nothing;

select (select count(*) from public.mancanti_colori) as colori, (select count(*) from public.pp_docs where coll = 'commesse') as commesse_piano;
