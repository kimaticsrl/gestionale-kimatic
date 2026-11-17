-- =============================================================
-- Gestionale Kimatic — Rateizzazioni fiscali, Piano di rientro fornitori,
-- Tesserino trasferta e Organigramma della sicurezza
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0036_sicurezza_scadenze_fisse.sql
-- =============================================================
-- Le quattro pagine originali di claude.ai girano in un riquadro, come il Controllo di gestione.
-- I dati restano documenti come su claude.ai:
--   rt_docs   = piani di rateizzazione (coll 'piani')
--   rf_docs   = fornitori del piano di rientro (coll 'piano/dati/fornitori') e impostazioni (coll 'piano')
--   tesserini = dipendenti salvati nel Tesserino trasferta (su claude.ai stavano solo nel browser)

-- ---------- Rateizzazioni fiscali ----------
create table if not exists public.rt_docs (
  coll          text not null,
  id            text not null,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid(),
  primary key (coll, id)
);
drop trigger if exists prepara on public.rt_docs;
create trigger prepara before insert or update on public.rt_docs
  for each row execute function public.prepara_bm_doc();
alter table public.rt_docs enable row level security;
drop policy if exists lettura on public.rt_docs;
drop policy if exists scrittura on public.rt_docs;
create policy lettura on public.rt_docs for select to authenticated using (public.puo('rateizzazioni', 'legge'));
create policy scrittura on public.rt_docs for all to authenticated
  using (public.puo('rateizzazioni', 'modifica')) with check (public.puo('rateizzazioni', 'modifica'));
drop trigger if exists storico on public.rt_docs;
create trigger storico after insert or update or delete on public.rt_docs
  for each row execute function public.registra_sessione();

-- ---------- Piano di rientro fornitori ----------
create table if not exists public.rf_docs (
  coll          text not null,
  id            text not null,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid(),
  primary key (coll, id)
);
drop trigger if exists prepara on public.rf_docs;
create trigger prepara before insert or update on public.rf_docs
  for each row execute function public.prepara_bm_doc();
alter table public.rf_docs enable row level security;
drop policy if exists lettura on public.rf_docs;
drop policy if exists scrittura on public.rf_docs;
create policy lettura on public.rf_docs for select to authenticated using (public.puo('rientro-fornitori', 'legge'));
create policy scrittura on public.rf_docs for all to authenticated
  using (public.puo('rientro-fornitori', 'modifica')) with check (public.puo('rientro-fornitori', 'modifica'));
drop trigger if exists storico on public.rf_docs;
create trigger storico after insert or update or delete on public.rf_docs
  for each row execute function public.registra_sessione();

-- I due moduli si aprono dentro il gestionale
update public.moduli set migrato = true where id in ('rateizzazioni', 'rientro-fornitori');

-- ---------- Tesserino trasferta (scheda Personale) ----------
insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, migrato, ordine)
values ('tesserino-trasferta', 'per', 'Tesserino trasferta',
        'Tesserino del dipendente in trasferta, da scaricare in PDF a misura reale o in PNG.', null, true, 20)
on conflict (id) do nothing;

create table if not exists public.tesserini (
  id            text primary key default gen_random_uuid()::text,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid()
);
drop trigger if exists prepara on public.tesserini;
create trigger prepara before insert or update on public.tesserini
  for each row execute function public.prepara_bm_doc();
alter table public.tesserini enable row level security;
drop policy if exists lettura on public.tesserini;
drop policy if exists scrittura on public.tesserini;
create policy lettura on public.tesserini for select to authenticated using (public.puo('tesserino-trasferta', 'legge'));
create policy scrittura on public.tesserini for all to authenticated
  using (public.puo('tesserino-trasferta', 'modifica')) with check (public.puo('tesserino-trasferta', 'modifica'));
drop trigger if exists storico on public.tesserini;
create trigger storico after insert or update or delete on public.tesserini
  for each row execute function public.registra_sessione();

-- Direzione gestisce, Amministrazione compila; gli altri ruoli si aggiungono da Permessi.
insert into public.permessi (ruolo_id, modulo_id, livello)
select r.id, 'tesserino-trasferta',
  case r.id when 'direzione' then 'gestisce' when 'amministrazione' then 'modifica' else 'nessuno' end::public.livello
from public.ruoli r
on conflict (ruolo_id, modulo_id) do nothing;

-- ---------- Organigramma della sicurezza (scheda Sicurezza) ----------
insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, migrato, ordine)
values ('organigramma-sicurezza', 'sic', 'Organigramma della sicurezza',
        'Figure e responsabilità della sicurezza sul lavoro (D.Lgs. 81/08).', null, true, 20)
on conflict (id) do nothing;

-- Tutti lo vedono, la Direzione lo gestisce.
insert into public.permessi (ruolo_id, modulo_id, livello)
select r.id, 'organigramma-sicurezza', case r.id when 'direzione' then 'gestisce' else 'legge' end::public.livello
from public.ruoli r
on conflict (ruolo_id, modulo_id) do nothing;

select id, nome, reparto_id, migrato from public.moduli
where id in ('rateizzazioni', 'rientro-fornitori', 'tesserino-trasferta', 'organigramma-sicurezza')
order by reparto_id, ordine;
