-- =============================================================
-- Gestionale Kimatic — modulo Offerte BMTEK
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0004_troubleshooting.sql
-- =============================================================
-- Il modulo conserva i suoi dati come documenti (offerte, listino, impostazioni, foto,
-- testi, storico, backup): una riga per documento, con il percorso della sua raccolta.

create table public.bm_docs (
  coll          text not null,                 -- es. 'offerte', 'listino', 'backup/<id>/parti'
  id            text not null,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid(),
  primary key (coll, id)
);

create or replace function public.prepara_bm_doc()
returns trigger language plpgsql as $$
begin
  new.aggiornato_il := now();
  if auth.uid() is not null then new.aggiornato_da := auth.uid(); end if;
  return new;
end;
$$;
create trigger prepara before insert or update on public.bm_docs
  for each row execute function public.prepara_bm_doc();

-- Chi ha Modifica lavora su offerte, immagini delle offerte, storico e backup;
-- listino, impostazioni (costi), testi Word e foto del listino sono di chi Gestisce.
create or replace function public.bm_puo_scrivere(p_coll text)
returns boolean language sql stable as $$
  select case
    when split_part(p_coll, '/', 1) in ('offerte', 'immagini', 'storico', 'backup')
      then public.puo('offerte-bmtek', 'modifica')
    else public.puo('offerte-bmtek', 'gestisce')
  end;
$$;

alter table public.bm_docs enable row level security;
create policy lettura on public.bm_docs for select to authenticated using (public.puo('offerte-bmtek', 'legge'));
create policy inserimento on public.bm_docs for insert to authenticated with check (public.bm_puo_scrivere(coll));
create policy modifica on public.bm_docs for update to authenticated using (public.bm_puo_scrivere(coll)) with check (public.bm_puo_scrivere(coll));
create policy cancellazione on public.bm_docs for delete to authenticated using (public.bm_puo_scrivere(coll));

create index on public.bm_docs (coll);

update public.moduli set migrato = true where id = 'offerte-bmtek';
