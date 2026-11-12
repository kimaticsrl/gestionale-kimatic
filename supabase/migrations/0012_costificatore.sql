-- =============================================================
-- Gestionale Kimatic — modulo Costificatore pezzi meccanici
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0011_lettere_impegno.sql
-- =============================================================
-- Archivio dei componenti costificati e dei preventivi obiettivo, condiviso da tutto il team.
-- Tariffe orarie, materiali e trattamenti stanno in «impostazioni» (id 'costificatore/parametri').

create table public.cost_docs (
  coll          text not null,                 -- 'componenti' o 'preventivi'
  id            text not null,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid(),
  primary key (coll, id)
);
create trigger prepara before insert or update on public.cost_docs
  for each row execute function public.prepara_bm_doc();

-- Legge: chi ha accesso al modulo. Salva ed elimina nell'archivio: chi ha Modifica.
alter table public.cost_docs enable row level security;
create policy lettura on public.cost_docs for select to authenticated using (public.puo('costificatore', 'legge'));
create policy scrittura on public.cost_docs for all to authenticated
  using (public.puo('costificatore', 'modifica')) with check (public.puo('costificatore', 'modifica'));

create trigger storico after insert or update or delete on public.cost_docs
  for each row execute function public.registra_sessione();

update public.moduli set migrato = true where id = 'costificatore';
