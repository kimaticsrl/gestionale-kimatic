-- =============================================================
-- Gestionale Kimatic — modulo Anagrafica dipendenti (solo Direzione)
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0030_controllo_gestione.sql
-- =============================================================
-- Un dipendente per riga: i dati (nome, reparto, mansione, livello, RAL, contatti…) stanno in «dati».
-- La prima volta l'elenco si riempie dalla pagina del modulo, con i dipendenti del Controllo di gestione.

create table public.dipendenti (
  id            text primary key default gen_random_uuid()::text,
  dati          jsonb not null default '{}',
  attivo        boolean not null default true,
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid()
);
create trigger prepara before insert or update on public.dipendenti
  for each row execute function public.prepara_bm_doc();
create trigger storico after insert or update or delete on public.dipendenti
  for each row execute function public.registra_sessione();

-- Vede chi ha almeno Legge sul modulo, modifica chi ha Modifica.
alter table public.dipendenti enable row level security;
create policy lettura on public.dipendenti for select to authenticated
  using (public.puo('anagrafica-dipendenti', 'legge'));
create policy scrittura on public.dipendenti for all to authenticated
  using (public.puo('anagrafica-dipendenti', 'modifica')) with check (public.puo('anagrafica-dipendenti', 'modifica'));

insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, migrato, ordine)
values ('anagrafica-dipendenti', 'amm', 'Anagrafica dipendenti',
        'Elenco del personale: reparto, mansione, contratto, livello, RAL e contatti.', null, true, 39)
on conflict (id) do nothing;

-- Solo la Direzione (gestisce); tutti gli altri ruoli nessun accesso. Si cambia dalla pagina Permessi.
insert into public.permessi (ruolo_id, modulo_id, livello)
select r.id, 'anagrafica-dipendenti',
  case r.id when 'direzione' then 'gestisce' else 'nessuno' end::public.livello
from public.ruoli r
on conflict (ruolo_id, modulo_id) do update set livello = excluded.livello;

select id, nome, migrato from public.moduli where id = 'anagrafica-dipendenti';
