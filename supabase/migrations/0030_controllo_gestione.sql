-- =============================================================
-- Gestionale Kimatic — modulo Controllo di gestione
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0029_commesse_planning.sql
-- =============================================================
-- I dati dei costi (commesse, ricavi, tariffe, costi fissi, personale, materiali SAM, permessi
-- interni) restano documenti come nella versione su claude.ai, nella tabella cg_docs.
-- Commesse, macchine, persone, ore e agenda arrivano dal Piano produzione (pp_docs), in tempo reale.

create table public.cg_docs (
  coll          text not null,   -- 'costi' o 'sam'
  id            text not null,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid(),
  primary key (coll, id)
);
create trigger prepara before insert or update on public.cg_docs
  for each row execute function public.prepara_bm_doc();

-- Vede chi ha almeno Legge sul modulo, modifica chi ha Modifica.
alter table public.cg_docs enable row level security;
create policy lettura on public.cg_docs for select to authenticated using (public.puo('controllo-gestione', 'legge'));
create policy scrittura on public.cg_docs for all to authenticated
  using (public.puo('controllo-gestione', 'modifica')) with check (public.puo('controllo-gestione', 'modifica'));

create trigger storico after insert or update or delete on public.cg_docs
  for each row execute function public.registra_sessione();

-- I dati del Piano li legge anche chi ha accesso al Controllo di gestione
drop policy if exists lettura on public.pp_docs;
create policy lettura on public.pp_docs for select to authenticated
  using (public.puo('piano-produzione', 'legge') or public.puo('commesse-planning', 'legge')
         or public.puo('controllo-gestione', 'legge'));

-- Il modulo si apre dentro il gestionale
update public.moduli set migrato = true where id = 'controllo-gestione';

select id, nome, migrato from public.moduli where id = 'controllo-gestione';
